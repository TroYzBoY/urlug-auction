"use client";

import { useEffect, useRef } from "react";
import { descent, useDescentFrame, type DescentState } from "./useDescent";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A LABEL THAT DECODES ITSELF.
 *
 * When its scene comes into play, the text runs through random glyphs and
 * settles left to right, a character at a time — a terminal resolving a
 * signal. Scrolling back up out of the scene and down into it again replays it.
 *
 * Like the rest of the descent it never re-renders React: it watches the frame
 * state for its scene crossing `at`, then writes `textContent` from its own
 * short rAF loop and stops. The server renders the real text, so with no
 * JavaScript, or under reduced motion, the label is simply there.
 *
 * The scrambling span is aria-hidden and the real text sits beside it for
 * assistive tech, so nobody hears a stream of random letters.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const GLYPHS = "АБВГДЕЖЗИКЛМНОӨПРСТУҮФХЦЧШЭЮЯ0123456789#%&*+<>/_";
/* How often a still-unresolved character swaps glyph. Every frame is a blur;
   this rate reads as characters being tried. */
const SWAP_MS = 45;

export function Decode({
  text,
  scene,
  at = 0.001,
  duration = 700,
}: {
  text: string;
  /** Which scene's progress starts it. */
  scene: number;
  /** The scene progress at which it plays. */
  at?: number;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const active = useRef(false);
  const raf = useRef(0);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const play = () => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(raf.current);

    const chars = [...text];
    /* Each character settles at its own moment: mostly in reading order, with
       some jitter so the front is ragged rather than a typewriter. */
    const settle = chars.map(
      (_, i) =>
        (i / Math.max(1, chars.length)) * duration * 0.65 +
        Math.random() * duration * 0.35,
    );
    const start = performance.now();
    let lastSwap = -Infinity;

    const tick = (now: number) => {
      const t = now - start;
      if (t >= duration) {
        el.textContent = text;
        return;
      }
      if (now - lastSwap >= SWAP_MS) {
        lastSwap = now;
        el.textContent = chars
          .map((ch, i) =>
            ch === " " || t >= settle[i]
              ? ch
              : GLYPHS[(Math.random() * GLYPHS.length) | 0],
          )
          .join("");
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  useDescentFrame((d: DescentState) => {
    const p = d.scene[scene] ?? 0;
    const on = p >= at && p < 0.999;
    if (on && !active.current && !descent.reduced()) play();
    active.current = on;
  });

  return (
    <>
      <span className="sr-only">{text}</span>
      <span ref={ref} aria-hidden>
        {text}
      </span>
    </>
  );
}
