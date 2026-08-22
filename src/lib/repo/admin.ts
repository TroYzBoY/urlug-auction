import "server-only";
import { query, queryOne } from "../db";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ADMIN READS
 *
 * ⚠ Nothing here checks authorisation. Every function assumes the caller has
 * already established that the viewer is staff — see `requireAdmin` in
 * `src/lib/session.ts`, which every admin page and action calls first.
 *
 * That split is deliberate and worth stating: a repository that sometimes
 * checks permissions and sometimes does not is worse than one that never does,
 * because the reader cannot tell which kind they are looking at.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface AdminStats {
  lots: number;
  liveLots: number;
  users: number;
  bids: number;
  /** Points ever issued, as a positive number. */
  pointsIssued: number;
  /** Points currently sitting in bidder balances. */
  pointsHeld: number;
  /** ₮ received through settled top-ups. */
  topupMnt: number;
}

export async function stats(): Promise<AdminStats> {
  const row = await queryOne<{
    lots: number;
    live_lots: number;
    users: number;
    bids: number;
    points_issued: number;
    points_held: number;
    topup_mnt: number;
  }>(
    `
    SELECT
      (SELECT count(*) FROM lots)::int AS lots,
      (SELECT count(*) FROM auctions WHERE outcome = 'running')::int AS live_lots,
      (SELECT count(*) FROM users WHERE status = 'active')::int AS users,
      (SELECT count(*) FROM bids)::int AS bids,
      (SELECT COALESCE(SUM(delta_pts), 0) FROM ledger_entries WHERE delta_pts > 0)::int AS points_issued,
      (SELECT COALESCE(SUM(pts), 0) FROM balances)::int AS points_held,
      (SELECT COALESCE(SUM(amount_mnt), 0) FROM topups WHERE status = 'paid')::bigint AS topup_mnt
    `,
  );

  return {
    lots: row?.lots ?? 0,
    liveLots: row?.live_lots ?? 0,
    users: row?.users ?? 0,
    bids: row?.bids ?? 0,
    pointsIssued: row?.points_issued ?? 0,
    pointsHeld: row?.points_held ?? 0,
    topupMnt: row?.topup_mnt ?? 0,
  };
}

export interface AdminLotRow {
  lotId: string;
  code: string;
  title: string;
  outcome: "scheduled" | "running" | "sold" | "unsold";
  opensAt: string;
  currentPts: number;
  bidCount: number;
  leaderPaddle: string | null;
  round: number;
}

export async function lots(limit = 200): Promise<AdminLotRow[]> {
  const rows = await query<{
    lot_id: string;
    code: string;
    title: string;
    outcome: AdminLotRow["outcome"];
    opens_at: Date;
    current_pts: number;
    bid_count: number;
    leader_paddle: string | null;
    round: number;
  }>(
    `SELECT a.lot_id, l.code, l.title, a.outcome, a.opens_at, a.current_pts,
            a.bid_count, a.leader_paddle, a.round
       FROM auctions a JOIN lots l ON l.id = a.lot_id
      ORDER BY a.opens_at DESC LIMIT $1`,
    [limit],
  );

  return rows.map((r) => ({
    lotId: r.lot_id,
    code: r.code,
    title: r.title,
    outcome: r.outcome,
    opensAt: r.opens_at.toISOString(),
    currentPts: r.current_pts,
    bidCount: r.bid_count,
    leaderPaddle: r.leader_paddle,
    round: r.round,
  }));
}

export interface AdminUserRow {
  id: number;
  name: string;
  paddle: string;
  phone: string;
  status: "active" | "suspended" | "closed";
  role: "bidder" | "staff" | "admin";
  verified: boolean;
  balancePts: number;
  bidCount: number;
  createdAt: string;
}

export async function users(limit = 200): Promise<AdminUserRow[]> {
  const rows = await query<{
    id: number;
    name: string;
    paddle: string;
    phone: string;
    status: AdminUserRow["status"];
    role: AdminUserRow["role"];
    phone_verified_at: Date | null;
    balance_pts: number | null;
    bid_count: number;
    created_at: Date;
  }>(
    `SELECT u.id, u.name, u.paddle, u.phone, u.status, u.role, u.phone_verified_at,
            b.pts AS balance_pts,
            (SELECT count(*) FROM bids WHERE user_id = u.id)::int AS bid_count,
            u.created_at
       FROM users u LEFT JOIN balances b ON b.user_id = u.id
      ORDER BY u.id DESC LIMIT $1`,
    [limit],
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    paddle: r.paddle,
    phone: r.phone,
    status: r.status,
    role: r.role,
    verified: r.phone_verified_at !== null,
    balancePts: r.balance_pts ?? 0,
    bidCount: r.bid_count,
    createdAt: r.created_at.toISOString(),
  }));
}

export interface AuditRow {
  id: number;
  action: string;
  actorPaddle: string | null;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
}

export async function recentAudit(limit = 40): Promise<AuditRow[]> {
  const rows = await query<{
    id: number;
    action: string;
    paddle: string | null;
    target_type: string | null;
    target_id: string | null;
    created_at: Date;
  }>(
    `SELECT a.id, a.action, u.paddle, a.target_type, a.target_id, a.created_at
       FROM audit_log a LEFT JOIN users u ON u.id = a.actor_user_id
      ORDER BY a.id DESC LIMIT $1`,
    [limit],
  );

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    actorPaddle: r.paddle,
    targetType: r.target_type,
    targetId: r.target_id,
    createdAt: r.created_at.toISOString(),
  }));
}
