"use client";

import { useCallback, useState, useTransition } from "react";
import { Header } from "@/components/site/Header";
import { RollingNumber } from "@/components/site/RollingNumber";
import { LiveDot } from "@/components/lot/LotCard";
import { placeBid as submitBid } from "@/app/actions/bid";
import {
  LATE_ENTRY_FROM_ROUND,
  LATE_JOIN_PENALTY_PTS,
  ROUND_TIME_SCALE,
  TOTAL_ROUNDS,
} from "@/lib/auction";
import { ptsToMnt } from "@/lib/format";
import { t } from "@/lib/copy";
import type { RoomState } from "@/lib/types";
import { BidClock } from "./BidClock";
import { BidFeed } from "./BidFeed";
import { BidPanel } from "./BidPanel";
import { DecisionPanel } from "./DecisionPanel";
import { RoundTimer } from "./RoundTimer";
import { useAuctionRoom } from "./useAuctionRoom";
import { useFocusMode } from "./useFocusMode";

/** What the bidder is told when the server turns a bid down. */
const REJECTION_COPY: Record<string, string> = {
  "too-low": t.room.rejectTooLow,
  "round-closed": t.room.rejectClosed,
  "not-registered": t.room.rejectSignIn,
  "not-verified": t.room.rejectVerify,
  "insufficient-funds": t.room.rejectFunds,
  suspended: t.room.rejectSuspended,
  error: t.room.rejectError,
};

export function AuctionRoom({
  initialState,
  viewerPaddle,
  viewerName,
  canBid,
  balancePts,
}: {
  initialState: RoomState;
  /** null when signed out. The identity the lead is decided on. */
  viewerPaddle: string | null;
  /** null when signed out. What an optimistic bid of theirs shows. */
  viewerName: string | null;
  /** Signed in, verified and not suspended. The server checks this too. */
  canBid: boolean;
  /** The viewer's points. 0 when signed out. Only the join fee spends them. */
  balancePts: number;
}) {
  const { state, spec, isYourLead, leaderName, applyOptimistic, rollback, refetch } =
    useAuctionRoom(initialState, viewerPaddle, viewerName);
  const lot = state.lot;
  const [focus, setFocus] = useFocusMode();

  // Only startTransition — never the pending flag. The bid button shows no
  // loading state (the optimistic update is the feedback), so nothing reads it.
  const [, startTransition] = useTransition();
  const [rejection, setRejection] = useState<string | null>(null);

  /*
   * Optimistic bidding, unchanged in shape from the stubbed version: the bid is
   * applied on the click frame so the price and clock move immediately, and the
   * network call follows.
   *
   * What changed is what it is optimistic ABOUT. `submitBid` is now a Server
   * Function that re-validates against auction.ts under a row lock, so a
   * rejection here is a real rejection rather than a stub that never rejected.
   *
   * The idempotency key is generated once per attempt and travels with it. If
   * the connection drops after the server committed but before the response
   * arrived, the retry resolves to the bid that already landed instead of
   * placing a second one at a higher price.
   */
  function attemptBid(points: number) {
    const bidId = applyOptimistic(points);
    const idempotencyKey = crypto.randomUUID();
    setRejection(null);

    startTransition(async () => {
      const res = await submitBid(lot.id, points, idempotencyKey);
      if (!res.ok) {
        rollback(bidId);
        setRejection(REJECTION_COPY[res.reason] ?? t.room.rejectError);
      }
    });
  }

  /*
   * Which deadlines have run out on THIS screen, by value.
   *
   * Kept by value rather than as a flag so it clears itself: a bid that lands in
   * the last instant arrives as a new `bidClockEndsAt`, which no longer matches,
   * and the room is live again without anything having to reset it.
   */
  const [expiredBidClock, setExpiredBidClock] = useState<number | null>(null);
  const [expiredRound, setExpiredRound] = useState<number | null>(null);

  /*
   * Both clocks call these when they reach zero. They do not decide anything —
   * they reconnect the stream, and the server's first message is the truth. The
   * normal path is that the push has already arrived and they never fire.
   */
  const bidClockExpired = useCallback(() => {
    setExpiredBidClock(state.bidClockEndsAt);
    refetch();
  }, [state.bidClockEndsAt, refetch]);
  const roundExpired = useCallback(() => {
    setExpiredRound(state.roundEndsAt);
    refetch();
  }, [state.roundEndsAt, refetch]);

  const frozen = state.outcome !== "running";
  /*
   * Bidding is over and the house has not said who won.
   *
   * It is a THIRD state, not a flavour of frozen: the clocks are stopped like a
   * sold lot's, but there is no price to announce and no winner to name. Left
   * as "sold" the room would show a hammer figure nobody has agreed to; left as
   * "live" it would show a dead clock. What it shows instead is that something
   * is still happening and that this screen will say so.
   */
  const underReview = state.outcome === "review";

  /*
   * The last round's clock has hit zero here and the server has not said so yet.
   *
   * In rounds 1–5 a clock reaching zero moves the sale up a round; in round 6
   * there is nowhere to move, so it ends the lot (auction-engine.ts). The gap
   * before the push is usually well under a second, but for that second the
   * room used to show 0.0 above a live bid button the server would refuse. It
   * now goes straight to the wait it is about to be in.
   */
  const closing =
    state.outcome === "running" &&
    state.round >= TOTAL_ROUNDS &&
    (expiredBidClock === state.bidClockEndsAt ||
      expiredRound === state.roundEndsAt);
  const deciding = underReview || closing;

  /*
   * Focus mode is for BIDDING. Once there is nothing left to bid on, the room
   * goes back to its full self whatever the preference says: focus mode hides
   * the header, and a bidder looking at a result needs the way out of the room
   * and the name of what they just won or lost more than a bigger clock. The
   * preference itself is untouched, so the next live lot opens focused again.
   */
  const focused = focus && !frozen && !closing;

  /* With no bid panel to show, the wait or the result takes the rest of a
     phone screen rather than sitting at the foot of an empty one. */
  const panelFills = deciding || frozen;

  /*
   * The join fee, and whether this bidder can cover it.
   *
   * It is the ONLY thing a bid spends from the balance — the hammer price is
   * recorded as an obligation, never deducted — so this is the whole of what
   * "insufficient funds" can mean in the room, and it applies to exactly one
   * person: somebody entering a lot that is already past round 1.
   */
  const joinFeeApplies =
    !frozen && !state.hasBid && state.round >= LATE_ENTRY_FROM_ROUND;
  const shortOfJoinFee = joinFeeApplies && balancePts < LATE_JOIN_PENALTY_PTS;
  const bidClockTotalMs = spec.bidClockSec * 1000;
  const roundTotalMs = (spec.durationMin * 60_000) / ROUND_TIME_SCALE;

  return (
    /*
     * Phones: exactly one screen. The room is a column the height of the
     * dynamic viewport — header, the console, and the bid panel as the last
     * row IN the flow. The panel used to be `position: fixed` over a padded
     * page, which fitted only while the panel stayed its usual height; every
     * line it grew by (you lead, late entry, a rejection) slid over the price.
     * In the flow it pushes instead, and if a very short screen still cannot
     * hold everything, the console scrolls under a panel that never moves.
     *
     * From lg up the page flows as before: two columns, sticky sidebar.
     *
     * ⚠ If any animation is ever put back on this element, it must be OPACITY
     * ONLY. No transform or filter here — no entrance animation at all, in fact:
     * the price and the bid button should be legible on the frame they arrive,
     * because a five-second clock may already be running.
     */
    <div className="bg-ground text-ink flex h-dvh flex-col lg:block lg:h-auto lg:min-h-dvh">
      {/* Focus mode drops the site header; the toggle below is the way back. */}
      {!focused && <Header minimal />}

      {/*
        The room is deliberately spare: no object plate, no catalogue facts, no
        prose note. Those belong to the catalogue page (LotPreview). What is left
        is the console a bidder acts on — the two timers, the price, the panel —
        and focus mode takes away the rest of the words as well.
      */}
      <main
        id="main"
        className={`gutter flex min-h-0 flex-1 flex-col lg:block lg:pb-16 ${
          focused ? "pt-3 lg:pt-6" : "pt-3 sm:pt-5 lg:pt-8"
        }`}
      >
        <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start lg:gap-10">
          {/* ── Left: identity, the two clocks, price, feed ──────────────── */}
          <div
            className={`scroll-quiet flex min-h-0 flex-col overflow-y-auto pb-3 lg:overflow-visible lg:pb-0 ${
              panelFills ? "flex-none" : "flex-1"
            } ${
              focused ? "gap-3" : "gap-3.5 short:gap-2.5 lg:gap-6"
            }`}
          >
            {/* Identity — one status line and the name. The maker and year
                are the first thing to go when the screen is short. */}
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-3">
                <p className="eyebrow flex min-w-0 items-center gap-2">
                  {!frozen && !closing && <LiveDot />}
                  <span
                    className={
                      deciding ? "text-flare" : frozen ? "" : "text-rust"
                    }
                  >
                    {deciding
                      ? t.room.review
                      : frozen
                        ? t.room.sold
                        : t.room.live}
                  </span>
                  <span aria-hidden className="text-line-strong">
                    /
                  </span>
                  <span className="truncate">{lot.code}</span>
                </p>
                {!frozen && !closing && (
                  <FocusToggle on={focus} onChange={setFocus} />
                )}
              </div>
              {/* In focus mode the name leaves the screen but not the page:
                  it is still the heading a screen reader lands on. */}
              <h1
                className={
                  focused
                    ? "sr-only"
                    : "mt-1.5 truncate text-lg leading-tight font-medium tracking-[-0.03em] sm:text-2xl lg:overflow-visible lg:whitespace-normal"
                }
              >
                {lot.title}
              </h1>
              {!focused && (
                <p className="text-muted mt-0.5 text-sm short:hidden">
                  {lot.maker} · {lot.year}
                </p>
              )}
            </div>

            {/*
              Joining a sale already under way is chargeable, so it is disclosed
              on arrival — before the bid, not after it, which would be a dark
              pattern however small. Kept in focus mode for the same reason: it
              is part of the bid, not decoration around it. It disappears on
              this bidder's first bid, by which point they have accepted it.

              ⚠ Gated on the ROUND. `placeBid` charges the join fee only from
              LATE_ENTRY_FROM_ROUND onward — round 1 is free — and a disclosure
              that overstates a charge is still a wrong disclosure.
            */}
            {joinFeeApplies && !deciding && (
              <p className="border-flare/60 text-ink-soft flex flex-wrap items-baseline gap-x-2 gap-y-1 border-l-2 pl-3 text-xs leading-snug">
                <span className="eyebrow text-flare">
                  {t.room.joinPenaltyLabel}
                </span>
                <span>{t.room.joinPenalty(LATE_JOIN_PENALTY_PTS)}</span>
              </p>
            )}

            {/*
              The console: bid clock and round clock. Side by side normally, so
              the whole clock situation is one glance; in focus mode the bid
              clock takes the height and the round becomes one row beneath it.

              Only while bids are being taken. Once the lot closes both clocks
              read 00:00 and neither counts towards anything — the round clock
              would even keep running down to a round that will never start —
              and two dead timers beside a result read as a frozen page.
            */}
            {!frozen && !closing &&
              (focused ? (
                <div className="flex min-h-48 flex-1 flex-col gap-2.5 lg:min-h-80">
                  <div className="min-h-0 flex-1">
                    <BidClock
                      endsAt={state.bidClockEndsAt}
                      totalMs={bidClockTotalMs}
                      frozen={frozen}
                      onExpire={bidClockExpired}
                      focus
                    />
                  </div>
                  <RoundTimer
                    round={state.round}
                    roundEndsAt={state.roundEndsAt}
                    roundTotalMs={roundTotalMs}
                    frozen={frozen}
                    onExpire={roundExpired}
                    strip
                  />
                </div>
              ) : (
                <div className="grid grid-cols-[1.35fr_1fr] items-stretch gap-2.5 sm:gap-3">
                  <BidClock
                    endsAt={state.bidClockEndsAt}
                    totalMs={bidClockTotalMs}
                    frozen={frozen}
                    onExpire={bidClockExpired}
                  />
                  <RoundTimer
                    round={state.round}
                    roundEndsAt={state.roundEndsAt}
                    roundTotalMs={roundTotalMs}
                    frozen={frozen}
                    onExpire={roundExpired}
                  />
                </div>
              ))}

            {/* Current price + leader. One row; in focus mode a smaller one,
                without the tugrik conversion. */}
            <div
              className={`border-line flex items-end justify-between gap-4 border-b sm:gap-6 ${
                focused ? "pb-3" : "pb-3.5 short:pb-2.5 lg:pb-5"
              }`}
            >
              {/* The price never gives way; a long name does, by truncating —
                  wrapping it onto its own line cost the phone a whole row. */}
              <div className="shrink-0">
                <p className="eyebrow">
                  {underReview ? t.room.reviewStanding : t.room.currentPrice}
                </p>
                {/* The headline number rolls rather than swaps. aria-live sits
                    on the wrapper with plain text, so assistive tech announces
                    "1 208 оноо" once instead of narrating every digit. */}
                <p
                  aria-live="polite"
                  aria-atomic="true"
                  className={`display text-ink leading-none ${
                    focused
                      ? "mt-1.5 text-[clamp(2rem,8vw,2.75rem)]"
                      : "mt-2 text-[clamp(2.5rem,9vw,3.75rem)] short:mt-1.5 short:text-[2.25rem]"
                  }`}
                >
                  <RollingNumber value={state.currentPts} />
                  <span className="text-muted ml-2 align-baseline text-base font-normal tracking-normal">
                    {t.common.point}
                  </span>
                </p>
                {!focused && (
                  <p data-numerals className="text-muted mt-1.5 text-sm short:mt-1">
                    {ptsToMnt(state.currentPts)}
                  </p>
                )}
              </div>

              <div className="min-w-0 text-right">
                <p className="eyebrow">{t.room.leader}</p>
                <p
                  data-numerals
                  className={`truncate font-medium ${
                    focused ? "mt-1.5 text-xl" : "mt-2 text-2xl short:mt-1.5 short:text-xl"
                  } ${isYourLead ? "text-flare" : "text-ink"}`}
                >
                  {state.leader
                    ? isYourLead
                      ? t.room.you
                      : leaderName
                    : "—"}
                </p>
                {state.hasBid && !isYourLead && !frozen && (
                  <p className="text-rust mt-1 text-xs font-medium">
                    {t.room.outbid}
                  </p>
                )}
                {underReview && isYourLead && (
                  <p className="text-flare mt-1 text-xs font-medium">
                    {t.room.reviewYouStanding}
                  </p>
                )}
              </div>
            </div>

            {/* The feed is richness, not a control — kept on the desktop where
                there is room beneath the fold, dropped on phones and in focus
                mode where it would only push the console around. */}
            {!focused && (
              <div className="hidden lg:block">
                <BidFeed bids={state.bids} />
              </div>
            )}
          </div>

          {/* ── Right: the bid panel. The last row of the column on phones,
              bled to the screen edges; a sticky sidebar from lg up. Either way
              it is on screen with the clocks, never a scroll away. ────────── */}
          <aside
            className={`-mx-5 md:-mx-10 lg:sticky lg:top-24 lg:mx-0 lg:block ${
              panelFills ? "flex min-h-0 flex-1 flex-col" : "shrink-0"
            }`}
          >
            {deciding ? (
              <DecisionPanel
                phase={underReview ? "review" : "closing"}
                bids={state.bids}
              />
            ) : (
              <BidPanel
                state={state}
                isYourLead={isYourLead}
                leaderName={leaderName}
                canBid={canBid}
                balancePts={balancePts}
                shortOfJoinFee={shortOfJoinFee}
                rejection={rejection}
                onBid={attemptBid}
              />
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

/**
 * Focus mode on and off.
 *
 * The label says what pressing it DOES — "Фокус" to go in, "Бүгдийг харах" to
 * come back out — rather than carrying an on/off state a bidder has to decode
 * in the middle of a sale. With the header gone in focus mode this is the only
 * way out, so it stays in the same corner in both states.
 */
function FocusToggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      title={on ? undefined : t.room.focusHint}
      className={`eyebrow flex h-8 shrink-0 touch-manipulation items-center gap-1.5 rounded-full border px-3 text-[0.625rem] transition-colors max-[22rem]:px-2.5 ${
        on
          ? "border-flare/60 text-flare hover:border-flare"
          : "border-line-strong/30 text-ink-soft hover:border-accent hover:text-accent"
      }`}
    >
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        {on ? (
          // Corners pointing out: back to the whole room.
          <path d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4" />
        ) : (
          // Corners pointing in: close in on the clock.
          <path d="M2 6h4V2M14 6h-4V2M2 10h4v4M14 10h-4v4" />
        )}
      </svg>
      {/* Icon only on the narrowest phones, where the long label pushed the
          lot code off the line; the words stay for screen readers. */}
      <span className="max-[22rem]:sr-only">
        {on ? t.room.focusOff : t.room.focusOn}
      </span>
    </button>
  );
}
