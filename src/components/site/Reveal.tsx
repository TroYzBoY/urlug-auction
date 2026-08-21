"use client";

import { useEffect, useRef, useState } from "react";
import { registerReveal } from "./reveal-manager";

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  /** Stagger, in ms. Feeds the CSS transition-delay. */
  delay?: number;
  /** Travel distance in px. Smaller for dense rows, larger for big blocks. */
  y?: number;
  as?: "div" | "section" | "article" | "li";
  id?: string;
};

/**
 * Reveals its children once they scroll into view.
 *
 * Two ways a reveal can leave content permanently invisible, both guarded here,
 * because no animation is worth a blank section:
 *
 *   1. No JS. The hidden state lives behind `.js` in globals.css — a class the
 *      inline head script adds before first paint. No script, no hidden rule,
 *      content renders plainly.
 *   2. A missed trigger. Handled in reveal-manager.ts, which watches position
 *      rather than intersection events so that jumping past an element still
 *      reveals it. Once shown, the element is dropped from the watch set and
 *      nothing sets it hidden again.
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
  y,
  as: Tag = "div",
  id,
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return registerReveal(el, () => setShown(true));
  }, []);

  return (
    <Tag
      ref={ref as React.Ref<never>}
      id={id}
      data-reveal={shown ? "shown" : "hidden"}
      className={className}
      style={
        {
          "--reveal-delay": `${delay}ms`,
          ...(y !== undefined ? { "--reveal-y": `${y}px` } : {}),
        } as React.CSSProperties
      }
    >
      {children}
    </Tag>
  );
}
