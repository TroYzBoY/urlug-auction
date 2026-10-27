import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountShell, Panel, Stat } from "@/components/account/AccountShell";
import {
  AuctionControls,
  EditLotForm,
  WinnerPicker,
  type LotFormValues,
} from "@/components/admin/AdminForms";
import { OUTCOME_LABEL } from "@/components/admin/outcome";
import { getLot } from "@/lib/api";
import { toHouseInput } from "@/lib/house-time";
import { lot as adminLot, lotCandidates, reviewQueue } from "@/lib/repo/admin";
import type { Lot } from "@/lib/types";
import { requireAdmin } from "@/lib/session";
import { lotDate, pts } from "@/lib/format";
import { t } from "@/lib/copy";

export const metadata: Metadata = {
  title: t.admin.lotPage,
  robots: { index: false, follow: false },
};

/**
 * One lot, from the house's side.
 *
 * What the sale currently is, its details and controls, and the decision
 * itself: an admin names the winner of every lot — here at any time once it
 * has bids, ending the bidding if it is still running, or from the
 * dashboard's queue once its clocks have stopped.
 */
export default async function AdminLotPage(
  props: PageProps<"/admin/lots/[id]">,
) {
  // The gate, as on the dashboard: notFound() for anyone who is not an admin.
  await requireAdmin();
  const { id } = await props.params;

  const [row, queue, full, bidders] = await Promise.all([
    adminLot(id),
    reviewQueue(),
    getLot(id),
    lotCandidates(id),
  ]);
  if (!row || !full) notFound();
  const pending = queue.find((l) => l.lotId === id) ?? null;
  /* Still taking bids, by the stored row and not yet closed by its clocks. */
  const live = !pending && row.outcome === "running";

  return (
    <AccountShell
      eyebrow={`${t.admin.lotPage} · ${row.code}`}
      title={row.title}
      lede={`${OUTCOME_LABEL[row.outcome] ?? row.outcome} · ${lotDate(row.opensAt)}`}
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/admin"
            className="eyebrow border-line text-ink-soft hover:border-accent hover:text-accent inline-flex h-10 items-center border px-4 transition-colors"
          >
            ← {t.admin.backToDashboard}
          </Link>
          <Link
            href={`/auction/${row.lotId}`}
            className="eyebrow border-line text-ink-soft hover:border-accent hover:text-accent inline-flex h-10 items-center border px-4 transition-colors"
          >
            {t.admin.viewRoom}
          </Link>
        </div>
      }
    >
      <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-4">
        <Stat
          label={t.admin.lotState}
          value={OUTCOME_LABEL[row.outcome] ?? row.outcome}
          accent={row.outcome === "running"}
        />
        <Stat label={t.room.round} value={row.round} />
        <Stat
          label={t.admin.lotStanding}
          value={pts(row.currentPts)}
          sub={row.leaderPaddle ?? "—"}
        />
        <Stat label={t.lot.bidCount} value={row.bidCount} />
      </div>

      {/* After the fact, the record of who made the call. */}
      {row.outcome === "sold" && (
        <p data-numerals className="text-faint mt-6 text-xs">
          {row.awardedByPaddle
            ? t.admin.awardedBy(row.awardedByPaddle)
            : t.admin.awardedByClock}
        </p>
      )}

      {/*
        Before bidding stops the admin can call the lot early: the same
        picker, over the same bidders, and awarding it ends the bidding.
      */}
      {(live || (!pending && row.outcome === "scheduled")) && (
        <Panel heading={t.admin.reviewQueue} empty="—" isEmpty={false}>
          {live && bidders.length > 0 ? (
            <WinnerPicker lotId={row.lotId} candidates={bidders} live />
          ) : (
            <p className="text-muted max-w-prose text-sm leading-relaxed">
              {t.admin.reviewLater}
            </p>
          )}
        </Panel>
      )}

      {pending && (
        <Panel heading={t.admin.reviewQueue} empty="—" isEmpty={false}>
          <p className="text-ink-soft mb-4 text-sm">
            <span className="eyebrow text-muted">{t.admin.reviewStanding}</span>{" "}
            <span data-numerals>
              {pending.standingPaddle ?? "—"} · {pts(pending.standingPts)}{" "}
              {t.common.point}
            </span>
          </p>
          <WinnerPicker lotId={pending.lotId} candidates={pending.candidates} />
        </Panel>
      )}

      {/*
        Keyed on the saved values, so a save that changes them remounts the
        form with what is now stored rather than with what was typed.
      */}
      <Panel heading={t.admin.editLot} empty="—" isEmpty={false}>
        <EditLotForm
          key={JSON.stringify(formValues(full))}
          lot={formValues(full)}
          scheduleLocked={row.outcome !== "scheduled"}
        />
      </Panel>

      <Panel heading={t.admin.manage} empty="—" isEmpty={false}>
        <AuctionControls
          lotId={row.lotId}
          outcome={row.outcome}
          hasBids={row.bidCount > 0}
        />
      </Panel>
    </AccountShell>
  );
}

/** A stored lot as the edit form shows it. */
function formValues(lot: Lot): LotFormValues {
  return {
    id: lot.id,
    code: lot.code,
    title: lot.title,
    maker: lot.maker,
    year: lot.year,
    category: lot.category,
    estimateLowPts: lot.estimateLowPts,
    estimateHighPts: lot.estimateHighPts,
    openingPts: lot.openingPts,
    dimensions: lot.dimensions,
    condition: lot.condition,
    provenance: lot.provenance,
    opensAt: toHouseInput(lot.startsAt),
    note: lot.note,
    images: lot.images
      .map((i) => {
        // Empty trailing fields dropped: "path | caption", not "path | caption | ".
        const parts = [i.url, i.alt, i.credit ?? ""];
        while (parts.length > 1 && !parts[parts.length - 1]) parts.pop();
        return parts.join(" | ");
      })
      .join("\n"),
  };
}
