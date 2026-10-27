import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { LotPlate } from "@/components/lot/LotPlate";
import { Footer } from "@/components/site/Footer";
import { SiteHeader } from "@/components/site/SiteHeader";
import { t } from "@/lib/copy";
import { photoCredits, type CreditRow } from "@/lib/repo/media";

export const metadata: Metadata = {
  title: t.credits.title,
  description: t.credits.lede,
};

/**
 * Who took the photographs, for every one that is not the house's own.
 *
 * CC BY and CC BY-SA allow the images on condition that the author and the
 * licence are credited in a reasonable manner for the medium. A catalogue card
 * has no room for a licence line, so the cards link here through the footer,
 * and the gallery and the room's details sheet carry the credit beside the
 * image as well.
 *
 * Read from the database rather than written out, so a photograph added or
 * replaced from the admin form is credited — or stops being — without a deploy.
 */
export default async function CreditsPage() {
  await connection();
  const rows = await photoCredits();

  const byLot = new Map<string, CreditRow[]>();
  for (const row of rows) {
    byLot.set(row.lotId, [...(byLot.get(row.lotId) ?? []), row]);
  }

  return (
    <>
      <SiteHeader />

      <main id="main" className="gutter pt-14 pb-16 md:pt-20">
        <p className="eyebrow">{t.footer.groupLegal}</p>
        <h1 className="display text-ink mt-5 text-[clamp(2.25rem,8vw,4.5rem)]">
          {t.credits.title}
        </h1>
        <p className="text-ink-soft mt-6 max-w-2xl text-base leading-relaxed">
          {t.credits.lede}
        </p>

        {byLot.size === 0 ? (
          <p className="border-line text-muted mt-12 border-t pt-6 text-sm">
            {t.credits.empty}
          </p>
        ) : (
          <ul className="mt-12 flex max-w-3xl flex-col">
            {[...byLot.values()].map((images) => (
              <li key={images[0]!.lotId} className="border-line border-t py-6">
                <Link
                  href={`/auction/${encodeURIComponent(images[0]!.lotId)}`}
                  className="hover:text-accent transition-colors"
                >
                  <span data-numerals className="text-muted">
                    {images[0]!.code}
                  </span>{" "}
                  <span className="text-ink">{images[0]!.title}</span>
                </Link>
                <ul className="mt-4 flex flex-col gap-3">
                  {images.map((image) => (
                    <li key={image.url} className="flex items-center gap-4">
                      <LotPlate
                        category="antique"
                        image={image.url}
                        alt={image.alt || images[0]!.title}
                        ratio="aspect-square"
                        sizes="64px"
                        className="w-16 shrink-0"
                      />
                      <p className="text-ink-soft min-w-0 text-sm leading-relaxed">
                        {image.alt && (
                          <span className="text-muted">{image.alt} · </span>
                        )}
                        {image.credit}
                      </p>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </main>

      <Footer />
    </>
  );
}
