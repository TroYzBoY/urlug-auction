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

describe("the SOFT clock — the bid clock", () => {
  it("moves the sale up a round rather than ending it", () => {
    /*
     * The rule this file exists to pin down. Silence costs a gear, not the lot:
     * a quiet round 1 drops the answer time from five minutes to three, and
     * anybody may still bid in round 2.
     */
    const expiry = OPEN + 10_000;
    const s = settle(state({ bidClockEndsAt: expiry }), expiry + 1);

    expect(s.outcome).toBe("running");
    expect(s.round).toBe(2);
    expect(s.settledAt).toBeNull();
  });

  it("starts the next round's clock at the moment it expired", () => {
    /*
     * At the expiry, not at `now` and not at the round boundary the sale never
     * reached — round 2's bidders get round 2's full three minutes.
     */
    const expiry = OPEN + 10_000;
    const s = settle(state({ bidClockEndsAt: expiry }), expiry + 1);
    expect(s.bidClockEndsAt).toBe(expiry + bidClockMs(2));
  });

  it("leaves the HARD boundaries where they were", () => {
    /*
     * Advancing early does not move the schedule. Round 2 still ends when it
     * was always going to, which is what keeps the sale inside 2h45m however
     * quiet the room gets.
     */
    const expiry = OPEN + 10_000;
    const s = settle(state({ bidClockEndsAt: expiry }), expiry + 1);
    expect(s.roundEndsAt).toBe(OPEN + roundEndOffsetMs(2));
  });

  it("does end the sale in round 6, where there is no round to move up to", () => {
    const expiry = OPEN + roundEndOffsetMs(5) + 5_000;
    const s = settle(
      state({ round: 6, bidClockEndsAt: expiry }),
      expiry + 1,
    );
    expect(s.outcome).toBe("review");
    expect(s.hammerRound).toBe(6);
    expect(s.settledAt).toBe(expiry);
  });

  it("goes unsold when the lot never drew a bid", () => {
    const expiry = OPEN + roundEndOffsetMs(5) + 5_000;
    const s = settle(
      state({ round: 6, bidClockEndsAt: expiry, leaderPaddle: null }),
      expiry + 1,
    );
    expect(s.outcome).toBe("unsold");
  });

  it("settles at the moment the clock expired, not the moment it was noticed", () => {
    const expiry = OPEN + roundEndOffsetMs(5) + 5_000;
    // Server was down for five minutes.
    const s = settle(
      state({ round: 6, bidClockEndsAt: expiry }),
      expiry + 300_000,
    );
    expect(s.settledAt).toBe(expiry);
  });
});

describe("when both clocks expire together", () => {
  it("advances exactly one round, not two", () => {
    /*
     * Both clocks now do the same thing, so the tie no longer decides an
     * outcome — but it must still be ONE advance. Counting the same instant
     * twice would skip a round the bidders were promised.
     */
    const boundary = OPEN + roundEndOffsetMs(1);
    const s = settle(state({ bidClockEndsAt: boundary }), boundary);
    expect(s.outcome).toBe("running");
    expect(s.round).toBe(2);
    expect(s.bidClockEndsAt).toBe(boundary + bidClockMs(2));
  });
});

describe("round 6", () => {
  it("ends the sale when its round clock runs out", () => {
    const end = saleEndsAt(OPEN);
    const s = settle(
      state({ round: 6, bidClockEndsAt: end + 10_000 }),
      end + 1,
    );
    expect(s.outcome).toBe("review");
    expect(s.settledAt).toBe(end);
  });

  it("is the only round either clock can end the sale in", () => {
    /*
     * Walked explicitly rather than asserted round by round: from a silent
     * open, every boundary in rounds 1–5 must leave the sale running.
     */
    for (let round = 1; round < 6; round++) {
      const expiry = OPEN + roundEndOffsetMs(round);
      const s = settle(state({ round, bidClockEndsAt: expiry }), expiry + 1);
      expect(s.outcome).toBe("running");
      expect(s.round).toBe(round + 1);
    }
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
  it("cascades through the gears when nobody answers, and stops at round 6", () => {
    /*
     * The shape of the new format, replayed in one go.
     *
     * A bid lands late in round 1, so its five-minute clock outlives the round
     * boundary. From there nobody answers, and each expiry buys the room a
     * shorter clock rather than ending the lot:
     *
     *   r1End          → round 2, 3 minutes
     *   +3min          → round 3, 1 minute
     *   +1min          → round 4, 30 seconds
     *   +30s           → round 5, 15 seconds
     *   +15s           → round 6, 5 seconds
     *   +5s            → over
     *
     * Observed long afterwards, and the answer is the state that WOULD have
     * existed — not the state as of the moment somebody finally looked.
     */
    const r1End = OPEN + roundEndOffsetMs(1);
    const closedAt =
      r1End +
      bidClockMs(2) +
      bidClockMs(3) +
      bidClockMs(4) +
      bidClockMs(5) +
      bidClockMs(6);

    const s = settle(
      state({ bidClockEndsAt: r1End + 60_000 }),
      OPEN + roundEndOffsetMs(3),
    );

    expect(s.outcome).toBe("review");
    expect(s.round).toBe(6);
    expect(s.hammerRound).toBe(6);
    expect(s.settledAt).toBe(closedAt);
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

  it("walks through every silent round without skipping any", () => {
    /*
     * Nothing since the open, so each round's soft clock expires unanswered.
     * The sale runs all the way down the gears and closes about ten minutes in
     * — the sum of the six bid clocks — rather than at round 1's boundary
     * twenty-five minutes in, and rather than at the 2h45m end.
     */
    const closedAt =
      OPEN +
      bidClockMs(1) +
      bidClockMs(2) +
      bidClockMs(3) +
      bidClockMs(4) +
      bidClockMs(5) +
      bidClockMs(6);

    const s = settle(state(), OPEN + roundEndOffsetMs(6));
    expect(s.outcome).toBe("review");
    expect(s.round).toBe(6);
    expect(s.hammerRound).toBe(6);
    expect(s.settledAt).toBe(closedAt);
    // Under ten and a half minutes, against a scheduled 2h45m.
    expect(closedAt - OPEN).toBeLessThan(11 * 60_000);
  });

  it("lets a single bid at any point in the descent reset the clock", () => {
    /*
     * The reason the cascade is not just a faster way to kill a lot. A bidder
     * who turns up in round 4 buys the room round 4's full thirty seconds, and
     * the sale carries on from there.
     */
    const r4Bid = OPEN + 9 * 60_000;
    const s = settle(
      state({ round: 4, bidClockEndsAt: r4Bid + bidClockMs(4) }),
      r4Bid + 1_000,
    );
    expect(s.outcome).toBe("running");
    expect(s.round).toBe(4);
    expect(s.changed).toBe(false);
  });

  it("terminates on a nonsense row rather than looping", () => {
    // A bid clock in the distant past with a round already past the last one.
    const s = settle(
      state({ round: 6, bidClockEndsAt: 0 }),
      OPEN + 10 * roundEndOffsetMs(6),
    );
    expect(["review", "unsold"]).toContain(s.outcome);
  });
});

describe("terminal states", () => {
  it("does not un-sell a sold lot as time passes", () => {
    const s = settle(state({ outcome: "sold" }), OPEN + 10 * 60 * 60_000);
    expect(s.outcome).toBe("sold");
    expect(s.changed).toBe(false);
  });

  it("does not award a lot in review just because nobody looked at it", () => {
    /*
     * The whole point of the state: a week of silence must leave the lot
     * exactly where the clock left it, waiting on a person.
     */
    const s = settle(state({ outcome: "review" }), OPEN + 7 * 24 * 60 * 60_000);
    expect(s.outcome).toBe("review");
    expect(s.changed).toBe(false);
    expect(nextEventAt(s)).toBeNull();
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
