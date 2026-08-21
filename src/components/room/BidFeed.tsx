"use client";

import { motion, AnimatePresence } from "framer-motion";
import { t } from "@/lib/copy";
import { pts, ptsToMnt } from "@/lib/format";
import type { Bid } from "@/lib/types";

export function BidFeed({ bids }: { bids: Bid[] }) {
  return (
    <section aria-label={t.room.feed}>
      <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2.5">
        <p className="eyebrow">{t.room.feed}</p>
        <p className="eyebrow flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-1.5 rounded-full bg-olive animate-pulse"
          />
          {t.room.connected}
        </p>
      </div>

      {bids.length === 0 ? (
        <p className="py-6 text-sm text-faint">{t.room.feedEmpty}</p>
      ) : (
        <ol
          aria-live="polite"
          className="max-h-72 overflow-y-auto scroll-quiet lg:max-h-96 pr-1"
        >
          <AnimatePresence initial={false}>
            {bids.map((bid, i) => (
              <motion.li
                key={bid.id}
                initial={{ opacity: 0, y: -16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: "spring", stiffness: 450, damping: 30 }}
                className={`flex items-center justify-between gap-3 border-b border-line py-2.5 transition-colors ${
                  i === 0
                    ? "bg-flare/10 px-2 rounded-sm border-flare/30"
                    : ""
                }`}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    data-numerals
                    className={`text-sm font-semibold ${
                      bid.isYou ? "text-flare font-bold" : "text-ink-soft"
                    }`}
                  >
                    {bid.isYou ? t.room.you : bid.paddle}
                  </span>
                  <span className="eyebrow shrink-0 border border-line px-1.5 py-0.5 text-[0.5625rem]">
                    {bid.round} {t.room.round.toLowerCase()}
                  </span>
                </div>

                <div className="text-right">
                  <p data-numerals className="text-sm font-medium text-ink">
                    {pts(bid.points)}
                    <span className="ml-1 text-xs font-normal text-muted">
                      {t.common.point}
                    </span>
                  </p>
                  <p data-numerals className="text-[0.6875rem] text-faint">
                    {ptsToMnt(bid.points)}
                  </p>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
    </section>
  );
}

