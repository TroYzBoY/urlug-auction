import type { CSSProperties } from "react";

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  /** Staggers the reveal, in milliseconds of the old timed version — now a
      scroll offset, 4vh per 80ms. */
  delay?: number;
  /** How far it rises from, in px. */
  y?: number;
  as?: "div" | "section" | "article" | "li";
  id?: string;
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A SECTION THAT RISES INTO VIEW AS YOU SCROLL TO IT.
 *
 * Driven by the scroll position itself (`animation-timeline: view()` on
 * `.reveal` in globals.css), not by a timer or an observer. Three things follow
 * from that, and they are why this came back after the timed version was cut:
 *
 *   1. Nothing waits. The old reveals played on a clock once an element was
 *      found in view, so you scrolled, waited a beat, then read. This is
 *      finished by the time an element is a fifth of the way up the screen,
 *      and stopping the scroll stops it where it is.
 *   2. Nothing can be stranded invisible. Jumping past an element with an
 *      anchor or the End key lands on its finished state, because the state is
 *      a function of position — the problem `reveal-manager.ts` existed to
 *      solve, solved by the browser.
 *   3. No JavaScript at all. This stays a Server Component, and a browser
 *      without scroll-driven animations, or a reader who has asked for reduced
 *      motion, simply gets the content standing still.
 *
 * `delay` becomes a scroll offset so the catalogue still staggers by column.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
  y,
  as: Tag = "div",
  id,
}: RevealProps) {
  const style = {
    ...(delay ? { "--reveal-at": `${(delay / 80) * 4}vh` } : {}),
    ...(y !== undefined ? { "--reveal-y": `${y}px` } : {}),
  } as CSSProperties;

  return (
    <Tag id={id} className={`reveal ${className}`} style={style}>
      {children}
    </Tag>
  );
}
