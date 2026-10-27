import { describe, expect, it } from "vitest";
import { houseParts, parseHouseTime, toHouseInput } from "./house-time";
import { lotDate, wallClock } from "./format";

/**
 * Every assertion here names its instant with an explicit zone, so the suite
 * means the same thing on a developer's machine in Ulaanbaatar and on a CI
 * runner in UTC — which is the exact difference the module exists to remove.
 */

describe("reading times as Ulaanbaatar time", () => {
  it("shows a lot opening at noon in Ulaanbaatar as 12:00, not 04:00", () => {
    expect(lotDate("2026-10-27T04:00:00Z")).toBe("10 сарын 27 · 12:00");
  });

  it("rolls the date over at Ulaanbaatar midnight, not UTC midnight", () => {
    // 17:30 UTC on the 27th is 01:30 on the 28th in Ulaanbaatar.
    expect(lotDate("2026-10-27T17:30:00Z")).toBe("10 сарын 28 · 01:30");
  });

  it("gives a wall clock with seconds", () => {
    expect(wallClock(Date.parse("2026-10-27T06:05:09Z"))).toBe("14:05:09");
  });

  it("uses a 24-hour clock that starts at 00", () => {
    expect(houseParts("2026-10-27T16:00:00Z").hour).toBe("00");
  });
});

describe("reading what an admin typed", () => {
  it("takes a datetime-local value as Ulaanbaatar time", () => {
    // 20:00 typed means 20:00 in Ulaanbaatar — 12:00 UTC — on any server.
    expect(parseHouseTime("2026-10-27T20:00").toISOString()).toBe(
      "2026-10-27T12:00:00.000Z",
    );
  });

  it("accepts seconds", () => {
    expect(parseHouseTime("2026-10-27T20:00:30").toISOString()).toBe(
      "2026-10-27T12:00:30.000Z",
    );
  });

  it("takes a value that names its own zone at its word", () => {
    expect(parseHouseTime("2026-10-27T20:00:00Z").toISOString()).toBe(
      "2026-10-27T20:00:00.000Z",
    );
  });

  it("is invalid for text that is not a time", () => {
    expect(Number.isNaN(parseHouseTime("not a time").getTime())).toBe(true);
  });

  it("round-trips through the form's prefill", () => {
    const stored = "2026-12-31T16:45:00.000Z";
    expect(toHouseInput(stored)).toBe("2027-01-01T00:45");
    expect(parseHouseTime(toHouseInput(stored)).toISOString()).toBe(stored);
  });
});
