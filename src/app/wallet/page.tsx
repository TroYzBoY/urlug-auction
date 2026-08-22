import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountShell, Panel, Stat } from "@/components/account/AccountShell";
import { TopupPackages } from "@/components/account/TopupPackages";
import { ledgerHistory } from "@/lib/repo/account";
import { PACKAGES, findTopup, topupHistory } from "@/lib/repo/topups";
import { currentUser } from "@/lib/session";
import { groupNumber, lotDate, pts, ptsToMnt } from "@/lib/format";
import { t } from "@/lib/copy";

export const metadata: Metadata = {
  title: t.account.walletTitle,
  robots: { index: false, follow: false },
};

export default async function WalletPage(props: PageProps<"/wallet">) {
  const user = await currentUser();
  if (!user) redirect("/login?redirect=/wallet");

  const params = await props.searchParams;
  const paidRef = Array.isArray(params.paid) ? params.paid[0] : params.paid;

  const [ledger, topups, paid] = await Promise.all([
    ledgerHistory(user.id),
    topupHistory(user.id),
    /*
     * The `?paid=` banner is rendered from the DATABASE, not from the query
     * parameter. Trusting the parameter would let anyone congratulate
     * themselves on a purchase they never made by editing the URL — harmless
     * in itself, but it would also show a points figure that never arrived.
     */
    paidRef ? findTopup(paidRef) : Promise.resolve(null),
  ]);

  const confirmed =
    paid && paid.status === "paid" ? paid : null;

  return (
    <AccountShell
      eyebrow={user.paddle}
      title={t.account.walletTitle}
      lede={t.account.walletLede}
      actions={
        <Link
          href="/profile"
          className="eyebrow flex h-10 items-center border border-line px-4 text-ink transition-colors hover:border-accent hover:text-accent"
        >
          {t.account.profileTitle}
        </Link>
      }
    >
      {confirmed && (
        <p
          role="status"
          className="mt-8 border-l-2 border-olive bg-olive/5 py-3 pl-4 text-sm text-ink-soft"
        >
          {t.account.paidNotice(confirmed.points)}
        </p>
      )}

      <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-4">
        <Stat
          label={t.account.balance}
          value={pts(user.balancePts)}
          sub={ptsToMnt(user.balancePts)}
          accent
        />
      </div>

      {!user.phoneVerified ? (
        <p className="mt-10 border-l-2 border-rust bg-rust/5 py-3 pl-4 text-sm text-rust">
          {t.account.verifyFirst}
        </p>
      ) : (
        <section className="mt-14">
          <h2 className="text-lg font-medium tracking-[-0.02em] text-ink">
            {t.account.packages}
          </h2>
          <TopupPackages packages={[...PACKAGES]} />
        </section>
      )}

      <Panel
        heading={t.account.topupHistory}
        empty={t.account.transactionsEmpty}
        isEmpty={topups.length === 0}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-sm">
            <thead>
              <tr className="border-y border-line text-left">
                <th className="eyebrow py-3 pr-4 font-normal">
                  {t.account.balance}
                </th>
                <th className="eyebrow py-3 pr-4 font-normal">₮</th>
                <th className="eyebrow py-3 pr-4 font-normal">
                  {t.lot.startsAt}
                </th>
                <th className="eyebrow py-3 font-normal">{t.lot.result}</th>
              </tr>
            </thead>
            <tbody>
              {topups.map((row) => (
                <tr key={row.id} className="border-b border-line">
                  <td data-numerals className="py-3 pr-4 text-ink">
                    +{pts(row.points)}
                  </td>
                  <td data-numerals className="py-3 pr-4 text-muted">
                    {groupNumber(row.amountMnt)}₮
                  </td>
                  <td data-numerals className="py-3 pr-4 text-muted">
                    {lotDate(row.createdAt)}
                  </td>
                  <td className="py-3">
                    <span
                      className={
                        row.status === "paid"
                          ? "text-olive"
                          : row.status === "pending"
                            ? "text-flare"
                            : "text-muted"
                      }
                    >
                      {t.account.status[row.status] ?? row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        heading={t.account.transactions}
        empty={t.account.transactionsEmpty}
        isEmpty={ledger.length === 0}
      >
        <ul className="border-t border-line">
          {ledger.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line py-3.5"
            >
              <span className="min-w-0">
                <span className="text-sm text-ink">
                  {t.account.kind[row.kind] ?? row.kind}
                </span>
                {row.memo && (
                  <span className="ml-2 text-xs text-muted">{row.memo}</span>
                )}
                <span data-numerals className="mt-0.5 block text-xs text-faint">
                  {lotDate(row.createdAt)}
                </span>
              </span>
              <span
                data-numerals
                className={`text-sm font-medium ${
                  row.deltaPts > 0 ? "text-olive" : "text-ink"
                }`}
              >
                {row.deltaPts > 0 ? "+" : "−"}
                {pts(Math.abs(row.deltaPts))} {t.common.point}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </AccountShell>
  );
}
