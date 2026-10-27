import { afterAll, beforeAll, expect, it } from "vitest";
import { testDatabaseUrl } from "../../test/db";

/**
 * The statement timeout that keeps one runaway query from holding an auction
 * row's lock is set on each connection by a SET, not sent as a startup
 * parameter — see `getPool` in db.ts. Nothing else would notice if it stopped
 * being applied, so it is checked here, on a connection the pool handed out.
 */

const url = testDatabaseUrl();
process.env.DATABASE_URL = url;

/* Imported after DATABASE_URL is set — see the note in bids.integration.test.ts. */
let db: typeof import("./db") | null = null;

beforeAll(async () => {
  db = await import("./db");
});

afterAll(async () => {
  await db?.getPool().end();
});

it("hands out connections with the ten-second statement timeout", async () => {
  const row = await db!.queryOne<{ statement_timeout: string }>(
    "SHOW statement_timeout",
  );
  expect(row?.statement_timeout).toBe("10s");
});
