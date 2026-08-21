import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Argon2id, at the OWASP-recommended second configuration (19 MiB, t=2, p=1).
 * Memory hardness is the point: it is what makes a leaked `users` table
 * expensive to attack with GPUs, which bcrypt at any cost factor is not.
 */
const ARGON_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON_OPTIONS);
}

/**
 * Returns false rather than throwing on a malformed stored hash. A corrupt row
 * should fail one login, not 500 the sign-in page for everyone behind it.
 */
export async function verifyPassword(
  storedHash: string,
  plain: string,
): Promise<boolean> {
  try {
    return await verify(storedHash, plain, ARGON_OPTIONS);
  } catch {
    return false;
  }
}

/**
 * Burns roughly the time a real verify takes, for the branch where the phone
 * number does not exist.
 *
 * Without it, "no such user" returns in microseconds and "wrong password"
 * returns in ~50ms, and the difference is a free oracle for enumerating which
 * phone numbers are registered.
 */
export async function fakeVerifyDelay(): Promise<void> {
  await verifyPassword(await dummyHash(), "not-the-password");
}

/*
 * A real argon2id hash of a random string. Computed on first use rather than at
 * module load: a top-level await here would make every module that imports this
 * one asynchronous, which is a large blast radius for a timing detail.
 */
let dummyHashPromise: Promise<string> | null = null;
function dummyHash(): Promise<string> {
  dummyHashPromise ??= hash(randomBytes(32).toString("hex"), ARGON_OPTIONS);
  return dummyHashPromise;
}

/* ── Opaque tokens (sessions, OTP) ──────────────────────────────────────────
 *
 * Session tokens are high-entropy random, so they need no key stretching — a
 * single SHA-256 is enough to make the stored form useless to a reader of the
 * table, and it stays fast enough to run on every request. Argon2 here would
 * add ~50ms to every page load for no security gain.
 */

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time compare for two hex digests of equal length. */
export function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
