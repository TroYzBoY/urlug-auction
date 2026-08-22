import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TWO DARK BLOCKS MUST AGREE
 *
 * `globals.css` defines the dark palette twice — once under
 * `@media (prefers-color-scheme: dark)` and once under `:root[data-theme="dark"]`
 * — because a media query and a selector cannot be merged into one rule.
 *
 * They are duplicates by necessity, which means they drift. The failure is
 * quiet and specific: a token added to one block only is correct for everyone
 * following their OS and wrong for everyone who used the toggle, or the other
 * way round. Nobody notices until a screenshot from the wrong half arrives.
 *
 * The README says "keep them in sync". This is that instruction, enforced.
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

/** Every `--token: value;` declaration inside a block, as a sorted list. */
function declarationsIn(source: string): string[] {
  return [...source.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)]
    .map((m) => `${m[1]}: ${m[2]!.trim()}`)
    .sort();
}

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

describe("the dark palette", () => {
  const mediaIndex = css.indexOf("@media (prefers-color-scheme: dark)");
  const explicitIndex = css.indexOf(':root[data-theme="dark"]');

  it("is defined in both places", () => {
    expect(mediaIndex).toBeGreaterThan(-1);
    expect(explicitIndex).toBeGreaterThan(-1);
  });

  it("declares exactly the same tokens in both", () => {
    const media = declarationsIn(blockAt(css, mediaIndex));
    const explicit = declarationsIn(blockAt(css, explicitIndex));

    expect(media.length).toBeGreaterThan(10);
    /*
     * Values too, not just names. A token pointing at `--amber-gold` in one
     * block and `--amber-flare` in the other is the same class of bug and just
     * as invisible.
     */
    expect(explicit).toEqual(media);
  });

  it("keeps the always-dark room on the explicit block", () => {
    // The live room is a PLACE, not a theme: it stays dark for a light-mode
    // visitor. That only works if `[data-skin="room"]` rides along with the
    // explicit selector rather than the media query.
    const between = css.slice(explicitIndex, css.indexOf("{", explicitIndex));
    expect(between).toContain('[data-skin="room"]');
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

describe("scroll reveals", () => {
  it("hides only behind the .js class", () => {
    /*
     * The hidden state must be gated on a class that a script adds, so that a
     * page whose JavaScript failed renders plainly visible rather than blank.
     * An unconditional `opacity: 0` here is a site that disappears.
     */
    expect(css).toMatch(/\.js\s+\[data-reveal="hidden"\]\s*\{/);

    /*
     * And the unguarded `[data-reveal]` rule must NOT set opacity — that is
     * the one that applies with scripting off.
     */
    const unguarded = /(?<!\.js )\[data-reveal\]\s*\{([^}]*)\}/.exec(css);
    if (unguarded) expect(unguarded[1]).not.toMatch(/opacity:\s*0/);
  });
});
