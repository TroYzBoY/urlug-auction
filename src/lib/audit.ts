import "server-only";
import type { PoolClient } from "pg";
import { getPool } from "./db";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * AUDIT LOG
 *
 * Every bid, every movement of money, every administrative action. The question
 * this table exists to answer is "what actually happened to lot 014 between
 * 14:02 and 14:03", asked by someone who is not inclined to take our word for
 * it.
 *
 * Two ways in:
 *
 *   `record`   — joins the caller's transaction. Use this whenever the audit
 *                row must live or die with the thing it describes. A bid that
 *                commits without its audit row, or an audit row for a bid that
 *                rolled back, are both worse than no log at all.
 *
 *   `recordDetached` — its own connection, fire-and-forget. Only for events
 *                with no transaction to join (a failed login, a rejected bid),
 *                where losing the row costs nothing.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface AuditEvent {
  actorUserId?: number | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  detail?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

const INSERT = `
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, detail, ip, user_agent)
  VALUES ($1, $2, $3, $4, $5, $6, $7)
`;

function params(e: AuditEvent) {
  return [
    e.actorUserId ?? null,
    e.action,
    e.targetType ?? null,
    e.targetId ?? null,
    e.detail === undefined ? null : JSON.stringify(e.detail),
    e.ip ?? null,
    e.userAgent ?? null,
  ];
}

/** Writes inside an existing transaction. Throws, so the caller rolls back. */
export function record(client: PoolClient, e: AuditEvent): Promise<unknown> {
  return client.query(INSERT, params(e));
}

/**
 * Writes on its own connection and swallows failures.
 *
 * Deliberate: this is called on paths that are already handling an error, and
 * a failed audit write must not replace the real error with a database error in
 * the user's face.
 */
export function recordDetached(e: AuditEvent): void {
  getPool().query(INSERT, params(e)).catch((err) => {
    console.error("[audit] write failed", e.action, err);
  });
}
