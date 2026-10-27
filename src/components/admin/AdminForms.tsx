"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  adjustBalanceAction,
  awardWinnerAction,
  cancelAuctionAction,
  closeAuctionAction,
  createLotAction,
  createUserAction,
  declareUnsoldAction,
  grantBonusAction,
  markContactHandledAction,
  recordPaymentAction,
  rescheduleAction,
  setUserRoleAction,
  setUserStatusAction,
  updateLotAction,
  type AdminState,
} from "@/app/actions/admin";
import { POINT_MNT } from "@/lib/auction";
import { t } from "@/lib/copy";
import { MAX_BONUS_PTS, MAX_PAYMENT_MNT } from "@/lib/validation";

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

/* ── Lots: create and edit ───────────────────────────────────────────────── */

const CATEGORIES = [
  "antique",
  "painting",
  "timepiece",
  "jewellery",
  "arms",
  "manuscript",
] as const;

/** A lot as the form holds it — prefilled for an edit, absent for a new one. */
export interface LotFormValues {
  id: string;
  code: string;
  title: string;
  maker: string;
  year: string;
  category: string;
  estimateLowPts: number;
  estimateHighPts: number;
  openingPts: number;
  dimensions: string;
  condition: string;
  provenance: string;
  /** `YYYY-MM-DDTHH:mm` in Ulaanbaatar time — what a datetime-local holds. */
  opensAt: string;
  note: string;
  /** The gallery as `path | caption | credit` lines, cover first. */
  images: string;
}

export function CreateLotForm() {
  /*
   * Remounted after a lot is created, so the gallery — which is controlled,
   * and so survives the form's own reset — does not carry the last lot's
   * photographs into the next one.
   */
  const [round, setRound] = useState(0);
  const [state, action] = useActionState<AdminState, FormData>(
    async (prev, formData) => {
      const next = await createLotAction(prev, formData);
      if (next.status === "ok") setRound((r) => r + 1);
      return next;
    },
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
      <LotFields key={round} />

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
 * Corrects a lot that already exists — its text, and above all its
 * photographs, which is how the catalogue's stand-in pictures are replaced
 * with the house's own.
 *
 * Once the sale has opened, the price and the opening time are shown but
 * locked: `updateLot` ignores them from then on, and a box that looks editable
 * and is silently ignored is worse than one that says it is fixed.
 */
export function EditLotForm({
  lot,
  scheduleLocked,
}: {
  lot: LotFormValues;
  scheduleLocked: boolean;
}) {
  const [state, action] = useActionState<AdminState, FormData>(
    updateLotAction,
    IDLE,
  );

  return (
    <form action={action} className="border-line w-full border p-5">
      <LotFields lot={lot} editing scheduleLocked={scheduleLocked} />
      <div className="mt-5">
        <Submit label={t.admin.save} />
      </div>
      <Result state={state} />
    </form>
  );
}

function LotFields({
  lot,
  editing = false,
  scheduleLocked = false,
}: {
  lot?: LotFormValues;
  editing?: boolean;
  scheduleLocked?: boolean;
}) {
  const locked = `${field} read-only:text-muted read-only:border-dashed`;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* In the lot's URL and on every bid placed on it: fixed once made. */}
        <Labelled label={t.admin.lotId}>
          <input
            name="id"
            required
            maxLength={32}
            readOnly={editing}
            defaultValue={lot?.id}
            className={locked}
            placeholder="014"
          />
        </Labelled>
        <Labelled label={t.admin.lotCode}>
          <input
            name="code"
            required
            defaultValue={lot?.code}
            className={field}
            placeholder="ЛОТ 014"
          />
        </Labelled>
        {/*
          `t.admin.lotTitle`, not `t.lot.viewLot`. The item's name is the most
          consequential field on this form and it was labelled with the string
          the catalogue uses for its "view the lot" link — so the box an
          operator types the title into read "Лотыг үзэх".
        */}
        <Labelled label={t.admin.lotTitle}>
          <input
            name="title"
            required
            defaultValue={lot?.title}
            className={field}
          />
        </Labelled>
        <Labelled label={t.lot.maker}>
          <input name="maker" defaultValue={lot?.maker} className={field} />
        </Labelled>
        <Labelled label={t.lot.year}>
          <input name="year" defaultValue={lot?.year} className={field} />
        </Labelled>
        <Labelled label={t.admin.category}>
          <select
            name="category"
            required
            defaultValue={lot?.category ?? "antique"}
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
            defaultValue={lot?.estimateLowPts}
            className={field}
          />
        </Labelled>
        <Labelled label={`${t.lot.estimate} — ${t.admin.high}`}>
          <input
            name="estimateHighPts"
            type="number"
            min={0}
            required
            defaultValue={lot?.estimateHighPts}
            className={field}
          />
        </Labelled>
        <Labelled label={t.lot.opening}>
          <input
            name="openingPts"
            type="number"
            min={0}
            required
            readOnly={scheduleLocked}
            defaultValue={lot?.openingPts}
            className={locked}
          />
        </Labelled>
        <Labelled label={t.lot.dimensions}>
          <input
            name="dimensions"
            defaultValue={lot?.dimensions}
            className={field}
          />
        </Labelled>
        <Labelled label={t.lot.condition}>
          <input
            name="condition"
            defaultValue={lot?.condition}
            className={field}
          />
        </Labelled>
        <Labelled label={t.lot.provenance}>
          <input
            name="provenance"
            defaultValue={lot?.provenance}
            className={field}
          />
        </Labelled>
        {/*
          `datetime-local` carries no zone. The server reads it as Ulaanbaatar
          time (src/lib/house-time.ts) whatever zone the server is in — and the
          label says so, because the person typing it might not be in one.
        */}
        <Labelled label={`${t.lot.startsAt} · ${t.admin.houseTime}`}>
          <input
            name="opensAt"
            type="datetime-local"
            required
            readOnly={scheduleLocked}
            defaultValue={lot?.opensAt}
            className={locked}
          />
        </Labelled>
      </div>
      {scheduleLocked && (
        <p className="text-muted mt-2 text-xs">{t.admin.scheduleLocked}</p>
      )}

      <Labelled label={t.lot.note} className="mt-4">
        <textarea
          name="note"
          rows={5}
          defaultValue={lot?.note}
          className={`${field} h-auto py-2`}
        />
      </Labelled>

      <ImagesField defaultValue={lot?.images ?? ""} />
    </>
  );
}

/** Long side, in pixels, of a photograph once it is resized for upload. */
const UPLOAD_MAX_EDGE = 2000;

/**
 * The gallery: photographs in order, the first being the cover.
 *
 * The textarea stays the source of truth — one `path | caption | credit` line
 * per photograph — because it is what the server parses and the one place a
 * caption or a licence credit is written. Uploading appends a line; the strip
 * of thumbnails is those lines drawn as pictures, with a way to make one the
 * cover and a way to drop one. Any other reordering is cutting a line.
 */
function ImagesField({ defaultValue }: { defaultValue: string }) {
  const [text, setText] = useState(defaultValue);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lines = toLines(text);
  const setLines = (next: string[]) => setText(next.join("\n"));

  async function upload(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    const added: string[] = [];
    try {
      for (const file of files) added.push(await uploadImage(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : t.admin.uploadFailed);
    } finally {
      // Whatever arrived before a failure is kept: those uploads happened.
      if (added.length > 0) {
        setText((prev) => [...toLines(prev), ...added].join("\n"));
      }
      setUploading(false);
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="eyebrow">{t.admin.images}</span>
        <label
          className={`eyebrow border-line text-ink hover:border-accent hover:text-accent has-focus-visible:border-accent inline-flex h-9 cursor-pointer items-center border px-3 transition-colors ${
            uploading ? "pointer-events-none opacity-60" : ""
          }`}
        >
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={uploading}
            className="sr-only"
            onChange={(e) => {
              const files = Array.from(e.currentTarget.files ?? []);
              // Cleared, so choosing the same file again still fires a change.
              e.currentTarget.value = "";
              void upload(files);
            }}
          />
          {uploading ? t.admin.uploading : t.admin.upload}
        </label>
      </div>

      {lines.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {lines.map((line, i) => {
            const url = line.split("|")[0]!.trim();
            return (
              <li
                key={`${i}:${url}`}
                className="border-line relative size-24 overflow-hidden border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a preview of a path just uploaded or typed, which next/image would refuse until it is valid */}
                <img src={url} alt="" className="size-full object-cover" />
                {i === 0 ? (
                  <span className="eyebrow bg-ground/85 text-flare absolute inset-x-0 bottom-0 py-0.5 text-center text-[0.5625rem]">
                    {t.admin.imageCover}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setLines([line, ...lines.filter((_, j) => j !== i)])
                    }
                    className="eyebrow bg-ground/85 text-ink-soft hover:text-accent absolute inset-x-0 bottom-0 py-0.5 text-[0.5625rem] transition-colors"
                  >
                    {t.admin.imageMakeCover}
                  </button>
                )}
                <button
                  type="button"
                  aria-label={t.admin.imageRemove}
                  title={t.admin.imageRemove}
                  onClick={() => setLines(lines.filter((_, j) => j !== i))}
                  className="bg-ground/85 text-ink-soft hover:text-rust absolute top-1 right-1 grid size-6 place-items-center rounded-full text-sm leading-none transition-colors"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-rust mt-2 text-sm">
          {error}
        </p>
      )}

      <label className="mt-3 block">
        <span className="sr-only">{t.admin.images}</span>
        <textarea
          name="images"
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          placeholder={t.admin.imagesHint}
          className={`${field} h-auto py-2 font-mono text-xs`}
        />
      </label>
      <p className="text-muted mt-1.5 text-xs">{t.admin.imagesNote}</p>
    </div>
  );
}

function toLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Resizes a photograph, uploads it, and returns the path it is served at. */
async function uploadImage(file: File): Promise<string> {
  const body = new FormData();
  body.set("file", await shrinkForUpload(file), "photo.jpg");
  const res = await fetch("/api/images", { method: "POST", body });
  const json = (await res.json().catch(() => null)) as {
    url?: string;
    error?: string;
  } | null;
  if (!res.ok || !json?.url) {
    throw new Error(json?.error ?? t.admin.uploadFailed);
  }
  return json.url;
}

/**
 * Re-encodes a photograph in the browser before it is sent: no longer than
 * UPLOAD_MAX_EDGE on its long side, as JPEG.
 *
 * A phone camera's 4–12MB file is many times what any screen here shows, and
 * every bidder would pay for it in loading time. Re-encoding also drops the
 * EXIF block — which on a phone photograph includes where it was taken, and
 * where an item is kept is nobody's business but the house's.
 */
async function shrinkForUpload(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(t.admin.uploadUnreadable);
  }

  const scale = Math.min(
    1,
    UPLOAD_MAX_EDGE / Math.max(bitmap.width, bitmap.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(t.admin.uploadUnreadable);
  // A transparent PNG would turn black as JPEG; white is the safer ground.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error(t.admin.uploadUnreadable)),
      "image/jpeg",
      0.85,
    ),
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
          {/* Read as Ulaanbaatar time on the server — see src/lib/house-time.ts. */}
          <input
            name="opensAt"
            type="datetime-local"
            required
            aria-label={`${t.admin.reschedule} · ${t.admin.houseTime}`}
            title={t.admin.houseTime}
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

/* ── Open an account ─────────────────────────────────────────────────────── */

/**
 * An ordinary bidder account, opened by an admin on somebody's behalf.
 *
 * The password box is plain text, not `type="password"`: the operator has to
 * read it back to the person it belongs to, and a masked field is how a typo
 * becomes an account nobody can sign in to. `autoComplete="off"` keeps the
 * browser from offering to save it as the operator's own.
 */
export function CreateUserForm() {
  const [state, action] = useActionState<AdminState, FormData>(
    createUserAction,
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
        {t.admin.newUser}
      </button>
    );
  }

  return (
    <form action={action} className="border-line w-full border p-5">
      <p className="text-muted mb-4 max-w-prose text-sm leading-relaxed">
        {t.admin.createUserNote}
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Labelled label={t.auth.familyName}>
          <input
            name="familyName"
            required
            minLength={2}
            maxLength={80}
            autoComplete="off"
            className={field}
          />
        </Labelled>
        <Labelled label={t.auth.name}>
          <input
            name="name"
            required
            minLength={2}
            maxLength={80}
            autoComplete="off"
            className={field}
          />
        </Labelled>
        <Labelled label={t.auth.phone}>
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            required
            autoComplete="off"
            placeholder="9911 2233"
            className={field}
          />
        </Labelled>
        <Labelled label={t.auth.dateOfBirth}>
          <input
            name="dateOfBirth"
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            required
            data-numerals
            className={field}
          />
        </Labelled>
        <Labelled label={t.auth.password}>
          <input
            name="password"
            type="text"
            required
            minLength={8}
            maxLength={200}
            autoComplete="off"
            spellCheck={false}
            placeholder={t.auth.passwordHint}
            className={field}
          />
        </Labelled>
      </div>

      <label className="text-ink-soft mt-4 flex items-start gap-2.5 text-sm">
        <input
          name="consent"
          type="checkbox"
          required
          className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
        />
        <span>{t.admin.userConsent}</span>
      </label>

      <div className="mt-5 flex items-center gap-3">
        <Submit label={t.admin.createUser} />
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

/* ── User control ────────────────────────────────────────────────────────── */

/** One per payment attempt — see `recordPayment` for what it protects. */
const newPaymentKey = () => crypto.randomUUID();

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

  /*
   * The key is in the form when it is submitted, so a double tap sends the same
   * key twice and the server credits once. It is replaced only once a payment
   * is on the books; a refusal recorded nothing, so the key has nothing to
   * collide with when the corrected form is sent again.
   */
  const [paymentKey, setPaymentKey] = useState(newPaymentKey);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank">("cash");
  const [paymentState, paymentAction] = useActionState<AdminState, FormData>(
    async (prev, formData) => {
      const next = await recordPaymentAction(prev, formData);
      if (next.status === "ok") {
        setPaymentKey(newPaymentKey());
        // Controlled, so the form's own reset leaves it — and an amount still
        // sitting in the box is one tap from being paid in twice.
        setPaymentAmount("");
      }
      return next;
    },
    IDLE,
  );
  const amountMnt = Number(paymentAmount);
  const paymentPoints =
    paymentAmount !== "" &&
    Number.isInteger(amountMnt) &&
    amountMnt > 0 &&
    amountMnt % POINT_MNT === 0
      ? amountMnt / POINT_MNT
      : null;

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
        Money that was paid. First of the three money forms, because it is the
        one a desk uses every day, and in tögrög, because that is the figure on
        the receipt or the bank statement. The points it will credit are shown
        as it is typed, so a slipped zero is visible before it is sent.
      */}
      <form
        action={paymentAction}
        className="border-line flex flex-col gap-2 border-t pt-3"
      >
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="idempotencyKey" value={paymentKey} />
        <p className="eyebrow text-olive">{t.admin.recordPayment}</p>
        <p className="text-muted text-[0.625rem] leading-relaxed">
          {t.admin.paymentNote(POINT_MNT)}
        </p>
        <input
          name="amountMnt"
          type="number"
          min={POINT_MNT}
          max={MAX_PAYMENT_MNT}
          step={POINT_MNT}
          required
          value={paymentAmount}
          onChange={(e) => setPaymentAmount(e.target.value)}
          placeholder={t.admin.paymentAmountPlaceholder}
          className={`${field} h-8 text-xs`}
        />
        {paymentPoints !== null && (
          <p data-numerals className="text-ink-soft text-xs">
            {t.admin.paymentPoints(paymentPoints)}
          </p>
        )}
        <select
          name="method"
          value={paymentMethod}
          onChange={(e) =>
            setPaymentMethod(e.target.value === "bank" ? "bank" : "cash")
          }
          className={`${field} h-8 text-xs`}
        >
          <option value="cash">{t.admin.paymentMethodCash}</option>
          <option value="bank">{t.admin.paymentMethodBank}</option>
        </select>
        <input
          name="providerRef"
          required={paymentMethod === "bank"}
          maxLength={100}
          spellCheck={false}
          placeholder={
            paymentMethod === "bank"
              ? t.admin.paymentRefBank
              : t.admin.paymentRefCash
          }
          className={`${field} h-8 text-xs`}
        />
        <input
          name="memo"
          maxLength={200}
          placeholder={t.admin.paymentMemoPlaceholder}
          className={`${field} h-8 text-xs`}
        />
        <Submit label={t.admin.applyPayment} />
        <Result state={paymentState} />
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
