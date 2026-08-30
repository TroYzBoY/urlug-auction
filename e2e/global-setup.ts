import { readFileSync } from "node:fs";
import { Client } from "pg";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * BRING THE TEST DATABASE UP TO DATE BEFORE ANYTHING RUNS
 *
 * The suite used to assume `urlug_test` already had a current schema, and
 * nothing ever put one there — `webServer` just points `next dev` at the
 * database and starts. That assumption holds right up until somebody adds a
 * column, and then it fails in the least helpful way available.
 *
 * What it looks like when it goes wrong: every page that reads a session
 * answers 500, because `currentUser()` selects a column that is not there. So
 * the failures land on the assertions AFTER the login — "notification button
 * not found", "New lot button not found", "expected 404, received 500" — and
 * sixteen tests point at sixteen innocent places while the actual cause is one
 * missing `ALTER TABLE`. That happened, and cost more time to diagnose than the
 * change that caused it.
 *
 * `db/schema.sql` is written to be idempotent, so this is cheap on every run
 * and correct on a fresh database.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export default async function globalSetup(): Promise<void> {
  const url =
    process.env.TEST_DATABASE_URL ??
    "postgres://urlug:urlug@localhost:5432/urlug_test";

  /*
   * The same guard test/db.ts uses, for the same reason. These tests register
   * accounts and place bids; the difference between the test database and the
   * development one is a character in a URL that gets copy-pasted between
   * terminals.
   */
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) {
    throw new Error(
      `Refusing to run e2e against "${name}". These tests write freely; the ` +
        "database name must end in _test. Set TEST_DATABASE_URL.",
    );
  }

  const client = new Client({ connectionString: url });
  try {
    await client.connect();
  } catch (cause) {
    throw new Error(
      `Cannot reach the test database at ${name}. Is it up? \`npm run db:up\``,
      { cause },
    );
  }

  try {
    await client.query(readFileSync("db/schema.sql", "utf8"));
  } finally {
    await client.end();
  }
}
