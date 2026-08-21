import "server-only";
import { query, queryOne } from "../db";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT A BIDDER CAN SEE ABOUT THEMSELVES
 *
 * Every function here takes a `userId` that the caller must have read from the
 * session — never from a route parameter. `/profile` shows the signed-in
 * bidder's own history and nothing else; a `userId` accepted from the URL
 * would be an IDOR on the whole bidder list.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface BidHistoryRow {
  bidId: number;
  lotId: string;
  lotCode: string;
  lotTitle: string;
  points: number;
  round: number;
  placedAt: string;
  /** How the lot ended, if it has. */
  outcome: "scheduled" | "running" | "sold" | "unsold";
  /** True when this bid is the one that won the lot. */
  won: boolean;
}

/**
 * The bidder's own bids, newest first.
 *
 * `won` is computed by comparing this bid against the auction's final price and
 * leader rather than stored on the bid — a bid does not know it won, and
 * writing that back would mean updating an append-only table.
 */
export async function bidHistory(
  userId: number,
  limit = 100,
): Promise<BidHistoryRow[]> {
  const rows = await query<{
    bid_id: number;
    lot_id: string;
    code: string;
    title: string;
    points: number;
    round: number;
    placed_at: Date;
    outcome: BidHistoryRow["outcome"];
    current_pts: number;
    leader_user_id: number | null;
  }>(
    `
    SELECT b.id AS bid_id, b.lot_id, l.code, l.title, b.points, b.round, b.placed_at,
           a.outcome, a.current_pts, a.leader_user_id
      FROM bids b
      JOIN lots     l ON l.id = b.lot_id
      JOIN auctions a ON a.lot_id = b.lot_id
     WHERE b.user_id = $1
     ORDER BY b.id DESC
     LIMIT $2
    `,
    [userId, limit],
  );

  return rows.map((r) => ({
    bidId: r.bid_id,
    lotId: r.lot_id,
    lotCode: r.code,
    lotTitle: r.title,
    points: r.points,
    round: r.round,
    placedAt: r.placed_at.toISOString(),
    outcome: r.outcome,
    won:
      r.outcome === "sold" &&
      r.leader_user_id === userId &&
      r.points === r.current_pts,
  }));
}

export interface WonLot {
  lotId: string;
  code: string;
  title: string;
  image: string | null;
  hammerPts: number;
  hammerRound: number | null;
  settledAt: string | null;
}

/** Lots this bidder won. The list a winner is asked to settle. */
export async function wonLots(userId: number): Promise<WonLot[]> {
  const rows = await query<{
    lot_id: string;
    code: string;
    title: string;
    image: string | null;
    current_pts: number;
    hammer_round: number | null;
    settled_at: Date | null;
  }>(
    `
    SELECT a.lot_id, l.code, l.title, l.image, a.current_pts, a.hammer_round, a.settled_at
      FROM auctions a
      JOIN lots l ON l.id = a.lot_id
     WHERE a.outcome = 'sold' AND a.leader_user_id = $1
     ORDER BY a.settled_at DESC NULLS LAST
    `,
    [userId],
  );

  return rows.map((r) => ({
    lotId: r.lot_id,
    code: r.code,
    title: r.title,
    image: r.image,
    hammerPts: r.current_pts,
    hammerRound: r.hammer_round,
    settledAt: r.settled_at?.toISOString() ?? null,
  }));
}

export interface LedgerRow {
  id: number;
  deltaPts: number;
  kind: string;
  memo: string | null;
  refType: string | null;
  refId: string | null;
  createdAt: string;
}

/** Every movement of points, newest first. */
export async function ledgerHistory(
  userId: number,
  limit = 100,
): Promise<LedgerRow[]> {
  const rows = await query<{
    id: number;
    delta_pts: number;
    kind: string;
    memo: string | null;
    ref_type: string | null;
    ref_id: string | null;
    created_at: Date;
  }>(
    `SELECT id, delta_pts, kind, memo, ref_type, ref_id, created_at
       FROM ledger_entries WHERE user_id = $1
      ORDER BY id DESC LIMIT $2`,
    [userId, limit],
  );

  return rows.map((r) => ({
    id: r.id,
    deltaPts: r.delta_pts,
    kind: r.kind,
    memo: r.memo,
    refType: r.ref_type,
    refId: r.ref_id,
    createdAt: r.created_at.toISOString(),
  }));
}

export interface AccountSummary {
  balancePts: number;
  bidCount: number;
  lotsEntered: number;
  lotsWon: number;
  /** Total spent on join fees and settlements, as a positive number. */
  spentPts: number;
}

/**
 * The four figures at the top of `/profile`.
 *
 * One round trip rather than four: the profile page renders them together, and
 * four sequential awaits on a page that already reads the session is four
 * round trips a bidder waits through.
 */
export async function accountSummary(userId: number): Promise<AccountSummary> {
  const row = await queryOne<{
    balance_pts: number | null;
    bid_count: number;
    lots_entered: number;
    lots_won: number;
    spent_pts: number;
  }>(
    `
    SELECT
      (SELECT pts FROM balances WHERE user_id = $1) AS balance_pts,
      (SELECT count(*) FROM bids WHERE user_id = $1)::int AS bid_count,
      (SELECT count(*) FROM lot_participants WHERE user_id = $1)::int AS lots_entered,
      (SELECT count(*) FROM auctions WHERE outcome = 'sold' AND leader_user_id = $1)::int AS lots_won,
      (SELECT COALESCE(-SUM(delta_pts), 0) FROM ledger_entries
        WHERE user_id = $1 AND delta_pts < 0)::int AS spent_pts
    `,
    [userId],
  );

  return {
    balancePts: row?.balance_pts ?? 0,
    bidCount: row?.bid_count ?? 0,
    lotsEntered: row?.lots_entered ?? 0,
    lotsWon: row?.lots_won ?? 0,
    spentPts: row?.spent_pts ?? 0,
  };
}
