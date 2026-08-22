import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { IS_PRODUCTION } from "@/lib/env";
import { settleTopup } from "@/lib/repo/topups";
import { currentUser } from "@/lib/session";

/**
 * Stands in for the payment provider's page, in development only.
 *
 * ⚠ It credits points without anybody paying, so the production guard below is
 * the whole safety of it. Two independent checks — the route refuses to exist
 * in production, and `createInvoice` refuses to point at it — because a single
 * check on a route that mints money is one deploy misconfiguration away from
 * being free points.
 */
export async function GET(request: NextRequest) {
  if (IS_PRODUCTION) return new Response("Not found", { status: 404 });

  // Signed in, so a stray link cannot settle a stranger's top-up even locally.
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const reference = request.nextUrl.searchParams.get("reference");
  if (!reference) return new Response("Missing reference", { status: 400 });

  const result = await settleTopup(reference, `dev-${reference}`);
  if (!result.ok) {
    return new Response(`Top-up ${result.reason}`, { status: 400 });
  }

  redirect(`/wallet?paid=${encodeURIComponent(reference)}`);
}
