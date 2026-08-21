"use client";

import Link from "next/link";
import { ViewTransition } from "react";
import { motion } from "framer-motion";
import { LotPlate } from "./LotPlate";
import { t } from "@/lib/copy";
import { lotDate, pts, ptsToMnt } from "@/lib/format";
import type { Lot, LotStatus } from "@/lib/types";

export function LiveDot() {
  return (
    <span aria-hidden className="relative grid size-2 place-items-center">
      <span className="absolute size-2 rounded-full bg-rust animate-ring-out" />
      <span className="size-2 rounded-full bg-rust" />
    </span>
  );
}

const STATUS: Record<LotStatus, { label: string; tone: string }> = {
  live: { label: t.room.live, tone: "text-rust font-semibold" },
  upcoming: { label: t.home.upcoming, tone: "text-ink-soft" },
  sold: { label: t.lot.statusSold, tone: "text-olive font-medium" },
  unsold: { label: t.lot.statusUnsold, tone: "text-faint" },
};

export function LotCard({ lot }: { lot: Lot }) {
  const isLive = lot.status === "live";
  const isSold = lot.status === "sold";
  const status = STATUS[lot.status];

  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 350, damping: 25 }}
    >
      <Link
        href={`/auction/${lot.id}`}
        className="group block text-left focus-visible:outline-offset-4"
      >
        <div className="relative overflow-hidden border border-line/30 bg-surface/30 rounded-sm">
          <ViewTransition name={`lot-${lot.id}`} share="morph" default="none">
            <LotPlate
              category={lot.category}
              code={lot.code}
              image={lot.image}
              alt={lot.title}
              dither
              className="transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.02]"
            />
          </ViewTransition>

          {/* Tighter type and tracking at two-up. "Хүлээгдэж байна" is 15
              characters, and at the eyebrow's full 0.18em tracking it stretched
              across most of a 169px card. At 8px/0.08em it sits at ~105px —
              still legible, no longer competing with the photograph. */}
          <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full border border-line/30 bg-ground/90 px-1.5 py-1 backdrop-blur-sm sm:top-2.5 sm:right-2.5 sm:gap-1.5 sm:px-2">
            {isLive && <LiveDot />}
            <span
              className={`eyebrow text-[0.5rem] tracking-[0.08em] sm:text-[0.625rem] sm:tracking-[0.18em] ${status.tone}`}
            >
              {status.label}
            </span>
          </div>
        </div>

        <div className="pt-3.5">
          <p className="eyebrow text-muted">{lot.code}</p>
          <h3 className="mt-1.5 text-lg leading-tight font-normal tracking-[-0.02em] text-ink transition-colors duration-300 group-hover:text-accent font-sans">
            {lot.title}
          </h3>
          <p className="mt-1 text-xs text-muted">
            {lot.maker} · {lot.year}
          </p>

          {/* Stacked at two-up, where a ~170px card cannot hold the estimate
              and the date on one line, then side by side once there is room. */}
          <dl className="mt-3.5 flex flex-col gap-2 border-t border-line/30 pt-2.5 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
            {isSold ? (
              <>
                <div>
                  <dt className="eyebrow">{t.lot.hammer}</dt>
                  <dd
                    data-numerals
                    className="mt-1 text-xs font-semibold text-olive"
                  >
                    {pts(lot.hammerPts ?? 0)}
                    <span className="ml-1 text-xs font-normal text-muted">
                      {t.common.point}
                    </span>
                  </dd>
                </div>
                <div className="sm:text-right">
                  <dt className="eyebrow">{t.lot.hammerRound}</dt>
                  <dd data-numerals className="mt-1 text-xs font-medium text-ink-soft">
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
                    className="mt-1 text-xs font-medium text-ink-soft"
                  >
                    {pts(lot.estimateLowPts)} – {pts(lot.estimateHighPts)}
                    <span className="ml-1 text-xs text-muted">
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
                    className="mt-1 text-xs font-medium text-ink-soft"
                  >
                    {isLive ? ptsToMnt(lot.openingPts) : lotDate(lot.startsAt)}
                  </dd>
                </div>
              </>
            )}
          </dl>
        </div>
      </Link>
    </motion.div>
  );
}


