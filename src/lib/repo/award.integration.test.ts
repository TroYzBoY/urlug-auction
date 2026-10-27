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
 * NAMING A WINNER — against a real Postgres
 *
 * `auction-engine.test.ts` proves that an expired clock produces `review`
 * rather than `sold`. This proves the half of the feature that only exists in
 * the database:
 *
 *   • a lot the ticker has not caught up with still appears in the queue, and
 *     is still awardable — the decision path settles it under its own row lock
 *   • the price written is the WINNER's top bid, not the standing one, when an
 *     admin passes over the highest bidder
 *   • the settlement is opened by the same transaction that awards the lot, so
 *     a sold lot and the obligation it creates cannot come apart
 *   • a user who never bid on the lot cannot be awarded it, however the call
 *     arrives
 *
 * None of these can be checked against a mock: the first is about a lock, and
 * the rest are about rows in three tables agreeing.
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
 * A lot whose bid clock ran out a second ago in ROUND 6, with two bidders on it.
 *
 * Round 6 specifically, because that is now the only round an expiring clock
 * can end a sale in: in rounds 1–5 the same expiry just moves the lot up a
 * gear. A round-1 setup here would leave a lot that is still cheerfully
 * running, and every assertion below would be about the wrong state.
 *
 * Written straight into `bids` rather than through `placeBid`, because what is
 * under test is what happens AFTER bidding — routing through the bid path would
 * only add its own clock rules to the setup.
 */
async function seedClosedLot({
  bidClockMsFromNow = -1_000,
}: { bidClockMsFromNow?: number } = {}): Promise<{
  top: number;
  second: number;
}> {
  const second = await seedUser(url, { phone: "99110001", paddle: "Т-100" });
  const top = await seedUser(url, { phone: "99110002", paddle: "Т-200" });

  await seedRunningLot(url, {
    lotId: LOT,
    currentPts: 1300,
    round: 6,
    bidClockMsFromNow,
    leaderPaddle: top.paddle,
  });
  await query("UPDATE auctions SET leader_user_id = $2 WHERE lot_id = $1", [
    LOT,
    top.id,
  ]);

  for (const [userId, paddle, points] of [
    [second.id, second.paddle, 1250],
    [top.id, top.paddle, 1300],
  ] as const) {
    await query(
      `INSERT INTO bids (lot_id, user_id, paddle, points, round, idempotency_key)
       VALUES ($1, $2, $3, $4, 1, $5)`,
      [LOT, userId, paddle, points, `seed-${points}`],
    );
  }

  return { top: top.id, second: second.id };
}

describe("the review queue", () => {
  it("lists a lot whose clock expired, even before the ticker writes it", async () => {
    await seedClosedLot();

    /*
     * The stored outcome is still 'running' — nothing has settled this row.
     * An admin refreshing the dashboard the second a clock hits zero must see
     * the lot anyway, or the queue is empty for as long as the ticker lags.
     */
    const [stored] = await query<{ outcome: string }>(
      "SELECT outcome FROM auctions WHERE lot_id = $1",
      [LOT],
    );
    expect(stored!.outcome).toBe("running");

    const queue = await reviewQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]!.lotId).toBe(LOT);
    expect(queue[0]!.standingPts).toBe(1300);
    expect(queue[0]!.standingPaddle).toBe("Т-200");
  });

  it("offers every bidder as a candidate, highest bid first", async () => {
    await seedClosedLot();

    const [lot] = await reviewQueue();
    expect(lot!.candidates.map((c) => c.paddle)).toEqual(["Т-200", "Т-100"]);
    expect(lot!.candidates[0]!.topPts).toBe(1300);
    expect(lot!.candidates[1]!.topPts).toBe(1250);
  });

  it("drops a lot once it has been decided", async () => {
    const { top } = await seedClosedLot();
    const actor = await seedAdmin();

    await awardLot(LOT, top, "Ердийн дуусгавар", actor);
    expect(await reviewQueue()).toHaveLength(0);
  });
});

describe("awarding a lot", () => {
  it("sells it to the standing leader at the standing price", async () => {
    const { top } = await seedClosedLot();
    const actor = await seedAdmin();

    const result = await awardLot(LOT, top, "Ердийн дуусгавар", actor);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hammerPts).toBe(1300);

    const [auction] = await query<{
      outcome: string;
      current_pts: number;
      leader_user_id: number;
      awarded_by: number;
      settled_at: Date | null;
      awarded_at: Date | null;
    }>(
      `SELECT outcome, current_pts, leader_user_id, awarded_by, settled_at,
              awarded_at
         FROM auctions WHERE lot_id = $1`,
      [LOT],
    );
    expect(auction!.outcome).toBe("sold");
    expect(auction!.current_pts).toBe(1300);
    expect(auction!.leader_user_id).toBe(top);
    expect(auction!.awarded_by).toBe(actor.id);
    // Two facts, two columns: when bidding stopped, and when the house decided.
    expect(auction!.settled_at).not.toBeNull();
    expect(auction!.awarded_at).not.toBeNull();
  });

  it("prices the lot at the WINNER's own top bid when the leader is passed over", async () => {
    const { second } = await seedClosedLot();
    const actor = await seedAdmin();

    const result = await awardLot(
      LOT,
      second,
      "Тэргүүлэгчийн бүртгэл шалгагдаж байгаа",
      actor,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    /*
     * 1250, not 1300. If the house does not honour the top bid, the lot is not
     * sold at the top bid's price — it is sold at what the person who actually
     * gets it offered.
     */
    expect(result.hammerPts).toBe(1250);

    const [auction] = await query<{
      current_pts: number;
      leader_paddle: string;
    }>("SELECT current_pts, leader_paddle FROM auctions WHERE lot_id = $1", [
      LOT,
    ]);
    expect(auction!.current_pts).toBe(1250);
    expect(auction!.leader_paddle).toBe("Т-100");

    // And the departure is on the record, with the reason typed at the time.
    const [audit] = await query<{ detail: Record<string, unknown> }>(
      `SELECT detail FROM audit_log
        WHERE action = 'admin.winner_declared' AND target_id = $1`,
      [LOT],
    );
    expect(audit!.detail.overrodeStandingLeader).toBe(true);
    expect(audit!.detail.standingLeader).toBe("Т-200");
  });

  it("opens the settlement in the same transaction", async () => {
    const { second } = await seedClosedLot();
    const actor = await seedAdmin();

    await awardLot(LOT, second, "Тэргүүлэгч холбогдох боломжгүй", actor);

    const [settlement] = await query<{
      user_id: number;
      hammer_pts: number;
      status: string;
    }>(
      "SELECT user_id, hammer_pts, status FROM settlements WHERE lot_id = $1",
      [LOT],
    );
    expect(settlement!.user_id).toBe(second);
    expect(settlement!.hammer_pts).toBe(1250);
    expect(settlement!.status).toBe("due");
  });

  it("refuses a user who never bid on the lot", async () => {
    await seedClosedLot();
    const actor = await seedAdmin();
    const stranger = await seedUser(url, {
      phone: "99110009",
      paddle: "Т-900",
    });

    const result = await awardLot(LOT, stranger.id, "Гараар оруулав", actor);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not-a-bidder");

    // And nothing moved.
    const [auction] = await query<{ outcome: string }>(
      "SELECT outcome FROM auctions WHERE lot_id = $1",
      [LOT],
    );
    expect(auction!.outcome).toBe("review");
  });

  it("refuses a second decision on a lot already decided", async () => {
    const { top, second } = await seedClosedLot();
    const actor = await seedAdmin();

    expect((await awardLot(LOT, top, "Ердийн дуусгавар", actor)).ok).toBe(true);

    const again = await awardLot(LOT, second, "Санаа өөрчлөв", actor);
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.reason).toBe("already-decided");

    const [auction] = await query<{ leader_user_id: number }>(
      "SELECT leader_user_id FROM auctions WHERE lot_id = $1",
      [LOT],
    );
    expect(auction!.leader_user_id).toBe(top);
  });

  it("refuses a lot that is still taking bids", async () => {
    const { top } = await seedClosedLot({ bidClockMsFromNow: 60_000 });
    const actor = await seedAdmin();

    const result = await awardLot(LOT, top, "Эрт зарлав", actor);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not-in-review");
  });

  it("refuses a lot that has not opened", async () => {
    const bidder = await seedUser(url, { phone: "99110001", paddle: "Т-100" });
    await seedRunningLot(url, { lotId: LOT, currentPts: 1300 });
    await query(
      "UPDATE auctions SET outcome = 'scheduled', opens_at = now() + interval '1 hour' WHERE lot_id = $1",
      [LOT],
    );
    const actor = await seedAdmin();

    const result = await awardLot(LOT, bidder.id, "Эрт зарлав", actor);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not-in-review");
  });
});

describe("choosing the winner in advance", () => {
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

  it("leaves the lot running, then hands it over the moment it ends", async () => {
    const { second, top } = await seedClosedLot({ bidClockMsFromNow: 60_000 });
    const actor = await seedAdmin();

    expect(
      await designateWinner(LOT, second, "Тэргүүлэгч шалгагдаж байна", actor),
    ).toEqual({ ok: true, paddle: "Т-100" });

    // Nothing a bidder sees has moved.
    expect((await outcomeOf()).outcome).toBe("running");
    expect(await query("SELECT 1 FROM settlements")).toHaveLength(0);

    // The clock runs out: sold to the chosen bidder, at their own top bid.
    await expireClock();
    await settleDueAuctions();
    expect(await outcomeOf()).toEqual({
      outcome: "sold",
      leader_user_id: second,
      current_pts: 1250,
      awarded_by: actor.id,
    });

    const sent = await query<{ user_id: number; kind: string }>(
      "SELECT user_id, kind FROM notifications ORDER BY user_id",
    );
    // The bidders hear the result; the admins have nothing to decide.
    expect(sent).toEqual(
      [
        { user_id: second, kind: "lot.won" },
        { user_id: top, kind: "lot.decided" },
      ].sort((a, b) => a.user_id - b.user_id),
    );
    expect(await reviewQueue()).toHaveLength(0);
  });

  it("hands it over when a late bid is what closes it, too", async () => {
    const { second } = await seedClosedLot({ bidClockMsFromNow: 60_000 });
    const actor = await seedAdmin();
    await designateWinner(LOT, second, "Урьдчилан сонгов", actor);
    await expireClock();

    const late = await placeBid({
      lotId: LOT,
      userId: second,
      paddle: "Т-100",
      name: "Тест хэрэглэгч",
      points: 1400,
      idempotencyKey: "late",
      ip: null,
      userAgent: null,
    });
    expect(late.ok).toBe(false);
    expect((await outcomeOf()).leader_user_id).toBe(second);
    expect((await outcomeOf()).outcome).toBe("sold");
  });

  it("takes the choice back, and the lot waits for a person again", async () => {
    const { second } = await seedClosedLot({ bidClockMsFromNow: 60_000 });
    const actor = await seedAdmin();
    await designateWinner(LOT, second, "Урьдчилан сонгов", actor);
    expect(await designateWinner(LOT, null, null, actor)).toEqual({
      ok: true,
      paddle: null,
    });

    await expireClock();
    await settleDueAuctions();
    expect((await outcomeOf()).outcome).toBe("review");
    expect(await reviewQueue()).toHaveLength(1);
  });

  it("refuses somebody who never bid, and a lot whose bidding has stopped", async () => {
    await seedClosedLot({ bidClockMsFromNow: 60_000 });
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
    // The lock closed it, so the admins were told, as the ticker would have.
    const told = await query<{ kind: string }>(
      "SELECT kind FROM notifications WHERE user_id = $1",
      [actor.id],
    );
    expect(told).toEqual([{ kind: "lot.review" }]);
  });

  it("an emergency close leaves the decision to a person, starting on the choice", async () => {
    const { second } = await seedClosedLot({ bidClockMsFromNow: 60_000 });
    const actor = await seedAdmin();
    await designateWinner(LOT, second, "Урьдчилан сонгов", actor);

    expect((await closeAuction(LOT, "Техникийн доголдол", actor)).ok).toBe(
      true,
    );
    expect((await outcomeOf()).outcome).toBe("review");
    const [pending] = await reviewQueue();
    expect(pending!.designatedUserId).toBe(second);
  });
});

describe("declaring a lot unsold", () => {
  it("ends the review with no winner and no settlement", async () => {
    await seedClosedLot();
    const actor = await seedAdmin();

    const result = await declareUnsold(LOT, "Бүх хаялт хүчингүй", actor);
    expect(result.ok).toBe(true);

    const [auction] = await query<{ outcome: string; awarded_by: number }>(
      "SELECT outcome, awarded_by FROM auctions WHERE lot_id = $1",
      [LOT],
    );
    expect(auction!.outcome).toBe("unsold");
    expect(auction!.awarded_by).toBe(actor.id);

    const settlements = await query(
      "SELECT lot_id FROM settlements WHERE lot_id = $1",
      [LOT],
    );
    expect(settlements).toHaveLength(0);
  });
});

describe("when bidding stops", () => {
  it("waits in review for an admin, however clear the standing leader is", async () => {
    await seedClosedLot();
    await settleDueAuctions();

    const [auction] = await query<{ outcome: string; awarded_at: Date | null }>(
      "SELECT outcome, awarded_at FROM auctions WHERE lot_id = $1",
      [LOT],
    );
    expect(auction).toEqual({ outcome: "review", awarded_at: null });
    expect(await reviewQueue()).toHaveLength(1);

    const settlements = await query(
      "SELECT 1 FROM settlements WHERE lot_id = $1",
      [LOT],
    );
    expect(settlements).toHaveLength(0);
  });

  it("tells the admins, and no bidder, until there is a result", async () => {
    const admin = await seedAdmin();
    await seedClosedLot();
    await settleDueAuctions();

    const sent = await query<{
      user_id: number;
      kind: string;
      channel: string;
      href: string;
    }>("SELECT user_id, kind, channel, href FROM notifications");
    expect(sent).toEqual([
      {
        user_id: admin.id,
        kind: "lot.review",
        channel: "inapp",
        href: `/admin/lots/${LOT}`,
      },
    ]);
  });

  it("tells the bidders once an admin has decided", async () => {
    const actor = await seedAdmin();
    const { top, second } = await seedClosedLot();
    await settleDueAuctions();
    await awardLot(LOT, top, "Ердийн дуусгавар", actor);

    const sent = await query<{ user_id: number; kind: string }>(
      "SELECT user_id, kind FROM notifications WHERE user_id <> $1 ORDER BY user_id",
      [actor.id],
    );
    expect(sent).toEqual(
      [
        { user_id: second, kind: "lot.decided" },
        { user_id: top, kind: "lot.won" },
      ].sort((a, b) => a.user_id - b.user_id),
    );
  });

  it("an emergency close is left for a person too", async () => {
    const admin = await seedAdmin();
    await seedClosedLot({ bidClockMsFromNow: 60_000 });

    expect((await closeAuction(LOT, "Техникийн доголдол", admin)).ok).toBe(
      true,
    );
    await settleDueAuctions();

    const [auction] = await query<{ outcome: string }>(
      "SELECT outcome FROM auctions WHERE lot_id = $1",
      [LOT],
    );
    expect(auction!.outcome).toBe("review");
    expect(await reviewQueue()).toHaveLength(1);
  });
});
