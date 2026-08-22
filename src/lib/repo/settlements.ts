import "server-only";
import type { PoolClient } from "pg";
import { query, transaction } from "../db";
import { record } from "../audit";
import { enqueue } from "./notifications";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT A WINNER OWES
 *
 * Separate from the auction row on purpose. The auction says who won and at
 * what price and never changes again; this says whether they have paid, which
 * is a different question with a longer and messier lifecycle.
 *
 * ── Why nothing is charged automatically ─────────────────────────────────────
 *
 * The hammer price is not deducted from the winner's balance when the clock
 * hits zero. It is almost always more than the points they hold — the whole
 * format is designed to sell a lot below its estimate — so an automatic charge
 * would either overdraw the account or fail silently at the exact moment a
 * legal obligation begins. Instead the obligation is recorded, the winner is
 * told, and payment is a deliberate step.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Terms give the winner seven working days; nine calendar days covers one weekend. */
const DUE_DAYS = 9;

/**
 * Records what a winner owes and tells them. Idempotent per lot.
 *
 * Called from the ticker in the same transaction that settles the auction, so a
 * sold lot and its settlement come into existence together — a hammer with no
 * invoice is a lot nobody is chasing.
 */
export async function openSettlement(
  client: PoolClient,
  lotId: string,
  userId: number,
  hammerPts: number,
  lotCode: string,
): Promise<void> {
  const inserted = await client.query(
    `INSERT INTO settlements (lot_id, user_id, hammer_pts, due_by)
     VALUES ($1, $2, $3, now() + ($4 || ' days')::interval)
     ON CONFLICT (lot_id) DO NOTHING`,
    [lotId, userId, hammerPts, String(DUE_DAYS)],
  );
  // Already opened — the ticker re-settling the same lot must not re-notify.
  if (inserted.rowCount === 0) return;

  await enqueue(client, {
    userId,
    channel: "sms",
    kind: "lot.won",
    body:
      `MAISON: Баяр хүргэе — ${lotCode} лотыг ${hammerPts} оноогоор та авлаа. ` +
      `${DUE_DAYS} хоногийн дотор бидэнтэй холбогдоно уу.`,
    href: "/profile",
    dedupeKey: `won:${lotId}`,
  });

  await record(client, {
    actorUserId: userId,
    action: "settlement.opened",
    targetType: "lot",
    targetId: lotId,
    detail: { hammerPts, dueDays: DUE_DAYS },
  });
}

export type SettleResult =
  | { ok: true }
  | { ok: false; reason: "not-found" | "already-resolved" };

/**
 * Marks a settlement paid, waived or forfeited.
 *
 * Admin-only; the caller checks. Payment is taken outside the system — bank
 * transfer, in person — so this records a fact rather than moving points.
 */
export async function resolveSettlement(
  lotId: string,
  status: "paid" | "waived" | "forfeited",
  note: string,
  actorUserId: number,
): Promise<SettleResult> {
  return transaction(async (client) => {
    const res = await client.query<{ status: string; user_id: number }>(
      "SELECT status, user_id FROM settlements WHERE lot_id = $1 FOR UPDATE",
      [lotId],
    );
    const row = res.rows[0];
    if (!row) return { ok: false, reason: "not-found" };
    if (row.status !== "due") return { ok: false, reason: "already-resolved" };

    await client.query(
      `UPDATE settlements
          SET status = $2::settlement_status,
              paid_at = CASE WHEN $2 = 'paid' THEN now() ELSE NULL END,
              note = $3, updated_at = now()
        WHERE lot_id = $1`,
      [lotId, status, note],
    );

    await record(client, {
      actorUserId,
      action: `settlement.${status}`,
      targetType: "lot",
      targetId: lotId,
      detail: { note, winnerUserId: row.user_id },
    });

    return { ok: true };
  });
}

export interface SettlementRow {
  lotId: string;
  code: string;
  title: string;
  paddle: string;
  userId: number;
  hammerPts: number;
  status: "due" | "paid" | "waived" | "forfeited";
  dueBy: string;
  overdue: boolean;
}

export async function outstanding(): Promise<SettlementRow[]> {
  const rows = await query<{
    lot_id: string;
    code: string;
    title: string;
    paddle: string;
    user_id: number;
    hammer_pts: number;
    status: SettlementRow["status"];
    due_by: Date;
    overdue: boolean;
  }>(
    `SELECT s.lot_id, l.code, l.title, u.paddle, s.user_id, s.hammer_pts,
            s.status, s.due_by, (s.due_by < now() AND s.status = 'due') AS overdue
       FROM settlements s
       JOIN lots  l ON l.id = s.lot_id
       JOIN users u ON u.id = s.user_id
      ORDER BY s.status = 'due' DESC, s.due_by ASC
      LIMIT 200`,
  );

  return rows.map((r) => ({
    lotId: r.lot_id,
    code: r.code,
    title: r.title,
    paddle: r.paddle,
    userId: r.user_id,
    hammerPts: r.hammer_pts,
    status: r.status,
    dueBy: r.due_by.toISOString(),
    overdue: r.overdue,
  }));
}

export async function forUser(userId: number): Promise<SettlementRow[]> {
  const rows = await query<{
    lot_id: string;
    code: string;
    title: string;
    paddle: string;
    hammer_pts: number;
    status: SettlementRow["status"];
    due_by: Date;
    overdue: boolean;
  }>(
    `SELECT s.lot_id, l.code, l.title, u.paddle, s.hammer_pts, s.status, s.due_by,
            (s.due_by < now() AND s.status = 'due') AS overdue
       FROM settlements s
       JOIN lots  l ON l.id = s.lot_id
       JOIN users u ON u.id = s.user_id
      WHERE s.user_id = $1
      ORDER BY s.created_at DESC`,
    [userId],
  );

  return rows.map((r) => ({
    lotId: r.lot_id,
    code: r.code,
    title: r.title,
    paddle: r.paddle,
    userId,
    hammerPts: r.hammer_pts,
    status: r.status,
    dueBy: r.due_by.toISOString(),
    overdue: r.overdue,
  }));
}
