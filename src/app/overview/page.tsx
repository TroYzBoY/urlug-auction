import Link from "next/link";
import { Footer } from "@/components/site/Footer";
import { SiteHeader } from "@/components/site/SiteHeader";
import { EnterRoomButton } from "@/components/site/EnterRoomButton";
import { LineReveal } from "@/components/site/LineReveal";
import { LiveTicker } from "@/components/site/LiveTicker";
import { Reveal } from "@/components/site/Reveal";
import { RoundLadder } from "@/components/site/RoundLadder";
import { LotIndex } from "@/components/lot/LotIndex";
import { LotPlate } from "@/components/lot/LotPlate";
import {
  getLiveLot,
  getLiveLots,
  getResultLots,
  getUpcomingLots,
} from "@/lib/api";
import { POINT_MNT, ROUNDS, TOTAL_ROUNDS } from "@/lib/auction";
import { bidClockLabel, groupNumber, pts, ptsToMnt } from "@/lib/format";
import { t } from "@/lib/copy";

/**
 * The catalogue overview — what used to be the home page.
 *
 * `/` is now the Descent, a purely cinematic front door, so everything that
 * actually *does* something on arrival lives here: the live lot, the round
 * ladder, the index and the results. Moved rather than rewritten — this page
 * was working, and the landing does not replace what it does.
 */
export const metadata = { title: t.nav.overview };

export default async function OverviewPage() {
  const [live, liveLots, upcoming, results] = await Promise.all([
    getLiveLot(),
    getLiveLots(),
    getUpcomingLots(),
    getResultLots(),
  ]);
  const lastRound = ROUNDS[ROUNDS.length - 1];
  const indexLots = [...liveLots, ...upcoming, ...results];

  return (
    <>
      <SiteHeader />

      <main>
        {/* ══ 01 · OPENING FRAME ═══════════════════════════════════════════
         * A full-viewport title card. Three bands — slate, title, footer —
         * pinned to the top, middle and bottom edges, so the frame reads as
         * composed rather than as content that happens to start here.
         *
         * `overflow-x-clip` is load-bearing: the glow is wider than a phone
         * screen, and an unclipped decorative element widens the document,
         * which drags the %-sized fixed header off the edge with it.
         */}
        <section className="relative isolate flex min-h-[100svh] flex-col justify-between overflow-x-clip pt-24 pb-7 md:pt-28">
          <div
            aria-hidden
            className="animate-aura pointer-events-none absolute -top-40 -left-24 -z-10 size-[24rem] rounded-full blur-3xl md:size-[42rem]"
            style={{
              background:
                "radial-gradient(circle, color-mix(in oklab, var(--color-accent) 26%, transparent) 0%, transparent 68%)",
            }}
          />

          {/* ── Slate ──────────────────────────────────────────────────── */}
          <div className="gutter">
            <div className="grid animate-rise-in grid-cols-2 gap-y-3 border-b border-line pb-4 md:grid-cols-4">
              <SlateCell index="01" value={t.brand.name} />
              <SlateCell index="02" value={t.home.slatePlace} />
              <SlateCell index="03" value={t.home.slateEdition} />
              <SlateCell index="04" value={t.home.slateYear} numerals />
            </div>
          </div>

          {/* ── Title ──────────────────────────────────────────────────── */}
          <div className="gutter py-14 md:py-20">
            <LineReveal
              lines={[
                t.home.headline[0],
                <span key="2" className="text-accent">
                  {t.home.headline[1]}
                </span>,
              ]}
              delay={0.15}
              className="display text-[clamp(3.25rem,14vw,11rem)] leading-[0.86] tracking-[-0.045em] text-ink"
            />

            <div className="mt-10 grid gap-8 md:grid-cols-12 md:gap-6">
              <div className="md:col-span-5 md:col-start-1">
                <p
                  className="animate-rise-in text-base leading-relaxed text-ink-soft"
                  style={{ animationDelay: "520ms" }}
                >
                  {t.home.lede}
                </p>
              </div>

              <div
                className="flex animate-rise-in flex-wrap items-center gap-3 md:col-span-6 md:col-start-7"
                style={{ animationDelay: "620ms" }}
              >
                <EnterRoomButton
                  href="/lots"
                  label={t.home.ctaBrowse}
                  liveCount={liveLots.length}
                  countLabel={t.home.liveCount(liveLots.length)}
                />
                <Link
                  href="/rules"
                  className="flex h-11 items-center rounded-full border border-line-strong/30 px-5 text-[0.75rem] font-medium tracking-[0.14em] text-ink uppercase transition-colors hover:border-accent hover:text-accent"
                >
                  {t.home.ctaSecondary}
                </Link>
              </div>
            </div>
          </div>

          {/* ── Frame footer ───────────────────────────────────────────── */}
          <div className="gutter">
            <div
              className="animate-rise-in border-t border-line pt-4"
              style={{ animationDelay: "720ms" }}
            >
              <LiveTicker
                lots={liveLots.map((l) => ({
                  id: l.id,
                  code: l.code,
                  title: l.title,
                  startPts: l.openingPts,
                }))}
              />
              <p
                aria-hidden
                className="eyebrow mt-4 flex items-center gap-2 text-faint"
              >
                <span className="h-px w-8 bg-line-strong/40" />
                {t.home.scrollCue}
              </p>
            </div>
          </div>
        </section>

        {/* ══ 02 · FEATURED LOT ════════════════════════════════════════════
         * Letterboxed on desktop. The wide crop is the cinematic move: it
         * frames the object as a shot rather than as a product photo.
         */}
        {/*
          `live` is null between sales. The mock catalogue always had a lot to
          show, so this section could assume one; a real house cannot. An empty
          frame with a line of copy is the honest render — the alternative is a
          hero linking to /auction/undefined.
        */}
        <Reveal as="section" className="gutter border-t border-line py-16 md:py-24" y={24}>
          <SectionHead index="02" label={t.home.liveNowPlural} accent />

          {!live ? (
            <p className="mt-8 max-w-prose text-sm leading-relaxed text-muted">
              {t.home.houseClosed}
            </p>
          ) : (
          <Link href={`/auction/${live.id}`} className="group mt-8 block">
            <div className="overflow-hidden">
              <LotPlate
                category={live.category}
                image={live.image}
                alt={live.title}
                dither
                ditherRes={520}
                ratio="aspect-[4/5] sm:aspect-[16/9] lg:aspect-[21/9]"
                className="transition-transform duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03]"
              />
            </div>

            <div className="mt-6 grid gap-6 md:grid-cols-12">
              <div className="md:col-span-7">
                <p className="eyebrow">{live.code}</p>
                <h2 className="display mt-2.5 text-[clamp(2rem,5.5vw,4rem)] leading-[0.95] tracking-[-0.035em] text-ink transition-colors group-hover:text-accent">
                  {live.title}
                </h2>
                <p className="mt-2 text-sm text-muted">
                  {live.maker} · {live.year}
                </p>
              </div>

              <dl className="grid grid-cols-2 gap-6 self-end md:col-span-5">
                <Figure label={t.lot.estimate}>
                  {pts(live.estimateLowPts)}–{pts(live.estimateHighPts)}
                </Figure>
                <Figure label={t.lot.opening}>
                  {ptsToMnt(live.openingPts)}
                </Figure>
              </dl>
            </div>
          </Link>
          )}
        </Reveal>

        {/* ══ 03 · INDEX ═══════════════════════════════════════════════════ */}
        <Reveal
          as="section"
          id="lots"
          className="gutter scroll-mt-24 border-t border-line py-16 md:py-24"
          y={24}
        >
          <SectionHead index="03" label={t.home.indexEyebrow} />
          <h2 className="display mt-4 text-[clamp(2rem,6vw,4rem)] leading-[0.95] tracking-[-0.035em] text-ink">
            {t.home.indexTitle}
          </h2>

          <div className="mt-10">
            <LotIndex lots={indexLots} />
          </div>

          <Link
            href="/lots"
            className="eyebrow mt-10 inline-flex items-center gap-2 border-b border-accent/60 pb-1 text-accent transition-opacity hover:opacity-70"
          >
            {t.home.allLots}
            <span aria-hidden>→</span>
          </Link>
        </Reveal>

        {/* ══ 04 · FORMAT ══════════════════════════════════════════════════ */}
        <Reveal as="section" className="gutter border-t border-line py-16 md:py-24" y={24}>
          <SectionHead index="04" label={t.home.howItWorks} />

          <div className="mt-8 grid gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <h2 className="display text-[clamp(2rem,5.5vw,3.5rem)] leading-[0.95] tracking-[-0.035em] text-ink">
                5 минутаас
                <br />
                <span className="text-rust">5 секунд</span> хүртэл
              </h2>
              <p className="mt-5 max-w-sm text-sm leading-relaxed text-ink-soft">
                {t.rules.lede}
              </p>

              <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-line pt-6">
                <Figure label={t.home.statRounds} big>
                  {String(TOTAL_ROUNDS)}
                </Figure>
                <Figure label={t.home.statDuration} big>
                  2:45
                </Figure>
                <Figure label={t.home.statPoint} big>
                  {groupNumber(POINT_MNT)}₮
                </Figure>
                <Figure label={t.home.statFinal} big accent>
                  {bidClockLabel(lastRound.bidClockSec)}
                </Figure>
              </dl>
            </div>

            <div className="lg:col-span-7">
              <RoundLadder />
            </div>
          </div>
        </Reveal>
      </main>

      <Footer />
    </>
  );
}

/** One cell of the opening slate: a Swiss index number over its value. */
function SlateCell({
  index,
  value,
  numerals = false,
}: {
  index: string;
  value: string;
  numerals?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span aria-hidden data-numerals className="eyebrow text-faint">
        {index}
      </span>
      <span
        {...(numerals ? { "data-numerals": true } : {})}
        className="text-[0.6875rem] font-semibold tracking-[0.14em] text-ink-soft uppercase"
      >
        {value}
      </span>
    </div>
  );
}

/** Numbered section marker — the running order of the page, made visible. */
function SectionHead({
  index,
  label,
  accent = false,
}: {
  index: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden data-numerals className="eyebrow text-faint">
        {index}
      </span>
      <span aria-hidden className="h-px w-6 bg-line-strong/40" />
      {accent && <span aria-hidden className="size-1.5 rounded-full bg-rust" />}
      <p className={`eyebrow ${accent ? "text-rust" : "text-muted"}`}>{label}</p>
    </div>
  );
}

function Figure({
  label,
  children,
  big = false,
  accent = false,
}: {
  label: string;
  children: React.ReactNode;
  big?: boolean;
  accent?: boolean;
}) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd
        data-numerals
        className={`display mt-2 ${
          big
            ? "text-[clamp(1.75rem,5vw,2.5rem)]"
            : "text-[clamp(1.125rem,3vw,1.5rem)]"
        } ${accent ? "text-rust" : "text-ink"}`}
      >
        {children}
      </dd>
    </div>
  );
}
