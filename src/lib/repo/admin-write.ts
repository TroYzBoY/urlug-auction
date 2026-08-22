import "server-only";
import type { PoolClient } from "pg";
import { transaction } from "../db";
import { record } from "../audit";
import { bidClockMs, roundEndOffsetMs } from "../auction";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ADMIN WRITES
 *
 * ⚠ Nothing here checks authorisation — `requireAdmin()` in `src/lib/session.ts`
 * is the only gate, and every caller in `src/app/actions/admin.ts` calls it
 * first. Same split as the read side, and for the same reason: a repository
 * that sometimes checks permissions is worse than one that never does, because
 * the reader cannot tell which kind they are looking at.
 *
 * ── Every write is audited, inside its own transaction ───────────────────────
 *
 * These are the operations that can take a lot away from whoever was winning
 * it, or move points that somebody paid for. When one of them is questioned
 * later, "an admin did it" is not an answer — the audit row carries who, when,
 * from which address, and what the value was before.
 *
 * ── What is deliberately impossible ──────────────────────────────────────────
 *
 * There is no `deleteBid`, no `setBalance`, no `setPrice`. `bids` and
 * `ledger_entries` refuse UPDATE and DELETE at the database level, so an admin
 * who wants to undo a bid cancels the lot; one who wants to correct a balance
 * posts an adjustment that appears in the bidder's own transaction history.
 * Both leave a trail the bidder can see.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface Actor {
  id: number;
  ip: string | null;
  userAgent: string | null;
}

/* ── Lots ────────────────────────────────────────────────────────────────── */

export interface LotInput {
  id: string;
  code: string;
  title: string;
  maker: string;
  year: string;
  category: string;
  note: string;
  provenance: string;
  condition: string;
  dimensions: string;
  estimateLowPts: number;
  estimateHighPts: number;
  openingPts: number;
  image: string | null;
  /** ISO timestamp. The auction's clocks are all derived from it. */
  opensAt: string;
}

/**
 * Writes the `auctions` row for a lot that has not opened.
 *
 * Both clocks come from `opensAt` and the rules module rather than from `now`,
 * so a lot created today and opening next week has correct deadlines the moment
 * it is saved — the ticker does not have to touch it first.
 */
async function writeSchedule(
  client: PoolClient,
  lotId: string,
  opensAt: Date,
  openingPts: number,
): Promise<void> {
  await client.query(
    `INSERT INTO auctions (lot_id, opens_at, round, current_pts, bid_clock_ends_at,
                           round_ends_at, outcome)
     VALUES ($1, $2, 1, $3, $4, $5, 'scheduled')
     ON CONFLICT (lot_id) DO UPDATE SET
       opens_at = EXCLUDED.opens_at,
       round = 1,
       current_pts = EXCLUDED.current_pts,
       leader_user_id = NULL,
       leader_paddle = NULL,
       bid_clock_ends_at = EXCLUDED.bid_clock_ends_at,
       round_ends_at = EXCLUDED.round_ends_at,
       outcome = 'scheduled',
       hammer_round = NULL,
       settled_at = NULL,
       version = auctions.version + 1,
       updated_at = now()`,
    [
      lotId,
      opensAt,
      openingPts,
      new Date(opensAt.getTime() + bidClockMs(1)),
      new Date(opensAt.getTime() + roundEndOffsetMs(1)),
    ],
  );
}

export type CreateLotResult =
  | { ok: true }
  | { ok: false; reason: "duplicate-id" };

export async function createLot(
  input: LotInput,
  actor: Actor,
): Promise<CreateLotResult> {
  return transaction(async (client) => {
    const opensAt = new Date(input.opensAt);

    const inserted = await client.query(
      `INSERT INTO lots (id, code, title, maker, year, category, note, provenance,
                         condition, dimensions, estimate_low_pts, estimate_high_pts,
                         opening_pts, image, starts_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (id) DO NOTHING`,
      [
        input.id,
        input.code,
        input.title,
        input.maker,
        input.year,
        input.category,
        input.note,
        input.provenance,
        input.condition,
        input.dimensions,
        input.estimateLowPts,
        input.estimateHighPts,
        input.openingPts,
        input.image,
        opensAt,
      ],
    );
    if (inserted.rowCount === 0) return { ok: false, reason: "duplicate-id" };

    await writeSchedule(client, input.id, opensAt, input.openingPts);

    await record(client, {
      actorUserId: actor.id,
      action: "admin.lot_created",
      targetType: "lot",
      targetId: input.id,
      detail: { title: input.title, opensAt: input.opensAt, openingPts: input.openingPts },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return { ok: true };
  });
}

export type UpdateLotResult =
  | { ok: true }
  | { ok: false; reason: "not-found" | "already-open" };

/**
 * Edits catalogue text, and reschedules the lot if it has not opened.
 *
 * ⚠ A lot that is running or finished can have its DESCRIPTION corrected but
 * not its price or its schedule. Moving the opening price of a lot people are
 * already bidding on changes what every existing bid meant; that is a
 * cancellation, not an edit, and it is a separate function with its own audit
 * action so nobody can do it by accident through a text field.
 */
export async function updateLot(
  input: LotInput,
  actor: Actor,
): Promise<UpdateLotResult> {
  return transaction(async (client) => {
    const existing = await client.query<{ outcome: string; opens_at: Date }>(
      `SELECT a.outcome, a.opens_at FROM auctions a WHERE a.lot_id = $1 FOR UPDATE`,
      [input.id],
    );
    const auction = existing.rows[0];
    if (!auction) return { ok: false, reason: "not-found" };

    const notYetOpen = auction.outcome === "scheduled";

    await client.query(
      `UPDATE lots SET code = $2, title = $3, maker = $4, year = $5, category = $6,
                       note = $7, provenance = $8, condition = $9, dimensions = $10,
                       estimate_low_pts = $11, estimate_high_pts = $12,
                       image = $13,
                       opening_pts = CASE WHEN $15 THEN $14 ELSE opening_pts END,
                       starts_at = CASE WHEN $15 THEN $16::timestamptz ELSE starts_at END,
                       updated_at = now()
        WHERE id = $1`,
      [
        input.id,
        input.code,
        input.title,
        input.maker,
        input.year,
        input.category,
        input.note,
        input.provenance,
        input.condition,
        input.dimensions,
        input.estimateLowPts,
        input.estimateHighPts,
        input.image,
        input.openingPts,
        notYetOpen,
        input.opensAt,
      ],
    );

    if (notYetOpen) {
      await writeSchedule(
        client,
        input.id,
        new Date(input.opensAt),
        input.openingPts,
      );
    }

    await record(client, {
      actorUserId: actor.id,
      action: "admin.lot_updated",
      targetType: "lot",
      targetId: input.id,
      detail: { rescheduled: notYetOpen, title: input.title },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return { ok: true };
  });
}

/* ── Auction control ─────────────────────────────────────────────────────── */

export type ControlResult =
  | { ok: true }
  | { ok: false; reason: "not-found" | "already-settled" | "not-running" };

/**
 * Ends a running lot immediately, awarding it to whoever leads.
 *
 * The honest use is a technical failure mid-sale where the standing leader is
 * plainly the winner. It is recorded as `admin.auction_closed` rather than as
 * an ordinary hammer, so the audit trail distinguishes a lot that ran its
 * course from one an operator stopped.
 */
export async function closeAuction(
  lotId: string,
  reason: string,
  actor: Actor,
): Promise<ControlResult> {
  return transaction(async (client) => {
    const res = await client.query<{
      outcome: string;
      current_pts: number;
      leader_paddle: string | null;
      round: number;
    }>(
      `SELECT outcome, current_pts, leader_paddle, round
         FROM auctions WHERE lot_id = $1 FOR UPDATE`,
      [lotId],
    );
    const auction = res.rows[0];
    if (!auction) return { ok: false, reason: "not-found" };
    if (auction.outcome === "sold" || auction.outcome === "unsold") {
      return { ok: false, reason: "already-settled" };
    }
    if (auction.outcome !== "running") return { ok: false, reason: "not-running" };

    const outcome = auction.leader_paddle ? "sold" : "unsold";

    await client.query(
      `UPDATE auctions SET outcome = $2::auction_outcome, settled_at = now(),
                           hammer_round = round, version = version + 1,
                           updated_at = now()
        WHERE lot_id = $1`,
      [lotId, outcome],
    );

    await record(client, {
      actorUserId: actor.id,
      action: "admin.auction_closed",
      targetType: "lot",
      targetId: lotId,
      detail: {
        reason,
        outcome,
        hammerPts: auction.current_pts,
        winner: auction.leader_paddle,
        round: auction.round,
      },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return { ok: true };
  });
}

/**
 * Voids a lot: nobody wins, and every join fee paid on it is refunded.
 *
 * The refund is the point. Cancelling a lot people paid to enter and keeping
 * their fees is taking money for a service not delivered, and it is the kind of
 * thing that gets forgotten because the auction code has already moved on. It
 * happens in the same transaction as the cancellation, so the two cannot come
 * apart.
 */
export async function cancelAuction(
  lotId: string,
  reason: string,
  actor: Actor,
): Promise<ControlResult> {
  return transaction(async (client) => {
    const res = await client.query<{ outcome: string }>(
      "SELECT outcome FROM auctions WHERE lot_id = $1 FOR UPDATE",
      [lotId],
    );
    const auction = res.rows[0];
    if (!auction) return { ok: false, reason: "not-found" };
    if (auction.outcome === "sold" || auction.outcome === "unsold") {
      return { ok: false, reason: "already-settled" };
    }

    await client.query(
      `UPDATE auctions SET outcome = 'unsold', settled_at = now(),
                           hammer_round = NULL, version = version + 1,
                           updated_at = now()
        WHERE lot_id = $1`,
      [lotId],
    );

    const fees = await client.query<{ user_id: number; join_fee_pts: number }>(
      "SELECT user_id, join_fee_pts FROM lot_participants WHERE lot_id = $1 AND join_fee_pts > 0",
      [lotId],
    );

    for (const fee of fees.rows) {
      /*
       * ON CONFLICT DO NOTHING against `ledger_once_idx`: cancelling the same
       * lot twice must not refund twice. The unique key is
       * (user, kind, ref_type, ref_id), and the ref is the lot.
       */
      const inserted = await client.query(
        `INSERT INTO ledger_entries (user_id, delta_pts, kind, ref_type, ref_id, memo)
         VALUES ($1, $2, 'refund', 'lot', $3, 'Дуудлага цуцлагдсан — нэгдэх төлбөр буцаагдав')
         ON CONFLICT DO NOTHING`,
        [fee.user_id, fee.join_fee_pts, lotId],
      );
      if (inserted.rowCount === 1) {
        await client.query(
          "UPDATE balances SET pts = pts + $2, updated_at = now() WHERE user_id = $1",
          [fee.user_id, fee.join_fee_pts],
        );
      }
    }

    await record(client, {
      actorUserId: actor.id,
      action: "admin.auction_cancelled",
      targetType: "lot",
      targetId: lotId,
      detail: { reason, refunds: fees.rowCount ?? 0 },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return { ok: true };
  });
}

export type RescheduleResult =
  | { ok: true }
  | { ok: false; reason: "not-found" | "has-bids" };

/**
 * Moves a lot's opening time.
 *
 * Refuses once a bid exists. Rescheduling a lot with bids on it would either
 * discard them or leave them attached to a sale that now starts at a different
 * time — and both are worse than telling the operator to cancel the lot and
 * list it again.
 */
export async function rescheduleAuction(
  lotId: string,
  opensAt: string,
  actor: Actor,
): Promise<RescheduleResult> {
  return transaction(async (client) => {
    const res = await client.query<{ bid_count: number; opens_at: Date; current_pts: number }>(
      "SELECT bid_count, opens_at, current_pts FROM auctions WHERE lot_id = $1 FOR UPDATE",
      [lotId],
    );
    const auction = res.rows[0];
    if (!auction) return { ok: false, reason: "not-found" };
    if (auction.bid_count > 0) return { ok: false, reason: "has-bids" };

    const when = new Date(opensAt);
    const lot = await client.query<{ opening_pts: number }>(
      "SELECT opening_pts FROM lots WHERE id = $1",
      [lotId],
    );

    await writeSchedule(client, lotId, when, lot.rows[0]?.opening_pts ?? auction.current_pts);
    await client.query("UPDATE lots SET starts_at = $2, updated_at = now() WHERE id = $1", [
      lotId,
      when,
    ]);

    await record(client, {
      actorUserId: actor.id,
      action: "admin.auction_rescheduled",
      targetType: "lot",
      targetId: lotId,
      detail: { from: auction.opens_at.toISOString(), to: when.toISOString() },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return { ok: true };
  });
}

/* ── Users ───────────────────────────────────────────────────────────────── */

export type UserActionResult =
  | { ok: true }
  | { ok: false; reason: "not-found" | "self" };

/**
 * Suspends or restores an account.
 *
 * Suspending revokes every session in the same transaction. Without that the
 * bidder stays signed in until their cookie expires — and `currentUser()` does
 * check `status`, but relying on that alone leaves the account live in any code
 * path that reads a session row directly.
 *
 * Refuses to act on the actor's own account: an admin locking themselves out
 * mid-sale is an outage.
 */
export async function setUserStatus(
  userId: number,
  status: "active" | "suspended" | "closed",
  reason: string,
  actor: Actor,
): Promise<UserActionResult> {
  if (userId === actor.id) return { ok: false, reason: "self" };

  return transaction(async (client) => {
    const res = await client.query<{ status: string; paddle: string }>(
      "SELECT status, paddle FROM users WHERE id = $1 FOR UPDATE",
      [userId],
    );
    const user = res.rows[0];
    if (!user) return { ok: false, reason: "not-found" };

    await client.query(
      "UPDATE users SET status = $2::user_status, updated_at = now() WHERE id = $1",
      [userId, status],
    );

    if (status !== "active") {
      await client.query(
        "UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
        [userId],
      );
    }

    await record(client, {
      actorUserId: actor.id,
      action: "admin.user_status_changed",
      targetType: "user",
      targetId: String(userId),
      detail: { paddle: user.paddle, from: user.status, to: status, reason },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return { ok: true };
  });
}

export type AdjustResult =
  | { ok: true; balancePts: number }
  | { ok: false; reason: "not-found" | "would-overdraw" };

/**
 * Moves points by hand — a goodwill credit, or a correction.
 *
 * Posted as an ordinary `adjustment` ledger entry, which means it appears in
 * the bidder's own transaction history on `/wallet`. A silent correction to a
 * balance is indistinguishable from theft from the outside; one the bidder can
 * see is a correction.
 */
export async function adjustBalance(
  userId: number,
  deltaPts: number,
  memo: string,
  actor: Actor,
): Promise<AdjustResult> {
  return transaction(async (client) => {
    const exists = await client.query("SELECT 1 FROM users WHERE id = $1", [userId]);
    if (exists.rowCount === 0) return { ok: false, reason: "not-found" };

    await client.query(
      `INSERT INTO ledger_entries (user_id, delta_pts, kind, memo)
       VALUES ($1, $2, 'adjustment', $3)`,
      [userId, deltaPts, memo],
    );

    const updated = await client.query<{ pts: number }>(
      `UPDATE balances SET pts = pts + $2, updated_at = now()
        WHERE user_id = $1 AND pts + $2 >= 0
        RETURNING pts`,
      [userId, deltaPts],
    );
    // The guard and the write in one statement; the CHECK on the table is the
    // backstop, but it would surface as a 500 rather than as this rejection.
    if (updated.rowCount === 0) return { ok: false, reason: "would-overdraw" };

    await record(client, {
      actorUserId: actor.id,
      action: "admin.balance_adjusted",
      targetType: "user",
      targetId: String(userId),
      detail: { deltaPts, memo, resultingPts: updated.rows[0]!.pts },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return { ok: true, balancePts: updated.rows[0]!.pts };
  });
}
