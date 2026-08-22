"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  adjustBalanceAction,
  cancelAuctionAction,
  closeAuctionAction,
  createLotAction,
  rescheduleAction,
  setUserStatusAction,
  type AdminState,
} from "@/app/actions/admin";
import { t } from "@/lib/copy";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ADMIN CONTROLS
 *
 * Two things run through all of these.
 *
 * **A reason is a required field, not a nicety.** Every destructive control
 * writes one into the audit row, because the question asked afterwards is never
 * "did an admin close this lot" — the log already says that — but "why", and
 * that answer only exists if somebody was made to type it at the time.
 *
 * **Destructive actions confirm in-place** rather than through `window.confirm`,
 * which is unstyleable, blocked by some browsers, and — the reason that matters
 * — appears identically for "cancel this lot and refund everyone" and for
 * "delete this draft". A two-step button says what is about to happen.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const IDLE: AdminState = { status: "idle" };

function Result({ state }: { state: AdminState }) {
  if (state.status === "idle") return null;
  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={`mt-3 text-sm ${
        state.status === "error" ? "text-rust" : "text-olive"
      }`}
    >
      {state.message}
    </p>
  );
}

function Submit({
  label,
  danger = false,
}: {
  label: string;
  danger?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`eyebrow h-10 shrink-0 border px-4 transition-colors disabled:opacity-60 ${
        danger
          ? "border-rust/50 text-rust hover:bg-rust hover:text-ground"
          : "border-line text-ink hover:border-accent hover:text-accent"
      }`}
    >
      {pending ? t.auth.working : label}
    </button>
  );
}

const field =
  "h-10 w-full border border-line bg-ground px-3 text-sm text-ink transition-colors focus:border-accent focus:outline-none";

/* ── Create a lot ────────────────────────────────────────────────────────── */

const CATEGORIES = [
  "antique",
  "painting",
  "timepiece",
  "jewellery",
  "arms",
  "manuscript",
] as const;

export function CreateLotForm() {
  const [state, action] = useActionState<AdminState, FormData>(
    createLotAction,
    IDLE,
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="eyebrow h-10 border border-line px-4 text-ink transition-colors hover:border-accent hover:text-accent"
      >
        {t.admin.newLot}
      </button>
    );
  }

  return (
    <form action={action} className="w-full border border-line p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Labelled label={t.admin.lotId}>
          <input name="id" required maxLength={32} className={field} placeholder="014" />
        </Labelled>
        <Labelled label={t.admin.lotCode}>
          <input name="code" required className={field} placeholder="ЛОТ 014" />
        </Labelled>
        <Labelled label={t.lot.viewLot}>
          <input name="title" required className={field} />
        </Labelled>
        <Labelled label={t.lot.maker}>
          <input name="maker" className={field} />
        </Labelled>
        <Labelled label={t.lot.year}>
          <input name="year" className={field} />
        </Labelled>
        <Labelled label={t.admin.category}>
          <select name="category" required defaultValue="antique" className={field}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled label={`${t.lot.estimate} — ${t.admin.low}`}>
          <input name="estimateLowPts" type="number" min={0} required className={field} />
        </Labelled>
        <Labelled label={`${t.lot.estimate} — ${t.admin.high}`}>
          <input name="estimateHighPts" type="number" min={0} required className={field} />
        </Labelled>
        <Labelled label={t.lot.opening}>
          <input name="openingPts" type="number" min={0} required className={field} />
        </Labelled>
        <Labelled label={t.lot.dimensions}>
          <input name="dimensions" className={field} />
        </Labelled>
        <Labelled label={t.lot.condition}>
          <input name="condition" className={field} />
        </Labelled>
        <Labelled label={t.lot.provenance}>
          <input name="provenance" className={field} />
        </Labelled>
        <Labelled label={t.admin.image}>
          <input name="image" className={field} placeholder="/media/lots/014.jpg" />
        </Labelled>
        <Labelled label={t.lot.startsAt}>
          {/*
            `datetime-local` submits without a zone, so the server parses it in
            ITS zone. Fine for a single-timezone house; if the auction ever runs
            for bidders abroad this has to carry an explicit offset.
          */}
          <input name="opensAt" type="datetime-local" required className={field} />
        </Labelled>
      </div>

      <Labelled label={t.lot.note} className="mt-4">
        <textarea name="note" rows={3} className={`${field} h-auto py-2`} />
      </Labelled>

      <div className="mt-5 flex items-center gap-3">
        <Submit label={t.admin.create} />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="eyebrow h-10 px-3 text-muted transition-colors hover:text-ink"
        >
          {t.nav.close}
        </button>
      </div>

      <Result state={state} />
    </form>
  );
}

/**
 * Label and control, associated IMPLICITLY by nesting rather than by
 * `htmlFor`/`id`.
 *
 * Both are valid HTML and both are announced correctly. Nesting wins here
 * because the alternative is either every call site inventing an id, or this
 * component cloning its child to inject one — and a wrapper that rewrites the
 * props of whatever it is handed breaks the moment somebody passes a fragment.
 */
function Labelled({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="eyebrow">{label}</span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

/* ── Auction control ─────────────────────────────────────────────────────── */

/**
 * Close, cancel or reschedule one lot.
 *
 * `close` awards it to the standing leader; `cancel` voids it and refunds every
 * join fee. They are separate buttons with separate confirmations because the
 * difference between them is somebody keeping a lot or not.
 */
export function AuctionControls({
  lotId,
  outcome,
  hasBids,
}: {
  lotId: string;
  outcome: string;
  hasBids: boolean;
}) {
  const [closeState, closeFormAction] = useActionState<AdminState, FormData>(
    closeAuctionAction,
    IDLE,
  );
  const [cancelState, cancelFormAction] = useActionState<AdminState, FormData>(
    cancelAuctionAction,
    IDLE,
  );
  const [rescheduleState, rescheduleFormAction] = useActionState<
    AdminState,
    FormData
  >(rescheduleAction, IDLE);

  const [confirming, setConfirming] = useState<"close" | "cancel" | null>(null);
  const settled = outcome === "sold" || outcome === "unsold";

  if (settled) {
    return <span className="text-xs text-muted">—</span>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {outcome === "running" && (
          <button
            type="button"
            onClick={() => setConfirming(confirming === "close" ? null : "close")}
            className="eyebrow border border-line px-2 py-1 text-[0.625rem] text-ink-soft transition-colors hover:border-flare hover:text-flare"
          >
            {t.admin.close}
          </button>
        )}
        <button
          type="button"
          onClick={() => setConfirming(confirming === "cancel" ? null : "cancel")}
          className="eyebrow border border-line px-2 py-1 text-[0.625rem] text-ink-soft transition-colors hover:border-rust hover:text-rust"
        >
          {t.admin.cancel}
        </button>
      </div>

      {confirming === "close" && (
        <form action={closeFormAction} className="flex flex-col gap-2">
          <input type="hidden" name="lotId" value={lotId} />
          <p className="text-xs leading-relaxed text-flare">
            {t.admin.closeWarning}
          </p>
          <input
            name="reason"
            required
            minLength={4}
            placeholder={t.admin.reasonPlaceholder}
            className={field}
          />
          <Submit label={t.admin.confirmClose} danger />
          <Result state={closeState} />
        </form>
      )}

      {confirming === "cancel" && (
        <form action={cancelFormAction} className="flex flex-col gap-2">
          <input type="hidden" name="lotId" value={lotId} />
          <p className="text-xs leading-relaxed text-rust">
            {t.admin.cancelWarning}
          </p>
          <input
            name="reason"
            required
            minLength={4}
            placeholder={t.admin.reasonPlaceholder}
            className={field}
          />
          <Submit label={t.admin.confirmCancel} danger />
          <Result state={cancelState} />
        </form>
      )}

      {outcome === "scheduled" && !hasBids && (
        <form action={rescheduleFormAction} className="flex items-center gap-2">
          <input type="hidden" name="lotId" value={lotId} />
          <input
            name="opensAt"
            type="datetime-local"
            required
            className={`${field} h-8 text-xs`}
          />
          <Submit label={t.admin.reschedule} />
          <Result state={rescheduleState} />
        </form>
      )}
    </div>
  );
}

/* ── User control ────────────────────────────────────────────────────────── */

export function UserControls({
  userId,
  status,
}: {
  userId: number;
  status: string;
}) {
  const [statusState, statusAction] = useActionState<AdminState, FormData>(
    setUserStatusAction,
    IDLE,
  );
  const [adjustState, adjustAction] = useActionState<AdminState, FormData>(
    adjustBalanceAction,
    IDLE,
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="eyebrow border border-line px-2 py-1 text-[0.625rem] text-muted transition-colors hover:border-accent hover:text-accent"
      >
        {t.admin.manage}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 border border-line p-3">
      <form action={statusAction} className="flex flex-col gap-2">
        <input type="hidden" name="userId" value={userId} />
        <select
          name="status"
          defaultValue={status}
          className={`${field} h-8 text-xs`}
        >
          <option value="active">active</option>
          <option value="suspended">suspended</option>
          <option value="closed">closed</option>
        </select>
        <input
          name="reason"
          required
          minLength={4}
          placeholder={t.admin.reasonPlaceholder}
          className={`${field} h-8 text-xs`}
        />
        <Submit label={t.admin.applyStatus} danger />
        <Result state={statusState} />
      </form>

      <form action={adjustAction} className="flex flex-col gap-2 border-t border-line pt-3">
        <input type="hidden" name="userId" value={userId} />
        <p className="text-[0.625rem] leading-relaxed text-muted">
          {t.admin.adjustNote}
        </p>
        <input
          name="deltaPts"
          type="number"
          required
          placeholder="±оноо"
          className={`${field} h-8 text-xs`}
        />
        <input
          name="memo"
          required
          minLength={4}
          placeholder={t.admin.memoPlaceholder}
          className={`${field} h-8 text-xs`}
        />
        <Submit label={t.admin.applyAdjust} />
        <Result state={adjustState} />
      </form>

      <button
        type="button"
        onClick={() => setOpen(false)}
        className="eyebrow self-start text-[0.625rem] text-muted transition-colors hover:text-ink"
      >
        {t.nav.close}
      </button>
    </div>
  );
}
