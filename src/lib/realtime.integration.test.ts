import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { applySchema, testDatabaseUrl } from "../../test/db";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE LISTENER ON VERCEL
 *
 * A frozen Vercel instance keeps its connections open on Supabase's session
 * pooler, and fifteen of them take every slot it has. So there the listener
 * must close when the last stream on the instance does — and the next stream
 * must still hear its lot change.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const url = testDatabaseUrl();
process.env.DATABASE_URL = url;
// Read at module load by env.ts, so set before realtime is imported.
process.env.VERCEL = "1";

let realtime: typeof import("./realtime");
let db: typeof import("./db") | null = null;
let probe: Client;

beforeAll(async () => {
  await applySchema(url);
  realtime = await import("./realtime");
  db = await import("./db");
  probe = new Client({ connectionString: url });
  await probe.connect();
});

afterAll(async () => {
  await realtime?.shutdownRealtime();
  await db?.getPool().end();
  await probe?.end();
  delete process.env.VERCEL;
});

/** Connections that are sitting in LISTEN — the listener, and only it. */
async function listening(): Promise<number> {
  const res = await probe.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND query LIKE 'LISTEN %'`,
  );
  return res.rows[0]!.n;
}

async function eventually(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe("on Vercel", () => {
  it("closes the listener with the last stream, and reopens it for the next", async () => {
    const first = await realtime.subscribe("901", () => {});
    const second = await realtime.subscribe("902", () => {});
    expect(await listening()).toBe(1);

    // One stream left: still listening for it.
    first();
    expect(await listening()).toBe(1);

    second();
    await eventually(async () => (await listening()) === 0);

    const heard: string[] = [];
    const third = await realtime.subscribe("901", (lotId) => heard.push(lotId));
    expect(await listening()).toBe(1);

    await realtime.publish("901");
    await eventually(async () => heard.length === 1);
    expect(heard).toEqual(["901"]);
    third();
  });
});
