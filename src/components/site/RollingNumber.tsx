"use client";

import { useEffect, useRef, useState } from "react";
import { groupNumber } from "@/lib/format";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A PRICE THAT COUNTS
 *
 * 1 205 → 1 208 ticks 1 206, 1 207, 1 208. One number, counting, which is what
 * the price is actually doing.
 *
 * ── What this replaced, and why ──────────────────────────────────────────────
 *
 * An odometer: every digit was a column of 0–9 sliding behind a mask. It read
 * beautifully in isolation and was wrong in the room, for a reason that was
 * built into it rather than tunable. Each digit was keyed on its own character
 * (`key={`${i}-${ch}`}`), so a digit that CHANGED was a different React element
 * — unmounted, remounted, and animated from its initial position, which is
 * zero. Every single-point raise therefore spun a column through the whole
 * 0–9 alphabet to land one place further on. The comment above it claimed only
 * changed digits moved; the key made that false, and the effect on a busy lot
 * was the headline figure churning continuously while the number it was
 * reporting had barely moved.
 *
 * Counting has none of that: the only values shown are values the price
 * genuinely passed through, and a raise of one shows exactly one change.
 *
 * ── The two cases that are deliberately NOT animated ─────────────────────────
 *
 *   • A step of one. There is no intermediate value to show, so there is
 *     nothing to animate — and a +1 raise is the commonest bid in round 1.
 *   • The first paint. The price arrives server-rendered and already correct;
 *     counting up to it from nowhere would animate a change that never
 *     happened.
 *
 * Requires tabular figures to hold its width, which `[data-numerals]` sets.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * How long one step of 1 is held on screen.
 *
 * The two constants together are the whole feel of it. 55ms is slow enough to
 * register as a tick and fast enough that a +2 raise is done in a tenth of a
 * second; the 500ms ceiling is what stops a +60 late entry — or a resync after
 * a tunnel — from counting through a minute of the auction. Past that ceiling
 * the count covers more than one unit per frame, which is the honest trade:
 * a bidder in round 6 needs the current price, not a performance.
 */
const MS_PER_STEP = 55;
const MAX_MS = 500;

export function RollingNumber({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);

  /*
   * What is currently on screen, as a ref.
   *
   * Two readers need it and neither can use the state: the frame loop, which
   * would otherwise close over a stale `display`, and the NEXT run of the
   * effect — a bid landing mid-count must carry on from the figure the bidder
   * can see rather than restarting from the one before it. In a duel that is
   * the difference between a smooth climb and a stutter backwards.
   */
  const painted = useRef(value);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const from = painted.current;
    const delta = value - from;
    if (delta === 0) return;

    /*
     * Nothing in between, or nothing wanted. Both land on the figure directly
     * — no frame is scheduled at all, which is what keeps the commonest bid in
     * the sale from costing an animation.
     */
    const steps = Math.abs(delta);
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (steps === 1 || reduced) {
      painted.current = value;
      setDisplay(value);
      return;
    }

    const duration = Math.min(MAX_MS, steps * MS_PER_STEP);
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      /*
       * Linear, not eased. An eased counter slows as it approaches the answer,
       * which reads as the number being unsure of itself — a count is uniform
       * or it is not a count.
       */
      const next = from + Math.round(delta * t);

      if (next !== painted.current) {
        painted.current = next;
        setDisplay(next);
      }

      frame.current = t < 1 ? requestAnimationFrame(tick) : null;
    };

    frame.current = requestAnimationFrame(tick);

    return () => {
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
    };
  }, [value]);

  return (
    <span data-numerals className={className}>
      {/*
        The price sits inside an aria-live region, so the count has to be kept
        away from it: announcing every value it passes through would narrate the
        animation digit by digit. Assistive tech gets the destination once; the
        counting figure is decorative and hidden.
      */}
      <span className="sr-only">{groupNumber(value)}</span>
      <span aria-hidden>{groupNumber(display)}</span>
    </span>
  );
}
