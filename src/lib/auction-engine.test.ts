import { describe, expect, it } from "vitest";
import { ROUNDS, bidClockMs, roundEndOffsetMs } from "./auction";
import { nextEventAt, roundEndsAt, saleEndsAt, settle, type EngineState } from "./auction-engine";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ENGINE
 *
 * These are the tests that matter most in the codebase. Every one of them
 * describes a way an auction could end up with the wrong winner.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const OPEN = Date.UTC(2026, 8, 19, 3, 0, 0);

function state(over: Partial<EngineState> = {}): EngineState {
  return {
    opensAt: OPEN,
    round: 1,
    currentPts: 1200,
    leaderPaddle: "Т-207",
    bidClockEndsAt: OPEN + bidClockMs(1),
    outcome: "running",
    ...over,
  };
}

describe("before the open", () => {
  it("holds at scheduled", () => {
    const s = settle(state({ outcome: "scheduled" }), OPEN - 60_000);
    expect(s.outcome).toBe("scheduled");
  });

  it("reports the open as the next event", () => {
    const s = settle(state({ outcome: "scheduled" }), OPEN - 60_000);
    expect(nextEventAt(s)).toBe(OPEN);
  });

  it("does not advance a scheduled lot even if its clocks look expired", () => {
    // A row whose bid_clock_ends_at predates its opens_at is corrupt. It must
    // not hammer a lot that has not started.
    const s = settle(
      state({ outcome: "scheduled", bidClockEndsAt: OPEN - 10_000 }),
      OPEN - 5_000,
    );
    expect(s.outcome).toBe("scheduled");
  });
});

describe("at the open", () => {
  it("goes running and starts round 1's clock", () => {
    const s = settle(state({ outcome: "scheduled" }), OPEN);
    expect(s.outcome).toBe("running");
    expect(s.round).toBe(1);
    expect(s.bidClockEndsAt).toBe(OPEN + bidClockMs(1));
    expect(s.changed).toBe(true);
  });
});

describe("while nothing is due", () => {
  it("changes nothing", () => {
    const s = settle(state(), OPEN + 1_000);
    expect(s.changed).toBe(false);
    expect(s.round).toBe(1);
    expect(s.outcome).toBe("running");
  });

  it("derives the round clock from the open, not from now", () => {
    const s = settle(state(), OPEN + 1_000);
    expect(s.roundEndsAt).toBe(OPEN + roundEndOffsetMs(1));
  });
});

describe("the round clock", () => {
  it("advances a round when it expires with the bid clock still running", () => {
    const boundary = OPEN + roundEndOffsetMs(1);
    const s = settle(
      // A bid landed just before the boundary, so its 5-minute clock outlives
      // the round.
      state({ bidClockEndsAt: boundary + 200_000 }),
      boundary + 1,
    );
    expect(s.round).toBe(2);
    expect(s.outcome).toBe("running");
  });

  it("starts the new round's clock at the boundary, not at now", () => {
    const boundary = OPEN + roundEndOffsetMs(1);
    const s = settle(
      state({ bidClockEndsAt: boundary + 200_000 }),
      // Observed a full minute late — a deploy, a GC pause.
      boundary + 60_000,
    );
    /*
     * The bid clock for round 2 runs from the boundary. Measuring it from `now`
     * would silently hand every bidder a longer round than the format promises,
     * by however long the ticker happened to be delayed.
     */
    expect(s.bidClockEndsAt).toBe(boundary + bidClockMs(2));
  });
});

describe("the bid clock", () => {
  it("hammers to the standing leader when it reaches zero", () => {
    const s = settle(state({ bidClockEndsAt: OPEN + 10_000 }), OPEN + 10_001);
    expect(s.outcome).toBe("sold");
    expect(s.hammerRound).toBe(1);
    expect(s.settledAt).toBe(OPEN + 10_000);
  });

  it("goes unsold when the lot never drew a bid", () => {
    const s = settle(
      state({ bidClockEndsAt: OPEN + 10_000, leaderPaddle: null }),
      OPEN + 10_001,
    );
    expect(s.outcome).toBe("unsold");
  });

  it("settles at the moment the clock expired, not the moment it was noticed", () => {
    const expiry = OPEN + 10_000;
    // Server was down for five minutes.
    const s = settle(state({ bidClockEndsAt: expiry }), expiry + 300_000);
    expect(s.settledAt).toBe(expiry);
  });
});

describe("when both clocks expire together", () => {
  it("hammers rather than rolling into the next round", () => {
    /*
     * A bidder watching the clock hit zero has been told the lot is gone.
     * Advancing at that instant would take it back from whoever just won it.
     */
    const boundary = OPEN + roundEndOffsetMs(1);
    const s = settle(state({ bidClockEndsAt: boundary }), boundary);
    expect(s.outcome).toBe("sold");
    expect(s.hammerRound).toBe(1);
  });
});

describe("round 6", () => {
  it("ends the sale when its round clock runs out", () => {
    const end = saleEndsAt(OPEN);
    const s = settle(
      state({ round: 6, bidClockEndsAt: end + 10_000 }),
      end + 1,
    );
    expect(s.outcome).toBe("sold");
    expect(s.settledAt).toBe(end);
  });

  it("does not advance past round 6", () => {
    const end = saleEndsAt(OPEN);
    const s = settle(state({ round: 6, bidClockEndsAt: end + 1 }), end + 5_000);
    expect(s.round).toBe(6);
  });
});

describe("replaying missed boundaries", () => {
  /*
   * The scenario the whole design exists for: the ticker was not running when
   * these events were due. Settling must produce the state that WOULD have
   * existed, not the state as of the moment someone finally looked.
   */
  it("hammers in the round the clock actually expired in, not the round we noticed in", () => {
    const r1End = OPEN + roundEndOffsetMs(1);
    const s = settle(
      // A bid landed late in round 1, so its 5-minute clock outlives the round.
      state({ bidClockEndsAt: r1End + 60_000 }),
      // Observed 75 minutes in, by which point round 3 would have started.
      OPEN + roundEndOffsetMs(3),
    );
    expect(s.outcome).toBe("sold");
    /*
     * Round 2, not round 3. The boundary reset the bid clock to round 2's
     * 3-minute clock, which then expired unanswered 3 minutes into round 2 —
     * long before round 2's own boundary. The lot was over at that moment, so
     * replaying stops there rather than carrying on to where the observer is.
     */
    expect(s.round).toBe(2);
    expect(s.hammerRound).toBe(2);
    expect(s.settledAt).toBe(r1End + bidClockMs(2));
  });

  it("resets the bid clock at a round boundary, shortening a bid's lead", () => {
    /*
     * A bid placed one minute before the boundary buys 5 minutes of clock in
     * round 1 — but only until the boundary, where round 2's 3-minute clock
     * replaces it. That is the format ratcheting, and it is why a bid late in
     * a round is worth less than the same bid early in it.
     */
    const r1End = OPEN + roundEndOffsetMs(1);
    const s = settle(
      state({ bidClockEndsAt: r1End + 240_000 }),
      r1End + 1,
    );
    expect(s.round).toBe(2);
    expect(s.bidClockEndsAt).toBe(r1End + bidClockMs(2));
    expect(s.bidClockEndsAt).toBeLessThan(r1End + 240_000);
  });

  it("walks through several silent rounds without skipping any", () => {
    /*
     * No bid since the open, so each round's clock expires. Round 1's clock is
     * 5 minutes and round 1 is 25 minutes long, so the hammer falls inside
     * round 1 — it never reaches round 2 at all.
     */
    const s = settle(state(), OPEN + roundEndOffsetMs(6));
    expect(s.outcome).toBe("sold");
    expect(s.hammerRound).toBe(1);
    expect(s.settledAt).toBe(OPEN + bidClockMs(1));
  });

  it("terminates on a nonsense row rather than looping", () => {
    // A bid clock in the distant past with a round already past the last one.
    const s = settle(
      state({ round: 6, bidClockEndsAt: 0 }),
      OPEN + 10 * roundEndOffsetMs(6),
    );
    expect(["sold", "unsold"]).toContain(s.outcome);
  });
});

describe("terminal states", () => {
  it("does not un-sell a sold lot as time passes", () => {
    const s = settle(state({ outcome: "sold" }), OPEN + 10 * 60 * 60_000);
    expect(s.outcome).toBe("sold");
    expect(s.changed).toBe(false);
  });

  it("reports no further events", () => {
    const s = settle(state({ outcome: "unsold" }), OPEN);
    expect(nextEventAt(s)).toBeNull();
  });
});

describe("roundEndsAt", () => {
  it("matches the published schedule", () => {
    let elapsed = 0;
    for (const round of ROUNDS) {
      elapsed += round.durationMin;
      expect(roundEndsAt(OPEN, round.n)).toBe(OPEN + elapsed * 60_000);
    }
  });
});
