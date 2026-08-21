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
}: {
  endsAt: number;
  totalMs: number;
  frozen: boolean;
  onExpire: () => void;
}) {
  const remaining = useCountdown(endsAt, {
    granularityMs: 50,
    onExpire: frozen ? undefined : onExpire,
  });

  const urgency = remaining === null ? "calm" : urgencyOf(remaining, totalMs);
  const frac = remaining === null ? 1 : Math.max(0, Math.min(1, remaining / totalMs));

  return (
    <div className="relative isolate overflow-hidden border border-line bg-surface px-5 py-5 md:px-8 md:py-6 transition-all duration-300">
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

      <div className="flex items-baseline justify-between gap-4">
        <p className="eyebrow">{t.room.bidClock}</p>
        <p className="eyebrow hidden sm:block">{t.room.bidClockHint}</p>
      </div>

      <motion.p
        data-numerals
        role="timer"
        aria-live="off"
        animate={urgency === "hot" && !frozen ? { scale: [1, 1.02, 1] } : { scale: 1 }}
        transition={{ repeat: Infinity, duration: 0.6 }}
        className={`display mt-2.5 text-[clamp(2.5rem,12vw,5.5rem)] tracking-tight transition-colors duration-300 ${
          URGENCY_TEXT[urgency]
        }`}
      >
        {remaining === null ? "—" : clockText(remaining)}
      </motion.p>

      {/* Hairline progress bar */}
      <div className="mt-4 h-1 w-full overflow-hidden bg-line-strong/30 rounded-full">
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

