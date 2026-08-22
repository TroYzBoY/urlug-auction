import "server-only";
import type { PoolClient } from "pg";
import { transaction } from "../db";
import {
  LATE_JOIN_PENALTY_PTS,
  bidClockMs,
  isLegalBid,
  minNextBidPts,
} from "../auction";
import { settle, type EngineState, type SettledState } from "../auction-engine";
import { record } from "../audit";
import { enqueue } from "./notifications";
import { t } from "../copy";
import type { Bid } from "../types";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PLACING A BID — the one operation that must be exactly right
 *
 * Everything below happens inside a single transaction that opens by taking a
 * row lock on the auction. That lock is the whole design: it makes bids on one
 * lot strictly sequential, so "is this bid high enough" and "record this bid"
 * cannot be separated by another bidder's write.
 *
 * The order of operations is deliberate:
 *
 *   1. LOCK the auction row              ← serialises every bidder on this lot
 *   2. Check idempotency                 ← a retry resolves to the first bid
 *   3. SETTLE the clocks                 ← the bid lands in the real round,
 *                                          and a lot whose clock expired
 *                                          during the request is already over
 *   4. Validate against auction.ts       ← the same functions the client used,
 *                                          re-run where the client cannot reach
 *   5. Charge the join fee if first time ← from the balance, not from a number
 *                                          the browser sent
 *   6. INSERT the bid, UPDATE the row
 *   7. Audit
 *
 * Steps 3 and 4 are what `isLegalBid` in BidPanel is not. That call is a UX
 * affordance — it stops a bidder wasting a round trip on an obviously low bid.
 * This is the control.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type BidRejection =
  | "too-low"
  | "round-closed"
  | "not-registered"
  | "not-verified"
  | "insufficient-funds"
  | "suspended";

export type PlaceBidOutcome =
  | { ok: true; acceptedPts: number; round: number; bid: Bid; duplicate: boolean }
  | { ok: false; reason: BidRejection; minNextPts?: number };

interface AuctionRow {
  lot_id: string;
  opens_at: Date;
  round: number;
  current_pts: number;
  leader_paddle: string | null;
  leader_user_id: number | null;
  bid_clock_ends_at: Date;
  outcome: EngineState["outcome"];
}

export interface PlaceBidArgs {
  lotId: string;
  userId: number;
  paddle: string;
  points: number;
  idempotencyKey: string;
  ip: string | null;
  userAgent: string | null;
}

export async function placeBid(args: PlaceBidArgs): Promise<PlaceBidOutcome> {
  return transaction(async (client) => {
    /* ── 1. Lock ────────────────────────────────────────────────────────── */
    const auctionRes = await client.query<AuctionRow>(
      `SELECT lot_id, opens_at, round, current_pts, leader_paddle, leader_user_id,
              bid_clock_ends_at, outcome
         FROM auctions WHERE lot_id = $1 FOR UPDATE`,
      [args.lotId],
    );
    const row = auctionRes.rows[0];
    if (!row) return { ok: false, reason: "not-registered" };

    /* ── 2. Idempotency ─────────────────────────────────────────────────── */
    /*
     * Checked while holding the lock, so a retry that arrives concurrently with
     * the original blocks here rather than racing the unique index and turning
     * a duplicate into a 500.
     */
    const existing = await client.query<{
      id: number;
      points: number;
      round: number;
      paddle: string;
      placed_at: Date;
    }>(
      `SELECT id, points, round, paddle, placed_at
         FROM bids WHERE lot_id = $1 AND idempotency_key = $2`,
      [args.lotId, args.idempotencyKey],
    );
    const prior = existing.rows[0];
    if (prior) {
      return {
        ok: true,
        acceptedPts: prior.points,
        round: prior.round,
        duplicate: true,
        bid: {
          id: String(prior.id),
          paddle: prior.paddle,
          points: prior.points,
          round: prior.round,
          at: prior.placed_at.getTime(),
          isYou: true,
        },
      };
    }

    /* ── 3. Settle the clocks ───────────────────────────────────────────── */
    const now = Date.now();
    const live = settle(
      {
        opensAt: row.opens_at.getTime(),
        round: row.round,
        currentPts: row.current_pts,
        leaderPaddle: row.leader_paddle,
        bidClockEndsAt: row.bid_clock_ends_at.getTime(),
        outcome: row.outcome,
      },
      now,
    );

    /*
     * If settling ended the lot, persist that before rejecting. Otherwise the
     * next bidder repeats the work, and — worse — the row keeps saying
     * "running" until the ticker gets to it, so the catalogue shows a live lot
     * that rejects every bid.
     */
    if (live.outcome !== "running") {
      if (live.changed) await persistSettlement(client, args.lotId, live);
      return { ok: false, reason: "round-closed" };
    }
    if (live.changed) await persistSettlement(client, args.lotId, live);

    /* ── 4. Eligibility and the rules ───────────────────────────────────── */
    const userRes = await client.query<{
      status: string;
      phone_verified_at: Date | null;
    }>("SELECT status, phone_verified_at FROM users WHERE id = $1", [args.userId]);
    const user = userRes.rows[0];
    if (!user) return { ok: false, reason: "not-registered" };
    if (user.status !== "active") return { ok: false, reason: "suspended" };
    if (!user.phone_verified_at) return { ok: false, reason: "not-verified" };

    const participantRes = await client.query<{ first_bid_at: Date | null }>(
      "SELECT first_bid_at FROM lot_participants WHERE lot_id = $1 AND user_id = $2",
      [args.lotId, args.userId],
    );
    const hasBid = participantRes.rows[0]?.first_bid_at != null;
    const isFirstEntry = participantRes.rows.length === 0;

    if (!isLegalBid(args.points, live.currentPts, live.round, hasBid)) {
      return {
        ok: false,
        reason: "too-low",
        minNextPts: minNextBidPts(live.currentPts, live.round, hasBid),
      };
    }

    /* ── 5. The join fee ────────────────────────────────────────────────── */
    /*
     * LATE_JOIN_PENALTY_PTS, charged once per lot on first entry. The comment
     * on that constant says the back end must own the deduction — this is that
     * deduction. It is separate from the late-entry price floor, which raises
     * the bid rather than the charge.
     */
    if (isFirstEntry) {
      const fee = live.round >= 2 ? LATE_JOIN_PENALTY_PTS : 0;

      if (fee > 0) {
        const charged = await client.query(
          `UPDATE balances SET pts = pts - $2, updated_at = now()
            WHERE user_id = $1 AND pts >= $2`,
          [args.userId, fee],
        );
        /*
         * `AND pts >= $2` does the check and the write in one statement. Read
         * the balance first and then subtract, and two requests can both read
         * "10", both pass, and both subtract — the classic overdraw. The
         * CHECK (pts >= 0) on the table would catch it, but as a 500 rather
         * than as this rejection.
         */
        if (charged.rowCount === 0) {
          return { ok: false, reason: "insufficient-funds" };
        }

        await client.query(
          `INSERT INTO ledger_entries (user_id, delta_pts, kind, ref_type, ref_id, memo)
           VALUES ($1, $2, 'join_fee', 'lot', $3, 'Явж буй лотод нэгдсэн')`,
          [args.userId, -fee, args.lotId],
        );
      }

      await client.query(
        `INSERT INTO lot_participants (lot_id, user_id, entered_in_round, join_fee_pts)
         VALUES ($1, $2, $3, $4)`,
        [args.lotId, args.userId, live.round, fee],
      );
    }

    /* ── 6. Record ──────────────────────────────────────────────────────── */
    const inserted = await client.query<{ id: number; placed_at: Date }>(
      `INSERT INTO bids (lot_id, user_id, paddle, points, round, idempotency_key, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, placed_at`,
      [
        args.lotId,
        args.userId,
        args.paddle,
        args.points,
        live.round,
        args.idempotencyKey,
        args.ip,
      ],
    );
    const bidRow = inserted.rows[0]!;

    await client.query(
      "UPDATE lot_participants SET first_bid_at = COALESCE(first_bid_at, now()) WHERE lot_id = $1 AND user_id = $2",
      [args.lotId, args.userId],
    );

    /*
     * The accepted bid resets the bid clock to the CURRENT round's full length,
     * measured from the moment the row is written rather than from a timestamp
     * the client supplied. Client clocks are wrong often enough — and are
     * trivially settable — that accepting one would hand every bidder a dial
     * for how long their own lead lasts.
     */
    await client.query(
      `UPDATE auctions
          SET current_pts       = $2,
              leader_user_id    = $3,
              leader_paddle     = $4,
              round             = $5,
              bid_clock_ends_at = now() + ($6 || ' milliseconds')::interval,
              bid_count         = bid_count + 1,
              version           = version + 1,
              outcome           = 'running',
              updated_at        = now()
        WHERE lot_id = $1`,
      [
        args.lotId,
        args.points,
        args.userId,
        args.paddle,
        live.round,
        String(bidClockMs(live.round)),
      ],
    );

    /* ── 7. Tell whoever was outbid ─────────────────────────────────────── */
    /*
     * Queued inside this transaction, so a bid that rolls back cannot leave
     * somebody a message about it.
     *
     * The dedupe key is per lot and per ROUND, not per bid. Round 6's clock is
     * five seconds; a bidder in a duel can be outbid eleven times in ten
     * seconds, and eleven text messages is a bill as well as an annoyance. One
     * per round is enough to say "you are no longer winning this".
     */
    if (
      row.leader_user_id !== null &&
      row.leader_user_id !== args.userId &&
      live.currentPts > 0
    ) {
      await enqueue(client, {
        userId: row.leader_user_id,
        channel: "sms",
        kind: "bid.outbid",
        body: `${t.brand.name}: ${args.lotId} лот дээр таны үнэ давагдлаа. Одоогийн үнэ ${args.points} оноо.`,
        href: `/auction/${args.lotId}`,
        dedupeKey: `outbid:${args.lotId}:${live.round}`,
      });
    }

    /* ── 8. Audit ───────────────────────────────────────────────────────── */
    await record(client, {
      actorUserId: args.userId,
      action: "bid.placed",
      targetType: "lot",
      targetId: args.lotId,
      detail: {
        bidId: bidRow.id,
        points: args.points,
        previousPts: live.currentPts,
        round: live.round,
        hasBid,
        joinFeeCharged: isFirstEntry && live.round >= 2 ? LATE_JOIN_PENALTY_PTS : 0,
      },
      ip: args.ip,
      userAgent: args.userAgent,
    });

    return {
      ok: true,
      acceptedPts: args.points,
      round: live.round,
      duplicate: false,
      bid: {
        id: String(bidRow.id),
        paddle: args.paddle,
        points: args.points,
        round: live.round,
        at: bidRow.placed_at.getTime(),
        isYou: true,
      },
    };
  });
}

/**
 * Writes a settled state back to the auction row.
 *
 * Shared by the bid path and the ticker so there is one definition of what
 * "settled" looks like on disk.
 */
export async function persistSettlement(
  client: PoolClient,
  lotId: string,
  live: SettledState,
): Promise<void> {
  await client.query(
    /*
     * Every parameter is cast explicitly. Postgres infers a parameter's type
     * from its context, and two of these have no usable context: $5 arrives as
     * NULL whenever the lot has not been hammered, and $3 is used both as an
     * enum assignment and inside an IN over text literals. Without the casts
     * the statement fails at prepare time with "could not determine data type".
     */
    `UPDATE auctions
        SET round             = $2::int,
            outcome           = $3::auction_outcome,
            bid_clock_ends_at = to_timestamp($4::double precision / 1000.0),
            hammer_round      = COALESCE($5::int, hammer_round),
            settled_at        = COALESCE(
                                  settled_at,
                                  CASE WHEN $3::auction_outcome IN ('sold', 'unsold')
                                       THEN to_timestamp($6::double precision / 1000.0)
                                  END),
            version           = version + 1,
            updated_at        = now()
      WHERE lot_id = $1`,
    [
      lotId,
      live.round,
      live.outcome,
      live.bidClockEndsAt,
      live.hammerRound,
      live.settledAt ?? Date.now(),
    ],
  );
}
