"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  adjustBalanceAction,
  awardWinnerAction,
  cancelAuctionAction,
  closeAuctionAction,
  createLotAction,
  declareUnsoldAction,
  grantBonusAction,
  markContactHandledAction,
  rescheduleAction,
  setUserRoleAction,
  setUserStatusAction,
  type AdminState,
} from "@/app/actions/admin";
import { t } from "@/lib/copy";
import { MAX_BONUS_PTS } from "@/lib/validation";

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
        className="eyebrow border-line text-ink hover:border-accent hover:text-accent h-10 border px-4 transition-colors"
      >
        {t.admin.newLot}
      </button>
    );
  }

  return (
    <form action={action} className="border-line w-full border p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Labelled label={t.admin.lotId}>
          <input
            name="id"
            required
            maxLength={32}
            className={field}
            placeholder="014"
          />
        </Labelled>
        <Labelled label={t.admin.lotCode}>
          <input name="code" required className={field} placeholder="ЛОТ 014" />
        </Labelled>
        {/*
          `t.admin.lotTitle`, not `t.lot.viewLot`. The item's name is the most
          consequential field on this form and it was labelled with the string
          the catalogue uses for its "view the lot" link — so the box an
          operator types the title into read "Лотыг үзэх".
        */}
        <Labelled label={t.admin.lotTitle}>
          <input name="title" required className={field} />
        </Labelled>
        <Labelled label={t.lot.maker}>
          <input name="maker" className={field} />
        </Labelled>
        <Labelled label={t.lot.year}>
          <input name="year" className={field} />
        </Labelled>
        <Labelled label={t.admin.category}>
          <select
            name="category"
            required
            defaultValue="antique"
            className={field}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled label={`${t.lot.estimate} — ${t.admin.low}`}>
          <input
            name="estimateLowPts"
            type="number"
            min={0}
            required
            className={field}
          />
        </Labelled>
        <Labelled label={`${t.lot.estimate} — ${t.admin.high}`}>
          <input
            name="estimateHighPts"
            type="number"
            min={0}
            required
            className={field}
          />
        </Labelled>
        <Labelled label={t.lot.opening}>
          <input
            name="openingPts"
            type="number"
            min={0}
            required
            className={field}
          />
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
        <Labelled label={t.lot.startsAt}>
          {/*
            `datetime-local` submits without a zone, so the server parses it in
            ITS zone. Fine for a single-timezone house; if the auction ever runs
            for bidders abroad this has to carry an explicit offset.
          */}
          <input
            name="opensAt"
            type="datetime-local"
            required
            className={field}
          />
        </Labelled>
      </div>

      <Labelled label={t.lot.note} className="mt-4">
        <textarea name="note" rows={5} className={`${field} h-auto py-2`} />
      </Labelled>

      {/*
        The gallery as one textarea rather than five paired inputs that have to
        be added and removed. One line per photograph, `url | caption` — the
        order of the lines IS the order of the gallery, and the first is the
        cover, which is easier to see and reorder as text than as a column of
        form rows.
      */}
      <Labelled label={t.admin.images} className="mt-4">
        <textarea
          name="images"
          rows={5}
          spellCheck={false}
          placeholder={t.admin.imagesHint}
          className={`${field} h-auto py-2 font-mono text-xs`}
        />
      </Labelled>
      <p className="text-muted mt-1.5 text-xs">{t.admin.imagesNote}</p>

      <div className="mt-5 flex items-center gap-3">
        <Submit label={t.admin.create} />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="eyebrow text-muted hover:text-ink h-10 px-3 transition-colors"
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
  /*
   * `review` is deliberately NOT settled here. A lot awaiting a decision can
   * still be cancelled outright — the fees go back and nobody wins — which is
   * the only escape from a sale that should not have run.
   */
  const settled = outcome === "sold" || outcome === "unsold";

  if (settled) {
    return <span className="text-muted text-xs">—</span>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {outcome === "running" && (
          <button
            type="button"
            onClick={() =>
              setConfirming(confirming === "close" ? null : "close")
            }
            className="eyebrow border-line text-ink-soft hover:border-flare hover:text-flare border px-2 py-1 text-[0.625rem] transition-colors"
          >
            {t.admin.close}
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            setConfirming(confirming === "cancel" ? null : "cancel")
          }
          className="eyebrow border-line text-ink-soft hover:border-rust hover:text-rust border px-2 py-1 text-[0.625rem] transition-colors"
        >
          {t.admin.cancel}
        </button>
      </div>

      {confirming === "close" && (
        <form action={closeFormAction} className="flex flex-col gap-2">
          <input type="hidden" name="lotId" value={lotId} />
          <p className="text-flare text-xs leading-relaxed">
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
          <p className="text-rust text-xs leading-relaxed">
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

/* ── Naming a winner ─────────────────────────────────────────────────────── */

/**
 * One candidate, as the dashboard needs them.
 *
 * Declared here rather than imported from `@/lib/repo/admin`, which is
 * `server-only`. A type-only import would be erased, but it would also invite
 * the next person to reach for a value from the same module — and this file is
 * a Client Component, where that is a build error at best.
 */
export interface WinnerCandidate {
  userId: number;
  name: string;
  paddle: string;
  topPts: number;
  topRound: number;
  bidCount: number;
  status: "active" | "suspended" | "closed";
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DECISION, AS A FORM
 *
 * Two controls, deliberately unequal in weight. The dropdown defaults to the
 * highest bidder, because that is the answer nearly every time and an operator
 * working through a queue should be able to confirm it without reading. What
 * costs a deliberate act is DEPARTING from it: choosing anyone else raises a
 * warning above the note field, and the note is what the audit row carries.
 *
 * Giving the lot to nobody is a separate, two-step control rather than an
 * option in the same dropdown. It is not a kind of winner, and a list where
 * "nobody" sits one arrow-key away from a person is a list that eventually
 * awards the wrong thing.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function WinnerPicker({
  lotId,
  candidates,
}: {
  lotId: string;
  candidates: WinnerCandidate[];
}) {
  const [awardState, awardFormAction] = useActionState<AdminState, FormData>(
    awardWinnerAction,
    IDLE,
  );
  const [unsoldState, unsoldFormAction] = useActionState<AdminState, FormData>(
    declareUnsoldAction,
    IDLE,
  );

  /* Candidates arrive highest bid first, so the standing leader is [0]. */
  const standing = candidates[0] ?? null;
  const [chosen, setChosen] = useState<number | null>(standing?.userId ?? null);
  const [confirmingUnsold, setConfirmingUnsold] = useState(false);

  if (candidates.length === 0) {
    return <p className="text-muted text-sm">{t.admin.reviewNoCandidates}</p>;
  }

  const overriding = standing !== null && chosen !== standing.userId;

  return (
    <div className="flex flex-col gap-4">
      <form action={awardFormAction} className="flex flex-col gap-2.5">
        <input type="hidden" name="lotId" value={lotId} />

        <label className="block">
          <span className="eyebrow">{t.admin.reviewPickWinner}</span>
          <select
            name="winnerUserId"
            value={chosen ?? ""}
            onChange={(e) => setChosen(Number(e.target.value))}
            className={`${field} mt-1.5`}
          >
            {candidates.map((c) => (
              <option key={c.userId} value={c.userId}>
                {c.name} · {c.paddle} — {c.topPts} оноо ({c.topRound}-р тойрог,{" "}
                {c.bidCount} хаялт)
                {c.status !== "active"
                  ? ` · ${t.admin.reviewSuspendedMark}`
                  : ""}
              </option>
            ))}
          </select>
        </label>

        {/*
          Only when it applies. A warning that is always on screen is furniture,
          and the whole point of this one is that it appears the moment the
          operator does the unusual thing.
        */}
        {overriding && (
          <p className="border-flare text-flare border-l-2 pl-2.5 text-xs leading-relaxed">
            {t.admin.winnerOverrideWarning}
          </p>
        )}

        <input
          name="note"
          required
          minLength={4}
          placeholder={t.admin.winnerNotePlaceholder}
          className={field}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Submit label={t.admin.declareWinner} />
          <button
            type="button"
            onClick={() => setConfirmingUnsold((o) => !o)}
            className="eyebrow text-muted hover:text-rust h-10 px-1 transition-colors"
          >
            {t.admin.declareUnsold}
          </button>
        </div>
        <Result state={awardState} />
      </form>

      {confirmingUnsold && (
        <form
          action={unsoldFormAction}
          className="border-line flex flex-col gap-2 border-t pt-3"
        >
          <input type="hidden" name="lotId" value={lotId} />
          <p className="text-rust text-xs leading-relaxed">
            {t.admin.declareUnsoldWarning}
          </p>
          <input
            name="reason"
            required
            minLength={4}
            placeholder={t.admin.reasonPlaceholder}
            className={field}
          />
          <Submit label={t.admin.confirmDeclareUnsold} danger />
          <Result state={unsoldState} />
        </form>
      )}
    </div>
  );
}

/* ── Contact inbox ───────────────────────────────────────────────────────── */

/**
 * One button, and no confirmation step.
 *
 * Unlike the auction controls, marking a message answered takes nothing away
 * from anybody — the worst case is that somebody gets replied to twice. A
 * two-step confirm on a control this harmless is friction that trains an
 * operator to click through the ones that do matter.
 */
export function ContactHandledButton({ id }: { id: number }) {
  const [state, action] = useActionState<AdminState, FormData>(
    markContactHandledAction,
    IDLE,
  );

  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="id" value={id} />
      <Submit label={t.admin.contactMarkHandled} />
      <Result state={state} />
    </form>
  );
}

/* ── User control ────────────────────────────────────────────────────────── */

export function UserControls({
  userId,
  status,
  role,
}: {
  userId: number;
  status: string;
  role: string;
}) {
  const [statusState, statusAction] = useActionState<AdminState, FormData>(
    setUserStatusAction,
    IDLE,
  );
  const [roleState, roleAction] = useActionState<AdminState, FormData>(
    setUserRoleAction,
    IDLE,
  );
  const [adjustState, adjustAction] = useActionState<AdminState, FormData>(
    adjustBalanceAction,
    IDLE,
  );
  const [bonusState, bonusAction] = useActionState<AdminState, FormData>(
    grantBonusAction,
    IDLE,
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="eyebrow border-line text-muted hover:border-accent hover:text-accent border px-2 py-1 text-[0.625rem] transition-colors"
      >
        {t.admin.manage}
      </button>
    );
  }

  return (
    <div className="border-line flex flex-col gap-3 border p-3">
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

      {/*
        Role. Separate from status because they answer different questions —
        status is "may this person bid", role is "may this person run the
        house" — and a single control conflating them is how somebody gets
        admin by being un-suspended.
      */}
      <form
        action={roleAction}
        className="border-line flex flex-col gap-2 border-t pt-3"
      >
        <input type="hidden" name="userId" value={userId} />
        <p className="text-muted text-[0.625rem] leading-relaxed">
          {t.admin.roleNote}
        </p>
        <select
          name="role"
          defaultValue={role}
          className={`${field} h-8 text-xs`}
        >
          <option value="bidder">bidder</option>
          <option value="staff">staff</option>
          <option value="admin">admin</option>
        </select>
        <input
          name="reason"
          required
          minLength={4}
          placeholder={t.admin.reasonPlaceholder}
          className={`${field} h-8 text-xs`}
        />
        <Submit label={t.admin.applyRole} danger />
        <Result state={roleState} />
      </form>

      {/*
        Free points, above the correction and visibly a different control.

        Two money forms in one panel is a real hazard, so they are made to look
        and read differently: this one has its own heading, takes only a
        positive number, and its button is the plain style rather than the
        danger style. `min`/`max` on the input match the schema, so the browser
        refuses the typo before the round trip — the server checks it again.
      */}
      <form
        action={bonusAction}
        className="border-line flex flex-col gap-2 border-t pt-3"
      >
        <input type="hidden" name="userId" value={userId} />
        <p className="eyebrow text-flare">{t.admin.grantBonus}</p>
        <p className="text-muted text-[0.625rem] leading-relaxed">
          {t.admin.bonusNote}
        </p>
        <input
          name="deltaPts"
          type="number"
          min={1}
          max={MAX_BONUS_PTS}
          step={1}
          required
          placeholder={t.admin.bonusAmountPlaceholder(MAX_BONUS_PTS)}
          className={`${field} h-8 text-xs`}
        />
        <input
          name="memo"
          required
          minLength={4}
          placeholder={t.admin.bonusMemoPlaceholder}
          className={`${field} h-8 text-xs`}
        />
        <Submit label={t.admin.applyBonus} />
        <Result state={bonusState} />
      </form>

      <form
        action={adjustAction}
        className="border-line flex flex-col gap-2 border-t pt-3"
      >
        <input type="hidden" name="userId" value={userId} />
        <p className="text-muted text-[0.625rem] leading-relaxed">
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
        className="eyebrow text-muted hover:text-ink self-start text-[0.625rem] transition-colors"
      >
        {t.nav.close}
      </button>
    </div>
  );
}
