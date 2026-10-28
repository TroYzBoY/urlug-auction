"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { t } from "@/lib/copy";
import type { Bid } from "@/lib/types";

/** Who the lot went to. */
export interface FeedWinner {
  paddle: string;
  /** Display name, already "Та" for the viewer. */
  name: string;
  isYou: boolean;
}

/**
 * The presses, newest first, exactly as the server accepted them — each with
 * the presser's own count after it, so the list says who pressed how often.
 *
 * Once the lot is sold the winner goes on a line of its own above the list,
 * and their last press is tagged where it actually is. The list itself is
 * never reordered: when an instant winner is someone other than the last
 * presser, the feed must still say who pressed when.
 */
export function BidFeed({
  bids,
  winner = null,
}: {
  bids: Bid[];
  winner?: FeedWinner | null;
}) {
  /* The bid at the top when the feed opened. Only bids that arrive after it
     get the shine, so the feed does not greet a page load with one. */
  const [firstId] = useState(bids[0]?.id);

  /* The winner's last press: their first appearance, newest first. */
  const winningBid = winner
    ? bids.find((b) => b.paddle === winner.paddle)
    : undefined;
  const winningId = winningBid?.id;

  return (
    <section aria-label={t.room.feed}>
      <div className="border-line flex items-baseline justify-between gap-4 border-b pb-2.5">
        <p className="eyebrow">{t.room.feed}</p>
        <p className="eyebrow flex items-center gap-1.5">
          <span
            aria-hidden
            className="bg-olive size-1.5 animate-pulse rounded-full"
          />
          {t.room.connected}
        </p>
      </div>

      {winner && (
        <div className="bg-flare/10 border-flare/30 mt-2 flex items-center justify-between gap-3 rounded-sm border px-2 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="eyebrow text-flare shrink-0">
              {t.room.feedWinner}
            </span>
            <span
              className={`truncate text-sm font-bold ${
                winner.isYou ? "text-flare" : "text-ink"
              }`}
            >
              {winner.name}
            </span>
          </div>
          {winningBid && (
            <p
              data-numerals
              className="text-ink shrink-0 text-sm font-semibold"
            >
              {t.room.times(winningBid.points)}
            </p>
          )}
        </div>
      )}

      {bids.length === 0 ? (
        <p className="text-faint py-6 text-sm">{t.room.feedEmpty}</p>
      ) : (
        <ol
          aria-live="polite"
          className="scroll-quiet max-h-72 overflow-y-auto pr-1 lg:max-h-96"
        >
          <AnimatePresence initial={false}>
            {bids.map((bid, i) => (
              <motion.li
                key={bid.id}
                initial={{ opacity: 0, y: -16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: "spring", stiffness: 450, damping: 30 }}
                className={`border-line relative flex items-center justify-between gap-3 overflow-hidden border-b py-2.5 transition-colors ${
                  i === 0 && !winner
                    ? "bg-flare/10 border-flare/30 rounded-sm px-2"
                    : ""
                }`}
              >
                {i === 0 && bid.id !== firstId && (
                  <span aria-hidden className="feed-shine" />
                )}
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    data-numerals
                    className={`text-sm font-semibold ${
                      bid.isYou ? "text-flare font-bold" : "text-ink-soft"
                    }`}
                  >
                    {bid.isYou ? t.room.you : bid.name}
                  </span>
                  <span className="eyebrow border-line shrink-0 border px-1.5 py-0.5 text-[0.5625rem]">
                    {bid.round} {t.room.round.toLowerCase()}
                  </span>
                  {bid.id === winningId && (
                    <span className="eyebrow text-flare border-flare/40 shrink-0 border px-1.5 py-0.5 text-[0.5625rem]">
                      {t.room.feedWinner}
                    </span>
                  )}
                </div>

                <p
                  data-numerals
                  className="text-ink shrink-0 text-right text-sm font-medium"
                >
                  {t.room.pressNo(bid.points)}
                </p>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
    </section>
  );
}
