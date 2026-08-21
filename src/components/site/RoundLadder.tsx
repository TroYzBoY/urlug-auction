import { ROUNDS } from "@/lib/auction";
import { bidClockLabel } from "@/lib/format";
import { t } from "@/lib/copy";

const LONGEST = Math.max(...ROUNDS.map((r) => r.bidClockSec));

/**
 * The whole format in one figure: bar length is the bid clock, drawn to true
 * proportion. Round 1 runs the full width and round 6 is a stub, which is
 * exactly the point — no chart library, no client JS.
 *
 * A 2% floor keeps the five-second bar visible; without it, honest scaling
 * renders it sub-pixel.
 */
export function RoundLadder() {
  return (
    <ol className="flex flex-col">
      {ROUNDS.map((r) => {
        const width = Math.max(2, (r.bidClockSec / LONGEST) * 100);
        const isLast = r.n === ROUNDS.length;

        return (
          <li
            key={r.n}
            className="grid grid-cols-[1.75rem_1fr_auto] sm:grid-cols-[2.5rem_1fr_auto] items-center gap-2 sm:gap-3 border-b border-line/40 py-3 md:grid-cols-[3rem_1fr_auto_auto] md:gap-5"
          >
            <span
              data-numerals
              className={`text-sm font-semibold ${
                isLast ? "text-rust" : "text-ink-soft"
              }`}
            >
              {r.n}
            </span>

            <span className="block h-2 w-full bg-raise">
              <span
                className={`block h-2 ${isLast ? "bg-rust" : "bg-accent"}`}
                style={{ width: `${width}%` }}
              />
            </span>

            <span
              data-numerals
              className={`text-right text-sm font-semibold whitespace-nowrap ${
                isLast ? "text-rust" : "text-ink"
              }`}
            >
              {bidClockLabel(r.bidClockSec)}
            </span>

            <span
              data-numerals
              className="hidden text-right text-xs whitespace-nowrap text-faint md:block md:w-16"
            >
              {r.durationMin} {t.common.min}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
