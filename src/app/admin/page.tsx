import type { Metadata } from "next";
import Link from "next/link";
import { AccountShell, Panel, Stat } from "@/components/account/AccountShell";
import {
  AuctionControls,
  CreateLotForm,
  UserControls,
} from "@/components/admin/AdminForms";
import { lots, recentAudit, stats, users } from "@/lib/repo/admin";
import { reconcileBalances } from "@/lib/repo/users";
import { requireAdmin } from "@/lib/session";
import { groupNumber, lotDate, pts } from "@/lib/format";
import { t } from "@/lib/copy";

export const metadata: Metadata = {
  title: t.admin.title,
  robots: { index: false, follow: false },
};

const OUTCOME_LABEL: Record<string, string> = {
  scheduled: t.lots.filterUpcoming,
  running: t.room.live,
  sold: t.lot.statusSold,
  unsold: t.lot.statusUnsold,
};

export default async function AdminPage() {
  /*
   * The only gate. `src/lib/repo/admin.ts` checks nothing itself, so every path
   * into it starts here — and this uses notFound() rather than a 403, so
   * `/admin` does not confirm its own existence to anyone probing.
   */
  const admin = await requireAdmin();

  const [figures, lotRows, userRows, audit, drift] = await Promise.all([
    stats(),
    lots(),
    users(),
    recentAudit(),
    /*
     * Run on every page load rather than on a schedule. It is a single
     * aggregate, and a drift between `balances` and `ledger_entries` means
     * money has appeared or vanished — the sooner someone sees it, the smaller
     * the window of bids placed against a wrong balance.
     */
    reconcileBalances(),
  ]);

  return (
    <AccountShell
      eyebrow={admin.paddle}
      title={t.admin.title}
      lede={t.admin.lede}
    >
      <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-4">
        <Stat label={t.admin.statLive} value={figures.liveLots} accent />
        <Stat label={t.admin.statLots} value={figures.lots} />
        <Stat label={t.admin.statUsers} value={figures.users} />
        <Stat label={t.admin.statBids} value={groupNumber(figures.bids)} />
        <Stat
          label={t.admin.statPointsOut}
          value={pts(figures.pointsIssued)}
          sub={t.common.point}
        />
        <Stat
          label={t.admin.statPointsHeld}
          value={pts(figures.pointsHeld)}
          sub={t.common.point}
        />
        <Stat
          label={t.admin.statTopups}
          value={`${groupNumber(figures.topupMnt)}₮`}
        />
      </div>

      {/*
        The ledger check leads, because it is the only figure on this page that
        is an alarm rather than a metric. A silent disagreement here is money
        appearing or vanishing, and it should not be something an admin has to
        go looking for.
      */}
      <section className="mt-14">
        <h2 className="text-lg font-medium tracking-[-0.02em] text-ink">
          {t.admin.ledgerDrift}
        </h2>
        {drift.length === 0 ? (
          <p className="mt-4 border-l-2 border-olive bg-olive/5 py-3 pl-4 text-sm text-ink-soft">
            {t.admin.ledgerDriftNone}
          </p>
        ) : (
          <div className="mt-4 border-l-2 border-rust bg-rust/5 py-3 pl-4">
            <p className="text-sm font-medium text-rust">
              {t.admin.ledgerDriftWarning}
            </p>
            <ul data-numerals className="mt-3 flex flex-col gap-1 text-sm text-ink-soft">
              {drift.map((row) => (
                <li key={row.user_id}>
                  #{row.user_id}: {pts(row.cached)} ≠ {pts(row.actual)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <Panel
        heading={t.admin.lots}
        empty="—"
        isEmpty={false}
      >
        <div className="mb-5">
          <CreateLotForm />
        </div>
        {/*
          These two stay wide and scroll. The bidder-facing tables were made to
          fit a phone; this is a staff tool used at a desk, and dropping columns
          from it would cost an operator information they came here for.
        */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <thead>
              <tr className="border-y border-line text-left">
                <th className="eyebrow py-3 pr-4 font-normal">{t.lot.lot}</th>
                <th className="eyebrow py-3 pr-4 font-normal">{t.home.colStatus}</th>
                <th className="eyebrow py-3 pr-4 font-normal">{t.room.round}</th>
                <th className="eyebrow py-3 pr-4 font-normal">
                  {t.room.currentPrice}
                </th>
                <th className="eyebrow py-3 pr-4 font-normal">
                  {t.lot.bidCount}
                </th>
                <th className="eyebrow py-3 pr-4 font-normal">{t.lot.startsAt}</th>
                <th className="eyebrow py-3 font-normal">{t.admin.manage}</th>
              </tr>
            </thead>
            <tbody>
              {lotRows.map((lot) => (
                <tr key={lot.lotId} className="border-b border-line">
                  <td className="py-3 pr-4">
                    <Link
                      href={`/auction/${lot.lotId}`}
                      className="transition-colors hover:text-accent"
                    >
                      <span data-numerals className="text-muted">
                        {lot.code}
                      </span>{" "}
                      {lot.title}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={
                        lot.outcome === "running" ? "text-rust" : "text-muted"
                      }
                    >
                      {OUTCOME_LABEL[lot.outcome] ?? lot.outcome}
                    </span>
                  </td>
                  <td data-numerals className="py-3 pr-4 text-muted">
                    {lot.round}
                  </td>
                  <td data-numerals className="py-3 pr-4 text-ink">
                    {pts(lot.currentPts)}
                    {lot.leaderPaddle && (
                      <span className="ml-2 text-xs text-muted">
                        {lot.leaderPaddle}
                      </span>
                    )}
                  </td>
                  <td data-numerals className="py-3 pr-4 text-muted">
                    {lot.bidCount}
                  </td>
                  <td data-numerals className="py-3 pr-4 text-muted">
                    {lotDate(lot.opensAt)}
                  </td>
                  <td className="py-3 align-top">
                    <AuctionControls
                      lotId={lot.lotId}
                      outcome={lot.outcome}
                      hasBids={lot.bidCount > 0}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        heading={t.admin.users}
        empty="—"
        isEmpty={userRows.length === 0}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="border-y border-line text-left">
                <th className="eyebrow py-3 pr-4 font-normal">
                  {t.account.paddle}
                </th>
                <th className="eyebrow py-3 pr-4 font-normal">{t.auth.name}</th>
                <th className="eyebrow py-3 pr-4 font-normal">
                  {t.account.balance}
                </th>
                <th className="eyebrow py-3 pr-4 font-normal">
                  {t.account.bidsPlaced}
                </th>
                <th className="eyebrow py-3 pr-4 font-normal">{t.home.colStatus}</th>
                <th className="eyebrow py-3 font-normal">{t.admin.manage}</th>
              </tr>
            </thead>
            <tbody>
              {userRows.map((user) => (
                <tr key={user.id} className="border-b border-line">
                  <td data-numerals className="py-3 pr-4 text-ink">
                    {user.paddle}
                  </td>
                  <td className="py-3 pr-4 text-ink-soft">
                    {user.name}
                    {/*
                      The phone is deliberately not shown. Staff who need it can
                      query for it, and a bidder list that puts every number on
                      screen is one screenshot away from being a leaked contact
                      database.
                    */}
                  </td>
                  <td data-numerals className="py-3 pr-4 text-ink">
                    {pts(user.balancePts)}
                  </td>
                  <td data-numerals className="py-3 pr-4 text-muted">
                    {user.bidCount}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={
                        user.status !== "active"
                          ? "text-rust"
                          : user.verified
                            ? "text-olive"
                            : "text-flare"
                      }
                    >
                      {user.status !== "active"
                        ? user.status
                        : user.verified
                          ? "✓"
                          : "—"}
                    </span>
                    {user.role !== "bidder" && (
                      <span className="ml-2 text-xs text-accent">
                        {user.role}
                      </span>
                    )}
                  </td>
                  <td className="py-3 align-top">
                    <UserControls
                      userId={user.id}
                      status={user.status}
                      role={user.role}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        heading={t.admin.recentAudit}
        empty="—"
        isEmpty={audit.length === 0}
      >
        <ul className="border-t border-line">
          {audit.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line py-2.5 text-sm"
            >
              <span className="min-w-0">
                <span className="text-ink">{row.action}</span>
                {row.targetId && (
                  <span data-numerals className="ml-2 text-xs text-muted">
                    {row.targetType}/{row.targetId}
                  </span>
                )}
              </span>
              <span data-numerals className="text-xs text-faint">
                {row.actorPaddle ?? "—"} · {lotDate(row.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </AccountShell>
  );
}
