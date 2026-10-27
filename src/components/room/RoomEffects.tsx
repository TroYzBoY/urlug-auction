"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ROOM'S SIGNALS: the final-seconds alarm, the win burst, and the buzz.
 *
 * All three sit OUTSIDE the console. The room's own elements carry a standing
 * rule — nothing that moves, scales or blurs the price, the clocks or the bid
 * button — so these are separate layers over the page, portalled to <body>,
 * pointer-events off, animating opacity (the alarm) or a canvas of their own
 * (the burst). Nothing a bidder reads or presses is ever covered or shifted.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * The screen's edges glow and pulse in the rust of the hot clock while the bid
 * clock is in its final seconds. Opacity only, and under reduced motion the
 * pulse is cut by the global block, leaving a steady glow.
 */
export function EdgeAlarm({ on }: { on: boolean }) {
  /* `on` can only become true after the countdown has started on the client,
     so the server and the hydrating render agree on rendering nothing. */
  if (!on || typeof document === "undefined") return null;
  return createPortal(
    <div aria-hidden className="room-alarm" />,
    document.body,
  );
}

/** A short vibration, where the device has one. Android does; iOS Safari has
    no Vibration API, so there it is silently nothing. */
export function buzz(pattern: number | number[]) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    /* A blocked vibration is never worth an error in the room. */
  }
}

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  glow: HTMLCanvasElement;
};

const COLORS = [
  "71,234,255",
  "131,56,255",
  "186,149,255",
  "243,245,255",
  "162,245,255",
];
const DURATION = 2600;
/* Radius of a glow sprite, in CSS px. A spark is drawn at a fraction of it. */
const GLOW = 16;

/**
 * One soft dot of light per colour, drawn once. Every spark is then a single
 * `drawImage` of its colour's sprite — a live `shadowBlur` per spark per frame
 * is the most expensive thing 2D canvas does, and on a phone without much GPU
 * it turned the burst into a few stuttering frames.
 */
function glowSprite(rgb: string, dpr: number) {
  const c = document.createElement("canvas");
  c.width = c.height = GLOW * 2 * dpr;
  const g = c.getContext("2d")!;
  const r = GLOW * dpr;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.18, `rgba(${rgb},1)`);
  grad.addColorStop(0.45, `rgba(${rgb},0.35)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

/**
 * Neon sparks thrown up from the centre of the screen and falling away, with
 * a ring of light behind them — the moment the hammer falls to this bidder.
 *
 * Plays once on mount and then removes its canvas. Skipped entirely under
 * reduced motion; the result text says the same thing standing still.
 */
export function WinBurst() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  /* Decided on the first render: this only ever mounts in the browser, after
     a result arrives, so `window` is there. Done from the start means it
     never draws at all. */
  const [done, setDone] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) {
      const id = requestAnimationFrame(() => setDone(true));
      return () => cancelAnimationFrame(id);
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    cv.width = w * dpr;
    cv.height = h * dpr;
    ctx.scale(dpr, dpr);

    const cx = w / 2;
    const cy = h * 0.42;
    const reach = Math.min(w, h);
    const glows = COLORS.map((rgb) => glowSprite(rgb, dpr));
    const sparks: Spark[] = Array.from({ length: 160 }, () => {
      const a = Math.random() * Math.PI * 2;
      const v = (0.35 + Math.random() * 0.65) * reach * 0.0125;
      return {
        x: cx,
        y: cy,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - reach * 0.004,
        life: 0.6 + Math.random() * 0.4,
        size: 0.45 + Math.random() * 0.55,
        glow: glows[(Math.random() * glows.length) | 0],
      };
    });

    const start = performance.now();
    let raf = 0;
    let last = start;
    const frame = (now: number) => {
      const t = (now - start) / DURATION;
      const dt = Math.min(2, (now - last) / 16.7);
      last = now;
      ctx.clearRect(0, 0, w, h);

      /* The ring: a flash that widens and fades in the first third. Filled
         over its own square only, not the whole screen. */
      if (t < 0.35) {
        const k = Math.max(0, t) / 0.35;
        const r = reach * (0.08 + k * 0.55);
        const g = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r);
        g.addColorStop(0, "rgba(71,234,255,0)");
        g.addColorStop(0.8, `rgba(71,234,255,${0.35 * (1 - k)})`);
        g.addColorStop(1, "rgba(131,56,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }

      ctx.globalCompositeOperation = "lighter";
      for (const s of sparks) {
        s.vy += reach * 0.00018 * dt;
        s.vx *= 0.985;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const alpha = Math.max(0, 1 - t / s.life);
        if (alpha <= 0) continue;
        const r = GLOW * s.size;
        ctx.globalAlpha = Math.min(1, alpha);
        ctx.drawImage(s.glow, s.x - r, s.y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      if (t < 1) raf = requestAnimationFrame(frame);
      else setDone(true);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (done || typeof document === "undefined") return null;
  return createPortal(
    <canvas ref={ref} aria-hidden className="room-burst" />,
    document.body,
  );
}
