import "server-only";
import { query } from "../db";

/**
 * Following a lot.
 *
 * The point of it is the notification: a bidder who marks a lot gets told when
 * it opens, which for a 2h45m sale that starts at a scheduled time is the
 * difference between taking part and reading the result. The list itself is
 * secondary.
 */

export async function watch(userId: number, lotId: string): Promise<void> {
  await query(
    `INSERT INTO watchlist (user_id, lot_id) VALUES ($1, $2)
     ON CONFLICT (user_id, lot_id) DO NOTHING`,
    [userId, lotId],
  );
}

export async function unwatch(userId: number, lotId: string): Promise<void> {
  await query("DELETE FROM watchlist WHERE user_id = $1 AND lot_id = $2", [
    userId,
    lotId,
  ]);
}

export async function isWatching(
  userId: number,
  lotId: string,
): Promise<boolean> {
  const rows = await query(
    "SELECT 1 FROM watchlist WHERE user_id = $1 AND lot_id = $2",
    [userId, lotId],
  );
  return rows.length > 0;
}

export interface WatchedLot {
  lotId: string;
  code: string;
  title: string;
  opensAt: string;
  outcome: string;
  currentPts: number;
}

export async function watched(userId: number): Promise<WatchedLot[]> {
  const rows = await query<{
    lot_id: string;
    code: string;
    title: string;
    opens_at: Date;
    outcome: string;
    current_pts: number;
  }>(
    `SELECT w.lot_id, l.code, l.title, a.opens_at, a.outcome, a.current_pts
       FROM watchlist w
       JOIN lots     l ON l.id = w.lot_id
       JOIN auctions a ON a.lot_id = w.lot_id
      WHERE w.user_id = $1
      ORDER BY a.opens_at ASC`,
    [userId],
  );

  return rows.map((r) => ({
    lotId: r.lot_id,
    code: r.code,
    title: r.title,
    opensAt: r.opens_at.toISOString(),
    outcome: r.outcome,
    currentPts: r.current_pts,
  }));
}

/** Everyone following a lot, for the "opening soon" notification. */
export async function watchersOf(lotId: string): Promise<number[]> {
  const rows = await query<{ user_id: number }>(
    "SELECT user_id FROM watchlist WHERE lot_id = $1",
    [lotId],
  );
  return rows.map((r) => r.user_id);
}
