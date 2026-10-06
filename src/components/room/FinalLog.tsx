"use client";

import { TOTAL_ROUNDS } from "@/lib/auction";
import { t } from "@/lib/copy";
import { msClock, pts } from "@/lib/format";
import type { RoomState } from "@/lib/types";

/** How the final round ended, as far as the screen can say. */
export type FinalClose =
  /** Bidding is still open. */
  | null
  /** The bid clock reached zero. */
  | { by: "bid-clock" }
  /** The round's hard clock ran out with this much bid clock still left. */
  | { by: "round-clock"; bidClockLeftMs: number }
  /** An operator stopped the sale with this much bid clock still left. */
  | { by: "stopped"; bidClockLeftMs: number };

/**
 * Works out how the final round closed, from what the server sent.
 *
 * With the stored close time (`closedAt`) it is exact: a clock's close is
 * stamped with that clock's own deadline, so the bid clock left at the close is
 * zero when it was the bid clock, and `closedAt` equals the round's end when it
 * was the round clock. Anything else is a stop by hand. Without it — the screen
 * reached zero before the server's answer arrived — the deadlines alone say
 * which clock ran out first. The figure shown is never invented: it is the bid
 * clock that was left at the instant bidding stopped.
 */
export function finalCloseOf(state: RoomState, closed: boolean): FinalClose {
  if (!closed) return null;
  const at =
    state.closedAt ?? Math.min(state.bidClockEndsAt, state.roundEndsAt);
  const bidClockLeftMs = Math.max(0, state.bidClockEndsAt - at);
  /*
   * A millisecond or two of slack. Deadlines are stored at microsecond
   * precision and round-trip through a float to_timestamp(), so the same
   * instant can come back a millisecond apart — which would otherwise turn a
   * bid clock that ran out into an operator stop with 0.001 left.
   */
  if (bidClockLeftMs <= SAME_INSTANT_MS) return { by: "bid-clock" };
  if (at >= state.roundEndsAt - SAME_INSTANT_MS) {
    return { by: "round-clock", bidClockLeftMs };
  }
  return { by: "stopped", bidClockLeftMs };
}

const SAME_INSTANT_MS = 2;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FINAL ROUND, TO THE MILLISECOND
 *
 * Round 6 runs on a five-second clock, and the question every bidder asks at
 * the end is how close it was. This answers it from the server's own record:
 * each bid's `clockLeftMs` was measured by `placeBid` under the auction lock,
 * at the instant it ruled the bid in time, and the close is read off the two
 * deadlines. Nothing here is the viewer's clock, and nothing is invented —
 * a bid still in flight from this screen has no figure yet and is not listed
 * until the server's push gives it one.
 *
 * Newest first. The parent decides how many rows fit; on a short phone the
 * list is clipped from the bottom, so what goes first is the oldest line.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function FinalLog({
  state,
  close,
  winnerName,
  rows,
  className = "",
}: {
  state: RoomState;
  close: FinalClose;
  /** The winner's display name once the lot is sold; null otherwise. */
  winnerName: string | null;
  /** Most bid rows to show. */
  rows: number;
  className?: string;
}) {
  const bids = state.bids
    .filter((b) => b.round >= TOTAL_ROUNDS && b.clockLeftMs !== null)
    .slice(0, rows);

  return (
    <section
      aria-label={t.room.finalLog}
      className={`border-line flex min-h-0 flex-col overflow-hidden border-b pb-2 ${className}`}
    >
      {/* One line, whatever the width: the unit on every row already says
          what the figures are, so the heading only has to name the list. */}
      <p className="eyebrow truncate">{t.room.finalLog}</p>

      <ol className="mt-1.5 min-h-0 overflow-hidden text-sm">
        {close && (
          <li className="text-flare flex items-baseline gap-3 py-0.5">
            <LogTime ms={close.by === "bid-clock" ? 0 : close.bidClockLeftMs} />
            <span className="min-w-0 truncate font-medium">
              {close.by === "bid-clock"
                ? t.room.logClosed
                : close.by === "round-clock"
                  ? t.room.logRoundEnded
                  : t.room.logStopped}
              {state.outcome === "sold" && winnerName && (
                <span className="text-ink">
                  {" "}
                  · {t.room.logWinner(winnerName)}
                </span>
              )}
              {state.outcome === "unsold" && (
                <span className="text-muted"> · {t.room.logNoWinner}</span>
              )}
            </span>
          </li>
        )}

        {bids.map((bid, i) => (
          <li
            key={bid.id}
            className={`flex items-baseline gap-3 py-0.5 ${
              i === 0 && !close ? "text-ink" : "text-ink-soft"
            }`}
          >
            <LogTime ms={bid.clockLeftMs!} />
            <span className="min-w-0 flex-1 truncate">
              {bid.isYou ? t.room.you : bid.name}
            </span>
            <span data-numerals className="shrink-0 font-semibold">
              {pts(bid.points)}
              <span className="text-muted ml-1 text-xs font-normal">
                {t.common.point}
              </span>
            </span>
          </li>
        ))}

        {bids.length === 0 && !close && (
          <li className="text-faint py-0.5 text-xs">{t.room.finalLogEmpty}</li>
        )}
      </ol>
    </section>
  );
}

/** "1.009 сек", fixed width so the column lines up. */
function LogTime({ ms }: { ms: number }) {
  return (
    <span
      data-numerals
      className="w-[5.25rem] shrink-0 font-mono text-[0.8125rem] tabular-nums"
    >
      {msClock(ms)}
      <span className="text-faint ml-1 font-sans text-xs">
        {t.room.seconds}
      </span>
    </span>
  );
}
