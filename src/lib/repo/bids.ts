import "server-only";
import type { PoolClient } from "pg";
import { transaction } from "../db";
import { bidClockMs } from "../auction";
import { settle, type EngineState, type SettledState } from "../auction-engine";
import { record } from "../audit";
import { enqueue } from "./notifications";
import { closeBidding } from "./award";
import { t } from "../copy";
import type { Bid } from "../types";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A PRESS — the one operation that must be exactly right
 *
 * Not a bid in the auction sense: there is no price to raise (auction.ts). A
 * press costs the lot's `press_cost_pts` from the presser's balance, adds one
 * to their count, makes them the last presser — who takes the lot if the clock
 * runs out — and resets the bid clock. The names (`placeBid`, `bids`) are left
 * from the auction format.
 *
 * Everything below happens inside a single transaction that opens by taking a
 * row lock on the auction. That lock is the whole design: it makes presses on
 * one lot strictly sequential, so "who pressed last" is decided by the
 * database rather than by luck, and one presser's count cannot skip or repeat.
 *
 * The order of operations is deliberate:
 *
 *   1. LOCK the auction row              ← serialises every press on this lot
 *   2. Check idempotency                 ← a retry resolves to the first press
 *   3. SETTLE the clocks                 ← the press lands in the real round,
 *                                          and a lot whose clock expired
 *                                          during the request is already over
 *   4. Check the presser                 ← signed in, verified, not suspended
 *   5. CHARGE the press                  ← from the balance, at the lot's
 *                                          price, never a number the browser
 *                                          sent
 *   6. INSERT the press, UPDATE the row
 *   7. Tell whoever was last, and audit
 *
 * Nothing about a press can be "too low", and a double tap is two presses.
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
      /** The presser's count on the lot after this press. */
      count: number;
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
  press_cost_pts: number;
}

export interface PlaceBidArgs {
  lotId: string;
  userId: number;
  paddle: string;
  /** The presser's real name — carried onto the returned Bid for the feed. */
  name: string;
  idempotencyKey: string;
  ip: string | null;
  userAgent: string | null;
}

export async function placeBid(args: PlaceBidArgs): Promise<PlaceBidOutcome> {
  return transaction(async (client) => {
    /* ── 1. Lock ────────────────────────────────────────────────────────── */
    const auctionRes = await client.query<AuctionRow>(
      `SELECT a.lot_id, a.opens_at, a.round, a.current_pts, a.leader_paddle,
              a.leader_user_id, a.bid_clock_ends_at, a.outcome, l.press_cost_pts
         FROM auctions a JOIN lots l ON l.id = a.lot_id
        WHERE a.lot_id = $1 FOR UPDATE OF a`,
      [args.lotId],
    );
    const row = auctionRes.rows[0];
    if (!row) return { ok: false, reason: "not-registered" };

    /* ── 2. Idempotency ─────────────────────────────────────────────────── */
    /*
     * Checked while holding the lock, so a retry that arrives concurrently with
     * the original blocks here rather than racing the unique index — and
     * rather than charging the press twice.
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
        count: prior.points,
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
     * If settling ended the lot, persist that before refusing. Otherwise the
     * next presser repeats the work, and — worse — the row keeps saying
     * "running" until the ticker gets to it, so the catalogue shows a live lot
     * that refuses every press.
     */
    if (live.outcome !== "running") {
      if (live.changed) {
        await persistSettlement(client, args.lotId, live);
        /*
         * And hand it to its winner. Whichever of this and the ticker settles
         * the lot first must do it: the ticker only revisits lots that are
         * still running, so a lot this left in `review` would never be handed
         * over.
         */
        if (live.outcome === "review") {
          await closeBidding(client, args.lotId);
        }
      }
      return { ok: false, reason: "round-closed" };
    }
    if (live.changed) await persistSettlement(client, args.lotId, live);

    /* ── 4. The presser ─────────────────────────────────────────────────── */
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

    /* ── 5. Charge the press ────────────────────────────────────────────── */
    /*
     * `AND pts >= $2` does the check and the write in one statement. Read the
     * balance first and then subtract, and two presses can both read "5", both
     * pass, and both subtract — the classic overdraw. The CHECK (pts >= 0) on
     * the table would catch it, but as a 500 rather than as this refusal.
     */
    const cost = row.press_cost_pts;
    const charged = await client.query(
      `UPDATE balances SET pts = pts - $2, updated_at = now()
        WHERE user_id = $1 AND pts >= $2`,
      [args.userId, cost],
    );
    if (charged.rowCount === 0) {
      return { ok: false, reason: "insufficient-funds" };
    }

    /* ── 6. Record ──────────────────────────────────────────────────────── */
    /*
     * Their count, taken under the lock, so two presses of theirs in flight
     * are numbered one after the other.
     */
    const countRes = await client.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM bids WHERE lot_id = $1 AND user_id = $2",
      [args.lotId, args.userId],
    );
    const count = (countRes.rows[0]?.n ?? 0) + 1;

    /*
     * What was left on the bid clock at `now` — the instant settle() judged
     * this press in time — kept on the row for disputes and never sent to the
     * room. Rounded to whole ms; a sub-ms figure would claim a precision the
     * server does not have.
     */
    const clockLeftMs = Math.max(0, Math.round(live.bidClockEndsAt - now));
    const inserted = await client.query<{ id: number; placed_at: Date }>(
      `INSERT INTO bids (lot_id, user_id, paddle, points, cost_pts, round,
                         idempotency_key, ip, clock_left_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, placed_at`,
      [
        args.lotId,
        args.userId,
        args.paddle,
        count,
        cost,
        live.round,
        args.idempotencyKey,
        args.ip,
        clockLeftMs,
      ],
    );
    const bidRow = inserted.rows[0]!;

    // The charge, with the press as its reference: one ledger row per press.
    await client.query(
      `INSERT INTO ledger_entries (user_id, delta_pts, kind, ref_type, ref_id, memo)
       VALUES ($1, $2, 'press', 'bid', $3, $4)`,
      [args.userId, -cost, String(bidRow.id), `${args.lotId} лотын товч`],
    );

    await client.query(
      `INSERT INTO lot_participants (lot_id, user_id, entered_in_round, first_bid_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (lot_id, user_id)
         DO UPDATE SET first_bid_at = COALESCE(lot_participants.first_bid_at, now())`,
      [args.lotId, args.userId, live.round],
    );

    /*
     * The press resets the bid clock to the CURRENT round's full length,
     * measured from the moment the row is written rather than from a timestamp
     * the client supplied. Client clocks are wrong often enough — and are
     * trivially settable — that accepting one would hand every presser a dial
     * for how long their own lead lasts.
     *
     * Every press makes its presser the last one. `current_pts` is the lot's
     * total presses, written from `bid_count` rather than incremented, so it is
     * right even on a row whose `current_pts` still held a price.
     */
    await client.query(
      `UPDATE auctions
          SET current_pts       = bid_count + 1,
              leader_user_id    = $2,
              leader_paddle     = $3,
              round             = $4,
              bid_clock_ends_at = now() + ($5 || ' milliseconds')::interval,
              bid_count         = bid_count + 1,
              version           = version + 1,
              outcome           = 'running',
              updated_at        = now()
        WHERE lot_id = $1`,
      [
        args.lotId,
        args.userId,
        args.paddle,
        live.round,
        String(bidClockMs(live.round)),
      ],
    );

    /* ── 7. Tell whoever was last ───────────────────────────────────────── */
    /*
     * Queued inside this transaction, so a press that rolls back cannot leave
     * somebody a message about it.
     *
     * The dedupe key is per lot and per ROUND, not per press. Round 6's clock
     * is five seconds; a presser in a duel can be overtaken eleven times in ten
     * seconds, and eleven text messages is a bill as well as an annoyance. One
     * per round is enough to say "you are no longer the last".
     */
    if (row.leader_user_id !== null && row.leader_user_id !== args.userId) {
      await enqueue(client, {
        userId: row.leader_user_id,
        channel: "sms",
        kind: "bid.outbid",
        body: `${t.brand.name}: ${args.lotId} лот дээр таны араас өөр хүн дарлаа.`,
        href: `/auction/${args.lotId}`,
        dedupeKey: `outbid:${args.lotId}:${live.round}`,
      });
    }

    await record(client, {
      actorUserId: args.userId,
      action: "bid.placed",
      targetType: "lot",
      targetId: args.lotId,
      detail: {
        bidId: bidRow.id,
        count,
        costPts: cost,
        round: live.round,
        previousLeader: row.leader_paddle,
      },
      ip: args.ip,
      userAgent: args.userAgent,
    });

    return {
      ok: true,
      count,
      round: live.round,
      duplicate: false,
      bid: {
        id: String(bidRow.id),
        paddle: args.paddle,
        name: args.name,
        points: count,
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
