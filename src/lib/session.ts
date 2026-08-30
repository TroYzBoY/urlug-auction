import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { query, queryOne } from "./db";
import { env, IS_PRODUCTION } from "./env";
import { hashToken, newToken } from "./password";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SESSIONS
 *
 * An opaque random token in an httpOnly cookie; only its SHA-256 is stored.
 *
 * Not a JWT. A signed token that carries its own claims cannot be revoked
 * before it expires, and the two things this system most needs to do on short
 * notice are suspend an account mid-sale and end every session belonging to a
 * bidder who reports their phone stolen. A row that can be deleted does both.
 * The cost is one indexed lookup per request, which is the cheaper side of that
 * trade by a wide margin.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const COOKIE = "urlug_session";

export interface SessionUser {
  id: number;
  name: string;
  /** Family name (овог). Null on accounts created before the split. */
  familyName: string | null;
  phone: string;
  paddle: string;
  role: "bidder" | "staff" | "admin";
  status: "active" | "suspended" | "closed";
  phoneVerified: boolean;
  balancePts: number;
}

/**
 * The signed-in user, or null.
 *
 * `cache()` dedupes this across a single render pass: the header, the room and
 * a Server Function in one request all call it, and without this that is three
 * identical queries. It is per-request, not a shared cache — a suspension takes
 * effect on the next request, not after a TTL.
 */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;

  const row = await queryOne<{
    id: number;
    name: string;
    family_name: string | null;
    phone: string;
    paddle: string;
    role: SessionUser["role"];
    status: SessionUser["status"];
    phone_verified_at: Date | null;
    balance_pts: number | null;
  }>(
    `
    SELECT u.id, u.name, u.family_name, u.phone, u.paddle, u.role, u.status, u.phone_verified_at,
           b.pts AS balance_pts
      FROM sessions s
      JOIN users    u ON u.id = s.user_id
      LEFT JOIN balances b ON b.user_id = u.id
     WHERE s.token_hash = $1
       AND s.expires_at > now()
       AND s.revoked_at IS NULL
    `,
    [hashToken(token)],
  );

  if (!row) return null;

  /*
   * A suspended or closed account keeps its cookie but is not a session.
   * Returning null here means every caller — page, action, SSE — treats them as
   * signed out without any of them having to remember to check `status`.
   */
  if (row.status !== "active") return null;

  return {
    id: row.id,
    name: row.name,
    familyName: row.family_name,
    phone: row.phone,
    paddle: row.paddle,
    role: row.role,
    status: row.status,
    phoneVerified: row.phone_verified_at !== null,
    balancePts: row.balance_pts ?? 0,
  };
});

/**
 * The signed-in user, or a redirect. For pages that have nothing to show a
 * signed-out visitor.
 */
export async function requireUser(redirectTo: string): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect(`/login?redirect=${encodeURIComponent(redirectTo)}`);
  return user;
}

/**
 * The gate on every admin page and every admin action.
 *
 * ⚠ `notFound()`, not `forbidden()`. A 403 confirms that `/admin` exists and
 * that the visitor merely lacks the role, which is a map for anyone probing;
 * a 404 tells them nothing they did not already know. The repositories in
 * `src/lib/repo/admin.ts` do no checking of their own, so this is the only
 * thing standing in front of them — it must be called first, every time.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user || (user.role !== "admin" && user.role !== "staff")) notFound();
  return user;
}

/**
 * How long a session lasts when the bidder did not ask to be remembered.
 *
 * Long enough to cover a sale and the settlement that follows it, short enough
 * that a session left open on a borrowed machine expires on its own.
 */
const UNREMEMBERED_TTL_DAYS = 1;

/**
 * Issues a session and sets the cookie. Returns the raw token for tests.
 *
 * `remember` is the login form's checkbox. Until now the box was submitted and
 * never read, so every session ran for the full SESSION_TTL_DAYS whichever way
 * it was left — a control that quietly did nothing, on the screen where a
 * bidder decides how much to trust the machine they are sitting at.
 *
 * Unremembered sessions get two limits rather than one: a short row expiry in
 * the database, and a cookie with no `expires` at all, which browsers discard
 * when the browser closes. The cookie is the one a bidder can see the effect
 * of; the row expiry is the one that holds when they cannot.
 *
 * Defaults to true so that every other caller — registration, phone
 * verification, password reset — keeps the long session it had. Those are not
 * places where the question has been asked.
 */
export async function createSession(
  userId: number,
  remember = true,
): Promise<string> {
  const token = newToken();
  const days = remember ? env.sessionTtlDays : UNREMEMBERED_TTL_DAYS;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const h = await headers();
  await query(
    `
    INSERT INTO sessions (user_id, token_hash, expires_at, ip, user_agent)
    VALUES ($1, $2, $3, $4, $5)
    `,
    [
      userId,
      hashToken(token),
      expiresAt,
      clientIpFrom(h),
      h.get("user-agent")?.slice(0, 500) ?? null,
    ],
  );

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    // Not `secure` in development, where the dev server is plain http and a
    // secure cookie would simply never be sent back.
    secure: IS_PRODUCTION,
    /*
     * `lax`, not `strict`. Strict would drop the cookie on the first request
     * after following a link in from an SMS — the bidder would arrive at the
     * room signed out, one tap before a five-second clock.
     */
    sameSite: "lax",
    path: "/",
    /* Omitted when not remembered: a cookie with no expiry is a session cookie,
       and dies with the browser. */
    ...(remember ? { expires: expiresAt } : {}),
  });

  return token;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) {
    // Revoked, not deleted: the row is evidence of when the session existed.
    await query(
      "UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL",
      [hashToken(token)],
    );
  }
  store.delete(COOKIE);
}

/** Ends every session for a user — password change, suspension, stolen phone. */
export async function revokeAllSessions(userId: number): Promise<void> {
  await query(
    "UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
    [userId],
  );
}

/**
 * Best-effort client IP, for audit rows and rate-limit buckets.
 *
 * ⚠ `x-forwarded-for` is client-controlled unless a trusted proxy overwrites
 * it. Behind a CDN, prefer that CDN's own header and configure the trusted hop
 * — this order assumes exactly one reverse proxy in front of the app.
 */
export function clientIpFrom(h: Headers): string | null {
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim().slice(0, 64);
  return h.get("x-real-ip")?.slice(0, 64) ?? null;
}

export async function clientIp(): Promise<string | null> {
  return clientIpFrom(await headers());
}

/** Deletes sessions long past expiry. Called by the ticker's hourly sweep. */
export async function sweepSessions(): Promise<void> {
  await query(
    "DELETE FROM sessions WHERE expires_at < now() - interval '30 days'",
  );
}
