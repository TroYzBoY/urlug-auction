import "server-only";
import type { PoolClient } from "pg";
import { getPool, query, transaction } from "../db";
import { reportError } from "../observability";
import { sendDirect } from "../sms";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * NOTIFICATIONS — an outbox, not a send-and-hope
 *
 * A row is written inside the transaction that caused it; a worker delivers it
 * afterwards. Two properties fall out of that, and both matter here:
 *
 *   • A notification can never describe a bid that rolled back. Sending from
 *     inside the request would have told a bidder they were outbid by a bid the
 *     database then discarded.
 *   • An SMS gateway being down delays delivery rather than losing it. Sending
 *     inline would also mean a bid request waiting on somebody else's HTTP.
 *
 * ── Deduplication ────────────────────────────────────────────────────────────
 *
 * `dedupe_key` is unique per user. Round 6's clock is five seconds, so a bidder
 * in a duel can be outbid eleven times in ten seconds; without a key that
 * collapses them, that is eleven text messages and a bill to match. The key for
 * "you were outbid" is per lot and per round, so a bidder hears once per round.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Channel = "sms" | "inapp";

export interface NotifyInput {
  userId: number;
  channel: Channel;
  /** Stable dotted name: "bid.outbid", "lot.won", "lot.opening". */
  kind: string;
  body: string;
  href?: string | null;
  /** Unique per user. Two events that should become one message share it. */
  dedupeKey: string;
}

/**
 * Queues a notification inside the caller's transaction.
 *
 * ON CONFLICT DO NOTHING against the dedupe index, so a duplicate is silently
 * dropped rather than aborting the transaction that was placing a bid.
 */
export async function enqueue(
  client: PoolClient,
  input: NotifyInput,
): Promise<void> {
  await client.query(
    `INSERT INTO notifications (user_id, channel, kind, body, href, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
    [
      input.userId,
      input.channel,
      input.kind,
      input.body,
      input.href ?? null,
      input.dedupeKey,
    ],
  );
}

/** Queues on its own connection, for callers with no transaction to join. */
export async function enqueueDetached(input: NotifyInput): Promise<void> {
  try {
    await getPool().query(
      `INSERT INTO notifications (user_id, channel, kind, body, href, dedupe_key)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
      [
        input.userId,
        input.channel,
        input.kind,
        input.body,
        input.href ?? null,
        input.dedupeKey,
      ],
    );
  } catch (err) {
    reportError(err, { event: "notification.enqueue_failed", kind: input.kind });
  }
}

const MAX_ATTEMPTS = 3;

/**
 * Delivers pending notifications. Called by the ticker.
 *
 * `FOR UPDATE SKIP LOCKED` is what makes this safe to run from more than one
 * process: each picks a disjoint batch instead of every worker sending the same
 * message. The ticker is currently a single elected leader, so it is belt and
 * braces — but it is the difference between "safe" and "safe by accident".
 */
export async function deliverPending(batch = 50): Promise<number> {
  return transaction(async (client) => {
    const due = await client.query<{
      id: number;
      channel: Channel;
      body: string;
      attempts: number;
      phone: string;
      status: string;
    }>(
      `SELECT n.id, n.channel, n.body, n.attempts, u.phone, u.status
         FROM notifications n
         JOIN users u ON u.id = n.user_id
        WHERE n.status = 'pending'
        ORDER BY n.id
        LIMIT $1
          FOR UPDATE OF n SKIP LOCKED`,
      [batch],
    );

    let sent = 0;

    for (const row of due.rows) {
      /*
       * In-app notifications are "delivered" by existing — the bidder reads
       * them on the site. Only SMS leaves the building.
       */
      if (row.channel === "inapp") {
        await client.query(
          "UPDATE notifications SET status = 'sent', sent_at = now() WHERE id = $1",
          [row.id],
        );
        sent += 1;
        continue;
      }

      // A suspended or closed account should not be texted.
      if (row.status !== "active") {
        await client.query(
          "UPDATE notifications SET status = 'skipped' WHERE id = $1",
          [row.id],
        );
        continue;
      }

      try {
        await sendDirect(row.phone, row.body);
        await client.query(
          "UPDATE notifications SET status = 'sent', sent_at = now() WHERE id = $1",
          [row.id],
        );
        sent += 1;
      } catch (err) {
        const attempts = row.attempts + 1;
        await client.query(
          `UPDATE notifications
              SET attempts = $2,
                  status = CASE WHEN $2 >= $3 THEN 'failed'::notification_status
                                ELSE 'pending'::notification_status END
            WHERE id = $1`,
          [row.id, attempts, MAX_ATTEMPTS],
        );
        reportError(err, {
          event: "notification.send_failed",
          notificationId: row.id,
          attempts,
        });
      }
    }

    return sent;
  });
}

export interface InboxRow {
  id: number;
  kind: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

export async function inbox(userId: number, limit = 30): Promise<InboxRow[]> {
  const rows = await query<{
    id: number;
    kind: string;
    body: string;
    href: string | null;
    read_at: Date | null;
    created_at: Date;
  }>(
    `SELECT id, kind, body, href, read_at, created_at
       FROM notifications WHERE user_id = $1 ORDER BY id DESC LIMIT $2`,
    [userId, limit],
  );

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    body: r.body,
    href: r.href,
    readAt: r.read_at?.toISOString() ?? null,
    createdAt: r.created_at.toISOString(),
  }));
}

export async function markAllRead(userId: number): Promise<void> {
  await query(
    "UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL",
    [userId],
  );
}

export async function unreadCount(userId: number): Promise<number> {
  const rows = await query<{ count: number }>(
    "SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL",
    [userId],
  );
  return rows[0]?.count ?? 0;
}

/** Old delivered notifications are dead weight. Swept hourly. */
export async function sweepNotifications(): Promise<void> {
  await query(
    `DELETE FROM notifications
      WHERE created_at < now() - interval '90 days'
        AND status IN ('sent', 'skipped', 'failed')`,
  );
}
