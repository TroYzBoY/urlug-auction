import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountShell, Panel, Stat } from "@/components/account/AccountShell";
import { ProfileSettings } from "@/components/account/ProfileSettings";
import { SignOutButton } from "@/components/account/SignOutButton";
import { accountSummary, bidHistory, wonLots } from "@/lib/repo/account";
import { inbox } from "@/lib/repo/notifications";
import { forUser as settlementsForUser } from "@/lib/repo/settlements";
import { watched } from "@/lib/repo/watchlist";
import { currentUser } from "@/lib/session";
import { lotDate, pts, ptsToMnt } from "@/lib/format";
import { t } from "@/lib/copy";

export const metadata: Metadata = {
  title: t.account.profileTitle,
  robots: { index: false, follow: false },
};

export default async function ProfilePage() {
  const user = await currentUser();
  /*
   * `redirect`, not a "please sign in" panel. The page has nothing to show a
   * signed-out visitor, and `?redirect=` brings them back here afterwards.
   */
  if (!user) redirect("/login?redirect=/profile");

  /*
   * Every query takes `user.id` from the session. None of them takes it from
   * the URL — `/profile` shows this bidder's history and nothing else, and a
   * user id read from a route parameter would be an IDOR on the whole
   * bidder list.
   */
  const [summary, bids, won, notifications, watchlist, settlements] =
    await Promise.all([
      accountSummary(user.id),
      bidHistory(user.id),
      wonLots(user.id),
      inbox(user.id),
      watched(user.id),
      settlementsForUser(user.id),
    ]);

  const due = settlements.filter((s) => s.status === "due");

  return (
    <AccountShell
      eyebrow={user.paddle}
      title={t.account.profileTitle}
      lede={t.account.profileLede}
      actions={
        <>
          <Link
            href="/wallet"
            className="eyebrow border-line text-ink hover:border-accent hover:text-accent flex h-10 items-center border px-4 transition-colors"
          >
            {t.account.walletTitle}
          </Link>
          <SignOutButton />
        </>
      }
    >
      <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-4">
        <Stat
          label={t.account.balance}
          value={pts(summary.balancePts)}
          sub={ptsToMnt(summary.balancePts)}
          accent
        />
        <Stat label={t.account.bidsPlaced} value={summary.bidCount} />
        <Stat label={t.account.lotsEntered} value={summary.lotsEntered} />
        <Stat label={t.account.lotsWon} value={summary.lotsWon} />
      </div>

      <dl className="border-line mt-10 grid grid-cols-2 gap-6 border-t pt-6 md:grid-cols-3">
        <div>
          <dt className="eyebrow">{t.account.paddle}</dt>
          <dd data-numerals className="text-ink mt-1.5 text-sm">
            {user.paddle}
          </dd>
        </div>
        <div>
          <dt className="eyebrow">{t.account.phone}</dt>
          <dd data-numerals className="text-ink mt-1.5 text-sm">
            {user.phone}
          </dd>
        </div>
        <div>
          <dt className="eyebrow">{t.account.spent}</dt>
          <dd data-numerals className="text-ink mt-1.5 text-sm">
            {pts(summary.spentPts)} {t.common.point}
          </dd>
        </div>
      </dl>

      <Panel
        heading={t.account.settings}
        empty="—"
        isEmpty={false}
        note={t.account.settingsLede}
      >
        <ProfileSettings name={user.name} />
      </Panel>

      {/*
        What the bidder owes leads everything else. A won lot carries a
        seven-day obligation under the terms, and burying it under a bid history
        is how a winner misses it.
      */}
      {due.length > 0 && (
        <section className="mt-12">
          <h2 className="text-ink text-lg font-medium tracking-[-0.02em]">
            {t.account.settlements}
          </h2>
          <ul className="border-line mt-4 border-t">
            {due.map((row) => (
              <li
                key={row.lotId}
                className="border-line flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b py-4"
              >
                <span className="min-w-0">
                  <span data-numerals className="eyebrow text-muted">
                    {row.code}
                  </span>
                  <span className="text-ink mt-1 block text-base font-medium">
                    {row.title}
                  </span>
                </span>
                <span data-numerals className="text-right">
                  <span className="text-flare block text-base font-medium">
                    {pts(row.hammerPts)} {t.common.point}
                  </span>
                  <span
                    className={`block text-xs ${row.overdue ? "text-rust" : "text-muted"}`}
                  >
                    {row.overdue ? t.account.overdue : t.account.dueBy}:{" "}
                    {lotDate(row.dueBy)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-muted mt-3 text-sm">{t.account.winnerAction}</p>
        </section>
      )}

      <Panel
        heading={t.account.notifications}
        empty={t.account.notificationsEmpty}
        isEmpty={notifications.length === 0}
      >
        <ul className="border-line border-t">
          {notifications.map((n) => (
            <li
              key={n.id}
              className={`border-line border-b py-3 text-sm ${
                n.readAt ? "text-muted" : "text-ink"
              }`}
            >
              {n.href ? (
                <Link
                  href={n.href}
                  className="hover:text-accent transition-colors"
                >
                  {n.body}
                </Link>
              ) : (
                n.body
              )}
              <span data-numerals className="text-faint mt-0.5 block text-xs">
                {lotDate(n.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        heading={t.lot.watchlist}
        empty={t.lot.watchlistEmpty}
        isEmpty={watchlist.length === 0}
      >
        <ul className="border-line border-t">
          {watchlist.map((lot) => (
            <li key={lot.lotId} className="border-line border-b py-3.5">
              <Link
                href={`/auction/${lot.lotId}`}
                className="hover:text-accent flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 transition-colors"
              >
                <span>
                  <span data-numerals className="text-muted">
                    {lot.code}
                  </span>{" "}
                  {lot.title}
                </span>
                <span data-numerals className="text-muted text-xs">
                  {lotDate(lot.opensAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        heading={t.account.wonLots}
        empty={t.account.wonLotsEmpty}
        isEmpty={won.length === 0}
        note={won.length > 0 ? t.account.winnerAction : undefined}
      >
        <ul className="border-line border-t">
          {won.map((lot) => (
            <li key={lot.lotId} className="border-line border-b py-4">
              <Link
                href={`/auction/${lot.lotId}`}
                className="hover:text-accent flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5 transition-colors"
              >
                <span className="min-w-0">
                  <span data-numerals className="eyebrow text-muted">
                    {lot.code}
                  </span>
                  <span className="text-ink mt-1 block text-base font-medium">
                    {lot.title}
                  </span>
                </span>
                <span data-numerals className="text-right">
                  <span className="text-flare block text-base font-medium">
                    {pts(lot.hammerPts)} {t.common.point}
                  </span>
                  <span className="text-muted block text-xs">
                    {ptsToMnt(lot.hammerPts)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        heading={t.account.bidHistory}
        empty={t.account.bidHistoryEmpty}
        isEmpty={bids.length === 0}
      >
        {/*
          Fits a phone rather than scrolling sideways.
          The round is dropped below sm — it is the least actionable of the
          four, and the three that remain (which lot, what you bid, how it
          ended) are the reason anybody opens this. A horizontal scrollbar
          inside a vertical page is a control people do not find.
        */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-line border-y text-left">
                <th className="eyebrow py-3 pr-4 font-normal">{t.lot.lot}</th>
                <th className="eyebrow py-3 pr-4 font-normal">
                  {t.room.currentPrice}
                </th>
                <th className="eyebrow hidden py-3 pr-4 font-normal sm:table-cell">
                  {t.room.round}
                </th>
                <th className="eyebrow py-3 font-normal">{t.lot.result}</th>
              </tr>
            </thead>
            <tbody>
              {bids.map((bid) => (
                <tr key={bid.bidId} className="border-line border-b">
                  <td className="py-3 pr-4">
                    <Link
                      href={`/auction/${bid.lotId}`}
                      className="hover:text-accent transition-colors"
                    >
                      <span data-numerals className="text-muted">
                        {bid.lotCode}
                      </span>{" "}
                      {bid.lotTitle}
                    </Link>
                    <span
                      data-numerals
                      className="text-faint mt-0.5 block text-xs"
                    >
                      {lotDate(bid.placedAt)}
                    </span>
                  </td>
                  <td data-numerals className="text-ink py-3 pr-4">
                    {pts(bid.points)}
                  </td>
                  <td
                    data-numerals
                    className="text-muted hidden py-3 pr-4 sm:table-cell"
                  >
                    {bid.round}
                  </td>
                  <td className="py-3">
                    {bid.won ? (
                      <span className="text-flare font-medium">
                        {t.room.sold}
                      </span>
                    ) : bid.outcome === "running" ? (
                      <span className="text-rust">{t.room.live}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </AccountShell>
  );
}
