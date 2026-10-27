import "server-only";
import type { PoolClient } from "pg";
import { record } from "../audit";
import { enqueue } from "./notifications";
import { openSettlement } from "./settlements";
import { t } from "../copy";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * HANDING A LOT TO ITS WINNER
 *
 * An admin names the winner of every lot, in one of two ways:
 *
 *   in advance — while the lot is still taking bids (`designateWinner` in
 *                admin-write.ts). Bidding carries on; when it stops,
 *                `closeBidding` hands the lot to that bidder at once.
 *   afterwards — nobody was chosen, so the lot waits in `review`, in front of
 *                the admins, until `awardLot` or `declareUnsold`.
 *
 * A lot nobody bid on skips both and is simply unsold.
 *
 * The handover itself is `grantLot`: the sale, the settlement and the messages
 * to the bidders. Who made the call lives in `awarded_by` and the audit log.
 * (Lots sold before this rule have `awarded_by` NULL: the clock chose then.)
 *
 * Every function here expects the caller to hold the auction row lock.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Tells everyone who bid on a lot, except the winner, that it has been decided.
 *
 * In-app rather than SMS. The winner gets a text because they now owe money on
 * a deadline; everybody else gets a line in the bell, because "you did not win"
 * is worth knowing and is not worth a message charge per bidder per lot.
 */
export async function announceDecision(
  client: PoolClient,
  lotId: string,
  code: string,
  exceptUserId: number | null,
  body: string,
): Promise<void> {
  const bidders = await client.query<{ user_id: number }>(
    "SELECT DISTINCT user_id FROM bids WHERE lot_id = $1",
    [lotId],
  );
  for (const bidder of bidders.rows) {
    if (bidder.user_id === exceptUserId) continue;
    await enqueue(client, {
      userId: bidder.user_id,
      channel: "inapp",
      kind: "lot.decided",
      body: `${t.brand.name}: ${code} — ${body}`,
      href: `/auction/${lotId}`,
      dedupeKey: `decided:${lotId}`,
    });
  }
}

export interface Granted {
  hammerPts: number;
  hammerRound: number;
  paddle: string;
  name: string;
}

/**
 * Marks the lot sold to `winnerUserId` at that bidder's own highest bid, opens
 * the settlement, and tells the other bidders. Null if they never bid on it.
 *
 * The price is the winner's own top bid, never the standing price: if the house
 * passes over the top bidder, the lot is sold at what the person who actually
 * gets it offered. For the standing leader the two are the same number.
 *
 * The audit row is the caller's: what it should say — which admin chose, and
 * why — is theirs to write.
 */
export async function grantLot(
  client: PoolClient,
  lotId: string,
  code: string,
  winnerUserId: number,
  awardedBy: number | null,
): Promise<Granted | null> {
  /*
   * Their highest bid on THIS lot. `bids` is append-only and each bidder's
   * price strictly increases, so this row is a fact nobody — this function included — can have
   * edited into existence.
   */
  const bid = await client.query<{
    points: number;
    round: number;
    paddle: string;
    name: string;
  }>(
    `SELECT b.points, b.round, b.paddle, u.name
       FROM bids b JOIN users u ON u.id = b.user_id
      WHERE b.lot_id = $1 AND b.user_id = $2
      ORDER BY b.points DESC
      LIMIT 1`,
    [lotId, winnerUserId],
  );
  const winning = bid.rows[0];
  if (!winning) return null;

  await client.query(
    `UPDATE auctions
        SET outcome        = 'sold',
            leader_user_id = $2,
            leader_paddle  = $3,
            current_pts    = $4,
            hammer_round   = $5,
            settled_at     = COALESCE(settled_at, now()),
            awarded_at     = now(),
            awarded_by     = $6,
            version        = version + 1,
            updated_at     = now()
      WHERE lot_id = $1`,
    [
      lotId,
      winnerUserId,
      winning.paddle,
      winning.points,
      winning.round,
      awardedBy,
    ],
  );

  await openSettlement(client, lotId, winnerUserId, winning.points, code);

  await announceDecision(
    client,
    lotId,
    code,
    winnerUserId,
    "лотын ялагч тодорлоо. Энэ удаад та биш байна.",
  );

  return {
    hammerPts: winning.points,
    hammerRound: winning.round,
    paddle: winning.paddle,
    name: winning.name,
  };
}

/**
 * What happens the moment a lot stops taking bids and lands in `review`.
 *
 * Call it straight after persisting that settlement, inside the same
 * transaction — whichever of the ticker and the bid path settles the lot
 * first. True when it sold the lot.
 *
 *   • An admin chose a winner in advance: the lot goes to them now, at their
 *     own top bid, recorded as that admin's decision.
 *   • Nobody did: every admin is told in the bell, and the lot waits in the
 *     dashboard's queue.
 *
 * Bidders hear nothing from the second case. Their messages are sent by the
 * handover (`grantLot`, `declareUnsold`), once there is a result to tell them.
 */
export async function closeBidding(
  client: PoolClient,
  lotId: string,
): Promise<boolean> {
  const res = await client.query<{
    code: string;
    designated_user_id: number | null;
    designated_by: number | null;
    leader_paddle: string | null;
    current_pts: number;
  }>(
    `SELECT l.code, a.designated_user_id, a.designated_by, a.leader_paddle,
            a.current_pts
       FROM auctions a JOIN lots l ON l.id = a.lot_id
      WHERE a.lot_id = $1`,
    [lotId],
  );
  const lot = res.rows[0];
  if (!lot) return false;

  if (lot.designated_user_id !== null) {
    const granted = await grantLot(
      client,
      lotId,
      lot.code,
      lot.designated_user_id,
      lot.designated_by,
    );
    if (granted) {
      await record(client, {
        actorUserId: lot.designated_by,
        action: "auction.sold",
        targetType: "lot",
        targetId: lotId,
        detail: {
          designated: true,
          winnerUserId: lot.designated_user_id,
          winnerPaddle: granted.paddle,
          hammerPts: granted.hammerPts,
          hammerRound: granted.hammerRound,
          standingLeader: lot.leader_paddle,
          standingPts: lot.current_pts,
        },
      });
      return true;
    }
    // Not a bidder after all — cannot happen through designateWinner, but if
    // it does the lot must not vanish: it waits for a person like any other.
  }

  const admins = await client.query<{ id: number }>(
    "SELECT id FROM users WHERE role = 'admin' AND status = 'active'",
  );
  for (const admin of admins.rows) {
    await enqueue(client, {
      userId: admin.id,
      channel: "inapp",
      kind: "lot.review",
      body: `${t.brand.name}: ${lot.code} — лотын хаялт хаагдлаа. Ялагчийг тодруулна уу.`,
      href: `/admin/lots/${encodeURIComponent(lotId)}`,
      dedupeKey: `review:${lotId}`,
    });
  }
  return false;
}
