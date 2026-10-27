import "server-only";
import { query, queryOne } from "../db";

/**
 * The two things the catalogue's front page reads that no other page does:
 * where each live lot stands right now, and a few house totals.
 */

export interface LivePrice {
  id: string;
  currentPts: number;
  bidCount: number;
  round: number;
  /** Epoch ms. */
  bidClockEndsAt: number;
}

/** Every running lot's standing price and clock — one indexed scan. */
export async function livePrices(): Promise<LivePrice[]> {
  const rows = await query<{
    lot_id: string;
    current_pts: number;
    bid_count: number;
    round: number;
    bid_clock_ends_at: Date;
  }>(
    `SELECT lot_id, current_pts, bid_count, round, bid_clock_ends_at
       FROM auctions
      WHERE outcome = 'running'`,
  );
  return rows.map((r) => ({
    id: r.lot_id,
    currentPts: r.current_pts,
    bidCount: r.bid_count,
    round: r.round,
    bidClockEndsAt: new Date(r.bid_clock_ends_at).getTime(),
  }));
}

export interface HouseStats {
  lots: number;
  /** Bids placed in the last 24 hours, on any lot. */
  bidsToday: number;
  /** Distinct people who have ever entered a lot. */
  bidders: number;
}

export async function houseStats(): Promise<HouseStats> {
  const row = await queryOne<{
    lots: string;
    bids_today: string;
    bidders: string;
  }>(
    `SELECT (SELECT count(*) FROM lots) AS lots,
            (SELECT count(*) FROM bids
              WHERE placed_at > now() - interval '24 hours') AS bids_today,
            (SELECT count(DISTINCT user_id) FROM lot_participants) AS bidders`,
  );
  /* count() comes back from pg as a string (bigint), hence Number(). */
  return {
    lots: Number(row?.lots ?? 0),
    bidsToday: Number(row?.bids_today ?? 0),
    bidders: Number(row?.bidders ?? 0),
  };
}
