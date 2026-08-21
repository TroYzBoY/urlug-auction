"use client";

import { useEffect, useRef } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DESCENT ENGINE
 *
 * One scroll listener, one rAF, one set of cached rects for the whole landing.
 * Every scene and the shader read from the same frame, so nothing can drift out
 * of step with anything else.
 *
 * Scenes are pinned with `position: sticky`, not with a scroll library. A
 * pinning library works by injecting a spacer element and rewriting the pinned
 * node's position inline — which fights React's ownership of the DOM and breaks
 * the moment a re-render touches that subtree. Sticky is the platform doing the
 * same job declaratively: a scene is a tall wrapper with a 100svh sticky stage
 * inside it, and the wrapper's extra height *is* the pin duration.
 *
 * ⚠ Geometry is read in `measure()` and nowhere else. Nothing in the frame loop
 * touches the layout — it reads `window.scrollY` and then only writes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type DescentState = {
  /** Scroll position in px. */
  y: number;
  /** 0…1 down the whole document. Drives how much daylight is left. */
  p: number;
  /** Smoothed absolute scroll velocity, 0…1. */
  vel: number;
  /** 0…1 dissolve density at the nearest scene boundary. */
  burn: number;
  /** 0…1 dusk → roast. Flips inside a dissolve, never in the open. */
  night: number;
  /** 0…1 the rust flood of the hammer. */
  climax: number;
  /** 0…1 the amber spill of the hall. */
  door: number;
  /** Per-scene progress, 0…1, indexed by registration order. */
  scene: number[];
  /** Seconds since start — the shader's drift clock. */
  t: number;
};

export const clamp = (v: number, a: number, b: number) =>
  v < a ? a : v > b ? b : v;

export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Sub-range of a scene's progress, remapped to 0…1. */
export const seg = (t: number, a: number, b: number) =>
  clamp((t - a) / (b - a), 0, 1);

export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
export const easeIn = (x: number) => x * x * x;

const SCENES = 5;

/**
 * How hard the scenes are damped against the scroll position, as a time
 * constant in seconds. This is the second of two smoothing stages and the one
 * that does most of the work:
 *
 *   1. Lenis smooths the scroll position itself (wheel jumps → inertia)
 *   2. this smooths every scrubbed value's pursuit of that position
 *
 * With only the first, each scene value tracks scroll exactly and the piece
 * reads sharp and mechanical — the animation is perfectly correct and feels
 * like a slideshow being dragged. Damping is what makes a scrub read as
 * motion with mass.
 *
 * ~0.63 of the way there after one tau, ~0.95 after three. 0.11s sits close to
 * the `scrub: 0.6` this was designed against. **This is the feel dial** —
 * raise for heavier and floatier, lower for tighter and more immediate.
 */
const SCRUB_TAU = 0.11;

/**
 * Past this much distance in one frame, snap instead of gliding. A restored
 * scroll position, an anchor jump or End would otherwise send the damped
 * value gliding across the entire document, playing every scene in between
 * over a couple of seconds.
 */
const JUMP_SNAP_PX = 1200;

class DescentEngine {
  state: DescentState = {
    y: 0, p: 0, vel: 0, burn: 0, night: 0, climax: 0, door: 0,
    scene: new Array(SCENES).fill(0), t: 0,
  };

  private els: (HTMLElement | null)[] = new Array(SCENES).fill(null);
  private geom: { top: number; span: number }[] = [];
  private subs = new Set<(s: DescentState) => void>();

  private vh = 1;
  private docScroll = 1;
  private lastY = 0;
  private lastNow = 0;
  private smoothY = 0;
  private raf = 0;
  private started = 0;
  private running = false;
  private resizeTimer = 0;
  private lenis: Lenis | null = null;

  reduced() {
    return (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  register(index: number, el: HTMLElement | null) {
    this.els[index] = el;
    this.measure();
  }

  subscribe(fn: (s: DescentState) => void) {
    this.subs.add(fn);
    /* Paint the newcomer immediately so it is never a frame behind, and so it
       still gets one render under reduced motion where no loop ever runs. */
    fn(this.state);
    return () => {
      this.subs.delete(fn);
    };
  }

  /** The only place layout is read. */
  measure = () => {
    if (typeof window === "undefined") return;
    this.vh = window.innerHeight;
    this.docScroll = Math.max(
      1,
      document.documentElement.scrollHeight - this.vh,
    );
    const sy = window.scrollY;
    this.geom = this.els.map((el) => {
      if (!el) return { top: 0, span: 1 };
      const r = el.getBoundingClientRect();
      return {
        top: r.top + sy,
        /* The scroll distance the stage stays pinned: everything past the
           first viewport of the wrapper's height. */
        span: Math.max(1, r.height - this.vh),
      };
    });
  };

  start() {
    if (this.running || typeof window === "undefined") return;
    this.running = true;
    this.measure();

    /* Seed the damped position at wherever we actually are. Starting it at 0
       on a page restored mid-document would play the entire descent as a
       single glide on load. */
    this.smoothY = this.lastY = window.scrollY || 0;
    this.lastNow = 0;

    if (this.reduced()) {
      /* Hold a shallow depth and publish once. The scenes lay themselves out
         as plain sections in CSS, so there is nothing to drive. */
      this.state.p = 0.12;
      this.state.scene = new Array(SCENES).fill(1);
      this.emit();
      return;
    }

    /*
     * Smooth scroll, scoped to this route and torn down with it.
     *
     * The scenes are scrubbed against scroll position, and a raw wheel moves
     * that position in ~100px jumps — every scrubbed value then lands in
     * visible steps. Inertia is not decoration here; it is what makes a
     * scrub read as motion rather than as a slideshow.
     *
     * Deliberately not global. The live room is a place you make fast
     * decisions in against a five-second clock, and smoothing its scroll
     * would put lag between a bidder and the bid panel. The landing is a
     * place too — this one just happens to want inertia.
     */
    this.lenis = new Lenis({ lerp: 0.085, smoothWheel: true });

    this.started = performance.now();
    const loop = (now: number) => {
      /* One rAF drives Lenis, the scenes and the shader, in that order.
         Letting Lenis run its own loop would put its scroll write and our
         read on different frames, which is exactly how a scrubbed scene
         ends up one frame behind the ground it is standing on. */
      this.lenis?.raf(now);
      this.frame(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);

    window.addEventListener("resize", this.onResize, { passive: true });
    window.addEventListener("orientationchange", this.onResize, {
      passive: true,
    });
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.resizeTimer);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("orientationchange", this.onResize);
    /* Destroying is not optional: Lenis puts classes on <html> and keeps a
       wheel listener. Leave it alive and every other route inherits the
       landing's scroll feel, which is the thing this scoping exists to
       prevent. */
    this.lenis?.destroy();
    this.lenis = null;
  }

  private onResize = () => {
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(this.measure, 140);
  };

  private frame(now: number) {
    const s = this.state;
    s.t = (now - this.started) / 1000;

    /* Real elapsed time, so the damping below behaves identically on a 60Hz
       panel and a 144Hz one. A fixed per-frame factor converges more than
       twice as fast at 144Hz — the same code, a different feel per machine.
       Clamped because a backgrounded tab returns one enormous dt. */
    const dt = this.lastNow ? Math.min((now - this.lastNow) / 1000, 0.1) : 1 / 60;
    this.lastNow = now;

    const rawY = window.scrollY || 0;

    /* Stage two of the smoothing: everything scrubbed is derived from this
       damped position rather than from the live one. */
    const gap = rawY - this.smoothY;
    this.smoothY =
      Math.abs(gap) > JUMP_SNAP_PX
        ? rawY
        : this.smoothY + gap * (1 - Math.exp(-dt / SCRUB_TAU));

    const y = this.smoothY;
    const dy = Math.abs(rawY - this.lastY);
    this.lastY = rawY;
    s.y = y;
    s.p = clamp(y / this.docScroll, 0, 1);
    /* Velocity from px-per-second, not px-per-frame, for the same reason. */
    s.vel += (clamp(dy / dt / 3300, 0, 1) - s.vel) * (1 - Math.exp(-dt / 0.12));

    for (let i = 0; i < SCENES; i++) {
      const g = this.geom[i];
      s.scene[i] = g ? clamp((y - g.top) / g.span, 0, 1) : 0;
    }

    /* Dissolve density: distance to the nearest scene boundary.
       A wide reach with a slight overdrive — squaring this instead pins it
       near zero through the whole approach and then spikes, which reads as a
       cut rather than a dissolve. The clamp holds full cover briefly across
       the boundary itself, hiding the moment one stage unsticks and the next
       takes over. */
    let burn = 0;
    const reach = this.vh * 0.8;
    for (let i = 1; i < SCENES; i++) {
      const g = this.geom[i];
      if (!g) continue;
      const d = Math.abs(y - g.top);
      if (d < reach) burn = Math.max(burn, 1 - d / reach);
    }
    const bo = clamp(burn * 1.08, 0, 1);
    s.burn = bo * bo * (3 - 2 * bo);

    /* The light dies inside the s4 dissolve, where nobody can watch it
       happen. In the open, the crossover would spend a second at the exact
       mid-contrast where neither the umber nor the cream ink is readable. */
    const b4 = this.geom[3]?.top ?? this.docScroll * 0.62;
    const b5 = this.geom[4]?.top ?? this.docScroll * 0.8;
    s.night = smoothstep(b4 - this.vh * 0.42, b4 + this.vh * 0.3, y);
    s.climax =
      b5 > b4
        ? smoothstep(b4, b4 + (b5 - b4) * 0.45, y) *
          (1 - smoothstep(b5 - this.vh * 0.5, b5, y))
        : 0;
    s.door = smoothstep(b5 - this.vh * 0.2, b5 + this.vh * 0.9, y);

    this.emit();
  }

  private emit() {
    for (const fn of this.subs) fn(this.state);
  }
}

export const descent = new DescentEngine();

/** Runs `fn` once per frame with the shared state. Never re-renders. */
export function useDescentFrame(fn: (s: DescentState) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => descent.subscribe((s) => ref.current(s)), []);
}

/** Registers a scene wrapper so its sticky progress can be measured. */
export function useSceneRef(index: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    descent.register(index, ref.current);
    return () => descent.register(index, null);
  }, [index]);
  return ref;
}
