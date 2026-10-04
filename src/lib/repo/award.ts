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
 * Two ways a lot is decided, one way it is handed over.
 *
 *   automatic — the default. When bidding stops, the standing leader takes the
 *               lot at the standing price, in the same transaction that closed
 *               it (`awardAutomatically`, called by the ticker and by the bid
 *               path whichever settles the lot first).
 *   by hand   — an admin switched the lot to `manual_award` before it closed.
 *               It waits in `review` until `awardLot` in admin-write.ts.
 *
 * Both end in `grantLot`, so the sale, the settlement and the messages to the
 * bidders are the same rows whichever way it went. That sameness is the point:
 * what a bidder sees and receives does not depend on who made the call. The
 * difference lives where it belongs — `awarded_by` and the audit log.
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
 * The audit row is the caller's, because what it should say — a clock closed
 * this, or a named admin chose — is the one thing that differs.
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
 * Hands a lot that has just stopped taking bids to its standing leader — unless
 * an admin has said they will decide this one.
 *
 * Call it straight after persisting a settlement into `review`, inside the same
 * transaction. True when it sold the lot; false when the lot is left waiting:
 * marked for a person, or with no leader on record to give it to.
 */
export async function awardAutomatically(
  client: PoolClient,
  lotId: string,
): Promise<boolean> {
  const res = await client.query<{
    outcome: string;
    manual_award: boolean;
    leader_user_id: number | null;
    leader_paddle: string | null;
    current_pts: number;
    code: string;
  }>(
    `SELECT a.outcome, a.manual_award, a.leader_user_id, a.leader_paddle,
            a.current_pts, l.code
       FROM auctions a JOIN lots l ON l.id = a.lot_id
      WHERE a.lot_id = $1
      FOR UPDATE OF a`,
    [lotId],
  );
  const lot = res.rows[0];
  if (!lot || lot.outcome !== "review" || lot.manual_award) return false;
  if (lot.leader_user_id === null) return false;

  const granted = await grantLot(
    client,
    lotId,
    lot.code,
    lot.leader_user_id,
    null,
  );
  if (!granted) return false;

  await record(client, {
    actorUserId: null,
    action: "auction.sold",
    targetType: "lot",
    targetId: lotId,
    detail: {
      automatic: true,
      winnerUserId: lot.leader_user_id,
      winnerPaddle: granted.paddle,
      hammerPts: granted.hammerPts,
      hammerRound: granted.hammerRound,
    },
  });

  return true;
}
