"use client";

import { motion } from "framer-motion";
import { TOTAL_ROUNDS } from "@/lib/auction";
import { coarseClock } from "@/lib/format";
import { t } from "@/lib/copy";
import { useCountdown } from "./useCountdown";

/**
 * The round clock, as a compact card that sits beside the bid clock.
 *
 * The room used to carry the whole six-round rail — every round and the bid
 * clock it imposes — which is the shape of the programme but not what a bidder
 * mid-sale needs on the one screen where a five-second clock is running. This
 * is the minimal version: which round it is, and how long is left in it, in a
 * card built to line up with `BidClock` so the two timers read as one console.
 *
 * Its own coarse countdown (1s granularity) so ticking the round timer
 * re-renders this card and nothing else.
 */
export function RoundTimer({
  round,
  roundEndsAt,
  roundTotalMs,
  frozen,
  onExpire,
}: {
  round: number;
  roundEndsAt: number;
  roundTotalMs: number;
  frozen: boolean;
  onExpire: () => void;
}) {
  const remaining = useCountdown(roundEndsAt, {
    granularityMs: 1000,
    onExpire: frozen ? undefined : onExpire,
  });

  const frac =
    remaining === null ? 1 : Math.max(0, Math.min(1, remaining / roundTotalMs));

  return (
    <section
      aria-label={t.room.round}
      className="border-line bg-surface flex flex-col justify-between border px-4 py-5 md:px-5 md:py-6"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="eyebrow">{t.room.round}</p>
        <p data-numerals className="eyebrow text-ink">
          {round}
          <span className="text-faint"> / {TOTAL_ROUNDS}</span>
        </p>
      </div>

      <p
        data-numerals
        role="timer"
        aria-live="off"
        className="display mt-2.5 text-[clamp(1.75rem,7vw,3rem)] leading-none tracking-tight text-ink-soft"
      >
        {remaining === null ? "—" : coarseClock(remaining)}
      </p>

      <p className="eyebrow mt-1.5 text-faint">{t.room.roundClock}</p>

      {/* Elapsed rather than remaining — the bar fills as the round runs out,
          the mirror of the bid clock's draining bar beside it. */}
      <div className="mt-3 h-1 w-full overflow-hidden bg-line-strong/30 rounded-full">
        <motion.div
          initial={false}
          animate={{ scaleX: 1 - frac }}
          transition={{ ease: "linear", duration: 0.4 }}
          className="bg-accent h-full origin-left"
          style={{ width: "100%" }}
        />
      </div>
    </section>
  );
}
