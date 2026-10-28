"use client";

import Link from "next/link";
import { t } from "@/lib/copy";
import { RollingNumber } from "@/components/site/RollingNumber";
import { LiveDot } from "./LotCard";
import { useLivePrices } from "./useLivePrices";

export type MarqueeLot = {
  id: string;
  code: string;
  title: string;
  currentPts: number;
  bidCount: number;
  round: number;
};

/* Enough items that one copy is wider than any screen, so the loop never
   shows a gap — three live lots are repeated rather than left as a short
   line drifting across empty space. */
const MIN_ITEMS = 8;

/**
 * The live lots sliding past under the hero, each with how many times it has
 * been pressed and its round — the counts roll as the shared poll brings new
 * presses.
 *
 * The track is the list twice over and slides exactly one copy's width, so
 * the loop is seamless. It holds still under a pointer or keyboard focus so an
 * item can be read and clicked, and under reduced motion it does not move at
 * all: it becomes a row you can scroll by hand. The repeats are hidden from
 * assistive tech and the tab order — they are the same links again.
 */
export function LiveMarquee({ lots }: { lots: MarqueeLot[] }) {
  const prices = useLivePrices();
  if (lots.length === 0) return null;

  const reps = Math.max(1, Math.ceil(MIN_ITEMS / lots.length));
  const items = Array.from({ length: reps }, () => lots).flat();

  const row = (copy: number) =>
    items.map((lot, i) => {
      const live = prices.get(lot.id);
      const repeat = copy > 0 || i >= lots.length;
      return (
        <Link
          key={`${copy}-${i}`}
          href={`/auction/${lot.id}`}
          className="marquee-item"
          aria-hidden={repeat || undefined}
          tabIndex={repeat ? -1 : undefined}
        >
          <span className="lot-code">{lot.code}</span>
          <span className="marquee-title">{lot.title}</span>
          <span className="marquee-price" data-numerals>
            <RollingNumber value={live?.currentPts ?? lot.currentPts} />
            <span className="text-muted ml-1 text-xs font-normal">
              {t.room.timesUnit}
            </span>
          </span>
          <span className="marquee-meta" data-numerals>
            {t.lots.roundShort(live?.round ?? lot.round)}
          </span>
        </Link>
      );
    });

  return (
    <section className="live-marquee" aria-label={t.lots.marqueeLabel}>
      <p className="marquee-label eyebrow">
        <LiveDot />
        {t.room.live}
      </p>
      <div className="marquee-window">
        <div
          className="marquee-track"
          style={{ animationDuration: `${items.length * 5}s` }}
        >
          <div className="marquee-copy">{row(0)}</div>
          <div className="marquee-copy" aria-hidden>
            {row(1)}
          </div>
        </div>
      </div>
    </section>
  );
}
