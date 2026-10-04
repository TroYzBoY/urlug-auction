import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountShell, Panel, Stat } from "@/components/account/AccountShell";
import {
  AuctionControls,
  AwardModeControl,
  WinnerPicker,
} from "@/components/admin/AdminForms";
import { OUTCOME_LABEL } from "@/components/admin/outcome";
import { lot as adminLot, reviewQueue } from "@/lib/repo/admin";
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
 * The place an admin comes to take a lot's winner into their own hands — the
 * switch is here rather than in the dashboard's table because it is a decision
 * about ONE sale, made before it closes, and it deserves a page that shows what
 * that sale currently is. When the lot is waiting on them, the same page holds
 * the decision itself.
 */
export default async function AdminLotPage(
  props: PageProps<"/admin/lots/[id]">,
) {
  // The gate, as on the dashboard: notFound() for anyone who is not staff.
  await requireAdmin();
  const { id } = await props.params;

  const [row, queue] = await Promise.all([adminLot(id), reviewQueue()]);
  if (!row) notFound();
  const pending = queue.find((l) => l.lotId === id) ?? null;

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

      <Panel heading={t.admin.awardMode} empty="—" isEmpty={false}>
        <AwardModeControl
          lotId={row.lotId}
          manual={row.manualAward}
          outcome={row.outcome}
        />
        {/* After the fact, the record of which way it went. */}
        {row.outcome === "sold" && (
          <p data-numerals className="text-faint mt-4 text-xs">
            {row.awardedByPaddle
              ? t.admin.awardedBy(row.awardedByPaddle)
              : t.admin.awardedByClock}
          </p>
        )}
      </Panel>

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
