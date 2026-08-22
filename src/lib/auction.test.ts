import { describe, expect, it } from "vitest";
import {
  LATE_ENTRY_FROM_ROUND,
  LATE_ENTRY_MULTIPLIER,
  POINT_MNT,
  ROUNDS,
  TOTAL_MINUTES,
  TOTAL_ROUNDS,
  bidClockMs,
  isLegalBid,
  minIncrementPts,
  minNextBidPts,
  quickStepsPts,
  roundEndOffsetMs,
  roundSpec,
  roundStartMin,
  urgencyOf,
} from "./auction";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CONTRACT
 *
 * `auction.ts` is the file the client specified and the file the server
 * enforces. These tests are what stops the two drifting: they assert the
 * numbers the bidder was told, not the implementation that produces them.
 * ─────────────────────────────────────────────────────────────────────────────
 */

describe("the format as specified", () => {
  it("is six rounds totalling 2h45m", () => {
    expect(TOTAL_ROUNDS).toBe(6);
    expect(TOTAL_MINUTES).toBe(165);
  });

  it("has the bid clocks the client asked for", () => {
    expect(ROUNDS.map((r) => r.bidClockSec)).toEqual([300, 180, 60, 30, 15, 5]);
  });

  it("runs 25 minutes a round, except round 6 at 40", () => {
    expect(ROUNDS.map((r) => r.durationMin)).toEqual([25, 25, 25, 25, 25, 40]);
  });

  it("holds one point at 1000₮", () => {
    expect(POINT_MNT).toBe(1000);
  });
});

describe("roundSpec", () => {
  it("is 1-indexed", () => {
    expect(roundSpec(1).bidClockSec).toBe(300);
    expect(roundSpec(6).bidClockSec).toBe(5);
  });

  it("clamps out-of-range rounds instead of returning undefined", () => {
    // A corrupt row must not produce `undefined.bidClockSec` mid-sale.
    expect(roundSpec(0)).toEqual(roundSpec(1));
    expect(roundSpec(-4)).toEqual(roundSpec(1));
    expect(roundSpec(7)).toEqual(roundSpec(6));
    expect(roundSpec(999)).toEqual(roundSpec(6));
  });
});

describe("round boundaries", () => {
  it("starts round 1 at zero", () => {
    expect(roundStartMin(1)).toBe(0);
  });

  it("accumulates the preceding durations", () => {
    expect(roundStartMin(2)).toBe(25);
    expect(roundStartMin(6)).toBe(125);
  });

  it("ends round 6 at the full programme length", () => {
    expect(roundEndOffsetMs(TOTAL_ROUNDS)).toBe(165 * 60_000);
  });

  it("makes each boundary the next round's start", () => {
    for (let n = 1; n < TOTAL_ROUNDS; n++) {
      expect(roundEndOffsetMs(n)).toBe(roundStartMin(n + 1) * 60_000);
    }
  });
});

describe("minimum increments", () => {
  it("is 1 point in round 1 and 2 thereafter, for a bidder already in", () => {
    expect(minIncrementPts(1, true)).toBe(1);
    for (let n = 2; n <= 6; n++) expect(minIncrementPts(n, true)).toBe(2);
  });

  it("charges a late joiner round × 10 from round 2 on", () => {
    expect(minIncrementPts(2, false)).toBe(20);
    expect(minIncrementPts(3, false)).toBe(30);
    expect(minIncrementPts(6, false)).toBe(60);
  });

  it("does not treat round 1 as a late entry — nobody is joining late yet", () => {
    expect(LATE_ENTRY_FROM_ROUND).toBe(2);
    expect(minIncrementPts(1, false)).toBe(1);
    expect(minIncrementPts(1, false)).toBe(minIncrementPts(1, true));
  });

  it("derives the late-entry floor from the multiplier", () => {
    for (let n = LATE_ENTRY_FROM_ROUND; n <= TOTAL_ROUNDS; n++) {
      expect(minIncrementPts(n, false)).toBe(n * LATE_ENTRY_MULTIPLIER);
    }
  });
});

describe("minNextBidPts", () => {
  it("adds the increment to the standing price", () => {
    expect(minNextBidPts(1200, 1, true)).toBe(1201);
    expect(minNextBidPts(1200, 4, true)).toBe(1202);
  });

  it("adds the late-entry floor for a bidder with no history on the lot", () => {
    expect(minNextBidPts(1200, 6, false)).toBe(1260);
  });
});

describe("isLegalBid", () => {
  it("accepts exactly the minimum", () => {
    expect(isLegalBid(1202, 1200, 4, true)).toBe(true);
  });

  it("rejects one point under", () => {
    expect(isLegalBid(1201, 1200, 4, true)).toBe(false);
  });

  it("rejects the standing price itself", () => {
    expect(isLegalBid(1200, 1200, 4, true)).toBe(false);
  });

  /*
   * These four are the reason the check is `Number.isFinite` and not `> 0`.
   * Each one arrives from `Number.parseInt` on the custom-amount field, or
   * from a hand-written request.
   */
  it("rejects NaN", () => {
    expect(isLegalBid(Number.NaN, 1200, 1, true)).toBe(false);
  });

  it("rejects Infinity", () => {
    expect(isLegalBid(Number.POSITIVE_INFINITY, 1200, 1, true)).toBe(false);
  });

  it("rejects negatives", () => {
    expect(isLegalBid(-5000, 1200, 1, true)).toBe(false);
  });

  it("rejects a late joiner sneaking in at the normal increment", () => {
    // The whole point of the late-entry rule: +2 in round 6 must not pass.
    expect(isLegalBid(1202, 1200, 6, false)).toBe(false);
    expect(isLegalBid(1260, 1200, 6, false)).toBe(true);
  });
});

describe("quickStepsPts", () => {
  it("offers the minimum, double and five times", () => {
    expect(quickStepsPts(4, true)).toEqual([2, 4, 10]);
    expect(quickStepsPts(6, false)).toEqual([60, 120, 300]);
  });

  it("never offers a step below the legal minimum", () => {
    for (let n = 1; n <= TOTAL_ROUNDS; n++) {
      for (const hasBid of [true, false]) {
        const steps = quickStepsPts(n, hasBid);
        expect(Math.min(...steps)).toBeGreaterThanOrEqual(
          minIncrementPts(n, hasBid),
        );
      }
    }
  });
});

describe("bidClockMs", () => {
  it("is never scaled by the demo time compression", () => {
    // Round durations compress; bid clocks are the format and must not.
    expect(bidClockMs(1)).toBe(300_000);
    expect(bidClockMs(6)).toBe(5_000);
  });
});

describe("urgencyOf", () => {
  it("is calm early in a long clock", () => {
    expect(urgencyOf(240_000, 300_000)).toBe("calm");
  });

  it("is hot in the last ten seconds of a long clock", () => {
    // Absolute threshold: round 1's final seconds must not read as calm.
    expect(urgencyOf(9_000, 300_000)).toBe("hot");
  });

  /*
   * Round 6's whole clock is five seconds. The absolute threshold is suppressed
   * below SHORT_CLOCK_MS precisely so this clock still has a calm start — a
   * signal that is on from the first frame is not a signal.
   */
  it("gives round 6's five-second clock a calm start and a hot finish", () => {
    expect(urgencyOf(4_500, 5_000)).toBe("calm");
    expect(urgencyOf(2_000, 5_000)).toBe("warm");
    expect(urgencyOf(900, 5_000)).toBe("hot");
  });

  it("does the same for round 5's fifteen seconds", () => {
    expect(urgencyOf(14_000, 15_000)).toBe("calm");
    expect(urgencyOf(2_000, 15_000)).toBe("hot");
  });

  it("uses the fraction for long clocks, so mid-round is not hot", () => {
    expect(urgencyOf(150_000, 300_000)).toBe("warm");
    expect(urgencyOf(60_000, 300_000)).toBe("hot");
  });

  it("escalates monotonically across every round's clock", () => {
    /*
     * The property that matters more than any single threshold: within one
     * clock, urgency never goes backwards as time runs out. An earlier version
     * satisfied the individual cases and still had round 6 pinned at "hot".
     */
    const rank = { calm: 0, warm: 1, hot: 2 } as const;
    for (const total of [300_000, 180_000, 60_000, 30_000, 15_000, 5_000]) {
      let previous = -1;
      for (let step = 20; step >= 0; step--) {
        const current = rank[urgencyOf((total * step) / 20, total)];
        expect(current).toBeGreaterThanOrEqual(previous);
        previous = current;
      }
      // And every clock ends hot and starts not-hot.
      expect(urgencyOf(0, total)).toBe("hot");
      expect(urgencyOf(total, total)).toBe("calm");
    }
  });

  it("does not divide by zero on a zero-length clock", () => {
    expect(urgencyOf(0, 0)).toBe("hot");
  });
});
