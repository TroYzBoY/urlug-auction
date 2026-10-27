import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  applySchema,
  resetDatabase,
  seedUser,
  testDatabaseUrl,
} from "../../../test/db";
import { POINT_MNT } from "../auction";
import { REGISTRATION_CONSENTS, TERMS_VERSION } from "../legal";
import { MAX_PAYMENT_MNT } from "../validation";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DESK — accounts and payments an admin enters by hand
 *
 * What a payment taken at the desk has to get right is not the arithmetic. It
 * is that it lands where every other payment lands — a paid `topups` row, a
 * `topup` ledger entry, a balance that agrees with the ledger — and that the
 * same money cannot be counted twice, whether the form is sent twice or the
 * same bank transfer is typed in twice.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const url = testDatabaseUrl();
process.env.DATABASE_URL = url;

/* Imported after DATABASE_URL is set — see the note in bids.integration.test.ts. */
let recordPayment: typeof import("./admin-write").recordPayment;
let adjustBalance: typeof import("./admin-write").adjustBalance;
let createUser: typeof import("./users").createUser;
let reconcileBalances: typeof import("./users").reconcileBalances;
let db: typeof import("../db") | null = null;
let query: typeof import("../db").query;

beforeAll(async () => {
  await applySchema(url);
  ({ recordPayment, adjustBalance } = await import("./admin-write"));
  ({ createUser, reconcileBalances } = await import("./users"));
  db = await import("../db");
  ({ query } = db);
});

afterAll(async () => {
  await db?.getPool().end();
});

beforeEach(async () => {
  await resetDatabase(url);
});

/** At zero, so the balance cache and the ledger agree before anything runs. */
async function seedAdmin() {
  const admin = await seedUser(url, {
    phone: "99119999",
    paddle: "Т-001",
    balancePts: 0,
  });
  await query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
  return { id: admin.id, ip: null, userAgent: null };
}

function payment(
  userId: number,
  overrides: Partial<Parameters<typeof recordPayment>[0]> = {},
): Parameters<typeof recordPayment>[0] {
  return {
    userId,
    amountMnt: 50 * POINT_MNT,
    method: "cash",
    providerRef: null,
    memo: "",
    idempotencyKey: crypto.randomUUID(),
    ...overrides,
  };
}

describe("recording a payment taken by hand", () => {
  it("credits the points and files it as a paid top-up", async () => {
    const bidder = await seedUser(url, {
      phone: "99110001",
      paddle: "Т-100",
      balancePts: 0,
    });
    const actor = await seedAdmin();

    const result = await recordPayment(
      payment(bidder.id, {
        method: "bank",
        providerRef: "TXN-0001",
        memo: "Хаан банк",
      }),
      actor,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.points).toBe(50);
    expect(result.balancePts).toBe(50);
    expect(result.duplicate).toBe(false);

    const [topup] = await query<{
      status: string;
      provider: string;
      provider_ref: string;
      points: number;
      amount_mnt: number;
      paid_at: Date | null;
    }>(
      "SELECT status, provider, provider_ref, points, amount_mnt, paid_at FROM topups WHERE user_id = $1",
      [bidder.id],
    );
    expect(topup!.status).toBe("paid");
    expect(topup!.provider).toBe("bank");
    expect(topup!.provider_ref).toBe("TXN-0001");
    expect(topup!.points).toBe(50);
    expect(topup!.amount_mnt).toBe(50 * POINT_MNT);
    expect(topup!.paid_at).not.toBeNull();

    /* A top-up, not a bonus — somebody paid for these. */
    const [entry] = await query<{
      kind: string;
      delta_pts: number;
      memo: string;
    }>("SELECT kind, delta_pts, memo FROM ledger_entries WHERE user_id = $1", [
      bidder.id,
    ]);
    expect(entry!.kind).toBe("topup");
    expect(entry!.delta_pts).toBe(50);
    expect(entry!.memo).toContain("Хаан банк");

    expect(await reconcileBalances()).toHaveLength(0);
  });

  it("tells the bidder, and names the operator in the audit log", async () => {
    const bidder = await seedUser(url, { phone: "99110001", paddle: "Т-100" });
    const actor = await seedAdmin();

    await recordPayment(payment(bidder.id), actor);

    const notes = await query<{ kind: string; channel: string }>(
      "SELECT kind, channel FROM notifications WHERE user_id = $1",
      [bidder.id],
    );
    expect(notes).toEqual([{ kind: "points.topup", channel: "inapp" }]);

    const audit = await query<{ actor_user_id: number }>(
      "SELECT actor_user_id FROM audit_log WHERE action = 'admin.payment_recorded'",
    );
    expect(audit).toEqual([{ actor_user_id: actor.id }]);
  });

  it("credits once when the same form arrives twice at once", async () => {
    const bidder = await seedUser(url, {
      phone: "99110001",
      paddle: "Т-100",
      balancePts: 0,
    });
    const actor = await seedAdmin();
    const same = payment(bidder.id);

    const results = await Promise.all([
      recordPayment(same, actor),
      recordPayment(same, actor),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.filter((r) => r.ok && r.duplicate)).toHaveLength(1);

    const [balance] = await query<{ pts: number }>(
      "SELECT pts FROM balances WHERE user_id = $1",
      [bidder.id],
    );
    expect(balance!.pts).toBe(50);
    expect(await query("SELECT id FROM topups")).toHaveLength(1);
  });

  it("refuses a bank transfer that was already recorded", async () => {
    const first = await seedUser(url, {
      phone: "99110001",
      paddle: "Т-100",
      balancePts: 0,
    });
    const second = await seedUser(url, {
      phone: "99110002",
      paddle: "Т-101",
      balancePts: 0,
    });
    const actor = await seedAdmin();

    await recordPayment(
      payment(first.id, { method: "bank", providerRef: "TXN-7" }),
      actor,
    );
    // Typed in again, by somebody else, for somebody else — a fresh form.
    const again = await recordPayment(
      payment(second.id, { method: "bank", providerRef: "TXN-7" }),
      actor,
    );
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.reason).toBe("ref-taken");

    const [balance] = await query<{ pts: number }>(
      "SELECT pts FROM balances WHERE user_id = $1",
      [second.id],
    );
    expect(balance!.pts).toBe(0);
    expect(await reconcileBalances()).toHaveLength(0);
  });

  it("refuses an amount that is not a whole number of points, or over the cap", async () => {
    const bidder = await seedUser(url, { phone: "99110001", paddle: "Т-100" });
    const actor = await seedAdmin();

    for (const amountMnt of [
      POINT_MNT + 500,
      0,
      -POINT_MNT,
      MAX_PAYMENT_MNT + POINT_MNT,
    ]) {
      const result = await recordPayment(
        payment(bidder.id, { amountMnt }),
        actor,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("bad-amount");
    }
    expect(await query("SELECT id FROM topups")).toHaveLength(0);
  });

  it("refuses an account that does not exist", async () => {
    const actor = await seedAdmin();
    const result = await recordPayment(payment(999_999), actor);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not-found");
  });
});

describe("a correction that would overdraw", () => {
  it("is refused without leaving a ledger row behind", async () => {
    const bidder = await seedUser(url, {
      phone: "99110001",
      paddle: "Т-100",
      balancePts: 0,
    });
    const actor = await seedAdmin();

    const result = await adjustBalance(
      bidder.id,
      -10,
      "Алдаатай хасалт",
      actor,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("would-overdraw");

    /*
     * The refusal returns rather than throws, so the transaction commits. With
     * the ledger written first, that committed an append-only entry the
     * balance never received.
     */
    expect(
      await query("SELECT id FROM ledger_entries WHERE user_id = $1", [
        bidder.id,
      ]),
    ).toHaveLength(0);
    expect(await reconcileBalances()).toHaveLength(0);
  });
});

describe("opening an account on somebody's behalf", () => {
  const person = {
    familyName: "Батбаяр",
    name: "Сарнай",
    phone: "88112233",
    passwordHash: "x",
    dateOfBirth: "1990-05-01",
    termsVersion: TERMS_VERSION,
    consents: REGISTRATION_CONSENTS,
    ip: null,
    userAgent: null,
  };

  it("creates a verified bidder with its consent rows, attributed to the operator", async () => {
    const actor = await seedAdmin();

    const created = await createUser({ ...person, createdBy: actor.id });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const [user] = await query<{ role: string; verified: boolean }>(
      "SELECT role, phone_verified_at IS NOT NULL AS verified FROM users WHERE id = $1",
      [created.userId],
    );
    // Verified, or the account could not bid until an SMS nobody sends arrived.
    expect(user).toEqual({ role: "bidder", verified: true });

    const consents = await query("SELECT id FROM consents WHERE user_id = $1", [
      created.userId,
    ]);
    expect(consents).toHaveLength(REGISTRATION_CONSENTS.length + 1);

    const [audit] = await query<{ action: string; actor_user_id: number }>(
      "SELECT action, actor_user_id FROM audit_log WHERE target_id = $1",
      [String(created.userId)],
    );
    expect(audit).toEqual({
      action: "admin.user_created",
      actor_user_id: actor.id,
    });
  });

  it("leaves a self-registered account unverified", async () => {
    const created = await createUser(person);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const [user] = await query<{ verified: boolean }>(
      "SELECT phone_verified_at IS NOT NULL AS verified FROM users WHERE id = $1",
      [created.userId],
    );
    expect(user!.verified).toBe(false);
  });

  it("refuses a number that already has an account", async () => {
    const actor = await seedAdmin();
    await createUser(person);

    const again = await createUser({ ...person, createdBy: actor.id });
    expect(again).toEqual({ ok: false, reason: "phone-taken" });
  });
});
