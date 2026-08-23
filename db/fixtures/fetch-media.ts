/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DOWNLOAD THE CATALOGUE PHOTOGRAPHS
 *
 *   npm run db:media
 *
 * Reads `media.ts`, fetches each photograph from Wikimedia Commons as a JPEG
 * thumbnail, and writes `public/media/lots/<id>/NN.jpg`. Then writes
 * `public/media/lots/CREDITS.md` recording the author, licence and source page
 * of every file.
 *
 * The credits file is not a courtesy. CC BY and CC BY-SA both require
 * attribution wherever the image appears, and an image whose provenance nobody
 * wrote down is an image nobody can lawfully publish later.
 *
 * Thumbnails rather than originals: the originals run to 6000px and tens of
 * megabytes, which is not a catalogue photograph, and Commons renders a
 * correctly-scaled JPEG for any width on request.
 *
 * Run it again to refresh. It is idempotent — each lot's directory is cleared
 * first, so a caption removed from media.ts does not leave its file behind.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MEDIA } from "./media.ts";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, "..", "..", "public");
const lotsDir = join(publicDir, "media", "lots");

/** Wide enough for the detail page at 2x, small enough to keep in git. */
const WIDTH = 1000;

/*
 * Wikimedia asks for a descriptive User-Agent that identifies the tool and a
 * way to make contact. A generic one is throttled, and rightly.
 */
const UA =
  "UrlugCatalogue/0.1 (development fixture; +https://github.com/TroYzBoY/urlug)";

interface Credit {
  lot: string;
  file: string;
  title: string;
  author: string;
  licence: string;
  source: string;
}

/** Commons puts HTML in the author field. The catalogue wants a name. */
function textOf(html: string | undefined): string {
  if (!html) return "Unknown";
  return (
    html
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/\s+/g, " ")
      .trim() || "Unknown"
  );
}

/**
 * Commons answers 429 when asked for too much at once, and the right response
 * to that is to wait rather than to give up — a half-downloaded catalogue is
 * worse than a slow one. Backs off, and only for 429: any other status is a
 * real failure and should surface immediately.
 */
async function get(url: string): Promise<Response> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (res.status !== 429) return res;
    await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
  }
  throw new Error("Rate limited by Commons after five attempts");
}

/** Enough of a gap that a full run does not trip the limiter to begin with. */
const PAUSE_MS = 900;

async function lookup(title: string) {
  const url =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo" +
    "&iiprop=url|extmetadata&iiurlwidth=" +
    WIDTH +
    "&titles=" +
    encodeURIComponent("File:" + title);

  const res = await get(url);
  if (!res.ok)
    throw new Error(`Commons API returned ${res.status} for ${title}`);

  const body = (await res.json()) as {
    query?: {
      pages?: Record<
        string,
        { missing?: string; imageinfo?: Array<Record<string, unknown>> }
      >;
    };
  };
  const page = Object.values(body.query?.pages ?? {})[0];
  if (!page || page.missing !== undefined || !page.imageinfo?.[0]) {
    throw new Error(`No such file on Commons: ${title}`);
  }

  const info = page.imageinfo[0];
  const meta = (info.extmetadata ?? {}) as Record<string, { value?: string }>;
  return {
    /* thumburl is the rendered JPEG; url is the original, which may be a PNG. */
    download: String(info.thumburl ?? info.url),
    source: String(info.descriptionurl ?? ""),
    author: textOf(meta.Artist?.value),
    licence: textOf(meta.LicenseShortName?.value),
  };
}

async function main() {
  const credits: Credit[] = [];
  const failures: string[] = [];

  for (const [lot, shots] of Object.entries(MEDIA)) {
    const dir = join(lotsDir, lot);
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });

    for (const [i, shot] of shots.entries()) {
      const name = `${String(i + 1).padStart(2, "0")}.jpg`;
      try {
        const found = await lookup(shot.commons);
        const res = await get(found.download);
        if (!res.ok) throw new Error(`Download returned ${res.status}`);

        const bytes = Buffer.from(await res.arrayBuffer());
        if (bytes.length < 4_000)
          throw new Error(`Suspiciously small (${bytes.length} bytes)`);

        await writeFile(join(dir, name), bytes);
        credits.push({
          lot,
          file: `${lot}/${name}`,
          title: shot.commons,
          author: found.author,
          licence: found.licence,
          source: found.source,
        });
        console.info(
          `  ${lot}/${name}  ${(bytes.length / 1024).toFixed(0)}kB  ${found.licence}`,
        );
      } catch (err) {
        failures.push(
          `${lot}/${name} (${shot.commons}): ${(err as Error).message}`,
        );
      }
      await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
  }

  const lines = [
    "# Photograph credits",
    "",
    "Every image under `public/media/lots/` comes from Wikimedia Commons.",
    "Generated by `db/fixtures/fetch-media.ts`; do not edit by hand.",
    "",
    "⚠ CC BY and CC BY-SA require attribution wherever the image is shown.",
    "Nothing in the UI surfaces these credits yet. A published page must either",
    "display them or use photographs the house owns.",
    "",
    "⚠ These are photographs of the MODEL, not of the unit being sold. A real",
    "listing needs photographs of the actual item, including its faults.",
    "",
    "| File | Licence | Author | Source |",
    "| --- | --- | --- | --- |",
    ...credits.map(
      (c) =>
        `| \`${c.file}\` | ${c.licence} | ${c.author} | [${c.title}](${c.source}) |`,
    ),
    "",
  ];
  await writeFile(join(lotsDir, "CREDITS.md"), lines.join("\n"), "utf8");

  /* Anything left over from the drawings this replaced. */
  for (const lot of Object.keys(MEDIA)) {
    const stale = (await readdir(join(lotsDir, lot))).filter((f) =>
      f.endsWith(".svg"),
    );
    for (const f of stale) await rm(join(lotsDir, lot, f));
  }

  console.info(`\nWrote ${credits.length} photographs and CREDITS.md.`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} failed:\n  ${failures.join("\n  ")}`);
    process.exitCode = 1;
  }
}

await main();
