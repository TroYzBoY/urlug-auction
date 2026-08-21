"use client";

import { ROUNDS, TOTAL_ROUNDS } from "@/lib/auction";
import { bidClockLabel, coarseClock } from "@/lib/format";
import { t } from "@/lib/copy";
import { useCountdown } from "./useCountdown";

/**
 * The six rounds as a rail, with the bid clock each one imposes. This is the
 * only place a bidder can see the shape of the whole programme — that the
 * five-minute clock they have now becomes five seconds by the end.
 *
 * Runs its own coarse countdown (1s granularity) so ticking the round timer
 * re-renders this strip and nothing else.
 */
export function RoundRail({
  round,
  roundEndsAt,
  roundTotalMs,
  frozen,
  onExpire,
}: {
  round: number;
  roundEndsAt: number;
  roundTotalMs: number;
  frozen: boolean;
  onExpire: () => void;
}) {
  const remaining = useCountdown(roundEndsAt, {
    granularityMs: 1000,
    onExpire: frozen ? undefined : onExpire,
  });

  const frac =
    remaining === null ? 1 : Math.max(0, Math.min(1, remaining / roundTotalMs));

  return (
    <section aria-label={t.room.round}>
      <div className="flex items-baseline justify-between gap-4">
        <p className="eyebrow">
          {t.room.round}{" "}
          <span data-numerals className="text-ink">
            {round}
          </span>{" "}
          / {TOTAL_ROUNDS}
        </p>
        <p className="eyebrow">
          {t.room.roundClock}{" "}
          <span data-numerals className="text-ink">
            {remaining === null ? "—" : coarseClock(remaining)}
          </span>
        </p>
      </div>

      <ol className="mt-3 flex gap-1.5 overflow-x-auto scroll-quiet md:gap-2">
        {ROUNDS.map((r) => {
          const isPast = r.n < round;
          const isNow = r.n === round;

          return (
            <li key={r.n} className="min-w-0 flex-1 shrink-0 basis-0">
              <div
                className={`h-1 w-full overflow-hidden ${
                  isPast ? "bg-accent" : "bg-raise"
                }`}
              >
                {isNow && (
                  <div
                    className="h-full origin-left bg-flare transition-transform duration-1000 ease-linear"
                    style={{ transform: `scaleX(${1 - frac})` }}
                  />
                )}
              </div>

              <div className="mt-2 flex flex-col gap-0.5">
                <span
                  data-numerals
                  className={`text-xs font-semibold tabular-nums ${
                    isNow ? "text-flare" : isPast ? "text-ink-soft" : "text-faint"
                  }`}
                >
                  {r.n}
                </span>
                <span
                  className={`text-[0.625rem] leading-tight whitespace-nowrap ${
                    isNow ? "text-ink" : "text-faint"
                  }`}
                >
                  {bidClockLabel(r.bidClockSec)}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
