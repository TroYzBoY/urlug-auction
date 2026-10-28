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
 * WHO TAKES THE LOT — against a real Postgres
 *
 * `auction-engine.test.ts` proves that an expired clock closes a lot. This
 * proves the half that only exists in the database:
 *
 *   • the lot is handed over in the same transaction that closes it — to the
 *     instant winner if an admin chose one, to the last presser otherwise —
 *     whichever of the ticker, a late press and an admin's «Хаах» closes it
 *   • nothing waits for a person, except a lot with nobody to give it to
 *   • a user who never pressed on the lot cannot be given it, however the call
 *     arrives
 *
 * None of these can be checked against a mock: the first is about a lock, and
 * the rest are about rows in several tables agreeing.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const url = testDatabaseUrl();
process.env.DATABASE_URL = url;

/* Imported after DATABASE_URL is set — see the note in bids.integration.test.ts. */
let awardLot: typeof import("./admin-write").awardLot;
let declareUnsold: typeof import("./admin-write").declareUnsold;
let designateWinner: typeof import("./admin-write").designateWinner;
let closeAuction: typeof import("./admin-write").closeAuction;
let reviewQueue: typeof import("./admin").reviewQueue;
let settleDueAuctions: typeof import("../ticker").settleDueAuctions;
let placeBid: typeof import("./bids").placeBid;
let db: typeof import("../db") | null = null;
let query: typeof import("../db").query;

const LOT = "900";

beforeAll(async () => {
  await applySchema(url);
  ({ awardLot, declareUnsold, designateWinner, closeAuction } =
    await import("./admin-write"));
  ({ reviewQueue } = await import("./admin"));
  ({ settleDueAuctions } = await import("../ticker"));
  ({ placeBid } = await import("./bids"));
  db = await import("../db");
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

/** An admin to act as. Roles are not checked here — `requireAdmin` is the gate. */
async function seedAdmin() {
  const admin = await seedUser(url, { phone: "99119999", paddle: "Т-001" });
  await query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
  return { id: admin.id, ip: null, userAgent: null };
}

/**
 * A lot in ROUND 6 with two pressers on it: Т-100 pressed twice, then Т-200
 * once — so Т-200 pressed last, and Т-100 pressed more. By default its bid
 * clock ran out a second ago and nothing has settled the row yet.
 *
 * Round 6 specifically, because that is the only round an expiring clock can
 * end a lot in: in rounds 1–5 the same expiry just moves the lot up a gear.
 *
 * Written straight into `bids` rather than through `placeBid`, because what is
 * under test is what happens AFTER pressing — routing through the press path
 * would only add its own clock rules to the setup.
 */
async function seedClosedLot({
  bidClockMsFromNow = -1_000,
}: { bidClockMsFromNow?: number } = {}): Promise<{
  last: number;
  second: number;
}> {
  const second = await seedUser(url, { phone: "99110001", paddle: "Т-100" });
  const last = await seedUser(url, { phone: "99110002", paddle: "Т-200" });

  await seedRunningLot(url, {
    lotId: LOT,
    currentPts: 3,
    round: 6,
    bidClockMsFromNow,
    leaderPaddle: last.paddle,
  });
  await query(
    "UPDATE auctions SET leader_user_id = $2, bid_count = 3 WHERE lot_id = $1",
    [LOT, last.id],
  );

  for (const [userId, paddle, count, key] of [
    [second.id, second.paddle, 1, "seed-1"],
    [second.id, second.paddle, 2, "seed-2"],
    [last.id, last.paddle, 1, "seed-3"],
  ] as const) {
    await query(
      `INSERT INTO bids (lot_id, user_id, paddle, points, cost_pts, round, idempotency_key)
       VALUES ($1, $2, $3, $4, 1, 6, $5)`,
      [LOT, userId, paddle, count, key],
    );
  }

  return { last: last.id, second: second.id };
}

/**
 * The same lot with no account behind its lead — what nothing produces any
 * more, and so the one way a lot still ends up waiting for a person.
 */
async function seedStuckLot(opts: { bidClockMsFromNow?: number } = {}) {
  const ids = await seedClosedLot(opts);
  await query("UPDATE auctions SET leader_user_id = NULL WHERE lot_id = $1", [
    LOT,
  ]);
  return ids;
}

/** The bid clock runs out, as far as the ticker's scan can tell. */
async function expireClock() {
  await query(
    "UPDATE auctions SET bid_clock_ends_at = now() - interval '1 second' WHERE lot_id = $1",
    [LOT],
  );
}

async function outcomeOf() {
  const [row] = await query<{
    outcome: string;
    leader_user_id: number | null;
    current_pts: number;
    awarded_by: number | null;
  }>(
    `SELECT outcome, leader_user_id, current_pts, awarded_by
       FROM auctions WHERE lot_id = $1`,
    [LOT],
  );
  return row!;
}

describe("when the clocks close a lot", () => {
  it("hands it to the last presser, not the one who pressed most", async () => {
    const { last } = await seedClosedLot();
    await settleDueAuctions();

    expect(await outcomeOf()).toEqual({
      outcome: "sold",
      leader_user_id: last,
      // The lot's total presses, kept for the room to show beside the result.
      current_pts: 3,
      // Nobody chose: the format did.
      awarded_by: null,
    });
    const [stamps] = await query<{
      settled_at: Date | null;
      awarded_at: Date | null;
    }>("SELECT settled_at, awarded_at FROM auctions WHERE lot_id = $1", [LOT]);
    expect(stamps!.settled_at).not.toBeNull();
    expect(stamps!.awarded_at).not.toBeNull();

    // The presses were the price: nothing more is owed.
    expect(await query("SELECT 1 FROM settlements")).toHaveLength(0);
    expect(await reviewQueue()).toHaveLength(0);
  });

  it("tells the winner by text and everyone else in the bell — and no admin", async () => {
    const admin = await seedAdmin();
    const { last, second } = await seedClosedLot();
    await settleDueAuctions();

    const sent = await query<{
      user_id: number;
      kind: string;
      channel: string;
    }>("SELECT user_id, kind, channel FROM notifications ORDER BY user_id");
    expect(sent).toEqual(
      [
        { user_id: last, kind: "lot.won", channel: "sms" },
        { user_id: second, kind: "lot.decided", channel: "inapp" },
      ].sort((a, b) => a.user_id - b.user_id),
    );
    expect(sent.some((n) => n.user_id === admin.id)).toBe(false);
  });

  it("is left out of the review queue before the ticker gets there", async () => {
    await seedClosedLot();

    // Stored as running still, and settled in memory as closed …
    expect((await outcomeOf()).outcome).toBe("running");
    // … but it has somebody to go to, so nobody need decide anything.
    expect(await reviewQueue()).toHaveLength(0);
  });

  it("decides an emergency close the same way", async () => {
    const actor = await seedAdmin();
    const { last } = await seedClosedLot({ bidClockMsFromNow: 60_000 });

    expect((await closeAuction(LOT, "Техникийн доголдол", actor)).ok).toBe(
      true,
    );
    expect(await outcomeOf()).toMatchObject({
      outcome: "sold",
      leader_user_id: last,
      awarded_by: null,
    });
  });

  it("leaves a lot nobody pressed unsold", async () => {
    await seedRunningLot(url, {
      lotId: LOT,
      round: 6,
      currentPts: 0,
      bidClockMsFromNow: -1_000,
    });
    await settleDueAuctions();

    expect((await outcomeOf()).outcome).toBe("unsold");
    expect(await reviewQueue()).toHaveLength(0);
  });
});

describe("choosing an instant winner", () => {
  it("leaves the lot running, then hands it to them the moment it ends", async () => {
    const { second, last } = await seedClosedLot({ bidClockMsFromNow: 60_000 });
    const actor = await seedAdmin();

    expect(
      await designateWinner(LOT, second, "Урьдчилан сонгов", actor),
    ).toEqual({ ok: true, paddle: "Т-100" });

    // Nothing a presser sees has moved.
    expect((await outcomeOf()).outcome).toBe("running");

    // The clock runs out: theirs, not the last presser's.
    await expireClock();
    await settleDueAuctions();
    expect(await outcomeOf()).toEqual({
      outcome: "sold",
      leader_user_id: second,
      current_pts: 3,
      awarded_by: actor.id,
    });

    const sent = await query<{ user_id: number; kind: string }>(
      "SELECT user_id, kind FROM notifications ORDER BY user_id",
    );
    expect(sent).toEqual(
      [
        { user_id: second, kind: "lot.won" },
        { user_id: last, kind: "lot.decided" },
      ].sort((a, b) => a.user_id - b.user_id),
    );

    const [audit] = await query<{ detail: Record<string, unknown> }>(
      "SELECT detail FROM audit_log WHERE action = 'auction.sold'",
    );
    expect(audit!.detail).toMatchObject({
      instant: true,
      winnerPaddle: "Т-100",
      lastPresser: "Т-200",
    });
  });

  it("hands it over when a late press is what closes it, too", async () => {
    const { second, last } = await seedClosedLot({ bidClockMsFromNow: 60_000 });
    const actor = await seedAdmin();
    await designateWinner(LOT, second, "Урьдчилан сонгов", actor);
    await expireClock();

    const late = await placeBid({
      lotId: LOT,
      userId: last,
      paddle: "Т-200",
      name: "Тест хэрэглэгч",
      idempotencyKey: "late",
      ip: null,
      userAgent: null,
    });
    expect(late.ok).toBe(false);
    expect(await outcomeOf()).toMatchObject({
      outcome: "sold",
      leader_user_id: second,
    });
  });

  it("honours the choice on an emergency close", async () => {
    const { second } = await seedClosedLot({ bidClockMsFromNow: 60_000 });
    const actor = await seedAdmin();
    await designateWinner(LOT, second, "Урьдчилан сонгов", actor);

    expect((await closeAuction(LOT, "Техникийн доголдол", actor)).ok).toBe(
      true,
    );
    expect(await outcomeOf()).toMatchObject({
      outcome: "sold",
      leader_user_id: second,
      awarded_by: actor.id,
    });
  });

  it("takes the choice back, and the last presser wins again", async () => {
    const { second, last } = await seedClosedLot({ bidClockMsFromNow: 60_000 });
    const actor = await seedAdmin();
    await designateWinner(LOT, second, "Урьдчилан сонгов", actor);
    expect(await designateWinner(LOT, null, null, actor)).toEqual({
      ok: true,
      paddle: null,
    });

    await expireClock();
    await settleDueAuctions();
    expect(await outcomeOf()).toMatchObject({
      outcome: "sold",
      leader_user_id: last,
      awarded_by: null,
    });
  });

  it("refuses somebody who never pressed, and a lot that has closed", async () => {
    const { last } = await seedClosedLot({ bidClockMsFromNow: 60_000 });
    const actor = await seedAdmin();
    const stranger = await seedUser(url, {
      phone: "99110009",
      paddle: "Т-900",
    });

    expect(await designateWinner(LOT, stranger.id, "Гараар", actor)).toEqual({
      ok: false,
      reason: "not-a-bidder",
    });

    await expireClock();
    expect(await designateWinner(LOT, null, null, actor)).toEqual({
      ok: false,
      reason: "closed",
    });
    // The lock closed it, so it was handed over as the ticker would have.
    expect(await outcomeOf()).toMatchObject({
      outcome: "sold",
      leader_user_id: last,
    });
  });
});

describe("a lot with nobody to hand it to", () => {
  it("waits in review, and the admins are told", async () => {
    const admin = await seedAdmin();
    await seedStuckLot();

    // Listed before the ticker has written anything …
    const [queued] = await reviewQueue();
    expect(queued).toMatchObject({
      lotId: LOT,
      standingPts: 3,
      standingPaddle: "Т-200",
    });

    // … and still there once it has.
    await settleDueAuctions();
    expect((await outcomeOf()).outcome).toBe("review");
    expect(await reviewQueue()).toHaveLength(1);

    const sent = await query<{ user_id: number; kind: string; href: string }>(
      "SELECT user_id, kind, href FROM notifications",
    );
    expect(sent).toEqual([
      { user_id: admin.id, kind: "lot.review", href: `/admin/lots/${LOT}` },
    ]);
  });

  it("offers every presser, last presser first", async () => {
    await seedStuckLot();

    const [lot] = await reviewQueue();
    expect(
      lot!.candidates.map((c) => [c.paddle, c.bidCount, c.spentPts]),
    ).toEqual([
      ["Т-200", 1, 1],
      ["Т-100", 2, 2],
    ]);
  });

  it("can be given to one of its pressers", async () => {
    const { second } = await seedStuckLot();
    const actor = await seedAdmin();

    const result = await awardLot(LOT, second, "Гараар шийдэв", actor);
    expect(result).toEqual({
      ok: true,
      presses: 2,
      paddle: "Т-100",
      name: expect.any(String),
    });
    expect(await outcomeOf()).toMatchObject({
      outcome: "sold",
      leader_user_id: second,
      awarded_by: actor.id,
    });
    expect(await reviewQueue()).toHaveLength(0);

    // Passing over the last presser is on the record, with the reason.
    const [audit] = await query<{ detail: Record<string, unknown> }>(
      `SELECT detail FROM audit_log
        WHERE action = 'admin.winner_declared' AND target_id = $1`,
      [LOT],
    );
    expect(audit!.detail).toMatchObject({
      note: "Гараар шийдэв",
      overrodeStandingLeader: true,
      standingLeader: "Т-200",
    });
  });

  it("refuses a user who never pressed on it", async () => {
    await seedStuckLot();
    const actor = await seedAdmin();
    const stranger = await seedUser(url, {
      phone: "99110009",
      paddle: "Т-900",
    });

    const result = await awardLot(LOT, stranger.id, "Гараар оруулав", actor);
    expect(result).toEqual({ ok: false, reason: "not-a-bidder" });
    expect((await outcomeOf()).outcome).toBe("review");
  });

  it("refuses a second decision", async () => {
    const { last, second } = await seedStuckLot();
    const actor = await seedAdmin();

    expect((await awardLot(LOT, last, "Шийдэв", actor)).ok).toBe(true);
    expect(await awardLot(LOT, second, "Санаа өөрчлөв", actor)).toEqual({
      ok: false,
      reason: "already-decided",
    });
    expect((await outcomeOf()).leader_user_id).toBe(last);
  });

  it("refuses a lot still taking presses, or not yet open", async () => {
    const { last } = await seedStuckLot({ bidClockMsFromNow: 60_000 });
    const actor = await seedAdmin();

    expect(await awardLot(LOT, last, "Эрт зарлав", actor)).toEqual({
      ok: false,
      reason: "not-in-review",
    });

    await query(
      "UPDATE auctions SET outcome = 'scheduled', opens_at = now() + interval '1 hour' WHERE lot_id = $1",
      [LOT],
    );
    expect(await awardLot(LOT, last, "Эрт зарлав", actor)).toEqual({
      ok: false,
      reason: "not-in-review",
    });
  });

  it("can be declared unsold instead", async () => {
    await seedStuckLot();
    const actor = await seedAdmin();

    expect((await declareUnsold(LOT, "Бүх даралт хүчингүй", actor)).ok).toBe(
      true,
    );
    expect(await outcomeOf()).toMatchObject({
      outcome: "unsold",
      awarded_by: actor.id,
    });
    expect(await reviewQueue()).toHaveLength(0);
  });
});
