import { describe, expect, it } from "vitest";
import { finalCloseOf } from "./FinalLog";
import type { RoomState } from "@/lib/types";

const T = 1_800_000_000_000;

function state(over: Partial<RoomState>): RoomState {
  return {
    serverNow: T,
    lot: {} as RoomState["lot"],
    round: 6,
    currentPts: 1300,
    leader: "Т-200",
    bidClockEndsAt: T,
    roundEndsAt: T + 60_000,
    closedAt: null,
    bids: [],
    hasBid: false,
    outcome: "sold",
    ...over,
  };
}

describe("how the final round closed", () => {
  it("is nothing while bidding is open", () => {
    expect(finalCloseOf(state({ outcome: "running" }), false)).toBeNull();
  });

  it("is the bid clock when the close is stamped with the bid clock's deadline", () => {
    expect(finalCloseOf(state({ closedAt: T }), true)).toEqual({
      by: "bid-clock",
    });
  });

  it("forgives the millisecond a stored timestamp can drift", () => {
    expect(finalCloseOf(state({ closedAt: T - 1 }), true)).toEqual({
      by: "bid-clock",
    });
  });

  it("is the round clock, with the bid clock that was still left", () => {
    expect(
      finalCloseOf(
        state({ bidClockEndsAt: T + 1_009, roundEndsAt: T, closedAt: T }),
        true,
      ),
    ).toEqual({ by: "round-clock", bidClockLeftMs: 1_009 });
  });

  it("is a stop when bidding ended before either clock did", () => {
    // An operator's emergency close: neither deadline had been reached.
    expect(
      finalCloseOf(
        state({
          bidClockEndsAt: T + 3_200,
          roundEndsAt: T + 60_000,
          closedAt: T,
        }),
        true,
      ),
    ).toEqual({ by: "stopped", bidClockLeftMs: 3_200 });
  });

  it("reads the deadlines alone before the server has answered", () => {
    // This screen's clock hit zero; no closedAt has arrived yet.
    expect(
      finalCloseOf(state({ outcome: "running", closedAt: null }), true),
    ).toEqual({ by: "bid-clock" });
  });
});
