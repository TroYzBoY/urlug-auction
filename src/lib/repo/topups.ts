import "server-only";
import { randomBytes } from "node:crypto";
import { query, queryOne, transaction } from "../db";
import { record } from "../audit";
import { POINT_MNT } from "../auction";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * BUYING POINTS
 *
 * Three steps, and the middle one is somebody else's system:
 *
 *   1. `createTopup`  — a `pending` row, before the provider is contacted
 *   2. the provider   — the bidder pays, out of our control
 *   3. `settleTopup`  — the provider tells us; points are credited
 *
 * Step 1 exists so that "the money left my account but the points never
 * arrived" has a record to investigate. Without it, a payment that fails
 * between the redirect and the callback leaves no trace on our side at all, and
 * the bidder's bank statement is the only evidence either party has.
 *
 * ⚠ The provider itself is a seam — see `src/lib/payments.ts`. Wiring QPay
 * needs merchant credentials, which are not in this repository.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface Package {
  /** Points credited. */
  points: number;
  /** Price in ₮. */
  amountMnt: number;
  /** Marketing label, e.g. "Хамгийн түгээмэл". */
  tag?: string;
}

/**
 * What a bidder can buy.
 *
 * Priced at face value — 1 point costs exactly `POINT_MNT` — with no discount
 * for buying more. That is a deliberate choice for an auction house rather than
 * an oversight: volume discounts on the currency you bid with quietly change
 * what a lot cost different bidders, and the hammer price stops meaning one
 * thing. If commercial reality demands tiers, change them here; nothing else
 * reads these numbers.
 */
export const PACKAGES: readonly Package[] = [
  { points: 25, amountMnt: 25 * POINT_MNT },
  { points: 60, amountMnt: 60 * POINT_MNT, tag: "Түгээмэл" },
  { points: 150, amountMnt: 150 * POINT_MNT },
  { points: 400, amountMnt: 400 * POINT_MNT },
] as const;

export function findPackage(points: number): Package | null {
  return PACKAGES.find((p) => p.points === points) ?? null;
}

/** Pending top-ups expire, so an abandoned one does not sit forever. */
const EXPIRY_MINUTES = 30;

export interface TopupRow {
  id: number;
  points: number;
  amountMnt: number;
  status: "pending" | "paid" | "failed" | "expired";
  reference: string;
  providerRef: string | null;
  createdAt: string;
  paidAt: string | null;
}

function toRow(r: {
  id: number;
  points: number;
  amount_mnt: number;
  status: TopupRow["status"];
  reference: string;
  provider_ref: string | null;
  created_at: Date;
  paid_at: Date | null;
}): TopupRow {
  return {
    id: r.id,
    points: r.points,
    amountMnt: r.amount_mnt,
    status: r.status,
    reference: r.reference,
    providerRef: r.provider_ref,
    createdAt: r.created_at.toISOString(),
    paidAt: r.paid_at?.toISOString() ?? null,
  };
}

/**
 * Opens a top-up. The price comes from `PACKAGES`, never from the request —
 * a client that could name its own `amountMnt` could buy 400 points for one
 * tögrög.
 */
export async function createTopup(
  userId: number,
  points: number,
  ip: string | null,
): Promise<{ ok: true; topup: TopupRow } | { ok: false; reason: "bad-package" }> {
  const pkg = findPackage(points);
  if (!pkg) return { ok: false, reason: "bad-package" };

  return transaction(async (client) => {
    // Ours, and unguessable: it is sent to the provider and comes back in a
    // callback, so a sequential id would let anyone settle anyone's top-up.
    const reference = `mn-${randomBytes(12).toString("hex")}`;

    const res = await client.query<Parameters<typeof toRow>[0]>(
      `INSERT INTO topups (user_id, points, amount_mnt, reference, expires_at)
       VALUES ($1, $2, $3, $4, now() + ($5 || ' minutes')::interval)
       RETURNING id, points, amount_mnt, status, reference, provider_ref, created_at, paid_at`,
      [userId, pkg.points, pkg.amountMnt, reference, String(EXPIRY_MINUTES)],
    );

    await record(client, {
      actorUserId: userId,
      action: "topup.created",
      targetType: "topup",
      targetId: reference,
      detail: { points: pkg.points, amountMnt: pkg.amountMnt },
      ip,
    });

    return { ok: true as const, topup: toRow(res.rows[0]!) };
  });
}

export type SettleResult =
  | { ok: true; credited: boolean; points: number }
  | { ok: false; reason: "not-found" | "expired" | "already-failed" };

/**
 * Marks a top-up paid and credits the points, in one transaction.
 *
 * Idempotent by construction. The row is locked and its status checked inside
 * the transaction, so a callback delivered three times — which every payment
 * provider does eventually — credits once and reports `credited: false` for the
 * other two.
 */
export async function settleTopup(
  reference: string,
  providerRef: string,
): Promise<SettleResult> {
  return transaction(async (client) => {
    const res = await client.query<{
      id: number;
      user_id: number;
      points: number;
      status: TopupRow["status"];
      expired: boolean;
    }>(
      `SELECT id, user_id, points, status, (expires_at <= now()) AS expired
         FROM topups WHERE reference = $1 FOR UPDATE`,
      [reference],
    );
    const topup = res.rows[0];
    if (!topup) return { ok: false, reason: "not-found" };

    // Already settled: report success without moving money again.
    if (topup.status === "paid") {
      return { ok: true, credited: false, points: topup.points };
    }
    if (topup.status === "failed") return { ok: false, reason: "already-failed" };
    if (topup.expired) {
      await client.query(
        "UPDATE topups SET status = 'expired', updated_at = now() WHERE id = $1",
        [topup.id],
      );
      return { ok: false, reason: "expired" };
    }

    await client.query(
      `UPDATE topups SET status = 'paid', provider_ref = $2, paid_at = now(),
                         updated_at = now()
        WHERE id = $1`,
      [topup.id, providerRef],
    );

    /*
     * The ledger insert and the balance update happen here rather than through
     * `credit()` in users.ts, because both must join THIS transaction — the
     * one holding the lock on the top-up row. A nested transaction would
     * commit independently and could leave a paid top-up with no points.
     */
    await client.query(
      `INSERT INTO ledger_entries (user_id, delta_pts, kind, ref_type, ref_id, memo)
       VALUES ($1, $2, 'topup', 'topup', $3, 'Оноо худалдан авалт')
       ON CONFLICT DO NOTHING`,
      [topup.user_id, topup.points, reference],
    );
    await client.query(
      `UPDATE balances SET pts = pts + $2, updated_at = now() WHERE user_id = $1`,
      [topup.user_id, topup.points],
    );

    await record(client, {
      actorUserId: topup.user_id,
      action: "topup.paid",
      targetType: "topup",
      targetId: reference,
      detail: { points: topup.points, providerRef },
    });

    return { ok: true, credited: true, points: topup.points };
  });
}

export async function failTopup(reference: string, why: string): Promise<void> {
  await query(
    `UPDATE topups SET status = 'failed', updated_at = now()
      WHERE reference = $1 AND status = 'pending'`,
    [reference],
  );
  await query(
    `INSERT INTO audit_log (action, target_type, target_id, detail)
     VALUES ('topup.failed', 'topup', $1, $2)`,
    [reference, JSON.stringify({ why })],
  );
}

export async function topupHistory(
  userId: number,
  limit = 50,
): Promise<TopupRow[]> {
  const rows = await query<Parameters<typeof toRow>[0]>(
    `SELECT id, points, amount_mnt, status, reference, provider_ref, created_at, paid_at
       FROM topups WHERE user_id = $1 ORDER BY id DESC LIMIT $2`,
    [userId, limit],
  );
  return rows.map(toRow);
}

export async function findTopup(reference: string): Promise<TopupRow | null> {
  const row = await queryOne<Parameters<typeof toRow>[0]>(
    `SELECT id, points, amount_mnt, status, reference, provider_ref, created_at, paid_at
       FROM topups WHERE reference = $1`,
    [reference],
  );
  return row ? toRow(row) : null;
}

/** Sweeps abandoned top-ups. Called hourly by the ticker. */
export async function expireStaleTopups(): Promise<void> {
  await query(
    `UPDATE topups SET status = 'expired', updated_at = now()
      WHERE status = 'pending' AND expires_at <= now()`,
  );
}
