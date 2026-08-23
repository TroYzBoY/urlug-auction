import "server-only";
import { query } from "../db";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MONEY EXPORT
 *
 * Three flat tables an accountant can work with: what was paid in, what is owed
 * on won lots, and every movement of points behind both.
 *
 * ── Why the queries live here and not in admin.ts ────────────────────────────
 *
 * admin.ts answers "what should the dashboard show" and is bounded to what fits
 * on a screen. These answer "give me everything" and are bounded only by a row
 * limit, which is a different shape of query with a different cost. Mixing them
 * would mean the dashboard's page load quietly grew a full table scan.
 *
 * ⚠ Every row here carries a phone number. The export is an admin-only route
 * and is written to the audit log when it runs — a file of every bidder's
 * contact details leaving the building should leave a trace of who took it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/*
 * A ceiling rather than pagination. An export is one request that has to finish
 * inside a response, and a house with more than fifty thousand topups has
 * outgrown a download button and wants a replica to query.
 */
const CAP = 50_000;

export interface TopupExportRow {
  id: number;
  createdAt: Date;
  paidAt: Date | null;
  paddle: string;
  name: string;
  phone: string;
  points: number;
  amountMnt: number;
  status: string;
  provider: string;
  providerRef: string | null;
  reference: string;
}

/** Money in: every point purchase, whatever became of it. */
export async function topupRows(limit = CAP): Promise<TopupExportRow[]> {
  return query<TopupExportRow>(
    `
    SELECT t.id, t.created_at AS "createdAt", t.paid_at AS "paidAt",
           u.paddle, u.name, u.phone,
           t.points, t.amount_mnt AS "amountMnt", t.status::text,
           t.provider, t.provider_ref AS "providerRef", t.reference
      FROM topups t
      JOIN users u ON u.id = t.user_id
     ORDER BY t.id DESC
     LIMIT $1
    `,
    [limit],
  );
}

export interface SettlementExportRow {
  lotId: string;
  code: string;
  title: string;
  paddle: string;
  name: string;
  phone: string;
  hammerPts: number;
  status: string;
  dueBy: Date;
  paidAt: Date | null;
  note: string | null;
}

/** What winners owe, and whether they have paid it. */
export async function settlementRows(
  limit = CAP,
): Promise<SettlementExportRow[]> {
  return query<SettlementExportRow>(
    `
    SELECT s.lot_id AS "lotId", l.code, l.title,
           u.paddle, u.name, u.phone,
           s.hammer_pts AS "hammerPts", s.status::text,
           s.due_by AS "dueBy", s.paid_at AS "paidAt", s.note
      FROM settlements s
      JOIN lots  l ON l.id = s.lot_id
      JOIN users u ON u.id = s.user_id
     ORDER BY s.due_by DESC
     LIMIT $1
    `,
    [limit],
  );
}

export interface LedgerExportRow {
  id: number;
  createdAt: Date;
  paddle: string;
  name: string;
  phone: string;
  deltaPts: number;
  kind: string;
  refType: string | null;
  refId: string | null;
  memo: string | null;
}

/**
 * Every movement of points, newest first.
 *
 * This is the table the other two reconcile against: a balance is the sum of
 * these rows, and `reconcileBalances` exists because a cached total that
 * disagrees with them is money appearing or vanishing.
 */
export async function ledgerRows(limit = CAP): Promise<LedgerExportRow[]> {
  return query<LedgerExportRow>(
    `
    SELECT e.id, e.created_at AS "createdAt",
           u.paddle, u.name, u.phone,
           e.delta_pts AS "deltaPts", e.kind,
           e.ref_type AS "refType", e.ref_id AS "refId", e.memo
      FROM ledger_entries e
      JOIN users u ON u.id = e.user_id
     ORDER BY e.id DESC
     LIMIT $1
    `,
    [limit],
  );
}
