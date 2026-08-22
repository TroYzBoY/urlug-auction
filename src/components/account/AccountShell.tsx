import { Footer } from "@/components/site/Footer";
import { SiteHeader } from "@/components/site/SiteHeader";

/**
 * Shared frame for `/profile`, `/wallet` and `/admin`.
 *
 * These are the pages a signed-in bidder works in rather than browses, so they
 * drop the catalogue's cinematic entrance: content is present on arrival, and
 * a balance that fades in is a balance you cannot read yet.
 */
export function AccountShell({
  eyebrow,
  title,
  lede,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  /** Sign-out, or a link across to the sibling page. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />

      <main id="main" className="gutter pt-28 pb-8 md:pt-32">
        <div className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-8">
          <div className="min-w-0">
            <p className="eyebrow">{eyebrow}</p>
            <h1 className="display mt-3 text-[clamp(2rem,7vw,3.5rem)] leading-[1.02] text-ink">
              {title}
            </h1>
            <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-soft">
              {lede}
            </p>
          </div>
          {actions && <div className="flex items-center gap-3">{actions}</div>}
        </div>

        {children}
      </main>

      <Footer />
    </>
  );
}

/** One figure with its label. Numerals get the tabular treatment. */
export function Stat({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="border-t border-line pt-4">
      <p className="eyebrow">{label}</p>
      <p
        data-numerals
        className={`mt-2 text-2xl font-medium tracking-[-0.02em] md:text-3xl ${
          accent ? "text-flare" : "text-ink"
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

/**
 * A section with a heading and an empty state.
 *
 * The empty state is a required prop rather than an optional one: a table that
 * renders as a bare header row when there is nothing in it reads as broken, and
 * every one of these pages is empty on the day a bidder signs up.
 */
export function Panel({
  heading,
  empty,
  isEmpty,
  children,
  note,
}: {
  heading: string;
  empty: string;
  isEmpty: boolean;
  children: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <section className="mt-14">
      <h2 className="text-lg font-medium tracking-[-0.02em] text-ink">
        {heading}
      </h2>
      {note && <p className="mt-2 text-sm text-muted">{note}</p>}

      {isEmpty ? (
        <p className="mt-5 border-t border-line pt-5 text-sm text-muted">
          {empty}
        </p>
      ) : (
        <div className="mt-5">{children}</div>
      )}
    </section>
  );
}
