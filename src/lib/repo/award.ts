import "server-only";
import type { PoolClient } from "pg";
import { record } from "../audit";
import { enqueue } from "./notifications";
import { t } from "../copy";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * HANDING A LOT TO ITS WINNER
 *
 * The moment the clocks close a lot, it goes to one of two people:
 *
 *   the instant winner — an admin chose them while the lot ran
 *                        (`designateWinner` in admin-write.ts)
 *   the last presser   — otherwise; that is the format (auction.ts)
 *
 * Either way it happens in the same transaction that closed the lot
 * (`closeBidding`), so `review` is passed through rather than waited in, and
 * nobody decides anything by hand afterwards. A lot nobody pressed is simply
 * unsold.
 *
 * The handover itself is `grantLot`: the sale and the messages. There is no
 * settlement — the winner owes nothing more; the presses were the price. Who
 * made the call lives in `awarded_by` (the admin who chose an instant winner,
 * NULL for the last presser) and the audit log.
 *
 * Every function here expects the caller to hold the auction row lock.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Tells everyone who pressed on a lot, except the winner, that it has been
 * decided.
 *
 * In-app rather than SMS. The winner gets a text because they have something to
 * collect on a deadline; everybody else gets a line in the bell, because "you
 * did not win" is worth knowing and is not worth a message charge per presser
 * per lot.
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
  /** How many times the winner pressed. */
  presses: number;
  /** The round of their last press. */
  lastRound: number;
  paddle: string;
  name: string;
}

/**
 * Marks the lot sold to `winnerUserId` and tells everyone who pressed. Null if
 * the winner never pressed on it.
 *
 * `current_pts` — the lot's total presses — is left as it is: it is what the
 * room shows beside the result. The audit row is the caller's: what it should
 * say — the last press, or which admin chose — is theirs to write.
 */
export async function grantLot(
  client: PoolClient,
  lotId: string,
  code: string,
  winnerUserId: number,
  awardedBy: number | null,
): Promise<Granted | null> {
  /*
   * From `bids`, which is append-only, so the winner is somebody with a press
   * on THIS lot that nobody — this function included — can have edited into
   * existence.
   */
  const res = await client.query<{
    presses: number;
    last_round: number;
    paddle: string;
    name: string;
  }>(
    `SELECT count(*)::int AS presses, max(b.round) AS last_round,
            u.paddle, u.name
       FROM bids b JOIN users u ON u.id = b.user_id
      WHERE b.lot_id = $1 AND b.user_id = $2
      GROUP BY u.paddle, u.name`,
    [lotId, winnerUserId],
  );
  const winner = res.rows[0];
  if (!winner) return null;

  await client.query(
    `UPDATE auctions
        SET outcome        = 'sold',
            leader_user_id = $2,
            leader_paddle  = $3,
            hammer_round   = COALESCE(hammer_round, round),
            settled_at     = COALESCE(settled_at, now()),
            awarded_at     = now(),
            awarded_by     = $4,
            version        = version + 1,
            updated_at     = now()
      WHERE lot_id = $1`,
    [lotId, winnerUserId, winner.paddle, awardedBy],
  );

  await enqueue(client, {
    userId: winnerUserId,
    channel: "sms",
    kind: "lot.won",
    body:
      `${t.brand.name}: Баяр хүргэе — ${code} лотын ялагч та боллоо. ` +
      "Ажлын 7 хоногийн дотор бидэнтэй холбогдоно уу.",
    href: "/profile",
    dedupeKey: `won:${lotId}`,
  });

  await announceDecision(
    client,
    lotId,
    code,
    winnerUserId,
    "лотын ялагч тодорлоо. Энэ удаад та биш байна.",
  );

  return {
    presses: winner.presses,
    lastRound: winner.last_round,
    paddle: winner.paddle,
    name: winner.name,
  };
}

/**
 * What happens the moment a lot stops taking presses and lands in `review`:
 * it goes to the instant winner if an admin chose one, and to the last
 * presser otherwise. True when it sold the lot.
 *
 * Call it straight after persisting that settlement, inside the same
 * transaction — whichever of the ticker, the press path and an admin's «Хаах»
 * closes the lot first.
 *
 * If neither can be given it — no account behind the lead, which nothing
 * produces any more — the lot is left in `review` and the admins are told, so
 * it is never silently stuck.
 */
export async function closeBidding(
  client: PoolClient,
  lotId: string,
): Promise<boolean> {
  const res = await client.query<{
    code: string;
    designated_user_id: number | null;
    designated_by: number | null;
    leader_user_id: number | null;
    leader_paddle: string | null;
    current_pts: number;
  }>(
    `SELECT l.code, a.designated_user_id, a.designated_by, a.leader_user_id,
            a.leader_paddle, a.current_pts
       FROM auctions a JOIN lots l ON l.id = a.lot_id
      WHERE a.lot_id = $1`,
    [lotId],
  );
  const lot = res.rows[0];
  if (!lot) return false;

  const instant = lot.designated_user_id !== null;
  const winnerUserId = lot.designated_user_id ?? lot.leader_user_id;

  if (winnerUserId !== null) {
    const granted = await grantLot(
      client,
      lotId,
      lot.code,
      winnerUserId,
      instant ? lot.designated_by : null,
    );
    if (granted) {
      await record(client, {
        actorUserId: instant ? lot.designated_by : null,
        action: "auction.sold",
        targetType: "lot",
        targetId: lotId,
        detail: {
          instant,
          winnerUserId,
          winnerPaddle: granted.paddle,
          winnerPresses: granted.presses,
          lastPresser: lot.leader_paddle,
          totalPresses: lot.current_pts,
        },
      });
      return true;
    }
  }

  const admins = await client.query<{ id: number }>(
    "SELECT id FROM users WHERE role = 'admin' AND status = 'active'",
  );
  for (const admin of admins.rows) {
    await enqueue(client, {
      userId: admin.id,
      channel: "inapp",
      kind: "lot.review",
      body: `${t.brand.name}: ${lot.code} — лот хаагдсан ч ялагчийг тогтоож чадсангүй. Ялагчийг тодруулна уу.`,
      href: `/admin/lots/${encodeURIComponent(lotId)}`,
      dedupeKey: `review:${lotId}`,
    });
  }
  return false;
}
