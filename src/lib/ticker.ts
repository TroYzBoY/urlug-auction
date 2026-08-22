import "server-only";
import type { PoolClient } from "pg";
import { getPool, transaction, tryAdvisoryLock } from "./db";
import { settle, type EngineState } from "./auction-engine";
import { persistSettlement } from "./repo/bids";
import { publish } from "./realtime";
import { recordDetached } from "./audit";
import { sweep as sweepRateLimits } from "./rate-limit";
import { sweepSessions } from "./session";
import { sweepCodes } from "./sms";
import { expireStaleTopups } from "./repo/topups";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TICKER
 *
 * Something has to notice that a clock reached zero when nobody was bidding.
 * Reads settle lazily — every query runs the row through the engine — so the
 * ticker is not what makes the state correct. What it is for:
 *
 *   • persisting transitions, so the stored row does not drift arbitrarily far
 *     from the truth and the catalogue does not advertise a lot that is over
 *   • pushing, so a bidder staring at a 00:00 clock is told the hammer fell
 *     instead of waiting for their next navigation
 *
 * ── One ticker, however many instances ───────────────────────────────────────
 *
 * Elected with a Postgres advisory lock. Without it, four instances each settle
 * the same auction, each publish, and every subscriber gets four notifications
 * per event. The lock lives on a dedicated connection and is released when that
 * connection closes — including if the process is killed — so a crashed leader
 * is replaced within one retry interval rather than deadlocking the fleet.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Arbitrary but fixed. Any other advisory lock in this database must differ. */
const LOCK_KEY = 0x4d41_4930; // "MAI0"

/*
 * 250ms. Round 6's bid clock is five seconds, so the hammer must not be
 * announced a whole second late — at that resolution a bidder can watch the
 * clock pass zero and still see the lot as live, which reads as a broken
 * auction. The scan is one indexed query over live lots only.
 */
const INTERVAL_MS = 250;
const RETRY_LOCK_MS = 5_000;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

interface TickerHandle {
  timer: ReturnType<typeof setTimeout> | null;
  sweepTimer: ReturnType<typeof setInterval> | null;
  lockClient: PoolClient | null;
  stopped: boolean;
}

declare global {
  var __maisonTicker: TickerHandle | undefined;
}

interface DueRow {
  lot_id: string;
  opens_at: Date;
  round: number;
  current_pts: number;
  leader_paddle: string | null;
  bid_clock_ends_at: Date;
  outcome: EngineState["outcome"];
}

/**
 * Settles every auction whose clock is due and returns the lots that changed.
 *
 * Each lot is settled in its own transaction, taking the same `FOR UPDATE` lock
 * the bid path takes. That ordering is what stops the ticker hammering a lot in
 * the same instant a bid lands on it: one of the two waits, and whichever goes
 * second sees the other's result.
 */
export async function settleDueAuctions(now = Date.now()): Promise<string[]> {
  const due = await getPool().query<DueRow>(
    /*
     * Split by outcome rather than OR-ing all three timestamps together. The
     * combined form included `opens_at <= now()`, which is true of every
     * running auction — so the scan returned the whole live catalogue four
     * times a second and leaned on `settle` reporting no change to do nothing
     * with it.
     */
    `SELECT lot_id, opens_at, round, current_pts, leader_paddle, bid_clock_ends_at, outcome
       FROM auctions
      WHERE (outcome = 'scheduled' AND opens_at <= now())
         OR (outcome = 'running'
             AND (bid_clock_ends_at <= now() OR round_ends_at <= now()))`,
  );

  const changed: string[] = [];

  for (const row of due.rows) {
    try {
      const didChange = await transaction(async (client) => {
        // Re-read under the lock: the row may have moved since the scan.
        const fresh = await client.query<DueRow>(
          `SELECT lot_id, opens_at, round, current_pts, leader_paddle,
                  bid_clock_ends_at, outcome
             FROM auctions WHERE lot_id = $1 FOR UPDATE`,
          [row.lot_id],
        );
        const r = fresh.rows[0];
        if (!r) return false;

        const live = settle(
          {
            opensAt: r.opens_at.getTime(),
            round: r.round,
            currentPts: r.current_pts,
            leaderPaddle: r.leader_paddle,
            bidClockEndsAt: r.bid_clock_ends_at.getTime(),
            outcome: r.outcome,
          },
          now,
        );
        if (!live.changed) return false;

        await persistSettlement(client, r.lot_id, live);

        if (live.outcome === "sold" || live.outcome === "unsold") {
          /*
           * Settlement is recorded, not charged. Taking the hammer price out of
           * the winner's balance automatically would either overdraw them or
           * fail silently at the exact moment a legal obligation begins — so
           * the money side is a deliberate follow-up (invoice, then payment)
           * rather than a side effect of a clock expiring.
           */
          recordDetached({
            action: `auction.${live.outcome}`,
            targetType: "lot",
            targetId: r.lot_id,
            detail: {
              hammerPts: live.currentPts,
              hammerRound: live.hammerRound,
              winner: live.leaderPaddle,
              settledAt: live.settledAt,
            },
          });
        }
        return true;
      });

      if (didChange) changed.push(row.lot_id);
    } catch (err) {
      // One bad lot must not stop the others. The next tick retries it.
      console.error("[ticker] failed to settle", row.lot_id, err);
    }
  }

  for (const lotId of changed) await publish(lotId);
  return changed;
}

async function sweepAll(): Promise<void> {
  /*
   * allSettled, not all: these are independent housekeeping jobs, and one
   * failing must not stop the other three from running for another hour.
   */
  await Promise.allSettled([
    sweepRateLimits(),
    sweepSessions(),
    sweepCodes(),
    expireStaleTopups(),
  ]);
}

/**
 * Starts the ticker if this process wins the election. Idempotent — safe to
 * call from instrumentation on every boot, including `next dev`'s reloads.
 */
export async function startTicker(): Promise<void> {
  const handle: TickerHandle = (globalThis.__maisonTicker ??= {
    timer: null,
    sweepTimer: null,
    lockClient: null,
    stopped: false,
  });

  if (handle.timer || handle.stopped) return;

  const client = await getPool().connect();
  const won = await tryAdvisoryLock(client, LOCK_KEY);
  if (!won) {
    client.release();
    /*
     * Another instance is the leader. Try again later rather than giving up
     * forever: if the leader is redeployed, this process should take over
     * within one retry interval and not leave the fleet without a ticker.
     */
    handle.timer = setTimeout(() => {
      handle.timer = null;
      void startTicker().catch((err) =>
        console.error("[ticker] election retry failed", err),
      );
    }, RETRY_LOCK_MS);
    return;
  }

  handle.lockClient = client;
  console.info("[ticker] elected leader");

  const loop = async () => {
    if (handle.stopped) return;
    try {
      await settleDueAuctions();
    } catch (err) {
      console.error("[ticker] tick failed", err);
    }
    // Scheduled after the work finishes, not on a fixed interval: a tick that
    // takes longer than INTERVAL_MS would otherwise stack up behind itself.
    if (!handle.stopped) handle.timer = setTimeout(loop, INTERVAL_MS);
  };

  handle.timer = setTimeout(loop, INTERVAL_MS);
  handle.sweepTimer = setInterval(() => {
    void sweepAll().catch((err) => console.error("[ticker] sweep failed", err));
  }, SWEEP_INTERVAL_MS);
}

/**
 * Releases the advisory lock and closes the listener on the way out, so the
 * next instance takes over immediately instead of waiting for Postgres to
 * notice a dead connection.
 *
 * Registered here rather than in instrumentation.ts because that file is
 * compiled for the Edge runtime as well, where `process.once` does not exist —
 * Turbopack warns on it even inside a runtime guard, since the guard is a
 * runtime check and the reference is static. This module is only ever reached
 * through a dynamic import behind that guard.
 *
 * Bound once: `next dev` reloads modules, and without the flag every edit would
 * add another pair of listeners until Node warns about a leak.
 */
export function bindShutdown(): void {
  const g = globalThis as { __maisonShutdownBound?: boolean };
  if (g.__maisonShutdownBound) return;
  g.__maisonShutdownBound = true;

  const shutdown = async () => {
    const { shutdownRealtime } = await import("./realtime");
    await Promise.allSettled([stopTicker(), shutdownRealtime()]);
  };

  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());
}

export async function stopTicker(): Promise<void> {
  const handle = globalThis.__maisonTicker;
  if (!handle) return;
  handle.stopped = true;
  if (handle.timer) clearTimeout(handle.timer);
  if (handle.sweepTimer) clearInterval(handle.sweepTimer);
  handle.timer = null;
  handle.sweepTimer = null;
  if (handle.lockClient) {
    try {
      await handle.lockClient.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
    } catch {
      // The connection is going away regardless; the lock dies with it.
    }
    handle.lockClient.release();
    handle.lockClient = null;
  }
}
