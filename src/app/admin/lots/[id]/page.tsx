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
 * What the sale currently is — its bidders, details and controls — and the
 * decision itself: an admin names the winner of every lot, here in advance
 * while it still runs (it is handed over when it ends), or here or from the
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
        While the lot runs the admin can choose an instant winner: the same
        picker, over the same pressers. The lot keeps running and goes to them
        when it ends, whoever pressed last.
      */}
      {(live || (!pending && row.outcome === "scheduled")) && (
        <Panel heading={t.admin.instantWinner} empty="—" isEmpty={false}>
          {live && bidders.length > 0 ? (
            <WinnerPicker
              key={row.designatedUserId ?? "none"}
              lotId={row.lotId}
              candidates={bidders}
              designate={{ current: row.designatedUserId }}
            />
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
              {pending.standingPaddle ?? "—"} ·{" "}
              {t.room.times(pending.standingPts)}
            </span>
          </p>
          <WinnerPicker
            lotId={pending.lotId}
            candidates={pending.candidates}
            defaultUserId={pending.designatedUserId}
          />
        </Panel>
      )}

      {/*
        Every presser, at a glance and not only inside a dropdown: how many
        times each pressed, what it cost them, and what they hold to press with.
        Last presser first — who takes the lot if nobody presses again.
      */}
      {bidders.length > 0 && (
        <Panel heading={t.admin.biddersHeading} empty="—" isEmpty={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <thead>
                <tr className="border-line border-y text-left">
                  <th className="eyebrow py-3 pr-4 font-normal">
                    {t.admin.biddersColName}
                  </th>
                  <th className="eyebrow py-3 pr-4 font-normal">
                    {t.admin.biddersColBids}
                  </th>
                  <th className="eyebrow py-3 pr-4 font-normal">
                    {t.admin.biddersColSpent}
                  </th>
                  <th className="eyebrow py-3 pr-4 font-normal">
                    {t.admin.biddersColRound}
                  </th>
                  <th className="eyebrow py-3 font-normal">
                    {t.admin.biddersColBalance}
                  </th>
                </tr>
              </thead>
              <tbody>
                {bidders.map((b) => (
                  <tr key={b.userId} className="border-line border-b">
                    <td className="py-3 pr-4">
                      <span className="text-ink">{b.name}</span>{" "}
                      <span data-numerals className="text-muted text-xs">
                        {b.paddle}
                      </span>
                      {b.paddle === row.leaderPaddle && (
                        <span className="eyebrow text-olive ml-2 text-[0.625rem]">
                          {t.admin.lastPresserBadge}
                        </span>
                      )}
                      {b.userId === row.designatedUserId && (
                        <span className="eyebrow text-flare ml-2 text-[0.625rem]">
                          {t.admin.designatedBadge}
                        </span>
                      )}
                      {b.status !== "active" && (
                        <span className="text-rust ml-2 text-xs">
                          {t.admin.reviewSuspendedMark}
                        </span>
                      )}
                    </td>
                    <td data-numerals className="text-ink py-3 pr-4">
                      {b.bidCount}
                    </td>
                    <td data-numerals className="text-ink py-3 pr-4">
                      {pts(b.spentPts)}
                    </td>
                    <td data-numerals className="text-muted py-3 pr-4">
                      {b.lastRound}
                    </td>
                    <td data-numerals className="text-muted py-3">
                      {pts(b.balancePts)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Panel heading={t.admin.editLot} empty="—" isEmpty={false}>
        <EditLotForm
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
    pressCostPts: lot.pressCostPts,
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
