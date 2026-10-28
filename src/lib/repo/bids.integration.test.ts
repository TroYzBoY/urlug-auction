import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  applySchema,
  resetDatabase,
  seedRunningLot,
  seedUser,
  testDatabaseUrl,
} from "../../../test/db";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PRESSING A LOT'S BUTTON — against a real Postgres
 *
 * `auction-engine.test.ts` proves the clocks are computed correctly. This
 * proves the things that only exist in the database:
 *
 *   • `SELECT ... FOR UPDATE` really does serialise concurrent pressers, so
 *     "who pressed last" and each presser's count are never a race
 *   • the idempotency index really does collapse a retry — and its charge
 *   • the balance really cannot be overdrawn
 *   • `bids` really is append-only
 *
 * None of these can be checked against a mock. A mocked row lock always holds.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const url = testDatabaseUrl();
process.env.DATABASE_URL = url;

/*
 * Imported dynamically, after DATABASE_URL is set. `src/lib/db.ts` reads it
 * when the pool is first created; a static import at the top of the file would
 * be hoisted above the assignment above.
 */
let placeBid: typeof import("./bids").placeBid;
let db: typeof import("../db") | null = null;
let query: typeof import("../db").query;

beforeAll(async () => {
  await applySchema(url);
  ({ placeBid } = await import("./bids"));
  db = await import("../db");
  ({ query } = db);
});

afterAll(async () => {
  // Vitest hangs on an open pool. Guarded because beforeAll may not have got
  // this far — without the check, a database that is simply not running
  // reports "getPool is not a function" instead of "connection refused".
  await db?.getPool().end();
});

beforeEach(async () => {
  await resetDatabase(url);
});

const LOT = "T-001";

function args(over: Partial<Parameters<typeof placeBid>[0]> = {}) {
  return {
    lotId: LOT,
    userId: 0,
    paddle: "Т-100",
    name: "Тест",
    idempotencyKey: crypto.randomUUID(),
    ip: null,
    userAgent: null,
    ...over,
  } as Parameters<typeof placeBid>[0];
}

async function lot() {
  const [row] = await query<{
    current_pts: number;
    leader_paddle: string | null;
    bid_count: number;
  }>(
    "SELECT current_pts, leader_paddle, bid_count FROM auctions WHERE lot_id = $1",
    [LOT],
  );
  return row!;
}

async function balanceOf(userId: number) {
  const [row] = await query<{ pts: number }>(
    "SELECT pts FROM balances WHERE user_id = $1",
    [userId],
  );
  return row!.pts;
}

describe("the happy path", () => {
  it("charges the press, counts it, and makes the presser last", async () => {
    await seedRunningLot(url, { lotId: LOT, pressCostPts: 3 });
    const user = await seedUser(url, { phone: "99110001", paddle: "Т-100" });

    const res = await placeBid(args({ userId: user.id, paddle: user.paddle }));

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.count).toBe(1);

    expect(await lot()).toEqual({
      current_pts: 1,
      leader_paddle: "Т-100",
      bid_count: 1,
    });
    expect(await balanceOf(user.id)).toBe(997);

    // One press row, holding the presser's count and what it was charged …
    const [bid] = await query<{ id: number; points: number; cost_pts: number }>(
      "SELECT id, points, cost_pts FROM bids WHERE lot_id = $1",
      [LOT],
    );
    expect(bid).toMatchObject({ points: 1, cost_pts: 3 });

    // … and one ledger row, pointing at it.
    const ledger = await query<{ delta_pts: number; ref_id: string }>(
      "SELECT delta_pts, ref_id FROM ledger_entries WHERE kind = 'press'",
    );
    expect(ledger).toEqual([{ delta_pts: -3, ref_id: String(bid!.id) }]);
  });

  it("resets the bid clock to the round's full length", async () => {
    await seedRunningLot(url, { lotId: LOT, bidClockMsFromNow: 5_000 });
    const user = await seedUser(url, { phone: "99110001", paddle: "Т-100" });

    await placeBid(args({ userId: user.id, paddle: user.paddle }));

    const [auction] = await query<{ ms_left: number }>(
      `SELECT EXTRACT(EPOCH FROM (bid_clock_ends_at - now())) * 1000 AS ms_left
         FROM auctions WHERE lot_id = $1`,
      [LOT],
    );
    // Round 1's clock is five minutes. It must come from the server's `now()`,
    // never from a timestamp the client supplied.
    expect(Number(auction!.ms_left)).toBeGreaterThan(290_000);
  });

  it("records how much of the bid clock was left when the press landed", async () => {
    await seedRunningLot(url, { lotId: LOT, bidClockMsFromNow: 3_000 });
    const user = await seedUser(url, { phone: "99110001", paddle: "Т-100" });

    const res = await placeBid(args({ userId: user.id, paddle: user.paddle }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    /*
     * The clock had three seconds when seeded; the press lands a few ms
     * later. What is stored is the clock BEFORE this press reset it. It stays
     * on the row and is not sent back to the room.
     */
    const [bid] = await query<{ clock_left_ms: number }>(
      "SELECT clock_left_ms FROM bids WHERE lot_id = $1",
      [LOT],
    );
    expect(bid!.clock_left_ms).toBeGreaterThan(2_000);
    expect(bid!.clock_left_ms).toBeLessThanOrEqual(3_000);
    expect(res.bid).not.toHaveProperty("clockLeftMs");
  });
});

describe("the rules, re-enforced server-side", () => {
  it("counts each presser on their own, and the last one leads", async () => {
    await seedRunningLot(url, { lotId: LOT });
    const a = await seedUser(url, { phone: "99110001", paddle: "Т-100" });
    const b = await seedUser(url, { phone: "99110002", paddle: "Т-200" });

    for (let i = 0; i < 3; i++) {
      await placeBid(args({ userId: a.id, paddle: a.paddle }));
    }

    // Т-200's first press is their first, whatever Т-100 has reached …
    const own = await placeBid(args({ userId: b.id, paddle: b.paddle }));
    expect(own.ok).toBe(true);
    if (own.ok) expect(own.count).toBe(1);

    // … and pressing last is all it takes to lead. Three presses do not beat one.
    expect(await lot()).toEqual({
      current_pts: 4,
      leader_paddle: "Т-200",
      bid_count: 4,
    });

    const back = await placeBid(args({ userId: a.id, paddle: a.paddle }));
    if (back.ok) expect(back.count).toBe(4);
    expect(await lot()).toMatchObject({
      current_pts: 5,
      leader_paddle: "Т-100",
    });
  });

  it("refuses an unverified presser", async () => {
    await seedRunningLot(url, { lotId: LOT });
    const user = await seedUser(url, { phone: "99110001", paddle: "Т-100" });
    await query("UPDATE users SET phone_verified_at = NULL WHERE id = $1", [
      user.id,
    ]);

    const res = await placeBid(args({ userId: user.id, paddle: user.paddle }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("not-verified");
    expect(await balanceOf(user.id)).toBe(1000);
  });

  it("refuses a suspended presser", async () => {
    await seedRunningLot(url, { lotId: LOT });
    const user = await seedUser(url, { phone: "99110001", paddle: "Т-100" });
    await query("UPDATE users SET status = 'suspended' WHERE id = $1", [
      user.id,
    ]);

    const res = await placeBid(args({ userId: user.id, paddle: user.paddle }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("suspended");
  });

  it("accepts a press into the next round when the SOFT clock expired mid-request", async () => {
    /*
     * The bid clock ran out a second before this request arrived. That only
     * moves the sale up a gear, so the press lands — in round 2.
     */
    await seedRunningLot(url, { lotId: LOT, bidClockMsFromNow: -1_000 });
    const user = await seedUser(url, { phone: "99110001", paddle: "Т-100" });

    const res = await placeBid(args({ userId: user.id, paddle: user.paddle }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.round).toBe(2);

    const [auction] = await query<{ outcome: string; round: number }>(
      "SELECT outcome, round FROM auctions WHERE lot_id = $1",
      [LOT],
    );
    expect(auction!.outcome).toBe("running");
    expect(auction!.round).toBe(2);
  });

  it("closes a lot whose clock expired in round 6, where there is no next round", async () => {
    await seedRunningLot(url, {
      lotId: LOT,
      round: 6,
      bidClockMsFromNow: -1_000,
      leaderPaddle: "Т-200",
    });
    const user = await seedUser(url, { phone: "99110001", paddle: "Т-100" });

    const res = await placeBid(args({ userId: user.id, paddle: user.paddle }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("round-closed");
    // Too late is never charged.
    expect(await balanceOf(user.id)).toBe(1000);

    /*
     * And it persists that, rather than leaving the catalogue advertising a
     * live lot that refuses every press. The seeded lead has no account
     * behind it, so there is nobody to hand the lot to: it waits in review.
     */
    const [auction] = await query<{ outcome: string }>(
      "SELECT outcome FROM auctions WHERE lot_id = $1",
      [LOT],
    );
    expect(auction!.outcome).toBe("review");
  });

  it("hands the lot to the last presser when a late press is what closes it", async () => {
    const admin = await seedUser(url, { phone: "99119999", paddle: "Т-001" });
    await query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
    const last = await seedUser(url, { phone: "99110002", paddle: "Т-200" });
    await seedRunningLot(url, {
      lotId: LOT,
      currentPts: 1,
      round: 6,
      bidClockMsFromNow: -1_000,
      leaderPaddle: last.paddle,
    });
    await query("UPDATE auctions SET leader_user_id = $2 WHERE lot_id = $1", [
      LOT,
      last.id,
    ]);
    await query(
      `INSERT INTO bids (lot_id, user_id, paddle, points, cost_pts, round, idempotency_key)
       VALUES ($1, $2, $3, 1, 1, 6, 'seed')`,
      [LOT, last.id, last.paddle],
    );
    const late = await seedUser(url, { phone: "99110001", paddle: "Т-100" });

    const res = await placeBid(args({ userId: late.id, paddle: late.paddle }));
    expect(res.ok).toBe(false);

    /*
     * Sold, here and now: the ticker only revisits lots that are still
     * running, so whichever closes the lot must hand it over.
     */
    const [auction] = await query<{
      outcome: string;
      leader_user_id: number;
      awarded_by: number | null;
    }>(
      "SELECT outcome, leader_user_id, awarded_by FROM auctions WHERE lot_id = $1",
      [LOT],
    );
    expect(auction).toEqual({
      outcome: "sold",
      leader_user_id: last.id,
      awarded_by: null,
    });
    const told = await query<{ user_id: number; kind: string }>(
      "SELECT user_id, kind FROM notifications",
    );
    expect(told).toEqual([{ user_id: last.id, kind: "lot.won" }]);
  });

  it("keeps round_ends_at current, so the ticker stops re-settling a live lot", async () => {
    /*
     * `auctions_due_idx` selects on `round_ends_at <= now()`. A stale value
     * makes every live lot permanently due, and the ticker re-locks it four
     * times a second for the rest of the sale — see the note on
     * `persistSettlement`.
     */
    await seedRunningLot(url, { lotId: LOT, bidClockMsFromNow: -1_000 });
    const user = await seedUser(url, { phone: "99110001", paddle: "Т-100" });

    await placeBid(args({ userId: user.id, paddle: user.paddle }));

    const [auction] = await query<{ due: boolean }>(
      `SELECT (round_ends_at <= now()) AS due FROM auctions WHERE lot_id = $1`,
      [LOT],
    );
    expect(auction!.due).toBe(false);
  });
});

describe("the charge", () => {
  it("is the lot's price on every press, with no fee for joining late", async () => {
    await seedRunningLot(url, { lotId: LOT, round: 3, pressCostPts: 2 });
    const user = await seedUser(url, {
      phone: "99110001",
      paddle: "Т-100",
      balancePts: 50,
    });

    await placeBid(args({ userId: user.id, paddle: user.paddle }));
    await placeBid(args({ userId: user.id, paddle: user.paddle }));

    expect(await balanceOf(user.id)).toBe(46);
    const kinds = await query<{ kind: string }>(
      "SELECT kind FROM ledger_entries WHERE user_id = $1",
      [user.id],
    );
    expect(kinds).toEqual([{ kind: "press" }, { kind: "press" }]);
  });

  it("refuses the press rather than overdrawing", async () => {
    await seedRunningLot(url, { lotId: LOT, pressCostPts: 5 });
    const user = await seedUser(url, {
      phone: "99110001",
      paddle: "Т-100",
      balancePts: 3,
    });

    const res = await placeBid(args({ userId: user.id, paddle: user.paddle }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("insufficient-funds");

    expect(await balanceOf(user.id)).toBe(3);
    expect(await query("SELECT 1 FROM bids")).toHaveLength(0);
  });

  it("cannot be overdrawn by simultaneous presses", async () => {
    await seedRunningLot(url, { lotId: LOT, pressCostPts: 1 });
    const user = await seedUser(url, {
      phone: "99110001",
      paddle: "Т-100",
      balancePts: 3,
    });

    // Ten presses at once on a balance that covers three.
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        placeBid(args({ userId: user.id, paddle: user.paddle })),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(
      results.filter((r) => !r.ok && r.reason === "insufficient-funds"),
    ).toHaveLength(7);
    expect(await balanceOf(user.id)).toBe(0);
  });
});

describe("idempotency", () => {
  it("collapses a retry with the same key into one press, charged once", async () => {
    await seedRunningLot(url, { lotId: LOT });
    const user = await seedUser(url, { phone: "99110001", paddle: "Т-100" });
    const key = crypto.randomUUID();

    const first = await placeBid(
      args({ userId: user.id, paddle: user.paddle, idempotencyKey: key }),
    );
    const retry = await placeBid(
      args({ userId: user.id, paddle: user.paddle, idempotencyKey: key }),
    );

    expect(first.ok).toBe(true);
    expect(retry.ok).toBe(true);
    if (retry.ok) {
      expect(retry.duplicate).toBe(true);
      expect(retry.count).toBe(1);
    }

    const bids = await query("SELECT 1 FROM bids WHERE lot_id = $1", [LOT]);
    expect(bids).toHaveLength(1);
    expect(await balanceOf(user.id)).toBe(999);
  });

  it("collapses a retry that arrives concurrently with the original", async () => {
    await seedRunningLot(url, { lotId: LOT });
    const user = await seedUser(url, { phone: "99110001", paddle: "Т-100" });
    const key = crypto.randomUUID();

    // Both in flight at once — the second must block on the row lock rather
    // than racing the unique index and surfacing as a 500.
    const [a, b] = await Promise.all([
      placeBid(
        args({ userId: user.id, paddle: user.paddle, idempotencyKey: key }),
      ),
      placeBid(
        args({ userId: user.id, paddle: user.paddle, idempotencyKey: key }),
      ),
    ]);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);

    const bids = await query("SELECT 1 FROM bids WHERE lot_id = $1", [LOT]);
    expect(bids).toHaveLength(1);
    expect(await balanceOf(user.id)).toBe(999);
  });
});

describe("concurrency — the reason for the row lock", () => {
  it("accepts every press of a simultaneous burst, and the last one leads", async () => {
    await seedRunningLot(url, { lotId: LOT, round: 1 });

    const pressers = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        seedUser(url, {
          phone: `9911${String(i).padStart(4, "0")}`,
          paddle: `Т-${200 + i}`,
          balancePts: 1000,
        }),
      ),
    );

    /*
     * Everyone presses in the same instant. Nobody's press can be made stale
     * by anybody else's, so all twenty land; the lock decides the order, and
     * whoever it put last is the one who leads.
     */
    const results = await Promise.all(
      pressers.map((p) => placeBid(args({ userId: p.id, paddle: p.paddle }))),
    );
    expect(results.every((r) => r.ok)).toBe(true);

    const bids = await query<{ paddle: string }>(
      "SELECT paddle FROM bids WHERE lot_id = $1 ORDER BY id",
      [LOT],
    );
    expect(bids).toHaveLength(20);

    expect(await lot()).toEqual({
      current_pts: 20,
      leader_paddle: bids[19]!.paddle,
      bid_count: 20,
    });
  });

  it("numbers one presser's simultaneous taps one after another", async () => {
    await seedRunningLot(url, { lotId: LOT, round: 1 });

    const pressers = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        seedUser(url, {
          phone: `9922${String(i).padStart(4, "0")}`,
          paddle: `Т-${300 + i}`,
          balancePts: 1000,
        }),
      ),
    );

    // Each presser taps five times at once.
    const results = await Promise.all(
      pressers.flatMap((p) =>
        Array.from({ length: 5 }, () =>
          placeBid(args({ userId: p.id, paddle: p.paddle })),
        ),
      ),
    );
    expect(results.every((r) => r.ok)).toBe(true);

    /*
     * 1 to 5 for each, in the order they landed. The unique index on
     * (lot_id, user_id, points) backs this up at the storage layer.
     */
    for (const p of pressers) {
      const own = await query<{ points: number }>(
        "SELECT points FROM bids WHERE lot_id = $1 AND user_id = $2 ORDER BY id",
        [LOT, p.id],
      );
      expect(own.map((r) => r.points)).toEqual([1, 2, 3, 4, 5]);
      expect(await balanceOf(p.id)).toBe(995);
    }

    expect(await lot()).toMatchObject({ current_pts: 40, bid_count: 40 });
  });
});

describe("the append-only guarantee", () => {
  it("refuses to update a press", async () => {
    await seedRunningLot(url, { lotId: LOT });
    const user = await seedUser(url, { phone: "99110001", paddle: "Т-100" });
    await placeBid(args({ userId: user.id, paddle: user.paddle }));

    await expect(
      query("UPDATE bids SET points = 9 WHERE lot_id = $1", [LOT]),
    ).rejects.toThrow(/append-only/);
  });

  it("refuses to delete a press", async () => {
    await seedRunningLot(url, { lotId: LOT });
    const user = await seedUser(url, { phone: "99110001", paddle: "Т-100" });
    await placeBid(args({ userId: user.id, paddle: user.paddle }));

    await expect(
      query("DELETE FROM bids WHERE lot_id = $1", [LOT]),
    ).rejects.toThrow(/append-only/);
  });
});

describe("the audit trail", () => {
  it("records every accepted press in the same transaction", async () => {
    await seedRunningLot(url, { lotId: LOT, pressCostPts: 2 });
    const user = await seedUser(url, { phone: "99110001", paddle: "Т-100" });
    await placeBid(args({ userId: user.id, paddle: user.paddle }));

    const rows = await query<{
      action: string;
      detail: Record<string, unknown>;
    }>("SELECT action, detail FROM audit_log WHERE action = 'bid.placed'");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.detail).toMatchObject({
      count: 1,
      costPts: 2,
      round: 1,
      previousLeader: null,
    });
  });
});
