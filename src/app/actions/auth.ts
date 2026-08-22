"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { REGISTRATION_CONSENTS } from "@/lib/legal";
import { LIMITS, consume } from "@/lib/rate-limit";
import { recordDetached } from "@/lib/audit";
import {
  fakeVerifyDelay,
  hashPassword,
  verifyPassword,
} from "@/lib/password";
import {
  clientIpFrom,
  createSession,
  destroySession,
  revokeAllSessions,
} from "@/lib/session";
import { issueCode, verifyCode } from "@/lib/sms";
import {
  createUser,
  findByPhone,
  markPhoneVerified,
  setPassword,
} from "@/lib/repo/users";
import {
  firstError,
  loginSchema,
  otpSchema,
  registerSchema,
  resetSchema,
} from "@/lib/validation";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * AUTHENTICATION
 *
 * Phone number and password, with an SMS code proving the number is real. A
 * bidder who cannot be reached cannot be handed a lot, so verification is not
 * an optional extra here — `placeBid` refuses an unverified account.
 *
 * ── On not saying which half was wrong ───────────────────────────────────────
 *
 * Every failure below returns one message: "Утасны дугаар эсвэл нууц үг буруу
 * байна." Distinguishing them turns the login form into a directory of who
 * banks here. The same reasoning runs through `requestReset`, which reports
 * success for numbers that do not exist.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type AuthState =
  | { status: "idle" }
  | { status: "error"; message: string }
  /** Registered or reset-requested: the form switches to the code step. */
  | { status: "code-sent"; phone: string }
  | { status: "ok" };

const GENERIC_LOGIN_ERROR = "Утасны дугаар эсвэл нууц үг буруу байна.";

async function context() {
  const h = await headers();
  return {
    ip: clientIpFrom(h),
    userAgent: h.get("user-agent")?.slice(0, 500) ?? null,
  };
}

/* ── Register ────────────────────────────────────────────────────────────── */

export async function register(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    passwordConfirm: formData.get("passwordConfirm"),
    dateOfBirth: formData.get("dateOfBirth"),
    terms: formData.get("terms") === "on",
  });
  if (!parsed.success) {
    return { status: "error", message: firstError(parsed.error) };
  }

  const { ip, userAgent } = await context();

  const limited = await consume(`register:${ip ?? "unknown"}`, LIMITS.register);
  if (!limited.ok) {
    return {
      status: "error",
      message: `Хэт олон оролдлого. ${limited.retryAfterSec} секундын дараа дахин оролдоно уу.`,
    };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const created = await createUser({
    name: parsed.data.name,
    phone: parsed.data.phone,
    passwordHash,
    dateOfBirth: parsed.data.dateOfBirth,
    termsVersion: env.termsVersion,
    consents: REGISTRATION_CONSENTS,
    ip,
    userAgent,
  });

  if (!created.ok) {
    /*
     * The number is already registered. Reported as if it were not, and no code
     * is sent — a distinct message here would confirm membership to anyone who
     * types a number in.
     */
    recordDetached({
      action: "user.register_duplicate",
      detail: { phone: parsed.data.phone },
      ip,
      userAgent,
    });
    return { status: "code-sent", phone: parsed.data.phone };
  }

  await issueCode(parsed.data.phone, "verify");
  return { status: "code-sent", phone: parsed.data.phone };
}

/* ── Verify the phone ────────────────────────────────────────────────────── */

export async function verifyPhone(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = otpSchema.safeParse({
    phone: formData.get("phone"),
    code: formData.get("code"),
  });
  if (!parsed.success) {
    return { status: "error", message: firstError(parsed.error) };
  }

  const { ip, userAgent } = await context();
  const limited = await consume(
    `otp-verify:${parsed.data.phone}`,
    LIMITS.otpVerify,
  );
  if (!limited.ok) {
    return { status: "error", message: "Хэт олон оролдлого. Түр хүлээнэ үү." };
  }

  const result = await verifyCode(parsed.data.phone, "verify", parsed.data.code);
  if (result !== "ok") {
    recordDetached({
      action: "otp.verify_failed",
      detail: { result },
      ip,
      userAgent,
    });
    return {
      status: "error",
      message:
        result === "expired"
          ? "Кодын хугацаа дууссан. Дахин илгээнэ үү."
          : result === "exhausted"
            ? "Хэт олон удаа буруу оруулсан. Шинэ код авна уу."
            : "Код буруу байна.",
    };
  }

  await markPhoneVerified(parsed.data.phone);

  const user = await findByPhone(parsed.data.phone);
  if (!user || user.status !== "active") {
    return { status: "error", message: GENERIC_LOGIN_ERROR };
  }

  await createSession(user.id);
  recordDetached({
    actorUserId: user.id,
    action: "user.verified",
    ip,
    userAgent,
  });
  redirect("/lots");
}

export async function resendCode(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const phone = String(formData.get("phone") ?? "");
  const parsed = otpSchema.shape.phone.safeParse(phone);
  if (!parsed.success) {
    return { status: "error", message: "Утасны дугаар буруу байна." };
  }

  const limited = await consume(`otp-send:${parsed.data}`, LIMITS.otpSend);
  if (!limited.ok) {
    return {
      status: "error",
      message: `Дахин илгээхийн тулд ${Math.ceil(limited.retryAfterSec / 60)} минут хүлээнэ үү.`,
    };
  }

  await issueCode(parsed.data, "verify");
  return { status: "code-sent", phone: parsed.data };
}

/* ── Log in ──────────────────────────────────────────────────────────────── */

export async function login(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    phone: formData.get("phone"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { status: "error", message: GENERIC_LOGIN_ERROR };
  }

  const { ip, userAgent } = await context();

  /*
   * Limited by number AND by IP. By number alone, an attacker spreads across
   * many accounts from one host; by IP alone, they distribute and the per-
   * account guess rate stays high. Neither is sufficient on its own.
   */
  const [byPhone, byIp] = await Promise.all([
    consume(`login:phone:${parsed.data.phone}`, LIMITS.login),
    consume(`login:ip:${ip ?? "unknown"}`, LIMITS.login),
  ]);
  if (!byPhone.ok || !byIp.ok) {
    return {
      status: "error",
      message: `Хэт олон оролдлого. ${Math.ceil(byPhone.retryAfterSec / 60)} минутын дараа дахин оролдоно уу.`,
    };
  }

  const user = await findByPhone(parsed.data.phone);
  if (!user) {
    // Spend the time a real verify would, so the response time does not
    // distinguish "no such account" from "wrong password".
    await fakeVerifyDelay();
    return { status: "error", message: GENERIC_LOGIN_ERROR };
  }

  const valid = await verifyPassword(user.password_hash, parsed.data.password);
  if (!valid || user.status !== "active") {
    recordDetached({
      actorUserId: user.id,
      action: "user.login_failed",
      detail: { reason: valid ? user.status : "bad-password" },
      ip,
      userAgent,
    });
    return { status: "error", message: GENERIC_LOGIN_ERROR };
  }

  if (!user.phone_verified_at) {
    // Correct credentials, unverified number: send a fresh code rather than
    // stranding them at a form they cannot get past.
    await issueCode(user.phone, "verify");
    return { status: "code-sent", phone: user.phone };
  }

  await createSession(user.id);
  recordDetached({
    actorUserId: user.id,
    action: "user.login",
    ip,
    userAgent,
  });

  const redirectTo = String(formData.get("redirect") ?? "");
  /*
   * Only same-origin relative paths. Reflecting an arbitrary `redirect` into a
   * post-login navigation is an open redirect: a link to our own login page
   * that lands on someone else's, with our domain in the address bar right up
   * until it does.
   */
  redirect(
    redirectTo.startsWith("/") && !redirectTo.startsWith("//")
      ? redirectTo
      : "/lots",
  );
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/");
}

/* ── Password reset ──────────────────────────────────────────────────────── */

export async function requestReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = otpSchema.shape.phone.safeParse(formData.get("phone"));
  if (!parsed.success) {
    return { status: "error", message: "Утасны дугаар буруу байна." };
  }

  const limited = await consume(`reset:${parsed.data}`, LIMITS.passwordReset);
  if (!limited.ok) {
    return { status: "error", message: "Хэт олон оролдлого. Түр хүлээнэ үү." };
  }

  const user = await findByPhone(parsed.data);
  if (user && user.status === "active") await issueCode(parsed.data, "reset");

  // Reported identically whether or not the number is registered.
  return { status: "code-sent", phone: parsed.data };
}

export async function completeReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = resetSchema.safeParse({
    phone: formData.get("phone"),
    code: formData.get("code"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { status: "error", message: firstError(parsed.error) };
  }

  const { ip, userAgent } = await context();
  const limited = await consume(
    `otp-verify:${parsed.data.phone}`,
    LIMITS.otpVerify,
  );
  if (!limited.ok) {
    return { status: "error", message: "Хэт олон оролдлого. Түр хүлээнэ үү." };
  }

  const result = await verifyCode(parsed.data.phone, "reset", parsed.data.code);
  if (result !== "ok") {
    return {
      status: "error",
      message:
        result === "expired"
          ? "Кодын хугацаа дууссан."
          : result === "exhausted"
            ? "Хэт олон удаа буруу оруулсан. Шинэ код авна уу."
            : "Код буруу байна.",
    };
  }

  const user = await findByPhone(parsed.data.phone);
  if (!user) return { status: "error", message: GENERIC_LOGIN_ERROR };

  await setPassword(user.id, await hashPassword(parsed.data.password));
  /*
   * Every existing session dies with the old password. Someone resetting
   * because their account was taken is not helped by a reset that leaves the
   * intruder logged in.
   */
  await revokeAllSessions(user.id);
  recordDetached({
    actorUserId: user.id,
    action: "user.password_reset",
    ip,
    userAgent,
  });

  await createSession(user.id);
  redirect("/lots");
}
