import "server-only";
import type { PoolClient } from "pg";
import { enqueue } from "./notifications";
import { openSettlement } from "./settlements";
import { t } from "../copy";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * HANDING A LOT TO ITS WINNER
 *
 * An admin names the winner of every lot. When bidding stops the lot waits in
 * `review` — `awaitDecision` puts it in front of the admins — until `awardLot`
 * or `declareUnsold` in admin-write.ts. A lot nobody bid on skips the wait and
 * is simply unsold.
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
   * Their highest bid on THIS lot. `bids` is append-only and prices strictly
   * increase, so this row is a fact nobody — this function included — can have
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
 * Tells every admin that a lot has stopped taking bids and is waiting for them
 * to name its winner.
 *
 * Call it straight after persisting a settlement into `review`, inside the same
 * transaction — whichever of the ticker and the bid path settles the lot first.
 * In-app, in the bell: the dashboard's queue is where the decision is made,
 * and this is what sends an admin there without them refreshing it.
 *
 * Bidders hear nothing at this point. Their messages are sent by the handover
 * (`grantLot`, `declareUnsold`), once there is a result to tell them.
 */
export async function awaitDecision(
  client: PoolClient,
  lotId: string,
): Promise<void> {
  const res = await client.query<{ code: string }>(
    "SELECT code FROM lots WHERE id = $1",
    [lotId],
  );
  const code = res.rows[0]?.code ?? lotId;

  const admins = await client.query<{ id: number }>(
    "SELECT id FROM users WHERE role = 'admin' AND status = 'active'",
  );
  for (const admin of admins.rows) {
    await enqueue(client, {
      userId: admin.id,
      channel: "inapp",
      kind: "lot.review",
      body: `${t.brand.name}: ${code} — лотын хаялт хаагдлаа. Ялагчийг тодруулна уу.`,
      href: `/admin/lots/${encodeURIComponent(lotId)}`,
      dedupeKey: `review:${lotId}`,
    });
  }
}
