import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";
import { t } from "@/lib/copy";
import { TERMS_VERSION } from "@/lib/legal";

export const metadata: Metadata = {
  title: t.terms.title,
  description: t.terms.lede,
};

/**
 * ⚠ Intentionally EMPTY.
 *
 * The previous text contradicted the code — it promised that the bid clock
 * reaching zero hammers the lot to the last bidder, when in fact a quiet round
 * only moves the sale up a gear and an admin names the winner from `review`.
 * The owner removed it and will write the terms by hand to match the code.
 *
 * Until then this project has NO terms. Do not regenerate or fill in this text;
 * see HANDOFF.md. When the owner's text arrives, bump TERMS_VERSION in
 * src/lib/legal.ts so consent rows record which text a bidder accepted.
 */
const SECTIONS: LegalSection[] = [];

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow={t.terms.eyebrow}
      title={t.terms.title}
      lede={t.terms.lede}
      version={TERMS_VERSION}
      sections={SECTIONS}
    />
  );
}
