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
 * RECORDS THAT CANNOT BE REWRITTEN — against a real Postgres
 *
 * The audit trail, the consents and the money records refuse DELETE, and refuse
 * any UPDATE that would change what they say happened. A trigger is only worth
 * having if the ordinary flows still run through it, so both halves are here:
 * what is refused, and what must still work.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const url = testDatabaseUrl();
process.env.DATABASE_URL = url;

/* Imported after DATABASE_URL is set — see the note in bids.integration.test.ts. */
let recordPayment: typeof import("./admin-write").recordPayment;
let createTopup: typeof import("./topups").createTopup;
let settleTopup: typeof import("./topups").settleTopup;
let failTopup: typeof import("./topups").failTopup;
let saveImage: typeof import("./media").saveImage;
let readImage: typeof import("./media").readImage;
let sniffImage: typeof import("./media").sniffImage;
let db: typeof import("../db") | null = null;
let query: typeof import("../db").query;

beforeAll(async () => {
  await applySchema(url);
  ({ recordPayment } = await import("./admin-write"));
  ({ createTopup, settleTopup, failTopup } = await import("./topups"));
  ({ saveImage, readImage, sniffImage } = await import("./media"));
  db = await import("../db");
  ({ query } = db);
});

afterAll(async () => {
  await db?.getPool().end();
});

beforeEach(async () => {
  await resetDatabase(url);
});

async function seedAdmin() {
  const admin = await seedUser(url, {
    phone: "99119999",
    paddle: "Т-001",
    balancePts: 0,
  });
  await query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
  return { id: admin.id, ip: null, userAgent: null };
}

/** Runs `sql` and returns the database's refusal, or null if it went through. */
async function refusal(sql: string, params: unknown[] = []) {
  try {
    await query(sql, params);
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}

describe("the audit log", () => {
  it("cannot be edited or deleted", async () => {
    await query(
      "INSERT INTO audit_log (action, target_type, target_id) VALUES ('test.event', 'lot', '1')",
    );

    expect(await refusal("UPDATE audit_log SET action = 'edited'")).toMatch(
      /append-only/,
    );
    expect(await refusal("DELETE FROM audit_log")).toMatch(/append-only/);
    expect(await query("SELECT action FROM audit_log")).toEqual([
      { action: "test.event" },
    ]);
  });
});

describe("consents", () => {
  it("cannot be edited or deleted", async () => {
    const user = await seedUser(url, { phone: "99110001", paddle: "Т-100" });
    await query(
      "INSERT INTO consents (user_id, document, version) VALUES ($1, 'terms', 'v1')",
      [user.id],
    );

    expect(await refusal("UPDATE consents SET version = 'v2'")).toMatch(
      /append-only/,
    );
    expect(await refusal("DELETE FROM consents")).toMatch(/append-only/);
  });
});

describe("top-ups", () => {
  it("a paid top-up — including one an admin recorded by hand — cannot change or go", async () => {
    const bidder = await seedUser(url, {
      phone: "99110001",
      paddle: "Т-100",
      balancePts: 0,
    });
    const actor = await seedAdmin();
    await recordPayment(
      {
        userId: bidder.id,
        amountMnt: 50_000,
        method: "cash",
        providerRef: null,
        memo: "",
        idempotencyKey: crypto.randomUUID(),
      },
      actor,
    );

    expect(await refusal("UPDATE topups SET points = 5000")).toMatch(
      /can no longer change/,
    );
    expect(await refusal("UPDATE topups SET status = 'pending'")).toMatch(
      /can no longer change/,
    );
    expect(await refusal("DELETE FROM topups")).toMatch(/append-only/);

    const [row] = await query<{ points: number; status: string }>(
      "SELECT points, status FROM topups",
    );
    expect(row).toEqual({ points: 50, status: "paid" });
  });

  it("a pending top-up still settles, fails and expires as before", async () => {
    const bidder = await seedUser(url, { phone: "99110001", paddle: "Т-100" });

    const paid = await createTopup(bidder.id, 25, null);
    const failed = await createTopup(bidder.id, 60, null);
    const stale = await createTopup(bidder.id, 150, null);
    if (!paid.ok || !failed.ok || !stale.ok) throw new Error("setup failed");

    expect(await settleTopup(paid.topup.reference, "prov-1")).toMatchObject({
      ok: true,
      credited: true,
    });
    await failTopup(failed.topup.reference, "declined");
    await query(
      "UPDATE topups SET expires_at = now() - interval '1 minute' WHERE reference = $1",
      [stale.topup.reference],
    );
    expect(await settleTopup(stale.topup.reference, "prov-3")).toEqual({
      ok: false,
      reason: "expired",
    });

    const rows = await query<{ reference: string; status: string }>(
      "SELECT reference, status FROM topups ORDER BY id",
    );
    expect(rows.map((r) => r.status)).toEqual(["paid", "failed", "expired"]);
  });

  it("a pending top-up cannot have its price or its owner changed", async () => {
    const bidder = await seedUser(url, { phone: "99110001", paddle: "Т-100" });
    const created = await createTopup(bidder.id, 25, null);
    if (!created.ok) throw new Error("setup failed");

    expect(await refusal("UPDATE topups SET amount_mnt = 1")).toMatch(
      /only its outcome may change/,
    );
  });
});

describe("settlements and lot entries", () => {
  it("keep their winner, price and fee, and cannot be deleted", async () => {
    const bidder = await seedUser(url, { phone: "99110001", paddle: "Т-100" });
    await seedRunningLot(url, { lotId: "R01" });
    await query(
      `INSERT INTO settlements (lot_id, user_id, hammer_pts, due_by)
       VALUES ('R01', $1, 1500, now() + interval '7 days')`,
      [bidder.id],
    );
    await query(
      `INSERT INTO lot_participants (lot_id, user_id, entered_in_round, join_fee_pts)
       VALUES ('R01', $1, 2, 10)`,
      [bidder.id],
    );

    expect(await refusal("UPDATE settlements SET hammer_pts = 1")).toMatch(
      /winner and price are fixed/,
    );
    expect(await refusal("DELETE FROM settlements")).toMatch(/append-only/);
    // Its status may still move on.
    expect(
      await refusal("UPDATE settlements SET status = 'paid', paid_at = now()"),
    ).toBeNull();

    expect(
      await refusal("UPDATE lot_participants SET join_fee_pts = 0"),
    ).toMatch(/only first_bid_at may change/);
    expect(await refusal("DELETE FROM lot_participants")).toMatch(
      /append-only/,
    );
    expect(
      await refusal("UPDATE lot_participants SET first_bid_at = now()"),
    ).toBeNull();
  });
});

describe("roles", () => {
  it("has no staff role any more", async () => {
    const user = await seedUser(url, { phone: "99110001", paddle: "Т-100" });
    expect(
      await refusal("UPDATE users SET role = 'staff' WHERE id = $1", [user.id]),
    ).toMatch(/invalid input value for enum user_role/);
    expect(
      await refusal("UPDATE users SET role = 'admin' WHERE id = $1", [user.id]),
    ).toBeNull();
  });
});

describe("uploaded photographs", () => {
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

  it("are stored once per content and read back byte for byte", async () => {
    const actor = await seedAdmin();

    const id = await saveImage(JPEG, "image/jpeg", actor);
    expect(id).toMatch(/^[a-f0-9]{64}$/);
    expect(await saveImage(JPEG, "image/jpeg", actor)).toBe(id);

    const image = await readImage(id);
    expect(image?.contentType).toBe("image/jpeg");
    expect([...image!.bytes]).toEqual([...JPEG]);

    expect(await query("SELECT id FROM media")).toHaveLength(1);
    expect(
      await query(
        "SELECT id FROM audit_log WHERE action = 'admin.image_uploaded'",
      ),
    ).toHaveLength(1);
  });

  it("are recognised by their bytes, and anything else is refused", () => {
    expect(sniffImage(JPEG)).toBe("image/jpeg");
    expect(
      sniffImage(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]),
      ),
    ).toBe("image/png");
    expect(sniffImage(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe(
      "image/webp",
    );
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBe(
      null,
    );
    expect(sniffImage(new TextEncoder().encode("GIF89a"))).toBe(null);
  });
});
