import "server-only";
import { Pool, types, type PoolClient, type QueryResultRow } from "pg";
import { env } from "./env";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DATABASE
 *
 * One pool per process, cached on globalThis so `next dev`'s module reloading
 * does not open a new pool on every edit until Postgres refuses connections.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/*
 * pg returns int8 (BIGINT) as a string by default, because a bigint can exceed
 * Number.MAX_SAFE_INTEGER. Every int8 in this schema is an identity primary key
 * or a version counter — none will reach 2^53 — so parsing to a number keeps
 * ids comparable with `===` instead of scattering String() calls through the
 * repositories. Money is INT, never int8, so nothing here touches a price.
 */
types.setTypeParser(types.builtins.INT8, (v) => Number.parseInt(v, 10));

/*
 * NUMERIC would arrive as a string too. There is no NUMERIC in this schema on
 * purpose — see the header of db/schema.sql — so no parser is registered, and
 * if someone adds one later the string result will be loud rather than silently
 * wrong.
 */

declare global {
  var __urlugPool: Pool | undefined;
}

/**
 * The connection pool, created on first use.
 *
 * Lazy for the same reason src/lib/env.ts is: `next build` imports every server
 * module to collect page data, and a pool constructed at module load would read
 * DATABASE_URL then — making the build require production credentials to
 * compile a stylesheet. Nothing calls this until a request does.
 *
 * Cached on globalThis so `next dev`'s module reloading does not open a new
 * pool on every edit until Postgres refuses connections.
 */
export function getPool(): Pool {
  const existing = globalThis.__urlugPool;
  if (existing) return existing;

  const created = new Pool({
    connectionString: env.databaseUrl,
    max: env.dbPoolMax,
    // A bid must not sit behind a wedged connection while a 5-second clock
    // runs down. Fail fast and let the caller show a rejection.
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    // Postgres kills a statement that overruns this. Without it, one runaway
    // query can hold the `FOR UPDATE` lock on an auction row indefinitely and
    // freeze every bidder in that room.
    statement_timeout: 10_000,
  });

  /*
   * An idle client erroring (Postgres restarted, network blipped) emits on the
   * pool. Unhandled, this is an `error` event on an EventEmitter, which crashes
   * the process. pg discards the client itself; all we owe it is a log.
   */
  created.on("error", (err) => {
    console.error("[db] idle client error", err);
  });

  globalThis.__urlugPool = created;
  return created;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const res = await getPool().query<T>(text, params as never[]);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * Runs `fn` inside a transaction, rolling back on any throw.
 *
 * Every caller that touches money or the auction row goes through here. The
 * `finally` release is what keeps a thrown error from leaking a connection —
 * leak enough and the pool starves, which during a sale looks like the site
 * going down.
 */
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      // The connection is already broken; pg will discard it on release.
      console.error("[db] rollback failed", rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Postgres advisory lock, used to elect exactly one auction ticker across
 * however many app instances are running. `pg_try_advisory_lock` returns
 * immediately rather than queuing, so a second instance simply declines the job
 * instead of piling up blocked connections.
 *
 * The lock is held by the connection, so the caller must keep it and release it
 * on shutdown — see src/lib/ticker.ts.
 */
export async function tryAdvisoryLock(
  client: PoolClient,
  key: number,
): Promise<boolean> {
  const res = await client.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock($1) AS locked",
    [key],
  );
  return res.rows[0]?.locked === true;
}
