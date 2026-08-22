"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { t } from "@/lib/copy";
import { pts } from "@/lib/format";

export type TickerLot = {
  id: string;
  code: string;
  title: string;
  /** The lot's real standing price at render, in points. */
  currentPts: number;
  bidCount: number;
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS RUNNING RIGHT NOW
 *
 * Rotates through the lots that are actually live, showing each one's actual
 * standing price.
 *
 * ── ⚠ What this used to do ───────────────────────────────────────────────────
 *
 * It invented the prices. Every 2.1 seconds it picked a random live lot and
 * added one to three points to a number held only in the browser, then rendered
 * that number labelled "сүүлийн хаялт" — last bid. Nothing in it had ever
 * touched the server. It also received `openingPts` rather than the current
 * price, so even the base figure was wrong: the opening price of a lot,
 * presented as the most recent bid on it.
 *
 * The comment justifying it said, in as many words, that a line which keeps
 * changing tells a visitor other people are bidding now, and that this is the
 * reason to come in. That is exactly the problem. It is the same thing as the
 * simulated rival bidders removed from the room before launch — fabricated
 * activity shown to real people — and on the front page it is the first claim
 * the house makes about itself.
 *
 * ── What it does now ─────────────────────────────────────────────────────────
 *
 * Real prices, from the server, and the bid count alongside them so the line
 * still says whether a lot is busy — truthfully. A lot with no bids reads as a
 * lot with no bids, which is information a bidder can act on.
 *
 * The figure is a snapshot as of page load; it does not tick. Making it live
 * would mean an SSE connection per lot for a hero strip, and the room is one
 * tap away and genuinely live. A number that is honestly a little stale beats
 * one that is dishonestly moving.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function LiveTicker({ lots }: { lots: TickerLot[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (lots.length < 2) return;
    /*
     * 5s, up from 3.4s. The old pace was tuned to feel like activity; with the
     * fabricated movement gone the line is something to READ, and a line that
     * changes every three seconds is a line you give up on.
     */
    const rotate = setInterval(() => {
      setIndex((i) => (i + 1) % lots.length);
    }, 5000);
    return () => clearInterval(rotate);
  }, [lots]);

  if (lots.length === 0) return null;

  const lot = lots[index % lots.length]!;

  return (
    <div className="flex min-h-6 items-center gap-3 text-sm">
      <span className="eyebrow shrink-0 text-rust">{t.home.rightNow}</span>

      {/* aria-live=off: this rotates on a timer, and announcing every change
          would make the page unusable with a screen reader. The same lots are
          real content further down. */}
      <div className="min-w-0 flex-1 overflow-hidden" aria-live="off">
        <AnimatePresence mode="wait">
          {/*
            The price is a sibling of the truncating title, not inside it. When
            this was one line with `truncate`, a phone cut the string mid-label
            and the price never rendered.
          */}
          <motion.div
            key={lot.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.32 }}
            className="flex items-baseline gap-2"
          >
            <p className="min-w-0 flex-1 truncate text-ink-soft">
              <span className="text-muted">{lot.code}</span>{" "}
              <span className="text-ink">{lot.title}</span>
            </p>

            <span
              data-numerals
              className="shrink-0 font-semibold whitespace-nowrap text-flare"
            >
              {pts(lot.currentPts)}
              {/* The bid count is what the invented movement was pretending to
                  convey. Stated plainly it does the same job and is true. */}
              <span className="ml-2 text-xs font-normal text-muted">
                {lot.bidCount > 0
                  ? t.home.bidsSoFar(lot.bidCount)
                  : t.room.noBidsYet}
              </span>
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
