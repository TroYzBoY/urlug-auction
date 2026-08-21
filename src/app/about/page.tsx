import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { Reveal } from "@/components/site/Reveal";
import { POINT_MNT, ROUNDS, TOTAL_ROUNDS } from "@/lib/auction";
import { bidClockLabel, groupNumber } from "@/lib/format";
import { t } from "@/lib/copy";

export const metadata: Metadata = {
  title: t.nav.about,
  description: t.about.lede,
};

/** Hero lines animate in sequence rather than all at once. */
const BEAT = 90;

export default function AboutPage() {
  const firstRound = ROUNDS[0];
  const lastRound = ROUNDS[ROUNDS.length - 1];

  return (
    <>
      <Header />

      {/* pt-28 clears the fixed pill header, matching the home page. */}
      <main className="pt-28 md:pt-36">
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="gutter border-b border-line/40 pb-16 md:pb-24">
          <p className="eyebrow animate-rise-in text-muted">
            {t.about.eyebrow}
          </p>

          <h1
            className="display mt-6 max-w-4xl animate-rise-in text-[clamp(2.5rem,7vw,5.5rem)] leading-[0.96] tracking-[-0.035em] text-ink"
            style={{ animationDelay: `${BEAT}ms` }}
          >
            {t.about.headline[0]}
            <br />
            <span className="font-normal text-accent">
              {t.about.headline[1]}
            </span>
          </h1>

          <p
            className="mt-8 max-w-xl animate-rise-in text-base leading-relaxed text-ink-soft md:text-lg"
            style={{ animationDelay: `${BEAT * 2}ms` }}
          >
            {t.about.lede}
          </p>
        </section>

        {/* ── Why six rounds ────────────────────────────────────────────── */}
        <Reveal
          as="section"
          className="gutter border-b border-line/40 py-16 md:py-24"
          y={20}
        >
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <p className="eyebrow text-muted">{t.home.howItWorks}</p>
              <h2 className="display mt-3 text-[clamp(1.875rem,4vw,2.75rem)] leading-tight tracking-[-0.03em] text-ink">
                {t.about.storyTitle}
              </h2>
            </div>

            <div className="lg:col-span-7">
              <p className="max-w-xl text-base leading-relaxed text-ink-soft">
                {t.about.storyBody}
              </p>

              {/* The format's whole argument in one line of numbers. */}
              <dl className="mt-10 flex flex-wrap gap-x-12 gap-y-6 border-t border-line/40 pt-6">
                <Stat
                  value={bidClockLabel(firstRound.bidClockSec)}
                  label={`1-р ${t.common.roundWord}`}
                />
                <Stat
                  value={bidClockLabel(lastRound.bidClockSec)}
                  label={`${TOTAL_ROUNDS}-р ${t.common.roundWord}`}
                  accent
                />
                <Stat value="2:45" label={t.home.statDuration} />
              </dl>

              <Link
                href="/rules"
                className="eyebrow mt-8 inline-block border-b border-accent/60 pb-0.5 text-accent transition-opacity hover:opacity-75"
              >
                {t.home.ctaSecondary}
                <span aria-hidden className="ml-1.5">
                  →
                </span>
              </Link>
            </div>
          </div>
        </Reveal>

        {/* ── Principles ────────────────────────────────────────────────── */}
        <section className="gutter border-b border-line/40 py-16 md:py-24">
          <Reveal>
            <p className="eyebrow text-muted">{t.about.principlesTitle}</p>
          </Reveal>

          <div className="mt-10 grid gap-x-10 gap-y-12 md:grid-cols-3">
            {t.about.principles.map((p, i) => (
              <Reveal key={p.title} delay={i * 80} y={18}>
                <div className="border-t border-line-strong/30 pt-5">
                  {/* The index is decoration, not content — a screen reader
                      announcing "01" before each heading adds nothing. */}
                  <span
                    aria-hidden
                    data-numerals
                    className="eyebrow text-accent"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-3 text-xl leading-tight font-medium tracking-[-0.02em] text-ink">
                    {p.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                    {p.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── Numbers ───────────────────────────────────────────────────── */}
        <Reveal
          as="section"
          className="gutter border-b border-line/40 py-16 md:py-24"
          y={20}
        >
          <p className="eyebrow text-muted">{t.about.numbersTitle}</p>
          <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-4">
            <Stat value={String(TOTAL_ROUNDS)} label={t.home.statRounds} big />
            <Stat value="2:45" label={t.home.statDuration} big />
            <Stat
              value={groupNumber(POINT_MNT)}
              suffix="₮"
              label={t.home.statPoint}
              big
            />
            <Stat
              value={bidClockLabel(lastRound.bidClockSec)}
              label={t.home.statFinal}
              accent
              big
            />
          </dl>
        </Reveal>

        {/* ── Contact ───────────────────────────────────────────────────── */}
        <Reveal as="section" className="gutter py-16 md:py-24" y={20}>
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <p className="eyebrow text-muted">{t.about.contactTitle}</p>
              <h2 className="display mt-3 text-[clamp(1.875rem,4vw,2.75rem)] leading-tight tracking-[-0.03em] text-ink">
                {t.brand.name}
              </h2>
              <p className="mt-2 text-sm text-muted">{t.about.contactNote}</p>
            </div>

            <div className="lg:col-span-7">
              <p className="max-w-xl text-base leading-relaxed text-ink-soft">
                {t.about.contactBody}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/lots"
                  className="flex h-11 items-center rounded-full bg-ink px-6 text-[0.75rem] font-medium tracking-[0.14em] text-ground uppercase shadow-sm transition-colors hover:bg-accent hover:text-accent-ink"
                >
                  {t.nav.lots}
                  <span aria-hidden className="ml-1.5">
                    →
                  </span>
                </Link>
                <Link
                  href="/rules"
                  className="flex h-11 items-center rounded-full border border-line-strong/30 px-5 text-[0.75rem] font-medium tracking-[0.14em] text-ink uppercase transition-colors hover:border-accent hover:text-accent"
                >
                  {t.nav.rules}
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </main>

      <Footer />
    </>
  );
}

function Stat({
  value,
  label,
  suffix,
  accent = false,
  big = false,
}: {
  value: string;
  label: string;
  suffix?: string;
  accent?: boolean;
  big?: boolean;
}) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd
        data-numerals
        className={`display mt-2.5 ${
          big
            ? "text-[clamp(1.875rem,6vw,2.75rem)]"
            : "text-[clamp(1.5rem,4vw,2rem)]"
        } ${accent ? "text-rust" : "text-ink"}`}
      >
        {value}
        {/* Currency marks get their own tracking — the display setting's tight
            negative letter-spacing crowds ₮ against the final digit. */}
        {suffix && (
          <span className="ml-1 align-baseline text-[0.5em] font-normal tracking-normal text-muted">
            {suffix}
          </span>
        )}
      </dd>
    </div>
  );
}
