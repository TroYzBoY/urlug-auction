import Link from "next/link";
import { ViewTransition } from "react";
import { LotPlate } from "./LotPlate";
import { BidClockBar, LivePrice, StartsIn } from "./CardLive";
import { CardWatch } from "./CardWatch";
import { QuickView } from "./QuickView";
import { t } from "@/lib/copy";
import { lotDate, pts } from "@/lib/format";
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

export function LotCard({
  lot,
  watching,
}: {
  lot: Lot;
  /** Whether the viewer follows this lot; null when signed out. Leave it out
      and the card has no heart. */
  watching?: boolean | null;
}) {
  const isLive = lot.status === "live";
  const isSold = lot.status === "sold";
  const status = STATUS[lot.status];

  /*
   * The card holds still under the mouse: no lean and no zoom, so the grid
   * reads as a grid. The title's colour change is the affordance that says the
   * whole card is a link.
   */
  return (
    <article className="auction-card relative">
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
          {isLive && <BidClockBar lotId={lot.id} />}

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
                  {isLive ? (
                    <>
                      <dt className="eyebrow">{t.room.currentPrice}</dt>
                      <dd
                        data-numerals
                        className="text-signal mt-1 text-xs font-semibold"
                      >
                        <LivePrice
                          lotId={lot.id}
                          initialPts={lot.currentPts ?? lot.openingPts}
                        />
                        <span className="text-muted ml-1 text-xs font-normal">
                          {t.common.point}
                        </span>
                      </dd>
                    </>
                  ) : lot.status === "upcoming" ? (
                    <StartsIn
                      at={lot.startsAt}
                      fallback={lotDate(lot.startsAt)}
                    />
                  ) : (
                    <>
                      <dt className="eyebrow">{t.lot.startsAt}</dt>
                      <dd
                        data-numerals
                        className="text-ink-soft mt-1 text-xs font-medium"
                      >
                        {lotDate(lot.startsAt)}
                      </dd>
                    </>
                  )}
                </div>
              </>
            )}
          </dl>
        </div>
      </Link>

      {/* Outside the link: a button inside an <a> is invalid, and a press on
          either must not open the lot. Over the photograph's top-left corner;
          the status badge has the other one. */}
      <div className="card-actions">
        {watching !== undefined && (
          <CardWatch lotId={lot.id} watching={watching} />
        )}
        <QuickView lot={lot} />
      </div>
    </article>
  );
}
