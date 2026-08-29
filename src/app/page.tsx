import { redirect } from "next/navigation";

/**
 * The front door is now the catalogue.
 *
 * `/` used to hold the cinematic Descent; that piece moved to `/about`, and the
 * working home — the one the wordmark and every "back" points at — is the lot
 * index. A permanent server redirect keeps `/lots` the single canonical URL for
 * it rather than rendering the same page under two paths.
 */
export default function Page() {
  redirect("/lots");
}
