/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SERVER CLOCK
 *
 * Every deadline in `RoomState` is absolute epoch ms decided by the server.
 * Browser clocks are routinely wrong — a few seconds from ordinary drift, and
 * arbitrarily wrong when someone has set it by hand. Counting down against
 * `Date.now()` therefore shows the wrong number, and in round 6, whose whole
 * clock is five seconds, "wrong by four seconds" means a bidder watches a lot
 * they thought they had time for get hammered.
 *
 * So the room counts down against `serverNow()`: the local clock plus an offset
 * measured from the `serverNow` field on every state push.
 *
 * ── What this does not correct for ───────────────────────────────────────────
 *
 * Network latency. SSE is one-directional, so there is no round trip to halve;
 * the offset therefore includes however long the message took to arrive, which
 * makes the client's clock read very slightly EARLY — it thinks the deadline is
 * nearer than it is. That is the safe direction to be wrong in: a bidder who
 * believes they have less time bids sooner. The alternative bias would show
 * time remaining on a lot that has already been hammered.
 *
 * Module state rather than context: this is read from a rAF loop 60 times a
 * second, and routing that through React would re-render the tree on every
 * correction to no purpose.
 * ─────────────────────────────────────────────────────────────────────────────
 */

let offsetMs = 0;

/** Called on every state push, with the `serverNow` it carried. */
export function syncServerClock(serverNow: number): void {
  const next = serverNow - Date.now();
  /*
   * Ignore corrections under 250ms. Without a floor, ordinary jitter would move
   * the offset on every push, and a deadline that shifts by 30ms is a countdown
   * that visibly stutters.
   */
  if (Math.abs(next - offsetMs) < 250) return;
  offsetMs = next;
}

/** The server's clock, as best this client can tell. */
export function serverNow(): number {
  return Date.now() + offsetMs;
}

/** Current correction in ms, for diagnostics. */
export function serverClockOffset(): number {
  return offsetMs;
}
