import Link from "next/link";
import { LotPlate } from "./LotPlate";
import { LiveDot } from "./LotCard";
import { POINT_MNT, TOTAL_MINUTES, TOTAL_ROUNDS } from "@/lib/auction";
import { groupNumber, pts } from "@/lib/format";
import { t } from "@/lib/copy";
import { coverOf, type Lot, type LotStatus } from "@/lib/types";

const STATUS: Record<LotStatus, string> = {
  live: t.room.live,
  upcoming: t.home.upcoming,
  review: t.lot.statusReview,
  sold: t.lot.statusSold,
  unsold: t.lot.statusUnsold,
};

export function CatalogueHero({ lot }: { lot: Lot | null }) {
  return (
    <section
      className="catalogue-hero gutter"
      aria-labelledby="catalogue-title"
    >
      <div className="catalogue-hero-grid">
        <div className="catalogue-intro">
          <p className="catalogue-label eyebrow">{t.brand.tagline}</p>
          <h1 id="catalogue-title" className="catalogue-heading">
            {t.lots.heroTitle[0]}
            <span>{t.lots.heroTitle[1]}</span>
          </h1>
          <p className="text-muted mt-6 max-w-md text-sm leading-7 md:text-base">
            {t.lots.heroLede}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="#catalogue" className="house-primary">
              {t.home.ctaBrowse}
              <span aria-hidden>↗</span>
            </a>
            <Link href="/rules" className="house-secondary">
              {t.home.ctaSecondary}
              <span aria-hidden>→</span>
            </Link>
          </div>
          <p className="hero-footnote">
            <span aria-hidden className="hero-footnote-mark">
              U
            </span>
            <span>
              {t.brand.name}
              <span className="text-faint mx-2">/</span>
              {t.home.slatePlace}
            </span>
          </p>
        </div>

        <div className="catalogue-stage">
          <div className="stage-orbit stage-orbit-outer" aria-hidden />
          <div className="stage-orbit stage-orbit-inner" aria-hidden />
          <span className="stage-coordinate" aria-hidden>
            URLUG — SELECT / 01
          </span>
          {lot ? (
            <Link href={`/auction/${lot.id}`} className="featured-lot group">
              <div className="featured-lot-top">
                <span className="eyebrow text-electric">{t.lots.featured}</span>
                <span className="featured-lot-status">
                  {lot.status === "live" && <LiveDot />}
                  {STATUS[lot.status]}
                </span>
              </div>
              <LotPlate
                category={lot.category}
                image={coverOf(lot)?.url}
                alt={coverOf(lot)?.alt ?? lot.title}
                ratio="aspect-[5/4]"
                sizes="(max-width: 479px) 76vw, (max-width: 1023px) 340px, 370px"
                priority
                className="featured-lot-image"
              />
              <div className="featured-lot-info">
                <div className="min-w-0">
                  <p className="eyebrow text-muted">{lot.code}</p>
                  <h2 className="text-ink group-hover:text-accent mt-2 truncate text-lg font-semibold">
                    {lot.title}
                  </h2>
                  <p className="text-muted mt-1 text-xs">
                    {lot.maker} · {lot.year}
                  </p>
                </div>
                <span className="featured-lot-arrow" aria-hidden>
                  ↗
                </span>
              </div>
              <dl className="featured-price">
                <dt className="eyebrow text-[0.625rem]">
                  {lot.status === "sold" ? t.lot.hammer : t.lot.estimate}
                </dt>
                <dd
                  className="text-signal mt-1.5 text-sm font-semibold"
                  data-numerals
                >
                  {lot.status === "sold"
                    ? pts(lot.hammerPts ?? 0)
                    : `${pts(lot.estimateLowPts)} – ${pts(lot.estimateHighPts)}`}
                  <span className="text-muted ml-1.5 text-xs font-normal">
                    {t.common.point}
                  </span>
                </dd>
              </dl>
            </Link>
          ) : (
            <div className="stage-empty" aria-hidden>
              <span>U</span>
            </div>
          )}
          <span className="stage-caption" aria-hidden>
            THE NEXT FIND IS YOURS.
          </span>
        </div>
      </div>

      <dl className="catalogue-facts">
        <div>
          <dt>{t.home.statRounds}</dt>
          <dd data-numerals>
            {String(TOTAL_ROUNDS).padStart(2, "0")}
            <span>{t.common.roundWord}</span>
          </dd>
        </div>
        <div>
          <dt>{t.home.statDuration}</dt>
          <dd data-numerals>
            {String(Math.floor(TOTAL_MINUTES / 60)).padStart(2, "0")}:
            {String(TOTAL_MINUTES % 60).padStart(2, "0")}
            <span>цаг</span>
          </dd>
        </div>
        <div>
          <dt>{t.home.statPoint}</dt>
          <dd data-numerals>
            {groupNumber(POINT_MNT)}
            <span>₮</span>
          </dd>
        </div>
      </dl>
    </section>
  );
}
