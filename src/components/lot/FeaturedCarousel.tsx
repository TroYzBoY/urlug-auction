"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { t } from "@/lib/copy";

const INTERVAL_MS = 6000;

/**
 * The hero's featured lots, one at a time.
 *
 * Slides are rendered by the server and passed in, so every one is real HTML
 * from the first byte; this only decides which is showing. They share one grid
 * cell, so the stage is as tall as the tallest and never jumps.
 *
 * Moves on by itself every six seconds — and stops while a pointer is over it,
 * while anything in it has focus, while the tab is hidden, and for good under
 * reduced motion. Content that moves on its own needs a way to hold it still;
 * these are those ways. Swipe on touch, arrow keys once focused, or the dots.
 * Hidden slides are inert, so tab order only ever reaches the one on screen.
 */
export function FeaturedCarousel({
  slides,
  labels,
}: {
  slides: ReactNode[];
  /** One accessible name per slide, for its dot. */
  labels: string[];
}) {
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [still, setStill] = useState(false);
  const swipe = useRef<{ x: number; id: number } | null>(null);

  const go = (i: number) => setIndex(((i % count) + count) % count);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () =>
      setStill(mq.matches || document.visibilityState !== "visible");
    sync();
    mq.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      mq.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  const paused = count < 2 || hovered || focused || still;

  useEffect(() => {
    if (paused) return;
    const id = window.setTimeout(
      () => setIndex((i) => (i + 1) % count),
      INTERVAL_MS,
    );
    return () => window.clearTimeout(id);
  }, [paused, index, count]);

  return (
    <div
      className="featured-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label={t.lots.carouselLabel}
      data-paused={paused || undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setFocused(false);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(index + 1);
        if (e.key === "ArrowLeft") go(index - 1);
      }}
      onPointerDown={(e) => {
        if (e.pointerType !== "mouse")
          swipe.current = { x: e.clientX, id: e.pointerId };
      }}
      onPointerUp={(e) => {
        const s = swipe.current;
        swipe.current = null;
        if (!s || s.id !== e.pointerId) return;
        const dx = e.clientX - s.x;
        if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="featured-track">
        {slides.map((slide, i) => (
          <div
            key={i}
            className="featured-slide"
            data-active={i === index || undefined}
            aria-hidden={i !== index}
            inert={i !== index}
          >
            {slide}
          </div>
        ))}
      </div>

      {count > 1 && (
        <div className="featured-dots">
          {labels.map((label, i) => (
            <button
              key={i === index ? `on-${index}` : i}
              type="button"
              aria-label={label}
              aria-current={i === index || undefined}
              onClick={() => go(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
