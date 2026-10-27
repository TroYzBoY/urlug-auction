"use client";

import { useSyncExternalStore } from "react";
import { ROUNDS } from "@/lib/auction";
import { t } from "@/lib/copy";
import { RollingNumber } from "@/components/site/RollingNumber";
import { useLivePrices } from "./useLivePrices";

/**
 * The moving parts of a lot card: a countdown to an upcoming lot's start, and
 * a live lot's standing price and bid clock.
 *
 * All three render exactly what the server rendered during hydration (the
 * clock's server snapshot is null), then start moving — so a page that is
 * read before JavaScript arrives, or without it, shows the plain date and the
 * rendered price, and nothing flickers or mismatches on the way in.
 */

/* One shared ticker per interval, however many cards read it. */
const clocks = new Map<
  number,
  { subscribe: (fn: () => void) => () => void; now: () => number }
>();

function clock(ms: number) {
  let c = clocks.get(ms);
  if (!c) {
    let now = Date.now();
    let timer = 0;
    const fns = new Set<() => void>();
    c = {
      subscribe(fn) {
        fns.add(fn);
        if (fns.size === 1) {
          now = Date.now();
          timer = window.setInterval(() => {
            now = Date.now();
            for (const f of fns) f();
          }, ms);
        }
        return () => {
          fns.delete(fn);
          if (!fns.size) window.clearInterval(timer);
        };
      },
      now: () => now,
    };
    clocks.set(ms, c);
  }
  return c;
}

/** The time, refreshed every `ms`; null on the server and while hydrating. */
function useNow(ms: number): number | null {
  const c = clock(ms);
  return useSyncExternalStore(c.subscribe, c.now, () => null);
}

const two = (n: number) => String(n).padStart(2, "0");

/**
 * "Эхлэхэд 02:14:33", or "Эхлэхэд 2 өдөр 03:14" more than a day out. Renders
 * its own <dt> and <dd>, because the label has to change with the value: a
 * date reads as "starts at", a countdown as "starts in".
 */
export function StartsIn({ at, fallback }: { at: string; fallback: string }) {
  const now = useNow(1000);
  const ddClass = "text-ink-soft mt-1 text-xs font-medium";

  if (now === null) {
    return (
      <>
        <dt className="eyebrow">{t.lot.startsAt}</dt>
        <dd data-numerals className={ddClass}>
          {fallback}
        </dd>
      </>
    );
  }

  const left = Math.max(0, Math.floor((Date.parse(at) - now) / 1000));
  const d = Math.floor(left / 86400);
  const h = Math.floor((left % 86400) / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  const text =
    left === 0
      ? t.lots.startingNow
      : d > 0
        ? `${t.lots.days(d)} ${two(h)}:${two(m)}`
        : `${two(h)}:${two(m)}:${two(s)}`;

  return (
    <>
      <dt className="eyebrow">{t.lots.startsIn}</dt>
      <dd data-numerals className={`${ddClass} text-signal`}>
        {text}
      </dd>
    </>
  );
}

/** A live lot's standing price, rolling as the poll brings new bids. */
export function LivePrice({
  lotId,
  initialPts,
}: {
  lotId: string;
  initialPts: number;
}) {
  const live = useLivePrices().get(lotId);
  return <RollingNumber value={live?.currentPts ?? initialPts} />;
}

/**
 * A hairline along the foot of the photograph showing how much of the bid
 * clock is left — it empties, turns to the hot clock's rust in the last fifth,
 * and fills again when somebody bids. Nothing until the first poll, since the
 * page render does not carry the clock.
 */
export function BidClockBar({ lotId }: { lotId: string }) {
  const live = useLivePrices().get(lotId);
  const now = useNow(250);
  if (!live || now === null) return null;

  const total = (ROUNDS[live.round - 1]?.bidClockSec ?? 60) * 1000;
  const frac = Math.max(0, Math.min(1, (live.bidClockEndsAt - now) / total));

  return (
    <span
      aria-hidden
      className="card-clock"
      data-hot={frac <= 0.2 || undefined}
    >
      <span style={{ transform: `scaleX(${frac})` }} />
    </span>
  );
}
