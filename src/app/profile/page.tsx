import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountShell, Panel, Stat } from "@/components/account/AccountShell";
import { SignOutButton } from "@/components/account/SignOutButton";
import { accountSummary, bidHistory, wonLots } from "@/lib/repo/account";
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
  const [summary, bids, won] = await Promise.all([
    accountSummary(user.id),
    bidHistory(user.id),
    wonLots(user.id),
  ]);

  return (
    <AccountShell
      eyebrow={user.paddle}
      title={t.account.profileTitle}
      lede={t.account.profileLede}
      actions={
        <>
          <Link
            href="/wallet"
            className="eyebrow flex h-10 items-center border border-line px-4 text-ink transition-colors hover:border-accent hover:text-accent"
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

      <dl className="mt-10 grid grid-cols-2 gap-6 border-t border-line pt-6 md:grid-cols-3">
        <div>
          <dt className="eyebrow">{t.account.paddle}</dt>
          <dd data-numerals className="mt-1.5 text-sm text-ink">
            {user.paddle}
          </dd>
        </div>
        <div>
          <dt className="eyebrow">{t.account.phone}</dt>
          <dd data-numerals className="mt-1.5 text-sm text-ink">
            {user.phone}
          </dd>
        </div>
        <div>
          <dt className="eyebrow">{t.account.spent}</dt>
          <dd data-numerals className="mt-1.5 text-sm text-ink">
            {pts(summary.spentPts)} {t.common.point}
          </dd>
        </div>
      </dl>

      <Panel
        heading={t.account.wonLots}
        empty={t.account.wonLotsEmpty}
        isEmpty={won.length === 0}
        note={won.length > 0 ? t.account.winnerAction : undefined}
      >
        <ul className="border-t border-line">
          {won.map((lot) => (
            <li key={lot.lotId} className="border-b border-line py-4">
              <Link
                href={`/auction/${lot.lotId}`}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5 transition-colors hover:text-accent"
              >
                <span className="min-w-0">
                  <span data-numerals className="eyebrow text-muted">
                    {lot.code}
                  </span>
                  <span className="mt-1 block text-base font-medium text-ink">
                    {lot.title}
                  </span>
                </span>
                <span data-numerals className="text-right">
                  <span className="block text-base font-medium text-flare">
                    {pts(lot.hammerPts)} {t.common.point}
                  </span>
                  <span className="block text-xs text-muted">
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
        {/* Wide table, narrow phone. The wrapper scrolls, the page does not. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-y border-line text-left">
                <th className="eyebrow py-3 pr-4 font-normal">{t.lot.lot}</th>
                <th className="eyebrow py-3 pr-4 font-normal">
                  {t.room.currentPrice}
                </th>
                <th className="eyebrow py-3 pr-4 font-normal">{t.room.round}</th>
                <th className="eyebrow py-3 font-normal">{t.lot.result}</th>
              </tr>
            </thead>
            <tbody>
              {bids.map((bid) => (
                <tr key={bid.bidId} className="border-b border-line">
                  <td className="py-3 pr-4">
                    <Link
                      href={`/auction/${bid.lotId}`}
                      className="transition-colors hover:text-accent"
                    >
                      <span data-numerals className="text-muted">
                        {bid.lotCode}
                      </span>{" "}
                      {bid.lotTitle}
                    </Link>
                    <span
                      data-numerals
                      className="mt-0.5 block text-xs text-faint"
                    >
                      {lotDate(bid.placedAt)}
                    </span>
                  </td>
                  <td data-numerals className="py-3 pr-4 text-ink">
                    {pts(bid.points)}
                  </td>
                  <td data-numerals className="py-3 pr-4 text-muted">
                    {bid.round}
                  </td>
                  <td className="py-3">
                    {bid.won ? (
                      <span className="font-medium text-flare">
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
