import Link from "next/link";
import { t } from "@/lib/copy";
import { POINT_MNT, TOTAL_MINUTES, TOTAL_ROUNDS } from "@/lib/auction";
import { groupNumber } from "@/lib/format";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FOOTER
 *
 * It carries the house's legal identity, not just navigation. An auction house
 * that does not say who it is leaves the winner of a lot unable to name the
 * party they have contracted with — the first question asked when anything goes
 * wrong, and a disclosure requirement besides.
 *
 * ⚠ The company block is PLACEHOLDER text, marked as such in `copy.ts`.
 *
 * ── The layout, and why it changed ───────────────────────────────────────────
 *
 * It used to be two blocks: a dense left column carrying the wordmark, the
 * format line, a four-line address and an 18+ badge, and seven links thrown
 * into a single `flex-wrap` on the right. Two things made that read as clutter
 * rather than as a footer:
 *
 *   1. **No grouping.** Seven peer links in one wrap means the reader has to
 *      parse each one to find out what kind of thing it is. Three labelled
 *      columns answer that before they read a single link.
 *   2. **Everything in small caps.** `eyebrow` is a label style — wide
 *      tracking, uppercase, muted. It works because it recedes. Applied to
 *      seven links it stops receding and becomes a wall.
 *
 * So: `eyebrow` for the column headings, which is what it is for, and ordinary
 * sentence case at a readable size for the links themselves.
 *
 * Three bands, separated by one rule each — brand and navigation, then the
 * legal identity, then the copyright line. The old version had two competing
 * rules and no third band, which is why the address and the age notice ended up
 * stacked under the wordmark with nowhere else to go.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const GROUPS = [
  {
    heading: t.footer.groupCatalogue,
    links: [
      { href: "/lots", label: t.nav.lots },
      { href: "/overview", label: t.nav.overview },
      { href: "/lots#results", label: t.home.results },
    ],
  },
  {
    heading: t.footer.groupHouse,
    links: [
      { href: "/rules", label: t.nav.rules },
      { href: "/about", label: t.nav.about },
      { href: "/contact", label: t.nav.contact },
    ],
  },
  {
    heading: t.footer.groupLegal,
    links: [
      { href: "/terms", label: t.footer.terms },
      { href: "/privacy", label: t.footer.privacy },
    ],
  },
] as const;

export function Footer() {
  const hours = Math.floor(TOTAL_MINUTES / 60);
  const minutes = TOTAL_MINUTES % 60;

  return (
    /*
     * `relative z-10` and an explicit ground, both for the landing.
     *
     * The Descent's shader canvas is `position: fixed` at `z-index: 0`, and a
     * positioned element at z-index 0 paints above every STATIC block in the
     * same stacking context — including this one, which comes after the descent
     * in the flow. Without a stacking context of its own the footer is painted
     * over by a full-viewport canvas, and being transparent it would have
     * nothing of its own to show anyway.
     */
    <footer className="relative z-10 mt-24 border-t border-line bg-ground">
      {/* ── Band 1: the house, and where to go ───────────────────────────── */}
      <div className="gutter grid grid-cols-2 gap-x-8 gap-y-12 py-14 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] md:py-16">
        <div className="col-span-2 max-w-xs md:col-span-1">
          <p className="text-base font-bold tracking-[0.22em] text-ink">
            {t.brand.name}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {t.brand.tagline}
          </p>

          {/*
            The format in three figures, from `auction.ts` rather than typed
            out — the footer should not be the one place that still claims six
            rounds after somebody changes it to seven.
          */}
          <dl
            data-numerals
            className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-xs text-faint"
          >
            <div>
              <dt className="sr-only">{t.home.statRounds}</dt>
              <dd>
                {TOTAL_ROUNDS} {t.common.roundWord}
              </dd>
            </div>
            <div>
              <dt className="sr-only">{t.home.statDuration}</dt>
              <dd>
                {hours} цаг {minutes} мин
              </dd>
            </div>
            <div>
              <dt className="sr-only">{t.home.statPoint}</dt>
              <dd>
                1 {t.common.point} = {groupNumber(POINT_MNT)}₮
              </dd>
            </div>
          </dl>
        </div>

        {/*
          Two columns on a phone, three beside the brand above md. Three across
          a phone leaves labels breaking mid-word; one column turns a footer
          into a page. The brand block spans both on mobile so the figures
          under it have room to sit on one line.
        */}
        {GROUPS.map((group) => (
          <nav key={group.heading} aria-label={group.heading}>
            <h2 className="eyebrow">{group.heading}</h2>
            <ul className="mt-4 flex flex-col gap-2.5">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-ink-soft transition-colors hover:text-accent"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      {/* ── Band 2: who this actually is ─────────────────────────────────── */}
      <div className="gutter border-t border-line py-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <address className="text-xs leading-relaxed text-faint not-italic">
            <span className="block font-medium text-muted">
              {t.footer.company}
            </span>
            <span className="mt-1 block">{t.footer.registry}</span>
            <span className="block">{t.footer.address}</span>
          </address>

          <div className="flex flex-col gap-3 text-xs md:items-end">
            {/* Contact as links, not as text. A phone number on a phone that
                cannot be tapped is a phone number somebody has to retype. */}
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-muted">
              <a
                href={`tel:${t.contact.phone.replace(/\s/g, "")}`}
                className="transition-colors hover:text-accent"
              >
                {t.contact.phone}
              </a>
              <a
                href={`mailto:${t.contact.email}`}
                className="transition-colors hover:text-accent"
              >
                {t.contact.email}
              </a>
            </p>

            <p className="inline-flex items-center gap-2 self-start border border-line px-2.5 py-1 text-faint md:self-end">
              <span aria-hidden className="font-bold text-rust">
                18+
              </span>
              {t.footer.ageNotice}
            </p>
          </div>
        </div>
      </div>

      {/* ── Band 3: the line at the bottom ───────────────────────────────── */}
      <div className="gutter border-t border-line py-5">
        <p className="text-xs text-faint">
          © {new Date().getFullYear()} {t.brand.name}. {t.footer.rights}.
        </p>
      </div>
    </footer>
  );
}
