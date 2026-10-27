/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE HOUSE'S CLOCK
 *
 * Every time a person reads or types on this site is Ulaanbaatar time. Not the
 * server's zone — production runs in UTC, eight hours behind — and not the
 * browser's, which is wherever the visitor happens to be.
 *
 * Both halves used to go wrong by exactly that eight hours:
 *
 *   • reading: times were printed from their UTC parts, so a lot opening at
 *     noon in Ulaanbaatar was advertised for 04:00
 *   • typing: the admin's `datetime-local` value was parsed in the server's
 *     zone, so a lot meant for 20:00 opened at 04:00 the next morning
 *
 * `Intl` with an explicit zone gives the same answer on the server and in every
 * browser, so a time rendered on the server hydrates without a mismatch —
 * which is the reason the old version reached for UTC in the first place.
 *
 * No dependencies, so the spreadsheet export and the client bundle can both
 * import it without pulling in anything else.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const HOUSE_TIME_ZONE = "Asia/Ulaanbaatar";

export interface HouseParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

const FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: HOUSE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** The wall-clock fields of an instant, as read in Ulaanbaatar. Zero-padded. */
export function houseParts(at: Date | number | string): HouseParts {
  const parts: Record<string, string> = {};
  for (const part of FORMAT.formatToParts(new Date(at))) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return parts as unknown as HouseParts;
}

/**
 * An instant as the `YYYY-MM-DDTHH:mm` a `datetime-local` input holds, in
 * Ulaanbaatar time — for prefilling a form with a time it will read back.
 */
export function toHouseInput(at: Date | number | string): string {
  const p = houseParts(at);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Reads a time a person typed, as Ulaanbaatar wall-clock time.
 *
 * A value that names its own zone (`…Z`, `…+08:00`) is taken at its word. One
 * that does not — which is everything a `datetime-local` input submits — is
 * Ulaanbaatar time, whatever zone the server is in. Returns an invalid Date for
 * anything else, so callers check it as they would `new Date(text)`.
 */
export function parseHouseTime(text: string): Date {
  const m = LOCAL.exec(text.trim());
  if (!m) return new Date(text);

  const [, y, mo, d, h, mi, s = "0"] = m;
  const asIfUtc = Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +s);

  /*
   * The zone's offset at that moment, measured rather than assumed: read the
   * UTC guess back through the zone, and the difference is the offset. Measured
   * twice so a time either side of an offset change (Mongolia has had summer
   * time before) lands on the right side of it.
   */
  const offsetAt = (instant: number) => {
    const p = houseParts(instant);
    return (
      Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) -
      instant
    );
  };
  const first = asIfUtc - offsetAt(asIfUtc);
  return new Date(asIfUtc - offsetAt(first));
}
