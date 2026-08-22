/**
 * Writes one labelled SVG per catalogue photograph named in `lots.ts`.
 *
 *   node --experimental-strip-types db/fixtures/make-placeholders.ts
 *
 * ── Why generated, and why they look like placeholders ───────────────────────
 *
 * Real product photography of the actual unit being sold is not something this
 * repository can contain: the photographs do not exist until somebody takes
 * them, and a stock render of a *different* unit is closer to a
 * misrepresentation than to a catalogue entry.
 *
 * So these are deliberately, unmistakably placeholders — flat, labelled with the
 * lot and the angle they are standing in for, in the site's own palette. That
 * is the point. A grey box is unhelpful; a convincing fake photograph is worse,
 * because it is the one nobody remembers to replace.
 *
 * SVG rather than PNG: a few hundred bytes each, sharp at any density, and
 * readable in a diff.
 *
 * ⚠ Deleting a lot's directory and dropping real photographs in with the same
 * filenames is all that is needed — nothing reads this script at runtime.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LOTS } from "./lots.ts";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, "..", "..", "public");

/* The site's own tokens, so a placeholder does not glare on a dark page. */
const GROUND = "#241c16";
const RULE = "rgba(246,236,222,0.14)";
const INK = "#a89e90";
const FAINT = "#7a7167";

function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * A 4:5 card — the ratio the catalogue plate uses most — carrying the lot code,
 * the angle, and a frame that reads as "photograph goes here".
 */
function placeholder(code: string, title: string, alt: string, n: number, of: number) {
  const w = 1200;
  const h = 1500;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escape(alt)}">
  <rect width="${w}" height="${h}" fill="${GROUND}"/>
  <rect x="60" y="60" width="${w - 120}" height="${h - 120}" fill="none" stroke="${RULE}" stroke-width="2"/>
  <line x1="60" y1="60" x2="${w - 60}" y2="${h - 60}" stroke="${RULE}" stroke-width="1"/>
  <line x1="${w - 60}" y1="60" x2="60" y2="${h - 60}" stroke="${RULE}" stroke-width="1"/>
  <g font-family="Inter, Helvetica, Arial, sans-serif" text-anchor="middle">
    <text x="${w / 2}" y="${h / 2 - 90}" fill="${FAINT}" font-size="34" letter-spacing="8">${escape(code)}</text>
    <text x="${w / 2}" y="${h / 2 - 20}" fill="${INK}" font-size="52" font-weight="600">${escape(title)}</text>
    <text x="${w / 2}" y="${h / 2 + 50}" fill="${INK}" font-size="40">${escape(alt)}</text>
    <text x="${w / 2}" y="${h / 2 + 130}" fill="${FAINT}" font-size="30" letter-spacing="4">${n} / ${of}</text>
    <text x="${w / 2}" y="${h - 110}" fill="${FAINT}" font-size="26" letter-spacing="6">ЗУРАГ ОРУУЛААГҮЙ</text>
  </g>
</svg>
`;
}

let written = 0;

for (const lot of LOTS) {
  for (const [i, image] of lot.images.entries()) {
    /* `/media/lots/101/01.svg` → `public/media/lots/101/01.svg` */
    const target = join(publicDir, image.url.replace(/^\//, ""));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(
      target,
      placeholder(lot.code, lot.title, image.alt, i + 1, lot.images.length),
      "utf8",
    );
    written += 1;
  }
}

console.info(`Wrote ${written} placeholder images for ${LOTS.length} lots.`);
console.info("⚠ Replace them with photographs of the actual units before listing.");
