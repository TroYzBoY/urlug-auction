import type { Metadata } from "next";
import { ContactForm } from "@/components/contact/ContactForm";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { Reveal } from "@/components/site/Reveal";
import { t } from "@/lib/copy";

export const metadata: Metadata = {
  title: t.nav.contact,
  description: t.contact.lede,
};

/** Hero lines animate in sequence rather than all at once. */
const BEAT = 90;

export default function ContactPage() {
  return (
    <>
      <Header />

      {/* pt-28 clears the fixed pill header, matching the other pages. */}
      <main className="pt-28 md:pt-36">
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="gutter border-b border-line/40 pb-14 md:pb-20">
          <p className="eyebrow animate-rise-in text-muted">
            {t.contact.eyebrow}
          </p>

          <h1
            className="display mt-6 max-w-4xl animate-rise-in text-[clamp(2.5rem,7vw,5.5rem)] leading-[0.96] tracking-[-0.035em] text-ink"
            style={{ animationDelay: `${BEAT}ms` }}
          >
            {t.contact.headline[0]}
            <br />
            <span className="font-normal text-accent">
              {t.contact.headline[1]}
            </span>
          </h1>

          <p
            className="mt-8 max-w-xl animate-rise-in text-base leading-relaxed text-ink-soft md:text-lg"
            style={{ animationDelay: `${BEAT * 2}ms` }}
          >
            {t.contact.lede}
          </p>
        </section>

        {/* ── Details + form ────────────────────────────────────────────── */}
        <Reveal as="section" className="gutter py-14 md:py-20" y={20}>
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
            {/* Details first in source order: someone who just wants the phone
                number should not have to pass a form to reach it. */}
            <div className="lg:col-span-5">
              <p className="eyebrow text-muted">{t.contact.detailsTitle}</p>

              <dl className="mt-6 flex flex-col gap-6">
                <Detail label={t.contact.addressLabel}>
                  {t.contact.address}
                </Detail>

                <Detail label={t.contact.phoneLabel}>
                  <a
                    href={`tel:${t.contact.phone.replace(/\s/g, "")}`}
                    className="transition-colors hover:text-accent"
                  >
                    {t.contact.phone}
                  </a>
                </Detail>

                <Detail label={t.contact.emailLabel}>
                  <a
                    href={`mailto:${t.contact.email}`}
                    className="transition-colors hover:text-accent"
                  >
                    {t.contact.email}
                  </a>
                </Detail>

                <Detail label={t.contact.hoursLabel}>{t.contact.hours}</Detail>
              </dl>
            </div>

            <div className="lg:col-span-7">
              <p className="eyebrow text-muted">{t.contact.formTitle}</p>
              <div className="mt-6">
                <ContactForm />
              </div>
            </div>
          </div>
        </Reveal>
      </main>

      <Footer />
    </>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-line/40 pt-4">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-2 text-base leading-relaxed text-ink">{children}</dd>
    </div>
  );
}
