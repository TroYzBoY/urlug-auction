"use client";

import Link from "next/link";
import { motion } from "framer-motion";

/**
 * The primary CTA, built to feel pressable.
 *
 * The client's note was that the old button "gave nothing back" on press, which
 * it didn't — it was a plain link with a colour transition. Four things fix
 * that, in rough order of how much they matter:
 *
 *   1. `whileTap` — the press itself. A control that does not move under the
 *      finger reads as broken on touch, where there is no hover state to
 *      confirm the tap landed.
 *   2. The notification badge — a live count, so the button carries news
 *      rather than just a label. This is what makes it worth pressing.
 *   3. The sheen — periodic motion so a button in a still hero still reads as
 *      interactive without being hovered.
 *   4. Hover lift and arrow shift — the desktop refinement.
 *
 * All of it runs through framer-motion or CSS animation, both of which are
 * already covered by MotionConfig `reducedMotion="user"` and the reduced-motion
 * block in globals.css.
 */
export function EnterRoomButton({
  href,
  label,
  liveCount,
  countLabel,
}: {
  href: string;
  label: string;
  /** Lots running right now. Drives the badge; hidden when zero. */
  liveCount: number;
  /** Screen-reader sentence for the badge, e.g. "3 лот шууд явагдаж байна". */
  countLabel: string;
}) {
  return (
    <Link href={href} className="group relative inline-block">
      <motion.span
        whileHover={{ scale: 1.025 }}
        whileTap={{ scale: 0.96 }}
        transition={{ type: "spring", stiffness: 420, damping: 26 }}
        className="relative flex h-11 items-center justify-center gap-2.5 overflow-hidden rounded-full bg-ink px-6 text-[0.75rem] font-medium tracking-[0.14em] text-ground uppercase shadow-sm transition-colors group-hover:bg-accent group-hover:text-accent-ink"
      >
        {/* Sheen. Clipped by the overflow-hidden parent. */}
        <span
          aria-hidden
          className="animate-cta-sheen pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.45),transparent)]"
        />

        {/* Live dot, matching the one used everywhere else for "running now". */}
        <span aria-hidden className="relative grid size-1.5 place-items-center">
          <span className="absolute size-1.5 rounded-full bg-rust animate-ring-out" />
          <span className="size-1.5 rounded-full bg-rust" />
        </span>

        {label}

        <span
          aria-hidden
          className="transition-transform duration-300 group-hover:translate-x-1"
        >
          →
        </span>
      </motion.span>

      {/*
        Notification badge. Sits outside the overflow-hidden span, which would
        otherwise clip it. Hidden entirely at zero rather than showing a "0" —
        a badge that says nothing is worse than no badge.
      */}
      {liveCount > 0 && (
        <span className="pointer-events-none absolute -top-1.5 -right-1.5 grid size-5 place-items-center">
          <span
            aria-hidden
            className="absolute size-5 rounded-full bg-rust opacity-60 animate-ring-out"
          />
          <span
            aria-hidden
            data-numerals
            className="relative grid size-5 place-items-center rounded-full bg-rust text-[0.625rem] font-bold text-white"
          >
            {liveCount}
          </span>
          <span className="sr-only">{countLabel}</span>
        </span>
      )}
    </Link>
  );
}
