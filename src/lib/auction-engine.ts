import {
  TOTAL_ROUNDS,
  bidClockMs,
  roundEndOffsetMs,
} from "./auction";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * AUCTION ENGINE — the server's authority over time
 *
 * `src/lib/auction.ts` says what the rules ARE. This says where a given auction
 * has got to, given only the row and the current time. It is pure: no database,
 * no clock of its own, no I/O. That is deliberate — it makes the single most
 * consequential piece of logic in the system testable without a Postgres, and
 * it lets the same function run in three places that must agree:
 *
 *   1. the ticker, persisting round advances and hammers
 *   2. the bid path, deciding which round a bid actually lands in
 *   3. the SSE reader, rendering state that may be a moment ahead of the row
 *
 * ── Why replay rather than "advance one step" ────────────────────────────────
 *
 * The naive version advances a single round per tick. That is correct only
 * while the ticker never misses a beat. Miss ninety seconds — a deploy, a GC
 * pause, a restart — and a naive advance produces a state that never existed:
 * it moves the auction to round 2 at the moment it noticed, when the truth is
 * that round 2's bid clock also expired unanswered and the lot was hammered
 * forty seconds ago.
 *
 * So `settle` replays every boundary in order from where the row left off and
 * stops at the first terminal event, using the timestamp of the EVENT rather
 * than the timestamp of the observation. Downtime cannot change an outcome.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Outcome = "scheduled" | "running" | "sold" | "unsold";

/** The subset of the `auctions` row the engine reasons about. */
export interface EngineState {
  /** Epoch ms the sale opens. Round boundaries are all measured from here. */
  opensAt: number;
  round: number;
  currentPts: number;
  /** null before the first bid — an unanswered lot goes unsold, not sold. */
  leaderPaddle: string | null;
  /** Epoch ms. Reset to the round's full clock by every accepted bid. */
  bidClockEndsAt: number;
  outcome: Outcome;
}

export interface SettledState extends EngineState {
  /** Epoch ms the current round rolls over. Derived, never stored as truth. */
  roundEndsAt: number;
  /** Epoch ms the terminal event occurred, once outcome is sold/unsold. */
  settledAt: number | null;
  /** Which round the hammer fell in. */
  hammerRound: number | null;
  /** True when settling produced something the caller must persist. */
  changed: boolean;
}

/** Absolute epoch ms at which round `n` ends. */
export function roundEndsAt(opensAt: number, round: number): number {
  return opensAt + roundEndOffsetMs(round);
}

/** Absolute epoch ms at which the whole sale ends if nobody is hammered out. */
export function saleEndsAt(opensAt: number): number {
  return roundEndsAt(opensAt, TOTAL_ROUNDS);
}

/**
 * Where this auction actually is at `now`.
 *
 * Terminal states are returned untouched: a sold lot does not un-sell because
 * time passed.
 */
export function settle(state: EngineState, now: number): SettledState {
  if (state.outcome === "sold" || state.outcome === "unsold") {
    return {
      ...state,
      roundEndsAt: roundEndsAt(state.opensAt, state.round),
      settledAt: null,
      hammerRound: null,
      changed: false,
    };
  }

  let round = state.round;
  let outcome: Outcome = state.outcome;
  let bidClockEnds = state.bidClockEndsAt;
  let changed = false;
  let settledAt: number | null = null;
  let hammerRound: number | null = null;

  /*
   * The sale has not opened yet. Hold at `scheduled` — a bid before the open is
   * rejected on this, not on a clock comparison the client could get wrong.
   */
  if (now < state.opensAt) {
    return {
      ...state,
      outcome: "scheduled",
      roundEndsAt: roundEndsAt(state.opensAt, round),
      settledAt: null,
      hammerRound: null,
      changed: state.outcome !== "scheduled",
    };
  }

  if (outcome === "scheduled") {
    outcome = "running";
    changed = true;
    // The clock a bidder arriving at the open sees, before anyone has bid.
    bidClockEnds = state.opensAt + bidClockMs(round);
  }

  /*
   * Replay boundaries. Bounded by TOTAL_ROUNDS + 1 iterations, so a bad row
   * cannot spin here — a while(true) over timestamps read from the database is
   * exactly the kind of loop that takes a process down at 3am.
   */
  for (let guard = 0; guard <= TOTAL_ROUNDS + 1; guard++) {
    if (outcome !== "running") break;

    const roundEnds = roundEndsAt(state.opensAt, round);
    const nextEvent = Math.min(bidClockEnds, roundEnds);
    if (now < nextEvent) break;

    if (bidClockEnds <= roundEnds) {
      /*
       * The bid clock reached zero. The lot is hammered — to the standing
       * leader, or unsold if the lot never drew a bid.
       *
       * The `<=` matters: when both clocks expire on the same millisecond the
       * hammer wins. A bidder watching a clock hit zero has been told the lot
       * is gone, and rolling into another round at that instant would take it
       * back from whoever just won it.
       */
      outcome = state.leaderPaddle ? "sold" : "unsold";
      settledAt = bidClockEnds;
      hammerRound = round;
      changed = true;
      break;
    }

    if (round >= TOTAL_ROUNDS) {
      // Round 6's round clock running out ends the sale.
      outcome = state.leaderPaddle ? "sold" : "unsold";
      settledAt = roundEnds;
      hammerRound = round;
      changed = true;
      break;
    }

    round += 1;
    // The new, shorter clock starts at the boundary — not at `now`, which may
    // be later — so the round's full clock is exactly what bidders were told.
    bidClockEnds = roundEnds + bidClockMs(round);
    changed = true;
  }

  return {
    ...state,
    round,
    outcome,
    bidClockEndsAt: bidClockEnds,
    roundEndsAt: roundEndsAt(state.opensAt, round),
    settledAt,
    hammerRound,
    changed,
  };
}

/**
 * The next moment this auction needs attention, or null if it is finished.
 * The ticker sleeps until the earliest of these across all live lots rather
 * than polling on a fixed interval it has to guess at.
 */
export function nextEventAt(state: SettledState): number | null {
  if (state.outcome === "sold" || state.outcome === "unsold") return null;
  if (state.outcome === "scheduled") return state.opensAt;
  return Math.min(state.bidClockEndsAt, state.roundEndsAt);
}
