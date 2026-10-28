import { describe, expect, it } from "vitest";
import {
  POINT_MNT,
  ROUNDS,
  TOTAL_MINUTES,
  TOTAL_ROUNDS,
  bidClockMs,
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
