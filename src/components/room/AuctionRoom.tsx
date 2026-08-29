"use client";

import { useState, useTransition } from "react";
import { Header } from "@/components/site/Header";
import { RollingNumber } from "@/components/site/RollingNumber";
import { LiveDot } from "@/components/lot/LotCard";
import { placeBid as submitBid } from "@/app/actions/bid";
import { LATE_JOIN_PENALTY_PTS, ROUND_TIME_SCALE } from "@/lib/auction";
import { ptsToMnt } from "@/lib/format";
import { t } from "@/lib/copy";
import type { RoomState } from "@/lib/types";
import { Spinner } from "@/components/site/Spinner";
import { BidClock } from "./BidClock";
import { BidFeed } from "./BidFeed";
import { BidPanel } from "./BidPanel";
import { RoundTimer } from "./RoundTimer";
import { useAuctionRoom } from "./useAuctionRoom";

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
}: {
  initialState: RoomState;
  /** null when signed out. The identity the lead is decided on. */
  viewerPaddle: string | null;
  /** null when signed out. What an optimistic bid of theirs shows. */
  viewerName: string | null;
  /** Signed in, verified and not suspended. The server checks this too. */
  canBid: boolean;
}) {
  const { state, spec, isYourLead, leaderName, applyOptimistic, rollback, refetch } =
    useAuctionRoom(initialState, viewerPaddle, viewerName);
  const lot = state.lot;

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
   * Both clocks call this when they reach zero. It does not decide anything —
   * it reconnects the stream, and the server's first message is the truth. The
   * normal path is that the push has already arrived and this never fires.
   */
  const requestServerState = refetch;

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
  const bidClockTotalMs = spec.bidClockSec * 1000;
  const roundTotalMs = (spec.durationMin * 60_000) / ROUND_TIME_SCALE;

  return (
    <div className="min-h-dvh bg-ground text-ink">
      <Header minimal />

      {/*
        No entrance animation. The room used to fade in over ~700ms, which read
        well and was wrong for the one page where a five-second clock might
        already be running — the price and the bid button should be legible on
        the frame they arrive.

        ⚠ If any animation is ever put back here, it must be OPACITY ONLY.
        BidPanel is a descendant and is `position: fixed` on phones; a
        transform, filter or backdrop-filter on this element makes it the
        containing block and un-pins the panel from the viewport, dropping it
        hundreds of pixels below the fold for the duration. That was shipped
        once and fixed once.

        The room is deliberately spare: no object plate, no catalogue facts, no
        prose note. Those belong to the catalogue page (LotPreview) — in here
        they only pushed the two clocks and the bid button below the fold. What
        is left is the console a bidder actually acts on: the two timers side by
        side, the price, and the panel. It fits one screen on a phone and on a
        desktop both.
      */}
      <main
        id="main"
        className="gutter pt-4 pb-60 sm:pt-5 lg:pt-8 lg:pb-16"
      >
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-10">
          {/* ── Left: identity, the two clocks, price, feed ──────────────── */}
          <div className="flex min-w-0 flex-col gap-5 lg:gap-6">
            {/* Identity — compact. The object plate lives on the catalogue
                page; here the code, the name and the maker are enough to know
                what is on the block. */}
            <div className="min-w-0">
              <p className="eyebrow flex items-center gap-2">
                {!frozen && <LiveDot />}
                <span
                  className={
                    underReview ? "text-flare" : frozen ? "" : "text-rust"
                  }
                >
                  {underReview
                    ? t.room.review
                    : frozen
                      ? t.room.sold
                      : t.room.live}
                </span>
                <span aria-hidden className="text-line-strong">
                  /
                </span>
                {lot.code}
              </p>
              <h1 className="mt-1.5 text-xl leading-tight font-medium tracking-[-0.03em] sm:text-2xl">
                {lot.title}
              </h1>
              <p className="mt-1 text-sm text-muted">
                {lot.maker} · {lot.year}
              </p>
            </div>

            {/*
              Joining a sale already under way is chargeable, so it is disclosed
              on arrival — before the bid, not after it, which would be a dark
              pattern however small. One compact line rather than the boxed
              banner it used to be; it disappears on this bidder's first bid, by
              which point they have accepted it.
            */}
            {underReview && <ReviewNotice />}

            {!frozen && !state.hasBid && (
              <p className="border-flare/60 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-l-2 pl-3 text-xs leading-snug text-ink-soft">
                <span className="eyebrow text-flare">
                  {t.room.joinPenaltyLabel}
                </span>
                <span>{t.room.joinPenalty(LATE_JOIN_PENALTY_PTS)}</span>
              </p>
            )}

            {/* ── The console: bid clock and round clock, side by side, on
                every screen. The round time reads right next to the bid time
                so the whole clock situation is one glance. ───────────────── */}
            {/*
              Hidden under review. Both clocks would read 00:00 and neither is
              counting towards anything — two dead timers beside a "being
              checked" message read as a frozen page rather than as a wait.
            */}
            {!underReview && (
              <div className="grid grid-cols-[1.35fr_1fr] items-stretch gap-2.5 sm:gap-3">
                <BidClock
                  endsAt={state.bidClockEndsAt}
                  totalMs={bidClockTotalMs}
                  frozen={frozen}
                  onExpire={requestServerState}
                />
                <RoundTimer
                  round={state.round}
                  roundEndsAt={state.roundEndsAt}
                  roundTotalMs={roundTotalMs}
                  frozen={frozen}
                  onExpire={requestServerState}
                />
              </div>
            )}

            {/* Current price + leader */}
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-line pb-5">
              <div>
                <p className="eyebrow">
                  {underReview ? t.room.reviewStanding : t.room.currentPrice}
                </p>
                {/* The headline number rolls rather than swaps. aria-live sits
                    on the wrapper with plain text, so assistive tech announces
                    "1 208 оноо" once instead of narrating every digit. */}
                <p
                  aria-live="polite"
                  aria-atomic="true"
                  className="display mt-2 text-[clamp(2.5rem,9vw,3.75rem)] leading-none text-ink"
                >
                  <RollingNumber value={state.currentPts} />
                  <span className="ml-2 align-baseline text-base font-normal tracking-normal text-muted">
                    {t.common.point}
                  </span>
                </p>
                <p data-numerals className="mt-1.5 text-sm text-muted">
                  {ptsToMnt(state.currentPts)}
                </p>
              </div>

              <div className="text-right">
                <p className="eyebrow">{t.room.leader}</p>
                <p
                  data-numerals
                  className={`mt-2 text-2xl font-medium ${
                    isYourLead ? "text-flare" : "text-ink"
                  }`}
                >
                  {state.leader
                    ? isYourLead
                      ? t.room.you
                      : leaderName
                    : "—"}
                </p>
                {state.hasBid && !isYourLead && !frozen && (
                  <p className="mt-1 text-xs font-medium text-rust">
                    {t.room.outbid}
                  </p>
                )}
                {underReview && isYourLead && (
                  <p className="mt-1 text-xs font-medium text-flare">
                    {t.room.reviewYouStanding}
                  </p>
                )}
              </div>
            </div>

            {/* The feed is richness, not a control — kept on the desktop where
                there is room beneath the fold, dropped on phones where it would
                only push the console around. */}
            <div className="hidden lg:block">
              <BidFeed bids={state.bids} />
            </div>
          </div>

          {/* ── Right: the bid panel. Fixed to the foot of the viewport on
              phones, a sticky sidebar from lg up — either way it is the thing
              on screen with the clocks, never a scroll away. ──────────────── */}
          <aside className="lg:sticky lg:top-24">
            <BidPanel
              state={state}
              isYourLead={isYourLead}
              leaderName={leaderName}
              canBid={canBid}
              rejection={rejection}
              onBid={attemptBid}
            />
          </aside>
        </div>
      </main>
    </div>
  );
}

/**
 * "Being checked" — what the room shows between the clock stopping and the
 * house naming a winner.
 *
 * `role="status"` with `aria-live="polite"` because it appears mid-session,
 * replacing a bid panel somebody may have had focus in. See site/Spinner.tsx
 * for why a page with nothing in flight is showing one.
 */
function ReviewNotice() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-3 border-l-2 border-flare/60 py-1 pl-3"
    >
      <Spinner />
      <div className="min-w-0">
        <p className="eyebrow text-flare">{t.room.reviewNote}</p>
        <p className="mt-1 text-sm leading-snug text-ink-soft">
          {t.room.reviewBody}
        </p>
        <p className="mt-1 text-xs leading-snug text-muted">
          {t.room.reviewWait}
        </p>
      </div>
    </div>
  );
}
