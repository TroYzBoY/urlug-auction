"use client";

import { motion } from "framer-motion";
import { urgencyOf } from "@/lib/auction";
import { clockText } from "@/lib/format";
import { t } from "@/lib/copy";
import { useCountdown } from "./useCountdown";

const URGENCY_TEXT = {
  calm: "text-ink",
  warm: "text-flare",
  hot: "text-rust font-normal",
} as const;

const URGENCY_BAR = {
  calm: "bg-ink-soft",
  warm: "bg-flare",
  hot: "bg-rust",
} as const;

export function BidClock({
  endsAt,
  totalMs,
  frozen,
  onExpire,
  focus = false,
}: {
  endsAt: number;
  totalMs: number;
  frozen: boolean;
  onExpire: () => void;
  /**
   * Focus mode: the clock is the screen. It fills whatever height the room
   * gives it and the numerals are sized to that card — a size container, so
   * they shrink with it when a join-fee notice or the final-round log takes
   * some of the screen, instead of overflowing it and cutting off the label.
   * The one figure a bidder in round 6 is watching should not be the size of
   * a footnote beside the price, nor be clipped.
   */
  focus?: boolean;
}) {
  const remaining = useCountdown(endsAt, {
    granularityMs: 50,
    onExpire: frozen ? undefined : onExpire,
  });

  const urgency = remaining === null ? "calm" : urgencyOf(remaining, totalMs);
  const frac = remaining === null ? 1 : Math.max(0, Math.min(1, remaining / totalMs));

  return (
    <div
      className={`border-line bg-surface relative isolate flex flex-col overflow-hidden border px-4 transition-all duration-300 md:px-6 ${
        focus
          ? "h-full justify-center py-3 [container-type:size]"
          : "justify-between py-3.5 short:py-3 md:py-6"
      }`}
    >
      {/* Warm bloom behind the numerals; intensifies with urgency. */}
      <motion.div
        aria-hidden
        animate={{
          opacity: urgency === "hot" ? [0.35, 0.65, 0.35] : urgency === "warm" ? 0.3 : 0.14,
        }}
        transition={{
          repeat: urgency === "hot" ? Infinity : 0,
          duration: 0.8,
          ease: "easeInOut",
        }}
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(70% 120% at 50% 115%, var(--color-flare) 0%, transparent 70%)",
        }}
      />

      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">{t.room.bidClock}</p>
        <p className="eyebrow hidden md:block">{t.room.bidClockHint}</p>
      </div>

      <motion.p
        data-numerals
        role="timer"
        aria-live="off"
        animate={urgency === "hot" && !frozen ? { scale: [1, 1.02, 1] } : { scale: 1 }}
        transition={{ repeat: Infinity, duration: 0.6 }}
        className={`display leading-none tracking-tight transition-colors duration-300 ${
          focus
            ? "mt-2 text-[clamp(2.25rem,min(28cqw,42cqh),9rem)]"
            : "mt-2.5 text-[clamp(2.75rem,10vw,4.5rem)] short:mt-2 short:text-[2.75rem]"
        } ${URGENCY_TEXT[urgency]}`}
      >
        {remaining === null ? "—" : clockText(remaining)}
      </motion.p>

      {/* Hairline progress bar */}
      <div className={`bg-line-strong/30 h-1 w-full overflow-hidden rounded-full ${focus ? "mt-3" : "mt-3 short:mt-2.5"}`}>
        <motion.div
          initial={false}
          animate={{ scaleX: frac }}
          transition={{ ease: "linear", duration: 0.05 }}
          className={`h-full origin-left ${URGENCY_BAR[urgency]}`}
          style={{ width: "100%" }}
        />
      </div>
    </div>
  );
}

