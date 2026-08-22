"use client";

import { useState, useTransition } from "react";
import { Header } from "@/components/site/Header";
import { RollingNumber } from "@/components/site/RollingNumber";
import { LiveDot } from "@/components/lot/LotCard";
import { LotPlate } from "@/components/lot/LotPlate";
import { placeBid as submitBid } from "@/app/actions/bid";
import { LATE_JOIN_PENALTY_PTS, ROUND_TIME_SCALE } from "@/lib/auction";
import { bidClockLabel, pts, ptsToMnt } from "@/lib/format";
import { t } from "@/lib/copy";
import type { Lot, RoomState } from "@/lib/types";
import { BidClock } from "./BidClock";
import { BidFeed } from "./BidFeed";
import { BidPanel } from "./BidPanel";
import { RoundRail } from "./RoundRail";
import { useAuctionRoom } from "./useAuctionRoom";

/** What the bidder is told when the server turns a bid down. */
const REJECTION_COPY: Record<string, string> = {
  "too-low": t.room.rejectTooLow,
  "round-closed": t.room.rejectClosed,
  "not-registered": t.room.rejectSignIn,
  "not-verified": t.room.rejectVerify,
  "insufficient-funds": t.room.rejectFunds,
  suspended: t.room.rejectSuspended,
  "rate-limited": t.room.rejectRateLimited,
  error: t.room.rejectError,
};

export function AuctionRoom({
  initialState,
  viewerPaddle,
  canBid,
}: {
  initialState: RoomState;
  /** null when signed out. */
  viewerPaddle: string | null;
  /** Signed in, verified and not suspended. The server checks this too. */
  canBid: boolean;
}) {
  const { state, spec, isYourLead, applyOptimistic, rollback, refetch } =
    useAuctionRoom(initialState, viewerPaddle);
  const lot = state.lot;

  const [pending, startTransition] = useTransition();
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
  const bidClockTotalMs = spec.bidClockSec * 1000;
  const roundTotalMs = (spec.durationMin * 60_000) / ROUND_TIME_SCALE;

  return (
    <div className="grain min-h-dvh bg-ground text-ink">
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
      */}
      <main id="main" className="gutter pt-4 sm:pt-6 pb-64 lg:pt-10 lg:pb-20">
        {/* ── Lot identity ─────────────────────────────────────────────────
         * On phones the object leads: a full-width plate, the name under it,
         * then the catalogue facts, then the note — a catalogue page that
         * happens to be live. Above lg the sidebar carries the plate and the
         * facts instead, so both are hidden here.
         *
         * The identity text itself is rendered once and shared by both layouts.
         * Duplicating it per breakpoint would put two <h1>s in the document,
         * which is a real problem for screen readers even when one is
         * display:none to sighted users.
         */}
        <div className="flex flex-col gap-5">
          <LotPlate
            category={lot.category}
            image={lot.image}
            alt={lot.title}
            priority
            ratio="aspect-square"
            className="w-full lg:hidden"
          />

          <div className="min-w-0">
            <p className="eyebrow flex items-center gap-2">
              {!frozen && <LiveDot />}
              <span className={frozen ? "" : "text-rust"}>
                {frozen ? t.room.sold : t.room.live}
              </span>
              <span aria-hidden className="text-line-strong">
                /
              </span>
              {lot.code}
            </p>
            <h1 className="mt-1.5 text-2xl leading-tight font-medium tracking-[-0.03em] md:text-3xl">
              {lot.title}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {lot.maker} · {lot.year}
            </p>
          </div>
        </div>

        {/*
          Joining a sale already under way is chargeable, so it is disclosed on
          arrival rather than at the moment of bidding — a charge a bidder only
          learns about after committing is a dark pattern, however small.

          Shown while the lot is live and this bidder has not bid yet; it
          disappears on their first bid, by which point they have accepted it.
        */}
        {!frozen && !state.hasBid && (
          <div className="mt-6 flex items-start gap-3 border border-flare/30 bg-flare/5 px-4 py-3.5">
            <span
              aria-hidden
              className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-flare/50 text-[0.625rem] font-bold text-flare"
            >
              !
            </span>
            <div className="min-w-0">
              <p className="eyebrow text-flare">{t.room.joinPenaltyLabel}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                {t.room.joinPenalty(LATE_JOIN_PENALTY_PTS)}
              </p>
            </div>
          </div>
        )}

        {/* Catalogue detail under the object, phones only — the sidebar carries
            these above lg. The prose note is deliberately not here: it belongs
            to the catalogue page (LotPreview), and in the room it pushed the
            clock and the price further below the fold to no benefit. */}
        <LotFacts
          lot={lot}
          className="mt-7 border-t border-line pt-5 lg:hidden"
        />

        <div className="mt-8 grid items-start gap-6 lg:mt-9 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-10">
          {/* ── Left: clocks, price, rounds, feed ──────────────────────── */}
          <div className="flex flex-col gap-6">
            {/*
              A clock reaching zero no longer ends the lot — the server does
              that, and the result arrives over the stream. `onExpire` is a
              BACKSTOP: if the stream is down, the countdown would otherwise sit
              at 00:00 indefinitely. It asks the server for the truth rather
              than deciding anything itself.
            */}
            <BidClock
              endsAt={state.bidClockEndsAt}
              totalMs={bidClockTotalMs}
              frozen={frozen}
              onExpire={requestServerState}
            />

            {/* Current price */}
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-line pb-5">
              <div>
                <p className="eyebrow">{t.room.currentPrice}</p>
                {/* The headline number rolls rather than swaps. aria-live sits
                    on the wrapper with plain text, so assistive tech announces
                    "1 208 оноо" once instead of narrating every digit. */}
                <p
                  aria-live="polite"
                  aria-atomic="true"
                  className="display mt-2 text-[clamp(2.75rem,11vw,4.5rem)] text-ink"
                >
                  <RollingNumber value={state.currentPts} />
                  <span className="ml-2 align-baseline text-base font-normal tracking-normal text-muted">
                    {t.common.point}
                  </span>
                </p>
                <p data-numerals className="mt-1 text-sm text-muted">
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
                      : state.leader
                    : "—"}
                </p>
                {state.hasBid && !isYourLead && !frozen && (
                  <p className="mt-1 text-xs font-medium text-rust">
                    {t.room.outbid}
                  </p>
                )}
              </div>
            </div>

            {/* Round change acknowledgement */}
            {state.round > 1 && (
              <p
                key={state.round}
                className="eyebrow text-flare"
              >
                {t.room.roundAdvanced(state.round)} ·{" "}
                {t.room.roundClockShrunk(bidClockLabel(spec.bidClockSec))}
              </p>
            )}

            <RoundRail
              round={state.round}
              roundEndsAt={state.roundEndsAt}
              roundTotalMs={roundTotalMs}
              frozen={frozen}
              onExpire={requestServerState}
            />

            <BidFeed bids={state.bids} />
          </div>

          {/* ── Right: object, bid panel, catalogue facts ───────────────── */}
          <aside className="flex flex-col gap-6 lg:sticky lg:top-24">
            <LotPlate
              category={lot.category}
              code={lot.code}
              image={lot.image}
              alt={lot.title}
              className="hidden lg:block"
            />

            <BidPanel
              state={state}
              isYourLead={isYourLead}
              pending={pending}
              canBid={canBid}
              rejection={rejection}
              onBid={attemptBid}
            />

            {/* Same component as the phone layout, just placed in the sidebar
                instead of the main flow. */}
            <LotFacts
              lot={lot}
              className="hidden border-t border-line pt-5 lg:grid"
            />
          </aside>
        </div>
      </main>
    </div>
  );
}

/**
 * The five catalogue facts. Rendered twice — once in the phone flow under the
 * object, once in the desktop sidebar — but defined once, so the two layouts
 * cannot drift apart. Two columns on phones (the values are short enough to
 * pair up), one in the narrow sidebar.
 */
function LotFacts({ lot, className = "" }: { lot: Lot; className?: string }) {
  return (
    <dl
      className={`grid grid-cols-2 gap-x-5 gap-y-5 lg:grid-cols-1 lg:gap-y-4 ${className}`}
    >
      <Fact label={t.lot.estimate}>
        <span data-numerals>
          {pts(lot.estimateLowPts)} – {pts(lot.estimateHighPts)}{" "}
          {t.common.point}
        </span>
      </Fact>
      <Fact label={t.lot.opening}>
        <span data-numerals>{ptsToMnt(lot.openingPts)}</span>
      </Fact>
      <Fact label={t.lot.dimensions}>{lot.dimensions}</Fact>
      <Fact label={t.lot.condition}>{lot.condition}</Fact>
      <Fact label={t.lot.provenance} span>
        {lot.provenance}
      </Fact>
    </dl>
  );
}

function Fact({
  label,
  children,
  span = false,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  span?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`${span ? "col-span-2 lg:col-span-1" : ""} ${className}`.trim()}
    >
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1.5 text-sm leading-relaxed text-ink-soft">{children}</dd>
    </div>
  );
}
