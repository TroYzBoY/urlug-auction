import Link from "next/link";
import { ViewTransition } from "react";
import { Footer } from "@/components/site/Footer";
import { WatchButton } from "./WatchButton";
import { SiteHeader } from "@/components/site/SiteHeader";
import { LotGallery } from "./LotGallery";
import { bidClockLabel, lotDate, pts, ptsToMnt } from "@/lib/format";
import { ROUNDS, TOTAL_ROUNDS } from "@/lib/auction";
import { t } from "@/lib/copy";
import type { Lot } from "@/lib/types";

/**
 * A lot that is not live: either waiting for its session, or already through
 * the room. Same route as the live bidding screen — the room is the live
 * branch, this is the other two — so a bidder can bookmark one URL per lot and
 * it becomes the bidding screen when the session opens, then the result page
 * afterwards.
 */
/**
 * @param watching  null when signed out — the follow button is then hidden
 *                  rather than shown disabled, because a control that cannot
 *                  do anything is worse than one that is not there.
 */
export function LotPreview({
  lot,
  watching = null,
}: {
  lot: Lot;
  watching?: boolean | null;
}) {
  const isSold = lot.status === "sold";
  const isUnsold = lot.status === "unsold";
  const isDone = isSold || isUnsold;

  /* Did it beat the estimate? The single most interesting fact about a result. */
  const overEstimate =
    isSold && (lot.hammerPts ?? 0) > lot.estimateHighPts
      ? t.lot.aboveEstimate
      : isSold && (lot.hammerPts ?? 0) < lot.estimateLowPts
        ? t.lot.belowEstimate
        : null;

  return (
    <>
      <SiteHeader />

      <main id="main" className="gutter pt-10 pb-16 md:pt-16">
        <Link href="/lots" className="eyebrow transition-colors hover:text-ink">
          ← {t.home.allLots}
        </Link>

        <div className="mt-8 grid items-start gap-8 md:mt-12 md:grid-cols-2 md:gap-14">
          {/* Receives the morph from the catalogue card's plate. The gallery's
              main view is the element that morphs; the thumbnails are new. */}
          <ViewTransition name={`lot-${lot.id}`} share="morph" default="none">
            <LotGallery
              images={lot.images}
              category={lot.category}
              code={lot.code}
              title={lot.title}
            />
          </ViewTransition>

          <div>
            <p className="eyebrow">
              {lot.code}
              <span aria-hidden className="mx-2 text-line-strong">
                /
              </span>
              <span
                className={
                  isSold ? "text-olive" : isUnsold ? "text-faint" : undefined
                }
              >
                {isSold
                  ? t.lot.statusSold
                  : isUnsold
                    ? t.lot.statusUnsold
                    : t.home.upcoming}
              </span>
            </p>

            <h1 className="display mt-3 text-[clamp(2rem,7vw,3.5rem)] text-ink">
              {lot.title}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {lot.maker} · {lot.year}
            </p>

            {/* ── The headline fact, which differs by status ──────────────── */}
            <div className="mt-7 border-y border-line py-5">
              {isSold ? (
                <>
                  <p className="eyebrow">{t.lot.hammer}</p>
                  <p
                    data-numerals
                    className="display mt-2 text-[clamp(2.25rem,8vw,3rem)] text-olive"
                  >
                    {pts(lot.hammerPts ?? 0)}
                    <span className="ml-2 align-baseline text-base font-normal tracking-normal text-muted">
                      {t.common.point}
                    </span>
                  </p>
                  <p data-numerals className="mt-1 text-sm text-muted">
                    {ptsToMnt(lot.hammerPts ?? 0)}
                    {overEstimate && (
                      <span className="ml-2 text-flare">· {overEstimate}</span>
                    )}
                  </p>
                </>
              ) : isUnsold ? (
                <>
                  <p className="eyebrow">{t.lot.result}</p>
                  <p className="mt-2 text-2xl text-ink">
                    {t.lot.statusUnsold}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    Хаялт үнэлгээний доод хязгаарт хүрсэнгүй.
                  </p>
                </>
              ) : (
                <>
                  <p className="eyebrow">{t.lot.startsAt}</p>
                  <p data-numerals className="mt-2 text-2xl text-ink">
                    {lotDate(lot.startsAt)}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    {TOTAL_ROUNDS} тойрог · 2 цаг 45 минут · хаялтын хугацаа{" "}
                    {bidClockLabel(ROUNDS[0].bidClockSec)} →{" "}
                    {bidClockLabel(ROUNDS[ROUNDS.length - 1].bidClockSec)}
                  </p>
                </>
              )}
            </div>

            <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-6">
              <Fact label={t.lot.estimate}>
                <span data-numerals>
                  {pts(lot.estimateLowPts)} – {pts(lot.estimateHighPts)}{" "}
                  {t.common.point}
                </span>
              </Fact>

              {isDone ? (
                <Fact label={t.lot.bidCount}>
                  <span data-numerals>{lot.bidCount ?? 0}</span>
                </Fact>
              ) : (
                <Fact label={t.lot.opening}>
                  <span data-numerals>{ptsToMnt(lot.openingPts)}</span>
                </Fact>
              )}

              {isSold && lot.hammerRound && (
                <Fact label={t.lot.hammerRound}>
                  <span data-numerals>
                    {lot.hammerRound} / {TOTAL_ROUNDS} ·{" "}
                    {bidClockLabel(ROUNDS[lot.hammerRound - 1].bidClockSec)}
                  </span>
                </Fact>
              )}

              <Fact label={t.lot.dimensions}>{lot.dimensions}</Fact>
              <Fact label={t.lot.condition}>{lot.condition}</Fact>
              <Fact label={t.lot.provenance} span>
                {lot.provenance}
              </Fact>
              <Fact label={t.lot.note} span>
                {lot.note}
              </Fact>
            </dl>

            {!isDone && (
              <div className="mt-9 flex flex-wrap items-center gap-3">
                {/*
                  A link, not a button. It used to be a `<button>` with no
                  handler — it looked like the primary action and did nothing.
                */}
                <Link
                  href="/register"
                  className="flex h-13 items-center bg-accent px-6 text-[0.8125rem] font-bold tracking-[0.14em] text-accent-ink uppercase transition-[transform,opacity] duration-150 active:scale-[0.99]"
                >
                  {t.nav.register}
                </Link>
                <Link
                  href="/rules"
                  className="flex h-13 items-center border border-line-strong px-6 text-[0.8125rem] font-bold tracking-[0.14em] text-ink uppercase transition-colors hover:border-accent hover:text-accent"
                >
                  {t.nav.rules}
                </Link>
                {watching !== null && (
                  <WatchButton lotId={lot.id} watching={watching} />
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}

function Fact({
  label,
  children,
  span = false,
}: {
  label: string;
  children: React.ReactNode;
  span?: boolean;
}) {
  return (
    <div className={span ? "col-span-2" : ""}>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1.5 text-sm leading-relaxed text-ink-soft">{children}</dd>
    </div>
  );
}
