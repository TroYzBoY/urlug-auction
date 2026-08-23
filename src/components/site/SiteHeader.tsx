import { inbox, unreadCount } from "@/lib/repo/notifications";
import { currentUser } from "@/lib/session";
import { Header } from "./Header";

/**
 * The header, with the session read.
 *
 * `Header` is a Client Component — it owns the burger menu, the bell and the
 * theme toggle — and a client cannot read an httpOnly session cookie. So this
 * Server Component reads it and passes down only what the header renders: a
 * paddle, a balance, a boolean and a short list of notifications. The phone
 * number, the role string and the user id stay on the server, where a signed-in
 * bidder's own devtools cannot read them out of the RSC payload.
 */

/**
 * How many notifications the panel holds.
 *
 * Not the profile page's thirty. This query runs on every page a signed-in
 * bidder loads, and the panel is a glance rather than an archive — "see all"
 * at the bottom goes to the full list.
 */
const BELL_LIMIT = 8;

export async function SiteHeader({ minimal = false }: { minimal?: boolean }) {
  const user = await currentUser();

  /*
   * Two queries, and only for a signed-in visitor. Both are indexed on
   * (user_id) and the count is a bare aggregate, but they are still two round
   * trips added to every page — worth doing in parallel, and worth not doing at
   * all for the anonymous visitors who are most of the traffic.
   */
  const notifications = user
    ? await Promise.all([
        inbox(user.id, BELL_LIMIT),
        unreadCount(user.id),
      ]).then(([items, unread]) => ({
        items: items.map((n) => ({
          id: n.id,
          body: n.body,
          href: n.href,
          createdAt: n.createdAt,
          unread: n.readAt === null,
        })),
        unread,
      }))
    : null;

  return (
    <Header
      minimal={minimal}
      account={
        user
          ? {
              paddle: user.paddle,
              balancePts: user.balancePts,
              isStaff: user.role === "admin" || user.role === "staff",
            }
          : null
      }
      notifications={notifications}
    />
  );
}
