"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { t } from "@/lib/copy";
import { RollingNumber } from "./RollingNumber";

export type TickerLot = {
  id: string;
  code: string;
  title: string;
  startPts: number;
};

/**
 * Cycles through the lots running right now, nudging each price upward as it
 * goes, so the hero shows an auction in motion rather than a poster about one.
 *
 * This is the answer to "it should make people want to join": a static hero
 * describes the format, but a line that keeps changing says other people are
 * bidding *now*, which is the actual reason to come in.
 *
 * ⚠ Hydration: the first frame must match the server exactly. Index starts at 0
 * and prices start at their seeded values — no Date.now(), no Math.random()
 * during render. Everything that moves is started by an effect, after the
 * first client frame.
 */
export function LiveTicker({ lots }: { lots: TickerLot[] }) {
  const [index, setIndex] = useState(0);
  const [bumps, setBumps] = useState<Record<string, number>>({});

  useEffect(() => {
    if (lots.length === 0) return;

    /* Deliberately uneven: a metronome reads as a carousel, an irregular beat
       reads as people bidding. */
    const rotate = setInterval(() => {
      setIndex((i) => (i + 1) % lots.length);
    }, 3400);

    const bump = setInterval(() => {
      setBumps((b) => {
        const lot = lots[Math.floor(Math.random() * lots.length)];
        if (!lot) return b;
        return { ...b, [lot.id]: (b[lot.id] ?? 0) + 1 + Math.floor(Math.random() * 3) };
      });
    }, 2100);

    return () => {
      clearInterval(rotate);
      clearInterval(bump);
    };
  }, [lots]);

  if (lots.length === 0) return null;

  const lot = lots[index];
  const price = lot.startPts + (bumps[lot.id] ?? 0);

  return (
    <div className="flex min-h-6 items-center gap-3 text-sm">
      <span className="eyebrow shrink-0 text-rust">{t.home.rightNow}</span>

      {/* aria-live=off: this is ambience, and announcing every rotation would
          make the page unusable with a screen reader. The same information is
          available as real content further down the page. */}
      <div className="min-w-0 flex-1 overflow-hidden" aria-live="off">
        <AnimatePresence mode="wait">
          {/*
            The price is a sibling of the truncating text, not inside it. When
            this was one line with `truncate`, a phone cut the string mid-label
            and the price — the only part that actually moves, and the whole
            reason the ticker exists — never rendered. Now the lot title gives
            way and the number is always visible.
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
              <span className="hidden text-muted sm:inline">
                {" "}
                · {t.home.lastBid}
              </span>
            </p>

            <RollingNumber
              value={price}
              className="shrink-0 font-semibold text-flare"
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
