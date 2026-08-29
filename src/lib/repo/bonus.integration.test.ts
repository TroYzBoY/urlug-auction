import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applySchema, resetDatabase, seedUser, testDatabaseUrl } from "../../../test/db";
import { MAX_BONUS_PTS } from "../validation";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FREE POINTS — against a real Postgres
 *
 * What matters about a gift of points is not that the number goes up. It is
 * that four rows in four tables agree afterwards, and this is the only place
 * that can be checked:
 *
 *   • the ledger carries `bonus`, not `adjustment`, so the accounts can still
 *     answer how many points in circulation were ever paid for
 *   • `balances` matches the sum of `ledger_entries` — the drift that
 *     `reconcileBalances` alarms on must not be created by the very control
 *     that hands out money
 *   • the recipient is notified, once per gift rather than once per bidder
 *   • the cap holds for a caller that never saw the form
 * ─────────────────────────────────────────────────────────────────────────────
 */

const url = testDatabaseUrl();
process.env.DATABASE_URL = url;

/* Imported after DATABASE_URL is set — see the note in bids.integration.test.ts. */
let grantBonus: typeof import("./admin-write").grantBonus;
let reconcileBalances: typeof import("./users").reconcileBalances;
let db: typeof import("../db") | null = null;
let query: typeof import("../db").query;

beforeAll(async () => {
  await applySchema(url);
  ({ grantBonus } = await import("./admin-write"));
  ({ reconcileBalances } = await import("./users"));
  db = await import("../db");
  ({ query } = db);
});

afterAll(async () => {
  await db?.getPool().end();
});

beforeEach(async () => {
  await resetDatabase(url);
});

/**
 * An admin to act as, opened at zero.
 *
 * ⚠ `seedUser`'s default balance is written straight into `balances` with no
 * matching ledger row, which is drift by construction — fine for the bid tests,
 * fatal for the reconciliation test below, which would report the harness's own
 * seeding as money appearing from nowhere. Every account here starts at zero so
 * the two tables agree before the code under test touches them.
 */
async function seedAdmin() {
  const admin = await seedUser(url, {
    phone: "99119999",
    paddle: "Т-001",
    balancePts: 0,
  });
  await query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
  return { id: admin.id, ip: null, userAgent: null };
}

describe("granting free points", () => {
  it("credits the bidder and records it as a bonus, not an adjustment", async () => {
    const bidder = await seedUser(url, { phone: "99110001", paddle: "Т-100", balancePts: 40 });
    const actor = await seedAdmin();

    const result = await grantBonus(bidder.id, 100, "Угтах бэлэг", actor);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.balancePts).toBe(140);

    const [entry] = await query<{ kind: string; delta_pts: number; memo: string }>(
      "SELECT kind, delta_pts, memo FROM ledger_entries WHERE user_id = $1",
      [bidder.id],
    );
    expect(entry!.kind).toBe("bonus");
    expect(entry!.delta_pts).toBe(100);
    // The memo is the bidder's, not the auditor's — they read it in their wallet.
    expect(entry!.memo).toBe("Угтах бэлэг");
  });

  it("leaves the balance cache agreeing with the ledger", async () => {
    const bidder = await seedUser(url, {
      phone: "99110001",
      paddle: "Т-100",
      balancePts: 0,
    });
    const actor = await seedAdmin();
    // Nothing is out of step before the grants — see the note on seedAdmin.
    expect(await reconcileBalances()).toHaveLength(0);

    await grantBonus(bidder.id, 100, "Урамшуулал", actor);
    await grantBonus(bidder.id, 25, "Дахин урамшуулал", actor);

    /*
     * The check the admin dashboard runs on every page load. A control that
     * writes money and puts this out of step is money appearing from nowhere.
     */
    expect(await reconcileBalances()).toHaveLength(0);
  });

  it("creates the wallet row when an account somehow has none", async () => {
    const bidder = await seedUser(url, { phone: "99110001", paddle: "Т-100" });
    await query("DELETE FROM balances WHERE user_id = $1", [bidder.id]);
    const actor = await seedAdmin();

    const result = await grantBonus(bidder.id, 60, "Хуучин бүртгэл", actor);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.balancePts).toBe(60);
  });

  it("notifies once per gift, so a second gift is not swallowed", async () => {
    const bidder = await seedUser(url, { phone: "99110001", paddle: "Т-100" });
    const actor = await seedAdmin();

    await grantBonus(bidder.id, 10, "Эхний бэлэг", actor);
    await grantBonus(bidder.id, 20, "Хоёр дахь бэлэг", actor);

    const notes = await query<{ kind: string; body: string }>(
      "SELECT kind, body FROM notifications WHERE user_id = $1 ORDER BY id",
      [bidder.id],
    );
    expect(notes).toHaveLength(2);
    expect(notes[0]!.kind).toBe("points.bonus");
    expect(notes[1]!.body).toContain("20");
  });

  it("refuses a negative amount — taking points back is an adjustment", async () => {
    const bidder = await seedUser(url, { phone: "99110001", paddle: "Т-100", balancePts: 40 });
    const actor = await seedAdmin();

    const result = await grantBonus(bidder.id, -10, "Буцаан авах", actor);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not-positive");

    const [balance] = await query<{ pts: number }>(
      "SELECT pts FROM balances WHERE user_id = $1",
      [bidder.id],
    );
    expect(balance!.pts).toBe(40);
  });

  it("refuses more than the cap, however the call arrives", async () => {
    const bidder = await seedUser(url, { phone: "99110001", paddle: "Т-100" });
    const actor = await seedAdmin();

    const result = await grantBonus(
      bidder.id,
      MAX_BONUS_PTS + 1,
      "Гараас дуудав",
      actor,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("too-large");

    const entries = await query("SELECT id FROM ledger_entries WHERE user_id = $1", [
      bidder.id,
    ]);
    expect(entries).toHaveLength(0);
  });

  it("refuses an account that does not exist", async () => {
    const actor = await seedAdmin();
    const result = await grantBonus(999_999, 50, "Байхгүй хүн", actor);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not-found");
  });
});
