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
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
