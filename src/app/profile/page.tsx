import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountShell, Panel, Stat } from "@/components/account/AccountShell";
import { ProfileSettings } from "@/components/account/ProfileSettings";
import { SignOutButton } from "@/components/account/SignOutButton";
import { accountSummary } from "@/lib/repo/account";
import { forUser as settlementsForUser } from "@/lib/repo/settlements";
import { currentUser } from "@/lib/session";
import { lotDate, pts, ptsToMnt } from "@/lib/format";
import { t } from "@/lib/copy";

export const metadata: Metadata = {
  title: t.account.profileTitle,
  robots: { index: false, follow: false },
};

/**
 * The profile, pared to what a bidder actually manages here: who they are,
 * what they can spend, the one thing they can edit, and any money they owe.
 *
 * The activity lists that used to stack below — notifications, watchlist, won
 * lots, the bid-history table — were the bulk of the page and none of it is
 * managed from here. Notifications live in the header bell; a won lot that
 * still needs settling is the only history that is also an obligation, so it is
 * the only one kept, and only while there is one outstanding.
 */
export default async function ProfilePage() {
  const user = await currentUser();
  /*
   * `redirect`, not a "please sign in" panel. The page has nothing to show a
   * signed-out visitor, and `?redirect=` brings them back here afterwards.
   */
  if (!user) redirect("/login?redirect=/profile");

  /*
   * Both queries take `user.id` from the session, never from the URL —
   * `/profile` shows this bidder and nothing else, and a user id read from a
   * route parameter would be an IDOR on the whole bidder list.
   */
  const [summary, settlements] = await Promise.all([
    accountSummary(user.id),
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
      {/* Balance leads — it is the number that decides whether this bidder can
          act at all. */}
      <div className="mt-10">
        <Stat
          label={t.account.balance}
          value={pts(summary.balancePts)}
          sub={ptsToMnt(summary.balancePts)}
          accent
        />
      </div>

      {/* Identity — read-only, three short facts. */}
      <dl className="border-line mt-8 grid grid-cols-2 gap-6 border-t pt-6 md:grid-cols-3">
        <div>
          <dt className="eyebrow">{t.account.name}</dt>
          <dd className="text-ink mt-1.5 text-sm">{user.name}</dd>
        </div>
        <div>
          <dt className="eyebrow">{t.account.phone}</dt>
          <dd data-numerals className="text-ink mt-1.5 text-sm">
            {user.phone}
          </dd>
        </div>
        <div>
          <dt className="eyebrow">{t.account.paddle}</dt>
          <dd data-numerals className="text-ink mt-1.5 text-sm">
            {user.paddle}
          </dd>
        </div>
      </dl>

      <Panel
        heading={t.account.settings}
        empty="—"
        isEmpty={false}
        note={t.account.settingsLede}
      >
        <ProfileSettings name={user.name} familyName={user.familyName} />
      </Panel>

      {/*
        What the bidder owes is the one piece of history kept: a won lot carries
        a seven-day obligation under the terms, and a winner who misses it has a
        real problem. Shown only while something is outstanding.
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
    </AccountShell>
  );
}
