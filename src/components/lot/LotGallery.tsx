"use client";

import { useState } from "react";
import { LotPlate } from "./LotPlate";
import type { LotCategory, LotImage } from "@/lib/types";
import { t } from "@/lib/copy";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE LOT'S PHOTOGRAPHS
 *
 * One large view and a row of thumbnails. Selection is local state — no route
 * change, no scroll position lost.
 *
 * ── Why every angle gets its own caption ─────────────────────────────────────
 *
 * The thumbnails are labelled — "Урд тал", "Ар тал", "Баруун доод булан —
 * унасны мөр" — and the caption under the main view repeats it. A used device
 * is bought on its faults, and a photograph of a scratch that nobody tells you
 * is a photograph of a scratch is just a blurry corner. The caption is what
 * makes the fourth image mean something.
 *
 * It also does the accessibility work for free: `alt` on each image already has
 * to say what the view shows, so showing that text costs nothing and helps
 * everyone.
 *
 * ── Why the thumbnails are buttons and not links ─────────────────────────────
 *
 * Changing which photograph is on screen is not navigation. Links would put a
 * dozen entries in the back stack between the catalogue and the lot page, so
 * "back" would walk through the gallery instead of leaving it.
 *
 * ── Falling back ─────────────────────────────────────────────────────────────
 *
 * With no photographs at all, `LotPlate` draws its silhouette and no thumbnail
 * row renders — the normal state of a lot whose photographs have not been taken
 * yet, and better than a broken image or an empty frame.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function LotGallery({
  images,
  category,
  code,
  title,
}: {
  images: LotImage[];
  category: LotCategory;
  code: string;
  title: string;
}) {
  const [active, setActive] = useState(0);
  const current = images[active];

  return (
    <div>
      <LotPlate
        category={category}
        code={code}
        image={current?.url}
        alt={current?.alt ?? title}
        priority
        /* Full width on a phone; a little under half the page beside the
           detail column from lg. */
        sizes="(max-width: 1024px) 100vw, 45vw"
      />

      {current && (
        <p className="text-muted mt-3 text-xs leading-relaxed">{current.alt}</p>
      )}

      {/*
        Attribution, beside the image rather than in a file next to it. CC BY
        and CC BY-SA are licences granted on the condition that the credit
        travels with the picture, so a credit only a maintainer can read is a
        condition not met. Absent for a house photograph, which owes nobody one.
      */}
      {current?.credit && (
        <p className="text-faint mt-1 text-xs leading-relaxed">
          {current.credit}
        </p>
      )}

      {images.length > 1 && (
        <>
          {/*
            `role="group"` with a label, not a listbox or a tablist. Those roles
            promise keyboard semantics — arrow-key roving, an active descendant —
            that a plain row of buttons does not implement, and a promised
            interaction that is not there is worse than no promise. Tab reaches
            every thumbnail, which is what actually matters.
          */}
          <div
            role="group"
            aria-label={t.lot.gallery}
            className="mt-4 grid grid-cols-5 gap-2"
          >
            {images.map((image, i) => (
              <button
                key={image.url}
                type="button"
                onClick={() => setActive(i)}
                aria-label={image.alt}
                aria-pressed={i === active}
                className={`overflow-hidden border transition-colors ${
                  i === active
                    ? "border-accent"
                    : "border-line hover:border-line-strong"
                }`}
              >
                <LotPlate
                  category={category}
                  image={image.url}
                  alt=""
                  ratio="aspect-square"
                  /* Five across the gallery column — about 110px on a desktop.
                     Left on the catalogue default these asked for a third of
                     the viewport each, five times over, to fill a thumbnail. */
                  sizes="(max-width: 1024px) 18vw, 110px"
                />
              </button>
            ))}
          </div>

          <p data-numerals className="text-faint mt-2 text-xs">
            {active + 1} / {images.length}
          </p>
        </>
      )}
    </div>
  );
}
