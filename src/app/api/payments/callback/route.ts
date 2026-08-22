import type { NextRequest } from "next/server";
import { recordDetached } from "@/lib/audit";
import { verifyCallback } from "@/lib/payments";
import { failTopup, settleTopup } from "@/lib/repo/topups";

/**
 * Where the payment provider tells us a bidder paid.
 *
 * Three properties this endpoint must have, in order of how expensive getting
 * them wrong is:
 *
 *   1. AUTHENTICATED. It credits points. `verifyCallback` returns false when no
 *      secret is configured, so an unconfigured deploy rejects everything
 *      rather than accepting anything.
 *   2. IDEMPOTENT. Every provider retries; `settleTopup` locks the row and
 *      credits once.
 *   3. FORGIVING OF ITS OWN ERRORS. A 500 makes the provider retry, which is
 *      right for a transient fault and wrong for a malformed body — that one
 *      would retry forever.
 */
export async function POST(request: NextRequest) {
  // The RAW body. Re-serialising parsed JSON changes key order and whitespace,
  // and the signature stops matching.
  const raw = await request.text();

  let genuine = false;
  try {
    genuine = await verifyCallback(request.headers, raw);
  } catch (err) {
    console.error("[payments] callback verification failed", err);
  }

  if (!genuine) {
    recordDetached({
      action: "payment.callback_rejected",
      detail: { reason: "signature" },
    });
    return new Response("Forbidden", { status: 403 });
  }

  let payload: { reference?: string; providerRef?: string; status?: string };
  try {
    payload = JSON.parse(raw);
  } catch {
    // 400, not 500: the body will not become valid on a retry.
    return new Response("Bad request", { status: 400 });
  }

  const { reference, providerRef, status } = payload;
  if (!reference || !providerRef) {
    return new Response("Bad request", { status: 400 });
  }

  if (status && status !== "PAID") {
    await failTopup(reference, `provider reported ${status}`);
    return Response.json({ ok: true });
  }

  const result = await settleTopup(reference, providerRef);
  if (!result.ok) {
    recordDetached({
      action: "payment.callback_unsettled",
      targetType: "topup",
      targetId: reference,
      detail: { reason: result.reason },
    });
    /*
     * 200 even so. The provider cannot fix an expired or unknown reference by
     * retrying, and leaving it retrying forever buries the real callbacks. The
     * audit row is where this gets investigated.
     */
    return Response.json({ ok: false, reason: result.reason });
  }

  return Response.json({ ok: true, credited: result.credited });
}
