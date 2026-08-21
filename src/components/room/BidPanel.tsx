"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  isLegalBid,
  minIncrementPts,
  minNextBidPts,
  quickStepsPts,
} from "@/lib/auction";
import { t } from "@/lib/copy";
import { pts, ptsToMnt } from "@/lib/format";
import type { RoomState } from "@/lib/types";

export function BidPanel({
  state,
  isYourLead,
  pending,
  canBid,
  rejection,
  onBid,
}: {
  state: RoomState;
  isYourLead: boolean;
  pending: boolean;
  /**
   * Signed in, phone verified, not suspended.
   *
   * ⚠ A UX gate, not a control. The server re-checks all three on every bid —
   * see src/app/actions/bid.ts. What this buys is that a signed-out visitor is
   * shown a sign-in link instead of a button that fails.
   */
  canBid: boolean;
  /** The server's reason for turning the last bid down, already translated. */
  rejection: string | null;
  onBid: (points: number) => void;
}) {
  const { currentPts, round, hasBid, outcome, leader } = state;

  const minStep = minIncrementPts(round, hasBid);
  const minTotal = minNextBidPts(currentPts, round, hasBid);
  const steps = quickStepsPts(round, hasBid);
  const isLateEntry = !hasBid && round >= 2;

  const [chosenStep, setChosenStep] = useState<number | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const customId = useId();

  const step =
    chosenStep !== null && chosenStep >= minStep ? chosenStep : minStep;

  const total = currentPts + step;

  if (outcome !== "running") {
    return (
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:static lg:border lg:p-6 lg:pb-6">
        <p className="eyebrow">
          {outcome === "sold" ? t.room.soldNote : t.room.unsold}
        </p>
        <p className="display mt-2 text-5xl text-flare animate-flare-in">
          {outcome === "sold" ? t.room.sold : t.room.unsold}
        </p>
        {outcome === "sold" && (
          <dl className="mt-4 flex items-end justify-between gap-4 border-t border-line pt-3">
            <div>
              <dt className="eyebrow">{t.room.soldFor}</dt>
              <dd data-numerals className="mt-1 text-xl font-medium text-ink">
                {pts(currentPts)}{" "}
                <span className="text-sm text-muted">{t.common.point}</span>
              </dd>
              <dd data-numerals className="text-sm text-muted">
                {ptsToMnt(currentPts)}
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
                {isYourLead ? t.room.you : leader}
              </dd>
            </div>
          </dl>
        )}
      </div>
    );
  }

  function commit(points: number) {
    /*
     * ⚠ This check is an affordance, not a control: it saves a round trip on an
     * obviously low bid and gives immediate feedback. The server runs the same
     * function under a row lock and its answer is the one that counts.
     */
    if (!isLegalBid(points, currentPts, round, hasBid)) {
      setError(t.room.tooLow(minTotal));
      return;
    }
    setError(null);
    setCustom("");
    setCustomOpen(false);
    onBid(points);
    setChosenStep(null);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:static lg:border lg:p-5 lg:pb-5 shadow-2xl lg:shadow-none">
      {/* Status line */}
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">{t.room.minNext}</p>
        <p className="text-right">
          <span data-numerals className="text-sm font-semibold text-ink">
            {pts(minTotal)}{" "}
            <span className="font-normal text-muted">{t.common.point}</span>
          </span>
          <span data-numerals className="ml-2 text-xs text-faint">
            {ptsToMnt(minTotal)}
          </span>
        </p>
      </div>

      {isYourLead && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-olive">
          <span aria-hidden className="size-1.5 rounded-full bg-olive animate-ping" />
          {t.room.youLead}
        </p>
      )}

      {isLateEntry && (
        <p className="mt-2 border-l-2 border-flare pl-2.5 text-xs leading-snug text-muted">
          {t.room.lateEntryHint(round, minStep)}
        </p>
      )}

      {/* Step chips + custom toggle */}
      <div className="mt-3 flex items-center gap-1.5">
        {steps.map((s) => (
          <motion.button
            key={s}
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setChosenStep(s);
              setCustomOpen(false);
              setError(null);
            }}
            aria-pressed={step === s && !customOpen}
            data-numerals
            className={`h-11 flex-1 touch-manipulation border text-sm font-semibold transition-colors ${
              step === s && !customOpen
                ? "border-flare bg-flare/15 text-flare font-bold"
                : "border-line text-ink-soft hover:border-line-strong hover:text-ink"
            }`}
          >
            +{pts(s)}
          </motion.button>
        ))}
        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            setCustomOpen((o) => !o);
            setError(null);
          }}
          aria-expanded={customOpen}
          className={`eyebrow h-11 shrink-0 touch-manipulation border px-3 transition-colors ${
            customOpen
              ? "border-flare text-flare bg-flare/10"
              : "border-line hover:border-line-strong hover:text-ink"
          }`}
        >
          {t.room.custom}
        </motion.button>
      </div>

      <AnimatePresence>
        {customOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-2 flex items-center gap-1.5 overflow-hidden"
          >
            <label htmlFor={customId} className="sr-only">
              {t.room.custom}
            </label>
            <input
              id={customId}
              type="number"
              inputMode="numeric"
              min={minTotal}
              step={1}
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value);
                setError(null);
              }}
              placeholder={pts(minTotal)}
              data-numerals
              className="h-11 min-w-0 flex-1 border border-line bg-ground px-3 text-base font-semibold text-ink placeholder:font-normal placeholder:text-faint focus:border-flare focus:outline-none font-sans"
            />
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => commit(Number.parseInt(custom, 10))}
              className="eyebrow h-11 shrink-0 border border-line-strong px-4 text-ink transition-colors hover:border-flare hover:text-flare"
            >
              {t.room.customApply}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Bid Commit Button */}
      <motion.button
        type="button"
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => commit(total)}
        disabled={pending || !canBid}
        className="mt-2.5 flex h-14 w-full touch-manipulation items-center justify-between gap-3 bg-accent px-4 text-accent-ink transition-colors duration-150 disabled:opacity-60 font-sans shadow-lg"
      >
        <span className="text-[0.8125rem] font-bold tracking-[0.14em] uppercase">
          {pending ? t.room.bidding : t.room.placeBid}
        </span>
        <span data-numerals className="text-right">
          <span className="block text-base leading-tight font-bold">
            +{pts(step)} → {pts(total)}
          </span>
          <span className="block text-[0.6875rem] leading-tight opacity-75">
            {ptsToMnt(total)}
          </span>
        </span>
      </motion.button>

      {/*
        A signed-out visitor sees the whole panel — the price, the minimum, the
        step chips — and one link. Hiding it would make the room unreadable to
        anyone deciding whether to register, which is exactly who needs to read
        it.
      */}
      {!canBid && (
        <p className="mt-2 text-xs leading-relaxed text-muted">
          <Link
            href={`/login?redirect=/auction/${state.lot.id}`}
            className="font-medium text-flare underline underline-offset-2"
          >
            {t.room.signInToBid}
          </Link>
        </p>
      )}

      {/* Local validation first, then whatever the server said. Both are shown
          in the same place so a bidder does not have to look in two. */}
      {(error || rejection) && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          role="alert"
          className="mt-2 text-xs font-medium text-rust"
        >
          {error ?? rejection}
        </motion.p>
      )}
    </div>
  );
}

