import { currentUser } from "@/lib/session";
import { Header } from "./Header";

/**
 * The header, with the session read.
 *
 * `Header` is a Client Component — it owns the burger menu and the theme
 * toggle — and a client cannot read an httpOnly session cookie. So this Server
 * Component reads it and passes down only what the header renders: a paddle, a
 * balance and a boolean. The phone number, the role string and the user id stay
 * on the server, where a signed-in bidder's own devtools cannot read them out
 * of the RSC payload.
 */
export async function SiteHeader({ minimal = false }: { minimal?: boolean }) {
  const user = await currentUser();

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
    />
  );
}
