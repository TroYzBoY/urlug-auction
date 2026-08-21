import { describe, expect, it } from "vitest";
import { MINIMUM_AGE, ageOn, isOldEnough } from "./legal";

/**
 * The age check gates who may hold an account, so its edges are worth pinning
 * down. The one that matters is the birthday itself: `(now - dob) / 365.25
 * days` gets it wrong, and a bidder turned away on the day they turn eighteen
 * is a complaint rather than a rounding error.
 */

const ON = new Date("2026-08-21T12:00:00Z");

describe("ageOn", () => {
  it("counts whole years", () => {
    expect(ageOn(new Date("2000-08-21"), ON)).toBe(26);
  });

  it("does not round up the day before a birthday", () => {
    expect(ageOn(new Date("2000-08-22"), ON)).toBe(25);
  });

  it("counts the birthday itself", () => {
    expect(ageOn(new Date("2008-08-21"), ON)).toBe(18);
  });

  it("handles a birthday later in the same month", () => {
    expect(ageOn(new Date("2008-08-31"), ON)).toBe(17);
  });

  it("handles a birthday earlier in the year", () => {
    expect(ageOn(new Date("2008-01-05"), ON)).toBe(18);
  });

  it("handles a birthday later in the year", () => {
    expect(ageOn(new Date("2008-12-31"), ON)).toBe(17);
  });

  it("handles 29 February", () => {
    // Born on a leap day, checked in a non-leap year: still their birthday
    // month, and the 21st is past the 29th only in the sense that it is not.
    expect(ageOn(new Date("2008-02-29"), ON)).toBe(18);
  });
});

describe("isOldEnough", () => {
  it("admits someone on their eighteenth birthday", () => {
    expect(isOldEnough(new Date("2008-08-21"), ON)).toBe(true);
  });

  it("refuses someone one day short", () => {
    expect(isOldEnough(new Date("2008-08-22"), ON)).toBe(false);
  });

  it("refuses a child", () => {
    expect(isOldEnough(new Date("2015-01-01"), ON)).toBe(false);
  });

  it("uses the stated minimum", () => {
    expect(MINIMUM_AGE).toBe(18);
  });
});
