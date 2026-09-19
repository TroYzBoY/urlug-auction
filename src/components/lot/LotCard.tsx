import Link from "next/link";
import { ViewTransition } from "react";
import { LotPlate } from "./LotPlate";
import { t } from "@/lib/copy";
import { lotDate, pts, ptsToMnt } from "@/lib/format";
import { coverOf, type Lot, type LotStatus } from "@/lib/types";

export function LiveDot() {
  return (
    <span aria-hidden className="relative grid size-2 place-items-center">
      <span className="bg-rust animate-ring-out absolute size-2 rounded-full" />
      <span className="bg-rust size-2 rounded-full" />
    </span>
  );
}

const STATUS: Record<LotStatus, { label: string; tone: string }> = {
  live: { label: t.room.live, tone: "text-rust font-semibold" },
  upcoming: { label: t.home.upcoming, tone: "text-ink-soft" },
  /* Closed, but with no result yet — the house has still to name a winner. */
  review: { label: t.lot.statusReview, tone: "text-flare font-medium" },
  sold: { label: t.lot.statusSold, tone: "text-olive font-medium" },
  unsold: { label: t.lot.statusUnsold, tone: "text-faint" },
};

export function LotCard({ lot }: { lot: Lot }) {
  const isLive = lot.status === "live";
  const isSold = lot.status === "sold";
  const status = STATUS[lot.status];

  /*
   * No hover lift and no plate zoom.
   *
   * The card used to rise 3px on a spring and the photograph inside it scaled
   * to 1.02 over 700ms. Two objections, and the second is the real one:
   *
   *   1. Neither exists on touch, which is most of this audience. A grid whose
   *      only affordance is a hover state has no affordance on a phone.
   *   2. A catalogue of twelve cards that each lift and zoom is a grid that
   *      will not hold still while you read it.
   *
   * The title still changes colour on hover, which is the affordance that
   * matters: it says the whole card is a link.
   */
  return (
    <article className="auction-card">
      <Link
        href={`/auction/${lot.id}`}
        className="group block text-left focus-visible:outline-offset-4"
      >
        <div className="auction-card-image bg-surface relative overflow-hidden">
          <ViewTransition name={`lot-${lot.id}`} share="morph" default="none">
            <LotPlate
              category={lot.category}
              code={lot.code}
              image={coverOf(lot)?.url}
              alt={coverOf(lot)?.alt ?? lot.title}
              ratio="aspect-[4/3]"
            />
          </ViewTransition>

          {/* Tighter type and tracking at two-up. "Хүлээгдэж байна" is 15
              characters, and at the eyebrow's full 0.18em tracking it stretched
              across most of a 169px card. At 8px/0.08em it sits at ~105px —
              still legible, no longer competing with the photograph. */}
          <div
            data-live={isLive}
            className="auction-status bg-ground/95 absolute top-2 right-2 flex items-center gap-1 border px-1.5 py-1.5 backdrop-blur-sm sm:top-2.5 sm:right-2.5 sm:gap-1.5 sm:px-2"
          >
            {isLive && <LiveDot />}
            <span
              className={`eyebrow text-[0.5rem] tracking-[0.08em] sm:text-[0.625rem] sm:tracking-[0.18em] ${status.tone}`}
            >
              {status.label}
            </span>
          </div>
        </div>

        <div className="auction-card-details">
          <div className="flex items-center justify-between gap-2">
            <p className="lot-code">{lot.code}</p>
            <span
              className="text-muted group-hover:text-accent text-base"
              aria-hidden
            >
              ↗
            </span>
          </div>
          <h3 className="text-ink group-hover:text-accent mt-3 min-h-10 font-sans text-sm leading-5 font-semibold tracking-[-0.02em] transition-colors duration-300 sm:text-base">
            {lot.title}
          </h3>
          <p className="text-muted mt-1 text-xs">
            {lot.maker} · {lot.year}
          </p>

          {/* Stacked at two-up, where a ~170px card cannot hold the estimate
              and the date on one line, then side by side once there is room. */}
          <dl className="border-line/30 mt-3.5 flex flex-col gap-2 border-t pt-2.5 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
            {isSold ? (
              <>
                <div>
                  <dt className="eyebrow">{t.lot.hammer}</dt>
                  <dd
                    data-numerals
                    className="text-olive mt-1 text-xs font-semibold"
                  >
                    {pts(lot.hammerPts ?? 0)}
                    <span className="text-muted ml-1 text-xs font-normal">
                      {t.common.point}
                    </span>
                  </dd>
                </div>
                <div className="sm:text-right">
                  <dt className="eyebrow">{t.lot.hammerRound}</dt>
                  <dd
                    data-numerals
                    className="text-ink-soft mt-1 text-xs font-medium"
                  >
                    {lot.hammerRound} / 6
                  </dd>
                </div>
              </>
            ) : (
              <>
                <div>
                  <dt className="eyebrow">{t.lot.estimate}</dt>
                  <dd
                    data-numerals
                    className="text-ink-soft mt-1 text-xs font-medium"
                  >
                    {pts(lot.estimateLowPts)} – {pts(lot.estimateHighPts)}
                    <span className="text-muted ml-1 text-xs">
                      {t.common.point}
                    </span>
                  </dd>
                </div>
                <div className="sm:text-right">
                  <dt className="eyebrow">
                    {isLive ? t.lot.opening : t.lot.startsAt}
                  </dt>
                  <dd
                    data-numerals
                    className="text-ink-soft mt-1 text-xs font-medium"
                  >
                    {isLive ? ptsToMnt(lot.openingPts) : lotDate(lot.startsAt)}
                  </dd>
                </div>
              </>
            )}
          </dl>
        </div>
      </Link>
    </article>
  );
}
