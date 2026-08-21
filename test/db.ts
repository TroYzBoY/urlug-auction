import { readFileSync, existsSync } from "node:fs";
import { Client } from "pg";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * INTEGRATION TEST HARNESS
 *
 * These tests run against a real Postgres, because the things they check —
 * `SELECT ... FOR UPDATE` actually serialising, a unique index actually
 * catching a duplicate, a CHECK constraint actually refusing an overdraw —
 * have no meaning against a mock. A mocked row lock always works.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Minimal .env reader.
 *
 * Next.js loads .env.local itself, but Vitest is not Next.js. Rather than take
 * a dotenv dependency for six lines, this parses the handful of `KEY=value`
 * pairs the tests need. It does not handle quoting or multi-line values — if a
 * variable ever needs those, reach for dotenv instead of extending this.
 */
export function loadEnvFile(path = ".env.local"): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    // Real environment variables win, so CI can override the file.
    process.env[key] ??= value;
  }
}

/**
 * The connection string these tests are allowed to destroy.
 *
 * ⚠ The name check is not paranoia. `resetDatabase` TRUNCATEs every table, and
 * the difference between the test database and the development one is a single
 * character in a URL that gets copy-pasted between terminals. Refusing anything
 * not named `*_test` is the guard that makes running these safe by default.
 */
export function testDatabaseUrl(): string {
  loadEnvFile();
  const url =
    process.env.TEST_DATABASE_URL ??
    "postgres://maison:maison@localhost:5432/maison_test";

  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) {
    throw new Error(
      `Refusing to run integration tests against "${name}". These tests ` +
        "TRUNCATE every table; the database name must end in _test. " +
        "Set TEST_DATABASE_URL.",
    );
  }
  return url;
}

/** Applies db/schema.sql. Idempotent, so it is safe on every run. */
export async function applySchema(url: string): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(readFileSync("db/schema.sql", "utf8"));
  } finally {
    await client.end();
  }
}

/**
 * Empties every table between tests.
 *
 * TRUNCATE rather than DELETE, and not only for speed: `bids` and
 * `ledger_entries` carry a BEFORE DELETE trigger that raises, because they are
 * append-only. TRUNCATE fires statement-level TRUNCATE triggers, of which there
 * are none, so it is the only way to clear them — which is exactly the property
 * that makes those tables trustworthy in production.
 */
export async function resetDatabase(url: string): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`
      TRUNCATE users, sessions, otp_codes, lots, auctions, bids,
               lot_participants, ledger_entries, balances, audit_log,
               rate_limits, contact_messages
      RESTART IDENTITY CASCADE
    `);
  } finally {
    await client.end();
  }
}

/** A lot and its auction, opened `openedMsAgo` ago and running. */
export async function seedRunningLot(
  url: string,
  opts: {
    lotId: string;
    openingPts?: number;
    currentPts?: number;
    round?: number;
    openedMsAgo?: number;
    bidClockMsFromNow?: number;
    leaderPaddle?: string | null;
  },
): Promise<void> {
  const {
    lotId,
    openingPts = 1200,
    currentPts = openingPts,
    round = 1,
    openedMsAgo = 60_000,
    bidClockMsFromNow = 300_000,
    leaderPaddle = null,
  } = opts;

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const opensAt = new Date(Date.now() - openedMsAgo);

    await client.query(
      `INSERT INTO lots (id, code, title, maker, year, category, note, provenance,
                         condition, dimensions, estimate_low_pts, estimate_high_pts,
                         opening_pts, starts_at)
       VALUES ($1, $2, 'Тест лот', 'Тодорхойгүй', '2026', 'antique', '', '', '', '',
               $3, $4, $3, $5)
       ON CONFLICT (id) DO NOTHING`,
      [lotId, `ЛОТ ${lotId}`, openingPts, openingPts * 2, opensAt],
    );

    await client.query(
      `INSERT INTO auctions (lot_id, opens_at, round, current_pts, leader_paddle,
                             bid_clock_ends_at, round_ends_at, outcome)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'running')
       ON CONFLICT (lot_id) DO UPDATE SET
         opens_at = EXCLUDED.opens_at, round = EXCLUDED.round,
         current_pts = EXCLUDED.current_pts, leader_paddle = EXCLUDED.leader_paddle,
         bid_clock_ends_at = EXCLUDED.bid_clock_ends_at,
         round_ends_at = EXCLUDED.round_ends_at, outcome = 'running'`,
      [
        lotId,
        opensAt,
        round,
        currentPts,
        leaderPaddle,
        new Date(Date.now() + bidClockMsFromNow),
        // Far enough out that the round clock never fires mid-test. Round
        // advancement has its own coverage in auction-engine.test.ts.
        new Date(Date.now() + 60 * 60_000),
      ],
    );
  } finally {
    await client.end();
  }
}

/** A verified, active bidder with a balance. Returns their id and paddle. */
export async function seedUser(
  url: string,
  opts: { phone: string; paddle: string; balancePts?: number },
): Promise<{ id: number; paddle: string }> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const res = await client.query<{ id: number }>(
      `INSERT INTO users (name, phone, password_hash, paddle, phone_verified_at)
       VALUES ('Тест хэрэглэгч', $1, 'x', $2, now())
       RETURNING id`,
      [opts.phone, opts.paddle],
    );
    const id = res.rows[0]!.id;

    await client.query("INSERT INTO balances (user_id, pts) VALUES ($1, $2)", [
      id,
      opts.balancePts ?? 1000,
    ]);

    return { id, paddle: opts.paddle };
  } finally {
    await client.end();
  }
}
