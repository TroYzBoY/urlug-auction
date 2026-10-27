"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "@/lib/copy";
import { lotDate, pts } from "@/lib/format";
import type { Lot, LotStatus } from "@/lib/types";
import { LotPlate } from "./LotPlate";

const STATUS: Record<LotStatus, string> = {
  live: t.room.live,
  upcoming: t.home.upcoming,
  review: t.lot.statusReview,
  sold: t.lot.statusSold,
  unsold: t.lot.statusUnsold,
};

/**
 * A look at a lot without leaving the grid: its photographs, the figures that
 * matter and the catalogue note, with the way into the lot at the foot.
 *
 * A native <dialog> opened with showModal(), so focus is trapped, Escape
 * closes it and the rest of the page is inert — all from the browser rather
 * than reimplemented. Portalled to <body> so no card's overflow can clip it.
 */
export function QuickView({ lot }: { lot: Lot }) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  const show = () => {
    setIndex(0);
    setOpen(true);
    /* After the portal has mounted the dialog. */
    requestAnimationFrame(() => ref.current?.showModal());
  };
  const close = () => ref.current?.close();

  const image = lot.images[index] ?? lot.images[0];
  const live = lot.status === "live";
  const sold = lot.status === "sold";

  return (
    <>
      <button
        type="button"
        className="card-action"
        aria-label={t.lots.quickView}
        title={t.lots.quickView}
        aria-haspopup="dialog"
        onClick={show}
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="2.8" />
        </svg>
      </button>

      {open &&
        createPortal(
          <dialog
            ref={ref}
            className="quick-view"
            aria-labelledby={`qv-${lot.id}`}
            onClose={() => setOpen(false)}
            onClick={(e) => {
              /* A click on the backdrop lands on the dialog element itself. */
              if (e.target === e.currentTarget) close();
            }}
          >
            <div className="quick-view-body">
              <div className="quick-view-media">
                <LotPlate
                  category={lot.category}
                  code={lot.code}
                  image={image?.url}
                  alt={image?.alt ?? lot.title}
                  ratio="aspect-[4/3]"
                  sizes="(max-width: 767px) 92vw, 520px"
                />
                {/* CC BY wants the credit wherever the image appears. */}
                {image?.credit && (
                  <p className="text-faint mt-2 text-xs">{image.credit}</p>
                )}
                {lot.images.length > 1 && (
                  <div className="quick-view-thumbs">
                    {lot.images.slice(0, 6).map((img, i) => (
                      <button
                        key={img.url}
                        type="button"
                        aria-label={img.alt}
                        aria-current={i === index || undefined}
                        onClick={() => setIndex(i)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- a 56px thumbnail of an image next/image already optimised for the plate */}
                        <img src={img.url} alt="" loading="lazy" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="quick-view-info">
                <div className="flex items-center justify-between gap-3">
                  <p className="lot-code">{lot.code}</p>
                  <span className="eyebrow text-[0.625rem]">
                    {STATUS[lot.status]}
                  </span>
                </div>
                <h2
                  id={`qv-${lot.id}`}
                  className="text-ink mt-3 text-xl font-semibold tracking-tight"
                >
                  {lot.title}
                </h2>
                <p className="text-muted mt-1 text-sm">
                  {lot.maker} · {lot.year}
                </p>

                <dl className="quick-view-facts" data-numerals>
                  <div>
                    <dt className="eyebrow">
                      {sold ? t.lot.hammer : t.lot.estimate}
                    </dt>
                    <dd>
                      {sold
                        ? pts(lot.hammerPts ?? 0)
                        : `${pts(lot.estimateLowPts)} – ${pts(lot.estimateHighPts)}`}{" "}
                      <span className="text-muted text-xs">
                        {t.common.point}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="eyebrow">
                      {live
                        ? t.room.currentPrice
                        : sold
                          ? t.lot.hammerRound
                          : t.lot.startsAt}
                    </dt>
                    <dd>
                      {live
                        ? `${pts(lot.currentPts ?? lot.openingPts)} ${t.common.point}`
                        : sold
                          ? `${lot.hammerRound ?? "—"} / 6`
                          : lotDate(lot.startsAt)}
                    </dd>
                  </div>
                </dl>

                {lot.note && (
                  <p className="text-ink-soft mt-5 line-clamp-5 text-sm leading-relaxed">
                    {lot.note}
                  </p>
                )}
                {lot.condition && (
                  <p className="text-muted mt-3 text-xs">{lot.condition}</p>
                )}

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Link href={`/auction/${lot.id}`} className="house-primary">
                    {live ? t.lots.quickEnter : t.lots.quickOpen}
                    <span aria-hidden>↗</span>
                  </Link>
                  <button
                    type="button"
                    className="house-secondary"
                    onClick={close}
                  >
                    {t.lots.quickClose}
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              className="quick-view-close"
              aria-label={t.lots.quickClose}
              onClick={close}
            >
              ×
            </button>
          </dialog>,
          document.body,
        )}
    </>
  );
}
