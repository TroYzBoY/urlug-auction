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
  l.opening_pts, l.starts_at,
  /*
   * The gallery, aggregated in the same query rather than fetched per lot.
   * A catalogue page renders a dozen lots; a second round trip each would be a
   * dozen round trips to draw one grid.
   *
   * FILTER (WHERE i.id IS NOT NULL) because a LEFT JOIN on a lot with no
   * photographs produces one all-NULL row, and array_agg would return an array
   * of length one holding null — which every caller would then have to guard.
   *
   * No backticks in this comment: LOT_COLUMNS is a template literal and one
   * would end the string.
   */
  COALESCE(
    array_agg(
      json_build_object('url', i.url, 'alt', i.alt) ORDER BY i.sort_order
    ) FILTER (WHERE i.id IS NOT NULL),
    '{}'
  ) AS images,
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
  images: { url: string; alt: string }[];
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
    images: row.images ?? [],
    status: STATUS_OF[live.outcome],
    startsAt: row.starts_at.toISOString(),
    currentPts: live.currentPts,
    ...(live.outcome === "sold"
      ? {
          hammerPts: live.currentPts,
          hammerRound: live.hammerRound ?? row.hammer_round ?? row.round,
        }
      : {}),
    bidCount: row.bid_count,
  };
}

/**
 * ⚠ Every lot read GROUPs, because the gallery is aggregated inline. The
 * `where` a caller passes has to sit before the GROUP BY, and any ordering
 * after it — which is why the helper takes the whole tail rather than just a
 * predicate.
 */
const LOT_FROM = `
  FROM lots l
  JOIN auctions a ON a.lot_id = l.id
  LEFT JOIN lot_images i ON i.lot_id = l.id
`;
const LOT_GROUP = "GROUP BY l.id, a.lot_id";

async function selectLots(where: string, params: unknown[] = []): Promise<Lot[]> {
  /* `where` may carry an ORDER BY, which must follow the GROUP BY. Splitting on
     it keeps both call styles working without every caller repeating the join. */
  const [predicate, order] = where.split(/\bORDER BY\b/);
  const rows = await query<LotRow>(
    `SELECT ${LOT_COLUMNS} ${LOT_FROM} ${predicate ?? ""} ${LOT_GROUP}` +
      (order ? ` ORDER BY ${order}` : ""),
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
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SHARED PART OF A ROOM
 *
 * Everything in `RoomState` except the two per-viewer fields. One read serves
 * every subscriber on this instance.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * The stream originally called `getRoomState` once per subscriber on every
 * push, so one bid in a room of N viewers was N round trips to Postgres.
 * Measured on this machine: 64ms to deliver with one watcher, 97ms with a
 * hundred — and that gap is linear, so a busy sale scales its own latency up
 * exactly when the clock is shortest.
 *
 * Now: one snapshot per lot per coalescing window, projected per viewer in
 * memory. Delivery stopped growing with the audience.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface RoomSnapshot {
  lot: Lot;
  round: number;
  currentPts: number;
  leader: string | null;
  bidClockEndsAt: number;
  roundEndsAt: number;
  outcome: RoomState["outcome"];
  /** Bids with their author, so `isYou` can be decided without another query. */
  bids: (Omit<Bid, "isYou"> & { userId: number })[];
}

export async function getRoomSnapshot(
  lotId: string,
): Promise<RoomSnapshot | null> {
  const row = await queryOne<LotRow>(
    `SELECT ${LOT_COLUMNS} ${LOT_FROM} WHERE l.id = $1 ${LOT_GROUP}`,
    [lotId],
  );
  if (!row) return null;

  const live = settle(engineStateOf(row), Date.now());
  if (live.outcome === "scheduled") return null;

  const rows = await query<{
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

  return {
    lot: toLot(row, live),
    round: live.round,
    currentPts: live.currentPts,
    leader: live.leaderPaddle,
    bidClockEndsAt: live.bidClockEndsAt,
    roundEndsAt: live.roundEndsAt,
    outcome: live.outcome,
    bids: rows.map((b) => ({
      id: String(b.id),
      paddle: b.paddle,
      points: b.points,
      round: b.round,
      at: b.placed_at.getTime(),
      userId: b.user_id,
    })),
  };
}

/**
 * Turns a shared snapshot into one viewer's `RoomState`. Pure, no I/O.
 *
 * `hasBid` is passed in rather than looked up: it is sticky — a bidder who has
 * bid on a lot cannot un-bid — so the stream reads it once at connect and flips
 * it to true when a bid of theirs appears. That keeps the per-push cost at zero
 * queries without ever reporting it wrongly, which matters because `hasBid`
 * decides whether the late-entry floor applies.
 */
export function projectForViewer(
  snapshot: RoomSnapshot,
  viewerUserId: number | null,
  hasBid: boolean,
): RoomState {
  return {
    serverNow: Date.now(),
    lot: snapshot.lot,
    round: snapshot.round,
    currentPts: snapshot.currentPts,
    leader: snapshot.leader,
    bidClockEndsAt: snapshot.bidClockEndsAt,
    roundEndsAt: snapshot.roundEndsAt,
    bids: snapshot.bids.map(({ userId, ...bid }) => ({
      ...bid,
      isYou: viewerUserId !== null && userId === viewerUserId,
    })),
    hasBid,
    outcome: snapshot.outcome,
  };
}

/** Whether this viewer has bid on this lot. Read once, at connect. */
export async function hasBidOnLot(
  lotId: string,
  viewerUserId: number,
): Promise<boolean> {
  const row = await queryOne<{ first_bid_at: Date | null }>(
    "SELECT first_bid_at FROM lot_participants WHERE lot_id = $1 AND user_id = $2",
    [lotId, viewerUserId],
  );
  return row?.first_bid_at != null;
}

/**
 * Everything the room renders from, for one viewer.
 *
 * `viewerUserId` is what makes `hasBid` and `isYou` correct, and it is read
 * from the session on the server — never accepted as an argument from the
 * client. `hasBid` decides whether the late-entry floor applies, so a client
 * able to assert it could enter round 6 at +2 points instead of +60.
 *
 * Used for the SERVER-RENDERED first paint. The stream uses `getRoomSnapshot`
 * plus `projectForViewer` instead, so one push costs one query rather than one
 * per subscriber.
 */
export async function getRoomState(
  lotId: string,
  viewerUserId: number | null,
): Promise<RoomState | null> {
  const row = await queryOne<LotRow>(
    `SELECT ${LOT_COLUMNS} ${LOT_FROM} WHERE l.id = $1 ${LOT_GROUP}`,
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
