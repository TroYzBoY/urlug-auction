import Link from "next/link";
import { t } from "@/lib/copy";
import { POINT_MNT, TOTAL_ROUNDS } from "@/lib/auction";
import { groupNumber } from "@/lib/format";

/**
 * The footer carries the house's legal identity, not just navigation.
 *
 * An auction house that does not say who it is leaves the winner of a lot
 * unable to name the party they have contracted with — which is the first
 * question asked when anything goes wrong, and a disclosure requirement in most
 * jurisdictions besides. The company block below is placeholder text and is
 * marked as such in `copy.ts`.
 */
export function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="gutter flex flex-col gap-8 py-12 md:flex-row md:items-start md:justify-between">
        <div className="max-w-md">
          <p className="text-[0.9375rem] font-bold tracking-[0.2em] text-ink">
            {t.brand.name}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {t.brand.tagline} · {TOTAL_ROUNDS} тойрог · 1 {t.common.point} ={" "}
            {groupNumber(POINT_MNT)}₮
          </p>

          <address className="mt-5 text-xs leading-relaxed text-faint not-italic">
            {t.footer.company}
            <br />
            {t.footer.registry}
            <br />
            {t.footer.address}
            <br />
            {t.contact.phone} · {t.contact.email}
          </address>

          <p className="mt-4 inline-flex items-center gap-2 border border-line px-2.5 py-1 text-xs text-muted">
            <span aria-hidden className="font-bold text-rust">
              18+
            </span>
            {t.footer.ageNotice}
          </p>
        </div>

        <nav className="flex flex-wrap items-center gap-x-6 gap-y-3 md:max-w-xs md:justify-end">
          <Link href="/rules" className="eyebrow transition-colors hover:text-ink">
            {t.nav.rules}
          </Link>
          <Link href="/lots" className="eyebrow transition-colors hover:text-ink">
            {t.nav.lots}
          </Link>
          <Link
            href="/lots#results"
            className="eyebrow transition-colors hover:text-ink"
          >
            {t.home.results}
          </Link>
          <Link href="/about" className="eyebrow transition-colors hover:text-ink">
            {t.nav.about}
          </Link>
          <Link
            href="/contact"
            className="eyebrow transition-colors hover:text-ink"
          >
            {t.nav.contact}
          </Link>
          <Link href="/terms" className="eyebrow transition-colors hover:text-ink">
            {t.footer.terms}
          </Link>
          <Link href="/privacy" className="eyebrow transition-colors hover:text-ink">
            {t.footer.privacy}
          </Link>
        </nav>
      </div>
      <div className="gutter border-t border-line py-5">
        <p className="text-xs text-faint">
          © {new Date().getFullYear()} {t.brand.name}. {t.footer.rights}.
        </p>
      </div>
    </footer>
  );
}
