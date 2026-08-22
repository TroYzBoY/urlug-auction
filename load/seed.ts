/**
 * Fixtures for the load test: one live lot and N verified bidders with points.
 *
 *   node --env-file-if-exists=.env.local --experimental-strip-types load/seed.ts
 *
 * ⚠ Refuses to run against a database whose name does not end in `_test`, and
 * against NODE_ENV=production. It creates hundreds of accounts.
 */
import { Client } from "pg";

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
const BIDDERS = Number(process.env.LOAD_BIDDERS ?? 200);
const LOT_ID = process.env.LOAD_LOT_ID ?? "LOAD1";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed a production database.");
  process.exit(1);
}
if (!url || !new URL(url).pathname.replace(/^\//, "").endsWith("_test")) {
  console.error(
    "Set TEST_DATABASE_URL to a database whose name ends in _test. " +
      "This script creates hundreds of accounts.",
  );
  process.exit(1);
}

/* argon2id of "load-test-123", computed once — hashing 200 fixtures at 50ms
   each would add ten seconds to every run for no benefit. */
const HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$0Fj3B2CqfCHVqhTMPRSVJ0FEJq2W7dLQZmiVBIvHFRE";

const client = new Client({ connectionString: url });
await client.connect();

try {
  await client.query("BEGIN");

  await client.query("DELETE FROM lots WHERE id = $1", [LOT_ID]);
  const opensAt = new Date(Date.now() - 60_000);

  await client.query(
    `INSERT INTO lots (id, code, title, maker, year, category, note, provenance,
                       condition, dimensions, estimate_low_pts, estimate_high_pts,
                       opening_pts, starts_at)
     VALUES ($1, 'ЛОТ ACHAALAL', 'Ачааллын тест', '—', '2026', 'antique',
             '', '', '', '', 1000, 5000, 1000, $2)`,
    [LOT_ID, opensAt],
  );
  await client.query(
    `INSERT INTO auctions (lot_id, opens_at, round, current_pts,
                           bid_clock_ends_at, round_ends_at, outcome)
     VALUES ($1, $2, 1, 1000, now() + interval '30 minutes',
             now() + interval '2 hours', 'running')`,
    [LOT_ID, opensAt],
  );

  for (let i = 0; i < BIDDERS; i++) {
    const phone = `9${String(1_000_0000 + i).slice(0, 7)}`;
    const res = await client.query<{ id: number }>(
      `INSERT INTO users (name, phone, password_hash, paddle, phone_verified_at,
                          date_of_birth)
       VALUES ($1, $2, $3, $4, now(), '1995-06-15')
       ON CONFLICT (phone) DO UPDATE SET phone_verified_at = now()
       RETURNING id`,
      [`Ачаалал ${i}`, phone, HASH, `L-${10_000 + i}`],
    );
    await client.query(
      `INSERT INTO balances (user_id, pts) VALUES ($1, 100000)
       ON CONFLICT (user_id) DO UPDATE SET pts = 100000`,
      [res.rows[0]!.id],
    );
  }

  await client.query("COMMIT");
  console.info(`Seeded lot ${LOT_ID} and ${BIDDERS} bidders.`);
  console.info("Passwords are all: load-test-123");
} catch (err) {
  await client.query("ROLLBACK");
  console.error("Seed failed:", err);
  process.exitCode = 1;
} finally {
  await client.end();
}
