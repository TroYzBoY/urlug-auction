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
let setManualAward: typeof import("./admin-write").setManualAward;
let closeAuction: typeof import("./admin-write").closeAuction;
let reviewQueue: typeof import("./admin").reviewQueue;
let settleDueAuctions: typeof import("../ticker").settleDueAuctions;
let db: typeof import("../db") | null = null;
let query: typeof import("../db").query;

const LOT = "900";

beforeAll(async () => {
  await applySchema(url);
  ({ awardLot, declareUnsold, setManualAward, closeAuction } = await import(
    "./admin-write"
  ));
  ({ reviewQueue } = await import("./admin"));
  ({ settleDueAuctions } = await import("../ticker"));
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
 * Marked for an admin to decide unless told otherwise, because that is the
 * path most of this file is about. An automatic lot never waits for anyone:
 * the first thing to settle it sells it.
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
  manual = true,
  bidClockMsFromNow = -1_000,
}: { manual?: boolean; bidClockMsFromNow?: number } = {}): Promise<{
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
  await query(
    "UPDATE auctions SET leader_user_id = $2, manual_award = $3 WHERE lot_id = $1",
    [LOT, top.id, manual],
  );

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

    const [auction] = await query<{ current_pts: number; leader_paddle: string }>(
      "SELECT current_pts, leader_paddle FROM auctions WHERE lot_id = $1",
      [LOT],
    );
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
    }>("SELECT user_id, hammer_pts, status FROM settlements WHERE lot_id = $1", [
      LOT,
    ]);
    expect(settlement!.user_id).toBe(second);
    expect(settlement!.hammer_pts).toBe(1250);
    expect(settlement!.status).toBe("due");
  });

  it("refuses a user who never bid on the lot", async () => {
    await seedClosedLot();
    const actor = await seedAdmin();
    const stranger = await seedUser(url, { phone: "99110009", paddle: "Т-900" });

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
    const bidder = await seedUser(url, { phone: "99110001", paddle: "Т-100" });
    await seedRunningLot(url, {
      lotId: LOT,
      currentPts: 1300,
      leaderPaddle: bidder.paddle,
    });
    await query(
      `INSERT INTO bids (lot_id, user_id, paddle, points, round, idempotency_key)
       VALUES ($1, $2, $3, 1300, 1, 'seed')`,
      [LOT, bidder.id, bidder.paddle],
    );
    const actor = await seedAdmin();

    const result = await awardLot(LOT, bidder.id, "Эрт зарлав", actor);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not-in-review");
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

describe("the clock naming the winner (the default)", () => {
  it("sells an expired lot to the standing leader the moment the ticker settles it", async () => {
    const { top } = await seedClosedLot({ manual: false });

    expect(await reviewQueue()).toHaveLength(0);
    await settleDueAuctions();

    const [auction] = await query<{
      outcome: string;
      leader_user_id: number;
      current_pts: number;
      awarded_by: number | null;
      manual_award: boolean;
    }>(
      `SELECT outcome, leader_user_id, current_pts, awarded_by, manual_award
         FROM auctions WHERE lot_id = $1`,
      [LOT],
    );
    expect(auction).toMatchObject({
      outcome: "sold",
      leader_user_id: top,
      current_pts: 1300,
      // NULL is how the record tells the clock's decision from a person's.
      awarded_by: null,
      manual_award: false,
    });

    // The same obligation an admin's award opens.
    const [settlement] = await query<{ user_id: number; hammer_pts: number }>(
      "SELECT user_id, hammer_pts FROM settlements WHERE lot_id = $1",
      [LOT],
    );
    expect(settlement).toEqual({ user_id: top, hammer_pts: 1300 });

    const audit = await query<{ action: string; actor_user_id: number | null }>(
      "SELECT action, actor_user_id FROM audit_log WHERE action = 'auction.sold'",
    );
    expect(audit).toEqual([{ action: "auction.sold", actor_user_id: null }]);

    expect(await reviewQueue()).toHaveLength(0);
  });

  it("tells the bidders exactly what an admin's award would", async () => {
    const { top, second } = await seedClosedLot({ manual: false });
    await settleDueAuctions();

    const sent = await query<{ user_id: number; kind: string }>(
      "SELECT user_id, kind FROM notifications ORDER BY user_id, kind",
    );
    expect(sent).toEqual(
      [
        { user_id: second, kind: "lot.decided" },
        { user_id: top, kind: "lot.won" },
      ].sort((a, b) => a.user_id - b.user_id),
    );
  });

  it("leaves a lot an admin is deciding in review, and sends nobody anything yet", async () => {
    await seedClosedLot({ manual: true });
    await settleDueAuctions();

    const [auction] = await query<{ outcome: string }>(
      "SELECT outcome FROM auctions WHERE lot_id = $1",
      [LOT],
    );
    expect(auction!.outcome).toBe("review");
    expect(await reviewQueue()).toHaveLength(1);

    /*
     * No "bidding closed, we are checking" message. An automatic lot does not
     * send one — it goes straight to the result — so sending it only for the
     * lots that wait would mark them out.
     */
    const sent = await query("SELECT 1 FROM notifications");
    expect(sent).toHaveLength(0);
  });
});

describe("switching who names the winner", () => {
  it("can be switched both ways while the lot is still taking bids", async () => {
    const admin = await seedAdmin();
    await seedClosedLot({ manual: false, bidClockMsFromNow: 60_000 });

    expect(await setManualAward(LOT, true, "Шалгах шаардлагатай", admin)).toEqual({
      ok: true,
    });
    let [row] = await query<{ manual_award: boolean }>(
      "SELECT manual_award FROM auctions WHERE lot_id = $1",
      [LOT],
    );
    expect(row!.manual_award).toBe(true);

    expect(await setManualAward(LOT, false, null, admin)).toEqual({ ok: true });
    [row] = await query<{ manual_award: boolean }>(
      "SELECT manual_award FROM auctions WHERE lot_id = $1",
      [LOT],
    );
    expect(row!.manual_award).toBe(false);

    const audit = await query<{ action: string }>(
      `SELECT action FROM audit_log WHERE action LIKE 'admin.award_%'
        ORDER BY id`,
    );
    expect(audit.map((a) => a.action)).toEqual([
      "admin.award_manual",
      "admin.award_automatic",
    ]);
  });

  it("cannot be switched once the lot has closed", async () => {
    const admin = await seedAdmin();
    await seedClosedLot({ manual: false });
    await settleDueAuctions();

    expect(await setManualAward(LOT, true, "Хэтэрхий оройтсон", admin)).toEqual({
      ok: false,
      reason: "already-closed",
    });
  });

  it("an emergency close is left for a person, even on an automatic lot", async () => {
    const admin = await seedAdmin();
    await seedClosedLot({ manual: false, bidClockMsFromNow: 60_000 });

    expect((await closeAuction(LOT, "Техникийн доголдол", admin)).ok).toBe(true);
    await settleDueAuctions();

    const [auction] = await query<{ outcome: string; manual_award: boolean }>(
      "SELECT outcome, manual_award FROM auctions WHERE lot_id = $1",
      [LOT],
    );
    expect(auction).toEqual({ outcome: "review", manual_award: true });
    expect(await reviewQueue()).toHaveLength(1);
  });
});
