"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { placeBid as placeBidInRepo } from "@/lib/repo/bids";
import { publish } from "@/lib/realtime";
import { currentUser, clientIpFrom } from "@/lib/session";
import { recordDetached } from "@/lib/audit";
import { log, reportError, timed } from "@/lib/observability";
import { bidSchema } from "@/lib/validation";
import type { BidResult } from "@/lib/api";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PLACE A BID
 *
 * A Server Function, which is to say an HTTP endpoint with a nice calling
 * convention. Everything a browser can reach, curl can reach — so this
 * re-establishes from scratch what the client believed:
 *
 *   who you are        → the session cookie, never an argument
 *   which paddle       → the users row, never an argument
 *   whether you have bid on this lot before → lot_participants
 *   which round it is  → the auction row, settled against the server clock
 *   whether the bid is legal → auction.ts, re-run under the row lock
 *
 * What it does NOT do is rate limit. See the note where the limiter used to be.
 *
 * The client's `isLegalBid` check in BidPanel remains, and remains a UX
 * affordance: it saves a round trip on an obviously low bid. It is not what
 * stops one.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function placeBid(
  lotId: string,
  points: number,
  idempotencyKey: string,
): Promise<BidResult> {
  const parsed = bidSchema.safeParse({ lotId, points, idempotencyKey });
  if (!parsed.success) return { ok: false, reason: "too-low" };

  const user = await currentUser();
  if (!user) return { ok: false, reason: "not-registered" };
  if (!user.phoneVerified) return { ok: false, reason: "not-verified" };

  const h = await headers();
  const ip = clientIpFrom(h);
  const userAgent = h.get("user-agent")?.slice(0, 500) ?? null;

  /*
   * ⚠ NO RATE LIMIT ON BIDDING — removed deliberately.
   *
   * There were two buckets here: twelve bids per bidder per ten seconds, and
   * 240 per lot across everyone. Both were removed on request, because in a
   * real duel in round 6 — a five-second clock, a bidder tapping the step
   * button — the per-user limit is reachable by a person who is simply bidding
   * fast, and being told "хэт олон хаялт" at the moment the lot is decided is
   * worse than the flood it was guarding against.
   *
   * What still stands between this and a script:
   *
   *   • the row lock in `placeBid` serialises every bid on a lot, so a flood
   *     queues rather than racing
   *   • the price must strictly increase, so N bids cost N × the increment —
   *     a script cannot bid a thousand times without spending a thousand times
   *   • `bids_price_idx` refuses two bids at one price on one lot
   *   • the join fee and the balance are charged from the server's numbers
   *
   * If a flood ever does become a problem, put the per-LOT bucket back first —
   * it is the one that protects the database without ever rejecting a bidder
   * for bidding quickly.
   */

  try {
    /*
     * Timed, because a bid is the one request whose latency is a correctness
     * concern rather than a comfort one: 900ms in round 6 is a fifth of the
     * clock, and the bidder experiences it as the site being broken.
     */
    const result = await timed(
      "bid.placed",
      { lotId: parsed.data.lotId, userId: user.id, points: parsed.data.points },
      () =>
        placeBidInRepo({
          lotId: parsed.data.lotId,
          userId: user.id,
          paddle: user.paddle,
          name: user.name,
          points: parsed.data.points,
          idempotencyKey: parsed.data.idempotencyKey,
          ip,
          userAgent,
        }),
    );

    if (!result.ok) {
      log.info({
        event: "bid.rejected",
        lotId: parsed.data.lotId,
        userId: user.id,
        reason: result.reason,
      });
      recordDetached({
        actorUserId: user.id,
        action: "bid.rejected",
        targetType: "lot",
        targetId: parsed.data.lotId,
        detail: { reason: result.reason, points: parsed.data.points },
        ip,
        userAgent,
      });
      return { ok: false, reason: result.reason };
    }

    /*
     * Announce AFTER the transaction commits. A notification sent from inside
     * it would, on a rollback, tell every subscriber to go and read a bid that
     * does not exist.
     *
     * A duplicate — the same idempotency key arriving twice — is not
     * republished: subscribers already have that bid, and a second push would
     * make one bid appear twice in the feed.
     */
    if (!result.duplicate) await publish(parsed.data.lotId);

    /*
     * The room updates over SSE, so the client does not need this. It refreshes
     * the Server Components around the room — the header's balance, the
     * catalogue's bid counts — which SSE does not touch.
     */
    refresh();

    return { ok: true, acceptedPts: result.acceptedPts };
  } catch (err) {
    reportError(err, {
      event: "bid.error",
      lotId: parsed.data.lotId,
      userId: user.id,
    });
    recordDetached({
      actorUserId: user.id,
      action: "bid.error",
      targetType: "lot",
      targetId: parsed.data.lotId,
      detail: { message: String(err) },
      ip,
      userAgent,
    });
    /*
     * A generic reason, deliberately. The bidder gets a rollback and a retry;
     * the details go to the log, not to the response, where a database error
     * message would describe the schema to whoever provoked it.
     */
    return { ok: false, reason: "error" };
  }
}
