import "server-only";
import { query, queryOne } from "../db";
import { settle, type EngineState } from "../auction-engine";

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
  /**
   * Points given away rather than sold.
   *
   * Worth its own figure beside `pointsIssued`: these are bidding power with no
   * tugrik behind them, so the gap between the two is the house's exposure if
   * every free point were spent at once.
   */
  pointsGifted: number;
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
    points_gifted: number;
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
      (SELECT COALESCE(SUM(delta_pts), 0) FROM ledger_entries WHERE kind = 'bonus')::int AS points_gifted,
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
    pointsGifted: row?.points_gifted ?? 0,
    pointsHeld: row?.points_held ?? 0,
    topupMnt: row?.topup_mnt ?? 0,
  };
}

export interface AdminLotRow {
  lotId: string;
  code: string;
  title: string;
  outcome: EngineState["outcome"];
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

/* ── The review queue ────────────────────────────────────────────────────── */

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHO MAY BE GIVEN THIS LOT
 *
 * One row per bidder who bid on a lot awaiting review, carrying their best bid.
 * This is the list the dashboard turns into a dropdown, so it decides what an
 * admin is able to choose — which is why it is grouped from `bids` rather than
 * assembled from `lot_participants`: somebody who entered a lot and never bid
 * is not a candidate to win it, and should not be one click away from being
 * awarded it by mistake.
 *
 * `status` travels with each candidate so a suspended account is visible in the
 * list rather than discovered after it has been handed a lot.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface ReviewCandidate {
  userId: number;
  name: string;
  paddle: string;
  /** Their highest bid on this lot — what they would pay if awarded it. */
  topPts: number;
  /** Which round that bid landed in. */
  topRound: number;
  bidCount: number;
  status: "active" | "suspended" | "closed";
}

export interface ReviewLotRow {
  lotId: string;
  code: string;
  title: string;
  /** Epoch ms bidding stopped. */
  closedAt: string | null;
  /** The round the clock ran out in. */
  closedInRound: number;
  /** The bid that was standing when the clock stopped — the default choice. */
  standingPts: number;
  standingPaddle: string | null;
  standingUserId: number | null;
  bidCount: number;
  candidates: ReviewCandidate[];
}

/**
 * Every lot waiting on a decision, newest first.
 *
 * ⚠ Rows whose stored outcome is still `running` are included and then settled
 * in memory, for the same reason every other read in this codebase does it: the
 * ticker persists the transition, but a reader that trusts the stored value
 * shows an empty queue for however long the ticker takes to notice. An admin
 * refreshing the dashboard the second a clock hits zero must see the lot.
 */
export async function reviewQueue(): Promise<ReviewLotRow[]> {
  const rows = await query<{
    lot_id: string;
    code: string;
    title: string;
    opens_at: Date;
    round: number;
    current_pts: number;
    leader_paddle: string | null;
    leader_user_id: number | null;
    bid_clock_ends_at: Date;
    outcome: EngineState["outcome"];
    settled_at: Date | null;
    bid_count: number;
  }>(
    `SELECT a.lot_id, l.code, l.title, a.opens_at, a.round, a.current_pts,
            a.leader_paddle, a.leader_user_id, a.bid_clock_ends_at, a.outcome,
            a.settled_at, a.bid_count
       FROM auctions a JOIN lots l ON l.id = a.lot_id
      WHERE a.outcome IN ('running', 'review')
      ORDER BY a.opens_at DESC`,
  );

  const now = Date.now();
  const pending = rows
    .map((r) => ({
      row: r,
      live: settle(
        {
          opensAt: r.opens_at.getTime(),
          round: r.round,
          currentPts: r.current_pts,
          leaderPaddle: r.leader_paddle,
          bidClockEndsAt: r.bid_clock_ends_at.getTime(),
          outcome: r.outcome,
        },
        now,
      ),
    }))
    .filter(({ live }) => live.outcome === "review");

  if (pending.length === 0) return [];

  /*
   * One query for every candidate across every pending lot, not one per lot.
   * The queue is short in normal operation, but it is longest exactly when the
   * house has fallen behind — which is the moment this page must still load.
   */
  const candidates = await query<{
    lot_id: string;
    user_id: number;
    name: string;
    paddle: string;
    top_pts: number;
    top_round: number;
    bid_count: number;
    status: ReviewCandidate["status"];
  }>(
    `SELECT DISTINCT ON (b.lot_id, b.user_id)
            b.lot_id, b.user_id, u.name, b.paddle, u.status,
            b.points AS top_pts, b.round AS top_round,
            (SELECT count(*)::int FROM bids x
              WHERE x.lot_id = b.lot_id AND x.user_id = b.user_id) AS bid_count
       FROM bids b JOIN users u ON u.id = b.user_id
      WHERE b.lot_id = ANY($1::text[])
      ORDER BY b.lot_id, b.user_id, b.points DESC`,
    [pending.map(({ row }) => row.lot_id)],
  );

  const byLot = new Map<string, ReviewCandidate[]>();
  for (const c of candidates) {
    const list = byLot.get(c.lot_id) ?? [];
    list.push({
      userId: c.user_id,
      name: c.name,
      paddle: c.paddle,
      topPts: c.top_pts,
      topRound: c.top_round,
      bidCount: c.bid_count,
      status: c.status,
    });
    byLot.set(c.lot_id, list);
  }
  // Highest bid first: the standing leader heads every list, so the ordinary
  // decision is the top of the dropdown.
  for (const list of byLot.values()) list.sort((a, b) => b.topPts - a.topPts);

  return pending.map(({ row, live }) => {
    /*
     * The stored stamp when the ticker has already written one, the engine's
     * otherwise — both mean the instant bidding stopped, and the engine's is
     * the event's own timestamp rather than the moment anyone noticed.
     */
    const closedMs = row.settled_at?.getTime() ?? live.settledAt;

    return {
      lotId: row.lot_id,
      code: row.code,
      title: row.title,
      closedAt: closedMs == null ? null : new Date(closedMs).toISOString(),
      closedInRound: live.hammerRound ?? live.round,
      standingPts: live.currentPts,
      standingPaddle: live.leaderPaddle,
      standingUserId: row.leader_user_id,
      bidCount: row.bid_count,
      candidates: byLot.get(row.lot_id) ?? [],
    };
  });
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

/* ── The contact inbox ───────────────────────────────────────────────────── */

/**
 * Messages sent through /contact.
 *
 * ⚠ Unhandled first, then newest — not simply newest.
 *
 * The point of an inbox is the queue, and a plain reverse-chronological list
 * buries the oldest unanswered message under every new one. That is exactly
 * backwards: the message somebody has been waiting longest on is the one that
 * most needs answering.
 *
 * `contact` is shown in full, unlike the bidder table's deliberately hidden
 * phone numbers. It is the whole purpose of the row — a message you cannot
 * reply to is not a contact form.
 */
export interface ContactRow {
  id: number;
  name: string;
  /** However they asked to be reached — a phone number or an email. */
  contact: string;
  topic: string;
  message: string;
  createdAt: string;
  handledAt: string | null;
}

export async function contactMessages(limit = 100): Promise<ContactRow[]> {
  const rows = await query<{
    id: number;
    name: string;
    contact: string;
    topic: string;
    message: string;
    created_at: Date;
    handled_at: Date | null;
  }>(
    `SELECT id, name, contact, topic, message, created_at, handled_at
       FROM contact_messages
      ORDER BY handled_at IS NOT NULL, created_at DESC
      LIMIT $1`,
    [limit],
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    contact: r.contact,
    topic: r.topic,
    message: r.message,
    createdAt: r.created_at.toISOString(),
    handledAt: r.handled_at?.toISOString() ?? null,
  }));
}

/** How many are still waiting — the number worth putting on the panel heading. */
export async function unhandledContactCount(): Promise<number> {
  const row = await queryOne<{ n: number }>(
    "SELECT count(*)::int AS n FROM contact_messages WHERE handled_at IS NULL",
  );
  return row?.n ?? 0;
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
