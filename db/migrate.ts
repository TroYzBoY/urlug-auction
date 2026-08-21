/**
 * Applies db/schema.sql.
 *
 * The schema is written to be idempotent (`CREATE TABLE IF NOT EXISTS`,
 * `CREATE OR REPLACE FUNCTION`, enum creation guarded by an exception handler),
 * so this is safe to run against a fresh database or an existing one.
 *
 * ⚠ This is a bootstrap, not a migration tool. It has no notion of ordering, of
 * what has already run, or of how to undo anything. It is enough to stand the
 * schema up; before the first production deploy, move to a real migration
 * runner so that column changes are reviewable and reversible.
 *
 *   node --experimental-strip-types db/migrate.ts
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. See .env.example.");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const sql = await readFile(join(here, "schema.sql"), "utf8");

const client = new Client({ connectionString });
await client.connect();

try {
  /*
   * One transaction for the whole file. A half-applied schema is far harder to
   * reason about than one that failed cleanly and left nothing behind.
   */
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  console.info("Schema applied.");
} catch (err) {
  await client.query("ROLLBACK");
  console.error("Migration failed, rolled back:", err);
  process.exitCode = 1;
} finally {
  await client.end();
}
