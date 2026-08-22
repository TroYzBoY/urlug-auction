"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { recordDetached } from "@/lib/audit";
import { log } from "@/lib/observability";
import { publish } from "@/lib/realtime";
import {
  adjustBalance,
  cancelAuction,
  closeAuction,
  createLot,
  rescheduleAuction,
  setUserStatus,
  updateLot,
  type Actor,
} from "@/lib/repo/admin-write";
import { clientIpFrom, requireAdmin } from "@/lib/session";
import {
  adjustSchema,
  firstError,
  lotSchema,
  lotControlSchema,
  rescheduleSchema,
  userStatusSchema,
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
    estimateLowPts: Number(get("estimateLowPts")),
    estimateHighPts: Number(get("estimateHighPts")),
    openingPts: Number(get("openingPts")),
    image: get("image") || null,
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

  log.info({ event: "admin.lot_created", lotId: parsed.data.id, actorId: who.id });
  refresh();
  return { status: "ok", message: `${parsed.data.code} үүслээ.` };
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
  return { status: "ok", message: `${parsed.data.code} шинэчлэгдлээ.` };
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

  // Bidders are watching a live clock. They must be told at once.
  await publish(parsed.data.lotId);
  refresh();
  return { status: "ok", message: "Лот хаагдлаа." };
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
          ? "Хаялт хийгдсэн лотыг хойшлуулах боломжгүй. Цуцлаад дахин үүсгэнэ үү."
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
