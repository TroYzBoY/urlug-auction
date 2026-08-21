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
 * PLACING A BID — against a real Postgres
 *
 * `auction-engine.test.ts` proves the rules are computed correctly. This proves
 * the things that only exist in the database:
 *
 *   • `SELECT ... FOR UPDATE` really does serialise concurrent bidders
 *   • the idempotency index really does collapse a retry
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
    points: 0,
    idempotencyKey: crypto.randomUUID(),
    ip: null,
    userAgent: null,
    ...over,
  } as Parameters<typeof placeBid>[0];
}

describe("the happy path", () => {
  it("accepts a legal bid and moves the price", async () => {
    await seedRunningLot(url, { lotId: LOT, currentPts: 1200 });
    const user = await seedUser(url, { phone: "99110001", paddle: "Т-100" });

    const res = await placeBid(
      args({ userId: user.id, paddle: user.paddle, points: 1201 }),
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.acceptedPts).toBe(1201);

    const [auction] = await query<{ current_pts: number; leader_paddle: string }>(
      "SELECT current_pts, leader_paddle FROM auctions WHERE lot_id = $1",
      [LOT],
    );
    expect(auction!.current_pts).toBe(1201);
    expect(auction!.leader_paddle).toBe("Т-100");
  });

  it("resets the bid clock to the round's full length", async () => {
    await seedRunningLot(url, { lotId: LOT, bidClockMsFromNow: 5_000 });
    const user = await seedUser(url, { phone: "99110001", paddle: "Т-100" });

    await placeBid(args({ userId: user.id, paddle: user.paddle, points: 1201 }));

    const [auction] = await query<{ ms_left: number }>(
      `SELECT EXTRACT(EPOCH FROM (bid_clock_ends_at - now())) * 1000 AS ms_left
         FROM auctions WHERE lot_id = $1`,
      [LOT],
    );
    // Round 1's clock is five minutes. It must come from the server's `now()`,
    // never from a timestamp the client supplied.
    expect(Number(auction!.ms_left)).toBeGreaterThan(290_000);
  });
});

describe("the rules, re-enforced server-side", () => {
  it("rejects a bid below the minimum even though the client sent it", async () => {
    await seedRunningLot(url, { lotId: LOT, currentPts: 1200, round: 4 });
    const user = await seedUser(url, { phone: "99110001", paddle: "Т-100" });

    // Round 4's increment is 2, so 1201 is one point short.
    const res = await placeBid(
      args({ userId: user.id, paddle: user.paddle, points: 1201 }),
    );

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("too-low");
    expect(res.minNextPts).toBe(1202);
  });

  it("applies the late-entry floor to a bidder new to the lot", async () => {
    await seedRunningLot(url, { lotId: LOT, currentPts: 1200, round: 6 });
    const user = await seedUser(url, { phone: "99110001", paddle: "Т-100" });

    // Round 6, no prior bid: the floor is +60, not +2.
    const low = await placeBid(
      args({ userId: user.id, paddle: user.paddle, points: 1202 }),
    );
    expect(low.ok).toBe(false);

    const ok = await placeBid(
      args({ userId: user.id, paddle: user.paddle, points: 1260 }),
    );
    expect(ok.ok).toBe(true);
  });

  it("refuses an unverified bidder", async () => {
    await seedRunningLot(url, { lotId: LOT });
    const user = await seedUser(url, { phone: "99110001", paddle: "Т-100" });
    await query("UPDATE users SET phone_verified_at = NULL WHERE id = $1", [user.id]);

    const res = await placeBid(
      args({ userId: user.id, paddle: user.paddle, points: 1201 }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("not-verified");
  });

  it("refuses a suspended bidder", async () => {
    await seedRunningLot(url, { lotId: LOT });
    const user = await seedUser(url, { phone: "99110001", paddle: "Т-100" });
    await query("UPDATE users SET status = 'suspended' WHERE id = $1", [user.id]);

    const res = await placeBid(
      args({ userId: user.id, paddle: user.paddle, points: 1201 }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("suspended");
  });

  it("closes a lot whose bid clock expired during the request", async () => {
    await seedRunningLot(url, { lotId: LOT, bidClockMsFromNow: -1_000 });
    const user = await seedUser(url, { phone: "99110001", paddle: "Т-100" });

    const res = await placeBid(
      args({ userId: user.id, paddle: user.paddle, points: 1201 }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("round-closed");

    // And it persists that, rather than leaving the catalogue advertising a
    // live lot that rejects every bid.
    const [auction] = await query<{ outcome: string }>(
      "SELECT outcome FROM auctions WHERE lot_id = $1",
      [LOT],
    );
    expect(["sold", "unsold"]).toContain(auction!.outcome);
  });
});

describe("the join fee", () => {
  it("charges it once, from the balance, on first entry to a running lot", async () => {
    await seedRunningLot(url, { lotId: LOT, currentPts: 1200, round: 3 });
    const user = await seedUser(url, {
      phone: "99110001",
      paddle: "Т-100",
      balancePts: 50,
    });

    await placeBid(args({ userId: user.id, paddle: user.paddle, points: 1230 }));
    await placeBid(args({ userId: user.id, paddle: user.paddle, points: 1232 }));

    const [balance] = await query<{ pts: number }>(
      "SELECT pts FROM balances WHERE user_id = $1",
      [user.id],
    );
    // LATE_JOIN_PENALTY_PTS is 10, and only the first bid pays it.
    expect(balance!.pts).toBe(40);

    const fees = await query(
      "SELECT 1 FROM ledger_entries WHERE user_id = $1 AND kind = 'join_fee'",
      [user.id],
    );
    expect(fees).toHaveLength(1);
  });

  it("does not charge it in round 1 — nobody is joining late yet", async () => {
    await seedRunningLot(url, { lotId: LOT, currentPts: 1200, round: 1 });
    const user = await seedUser(url, {
      phone: "99110001",
      paddle: "Т-100",
      balancePts: 50,
    });

    await placeBid(args({ userId: user.id, paddle: user.paddle, points: 1201 }));

    const [balance] = await query<{ pts: number }>(
      "SELECT pts FROM balances WHERE user_id = $1",
      [user.id],
    );
    expect(balance!.pts).toBe(50);
  });

  it("rejects the bid rather than overdrawing", async () => {
    await seedRunningLot(url, { lotId: LOT, currentPts: 1200, round: 3 });
    const user = await seedUser(url, {
      phone: "99110001",
      paddle: "Т-100",
      balancePts: 3,
    });

    const res = await placeBid(
      args({ userId: user.id, paddle: user.paddle, points: 1230 }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("insufficient-funds");

    const [balance] = await query<{ pts: number }>(
      "SELECT pts FROM balances WHERE user_id = $1",
      [user.id],
    );
    expect(balance!.pts).toBe(3);
  });
});

describe("idempotency", () => {
  it("collapses a retry with the same key into one bid", async () => {
    await seedRunningLot(url, { lotId: LOT, currentPts: 1200 });
    const user = await seedUser(url, { phone: "99110001", paddle: "Т-100" });
    const key = crypto.randomUUID();

    const first = await placeBid(
      args({ userId: user.id, paddle: user.paddle, points: 1201, idempotencyKey: key }),
    );
    const retry = await placeBid(
      args({ userId: user.id, paddle: user.paddle, points: 1201, idempotencyKey: key }),
    );

    expect(first.ok).toBe(true);
    expect(retry.ok).toBe(true);
    if (retry.ok) expect(retry.duplicate).toBe(true);

    const bids = await query("SELECT 1 FROM bids WHERE lot_id = $1", [LOT]);
    expect(bids).toHaveLength(1);
  });

  it("collapses a retry that arrives concurrently with the original", async () => {
    await seedRunningLot(url, { lotId: LOT, currentPts: 1200 });
    const user = await seedUser(url, { phone: "99110001", paddle: "Т-100" });
    const key = crypto.randomUUID();

    // Both in flight at once — the second must block on the row lock rather
    // than racing the unique index and surfacing as a 500.
    const [a, b] = await Promise.all([
      placeBid(args({ userId: user.id, paddle: user.paddle, points: 1201, idempotencyKey: key })),
      placeBid(args({ userId: user.id, paddle: user.paddle, points: 1201, idempotencyKey: key })),
    ]);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);

    const bids = await query("SELECT 1 FROM bids WHERE lot_id = $1", [LOT]);
    expect(bids).toHaveLength(1);
  });
});

describe("concurrency — the reason for the row lock", () => {
  it("produces exactly one winner from a burst of simultaneous bids", async () => {
    await seedRunningLot(url, { lotId: LOT, currentPts: 1200, round: 1 });

    const bidders = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        seedUser(url, {
          phone: `9911${String(i).padStart(4, "0")}`,
          paddle: `Т-${200 + i}`,
          balancePts: 1000,
        }),
      ),
    );

    /*
     * Every bidder fires at the same price in the same instant. Without the
     * lock, several would read 1200, all pass validation, and all write —
     * leaving a price that went up by one and several bidders each believing
     * they lead. With it, exactly one wins and the rest are told they are low.
     */
    const results = await Promise.all(
      bidders.map((b) =>
        placeBid(args({ userId: b.id, paddle: b.paddle, points: 1201 })),
      ),
    );

    const accepted = results.filter((r) => r.ok);
    expect(accepted).toHaveLength(1);

    const rejected = results.filter((r) => !r.ok);
    expect(rejected).toHaveLength(19);
    for (const r of rejected) {
      if (!r.ok) expect(r.reason).toBe("too-low");
    }

    const bids = await query("SELECT 1 FROM bids WHERE lot_id = $1", [LOT]);
    expect(bids).toHaveLength(1);
  });

  it("keeps the price strictly increasing under a sustained burst", async () => {
    await seedRunningLot(url, { lotId: LOT, currentPts: 1200, round: 1 });

    const bidders = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        seedUser(url, {
          phone: `9922${String(i).padStart(4, "0")}`,
          paddle: `Т-${300 + i}`,
          balancePts: 1000,
        }),
      ),
    );

    // Each bidder tries five escalating prices, all at once.
    await Promise.all(
      bidders.flatMap((b, i) =>
        Array.from({ length: 5 }, (_, n) =>
          placeBid(args({ userId: b.id, paddle: b.paddle, points: 1201 + i + n * 8 })),
        ),
      ),
    );

    const bids = await query<{ points: number; id: number }>(
      "SELECT id, points FROM bids WHERE lot_id = $1 ORDER BY id ASC",
      [LOT],
    );

    expect(bids.length).toBeGreaterThan(1);
    for (let i = 1; i < bids.length; i++) {
      // A bid recorded later must be higher. The unique index on
      // (lot_id, points) backs this up at the storage layer.
      expect(bids[i]!.points).toBeGreaterThan(bids[i - 1]!.points);
    }

    const [auction] = await query<{ current_pts: number; bid_count: number }>(
      "SELECT current_pts, bid_count FROM auctions WHERE lot_id = $1",
      [LOT],
    );
    expect(auction!.current_pts).toBe(bids[bids.length - 1]!.points);
    expect(auction!.bid_count).toBe(bids.length);
  });
});

describe("the append-only guarantee", () => {
  it("refuses to update a bid", async () => {
    await seedRunningLot(url, { lotId: LOT, currentPts: 1200 });
    const user = await seedUser(url, { phone: "99110001", paddle: "Т-100" });
    await placeBid(args({ userId: user.id, paddle: user.paddle, points: 1201 }));

    await expect(
      query("UPDATE bids SET points = 1 WHERE lot_id = $1", [LOT]),
    ).rejects.toThrow(/append-only/);
  });

  it("refuses to delete a bid", async () => {
    await seedRunningLot(url, { lotId: LOT, currentPts: 1200 });
    const user = await seedUser(url, { phone: "99110001", paddle: "Т-100" });
    await placeBid(args({ userId: user.id, paddle: user.paddle, points: 1201 }));

    await expect(
      query("DELETE FROM bids WHERE lot_id = $1", [LOT]),
    ).rejects.toThrow(/append-only/);
  });
});

describe("the audit trail", () => {
  it("records every accepted bid in the same transaction", async () => {
    await seedRunningLot(url, { lotId: LOT, currentPts: 1200 });
    const user = await seedUser(url, { phone: "99110001", paddle: "Т-100" });
    await placeBid(args({ userId: user.id, paddle: user.paddle, points: 1201 }));

    const rows = await query<{ action: string; detail: Record<string, unknown> }>(
      "SELECT action, detail FROM audit_log WHERE action = 'bid.placed'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.detail.points).toBe(1201);
    expect(rows[0]!.detail.previousPts).toBe(1200);
  });
});
