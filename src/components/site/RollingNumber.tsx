"use client";

import { motion } from "framer-motion";
import { groupNumber } from "@/lib/format";

/**
 * Odometer. Each digit is a column of 0–9 sliding behind a one-line mask, so a
 * price change rolls into place instead of swapping.
 *
 * This is the one animation on the site that is worth calling addictive, and it
 * earns it by being literal: the number physically climbs, which is what the
 * number is doing. Only the digits that actually changed move — 1 205 → 1 208
 * rolls the last digit alone, so a busy lot reads as a flicker at the end of the
 * figure rather than as the whole price redrawing.
 *
 * Requires tabular figures to hold its width. `1ch` per digit is exact under
 * `font-variant-numeric: tabular-nums`, which `[data-numerals]` sets globally.
 */
export function RollingNumber({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  const text = groupNumber(value);
  const chars = text.split("");

  return (
    <span
      data-numerals
      className={`inline-flex items-baseline ${className}`}
      /* The animated columns are decorative duplication; screen readers and
         copy-paste should get the plain figure. */
      aria-label={text}
      role="text"
    >
      {chars.map((ch, i) =>
        /[0-9]/.test(ch) ? (
          <Digit key={`${i}-${ch}`} digit={Number(ch)} />
        ) : (
          <span key={`${i}-sep`} aria-hidden className="inline-block">
            {ch === " " ? " " : ch}
          </span>
        ),
      )}
    </span>
  );
}

const COLUMN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function Digit({ digit }: { digit: number }) {
  return (
    <span
      aria-hidden
      className="relative inline-block overflow-hidden align-baseline"
      /* 1em tall window over a 10em column — translating by -digit×10% of the
         column lands exactly one line per digit. */
      style={{ width: "1ch", height: "1em" }}
    >
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        animate={{ y: `${-digit * 10}%` }}
        transition={{ type: "spring", stiffness: 240, damping: 28, mass: 0.7 }}
      >
        {COLUMN.map((n) => (
          <span key={n} className="block text-center leading-none">
            {n}
          </span>
        ))}
      </motion.span>
    </span>
  );
}
