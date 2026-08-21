import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applySchema, resetDatabase, testDatabaseUrl } from "../../../test/db";
import { REGISTRATION_CONSENTS } from "../legal";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ACCOUNTS, CODES AND MONEY — against a real Postgres
 *
 * Covers the repository layer, not the Server Actions. The actions in
 * `src/app/actions/auth.ts` are thin — parse, rate-limit, delegate — and their
 * remaining logic (`cookies()`, `redirect()`) belongs to a request, which a
 * test runner does not have. What is worth proving here is the layer beneath:
 * that a duplicate phone is refused, that a code dies after five wrong guesses,
 * and that money cannot be created by calling a function twice.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const url = testDatabaseUrl();
process.env.DATABASE_URL = url;

let users: typeof import("./users");
let sms: typeof import("../sms");
let password: typeof import("../password");
let db: typeof import("../db");
let dbLoaded: typeof import("../db") | null = null;

beforeAll(async () => {
  await applySchema(url);
  users = await import("./users");
  sms = await import("../sms");
  password = await import("../password");
  db = await import("../db");
  dbLoaded = db;
});

afterAll(async () => {
  // Guarded: if beforeAll failed to connect, the real error should surface
  // rather than "getPool is not a function" from the teardown.
  await dbLoaded?.getPool().end();
});

beforeEach(async () => {
  await resetDatabase(url);
});

function newUser(phone = "99110001") {
  return {
    name: "Батбаяр",
    phone,
    passwordHash: "argon2-placeholder",
    // Comfortably over 18, and fixed rather than computed from `now` so the
    // fixture does not quietly become an under-age one in eighteen years.
    dateOfBirth: "1995-06-15",
    termsVersion: "2026-08-21",
    consents: REGISTRATION_CONSENTS,
    ip: null,
    userAgent: null,
  };
}

describe("registration", () => {
  it("creates a user, a paddle and a zero balance together", async () => {
    const res = await users.createUser(newUser());

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.paddle).toMatch(/^Т-\d{3,4}$/);
    expect(await users.getBalance(res.userId)).toBe(0);
  });

  it("refuses a phone number that is already registered", async () => {
    await users.createUser(newUser());
    const second = await users.createUser(newUser());

    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("phone-taken");
  });

  it("survives concurrent registrations without a paddle collision", async () => {
    /*
     * The paddle is chosen at random from 900 labels, so 40 simultaneous
     * registrations will collide. Every one must still succeed: the insert
     * uses ON CONFLICT DO NOTHING and retries with a fresh label, rather than
     * raising a unique violation that aborts the transaction.
     */
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        users.createUser(newUser(`9911${String(i).padStart(4, "0")}`)),
      ),
    );

    expect(results.every((r) => r.ok)).toBe(true);

    const paddles = await db.query<{ paddle: string }>("SELECT paddle FROM users");
    expect(paddles).toHaveLength(40);
    expect(new Set(paddles.map((p) => p.paddle)).size).toBe(40);
  });

  it("records a consent row per document, plus the age", async () => {
    const created = await users.createUser(newUser());
    if (!created.ok) throw new Error("setup failed");

    const rows = await db.query<{ document: string; version: string }>(
      "SELECT document, version FROM consents WHERE user_id = $1 ORDER BY document",
      [created.userId],
    );

    // terms, privacy, rules — and `age`, whose version is the date of birth
    // itself, so the record answers "were they old enough on the day" without
    // a second lookup.
    expect(rows.map((r) => r.document).sort()).toEqual([
      "age",
      "privacy",
      "rules",
      "terms",
    ]);
    expect(rows.find((r) => r.document === "age")!.version).toBe("1995-06-15");
  });

  it("records the registration in the audit log", async () => {
    await users.createUser(newUser());
    const rows = await db.query<{ detail: Record<string, unknown> }>(
      "SELECT detail FROM audit_log WHERE action = 'user.registered'",
    );
    expect(rows).toHaveLength(1);
    // The phone number is deliberately absent — the audit log is read far more
    // widely than the users table.
    expect(rows[0]!.detail).not.toHaveProperty("phone");
  });
});

describe("passwords", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const hash = await password.hashPassword("нууц-үг-12345");
    expect(await password.verifyPassword(hash, "нууц-үг-12345")).toBe(true);
    expect(await password.verifyPassword(hash, "буруу-нууц-үг")).toBe(false);
  });

  it("returns false rather than throwing on a corrupt stored hash", async () => {
    // One bad row should fail one login, not 500 the sign-in page.
    expect(await password.verifyPassword("not-a-hash", "anything")).toBe(false);
  });

  it("produces a different hash for the same password", async () => {
    const a = await password.hashPassword("нэг-ижил-нууц-үг");
    const b = await password.hashPassword("нэг-ижил-нууц-үг");
    // Different salts. Equal hashes would mean two users with the same
    // password are identifiable as such from the table alone.
    expect(a).not.toBe(b);
  });
});

describe("one-time codes", () => {
  /** The dev SMS path logs the code; this is how a test reads it. */
  async function issueAndCapture(phone: string, purpose: "verify" | "reset") {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      await sms.issueCode(phone, purpose);
      const logged = spy.mock.calls.flat().join(" ");
      const code = /(\d{6})/.exec(logged)?.[1];
      if (!code) throw new Error("No code found in the dev SMS log");
      return code;
    } finally {
      spy.mockRestore();
    }
  }

  it("accepts the code it issued, once", async () => {
    const code = await issueAndCapture("99110001", "verify");

    expect(await sms.verifyCode("99110001", "verify", code)).toBe("ok");
    // Consumed: a code that works twice is a code that can be replayed.
    expect(await sms.verifyCode("99110001", "verify", code)).toBe("invalid");
  });

  it("rejects a wrong code", async () => {
    const code = await issueAndCapture("99110001", "verify");
    const wrong = code === "000000" ? "111111" : "000000";
    expect(await sms.verifyCode("99110001", "verify", wrong)).toBe("invalid");
  });

  it("dies after five wrong guesses", async () => {
    const code = await issueAndCapture("99110001", "verify");
    const wrong = code === "000000" ? "111111" : "000000";

    for (let i = 0; i < 4; i++) {
      expect(await sms.verifyCode("99110001", "verify", wrong)).toBe("invalid");
    }
    expect(await sms.verifyCode("99110001", "verify", wrong)).toBe("exhausted");

    /*
     * And the real code no longer works either. Six digits is a million
     * possibilities, which a rate limit alone does not protect for as long as
     * the code stays alive — the attempt counter is what closes it.
     */
    expect(await sms.verifyCode("99110001", "verify", code)).toBe("exhausted");
  });

  it("invalidates the previous code when a new one is issued", async () => {
    const first = await issueAndCapture("99110001", "verify");
    const second = await issueAndCapture("99110001", "verify");

    expect(await sms.verifyCode("99110001", "verify", first)).toBe("invalid");
    expect(await sms.verifyCode("99110001", "verify", second)).toBe("ok");
  });

  it("keeps verify and reset codes apart", async () => {
    const verifyCode = await issueAndCapture("99110001", "verify");
    await issueAndCapture("99110001", "reset");

    // A code sent to confirm a number must not also change its password.
    expect(await sms.verifyCode("99110001", "reset", verifyCode)).toBe("invalid");
  });

  it("stores only the hash of the code", async () => {
    const code = await issueAndCapture("99110001", "verify");
    const rows = await db.query<{ code_hash: string }>(
      "SELECT code_hash FROM otp_codes",
    );
    expect(rows[0]!.code_hash).not.toContain(code);
  });
});

describe("verification and reset", () => {
  it("marks a phone verified", async () => {
    const created = await users.createUser(newUser());
    expect(created.ok).toBe(true);

    let user = await users.findByPhone("99110001");
    expect(user!.phone_verified_at).toBeNull();

    await users.markPhoneVerified("99110001");
    user = await users.findByPhone("99110001");
    expect(user!.phone_verified_at).not.toBeNull();
  });

  it("changes a password", async () => {
    const created = await users.createUser(newUser());
    if (!created.ok) throw new Error("setup failed");

    const next = await password.hashPassword("шинэ-нууц-үг-123");
    await users.setPassword(created.userId, next);

    const user = await users.findByPhone("99110001");
    expect(await password.verifyPassword(user!.password_hash, "шинэ-нууц-үг-123")).toBe(true);
  });
});

describe("the ledger", () => {
  it("moves the balance and records why", async () => {
    const created = await users.createUser(newUser());
    if (!created.ok) throw new Error("setup failed");

    await users.credit({
      userId: created.userId,
      deltaPts: 100,
      kind: "topup",
      refType: "payment",
      refId: "qpay-abc-123",
    });

    expect(await users.getBalance(created.userId)).toBe(100);
  });

  it("applies a repeated top-up exactly once", async () => {
    const created = await users.createUser(newUser());
    if (!created.ok) throw new Error("setup failed");

    const entry = {
      userId: created.userId,
      deltaPts: 100,
      kind: "topup" as const,
      refType: "payment",
      refId: "qpay-abc-123",
    };

    const first = await users.credit(entry);
    // A retried payment webhook, or a double-submitted form.
    const second = await users.credit(entry);

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    expect(await users.getBalance(created.userId)).toBe(100);
  });

  it("refuses a movement that would overdraw, leaving nothing behind", async () => {
    const created = await users.createUser(newUser());
    if (!created.ok) throw new Error("setup failed");
    await users.credit({ userId: created.userId, deltaPts: 10, kind: "topup" });

    await expect(
      users.credit({ userId: created.userId, deltaPts: -50, kind: "adjustment" }),
    ).rejects.toThrow(/overdraw/);

    // The ledger row must roll back with the balance, or the two stop agreeing.
    expect(await users.getBalance(created.userId)).toBe(10);
    const entries = await db.query(
      "SELECT 1 FROM ledger_entries WHERE user_id = $1",
      [created.userId],
    );
    expect(entries).toHaveLength(1);
  });

  it("is append-only", async () => {
    const created = await users.createUser(newUser());
    if (!created.ok) throw new Error("setup failed");
    await users.credit({ userId: created.userId, deltaPts: 10, kind: "topup" });

    await expect(
      db.query("UPDATE ledger_entries SET delta_pts = 999"),
    ).rejects.toThrow(/append-only/);
  });

  it("reconciles the cached balance against the sum of entries", async () => {
    const created = await users.createUser(newUser());
    if (!created.ok) throw new Error("setup failed");

    await users.credit({ userId: created.userId, deltaPts: 100, kind: "topup" });
    await users.credit({ userId: created.userId, deltaPts: -30, kind: "join_fee" });

    expect(await users.getBalance(created.userId)).toBe(70);
    // The whole point of the cache is that this returns nothing.
    expect(await users.reconcileBalances()).toEqual([]);
  });

  it("detects a balance that has drifted from its entries", async () => {
    const created = await users.createUser(newUser());
    if (!created.ok) throw new Error("setup failed");
    await users.credit({ userId: created.userId, deltaPts: 100, kind: "topup" });

    // Simulate the drift a logic bug would cause.
    await db.query("UPDATE balances SET pts = 999 WHERE user_id = $1", [
      created.userId,
    ]);

    const drift = await users.reconcileBalances();
    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatchObject({ cached: 999, actual: 100 });
  });
});
