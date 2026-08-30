import { permanentRedirect } from "next/navigation";

/**
 * The front door is now the catalogue.
 *
 * `/` used to hold the cinematic Descent; that piece moved to `/about`, and the
 * working home — the one the wordmark and every "back" points at — is the lot
 * index. A permanent server redirect keeps `/lots` the single canonical URL for
 * it rather than rendering the same page under two paths.
 *
 * `permanentRedirect`, which is a 308 — `redirect` is a 307, and this said
 * "permanent" for a while whilst answering with a temporary one. A crawler
 * reading 307 keeps `/` in the index and moves no ranking to `/lots`, which is
 * the opposite of what a canonical decision is for.
 */
export default function Page() {
  permanentRedirect("/lots");
}
