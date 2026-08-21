import "server-only";
import type { PoolClient } from "pg";
import { getPool, query, queryOne } from "../db";
import { settle, type EngineState, type SettledState } from "../auction-engine";
import type { Bid, Lot, LotCategory, LotStatus, RoomState } from "../types";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LOT + ROOM READS
 *
 * Every read runs the row through the auction engine before returning it, so a
 * caller can never see a lot that the database still calls "running" but whose
 * clock expired ninety seconds ago. The ticker persists that transition, but
 * readers must not depend on having been beaten to it — a reader that trusts
 * the stored `outcome` shows a sold lot as live for however long the ticker
 * takes to notice.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const LOT_COLUMNS = `
  l.id, l.code, l.title, l.maker, l.year, l.category, l.note, l.provenance,
  l.condition, l.dimensions, l.estimate_low_pts, l.estimate_high_pts,
  l.opening_pts, l.image, l.starts_at,
  a.opens_at, a.round, a.current_pts, a.leader_paddle, a.leader_user_id,
  a.bid_clock_ends_at, a.outcome, a.hammer_round, a.bid_count
`;

interface LotRow {
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
  estimate_low_pts: number;
  estimate_high_pts: number;
  opening_pts: number;
  image: string | null;
  starts_at: Date;
  opens_at: Date;
  round: number;
  current_pts: number;
  leader_paddle: string | null;
  leader_user_id: number | null;
  bid_clock_ends_at: Date;
  outcome: EngineState["outcome"];
  hammer_round: number | null;
  bid_count: number;
}

function engineStateOf(row: LotRow): EngineState {
  return {
    opensAt: row.opens_at.getTime(),
    round: row.round,
    currentPts: row.current_pts,
    leaderPaddle: row.leader_paddle,
    bidClockEndsAt: row.bid_clock_ends_at.getTime(),
    outcome: row.outcome,
  };
}

const STATUS_OF: Record<EngineState["outcome"], LotStatus> = {
  scheduled: "upcoming",
  running: "live",
  sold: "sold",
  unsold: "unsold",
};

function toLot(row: LotRow, live: SettledState): Lot {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    maker: row.maker,
    year: row.year,
    category: row.category as LotCategory,
    note: row.note,
    provenance: row.provenance,
    condition: row.condition,
    dimensions: row.dimensions,
    estimateLowPts: row.estimate_low_pts,
    estimateHighPts: row.estimate_high_pts,
    openingPts: row.opening_pts,
    // `?? undefined` rather than passing null: Lot.image is optional, and the
    // plate falls back to the drawn silhouette on undefined.
    image: row.image ?? undefined,
    status: STATUS_OF[live.outcome],
    startsAt: row.starts_at.toISOString(),
    ...(live.outcome === "sold"
      ? {
          hammerPts: live.currentPts,
          hammerRound: live.hammerRound ?? row.hammer_round ?? row.round,
        }
      : {}),
    bidCount: row.bid_count,
  };
}

async function selectLots(where: string, params: unknown[] = []): Promise<Lot[]> {
  const rows = await query<LotRow>(
    `SELECT ${LOT_COLUMNS} FROM lots l JOIN auctions a ON a.lot_id = l.id ${where}`,
    params,
  );
  const now = Date.now();
  return rows.map((row) => toLot(row, settle(engineStateOf(row), now)));
}

export async function getLots(): Promise<Lot[]> {
  return selectLots("ORDER BY a.opens_at ASC");
}

export async function getLot(id: string): Promise<Lot | null> {
  const [lot] = await selectLots("WHERE l.id = $1", [id]);
  return lot ?? null;
}

/**
 * Lots currently under way, and lots not yet open.
 *
 * Filtered in JavaScript after settling rather than in SQL on `a.outcome`,
 * because SQL would read the stored outcome — the one the engine exists to
 * correct. The catalogue is small enough that this costs nothing; if it grows
 * past a few thousand lots, narrow the SQL to a superset (`outcome IN
 * ('scheduled','running') OR settled_at > now() - interval '1 day'`) and keep
 * the settle-then-filter shape.
 */
export async function getLiveLots(): Promise<Lot[]> {
  const lots = await selectLots("ORDER BY a.opens_at ASC");
  return lots.filter((l) => l.status === "live");
}

export async function getUpcomingLots(): Promise<Lot[]> {
  const lots = await selectLots("ORDER BY a.opens_at ASC");
  return lots.filter((l) => l.status === "upcoming");
}

export async function getResultLots(): Promise<Lot[]> {
  const lots = await selectLots("ORDER BY a.opens_at DESC");
  return lots.filter((l) => l.status === "sold" || l.status === "unsold");
}

/** The lot the hero and header CTA point at — the longest-running live one. */
export async function getLiveLot(): Promise<Lot | null> {
  const live = await getLiveLots();
  if (live.length > 0) return live[0]!;
  // Nothing live: point at whatever opens next, so the CTA still leads
  // somewhere real rather than 404ing between sales.
  const upcoming = await getUpcomingLots();
  return upcoming[0] ?? null;
}

/* ── Room state ──────────────────────────────────────────────────────────── */

/** Newest first, matching RoomState.bids. 40 is what the feed renders. */
const FEED_SIZE = 40;

export async function recentBids(
  lotId: string,
  viewerUserId: number | null,
  client: PoolClient | null = null,
): Promise<Bid[]> {
  const runner = client ?? getPool();
  const res = await runner.query<{
    id: number;
    paddle: string;
    points: number;
    round: number;
    placed_at: Date;
    user_id: number;
  }>(
    `SELECT id, paddle, points, round, placed_at, user_id
       FROM bids WHERE lot_id = $1 ORDER BY id DESC LIMIT ${FEED_SIZE}`,
    [lotId],
  );

  return res.rows.map((b) => ({
    id: String(b.id),
    paddle: b.paddle,
    points: b.points,
    round: b.round,
    at: b.placed_at.getTime(),
    isYou: viewerUserId !== null && b.user_id === viewerUserId,
  }));
}

/**
 * Everything the room renders from, for one viewer.
 *
 * `viewerUserId` is what makes `hasBid` and `isYou` correct, and it is read
 * from the session on the server — never accepted as an argument from the
 * client. `hasBid` decides whether the late-entry floor applies, so a client
 * able to assert it could enter round 6 at +2 points instead of +60.
 */
export async function getRoomState(
  lotId: string,
  viewerUserId: number | null,
): Promise<RoomState | null> {
  const row = await queryOne<LotRow>(
    `SELECT ${LOT_COLUMNS} FROM lots l JOIN auctions a ON a.lot_id = l.id WHERE l.id = $1`,
    [lotId],
  );
  if (!row) return null;

  const live = settle(engineStateOf(row), Date.now());

  /*
   * A lot that has not opened has no room. Returning null rather than a
   * RoomState with outcome coerced to "running" keeps the type honest: the
   * page renders LotPreview for anything not live, and the SSE endpoint 404s
   * instead of streaming a clock that has not started.
   */
  if (live.outcome === "scheduled") return null;

  const [bids, participant] = await Promise.all([
    recentBids(lotId, viewerUserId),
    viewerUserId === null
      ? Promise.resolve(null)
      : queryOne<{ first_bid_at: Date | null }>(
          "SELECT first_bid_at FROM lot_participants WHERE lot_id = $1 AND user_id = $2",
          [lotId, viewerUserId],
        ),
  ]);

  return {
    serverNow: Date.now(),
    lot: toLot(row, live),
    round: live.round,
    currentPts: live.currentPts,
    leader: live.leaderPaddle,
    bidClockEndsAt: live.bidClockEndsAt,
    roundEndsAt: live.roundEndsAt,
    bids,
    hasBid: participant?.first_bid_at != null,
    outcome: live.outcome,
  };
}
