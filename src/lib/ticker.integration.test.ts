import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import {
  applySchema,
  resetDatabase,
  seedRunningLot,
  seedUser,
  testDatabaseUrl,
} from "../../test/db";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TICKER, DRIVEN FROM OUTSIDE — against a real Postgres
 *
 * `tickFor` is what /api/cron/tick runs on Vercel, where nothing else watches
 * the clocks. What it has to get right exists only in the database:
 *
 *   • a clock that runs out DURING the call is hammered by it, at the loop's
 *     250ms rather than at pg_cron's next second
 *   • anyone else holding the ticker's lock — an overlapping call, or a server
 *     running `startTicker` — makes it do nothing at all
 *   • it lets go once nothing is near, and gives the lock back when it does
 * ─────────────────────────────────────────────────────────────────────────────
 */

const url = testDatabaseUrl();
process.env.DATABASE_URL = url;

/* Imported after DATABASE_URL is set — see the note in bids.integration.test.ts. */
let tickFor: typeof import("./ticker").tickFor;
let db: typeof import("./db") | null = null;
let query: typeof import("./db").query;

/** LOCK_KEY in ticker.ts. */
const LOCK_KEY = 0x4d41_4930;
const LOT = "910";

beforeAll(async () => {
  await applySchema(url);
  ({ tickFor } = await import("./ticker"));
  db = await import("./db");
  ({ query } = db);
});

afterAll(async () => {
  // Vitest hangs on an open pool. Guarded because beforeAll may not have got
  // this far — see the same note in bids.integration.test.ts.
  await db?.getPool().end();
});

beforeEach(async () => {
  await resetDatabase(url);
});

/**
 * A round-6 lot with one bid on it, decided by the clock, whose bid clock runs
 * out `msFromNow` from now. Round 6 because there an expiring clock ends the
 * sale; in rounds 1–5 it only moves the lot up a round.
 */
async function seedLot(msFromNow: number): Promise<void> {
  const bidder = await seedUser(url, { phone: "99110001", paddle: "Т-100" });
  await seedRunningLot(url, {
    lotId: LOT,
    currentPts: 1300,
    round: 6,
    bidClockMsFromNow: msFromNow,
    leaderPaddle: bidder.paddle,
  });
  await query("UPDATE auctions SET leader_user_id = $2 WHERE lot_id = $1", [
    LOT,
    bidder.id,
  ]);
  await query(
    `INSERT INTO bids (lot_id, user_id, paddle, points, round, idempotency_key)
     VALUES ($1, $2, $3, 1300, 6, 'seed-1300')`,
    [LOT, bidder.id, bidder.paddle],
  );
}

async function outcome(): Promise<string> {
  const [row] = await query<{ outcome: string }>(
    "SELECT outcome FROM auctions WHERE lot_id = $1",
    [LOT],
  );
  return row!.outcome;
}

describe("tickFor", () => {
  it("hammers a clock that runs out during the call, then lets go", async () => {
    await seedLot(1_500);
    expect(await outcome()).toBe("running");

    const started = Date.now();
    const report = await tickFor(10_000);
    const took = Date.now() - started;

    expect(report.leader).toBe(true);
    expect(report.settled).toBe(1);
    expect(await outcome()).toBe("sold");

    /*
     * It stayed for a clock 1.5s away rather than leaving it to the next call,
     * and left once nothing else was near rather than spending its budget.
     */
    expect(took).toBeGreaterThanOrEqual(1_500);
    expect(took).toBeLessThan(4_000);

    // The winner's message went with the call that sold the lot.
    const pending = await query(
      "SELECT 1 FROM notifications WHERE status = 'pending'",
    );
    expect(pending).toHaveLength(0);
    expect(report.sent).toBeGreaterThanOrEqual(1);
  });

  it("does nothing while anyone else holds the ticker's lock", async () => {
    await seedLot(-1_000);

    const holder = new Client({ connectionString: url });
    await holder.connect();
    try {
      await holder.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);

      const report = await tickFor(10_000);

      expect(report).toEqual({ leader: false, settled: 0, sent: 0 });
      expect(await outcome()).toBe("running");
    } finally {
      await holder.end();
    }
  });

  it("leaves at once when no clock is near, and gives the lock back", async () => {
    await seedLot(5 * 60_000);

    const started = Date.now();
    const report = await tickFor(10_000);

    expect(report).toMatchObject({ leader: true, settled: 0 });
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(await outcome()).toBe("running");

    const other = new Client({ connectionString: url });
    await other.connect();
    try {
      const res = await other.query<{ got: boolean }>(
        "SELECT pg_try_advisory_lock($1) AS got",
        [LOCK_KEY],
      );
      expect(res.rows[0]!.got).toBe(true);
    } finally {
      await other.end();
    }
  });
});
