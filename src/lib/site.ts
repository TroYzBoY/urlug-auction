/**
 * The site's own absolute URL.
 *
 * Needed by `metadataBase`, `robots.ts` and `sitemap.ts` — all three emit
 * absolute URLs, and a share card whose image URL is relative simply does not
 * render on any platform that fetches it.
 *
 * Not in `src/lib/env.ts`: that module is `server-only`, and this value is
 * public by definition. It is also the one variable a wrong default for is
 * visible rather than silent — a link to localhost in a shared card.
 */
/*
 * ⚠ This is read at BUILD time, not at runtime.
 *
 * `NEXT_PUBLIC_*` is inlined by the compiler wherever it appears — server
 * components included — so by the time the container starts, whatever was in
 * the environment during `next build` is already baked into the output. Setting
 * it as a runtime secret changes nothing; `robots.txt` is even prerendered to a
 * static file with the value in it. It has to arrive as a Docker build arg, and
 * the Dockerfile takes one.
 *
 * `||` rather than `??`, and trimmed. An unset build arg becomes an EMPTY
 * STRING rather than undefined, and `"" ?? fallback` is `""` — which would make
 * every absolute URL on the site relative and the failure much harder to spot
 * than a visible localhost.
 */
const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();

export const SITE_URL = (configured || "http://localhost:3000").replace(
  /\/$/,
  "",
);

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
