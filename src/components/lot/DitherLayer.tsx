"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Renders a 1-bit ordered-dither of the lot photograph over the real image.
 *
 * Why a canvas and not a CSS filter: CSS can posterise and it can add noise, but
 * it cannot do *ordered* dithering — the regular Bayer threshold pattern that
 * gives newsprint and early Mac graphics their look. That pattern is the whole
 * point; random noise reads as a dirty screen, an ordered matrix reads as print.
 *
 * The dither is drawn as dark pixels on transparency, so the plate's warm ground
 * shows through as paper. Those grounds are theme-independent by design, which
 * is what lets one render serve both light and dark without redrawing.
 *
 * Motion-driven interaction, and it has to work two ways:
 *
 *   • Pointer devices — the layer fades under the cursor, so the object
 *     resolves from print into photograph as the reader reaches for it.
 *   • Touch — there is no hover, so hover alone would leave every phone stuck
 *     on the dither forever. Instead the reveal is driven by scroll: a plate
 *     resolves once it reaches the middle of the viewport. Same idea, same
 *     feel, triggered by the only motion a phone actually has.
 *
 * The scroll path only runs where hover is absent, so desktop does not pay for
 * an observer it will never use.
 */

/* Bayer 8×8. Values 0–63 become the per-pixel threshold. */
const BAYER = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

/**
 * Render width in device pixels. Low on purpose — chunky dots read as print.
 * Must scale with the plate: 200 across a 169px catalogue card is a fine
 * newsprint screen, but the same 200 stretched over a full-bleed hero turns
 * into unreadable blocks.
 */
const DEFAULT_RES = 200;

export function DitherLayer({
  src,
  res = DEFAULT_RES,
}: {
  src: string;
  res?: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  /* Touch only. Stays false on pointer devices, where group-hover does it. */
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || typeof IntersectionObserver === "undefined") return;

    /*
     * The observer always runs; CSS decides whether its result is honoured
     * (see the `@media (hover: none)` rule in globals.css).
     *
     * Gating this on a matchMedia check at mount was the obvious version and
     * the wrong one: the query is read once, so a window resized across the
     * breakpoint — or any device that reports hover late — keeps whichever
     * answer happened to be true on that first frame. Letting the media query
     * live in CSS means it re-evaluates on its own, forever.
     */
    const io = new IntersectionObserver(
      ([entry]) => setRevealed(entry.isIntersecting),
      /* Band across the middle of the screen: a plate resolves as it passes
         the reader's focus, and dithers again as it leaves. */
      { rootMargin: "-42% 0px -42% 0px" },
    );

    io.observe(canvas);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    let cancelled = false;
    const img = new Image();
    /* Same-origin (/media/lots/…), so getImageData is not tainted. */
    img.src = src;

    img.onload = () => {
      if (cancelled) return;

      const ratio = img.naturalHeight / img.naturalWidth || 1.25;
      const w = res;
      const h = Math.max(1, Math.round(res * ratio));
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(img, 0, 0, w, h);
      const frame = ctx.getImageData(0, 0, w, h);
      const px = frame.data;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;

          /* Rec. 601 luma — closer to perceived brightness than a flat mean,
             which matters when the whole output is a threshold decision. */
          const luma =
            0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];

          /* Lift slightly so mid-tone objects do not collapse to solid black. */
          const threshold = ((BAYER[y & 7][x & 7] + 0.5) / 64) * 255 * 0.92 + 10;

          if (luma > threshold) {
            px[i + 3] = 0; // light → paper shows through
          } else {
            px[i] = 28;
            px[i + 1] = 23;
            px[i + 2] = 20;
            px[i + 3] = 255; // dark → ink
          }
        }
      }

      ctx.putImageData(frame, 0, 0);
      setReady(true);
    };

    return () => {
      cancelled = true;
      img.onload = null;
    };
  }, [src, res]);

  return (
    /*
     * The hover fade is a CSS group-hover, not React state, so LotPlate can stay
     * a Server Component and no pointer handler ships for twelve cards. State
     * here only gates the first paint until the dither is actually drawn —
     * otherwise an empty canvas flashes over the photograph.
     */
    <canvas
      ref={ref}
      aria-hidden
      data-revealed={revealed ? "true" : "false"}
      className={`dither-layer pointer-events-none absolute inset-0 size-full object-cover transition-opacity duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:opacity-0 ${
        ready ? "opacity-100" : "opacity-0"
      }`}
      /* Nearest-neighbour: smoothing a dither back into greys defeats it. */
      style={{ imageRendering: "pixelated" }}
    />
  );
}
