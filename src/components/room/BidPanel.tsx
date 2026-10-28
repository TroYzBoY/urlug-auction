"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { t } from "@/lib/copy";
import { pts } from "@/lib/format";
import type { RoomState } from "@/lib/types";

/**
 * The lot's one control: a button that costs `pressCostPts` a press.
 *
 * Named for the bid panel it used to be. There is nothing to choose — no
 * amount, no step — because a press has no price of its own (auction.ts): it
 * spends the lot's price from the balance, adds one to this presser's count,
 * and makes them the last presser, who takes the lot if the clock runs out.
 */
export function BidPanel({
  state,
  isYourLead,
  leaderName,
  canBid,
  balancePts,
  rejection,
  onPress,
}: {
  state: RoomState;
  /** This viewer pressed last. */
  isYourLead: boolean;
  /** The last presser's real name — shown for the winner when the lot is sold. */
  leaderName: string | null;
  /**
   * Signed in, phone verified, not suspended.
   *
   * ⚠ A UX gate, not a control. The server re-checks all three on every press
   * — see src/app/actions/bid.ts. What this buys is that a signed-out visitor
   * is shown a sign-in link instead of a button that fails.
   */
  canBid: boolean;
  /** The viewer's points, as of the last render. */
  balancePts: number;
  /** The server's reason for turning the last press down, already translated. */
  rejection: string | null;
  onPress: () => void;
}) {
  const { currentPts, outcome, leader, yourCount } = state;
  const cost = state.lot.pressCostPts;

  /*
   * ⚠ A UX gate like `canBid`, not a control. The balance is charged and
   * checked in one statement on the server (`bids.ts`), which is what actually
   * stops an overdraw; this only means somebody is told before they tap rather
   * than after.
   */
  const short = canBid && balancePts < cost;

  /*
   * The result.
   *
   * `review` never reaches this component — AuctionRoom swaps the whole panel
   * for DecisionPanel while the lot closes. So this only ever appears as the END
   * of that wait, arriving over the stream, and it comes in with a short rise to
   * mark that the answer has landed.
   *
   * The rise starts from a dimmed panel rather than an invisible one. Motion
   * renders `initial` into the server HTML, and a panel that began at opacity 0
   * would stay blank for anyone whose scripts failed to load.
   */
  if (outcome !== "running") {
    return (
      <motion.div
        initial={{ opacity: 0.35, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="border-line bg-surface/95 flex flex-1 flex-col justify-center border-t px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:block lg:border lg:p-6 lg:pb-6"
      >
        <p className="eyebrow">
          {outcome === "sold" ? t.room.soldNote : t.room.unsold}
        </p>
        <p className="display text-flare mt-2 text-5xl">
          {outcome === "sold" ? t.room.sold : t.room.unsold}
        </p>
        {outcome === "sold" && (
          <dl className="border-line mt-4 flex items-end justify-between gap-4 border-t pt-3">
            <div>
              <dt className="eyebrow">{t.room.totalPresses}</dt>
              <dd data-numerals className="text-ink mt-1 text-xl font-medium">
                {t.room.times(currentPts)}
              </dd>
            </div>
            <div className="text-right">
              <dt className="eyebrow">{t.room.winner}</dt>
              <dd
                data-numerals
                className={`mt-1 text-xl font-medium ${
                  isYourLead ? "text-flare" : "text-ink"
                }`}
              >
                {isYourLead ? t.room.you : (leaderName ?? leader)}
              </dd>
            </div>
          </dl>
        )}
      </motion.div>
    );
  }

  return (
    <div className="border-line bg-surface/95 short:pt-2.5 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:border lg:p-5 lg:pb-5">
      {/*
        What a press costs, what this presser has pressed, and what they have
        left to press with — the three numbers a press decides on. At 320px a
        label may take two lines; `min-w-0` lets it, and each figure is kept
        whole rather than wrapping between its digits and its unit.
      */}
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div className="min-w-0">
          <dt className="eyebrow">{t.room.pressCost}</dt>
          <dd
            data-numerals
            className="text-ink mt-1 text-sm font-semibold whitespace-nowrap"
          >
            {pts(cost)}{" "}
            <span className="text-muted font-normal">{t.common.point}</span>
          </dd>
        </div>
        <div className="min-w-0 text-center">
          <dt className="eyebrow">{t.room.yourCount}</dt>
          <dd
            data-numerals
            className="text-flare mt-1 text-sm font-semibold whitespace-nowrap"
          >
            {t.room.times(yourCount ?? 0)}
          </dd>
        </div>
        <div className="min-w-0 text-right">
          <dt className="eyebrow">{t.room.balance}</dt>
          <dd
            data-numerals
            className="text-ink-soft mt-1 text-sm font-semibold whitespace-nowrap"
          >
            {canBid ? pts(balancePts) : "—"}{" "}
            {canBid && (
              <span className="text-muted font-normal">{t.common.point}</span>
            )}
          </dd>
        </div>
      </dl>

      {isYourLead && (
        <p className="text-olive mt-2.5 flex items-center gap-1.5 text-xs font-medium">
          <span
            aria-hidden
            className="bg-olive size-1.5 animate-ping rounded-full"
          />
          {t.room.youLead}
        </p>
      )}

      {/* The press. */}
      <motion.button
        type="button"
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.97 }}
        onClick={onPress}
        disabled={!canBid || short}
        className="bg-accent text-accent-ink short:h-12 mt-3 flex h-14 w-full touch-manipulation items-center justify-between gap-3 px-4 font-sans shadow-lg transition-colors duration-150 disabled:opacity-60"
      >
        {/*
          Always the plain label — never a "pressing…" pending state. The press
          is applied optimistically on the click frame (the count, the clock and
          the feed all move at once), so a spinner here would be a loading
          indicator for something that has already visibly happened.
        */}
        <span className="text-[0.8125rem] font-bold tracking-[0.14em] uppercase">
          {t.room.placeBid}
        </span>
        <span data-numerals className="text-base leading-tight font-bold">
          −{pts(cost)} {t.common.point}
        </span>
      </motion.button>

      {/*
        A signed-out visitor sees the whole panel — the price, the counts — and
        one link. Hiding it would make the room unreadable to anyone deciding
        whether to register, which is exactly who needs to read it.
      */}
      {!canBid && (
        <p className="text-muted mt-2 text-xs leading-relaxed">
          <Link
            href={`/login?redirect=/auction/${state.lot.id}`}
            className="text-flare font-medium underline underline-offset-2"
          >
            {t.room.signInToBid}
          </Link>
        </p>
      )}

      {/*
        Said here rather than left to the server's rejection. The press would be
        refused for funds, and the difference between learning that before the
        tap and after it is the difference between a route out — top up — and a
        dead button with an error under it.
      */}
      {short && (
        <p className="text-rust mt-2 text-xs leading-relaxed">
          {t.room.pressShort(cost, balancePts)}{" "}
          <Link
            href="/wallet"
            className="text-flare font-medium underline underline-offset-2"
          >
            {t.room.topUp}
          </Link>
        </p>
      )}

      {rejection && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          role="alert"
          className="text-rust mt-2 text-xs font-medium"
        >
          {rejection}
        </motion.p>
      )}
    </div>
  );
}
