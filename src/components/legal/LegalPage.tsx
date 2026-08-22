import { Footer } from "@/components/site/Footer";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Reveal } from "@/components/site/Reveal";
import { t } from "@/lib/copy";

/**
 * Shared frame for `/terms` and `/privacy`.
 *
 * Legal text is read differently from marketing copy — people scan for the
 * clause that concerns them — so the sections are numbered, the measure is
 * narrow, and the leading is generous. Nothing animates except the section
 * reveals, and those never gate visibility.
 */

export interface LegalSection {
  heading: string;
  /** Paragraphs, or a bulleted list. Rendered in order. */
  body: (string | string[])[];
}

export function LegalPage({
  eyebrow,
  title,
  lede,
  version,
  sections,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  /** The version this text is, recorded against each user's consent. */
  version: string;
  sections: LegalSection[];
}) {
  return (
    <>
      <SiteHeader />

      <main id="main" className="gutter pt-14 pb-8 md:pt-20">
        <p className="eyebrow animate-rise-in">{eyebrow}</p>
        <h1
          className="display mt-5 animate-rise-in text-[clamp(2.25rem,8vw,4.5rem)] text-ink"
          style={{ animationDelay: "90ms" }}
        >
          {title}
        </h1>
        <p
          className="mt-6 max-w-2xl animate-rise-in text-base leading-relaxed text-ink-soft"
          style={{ animationDelay: "180ms" }}
        >
          {lede}
        </p>

        <p
          data-numerals
          className="mt-6 animate-rise-in text-sm text-muted"
          style={{ animationDelay: "270ms" }}
        >
          {t.legal.lastUpdated}: {version}
        </p>

        {/*
          Stated on the page, not only in a code comment. Anyone relying on this
          text — a bidder, or whoever inherits the project — should learn from
          the document itself that it has not been reviewed, rather than from a
          TODO they never read.
        */}
        <div className="mt-8 max-w-2xl border-l-2 border-rust bg-rust/5 py-3 pl-4">
          <p className="text-sm leading-relaxed text-rust">
            ⚠ {t.legal.reviewWarning}
          </p>
        </div>

        <div className="mt-14 max-w-2xl md:mt-20">
          {sections.map((section, i) => (
            <Reveal
              as="section"
              key={section.heading}
              className="border-t border-line py-9 first:border-t-0 first:pt-0"
              y={16}
            >
              <h2 className="flex gap-4 text-lg font-medium tracking-[-0.02em] text-ink">
                <span data-numerals className="shrink-0 text-muted tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {section.heading}
              </h2>

              <div className="mt-5 flex flex-col gap-4 pl-0 md:pl-10">
                {section.body.map((block, j) =>
                  Array.isArray(block) ? (
                    <ul key={j} className="flex flex-col gap-2.5">
                      {block.map((item) => (
                        <li
                          key={item}
                          className="flex gap-3 text-sm leading-relaxed text-ink-soft"
                        >
                          <span aria-hidden className="mt-2 size-1 shrink-0 bg-accent" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p key={j} className="text-sm leading-relaxed text-ink-soft">
                      {block}
                    </p>
                  ),
                )}
              </div>
            </Reveal>
          ))}
        </div>

        <p className="mt-12 max-w-2xl border-t border-line pt-8 text-sm text-muted">
          {t.legal.contactPrompt} {t.contact.email} · {t.contact.phone}
        </p>
      </main>

      <Footer />
    </>
  );
}
