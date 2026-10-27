"use client";

import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "@/lib/copy";
import { pts, ptsToMnt } from "@/lib/format";
import type { Lot } from "@/lib/types";

/**
 * The lot's catalogue description, from inside the room.
 *
 * A phone shows a bidder only what they act on — the picture, the clocks and
 * the bid button — so the words are a tap away rather than gone. Closing the
 * sheet puts them back exactly where they were, with the clocks having run on
 * underneath; nothing here pauses or reconnects anything.
 *
 * A native <dialog> opened with showModal(), as QuickView is: focus is trapped,
 * Escape closes it and the room behind is inert — all from the browser rather
 * than reimplemented. Portalled to <body> so the room's scrolling column cannot
 * clip it, and styled with QuickView's classes so the two read as one control.
 */
export function LotDetails({
  lot,
  variant,
  className = "",
}: {
  lot: Lot;
  /**
   * `chip` sits over the photograph on a phone; `link` stands under the title
   * wherever there is no photograph to put it on.
   */
  variant: "chip" | "link";
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();

  const show = () => {
    setOpen(true);
    /* After the portal has mounted the dialog. */
    requestAnimationFrame(() => ref.current?.showModal());
  };
  const close = () => ref.current?.close();

  /* The room shows the cover, so its credit is the one owed here. */
  const credit = lot.images[0]?.credit;

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={show}
        className={`eyebrow shrink-0 touch-manipulation items-center gap-1.5 transition-colors ${
          variant === "chip"
            ? "border-line-strong/40 bg-ground/80 text-ink hover:border-accent hover:text-accent flex h-8 rounded-full border px-3 text-[0.625rem] backdrop-blur-sm"
            : "text-accent inline-flex hover:opacity-75"
        } ${className}`}
      >
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="size-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <circle cx="8" cy="8" r="6.25" />
          <path d="M8 7.25V11M8 5v.01" />
        </svg>
        {t.lot.details}
      </button>

      {open &&
        createPortal(
          <dialog
            ref={ref}
            className="quick-view max-w-xl"
            aria-labelledby={titleId}
            onClose={() => setOpen(false)}
            onClick={(e) => {
              /* A click on the backdrop lands on the dialog element itself. */
              if (e.target === e.currentTarget) close();
            }}
          >
            <div className="p-5 pt-6 sm:p-7">
              <p className="lot-code">{lot.code}</p>
              <h2
                id={titleId}
                className="text-ink mt-3 pr-10 text-xl font-semibold tracking-tight"
              >
                {lot.title}
              </h2>
              <p className="text-muted mt-1 text-sm">
                {lot.maker} · {lot.year}
              </p>

              {/* The description first: it is what the button was pressed for. */}
              {lot.note && (
                <p className="text-ink-soft mt-5 text-sm leading-relaxed whitespace-pre-line">
                  {lot.note}
                </p>
              )}

              <dl className="border-line mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t pt-4">
                <Fact label={t.lot.estimate}>
                  <span data-numerals>
                    {pts(lot.estimateLowPts)} – {pts(lot.estimateHighPts)}{" "}
                    {t.common.point}
                  </span>
                </Fact>
                <Fact label={t.lot.opening}>
                  <span data-numerals>{ptsToMnt(lot.openingPts)}</span>
                </Fact>
                {lot.dimensions && (
                  <Fact label={t.lot.dimensions}>{lot.dimensions}</Fact>
                )}
                {lot.condition && (
                  <Fact label={t.lot.condition} span>
                    {lot.condition}
                  </Fact>
                )}
                {lot.provenance && (
                  <Fact label={t.lot.provenance} span>
                    {lot.provenance}
                  </Fact>
                )}
              </dl>

              {/* CC BY and BY-SA want the credit wherever the image appears. */}
              {credit && <p className="text-faint mt-5 text-xs">{credit}</p>}

              <button
                type="button"
                className="house-secondary mt-6"
                onClick={close}
              >
                {t.lots.quickClose}
              </button>
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
      <dd className="text-ink-soft mt-1.5 text-sm leading-relaxed">
        {children}
      </dd>
    </div>
  );
}
