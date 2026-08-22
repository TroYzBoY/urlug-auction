import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * STYLESHEET INVARIANTS
 *
 * Things that are true of `globals.css` and would break quietly if they stopped
 * being true — one palette, motion that can be turned off, and reveals that
 * never hide content from a browser with no JavaScript.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const raw = readFileSync("src/app/globals.css", "utf8");

/*
 * Comments stripped first. The file's own header documents the four theme
 * states in prose, so a naive `indexOf(':root[data-theme="dark"]')` finds the
 * COMMENT describing the selector rather than the selector itself — and then
 * reads whichever block happens to follow it.
 */
const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * The body of a brace-delimited block starting at `startIndex`, matched by
 * counting braces rather than by regex — the media query contains a nested
 * rule, and a non-greedy `\{(.*?)\}` would stop at the inner closing brace.
 */
function blockAt(source: string, startIndex: number): string {
  const open = source.indexOf("{", startIndex);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error("Unbalanced braces in globals.css");
}

describe("the palette", () => {
  /*
   * These replace a set of tests that checked the two dark blocks agreed with
   * each other. There is one palette now, so the class of bug they guarded
   * against — a token added to the media query but not the selector, correct
   * for OS-dark users and wrong for everyone who used the toggle — cannot
   * happen. What is worth guarding instead is that it stays that way.
   */
  it("has exactly one definition of each semantic colour", () => {
    const themeBlock = blockAt(css, css.indexOf("@theme"));
    const names = [...themeBlock.matchAll(/(--color-[\w-]+)\s*:/g)].map(
      (m) => m[1],
    );
    expect(names.length).toBeGreaterThan(10);
    expect(new Set(names).size).toBe(names.length);
  });

  it("has no light-mode branch left", () => {
    // A `prefers-color-scheme` block or a `data-theme` selector would mean a
    // second palette had crept back in without the toggle to reach it.
    expect(css).not.toMatch(/@media\s*\(prefers-color-scheme/);
    expect(css).not.toContain('data-theme');
  });

  it("declares color-scheme: dark", () => {
    // Without it the browser paints its own furniture light — a white
    // scrollbar down the side of a dark page, and a white flash before paint.
    expect(css).toMatch(/color-scheme:\s*dark/);
  });
});

describe("motion", () => {
  it("has a reduced-motion block", () => {
    /*
     * The site animates a great deal — scroll reveals, a rolling price, a
     * pulsing clock, a five-scene scroll piece. `prefers-reduced-motion` is not
     * a nicety here: for some people this much movement is nausea, and for
     * anyone it is a five-second clock competing with a parallax.
     */
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("disables view transitions explicitly", () => {
    // These are not covered by `animation: none` — the browser runs them
    // outside the element's own animation timeline, so they need naming.
    const index = css.indexOf("@media (prefers-reduced-motion: reduce)");
    const block = blockAt(css, index);
    expect(block).toMatch(/view-transition|::view-transition/);
  });

  it("neutralises animation and transition durations", () => {
    const index = css.indexOf("@media (prefers-reduced-motion: reduce)");
    const block = blockAt(css, index);
    expect(block).toMatch(/animation-duration:\s*0\.01ms/);
    expect(block).toMatch(/transition-duration:\s*0\.01ms/);
  });
});

describe("nothing hides content", () => {
  it("has no rule that starts content at zero opacity", () => {
    /*
     * This replaces a test that checked the scroll-reveal hidden state was
     * gated behind a `.js` class, so a page whose JavaScript failed rendered
     * plainly rather than blank.
     *
     * Reveals are gone, so the guard gets stronger: no rule anywhere should
     * start content invisible. Two things are legitimately exempt, and both are
     * decorative layers with content BEHIND them rather than inside them:
     *
     *   [data-shaft]  the landing's WebGL canvases, held at 0 between scenes
     *   .dither-layer the halftone overlay on a lot plate, which fading out
     *                 REVEALS the photograph underneath
     */
    const withoutKeyframes = css.replace(
      /@keyframes[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/g,
      "",
    );

    const offenders = [...withoutKeyframes.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, , body]) => /opacity:\s*0\s*(?:;|$)/.test(body!.trim()))
      .map(([, selector]) => selector!.trim())
      .filter(
        (sel) => !sel.includes("data-shaft") && !sel.includes("dither-layer"),
      );

    expect(offenders).toEqual([]);
  });
});
