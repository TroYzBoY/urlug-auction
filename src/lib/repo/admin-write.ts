import "server-only";
import type { PoolClient } from "pg";
import { transaction } from "../db";
import { record } from "../audit";
import { POINT_MNT, bidClockMs, roundEndOffsetMs } from "../auction";
import { settle, type Outcome } from "../auction-engine";
import { persistSettlement } from "./bids";
import { enqueue } from "./notifications";
import { announceDecision, closeBidding, grantLot } from "./award";
import { MAX_BONUS_PTS, MAX_PAYMENT_MNT } from "../validation";
import { groupNumber } from "../format";
import { t } from "../copy";

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
  /** Empty for a new lot: the next free number is used (`nextLotId`). */
  id: string;
  /** Empty: the lot's id. */
  code: string;
  title: string;
  maker: string;
  year: string;
  category: string;
  note: string;
  provenance: string;
  condition: string;
  dimensions: string;
  /** 0 and 0 when not given. */
  estimateLowPts: number;
  estimateHighPts: number;
  /** What one press costs, in points. Fixed once the lot opens. */
  pressCostPts: number;
  images: { url: string; alt: string }[];
  /** ISO timestamp. The auction's clocks are all derived from it. */
  opensAt: string;
}

/**
 * Replaces a lot's gallery.
 *
 * Delete-then-insert rather than a diff. The list is at most a dozen rows, the
 * whole thing happens inside the caller's transaction, and a diff would have to
 * reason about reordering — which is most of the complexity for none of the
 * benefit at this size. `lot_images_order_idx` would reject a reorder done as
 * individual updates anyway, since two rows would briefly share a position.
 */
async function writeImages(
  client: PoolClient,
  lotId: string,
  images: { url: string; alt: string; credit?: string | null }[],
): Promise<void> {
  await client.query("DELETE FROM lot_images WHERE lot_id = $1", [lotId]);
  for (const [order, image] of images.entries()) {
    await client.query(
      `INSERT INTO lot_images (lot_id, url, alt, sort_order, credit)
       VALUES ($1, $2, $3, $4, $5)`,
      [lotId, image.url, image.alt, order, image.credit || null],
    );
  }
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
): Promise<void> {
  // `current_pts` is the lot's total presses, so a lot not yet open has none.
  await client.query(
    `INSERT INTO auctions (lot_id, opens_at, round, current_pts, bid_clock_ends_at,
                           round_ends_at, outcome)
     VALUES ($1, $2, 1, 0, $3, $4, 'scheduled')
     ON CONFLICT (lot_id) DO UPDATE SET
       opens_at = EXCLUDED.opens_at,
       round = 1,
       current_pts = 0,
       leader_user_id = NULL,
       leader_paddle = NULL,
       bid_clock_ends_at = EXCLUDED.bid_clock_ends_at,
       round_ends_at = EXCLUDED.round_ends_at,
       outcome = 'scheduled',
       hammer_round = NULL,
       settled_at = NULL,
       designated_user_id = NULL,
       designated_by = NULL,
       version = auctions.version + 1,
       updated_at = now()`,
    [
      lotId,
      opensAt,
      new Date(opensAt.getTime() + bidClockMs(1)),
      new Date(opensAt.getTime() + roundEndOffsetMs(1)),
    ],
  );
}

/**
 * The next free lot number, for a lot created without one: one more than the
 * highest all-digit id, padded to three digits ("014"). Only a suggestion —
 * two admins saving at once can both get it, and `createLot` retries.
 */
async function nextLotId(client: PoolClient): Promise<string> {
  const res = await client.query<{ top: string | null }>(
    `SELECT max(id::bigint)::text AS top FROM lots WHERE id ~ '^[0-9]{1,15}$'`,
  );
  const next = BigInt(res.rows[0]?.top ?? "0") + BigInt(1);
  return String(next).padStart(3, "0");
}

export type CreateLotResult =
  | { ok: true; id: string; code: string }
  | { ok: false; reason: "duplicate-id" };

/**
 * Lists a new lot. Only the name, the opening time and the press price are
 * needed: an id left empty takes the next free number, a code left empty
 * takes the id, and an estimate left empty is "not given".
 */
export async function createLot(
  input: LotInput,
  actor: Actor,
): Promise<CreateLotResult> {
  /*
   * A generated id can be taken by another admin saving in the same instant;
   * that is a reason to try the next number, not to fail. A typed one that is
   * taken is the admin's to change.
   */
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await transaction(async (client) => {
      const id = input.id || (await nextLotId(client));
      const code = input.code || id;
      const opensAt = new Date(input.opensAt);

      const inserted = await client.query(
        `INSERT INTO lots (id, code, title, maker, year, category, note, provenance,
                           condition, dimensions, estimate_low_pts, estimate_high_pts,
                           opening_pts, press_cost_pts, starts_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,$13,$14)
         ON CONFLICT (id) DO NOTHING`,
        [
          id,
          code,
          input.title,
          input.maker,
          input.year,
          input.category,
          input.note,
          input.provenance,
          input.condition,
          input.dimensions,
          input.estimateLowPts,
          Math.max(input.estimateHighPts, input.estimateLowPts),
          input.pressCostPts,
          opensAt,
        ],
      );
      if (inserted.rowCount === 0) return null;

      await writeImages(client, id, input.images);
      await writeSchedule(client, id, opensAt);

      await record(client, {
        actorUserId: actor.id,
        action: "admin.lot_created",
        targetType: "lot",
        targetId: id,
        detail: {
          title: input.title,
          opensAt: input.opensAt,
          pressCostPts: input.pressCostPts,
        },
        ip: actor.ip,
        userAgent: actor.userAgent,
      });

      return { ok: true as const, id, code };
    });
    if (result) return result;
    if (input.id) break;
  }
  return { ok: false, reason: "duplicate-id" };
}

export type UpdateLotResult =
  { ok: true } | { ok: false; reason: "not-found" | "already-open" };

/**
 * Edits catalogue text, and reschedules the lot if it has not opened.
 *
 * ⚠ A lot that is running or finished can have its DESCRIPTION corrected but
 * not its press price or its schedule. Changing what a press costs while
 * people are pressing changes what every press already made meant; that is a
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
                       press_cost_pts = CASE WHEN $14 THEN $13 ELSE press_cost_pts END,
                       starts_at = CASE WHEN $14 THEN $15::timestamptz ELSE starts_at END,
                       updated_at = now()
        WHERE id = $1`,
      [
        input.id,
        input.code || input.id,
        input.title,
        input.maker,
        input.year,
        input.category,
        input.note,
        input.provenance,
        input.condition,
        input.dimensions,
        input.estimateLowPts,
        Math.max(input.estimateHighPts, input.estimateLowPts),
        input.pressCostPts,
        notYetOpen,
        input.opensAt,
      ],
    );

    /*
     * Photographs can be corrected on a RUNNING lot, unlike its press price or
     * its schedule. A better picture of a fault is information a bidder should have
     * as soon as it exists; it does not change what an existing bid meant.
     */
    await writeImages(client, input.id, input.images);

    if (notYetOpen) {
      await writeSchedule(client, input.id, new Date(input.opensAt));
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
 * Stops a running lot immediately, and decides it exactly as its clocks would
 * have: to the instant winner if an admin chose one, otherwise to whoever
 * pressed last (`closeBidding`). A lot nobody pressed is unsold.
 *
 * Recorded as `admin.auction_closed` rather than as an ordinary close, so the
 * audit trail distinguishes a lot that ran its course from one an operator
 * stopped.
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
    if (auction.outcome !== "running")
      return { ok: false, reason: "not-running" };

    // A lot nobody pressed has nobody to give it to; it is simply unsold.
    const outcome = auction.leader_paddle ? "review" : "unsold";

    await client.query(
      `UPDATE auctions SET outcome = $2::auction_outcome,
                           settled_at = COALESCE(settled_at, now()),
                           hammer_round = round, version = version + 1,
                           updated_at = now()
        WHERE lot_id = $1`,
      [lotId, outcome],
    );

    // Handed over in this transaction, as the ticker would have.
    const sold = outcome === "review" && (await closeBidding(client, lotId));

    await record(client, {
      actorUserId: actor.id,
      action: "admin.auction_closed",
      targetType: "lot",
      targetId: lotId,
      detail: {
        reason,
        outcome: sold ? "sold" : outcome,
        totalPresses: auction.current_pts,
        lastPresser: auction.leader_paddle,
        round: auction.round,
      },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return { ok: true };
  });
}

/* ── Naming the winner ───────────────────────────────────────────────────── */

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A LOT LEFT IN REVIEW
 *
 * Nothing waits in `review` by design any more: the moment a lot closes it goes
 * to its instant winner or its last presser (`closeBidding`). These two are
 * the way out for a lot that could not be handed over — and for any lot left
 * there from when an admin named every winner by hand: it goes to somebody, or
 * it goes to nobody.
 *
 * ── What is checked, and why each check is here ──────────────────────────────
 *
 * **The lot is settled inside this transaction before anything else.** The
 * stored row may still say `running` if the ticker has not reached it; an admin
 * who can see the lot in the queue must be able to act on it.
 *
 * **The winner must have pressed on this lot.** The dropdown is built from the
 * presses, but a Server Function is an HTTP endpoint and the form is not its
 * only caller.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type AwardResult =
  | { ok: true; presses: number; paddle: string; name: string }
  | {
      ok: false;
      reason: "not-found" | "not-in-review" | "not-a-bidder" | "already-decided";
    };

interface DecisionRow {
  opens_at: Date;
  round: number;
  current_pts: number;
  leader_paddle: string | null;
  bid_clock_ends_at: Date;
  outcome: Outcome;
  code: string;
}

/**
 * Reads a lot under the row lock and settles it, so the caller sees the state
 * the clocks imply rather than the one the ticker has got round to writing.
 */
async function lockForDecision(
  client: PoolClient,
  lotId: string,
): Promise<{ row: DecisionRow; outcome: Outcome } | null> {
  const res = await client.query<DecisionRow>(
    `SELECT a.opens_at, a.round, a.current_pts, a.leader_paddle,
            a.bid_clock_ends_at, a.outcome, l.code
       FROM auctions a JOIN lots l ON l.id = a.lot_id
      WHERE a.lot_id = $1
      FOR UPDATE OF a`,
    [lotId],
  );
  const row = res.rows[0];
  if (!row) return null;

  const live = settle(
    {
      opensAt: row.opens_at.getTime(),
      round: row.round,
      currentPts: row.current_pts,
      leaderPaddle: row.leader_paddle,
      bidClockEndsAt: row.bid_clock_ends_at.getTime(),
      outcome: row.outcome,
    },
    Date.now(),
  );
  if (live.changed) await persistSettlement(client, lotId, live);

  return { row, outcome: live.outcome };
}

/**
 * Awards a lot in review to one of its bidders, at that bidder's own top bid.
 *
 * The settlement is opened in the same transaction, so the sale and the
 * obligation it creates come into existence together — a hammer with no invoice
 * is a lot nobody is chasing. The handover itself is `grantLot`.
 */
export async function awardLot(
  lotId: string,
  winnerUserId: number,
  note: string,
  actor: Actor,
): Promise<AwardResult> {
  return transaction(async (client) => {
    const found = await lockForDecision(client, lotId);
    if (!found) return { ok: false, reason: "not-found" };
    const { row, outcome } = found;

    if (outcome === "sold" || outcome === "unsold") {
      return { ok: false, reason: "already-decided" };
    }
    if (outcome !== "review") return { ok: false, reason: "not-in-review" };

    const winning = await grantLot(
      client,
      lotId,
      row.code,
      winnerUserId,
      actor.id,
    );
    if (!winning) return { ok: false, reason: "not-a-bidder" };

    /*
     * The standing leader goes into the audit row whether or not they won.
     * When a bidder asks why the top bid did not take the lot, the answer has
     * to be a record made at the time — and `note` is the operator being made
     * to write one.
     */
    await record(client, {
      actorUserId: actor.id,
      action: "admin.winner_declared",
      targetType: "lot",
      targetId: lotId,
      detail: {
        note,
        winnerUserId,
        winnerPaddle: winning.paddle,
        winnerPresses: winning.presses,
        standingLeader: row.leader_paddle,
        standingPts: row.current_pts,
        overrodeStandingLeader: row.leader_paddle !== winning.paddle,
      },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return {
      ok: true,
      presses: winning.presses,
      paddle: winning.paddle,
      name: winning.name,
    };
  });
}

export type DesignateResult =
  | { ok: true; paddle: string | null }
  | {
      ok: false;
      reason: "not-found" | "not-running" | "not-a-bidder" | "closed";
    };

/**
 * Chooses — or with `winnerUserId` null, un-chooses — the winner of a lot that
 * is still taking bids, without stopping it.
 *
 * Nothing changes for the bidders: the lot runs to its end as normal, and only
 * then does `closeBidding` hand it to this bidder at their own top bid at that
 * moment. `version` is left alone and nothing is published, because nothing a
 * bidder can see has changed.
 *
 * Only while running. Once the clocks have stopped the lot is in the review
 * queue, where `awardLot` decides it directly — "closed" tells the admin so.
 */
export async function designateWinner(
  lotId: string,
  winnerUserId: number | null,
  note: string | null,
  actor: Actor,
): Promise<DesignateResult> {
  return transaction(async (client) => {
    const found = await lockForDecision(client, lotId);
    if (!found) return { ok: false, reason: "not-found" };
    const { row, outcome } = found;

    if (outcome !== "running") {
      /*
       * The clocks ran out after the ticker's last look, and the lock above
       * has just closed the lot. Finish that close as the ticker would have —
       * an earlier choice still stands, or the admins are told.
       */
      if (outcome === "review" && row.outcome === "running") {
        await closeBidding(client, lotId);
      }
      return {
        ok: false,
        reason: outcome === "scheduled" ? "not-running" : "closed",
      };
    }

    let paddle: string | null = null;
    if (winnerUserId !== null) {
      // The same rule as awardLot: only somebody who bid can be given it.
      const bid = await client.query<{ paddle: string }>(
        "SELECT paddle FROM bids WHERE lot_id = $1 AND user_id = $2 LIMIT 1",
        [lotId, winnerUserId],
      );
      if (!bid.rows[0]) return { ok: false, reason: "not-a-bidder" };
      paddle = bid.rows[0].paddle;
    }

    await client.query(
      `UPDATE auctions SET designated_user_id = $2, designated_by = $3,
                           updated_at = now()
        WHERE lot_id = $1`,
      [lotId, winnerUserId, winnerUserId === null ? null : actor.id],
    );

    await record(client, {
      actorUserId: actor.id,
      action:
        winnerUserId === null
          ? "admin.winner_undesignated"
          : "admin.winner_designated",
      targetType: "lot",
      targetId: lotId,
      detail: {
        note,
        winnerUserId,
        winnerPaddle: paddle,
        standingLeader: row.leader_paddle,
        standingPts: row.current_pts,
        round: row.round,
      },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return { ok: true, paddle };
  });
}

/**
 * Ends a lot left in review with no winner.
 *
 * Only for the rare lot `closeBidding` could not hand over. It is not a
 * cancellation: the presses happened, the record of them stands, and nothing
 * is refunded, because the lot ran. `cancelAuction` is for a lot that should
 * never have run at all.
 */
export async function declareUnsold(
  lotId: string,
  reason: string,
  actor: Actor,
): Promise<AwardResult> {
  return transaction(async (client) => {
    const found = await lockForDecision(client, lotId);
    if (!found) return { ok: false, reason: "not-found" };
    const { row, outcome } = found;

    if (outcome === "sold" || outcome === "unsold") {
      return { ok: false, reason: "already-decided" };
    }
    if (outcome !== "review") return { ok: false, reason: "not-in-review" };

    await client.query(
      `UPDATE auctions
          SET outcome    = 'unsold',
              settled_at = COALESCE(settled_at, now()),
              awarded_at = now(),
              awarded_by = $2,
              version    = version + 1,
              updated_at = now()
        WHERE lot_id = $1`,
      [lotId, actor.id],
    );

    await announceDecision(client, lotId, row.code, null, "лот худалдагдсангүй.");

    await record(client, {
      actorUserId: actor.id,
      action: "admin.declared_unsold",
      targetType: "lot",
      targetId: lotId,
      detail: {
        reason,
        standingLeader: row.leader_paddle,
        standingPts: row.current_pts,
      },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return { ok: true, presses: 0, paddle: "—", name: "—" };
  });
}

/**
 * Voids a lot: nobody wins, and every point spent on it — each press, and any
 * join fee — is refunded.
 *
 * The refund is the point. Cancelling a lot people paid to press on and keeping
 * what they paid is taking money for a service not delivered, and it is the
 * kind of thing that gets forgotten because the lot's code has already moved
 * on. It happens in the same transaction as the cancellation, so the two cannot
 * come apart.
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

    /*
     * Everything each person spent on the lot: every press, and the join fee
     * lots from the auction format charged. One refund row per person.
     */
    const fees = await client.query<{ user_id: number; pts: number }>(
      `SELECT user_id, sum(pts)::int AS pts FROM (
         SELECT user_id, join_fee_pts AS pts FROM lot_participants
          WHERE lot_id = $1 AND join_fee_pts > 0
         UNION ALL
         SELECT user_id, cost_pts AS pts FROM bids
          WHERE lot_id = $1 AND cost_pts IS NOT NULL
       ) spent
       GROUP BY user_id
       HAVING sum(pts) > 0`,
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
         VALUES ($1, $2, 'refund', 'lot', $3, 'Лот цуцлагдсан — зарцуулсан оноо буцаагдав')
         ON CONFLICT DO NOTHING`,
        [fee.user_id, fee.pts, lotId],
      );
      if (inserted.rowCount === 1) {
        await client.query(
          "UPDATE balances SET pts = pts + $2, updated_at = now() WHERE user_id = $1",
          [fee.user_id, fee.pts],
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
  { ok: true } | { ok: false; reason: "not-found" | "has-bids" };

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
    const res = await client.query<{
      bid_count: number;
      opens_at: Date;
      current_pts: number;
    }>(
      "SELECT bid_count, opens_at, current_pts FROM auctions WHERE lot_id = $1 FOR UPDATE",
      [lotId],
    );
    const auction = res.rows[0];
    if (!auction) return { ok: false, reason: "not-found" };
    if (auction.bid_count > 0) return { ok: false, reason: "has-bids" };

    const when = new Date(opensAt);
    await writeSchedule(client, lotId, when);
    await client.query(
      "UPDATE lots SET starts_at = $2, updated_at = now() WHERE id = $1",
      [lotId, when],
    );

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

/* ── The contact inbox ───────────────────────────────────────────────────── */

export type ContactResult =
  { ok: true } | { ok: false; reason: "not-found" | "already-handled" };

/**
 * Marks a contact message answered.
 *
 * Reversible by nothing, on purpose — there is no "unhandle". If a message
 * needs picking up again, that is a new conversation and the old row is the
 * record that somebody already replied once. Audited, because "who answered
 * this and when" is the only question anybody asks about a support inbox.
 */
export async function markContactHandled(
  id: number,
  actor: Actor,
): Promise<ContactResult> {
  return transaction(async (client) => {
    const res = await client.query<{ handled_at: Date | null; name: string }>(
      "SELECT handled_at, name FROM contact_messages WHERE id = $1 FOR UPDATE",
      [id],
    );
    const row = res.rows[0];
    if (!row) return { ok: false, reason: "not-found" };
    if (row.handled_at) return { ok: false, reason: "already-handled" };

    await client.query(
      "UPDATE contact_messages SET handled_at = now() WHERE id = $1",
      [id],
    );

    await record(client, {
      actorUserId: actor.id,
      action: "admin.contact_handled",
      targetType: "contact_message",
      targetId: String(id),
      detail: { from: row.name },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return { ok: true };
  });
}

/* ── Users ───────────────────────────────────────────────────────────────── */

export type UserActionResult =
  { ok: true } | { ok: false; reason: "not-found" | "self" };

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

export type RoleResult =
  { ok: true } | { ok: false; reason: "not-found" | "self" | "last-admin" };

/**
 * Grants or revokes admin access. There are two roles — bidder and admin —
 * since `staff` was removed: it could do everything an admin could, under a
 * name that suggested otherwise.
 *
 * ⚠ Three guards, and each exists because of a specific way this goes wrong.
 *
 * **Not your own account.** An admin demoting themselves is locked out of the
 * panel they need to undo it, and `requireAdmin` returns a 404 — so the route
 * they would go back to stops existing.
 *
 * **Never the last admin.** Demoting the only remaining admin leaves nobody who
 * can promote anyone, and the only way back is a hand-written SQL statement
 * against production. The count is taken inside the transaction, after a lock
 * on the row being changed, so two admins demoting each other at once cannot
 * both pass the check.
 *
 * **Sessions are revoked on a DEMOTION.** An admin session that keeps working
 * after the role is taken away is the role not really having been taken away.
 * Promotions leave sessions alone — `currentUser` reads the role fresh on every
 * request, so a promoted user gets their new access without signing in again.
 */
export async function setUserRole(
  userId: number,
  role: "bidder" | "admin",
  reason: string,
  actor: Actor,
): Promise<RoleResult> {
  if (userId === actor.id) return { ok: false, reason: "self" };

  return transaction(async (client) => {
    const res = await client.query<{ role: string; paddle: string }>(
      "SELECT role, paddle FROM users WHERE id = $1 FOR UPDATE",
      [userId],
    );
    const user = res.rows[0];
    if (!user) return { ok: false, reason: "not-found" };

    if (user.role === "admin" && role !== "admin") {
      const admins = await client.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM users WHERE role = 'admin' AND status = 'active'",
      );
      if ((admins.rows[0]?.count ?? 0) <= 1) {
        return { ok: false, reason: "last-admin" };
      }
    }

    await client.query(
      "UPDATE users SET role = $2::user_role, updated_at = now() WHERE id = $1",
      [userId, role],
    );

    const demoted = user.role === "admin" && role === "bidder";
    if (demoted) {
      await client.query(
        "UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
        [userId],
      );
    }

    await record(client, {
      actorUserId: actor.id,
      action: "admin.role_changed",
      targetType: "user",
      targetId: String(userId),
      detail: { paddle: user.paddle, from: user.role, to: role, reason },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return { ok: true };
  });
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FREE POINTS
 *
 * Points a bidder did not pay for: a welcome gift, a promotion, an apology for
 * an outage. The `bonus` ledger kind has existed since the schema was written
 * and nothing wrote it until now.
 *
 * ── Why this is not `adjustBalance` with a positive number ───────────────────
 *
 * It would work, and it would be wrong in three ways that only show up later.
 *
 *   • An `adjustment` says "the balance was incorrect and has been fixed". A
 *     `bonus` says "the house gave this away". Recorded as the same kind, the
 *     accounts can no longer answer how many points in circulation were ever
 *     paid for — which is the difference between revenue and a liability.
 *   • A correction is invisible on purpose; a gift is pointless unless the
 *     recipient is told. This notifies. Adjustments do not.
 *   • A gift cannot be negative. Making that impossible in the type, the
 *     schema and the SQL means the one control that hands out money cannot be
 *     turned round and used to take it.
 *
 * Taking points back is still `adjustBalance`, where it is visible as exactly
 * that in the bidder's own history.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type BonusResult =
  | { ok: true; balancePts: number; paddle: string }
  | { ok: false; reason: "not-found" | "not-positive" | "too-large" };

/**
 * Credits a bidder with points they did not pay for, and tells them.
 *
 * The ledger row, the balance, the notification and the audit entry are one
 * transaction: a gift that failed halfway must not leave a message about points
 * that are not there, and points that arrived without a ledger row are exactly
 * the drift `reconcileBalances` alarms on.
 */
export async function grantBonus(
  userId: number,
  deltaPts: number,
  memo: string,
  actor: Actor,
): Promise<BonusResult> {
  /*
   * Checked here as well as in the zod schema. The schema guards the form; this
   * guards the function, and it is the one that still holds when somebody calls
   * it from a script at two in the morning.
   */
  if (!Number.isInteger(deltaPts) || deltaPts <= 0) {
    return { ok: false, reason: "not-positive" };
  }
  if (deltaPts > MAX_BONUS_PTS) return { ok: false, reason: "too-large" };

  return transaction(async (client) => {
    const res = await client.query<{ paddle: string; name: string }>(
      "SELECT paddle, name FROM users WHERE id = $1 FOR UPDATE",
      [userId],
    );
    const user = res.rows[0];
    if (!user) return { ok: false, reason: "not-found" };

    const entry = await client.query<{ id: number }>(
      `INSERT INTO ledger_entries (user_id, delta_pts, kind, memo)
       VALUES ($1, $2, 'bonus', $3)
       RETURNING id`,
      [userId, deltaPts, memo],
    );
    const entryId = entry.rows[0]!.id;

    /*
     * Upsert, not UPDATE.
     *
     * `adjustBalance` updates and reads the row count, which reports a missing
     * wallet as "would-overdraw" — a confusing lie for an account that predates
     * the balances row. A credit cannot overdraw anything, so the row can
     * simply be created at the amount given.
     */
    const balance = await client.query<{ pts: number }>(
      `INSERT INTO balances (user_id, pts) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE
         SET pts = balances.pts + EXCLUDED.pts, updated_at = now()
       RETURNING pts`,
      [userId, deltaPts],
    );

    /*
     * Keyed on the ledger id, so two gifts to the same bidder are two messages.
     * A per-user key would silently collapse the second one — and a promotion
     * nobody is told about is a promotion that did not happen.
     */
    await enqueue(client, {
      userId,
      channel: "inapp",
      kind: "points.bonus",
      body: `${t.brand.name}: Танд ${deltaPts} оноо бэлэглэлээ — ${memo}`,
      href: "/wallet",
      dedupeKey: `bonus:${entryId}`,
    });

    await record(client, {
      actorUserId: actor.id,
      action: "admin.bonus_granted",
      targetType: "user",
      targetId: String(userId),
      detail: {
        paddle: user.paddle,
        deltaPts,
        memo,
        ledgerEntryId: entryId,
        resultingPts: balance.rows[0]!.pts,
      },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return {
      ok: true,
      balancePts: balance.rows[0]!.pts,
      paddle: user.paddle,
    };
  });
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PAYMENT TAKEN BY HAND
 *
 * Money that reached the house outside the payment provider — cash at the desk,
 * a transfer straight into the bank account — turned into points.
 *
 * ── Why this is a top-up, not a bonus or an adjustment ───────────────────────
 *
 * Somebody paid. Filed as a `bonus` it would read as the house giving points
 * away; filed as an `adjustment`, as the house fixing a mistake. Either way the
 * accounts could no longer say how much money was ever paid in. So it is a
 * `topups` row like any other, born `paid`, with a `topup` ledger entry — and
 * it is counted wherever top-ups are counted: the Цэнэглэлт figure on /admin,
 * the first tab of the export, and the bidder's own history.
 *
 * ── Why it cannot be credited twice ──────────────────────────────────────────
 *
 *   • The form's idempotency key becomes the row's `reference`, which is
 *     unique. A form submitted twice — a double tap, a retried request — lands
 *     on the row the first submission made and credits nothing more.
 *   • A bank transfer's own number is `provider_ref`, unique per provider. The
 *     same transfer typed in twice, by two people on two different days, is
 *     refused rather than paid out again.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface PaymentInput {
  userId: number;
  amountMnt: number;
  method: "cash" | "bank";
  /** The bank's transaction number, or a cash receipt's. */
  providerRef: string | null;
  memo: string;
  idempotencyKey: string;
}

export type PaymentResult =
  | {
      ok: true;
      points: number;
      balancePts: number;
      paddle: string;
      /** True when this exact submission had already been recorded. */
      duplicate: boolean;
    }
  | { ok: false; reason: "not-found" | "bad-amount" | "ref-taken" };

const PAYMENT_MEMO: Record<PaymentInput["method"], string> = {
  cash: "Оноо худалдан авалт · бэлэн",
  bank: "Оноо худалдан авалт · дансаар",
};

export async function recordPayment(
  input: PaymentInput,
  actor: Actor,
): Promise<PaymentResult> {
  /*
   * Re-checked here, as `grantBonus` re-checks its cap: the schema guards the
   * form, this guards the function for a caller that never saw it.
   */
  if (
    !Number.isInteger(input.amountMnt) ||
    input.amountMnt <= 0 ||
    input.amountMnt > MAX_PAYMENT_MNT ||
    input.amountMnt % POINT_MNT !== 0
  ) {
    return { ok: false, reason: "bad-amount" };
  }
  const points = input.amountMnt / POINT_MNT;
  const reference = `desk-${input.idempotencyKey}`;

  return transaction(async (client) => {
    /*
     * The user row is locked first, so two submissions of one form queue here
     * and the second finds the first's row below rather than racing it into
     * the unique index.
     */
    const res = await client.query<{ paddle: string }>(
      "SELECT paddle FROM users WHERE id = $1 FOR UPDATE",
      [input.userId],
    );
    const user = res.rows[0];
    if (!user) return { ok: false, reason: "not-found" };

    /*
     * DO NOTHING without a target covers both unique indexes at once — the
     * reference and the bank's number. Which one declined is decided below.
     * Paid on arrival: there is no provider to wait for, so `expires_at` is
     * only there because the column requires one.
     */
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO topups (user_id, points, amount_mnt, status, provider,
                           provider_ref, reference, paid_at, expires_at)
       VALUES ($1, $2, $3, 'paid', $4, $5, $6, now(), now())
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        input.userId,
        points,
        input.amountMnt,
        input.method,
        input.providerRef,
        reference,
      ],
    );

    if (inserted.rowCount === 0) {
      const prior = await client.query<{ user_id: number; points: number }>(
        "SELECT user_id, points FROM topups WHERE reference = $1",
        [reference],
      );
      const first = prior.rows[0];
      if (!first || first.user_id !== input.userId) {
        return { ok: false, reason: "ref-taken" };
      }
      const balance = await client.query<{ pts: number }>(
        "SELECT pts FROM balances WHERE user_id = $1",
        [input.userId],
      );
      return {
        ok: true,
        points: first.points,
        balancePts: balance.rows[0]?.pts ?? 0,
        paddle: user.paddle,
        duplicate: true,
      };
    }

    const memo = input.memo
      ? `${PAYMENT_MEMO[input.method]} — ${input.memo}`
      : PAYMENT_MEMO[input.method];

    await client.query(
      `INSERT INTO ledger_entries (user_id, delta_pts, kind, ref_type, ref_id, memo)
       VALUES ($1, $2, 'topup', 'topup', $3, $4)`,
      [input.userId, points, reference, memo],
    );

    /* Upsert, for the same reason as in `grantBonus`: a credit cannot overdraw. */
    const balance = await client.query<{ pts: number }>(
      `INSERT INTO balances (user_id, pts) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE
         SET pts = balances.pts + EXCLUDED.pts, updated_at = now()
       RETURNING pts`,
      [input.userId, points],
    );

    /*
     * Told, unlike an adjustment. A bidder who handed over cash should not have
     * to refresh the wallet to find out whether it was counted.
     */
    await enqueue(client, {
      userId: input.userId,
      channel: "inapp",
      kind: "points.topup",
      body: `${t.brand.name}: ${groupNumber(input.amountMnt)}₮ төлбөр хүлээн авч, ${points} оноо нэмэгдлээ.`,
      href: "/wallet",
      dedupeKey: `topup:${reference}`,
    });

    await record(client, {
      actorUserId: actor.id,
      action: "admin.payment_recorded",
      targetType: "topup",
      targetId: reference,
      detail: {
        userId: input.userId,
        paddle: user.paddle,
        amountMnt: input.amountMnt,
        points,
        method: input.method,
        providerRef: input.providerRef,
        memo: input.memo,
        resultingPts: balance.rows[0]!.pts,
      },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return {
      ok: true,
      points,
      balancePts: balance.rows[0]!.pts,
      paddle: user.paddle,
      duplicate: false,
    };
  });
}

export type AdjustResult =
  | { ok: true; balancePts: number }
  | { ok: false; reason: "not-found" | "would-overdraw" };

/**
 * Moves points by hand, in either direction — a correction.
 *
 * Posted as an ordinary `adjustment` ledger entry, which means it appears in
 * the bidder's own transaction history on `/wallet`. A silent correction to a
 * balance is indistinguishable from theft from the outside; one the bidder can
 * see is a correction.
 *
 * ⚠ Not the way to hand out free points — use `grantBonus`, which records the
 * `bonus` kind and tells the recipient. Adjustments are deliberately quiet, and
 * a gift filed as a correction is both unannounced and uncountable.
 */
export async function adjustBalance(
  userId: number,
  deltaPts: number,
  memo: string,
  actor: Actor,
): Promise<AdjustResult> {
  return transaction(async (client) => {
    const exists = await client.query("SELECT 1 FROM users WHERE id = $1", [
      userId,
    ]);
    if (exists.rowCount === 0) return { ok: false, reason: "not-found" };

    const updated = await client.query<{ pts: number }>(
      `UPDATE balances SET pts = pts + $2, updated_at = now()
        WHERE user_id = $1 AND pts + $2 >= 0
        RETURNING pts`,
      [userId, deltaPts],
    );
    // The guard and the write in one statement; the CHECK on the table is the
    // backstop, but it would surface as a 500 rather than as this rejection.
    //
    // ⚠ Before the ledger insert, not after it. A refusal RETURNS, and
    // `transaction` commits whatever was written before a return — so with the
    // ledger row first, a refused correction left an append-only entry the
    // balance never received, which is exactly the drift `reconcileBalances`
    // alarms on, and nothing can delete it.
    if (updated.rowCount === 0) return { ok: false, reason: "would-overdraw" };

    await client.query(
      `INSERT INTO ledger_entries (user_id, delta_pts, kind, memo)
       VALUES ($1, $2, 'adjustment', $3)`,
      [userId, deltaPts, memo],
    );

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
