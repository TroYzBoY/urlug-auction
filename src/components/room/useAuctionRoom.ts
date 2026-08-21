"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { ROUNDS, roundSpec } from "@/lib/auction";
import { serverNow, syncServerClock } from "@/lib/server-clock";
import type { Bid, RoomState } from "@/lib/types";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ROOM
 *
 * The server owns the auction. This hook owns one job: showing what the server
 * says, without the gap between a tap and a network round trip being visible.
 *
 *   • Initial state is server-rendered into the page, so the first paint is
 *     correct with no loading state.
 *   • An SSE stream pushes every subsequent state. Rounds advancing, the hammer
 *     falling and rivals' bids all arrive that way — there is no local
 *     simulation and no local decision about when a lot ends.
 *   • Your own bid is applied optimistically on the click frame and reconciled
 *     when the push arrives.
 *
 * ── Why the local reducer still exists ───────────────────────────────────────
 *
 * Only for the optimistic bid. It is not a second copy of the rules: it cannot
 * advance a round, cannot hammer a lot, and every server push replaces it
 * wholesale. What it does is stop the price and the clock freezing for the
 * ~100ms between the tap and the push — which, in round 6, is a fifth of the
 * clock.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** How long an optimistic bid may stand before it is assumed lost. */
const OPTIMISTIC_TTL_MS = 6_000;

type Action =
  /** Authoritative. Replaces everything the server owns. */
  | { type: "sync"; state: RoomState }
  /** Local prediction of a bid this client just sent. */
  | { type: "optimistic"; bid: Bid; bidClockEndsAt: number }
  /** The server rejected it, or it timed out. */
  | { type: "rollback"; bidId: string };

interface State {
  /** The last state the server sent. Never modified locally. */
  server: RoomState;
  /** Unconfirmed local bids, oldest first. Usually empty, rarely more than 1. */
  pending: { bid: Bid; bidClockEndsAt: number }[];
}

/**
 * The server state with any unconfirmed local bids laid over it.
 *
 * A pending bid is dropped once the server's price has reached or passed it:
 * that is the confirmation. Matching on id would not work — the server assigns
 * its own — and matching on the feed would fail whenever the bid fell outside
 * the 40 most recent.
 */
function project(state: State): RoomState {
  const live = state.pending.filter((p) => p.bid.points > state.server.currentPts);
  if (live.length === 0) return state.server;

  const top = live[live.length - 1]!;
  return {
    ...state.server,
    currentPts: top.bid.points,
    leader: top.bid.paddle,
    bidClockEndsAt: top.bidClockEndsAt,
    hasBid: true,
    bids: [...live.map((p) => p.bid).reverse(), ...state.server.bids].slice(0, 40),
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "sync":
      return {
        server: action.state,
        // Anything the server has now priced past is confirmed and no longer
        // needs to be projected.
        pending: state.pending.filter(
          (p) => p.bid.points > action.state.currentPts,
        ),
      };

    case "optimistic":
      return {
        ...state,
        pending: [
          ...state.pending,
          { bid: action.bid, bidClockEndsAt: action.bidClockEndsAt },
        ],
      };

    case "rollback":
      return {
        ...state,
        pending: state.pending.filter((p) => p.bid.id !== action.bidId),
      };
  }
}

/**
 * @param initial      Server-rendered RoomState, so the first paint is correct.
 * @param viewerPaddle This bidder's paddle, read from the session on the
 *                     server. null when signed out — the room is then
 *                     read-only, which the panel enforces.
 */
export function useAuctionRoom(initial: RoomState, viewerPaddle: string | null) {
  const [internal, dispatch] = useReducer(reducer, {
    server: initial,
    pending: [],
  });

  /*
   * Sync from the server-rendered state on mount as well as from the stream.
   * The page may have been served from a cache or sat in a background tab, in
   * which case `serverNow` is stale — but it is still a better reference than
   * an unmeasured browser clock, and the first push corrects it within a
   * second.
   */
  useEffect(() => {
    syncServerClock(initial.serverNow);
  }, [initial.serverNow]);

  const state = useMemo(() => project(internal), [internal]);
  const lotId = internal.server.lot.id;

  /*
   * Bumped to force the stream to reconnect. Reconnecting is how this asks for
   * a fresh full state: the handler sends one as its first event, so there is
   * no second read path to keep in step with the first.
   */
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const refetch = useCallback(() => setReconnectNonce((n) => n + 1), []);

  /* ── The stream ──────────────────────────────────────────────────────────
   *
   * EventSource, not a hand-rolled fetch loop: it reconnects on its own with
   * backoff, which is most of what this would otherwise have to implement.
   * Each reconnect re-runs the handler on the server and the first thing sent
   * is a full state, so a bidder who was in a tunnel comes back to the truth
   * rather than to a diff they missed the start of.
   */
  useEffect(() => {
    const source = new EventSource(`/api/room/${encodeURIComponent(lotId)}/stream`);

    source.addEventListener("state", (event) => {
      try {
        const next = JSON.parse((event as MessageEvent<string>).data) as RoomState;
        syncServerClock(next.serverNow);
        dispatch({ type: "sync", state: next });
      } catch (err) {
        console.error("[room] malformed state push", err);
      }
    });

    /*
     * EventSource reports every disconnect as an error and then retries by
     * itself. Nothing to do but note it — closing the source here would turn a
     * momentary blip into a permanently dead room.
     */
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) {
        console.warn("[room] stream closed; EventSource will retry");
      }
    };

    return () => source.close();
  }, [lotId, reconnectNonce]);

  /* ── Optimistic bids ─────────────────────────────────────────────────── */

  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const applyOptimistic = useCallback(
    (points: number): string => {
      const paddle = viewerPaddle ?? "—";
      const now = serverNow();
      const id = `local-${now}-${points}`;
      const clockMs = roundSpec(internal.server.round).bidClockSec * 1000;

      /*
       * `serverNow()`, not `Date.now()` — the projected deadline is counted down
       * against the corrected clock, so producing it from the uncorrected one
       * would make the optimistic clock jump by the offset the instant the
       * server's real deadline replaced it.
       */
      dispatch({
        type: "optimistic",
        bid: { id, paddle, points, round: internal.server.round, at: now, isYou: true },
        bidClockEndsAt: now + clockMs,
      });

      /*
       * A bid whose response never arrives — the tab slept, the request was
       * dropped — must not leave the price showing a lead this bidder does not
       * have. After the TTL the projection reverts to whatever the server last
       * said, which is the truth.
       */
      timers.current.set(
        id,
        setTimeout(() => {
          timers.current.delete(id);
          dispatch({ type: "rollback", bidId: id });
        }, OPTIMISTIC_TTL_MS),
      );

      return id;
    },
    [internal.server.round, viewerPaddle],
  );

  const rollback = useCallback((bidId: string) => {
    const timer = timers.current.get(bidId);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(bidId);
    }
    dispatch({ type: "rollback", bidId });
  }, []);

  /* Clear pending timers on unmount, or they fire into a dead component. */
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, []);

  const derived = useMemo(
    () => ({
      spec: roundSpec(state.round),
      roundsTotal: ROUNDS.length,
      isYourLead: viewerPaddle !== null && state.leader === viewerPaddle,
    }),
    [state.round, state.leader, viewerPaddle],
  );

  return { state, ...derived, applyOptimistic, rollback, refetch };
}
