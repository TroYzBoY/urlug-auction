import "server-only";
import { queryOne } from "./db";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * RATE LIMITING
 *
 * Fixed windows, counted in Postgres.
 *
 * In the database rather than in process memory because an in-memory counter is
 * wrong in both directions that matter: it resets to zero on every deploy, and
 * with N instances behind a load balancer every limit becomes N times looser
 * than it reads. A shared counter costs one round trip; being unable to state
 * the real limit costs an incident.
 *
 * A fixed window over-admits at a boundary — 5 in the last second of one window
 * and 5 in the first second of the next is 10 in two seconds. For these limits
 * that is fine and the alternative (a sliding log) stores a row per attempt.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface Limit {
  /** Attempts permitted per window. */
  max: number;
  /** Window length in seconds. */
  windowSec: number;
}

export const LIMITS = {
  /*
   * Bids. Round 6's clock is five seconds, so a bidder in a real duel may
   * legitimately fire several times in quick succession — but not twelve times
   * in ten seconds, which is a script.
   */
  bid: { max: 12, windowSec: 10 },
  /* Per lot, across everyone. A backstop against one room being flooded. */
  bidPerLot: { max: 240, windowSec: 10 },

  login: { max: 8, windowSec: 300 },
  register: { max: 5, windowSec: 3600 },
  /* SMS costs money to send; this limit is a bill as much as a defence. */
  otpSend: { max: 4, windowSec: 3600 },
  otpVerify: { max: 10, windowSec: 900 },
  passwordReset: { max: 5, windowSec: 3600 },
  contact: { max: 5, windowSec: 3600 },
} as const satisfies Record<string, Limit>;

export interface LimitResult {
  ok: boolean;
  /** Seconds until the current window rolls over. */
  retryAfterSec: number;
  remaining: number;
}

/**
 * Counts one attempt against `bucket` and reports whether it is permitted.
 *
 * The whole thing is one statement so it is atomic without a transaction: the
 * INSERT ... ON CONFLICT DO UPDATE increments and returns the new count in a
 * single round trip, and two concurrent callers cannot both read 4 and both
 * write 5.
 *
 * Note it counts the rejected attempt too. That is intended — hammering a
 * limited endpoint should extend the lockout, not leave a fixed number of free
 * probes per window.
 */
export async function consume(
  bucket: string,
  limit: Limit,
): Promise<LimitResult> {
  const row = await queryOne<{ count: number; window_start: Date }>(
    `
    INSERT INTO rate_limits (bucket, window_start, count)
    VALUES ($1, to_timestamp(floor(extract(epoch FROM now()) / $2) * $2), 1)
    ON CONFLICT (bucket, window_start)
      DO UPDATE SET count = rate_limits.count + 1
    RETURNING count, window_start
    `,
    [bucket, limit.windowSec],
  );

  const count = row?.count ?? 1;
  const windowStart = row?.window_start?.getTime() ?? Date.now();
  const elapsedSec = (Date.now() - windowStart) / 1000;

  return {
    ok: count <= limit.max,
    retryAfterSec: Math.max(1, Math.ceil(limit.windowSec - elapsedSec)),
    remaining: Math.max(0, limit.max - count),
  };
}

/**
 * Old windows are dead weight; the ticker sweeps them hourly. Kept here rather
 * than as a Postgres job so the whole limiter is one file.
 */
export async function sweep(): Promise<void> {
  await queryOne("DELETE FROM rate_limits WHERE window_start < now() - interval '2 hours'");
}
