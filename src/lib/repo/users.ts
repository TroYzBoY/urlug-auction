import "server-only";
import { randomInt } from "node:crypto";
import { query, queryOne, transaction } from "../db";
import { record } from "../audit";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ACCOUNTS AND MONEY
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface UserRow {
  id: number;
  name: string;
  phone: string;
  paddle: string;
  password_hash: string;
  status: "active" | "suspended" | "closed";
  role: "bidder" | "staff" | "admin";
  phone_verified_at: Date | null;
}

export function findByPhone(phone: string): Promise<UserRow | null> {
  return queryOne<UserRow>(
    `SELECT id, name, phone, paddle, password_hash, status, role, phone_verified_at
       FROM users WHERE phone = $1`,
    [phone],
  );
}

/**
 * A candidate paddle label, e.g. "Т-207" — what the bid feed shows instead of a
 * name.
 *
 * Random rather than sequential: a paddle derived from the user id would
 * publish both the order people signed up in and, from the highest paddle in
 * any feed, the total size of the bidder list.
 *
 * Three digits gives 900 labels; past `widenAfter` attempts the range widens to
 * four, so a registration cannot fail because the house got popular.
 */
function candidatePaddle(attempt: number): string {
  const wide = attempt >= 8;
  const base = wide ? 1000 : 100;
  const width = wide ? 9000 : 900;
  return `Т-${base + randomInt(0, width)}`;
}

export interface CreateUserArgs {
  name: string;
  phone: string;
  passwordHash: string;
  /** ISO yyyy-mm-dd. Validated as 18+ before it reaches here. */
  dateOfBirth: string;
  termsVersion: string;
  /** Every document accepted at registration, recorded individually. */
  consents: readonly { document: string; version: string }[];
  ip: string | null;
  userAgent: string | null;
}

export type CreateUserResult =
  | { ok: true; userId: number; paddle: string }
  | { ok: false; reason: "phone-taken" };

export async function createUser(
  args: CreateUserArgs,
): Promise<CreateUserResult> {
  return transaction(async (client) => {
    /*
     * ── Why the insert is the collision check ────────────────────────────
     *
     * The obvious version picks a paddle with `SELECT 1 WHERE paddle = ?` and
     * then inserts it. Between those two statements another registration can
     * take the same label, and the resulting unique violation aborts the whole
     * transaction — a 500 for someone who did nothing wrong.
     *
     * `ON CONFLICT DO NOTHING` makes the insert itself the test: it either
     * lands or declines, leaving the transaction usable either way, and a
     * decline is retried with a fresh label.
     *
     * The conflict may be on `phone` rather than `paddle`, and DO NOTHING
     * cannot say which. So a decline re-checks the phone: found means the
     * number is taken, absent means it was a paddle collision worth retrying.
     */
    let userId: number | null = null;
    let paddle = "";

    for (let attempt = 0; attempt < 12 && userId === null; attempt++) {
      paddle = candidatePaddle(attempt);

      const inserted = await client.query<{ id: number }>(
        `INSERT INTO users (name, phone, password_hash, paddle, date_of_birth,
                            terms_version, terms_accepted_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          args.name,
          args.phone,
          args.passwordHash,
          paddle,
          args.dateOfBirth,
          args.termsVersion,
        ],
      );

      if (inserted.rowCount === 1) {
        userId = inserted.rows[0]!.id;
        break;
      }

      const phoneTaken = await client.query("SELECT 1 FROM users WHERE phone = $1", [
        args.phone,
      ]);
      if (phoneTaken.rowCount === 1) return { ok: false, reason: "phone-taken" };
    }

    if (userId === null) {
      throw new Error("Could not allocate a free paddle after 12 attempts");
    }

    // A balance row from the start, so every later UPDATE has something to hit
    // and no code path has to handle "user exists but has no balance".
    await client.query("INSERT INTO balances (user_id, pts) VALUES ($1, 0)", [
      userId,
    ]);

    /*
     * One row per document, in the same transaction as the account.
     *
     * `users.terms_version` says which rules they accept now; this says which
     * text they were shown on the day they signed up. The question a regulator
     * asks is the second one, and only a history answers it — so an account
     * must not be able to exist without its consent rows.
     */
    for (const consent of args.consents) {
      await client.query(
        `INSERT INTO consents (user_id, document, version, ip)
         VALUES ($1, $2, $3, $4)`,
        [userId, consent.document, consent.version, args.ip],
      );
    }
    await client.query(
      `INSERT INTO consents (user_id, document, version, ip)
       VALUES ($1, 'age', $2, $3)`,
      [userId, args.dateOfBirth, args.ip],
    );

    await record(client, {
      actorUserId: userId,
      action: "user.registered",
      targetType: "user",
      targetId: String(userId),
      // The password hash is not in this row, and neither is the phone: the
      // audit log is read far more widely than the users table.
      detail: { paddle, termsVersion: args.termsVersion },
      ip: args.ip,
      userAgent: args.userAgent,
    });

    return { ok: true, userId, paddle };
  });
}

export async function markPhoneVerified(phone: string): Promise<void> {
  await query(
    "UPDATE users SET phone_verified_at = COALESCE(phone_verified_at, now()), updated_at = now() WHERE phone = $1",
    [phone],
  );
}

export async function setPassword(
  userId: number,
  passwordHash: string,
): Promise<void> {
  await query(
    "UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1",
    [userId, passwordHash],
  );
}

/* ── Money ───────────────────────────────────────────────────────────────── */

export async function getBalance(userId: number): Promise<number> {
  const row = await queryOne<{ pts: number }>(
    "SELECT pts FROM balances WHERE user_id = $1",
    [userId],
  );
  return row?.pts ?? 0;
}

export type LedgerKind =
  | "topup"
  | "join_fee"
  | "hammer_settlement"
  | "refund"
  | "adjustment"
  | "bonus";

export interface CreditArgs {
  userId: number;
  deltaPts: number;
  kind: LedgerKind;
  refType?: string | null;
  refId?: string | null;
  memo?: string | null;
  actorUserId?: number | null;
}

/**
 * Moves points and records why, in one transaction.
 *
 * `ledger_once_idx` makes this safe to call twice with the same
 * (kind, refType, refId): the second insert finds the conflict, declines, and
 * is reported as a no-op. That is what stops a retried payment webhook from
 * crediting a top-up twice.
 */
export async function credit(args: CreditArgs): Promise<{ applied: boolean }> {
  return transaction(async (client) => {
    /*
     * ON CONFLICT DO NOTHING rather than catching the unique violation.
     *
     * Catching it does not work: once a statement raises inside a transaction,
     * Postgres marks the whole transaction aborted and every subsequent
     * statement fails with "current transaction is aborted" — so the catch
     * would swallow the duplicate and then die on the next query. Letting the
     * insert decline to insert keeps the transaction usable.
     */
    const inserted = await client.query(
      `INSERT INTO ledger_entries (user_id, delta_pts, kind, ref_type, ref_id, memo)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        args.userId,
        args.deltaPts,
        args.kind,
        args.refType ?? null,
        args.refId ?? null,
        args.memo ?? null,
      ],
    );

    // Already applied — a retried webhook, a double-submitted top-up.
    if (inserted.rowCount === 0) return { applied: false };

    const updated = await client.query(
      `UPDATE balances SET pts = pts + $2, updated_at = now()
        WHERE user_id = $1 AND pts + $2 >= 0`,
      [args.userId, args.deltaPts],
    );
    if (updated.rowCount === 0) {
      // Rolls back the ledger row too — a movement that the balance rejected
      // must not survive as an entry, or the two stop agreeing.
      throw new Error(
        `Balance movement rejected for user ${args.userId}: ${args.deltaPts} pts would overdraw`,
      );
    }

    await record(client, {
      actorUserId: args.actorUserId ?? args.userId,
      action: `ledger.${args.kind}`,
      targetType: "user",
      targetId: String(args.userId),
      detail: { deltaPts: args.deltaPts, refType: args.refType, refId: args.refId },
    });

    return { applied: true };
  });
}

/**
 * Proves `balances` still agrees with the sum of `ledger_entries`.
 *
 * The cache exists so that reading a balance is one indexed lookup rather than
 * an aggregate over a table that grows forever. This is the check that the
 * shortcut has not drifted — run it from a scheduled job and alert on any row
 * it returns. A silent disagreement here is money appearing or vanishing.
 */
export async function reconcileBalances(): Promise<
  { user_id: number; cached: number; actual: number }[]
> {
  return query<{ user_id: number; cached: number; actual: number }>(
    `
    SELECT b.user_id, b.pts AS cached, COALESCE(SUM(l.delta_pts), 0)::int AS actual
      FROM balances b
      LEFT JOIN ledger_entries l ON l.user_id = b.user_id
     GROUP BY b.user_id, b.pts
    HAVING b.pts <> COALESCE(SUM(l.delta_pts), 0)
    `,
  );
}
