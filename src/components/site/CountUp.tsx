"use client";

import { useEffect, useRef } from "react";
import { groupNumber } from "@/lib/format";

/**
 * A figure that counts up from zero the first time it scrolls into view.
 *
 * The server renders the real number, so without JavaScript, under reduced
 * motion, or for a screen reader the figure is simply the figure. On hydration
 * it drops to zero and waits until half of it is on screen; one already in
 * view starts counting straight away.
 */
export function CountUp({
  value,
  durationMs = 1400,
}: {
  value: number;
  durationMs?: number;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || value === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const run = () => {
      const start = performance.now();
      const tick = (now: number) => {
        const k = Math.min(1, (now - start) / durationMs);
        /* Ease out: quick through the small numbers, settling on the real one. */
        const eased = 1 - Math.pow(1 - k, 3);
        el.textContent = groupNumber(Math.round(value * eased));
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        run();
      },
      { threshold: 0.5 },
    );
    el.textContent = groupNumber(0);
    io.observe(el);

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      el.textContent = groupNumber(value);
    };
  }, [value, durationMs]);

  return (
    <span ref={ref} data-numerals>
      {groupNumber(value)}
    </span>
  );
}
