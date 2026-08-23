"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { recordDetached } from "@/lib/audit";
import { LIMITS, consume } from "@/lib/rate-limit";
import { hashPassword, verifyPassword } from "@/lib/password";
import { findByPhone, setName, setPassword } from "@/lib/repo/users";
import {
  clientIpFrom,
  createSession,
  currentUser,
  revokeAllSessions,
} from "@/lib/session";
import {
  firstError,
  nameChangeSchema,
  passwordChangeSchema,
} from "@/lib/validation";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BIDDER'S OWN ACCOUNT
 *
 * What somebody may change about themselves: their display name, and their
 * password. Not their phone number — that is the account's identity and its
 * login credential, and changing it is a support operation with an SMS behind
 * it rather than a form field. Not their paddle either: it appears on every bid
 * they have ever placed.
 *
 * Both actions read the user from the session and never from the form. A userId
 * accepted from a client is an account takeover with extra steps.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type AccountState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ok"; message: string };

async function context() {
  const h = await headers();
  return {
    ip: clientIpFrom(h),
    userAgent: h.get("user-agent")?.slice(0, 500) ?? null,
  };
}

export async function changeName(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const user = await currentUser();
  if (!user) return { status: "error", message: "Нэвтэрнэ үү." };

  const parsed = nameChangeSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { status: "error", message: firstError(parsed.error) };
  }

  if (parsed.data.name === user.name) {
    return { status: "ok", message: "Нэр өөрчлөгдөөгүй." };
  }

  await setName(user.id, parsed.data.name);

  const { ip, userAgent } = await context();
  recordDetached({
    actorUserId: user.id,
    action: "user.name_changed",
    targetType: "user",
    targetId: String(user.id),
    /* The old value, because the new one is already in the row. */
    detail: { from: user.name },
    ip,
    userAgent,
  });

  refresh();
  return { status: "ok", message: "Нэр шинэчлэгдлээ." };
}

export async function changePassword(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const user = await currentUser();
  if (!user) return { status: "error", message: "Нэвтэрнэ үү." };

  const parsed = passwordChangeSchema.safeParse({
    current: formData.get("current"),
    password: formData.get("password"),
    passwordConfirm: formData.get("passwordConfirm"),
  });
  if (!parsed.success) {
    return { status: "error", message: firstError(parsed.error) };
  }

  const { ip, userAgent } = await context();

  /*
   * Limited like a login, and by account rather than by IP. This form is a
   * password oracle for anyone sitting at an unlocked machine: they cannot read
   * the current password out of it, but they can guess at it without limit
   * unless something counts.
   */
  const limited = await consume(`password-change:${user.id}`, LIMITS.login);
  if (!limited.ok) {
    return {
      status: "error",
      message: `Хэт олон оролдлого. ${Math.ceil(limited.retryAfterSec / 60)} минутын дараа дахин оролдоно уу.`,
    };
  }

  const row = await findByPhone(user.phone);
  if (!row) return { status: "error", message: "Бүртгэл олдсонгүй." };

  const valid = await verifyPassword(row.password_hash, parsed.data.current);
  if (!valid) {
    recordDetached({
      actorUserId: user.id,
      action: "user.password_change_failed",
      ip,
      userAgent,
    });
    return { status: "error", message: "Одоогийн нууц үг буруу байна." };
  }

  await setPassword(user.id, await hashPassword(parsed.data.password));

  /*
   * Every session ends, including this one, and a fresh one is issued for the
   * browser that made the change.
   *
   * This is the point of changing a password after losing a phone: if the old
   * sessions survived it, the change would move the lock while leaving every
   * copied key working. The person doing it stays signed in because they have
   * just proved who they are twice over.
   */
  await revokeAllSessions(user.id);
  await createSession(user.id);

  recordDetached({
    actorUserId: user.id,
    action: "user.password_changed",
    targetType: "user",
    targetId: String(user.id),
    ip,
    userAgent,
  });

  refresh();
  return {
    status: "ok",
    message: "Нууц үг солигдлоо. Бусад төхөөрөмжөөс гарсан.",
  };
}
