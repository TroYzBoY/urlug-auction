import "server-only";
import type { PoolClient } from "pg";
import { transaction } from "../db";
import {
  LATE_JOIN_PENALTY_PTS,
  bidBasePts,
  bidClockMs,
  minNextBidPts,
} from "../auction";
import { settle, type EngineState, type SettledState } from "../auction-engine";
import { record } from "../audit";
import { enqueue } from "./notifications";
import { closeBidding } from "./award";
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
 *   4. Price it from auction.ts          ← the bidder's OWN price plus at least
 *                                          the step, re-run where the client
 *                                          cannot reach
 *   5. Charge the join fee if first time ← from the balance, not from a number
 *                                          the browser sent
 *   6. INSERT the bid, UPDATE the row
 *   7. Audit
 *
 * Step 4 never refuses a bid for its price. Each bidder's price is their own,
 * so nobody else's bid can make theirs stale; a bid below the bidder's own
 * minimum — a double tap that reached here before the room had shown the
 * first — is raised to that minimum, which is what the tap asked for: one more
 * step on their price. Bidders are never told "too low".
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type BidRejection =
  | "round-closed"
  | "not-registered"
  | "not-verified"
  | "insufficient-funds"
  | "suspended";

export type PlaceBidOutcome =
  | {
      ok: true;
      acceptedPts: number;
      round: number;
      bid: Bid;
      duplicate: boolean;
    }
  | { ok: false; reason: BidRejection };

interface AuctionRow {
  lot_id: string;
  opens_at: Date;
  round: number;
  current_pts: number;
  leader_paddle: string | null;
  leader_user_id: number | null;
  bid_clock_ends_at: Date;
  outcome: EngineState["outcome"];
  opening_pts: number;
}

export interface PlaceBidArgs {
  lotId: string;
  userId: number;
  paddle: string;
  /** The bidder's real name — carried onto the returned Bid for the feed. */
  name: string;
  /**
   * The price the bidder asked for. Raised to their own minimum if it is below
   * it (see step 4) — never refused for it.
   */
  points: number;
  idempotencyKey: string;
  ip: string | null;
  userAgent: string | null;
}

export async function placeBid(args: PlaceBidArgs): Promise<PlaceBidOutcome> {
  return transaction(async (client) => {
    /* ── 1. Lock ────────────────────────────────────────────────────────── */
    const auctionRes = await client.query<AuctionRow>(
      `SELECT a.lot_id, a.opens_at, a.round, a.current_pts, a.leader_paddle,
              a.leader_user_id, a.bid_clock_ends_at, a.outcome, l.opening_pts
         FROM auctions a JOIN lots l ON l.id = a.lot_id
        WHERE a.lot_id = $1 FOR UPDATE OF a`,
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
          name: args.name,
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
      if (live.changed) {
        await persistSettlement(client, args.lotId, live);
        /*
         * And hand it over, or tell the admins it is theirs to decide.
         * Whichever of this and the ticker settles the lot first must do it:
         * the ticker only revisits lots that are still running, so a lot this
         * left in `review` would otherwise wait there with nobody told.
         */
        if (live.outcome === "review") {
          await closeBidding(client, args.lotId);
        }
      }
      return { ok: false, reason: "round-closed" };
    }
    if (live.changed) await persistSettlement(client, args.lotId, live);

    /* ── 4. Eligibility ─────────────────────────────────────────────────── */
    const userRes = await client.query<{
      status: string;
      phone_verified_at: Date | null;
    }>("SELECT status, phone_verified_at FROM users WHERE id = $1", [
      args.userId,
    ]);
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

    /* ── 5. Price it ────────────────────────────────────────────────────── */
    /*
     * On the bidder's own price, under the lock, so two of their own bids in
     * flight are priced one after the other: the second builds on the first.
     */
    const ownRes = await client.query<{ top: number | null }>(
      "SELECT max(points) AS top FROM bids WHERE lot_id = $1 AND user_id = $2",
      [args.lotId, args.userId],
    );
    const basePts = bidBasePts(ownRes.rows[0]?.top ?? null, row.opening_pts);
    const points = Math.max(
      args.points,
      minNextBidPts(basePts, live.round, hasBid),
    );
    // A bid above the lot's price takes the lead; one below it stands as this
    // bidder's own, and the leader keeps the lead.
    const takesLead = points > live.currentPts;

    /* ── 6. The join fee ────────────────────────────────────────────────── */
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

    /* ── 7. Record ──────────────────────────────────────────────────────── */
    /*
     * What was left on the bid clock at `now` — the instant settle() judged
     * this bid in time — kept on the row for disputes and never sent to the
     * room. Rounded to whole ms; a sub-ms figure would claim a precision the
     * server does not have.
     */
    const clockLeftMs = Math.max(0, Math.round(live.bidClockEndsAt - now));
    const inserted = await client.query<{ id: number; placed_at: Date }>(
      `INSERT INTO bids (lot_id, user_id, paddle, points, round, idempotency_key,
                         ip, clock_left_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, placed_at`,
      [
        args.lotId,
        args.userId,
        args.paddle,
        points,
        live.round,
        args.idempotencyKey,
        args.ip,
        clockLeftMs,
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
     *
     * Every bid resets the clock; only one above the lot's price moves it and
     * the lead. `takesLead` is passed in rather than re-derived in SQL, so the
     * row and the decision below cannot disagree.
     */
    await client.query(
      `UPDATE auctions
          SET current_pts       = CASE WHEN $7::boolean THEN $2::int ELSE current_pts END,
              leader_user_id    = CASE WHEN $7::boolean THEN $3::bigint ELSE leader_user_id END,
              leader_paddle     = CASE WHEN $7::boolean THEN $4::text ELSE leader_paddle END,
              round             = $5,
              bid_clock_ends_at = now() + ($6 || ' milliseconds')::interval,
              bid_count         = bid_count + 1,
              version           = version + 1,
              outcome           = 'running',
              updated_at        = now()
        WHERE lot_id = $1`,
      [
        args.lotId,
        points,
        args.userId,
        args.paddle,
        live.round,
        String(bidClockMs(live.round)),
        takesLead,
      ],
    );

    /* ── 8. Tell whoever was outbid ─────────────────────────────────────── */
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
      takesLead &&
      row.leader_user_id !== null &&
      row.leader_user_id !== args.userId &&
      live.currentPts > 0
    ) {
      await enqueue(client, {
        userId: row.leader_user_id,
        channel: "sms",
        kind: "bid.outbid",
        body: `${t.brand.name}: ${args.lotId} лот дээр таны үнэ давагдлаа. Одоогийн үнэ ${points} оноо.`,
        href: `/auction/${args.lotId}`,
        dedupeKey: `outbid:${args.lotId}:${live.round}`,
      });
    }

    /* ── 9. Audit ───────────────────────────────────────────────────────── */
    await record(client, {
      actorUserId: args.userId,
      action: "bid.placed",
      targetType: "lot",
      targetId: args.lotId,
      detail: {
        bidId: bidRow.id,
        points,
        requestedPts: args.points,
        ownPreviousPts: basePts,
        standingPts: live.currentPts,
        tookLead: takesLead,
        round: live.round,
        hasBid,
        joinFeeCharged:
          isFirstEntry && live.round >= 2 ? LATE_JOIN_PENALTY_PTS : 0,
      },
      ip: args.ip,
      userAgent: args.userAgent,
    });

    return {
      ok: true,
      acceptedPts: points,
      round: live.round,
      duplicate: false,
      bid: {
        id: String(bidRow.id),
        paddle: args.paddle,
        name: args.name,
        points,
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
 *
 * `settled_at` is stamped for `review` as well as for the two final outcomes,
 * and it means the same thing in all three: the moment BIDDING stopped. When a
 * lot is later awarded, `awarded_at` records when the house decided — two
 * columns because they are two facts, and a review that sat for three days
 * should not be able to backdate itself.
 *
 * ⚠ `round_ends_at` is written here, and has to be.
 *
 * Nothing READS that column except the ticker's due query, which is exactly why
 * it matters: `auctions_due_idx` selects rows where `round_ends_at <= now()`,
 * so a stale value makes every live lot permanently due. Left unwritten, each
 * one would be re-scanned, re-locked and re-settled to no effect four times a
 * second for the rest of the sale. It went unnoticed while an expired bid clock
 * ended a lot outright — lots did not stay running long past a boundary. Now
 * that a quiet round only moves the sale up a gear, they do.
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
            round_ends_at     = to_timestamp($7::double precision / 1000.0),
            hammer_round      = COALESCE($5::int, hammer_round),
            settled_at        = COALESCE(
                                  settled_at,
                                  CASE WHEN $3::auction_outcome IN ('review', 'sold', 'unsold')
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
      live.roundEndsAt,
    ],
  );
}
