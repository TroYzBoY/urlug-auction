import type { Metadata } from "next";
import Link from "next/link";
import { AccountShell, Panel, Stat } from "@/components/account/AccountShell";
import {
  AuctionControls,
  CreateLotForm,
  UserControls,
  WinnerPicker,
} from "@/components/admin/AdminForms";
import { lots, recentAudit, reviewQueue, stats, users } from "@/lib/repo/admin";
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
  review: t.admin.reviewStatus,
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

  const [figures, lotRows, pending, userRows, audit, drift] = await Promise.all([
    stats(),
    lots(),
    /*
     * The decision queue leads the page below the alarms: a lot sitting in
     * review is a bidder waiting on an answer, and it is the only thing here
     * that gets worse the longer nobody looks at it.
     */
    reviewQueue(),
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
          label={t.admin.statPointsGifted}
          value={pts(figures.pointsGifted)}
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
      {/*
        A plain <a>, not a Link and not a form.
        The route sets Content-Disposition: attachment, so the browser must be
        allowed to hand the response to its download machinery rather than to
        the router. next/link would try to treat a spreadsheet as a navigation.
      */}
      <section className="mt-14">
        <h2 className="text-ink text-lg font-medium tracking-[-0.02em]">
          {t.admin.exportTitle}
        </h2>
        <p className="text-muted mt-2 max-w-prose text-sm leading-relaxed">
          {t.admin.exportHint}
        </p>
        <a
          href="/admin/export"
          download
          className="eyebrow border-line text-ink hover:border-accent hover:text-accent mt-4 inline-flex h-10 items-center border px-4 transition-colors"
        >
          {t.admin.exportButton}
        </a>
      </section>

      <section className="mt-14">
        <h2 className="text-ink text-lg font-medium tracking-[-0.02em]">
          {t.admin.ledgerDrift}
        </h2>
        {drift.length === 0 ? (
          <p className="border-olive bg-olive/5 text-ink-soft mt-4 border-l-2 py-3 pl-4 text-sm">
            {t.admin.ledgerDriftNone}
          </p>
        ) : (
          <div className="border-rust bg-rust/5 mt-4 border-l-2 py-3 pl-4">
            <p className="text-rust text-sm font-medium">
              {t.admin.ledgerDriftWarning}
            </p>
            <ul
              data-numerals
              className="text-ink-soft mt-3 flex flex-col gap-1 text-sm"
            >
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
        heading={t.admin.reviewQueue}
        empty={t.admin.reviewQueueEmpty}
        isEmpty={pending.length === 0}
      >
        <p className="text-muted mb-5 max-w-prose text-sm leading-relaxed">
          {t.admin.reviewQueueHint}
        </p>

        <ul className="flex flex-col gap-5">
          {pending.map((lot) => (
            <li key={lot.lotId} className="border-line border p-4 sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <p className="min-w-0">
                  <Link
                    href={`/auction/${lot.lotId}`}
                    className="hover:text-accent transition-colors"
                  >
                    <span data-numerals className="text-muted">
                      {lot.code}
                    </span>{" "}
                    <span className="text-ink">{lot.title}</span>
                  </Link>
                </p>
                <p data-numerals className="text-faint text-xs">
                  {t.admin.reviewClosedAt}:{" "}
                  {lot.closedAt ? lotDate(lot.closedAt) : "—"} ·{" "}
                  {lot.closedInRound}-{t.common.roundWord} · {lot.bidCount}{" "}
                  {t.lot.bidCount.toLowerCase()}
                </p>
              </div>

              {/*
                The standing bid is shown as a fact above the control rather
                than only as the selected option inside it. An operator should
                be able to see what the clock decided without opening a
                dropdown — that is the number they are being asked to confirm
                or to depart from.
              */}
              <p className="text-ink-soft mt-2 text-sm">
                <span className="eyebrow text-muted">
                  {t.admin.reviewStanding}
                </span>{" "}
                <span data-numerals>
                  {lot.standingPaddle ?? "—"} · {pts(lot.standingPts)}{" "}
                  {t.common.point}
                </span>
              </p>

              <div className="border-line mt-4 border-t pt-4">
                <WinnerPicker lotId={lot.lotId} candidates={lot.candidates} />
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel heading={t.admin.lots} empty="—" isEmpty={false}>
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
              <tr className="border-line border-y text-left">
                <th className="eyebrow py-3 pr-4 font-normal">{t.lot.lot}</th>
                <th className="eyebrow py-3 pr-4 font-normal">
                  {t.home.colStatus}
                </th>
                <th className="eyebrow py-3 pr-4 font-normal">
                  {t.room.round}
                </th>
                <th className="eyebrow py-3 pr-4 font-normal">
                  {t.room.currentPrice}
                </th>
                <th className="eyebrow py-3 pr-4 font-normal">
                  {t.lot.bidCount}
                </th>
                <th className="eyebrow py-3 pr-4 font-normal">
                  {t.lot.startsAt}
                </th>
                <th className="eyebrow py-3 font-normal">{t.admin.manage}</th>
              </tr>
            </thead>
            <tbody>
              {lotRows.map((lot) => (
                <tr key={lot.lotId} className="border-line border-b">
                  <td className="py-3 pr-4">
                    <Link
                      href={`/auction/${lot.lotId}`}
                      className="hover:text-accent transition-colors"
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
                  <td data-numerals className="text-muted py-3 pr-4">
                    {lot.round}
                  </td>
                  <td data-numerals className="text-ink py-3 pr-4">
                    {pts(lot.currentPts)}
                    {lot.leaderPaddle && (
                      <span className="text-muted ml-2 text-xs">
                        {lot.leaderPaddle}
                      </span>
                    )}
                  </td>
                  <td data-numerals className="text-muted py-3 pr-4">
                    {lot.bidCount}
                  </td>
                  <td data-numerals className="text-muted py-3 pr-4">
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

      <Panel heading={t.admin.users} empty="—" isEmpty={userRows.length === 0}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="border-line border-y text-left">
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
                <th className="eyebrow py-3 pr-4 font-normal">
                  {t.home.colStatus}
                </th>
                <th className="eyebrow py-3 font-normal">{t.admin.manage}</th>
              </tr>
            </thead>
            <tbody>
              {userRows.map((user) => (
                <tr key={user.id} className="border-line border-b">
                  <td data-numerals className="text-ink py-3 pr-4">
                    {user.paddle}
                  </td>
                  <td className="text-ink-soft py-3 pr-4">
                    {user.name}
                    {/*
                      The phone is deliberately not shown. Staff who need it can
                      query for it, and a bidder list that puts every number on
                      screen is one screenshot away from being a leaked contact
                      database.
                    */}
                  </td>
                  <td data-numerals className="text-ink py-3 pr-4">
                    {pts(user.balancePts)}
                  </td>
                  <td data-numerals className="text-muted py-3 pr-4">
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
                      <span className="text-accent ml-2 text-xs">
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
        <ul className="border-line border-t">
          {audit.map((row) => (
            <li
              key={row.id}
              className="border-line flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b py-2.5 text-sm"
            >
              <span className="min-w-0">
                <span className="text-ink">{row.action}</span>
                {row.targetId && (
                  <span data-numerals className="text-muted ml-2 text-xs">
                    {row.targetType}/{row.targetId}
                  </span>
                )}
              </span>
              <span data-numerals className="text-faint text-xs">
                {row.actorPaddle ?? "—"} · {lotDate(row.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </AccountShell>
  );
}
