"use client";

import { Spinner } from "@/components/site/Spinner";
import { t } from "@/lib/copy";
import { pts } from "@/lib/format";
import type { Bid } from "@/lib/types";

/** How many of the leading bidders the panel goes over. */
const SHOWN = 3;

/**
 * Each bidder's best bid, highest first, for the leading few.
 *
 * Prices only ever rise, so the feed (newest first) is already in descending
 * order and a bidder's first appearance in it is their best. Sorted anyway: the
 * feed's order is a property of how it is built, and this list's correctness
 * should not quietly depend on it.
 */
function standings(bids: readonly Bid[]): Bid[] {
  const best = new Map<string, Bid>();
  for (const bid of bids) {
    const held = best.get(bid.paddle);
    if (!held || bid.points > held.points) best.set(bid.paddle, bid);
  }
  return [...best.values()]
    .sort((a, b) => b.points - a.points)
    .slice(0, SHOWN);
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE WAIT FOR A WINNER
 *
 * Takes the bid panel's place from the moment bidding stops until the result
 * arrives over the stream. Two phases:
 *
 *   closing — the final clock reached zero on THIS screen and the server's
 *             answer has not landed yet. Usually under a second. The button is
 *             already gone because the server refuses a late bid regardless.
 *   review  — the server has closed the lot and the winner is being named.
 *             For most lots that already happened in the closing transaction
 *             and the room holds this screen for a few seconds before showing
 *             the result (AuctionRoom's DECISION_HOLD_MS); for a lot an admin
 *             decides by hand it lasts until `awardLot`. The two look the same
 *             on purpose — see /terms, which tells bidders both can happen.
 *
 * What it shows is the leading bids being gone over: a sweeping bar, a band
 * passing down the list, each row lighting in turn. That is decoration, and it
 * is decoration over the REAL standing bids — the room already shows every one
 * of them in the feed — under a headline that says a winner is being decided,
 * which is true in both cases. It does not pretend to a progress figure or to
 * steps being ticked off, because there are none to report.
 *
 * `role="status"` because it replaces a panel somebody may have had focus in;
 * the motion is aria-hidden and stops for prefers-reduced-motion (globals.css),
 * leaving the text, which was always the content.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function DecisionPanel({
  phase,
  bids,
}: {
  phase: "closing" | "review";
  bids: readonly Bid[];
}) {
  const leading = standings(bids);

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-line bg-surface/95 flex flex-1 flex-col justify-center border-t px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md short:pt-3 lg:block lg:border lg:p-6"
    >
      <div className="flex items-center gap-2.5">
        <Spinner className="size-4" />
        <p className="eyebrow text-flare">
          {phase === "closing" ? t.room.closing : t.room.deciding}
        </p>
      </div>
      <p className="text-ink mt-2 text-base leading-snug font-medium short:text-sm">
        {phase === "closing" ? t.room.closingBody : t.room.reviewBody}
      </p>

      {leading.length > 0 && (
        <div className="border-line bg-ground/60 relative mt-3 overflow-hidden border">
          {/* An indeterminate bar: it says "working", and claims no amount. */}
          <div aria-hidden className="bg-line relative h-0.5 overflow-hidden">
            <span className="animate-decision-sweep bg-flare absolute inset-y-0 left-0 w-2/5" />
          </div>

          <p className="eyebrow text-faint px-3 pt-2.5">
            {t.room.decisionStandings}
          </p>
          <ol className="pb-1.5">
            {leading.map((bid, i) => (
              <li
                key={bid.paddle}
                className="animate-decision-row text-ink-soft flex items-baseline justify-between gap-3 px-3 py-1.5 text-sm"
                style={{ animationDelay: `${i * 0.35}s` }}
              >
                <span className="flex min-w-0 items-baseline gap-2.5">
                  <span data-numerals className="text-faint w-3 text-xs">
                    {i + 1}
                  </span>
                  <span className="truncate font-medium">
                    {bid.isYou ? t.room.you : bid.name}
                  </span>
                </span>
                <span data-numerals className="shrink-0 font-semibold">
                  {pts(bid.points)}{" "}
                  <span className="text-muted text-xs font-normal">
                    {t.common.point}
                  </span>
                </span>
              </li>
            ))}
          </ol>

          {/* The band passing down the list. */}
          <span
            aria-hidden
            className="animate-decision-scan via-flare/10 pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-linear-to-b from-transparent to-transparent"
          />
        </div>
      )}

      <p className="text-muted mt-3 text-xs leading-relaxed">
        {t.room.reviewWait}
      </p>
    </div>
  );
}
