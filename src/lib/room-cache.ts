import "server-only";
import { getRoomSnapshot, type RoomSnapshot } from "./repo/lots";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE READ PER LOT PER PUSH
 *
 * Every SSE subscriber used to re-read the room for itself when a notification
 * arrived, so a single bid in a room of N viewers cost N round trips to
 * Postgres — and the effect is worst exactly where it hurts most, because the
 * busiest lot in round 6 is both the one with the most viewers and the one with
 * the shortest clock.
 *
 * Measured on one machine, commit → delivered:
 *
 *     1 watcher     64 ms
 *    25 watchers    71 ms
 *   100 watchers    97 ms      ← growing with the audience, roughly linearly
 *
 * This collapses the fan-out to one read. Concurrent callers within a short
 * window share a single in-flight promise; the result is projected per viewer
 * in memory, which is free.
 *
 * ── The window ───────────────────────────────────────────────────────────────
 *
 * 40ms of "if a read for this lot is already in flight or just finished, use
 * it". Short enough that nobody perceives it — it sits inside the SSE route's
 * own 60ms coalescing window, so it adds no latency at all in practice — and
 * long enough to absorb the burst of notifications a duel produces.
 *
 * ⚠ This is a cache of a value that changes constantly, which is normally a
 * mistake. It is safe here for one reason: every entry is invalidated by the
 * same notification that causes the re-read. Nothing serves a stale snapshot
 * past the next event, because the next event clears it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const WINDOW_MS = 40;

interface Entry {
  promise: Promise<RoomSnapshot | null>;
  at: number;
}

declare global {
  var __urlugRoomCache: Map<string, Entry> | undefined;
}

const cache: Map<string, Entry> = (globalThis.__urlugRoomCache ??= new Map());

/**
 * The current snapshot for a lot, shared with anyone else asking right now.
 *
 * @param fresh Skip the window and start a new read. The stream passes true
 *              when a notification arrives, because that notification is the
 *              statement that whatever is cached is now out of date.
 */
export function readRoom(
  lotId: string,
  fresh = false,
): Promise<RoomSnapshot | null> {
  const existing = cache.get(lotId);

  if (!fresh && existing && Date.now() - existing.at < WINDOW_MS) {
    return existing.promise;
  }

  const promise = getRoomSnapshot(lotId).catch((err) => {
    /*
     * A failed read must not be cached — the next subscriber would inherit the
     * rejection and the room would stay broken until the window elapsed, long
     * after the database recovered.
     */
    cache.delete(lotId);
    throw err;
  });

  cache.set(lotId, { promise, at: Date.now() });
  return promise;
}

/**
 * ── Why there is no eviction ─────────────────────────────────────────────────
 *
 * An entry is `{ promise, at }` and is overwritten on every push, so the map
 * holds at most one per lot ever streamed by this process — bounded by the
 * catalogue, not by traffic or by time. A few hundred small objects.
 *
 * Clearing on disconnect would be wrong as well as unnecessary: one viewer
 * closing a tab has nothing to do with whether the other forty watching the
 * same lot should share a read.
 */

/** Exposed for tests; nothing in the request path calls it. */
export function forgetRoom(lotId: string): void {
  cache.delete(lotId);
}
