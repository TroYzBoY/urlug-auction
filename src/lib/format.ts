import { POINT_MNT } from "./auction";
import { houseParts } from "./house-time";

/*
 * Formatting is hand-rolled rather than Intl-based on purpose: Intl's grouping
 * separator for mn-MN differs between Node and browser ICU builds, which shows
 * up as a hydration mismatch on every price on the page.
 */

/** 1250000 → "1 250 000" (thin-space grouping, Mongolian convention). */
export function groupNumber(n: number): string {
  const neg = n < 0;
  const digits = Math.round(Math.abs(n)).toString();
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += " ";
    out += digits[i];
  }
  return neg ? `−${out}` : out;
}

/** Points → "1 250 000₮" */
export function ptsToMnt(pts: number): string {
  return `${groupNumber(pts * POINT_MNT)}₮`;
}

/** Points → "1 250 оноо" */
export function ptsLabel(pts: number): string {
  return `${groupNumber(pts)} оноо`;
}

/** Points → "1 250" */
export function pts(n: number): string {
  return groupNumber(n);
}

/**
 * Clock text. Under ten seconds it switches to one decimal place — the round-6
 * five-second clock is unreadable as an integer, and the tenths ticking is
 * what actually creates the pressure.
 */
export function clockText(remainingMs: number): string {
  const ms = Math.max(0, remainingMs);
  const totalSec = ms / 1000;

  if (totalSec < 10) return totalSec.toFixed(1);

  const mins = Math.floor(totalSec / 60);
  const secs = Math.floor(totalSec % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** Coarse clock for the round timer: "18 мин" / "42 сек". */
export function coarseClock(remainingMs: number): string {
  const sec = Math.max(0, Math.floor(remainingMs / 1000));
  if (sec >= 60) return `${Math.floor(sec / 60)} мин`;
  return `${sec} сек`;
}

/** A round's bid clock as a human label: "5 мин", "30 сек". */
export function bidClockLabel(sec: number): string {
  return sec >= 60 ? `${sec / 60} мин` : `${sec} сек`;
}

/**
 * Lot start time as "09 сарын 19 · 11:00", in Ulaanbaatar time wherever the
 * server or the visitor is — see src/lib/house-time.ts. Explicit about its zone
 * rather than local, so the server render and the browser's agree on hydration.
 */
export function lotDate(iso: string): string {
  const p = houseParts(iso);
  return `${p.month} сарын ${p.day} · ${p.hour}:${p.minute}`;
}

/** "14:32:05" wall clock from epoch ms, Ulaanbaatar time (hydration-safe). */
export function wallClock(at: number): string {
  const p = houseParts(at);
  return `${p.hour}:${p.minute}:${p.second}`;
}

/**
 * "Зохиогч · Он", leaving out whichever the admin did not give — every field
 * of a lot but its name is optional. Empty when neither was given.
 */
export function byline(lot: { maker: string; year: string }): string {
  return [lot.maker, lot.year].filter(Boolean).join(" · ");
}

/**
 * A lot's estimate as text, "1 200 – 1 800" or "1 200", or null when it has
 * none — an estimate left out is stored as 0 and 0, and "0 – 0" would read as
 * a worthless lot rather than an unknown one.
 */
export function estimateText(lot: {
  estimateLowPts: number;
  estimateHighPts: number;
}): string | null {
  const { estimateLowPts: low, estimateHighPts: high } = lot;
  if (low === 0 && high === 0) return null;
  if (high <= low) return pts(low);
  return `${pts(low)} – ${pts(high)}`;
}
