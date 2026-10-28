"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { recordDetached } from "@/lib/audit";
import { t } from "@/lib/copy";
import { groupNumber } from "@/lib/format";
import { REGISTRATION_CONSENTS, TERMS_VERSION } from "@/lib/legal";
import { log } from "@/lib/observability";
import { hashPassword } from "@/lib/password";
import { publish } from "@/lib/realtime";
import {
  adjustBalance,
  awardLot,
  cancelAuction,
  closeAuction,
  createLot,
  declareUnsold,
  designateWinner,
  grantBonus,
  markContactHandled,
  recordPayment,
  rescheduleAuction,
  setUserRole,
  setUserStatus,
  updateLot,
  type Actor,
} from "@/lib/repo/admin-write";
import { createUser } from "@/lib/repo/users";
import { clientIpFrom, requireAdmin } from "@/lib/session";
import {
  adjustSchema,
  adminCreateUserSchema,
  awardSchema,
  bonusSchema,
  designateSchema,
  firstError,
  lotSchema,
  lotControlSchema,
  paymentSchema,
  rescheduleSchema,
  userRoleSchema,
  userStatusSchema,
  MAX_BONUS_PTS,
} from "@/lib/validation";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ADMIN ACTIONS
 *
 * Every one starts with `requireAdmin()`. These are Server Functions, which is
 * to say HTTP endpoints — being unreachable from the admin page's UI protects
 * nothing at all.
 *
 * They also each parse through a zod schema before touching a repository, for
 * the same reason: the form is not the only caller these can have.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type AdminState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ok"; message: string };

async function actor(): Promise<Actor> {
  const admin = await requireAdmin();
  const h = await headers();
  return {
    id: admin.id,
    ip: clientIpFrom(h),
    userAgent: h.get("user-agent")?.slice(0, 500) ?? null,
  };
}

function fields(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return v === null ? undefined : String(v);
  };
  return {
    id: get("id"),
    code: get("code"),
    title: get("title"),
    maker: get("maker"),
    year: get("year"),
    category: get("category"),
    note: get("note") ?? "",
    provenance: get("provenance") ?? "",
    condition: get("condition") ?? "",
    dimensions: get("dimensions") ?? "",
    // An empty box is 0 — "not given" for an estimate.
    estimateLowPts: Number(get("estimateLowPts") ?? ""),
    estimateHighPts: Number(get("estimateHighPts") ?? ""),
    pressCostPts: Number(get("pressCostPts")),
    images: get("images") ?? "",
    opensAt: get("opensAt"),
  };
}

export async function createLotAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const who = await actor();
  const parsed = lotSchema.safeParse(fields(formData));
  if (!parsed.success) {
    return { status: "error", message: firstError(parsed.error) };
  }

  const result = await createLot(parsed.data, who);
  if (!result.ok) {
    return { status: "error", message: "Энэ дугаартай лот аль хэдийн байна." };
  }

  log.info({ event: "admin.lot_created", lotId: result.id, actorId: who.id });
  refresh();
  return { status: "ok", message: `${result.code} үүслээ.` };
}

export async function updateLotAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const who = await actor();
  const parsed = lotSchema.safeParse(fields(formData));
  if (!parsed.success) {
    return { status: "error", message: firstError(parsed.error) };
  }

  const result = await updateLot(parsed.data, who);
  if (!result.ok) return { status: "error", message: "Лот олдсонгүй." };

  /*
   * The room reads the lot's title and images from the same state the stream
   * pushes, so an edit to a running lot has to be announced or bidders keep
   * seeing the old text until they reload.
   */
  await publish(parsed.data.id);
  refresh();
  return {
    status: "ok",
    message: `${parsed.data.code || parsed.data.id} шинэчлэгдлээ.`,
  };
}

export async function closeAuctionAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const who = await actor();
  const parsed = lotControlSchema.safeParse({
    lotId: formData.get("lotId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { status: "error", message: firstError(parsed.error) };
  }

  const result = await closeAuction(parsed.data.lotId, parsed.data.reason, who);
  if (!result.ok) {
    return {
      status: "error",
      message:
        result.reason === "already-settled"
          ? "Энэ лот аль хэдийн дууссан байна."
          : result.reason === "not-running"
            ? "Энэ лот явагдаагүй байна."
            : "Лот олдсонгүй.",
    };
  }

  // Bidders are watching a live clock. They must be told at once — the room
  // switches from bidding to "being checked" on this push.
  await publish(parsed.data.lotId);
  refresh();
  return { status: "ok", message: t.admin.closedNow };
}

export async function cancelAuctionAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const who = await actor();
  const parsed = lotControlSchema.safeParse({
    lotId: formData.get("lotId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { status: "error", message: firstError(parsed.error) };
  }

  const result = await cancelAuction(parsed.data.lotId, parsed.data.reason, who);
  if (!result.ok) {
    return {
      status: "error",
      message:
        result.reason === "already-settled"
          ? "Энэ лот аль хэдийн дууссан байна."
          : "Лот олдсонгүй.",
    };
  }

  await publish(parsed.data.lotId);
  refresh();
  return {
    status: "ok",
    message: "Лот цуцлагдаж, нэгдэх төлбөрүүд буцаагдлаа.",
  };
}

/**
 * The reasons a decision can be refused, in the bidder-facing language the
 * dashboard shows. Shared by both decisions because both take the same route
 * into `review` and can fail the same four ways.
 */
const DECISION_ERROR: Record<string, string> = {
  "not-found": "Лот олдсонгүй.",
  "not-in-review": "Энэ лот хараахан шалгах шатанд ороогүй байна.",
  "not-a-bidder": "Сонгосон хэрэглэгч энэ лотод дараагүй байна.",
  "already-decided": "Энэ лотын шийдвэр аль хэдийн гарсан байна.",
};

/**
 * Names the winner of a lot in review.
 *
 * `publish` matters as much as the write. Everyone who was in the room is
 * looking at a "being checked" screen with an open stream; this is what turns
 * it into the result without them reloading.
 */
export async function awardWinnerAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const who = await actor();
  const parsed = awardSchema.safeParse({
    lotId: formData.get("lotId"),
    winnerUserId: Number(formData.get("winnerUserId")),
    note: formData.get("note"),
  });
  if (!parsed.success) {
    return { status: "error", message: firstError(parsed.error) };
  }

  const result = await awardLot(
    parsed.data.lotId,
    parsed.data.winnerUserId,
    parsed.data.note,
    who,
  );
  if (!result.ok) {
    return {
      status: "error",
      message: DECISION_ERROR[result.reason] ?? "Шийдвэр бүртгэгдсэнгүй.",
    };
  }

  log.info({
    event: "admin.winner_declared",
    lotId: parsed.data.lotId,
    winnerUserId: parsed.data.winnerUserId,
    presses: result.presses,
    actorId: who.id,
  });

  await publish(parsed.data.lotId);
  refresh();
  return {
    status: "ok",
    message: t.admin.winnerDeclared(result.name),
  };
}

const DESIGNATE_ERROR: Record<string, string> = {
  "not-found": "Лот олдсонгүй.",
  "not-running": "Лот хараахан эхлээгүй байна.",
  "not-a-bidder": "Сонгосон хэрэглэгч энэ лотод дараагүй байна.",
  closed: "Лот хаагдсан байна. Хуудсыг дахин ачаална уу.",
};

/**
 * Chooses a running lot's winner in advance, or takes the choice back. The
 * lot keeps running; nothing is published, because nothing a bidder sees has
 * changed until it closes.
 */
export async function designateWinnerAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const who = await actor();
  const raw = formData.get("winnerUserId");
  const parsed = designateSchema.safeParse({
    lotId: formData.get("lotId"),
    winnerUserId: raw === null || raw === "" ? null : Number(raw),
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: firstError(parsed.error) };
  }

  const { lotId, winnerUserId, note } = parsed.data;
  const result = await designateWinner(lotId, winnerUserId, note ?? null, who);
  if (!result.ok) {
    refresh();
    return {
      status: "error",
      message: DESIGNATE_ERROR[result.reason] ?? "Хадгалагдсангүй.",
    };
  }

  refresh();
  return {
    status: "ok",
    message:
      result.paddle === null
        ? t.admin.designationCleared
        : t.admin.designated(result.paddle),
  };
}

/** Ends a lot in review with no winner. */
export async function declareUnsoldAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const who = await actor();
  const parsed = lotControlSchema.safeParse({
    lotId: formData.get("lotId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { status: "error", message: firstError(parsed.error) };
  }

  const result = await declareUnsold(
    parsed.data.lotId,
    parsed.data.reason,
    who,
  );
  if (!result.ok) {
    return {
      status: "error",
      message: DECISION_ERROR[result.reason] ?? "Шийдвэр бүртгэгдсэнгүй.",
    };
  }

  await publish(parsed.data.lotId);
  refresh();
  return { status: "ok", message: t.admin.declaredUnsold };
}

/** Marks one contact message answered. */
export async function markContactHandledAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const who = await actor();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return { status: "error", message: "Мессеж олдсонгүй." };
  }

  const result = await markContactHandled(id, who);
  if (!result.ok) {
    return {
      status: "error",
      message:
        result.reason === "already-handled"
          ? "Энэ мессежийг аль хэдийн хариулсан байна."
          : "Мессеж олдсонгүй.",
    };
  }

  refresh();
  return { status: "ok", message: t.admin.contactMarked };
}

export async function rescheduleAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const who = await actor();
  const parsed = rescheduleSchema.safeParse({
    lotId: formData.get("lotId"),
    opensAt: formData.get("opensAt"),
  });
  if (!parsed.success) {
    return { status: "error", message: firstError(parsed.error) };
  }

  const result = await rescheduleAuction(
    parsed.data.lotId,
    parsed.data.opensAt,
    who,
  );
  if (!result.ok) {
    return {
      status: "error",
      message:
        result.reason === "has-bids"
          ? "Дарагдсан лотыг хойшлуулах боломжгүй. Цуцлаад дахин үүсгэнэ үү."
          : "Лот олдсонгүй.",
    };
  }

  refresh();
  return { status: "ok", message: "Хугацаа өөрчлөгдлөө." };
}

export async function setUserStatusAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const who = await actor();
  const parsed = userStatusSchema.safeParse({
    userId: Number(formData.get("userId")),
    status: formData.get("status"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { status: "error", message: firstError(parsed.error) };
  }

  const result = await setUserStatus(
    parsed.data.userId,
    parsed.data.status,
    parsed.data.reason,
    who,
  );
  if (!result.ok) {
    return {
      status: "error",
      message:
        result.reason === "self"
          ? "Өөрийн бүртгэлийн төлөвийг өөрчлөх боломжгүй."
          : "Хэрэглэгч олдсонгүй.",
    };
  }

  refresh();
  return { status: "ok", message: "Төлөв өөрчлөгдлөө." };
}

export async function setUserRoleAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const who = await actor();
  const parsed = userRoleSchema.safeParse({
    userId: Number(formData.get("userId")),
    role: formData.get("role"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { status: "error", message: firstError(parsed.error) };
  }

  const result = await setUserRole(
    parsed.data.userId,
    parsed.data.role,
    parsed.data.reason,
    who,
  );
  if (!result.ok) {
    return {
      status: "error",
      message:
        result.reason === "self"
          ? "Өөрийн эрхээ өөрчлөх боломжгүй."
          : result.reason === "last-admin"
            ? "Сүүлчийн админыг бууруулах боломжгүй — өөр админ томилсны дараа хийнэ үү."
            : "Хэрэглэгч олдсонгүй.",
    };
  }

  log.info({
    event: "admin.role_changed",
    targetUserId: parsed.data.userId,
    role: parsed.data.role,
    actorId: who.id,
  });
  refresh();
  return { status: "ok", message: "Эрх өөрчлөгдлөө." };
}

/**
 * Hands a bidder points they did not pay for.
 *
 * Separate from `adjustBalanceAction` on purpose — see the note on `grantBonus`
 * in src/lib/repo/admin-write.ts. The short version: a gift and a correction
 * are different facts, and filing one as the other makes the accounts unable to
 * say how many points in circulation were ever paid for.
 */
export async function grantBonusAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const who = await actor();
  const parsed = bonusSchema.safeParse({
    userId: Number(formData.get("userId")),
    deltaPts: Number(formData.get("deltaPts")),
    memo: formData.get("memo"),
  });
  if (!parsed.success) {
    return { status: "error", message: firstError(parsed.error) };
  }

  const result = await grantBonus(
    parsed.data.userId,
    parsed.data.deltaPts,
    parsed.data.memo,
    who,
  );
  if (!result.ok) {
    return {
      status: "error",
      message:
        result.reason === "not-positive"
          ? "Бэлэглэх оноо эерэг тоо байна."
          : result.reason === "too-large"
            ? `Нэг удаад дээд тал нь ${MAX_BONUS_PTS} оноо бэлэглэнэ.`
            : "Хэрэглэгч олдсонгүй.",
    };
  }

  log.info({
    event: "admin.bonus_granted",
    targetUserId: parsed.data.userId,
    deltaPts: parsed.data.deltaPts,
    actorId: who.id,
  });

  refresh();
  return {
    status: "ok",
    message: t.admin.bonusGranted(parsed.data.deltaPts, result.balancePts),
  };
}

/**
 * Opens an ordinary bidder account on somebody's behalf.
 *
 * Always a `bidder`. Staff access is granted afterwards through
 * `setUserRoleAction`, where it needs a reason and leaves its own audit row —
 * a form for opening accounts that could also open admin ones would make the
 * role control's guards optional.
 */
export async function createUserAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const who = await actor();
  const parsed = adminCreateUserSchema.safeParse({
    familyName: formData.get("familyName"),
    name: formData.get("name"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    dateOfBirth: formData.get("dateOfBirth"),
    consent: formData.get("consent") === "on",
  });
  if (!parsed.success) {
    return { status: "error", message: firstError(parsed.error) };
  }

  const created = await createUser({
    familyName: parsed.data.familyName,
    name: parsed.data.name,
    phone: parsed.data.phone,
    passwordHash: await hashPassword(parsed.data.password),
    dateOfBirth: parsed.data.dateOfBirth,
    termsVersion: TERMS_VERSION,
    consents: REGISTRATION_CONSENTS,
    ip: who.ip,
    userAgent: who.userAgent,
    createdBy: who.id,
  });
  /*
   * Said plainly, unlike on /register. The reason that form hides a taken
   * number is that anyone can type one in; this one is behind requireAdmin, and
   * an operator told "created" for an account that already existed would hand
   * the person a password that does not work.
   */
  if (!created.ok) {
    return { status: "error", message: t.admin.userPhoneTaken };
  }

  log.info({
    event: "admin.user_created",
    userId: created.userId,
    actorId: who.id,
  });
  refresh();
  return { status: "ok", message: t.admin.userCreated(created.paddle) };
}

/**
 * Records money taken outside the payment provider and credits its points.
 * See `recordPayment` for why this is a top-up rather than a bonus.
 */
export async function recordPaymentAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const who = await actor();
  const parsed = paymentSchema.safeParse({
    userId: Number(formData.get("userId")),
    amountMnt: Number(formData.get("amountMnt")),
    method: formData.get("method"),
    providerRef: formData.get("providerRef") ?? "",
    memo: formData.get("memo") ?? "",
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    return { status: "error", message: firstError(parsed.error) };
  }

  const result = await recordPayment(parsed.data, who);
  if (!result.ok) {
    return {
      status: "error",
      message:
        result.reason === "ref-taken"
          ? t.admin.paymentRefTaken
          : result.reason === "bad-amount"
            ? t.admin.paymentBadAmount
            : "Хэрэглэгч олдсонгүй.",
    };
  }

  if (result.duplicate) {
    return { status: "ok", message: t.admin.paymentDuplicate };
  }

  log.info({
    event: "admin.payment_recorded",
    targetUserId: parsed.data.userId,
    amountMnt: parsed.data.amountMnt,
    points: result.points,
    method: parsed.data.method,
    actorId: who.id,
  });

  refresh();
  return {
    status: "ok",
    message: t.admin.paymentRecorded(
      groupNumber(parsed.data.amountMnt),
      result.points,
      result.balancePts,
    ),
  };
}

export async function adjustBalanceAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const who = await actor();
  const parsed = adjustSchema.safeParse({
    userId: Number(formData.get("userId")),
    deltaPts: Number(formData.get("deltaPts")),
    memo: formData.get("memo"),
  });
  if (!parsed.success) {
    return { status: "error", message: firstError(parsed.error) };
  }

  const result = await adjustBalance(
    parsed.data.userId,
    parsed.data.deltaPts,
    parsed.data.memo,
    who,
  );
  if (!result.ok) {
    return {
      status: "error",
      message:
        result.reason === "would-overdraw"
          ? "Үлдэгдэл хасах утга руу орно."
          : "Хэрэглэгч олдсонгүй.",
    };
  }

  recordDetached({
    actorUserId: who.id,
    action: "admin.balance_adjusted.applied",
    targetType: "user",
    targetId: String(parsed.data.userId),
    detail: { balancePts: result.balancePts },
    ip: who.ip,
  });

  refresh();
  return {
    status: "ok",
    message: `Шинэ үлдэгдэл: ${result.balancePts} оноо.`,
  };
}
