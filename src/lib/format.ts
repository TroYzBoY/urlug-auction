import { POINT_MNT } from "./auction";

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
 * Lot start time as "09 сарын 19 · 11:00". Built from UTC parts on purpose:
 * the server and the browser are in different zones during development, and a
 * local-time render would mismatch on hydration.
 */
export function lotDate(iso: string): string {
  const d = new Date(iso);
  const month = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  const hh = d.getUTCHours().toString().padStart(2, "0");
  const mm = d.getUTCMinutes().toString().padStart(2, "0");
  return `${month} сарын ${day} · ${hh}:${mm}`;
}

/** "14:32" wall clock from epoch ms, in fixed 24h form (hydration-safe). */
export function wallClock(at: number): string {
  const d = new Date(at);
  return `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}
