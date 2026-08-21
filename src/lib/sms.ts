import "server-only";
import { randomInt } from "node:crypto";
import { env, IS_PRODUCTION } from "./env";
import { query, queryOne } from "./db";
import { hashToken, tokensMatch } from "./password";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE-TIME CODES
 *
 * Phone verification and password reset. Codes are hashed like passwords, are
 * single-use, expire in ten minutes, and die after five wrong guesses.
 *
 * The attempt counter is the important one. Six digits is a million
 * possibilities, which sounds ample until you notice that a rate limit of ten
 * per fifteen minutes still permits a few thousand guesses a day against a code
 * that would otherwise live until it expired. Five strikes and the code is gone
 * regardless.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const CODE_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;

export type OtpPurpose = "verify" | "reset";

/** `randomInt`, not `Math.random` — this value guards an account. */
function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Issues a code and sends it. Any previous unconsumed code for the same phone
 * and purpose is expired first, so "resend" cannot leave two valid codes.
 */
export async function issueCode(
  phone: string,
  purpose: OtpPurpose,
): Promise<void> {
  const code = newCode();

  await query(
    `UPDATE otp_codes SET consumed_at = now()
      WHERE phone = $1 AND purpose = $2 AND consumed_at IS NULL`,
    [phone, purpose],
  );

  await query(
    `INSERT INTO otp_codes (phone, purpose, code_hash, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
    [phone, purpose, hashToken(code), String(CODE_TTL_MIN)],
  );

  await sendSms(
    phone,
    purpose === "verify"
      ? `MAISON баталгаажуулах код: ${code}. ${CODE_TTL_MIN} минутын дотор хүчинтэй.`
      : `MAISON нууц үг сэргээх код: ${code}. ${CODE_TTL_MIN} минутын дотор хүчинтэй.`,
  );
}

export type OtpResult = "ok" | "invalid" | "expired" | "exhausted";

/**
 * Checks a code and consumes it on success.
 *
 * A wrong guess increments `attempts` on the stored row — the counter lives
 * with the code rather than in the rate limiter so that it survives across
 * limiter windows and cannot be reset by waiting.
 */
export async function verifyCode(
  phone: string,
  purpose: OtpPurpose,
  code: string,
): Promise<OtpResult> {
  const row = await queryOne<{
    id: number;
    code_hash: string;
    attempts: number;
    expired: boolean;
  }>(
    `
    SELECT id, code_hash, attempts, (expires_at <= now()) AS expired
      FROM otp_codes
     WHERE phone = $1 AND purpose = $2 AND consumed_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1
    `,
    [phone, purpose],
  );

  if (!row) return "invalid";
  if (row.expired) return "expired";
  if (row.attempts >= MAX_ATTEMPTS) return "exhausted";

  if (!tokensMatch(row.code_hash, hashToken(code))) {
    await query("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1", [
      row.id,
    ]);
    return row.attempts + 1 >= MAX_ATTEMPTS ? "exhausted" : "invalid";
  }

  await query("UPDATE otp_codes SET consumed_at = now() WHERE id = $1", [row.id]);
  return "ok";
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SMS DELIVERY
 *
 * One seam, one provider to swap. `SMS_API_URL` receives
 * `{ to, from, text }` — adjust the body to whatever the chosen Mongolian
 * gateway expects and nothing else in the codebase changes.
 *
 * In development, with no provider configured, the code goes to the server log.
 * Production without a provider is a boot failure (see env.ts), so this branch
 * cannot silently swallow a real user's code.
 * ─────────────────────────────────────────────────────────────────────────────
 */
async function sendSms(to: string, text: string): Promise<void> {
  if (!env.smsApiUrl) {
    if (IS_PRODUCTION) throw new Error("SMS provider not configured");
    console.info(`\n[sms:dev] → ${to}\n[sms:dev] ${text}\n`);
    return;
  }

  const res = await fetch(env.smsApiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(env.smsApiKey ? { authorization: `Bearer ${env.smsApiKey}` } : {}),
    },
    body: JSON.stringify({ to, from: env.smsSender, text }),
    // A gateway that hangs must not hold a Server Function open indefinitely.
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    // The message body is never logged — it contains the code.
    throw new Error(`SMS gateway returned ${res.status}`);
  }
}

/** Old codes carry no value and are swept hourly with everything else. */
export async function sweepCodes(): Promise<void> {
  await query("DELETE FROM otp_codes WHERE created_at < now() - interval '7 days'");
}
