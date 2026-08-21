"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { LotPlate } from "./LotPlate";
import { t } from "@/lib/copy";
import { lotDate, pts } from "@/lib/format";
import type { Lot } from "@/lib/types";

/**
 * The catalogue as an index rather than a wall of cards.
 *
 * Swiss editorial logic: a numbered list, hairline rules, columns that line up,
 * and the type doing the work instead of boxes. Cards are fine for browsing but
 * they flatten hierarchy — twelve equal rectangles say nothing about which lot
 * matters. A ruled index with a running number reads as a catalogue, which is
 * what this is.
 *
 * The image lives in one sticky pane that swaps as the reader moves down the
 * list, so the page stays quiet while still showing the object. Desktop only —
 * hover is the interaction, and on touch there is none, so phones get a
 * thumbnail in the row instead.
 */
export function LotIndex({ lots }: { lots: Lot[] }) {
  const [activeId, setActiveId] = useState(lots[0]?.id ?? null);
  const active = lots.find((l) => l.id === activeId) ?? lots[0];

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-14">
      <div>
        {/* Column headers, set as a Swiss table would: tiny, tracked, ruled. */}
        <div className="hidden grid-cols-[3rem_minmax(0,1fr)_8rem_7rem] items-baseline border-b border-line-strong/30 pb-3 md:grid">
          <p className="eyebrow">{t.home.colLot}</p>
          <p className="eyebrow">{t.home.colObject}</p>
          <p className="eyebrow text-right">{t.home.colEstimate}</p>
          <p className="eyebrow text-right">{t.home.colStatus}</p>
        </div>

        <ul>
          {lots.map((lot, i) => (
            <li key={lot.id}>
              <Link
                href={`/auction/${lot.id}`}
                onMouseEnter={() => setActiveId(lot.id)}
                onFocus={() => setActiveId(lot.id)}
                className="group grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-4 border-b border-line py-4 transition-colors hover:border-line-strong md:grid-cols-[3rem_minmax(0,1fr)_8rem_7rem] md:gap-x-0 md:py-5"
              >
                {/* Running number — the device that makes it read as an index. */}
                <span
                  data-numerals
                  className="text-sm text-faint transition-colors group-hover:text-accent"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>

                <span className="flex min-w-0 items-center gap-3">
                  {/* Phones get the thumbnail here, since there is no hover
                      pane to carry the image. */}
                  <span className="w-12 shrink-0 lg:hidden">
                    <LotPlate
                      category={lot.category}
                      image={lot.image}
                      alt={lot.title}
                      dither
                      ditherRes={72}
                      ratio="aspect-square"
                    />
                  </span>

                  <span className="min-w-0">
                    <span className="block truncate text-base font-medium tracking-[-0.01em] text-ink transition-colors group-hover:text-accent md:text-lg">
                      {lot.title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {lot.maker} · {lot.year}
                    </span>
                  </span>
                </span>

                <span
                  data-numerals
                  className="hidden text-right text-sm text-ink-soft md:block"
                >
                  {pts(lot.estimateLowPts)}–{pts(lot.estimateHighPts)}
                </span>

                <span className="text-right">
                  <StatusMark lot={lot} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* Sticky preview pane. `top-28` clears the floating header. */}
      <div className="hidden lg:block">
        <div className="sticky top-28">
          <div className="relative aspect-[4/5] w-full overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={active?.id}
                initial={{ opacity: 0, scale: 1.04 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0"
              >
                {active && (
                  <LotPlate
                    category={active.category}
                    image={active.image}
                    alt={active.title}
                    ratio="size-full"
                  />
                )}

              </motion.div>
            </AnimatePresence>
          </div>

          {active && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="eyebrow">{active.code}</p>
              <p className="mt-1.5 text-sm text-ink">{active.title}</p>
              <p className="mt-0.5 text-xs text-muted">{active.dimensions}</p>
            </div>
          )}

          <p className="eyebrow mt-6 text-faint">{t.home.indexHintDesktop}</p>
        </div>
      </div>
    </div>
  );
}

function StatusMark({ lot }: { lot: Lot }) {
  if (lot.status === "live") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="size-1.5 rounded-full bg-rust" />
        <span className="eyebrow text-rust">{t.room.live}</span>
      </span>
    );
  }

  if (lot.status === "sold") {
    return (
      <span data-numerals className="eyebrow text-olive">
        {pts(lot.hammerPts ?? 0)}
      </span>
    );
  }

  if (lot.status === "unsold") {
    return <span className="eyebrow text-faint">—</span>;
  }

  return (
    <span data-numerals className="eyebrow hidden md:inline">
      {lotDate(lot.startsAt)}
    </span>
  );
}
