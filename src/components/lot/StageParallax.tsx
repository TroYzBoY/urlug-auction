"use client";

import { useRef, type ReactNode } from "react";

/**
 * The hero's stage, given depth by the mouse: the orbits and the glow behind
 * them each shift by a different amount as the pointer moves, so they read as
 * layers at different distances. The featured card itself holds still.
 *
 * It only measures. It writes `--sx`/`--sy` (−1…1 across the stage) at most
 * once a frame, and `.catalogue-stage` in edgerunners.css decides how far each
 * layer moves — and, by media query, that touch screens and reduced motion get
 * none of it.
 */
export function StageParallax({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const frame = useRef(0);
  const pointer = useRef({ x: 0, y: 0 });

  const apply = () => {
    frame.current = 0;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const sx = ((pointer.current.x - r.left) / r.width) * 2 - 1;
    const sy = ((pointer.current.y - r.top) / r.height) * 2 - 1;
    el.style.setProperty("--sx", Math.max(-1, Math.min(1, sx)).toFixed(3));
    el.style.setProperty("--sy", Math.max(-1, Math.min(1, sy)).toFixed(3));
  };

  return (
    <div
      ref={ref}
      className="catalogue-stage"
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return;
        pointer.current = { x: e.clientX, y: e.clientY };
        if (!frame.current) frame.current = requestAnimationFrame(apply);
      }}
      onPointerLeave={(e) => {
        cancelAnimationFrame(frame.current);
        frame.current = 0;
        e.currentTarget.style.removeProperty("--sx");
        e.currentTarget.style.removeProperty("--sy");
      }}
    >
      {children}
    </div>
  );
}
