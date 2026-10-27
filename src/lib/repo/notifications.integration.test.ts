import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  applySchema,
  resetDatabase,
  seedUser,
  testDatabaseUrl,
} from "../../../test/db";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE OUTBOX WHEN THE GATEWAY SAYS NO — against a real Postgres
 *
 * The path that only runs when a text fails, which is exactly the path nobody
 * sees working. It used to fail itself: its UPDATE could not be planned, so a
 * single refused text rolled the whole batch back — the texts already sent in
 * it went out again on the next pass, and the refused one was retried for ever
 * instead of being given up on.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const url = testDatabaseUrl();
process.env.DATABASE_URL = url;

/* Imported after DATABASE_URL is set — see the note in bids.integration.test.ts. */
let deliverPending: typeof import("./notifications").deliverPending;
let db: typeof import("../db") | null = null;
let query: typeof import("../db").query;

/** A stand-in SMS gateway: refuses this number, accepts every other. */
const REFUSED = "99110001";
let gateway: Server | null = null;

beforeAll(async () => {
  gateway = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const { to } = JSON.parse(body) as { to: string };
      res.statusCode = to === REFUSED ? 500 : 200;
      res.end();
    });
  });
  await new Promise<void>((resolve) =>
    gateway!.listen(0, "127.0.0.1", resolve),
  );
  const { port } = gateway.address() as AddressInfo;
  process.env.SMS_API_URL = `http://127.0.0.1:${port}/send`;

  await applySchema(url);
  ({ deliverPending } = await import("./notifications"));
  db = await import("../db");
  ({ query } = db);
});

afterAll(async () => {
  delete process.env.SMS_API_URL;
  // Vitest hangs on an open pool. Guarded because beforeAll may not have got
  // this far — see the same note in bids.integration.test.ts.
  await db?.getPool().end();
  await new Promise((resolve) => gateway?.close(resolve));
});

beforeEach(async () => {
  await resetDatabase(url);
});

async function queueText(userId: number): Promise<void> {
  await query(
    `INSERT INTO notifications (user_id, channel, kind, body, dedupe_key)
     VALUES ($1, 'sms', 'test', 'Сайн байна уу', 'test')`,
    [userId],
  );
}

describe("deliverPending", () => {
  it("records a refused text and keeps the rest of the batch", async () => {
    const refused = await seedUser(url, { phone: REFUSED, paddle: "Т-100" });
    const accepted = await seedUser(url, {
      phone: "99110002",
      paddle: "Т-200",
    });
    await queueText(refused.id);
    await queueText(accepted.id);

    expect(await deliverPending()).toBe(1);

    const rows = await query<{
      user_id: number;
      status: string;
      attempts: number;
    }>("SELECT user_id, status, attempts FROM notifications ORDER BY user_id");
    expect(rows).toEqual([
      { user_id: refused.id, status: "pending", attempts: 1 },
      // Sent, and stays sent: the refusal beside it did not undo it.
      { user_id: accepted.id, status: "sent", attempts: 0 },
    ]);
  });

  it("gives up on a text after three refusals", async () => {
    const refused = await seedUser(url, { phone: REFUSED, paddle: "Т-100" });
    await queueText(refused.id);

    for (let i = 0; i < 3; i++) await deliverPending();

    const [row] = await query<{ status: string; attempts: number }>(
      "SELECT status, attempts FROM notifications",
    );
    expect(row).toEqual({ status: "failed", attempts: 3 });

    // And it is left alone after that, rather than retried every pass.
    expect(await deliverPending()).toBe(0);
    const [after] = await query<{ attempts: number }>(
      "SELECT attempts FROM notifications",
    );
    expect(after!.attempts).toBe(3);
  });
});
