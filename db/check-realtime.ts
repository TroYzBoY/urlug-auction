/**
 * ─────────────────────────────────────────────────────────────────────────────
 * IS THE REALTIME LAYER ACTUALLY WORKING ON THIS DEPLOYMENT?
 *
 * Run it against a deployed database, from inside the deployment:
 *
 *   fly ssh console --app <app> -C "node --experimental-strip-types db/check-realtime.ts"
 *   docker compose exec app node --experimental-strip-types db/check-realtime.ts
 *
 * ── Why this needs its own tool ──────────────────────────────────────────────
 *
 * The auction room is fed by Postgres LISTEN/NOTIFY: one listener connection
 * per instance (`src/lib/realtime.ts`), and every accepted bid publishes on the
 * `auction_changed` channel. If that path is broken, NOTHING ERRORS. No
 * exception, no 500, no failing health check — `/api/health` runs a query and a
 * query works fine. The only symptom is that a bidder watching a lot sees the
 * price stop moving, which is indistinguishable from a quiet room until the
 * clock runs out on somebody who thought they were still winning.
 *
 * The classic cause is a connection pooler. PgBouncer in TRANSACTION mode hands
 * each transaction whichever server connection is free, so a LISTEN registered
 * on one is simply not there for the next — the registration survives, pointing
 * at a connection nobody is reading. Session mode is fine. Nothing in the
 * connection string tells you which one you have, and managed Postgres
 * offerings routinely hand out the pooled endpoint by default.
 *
 * So this asserts the two database behaviours the app cannot run without, in
 * the same shapes the app uses them:
 *
 *   1. NOTIFY published through the POOL reaches a LISTEN on a DEDICATED client
 *      — exactly `publish()` reaching `subscribe()`.
 *   2. A session-scoped advisory lock can be taken — how the ticker elects one
 *      leader across instances. A pooler also breaks this, and a ticker that
 *      cannot hold its lock is an auction where no clock ever advances.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import pg from "pg";

/** Must match CHANNEL in src/lib/realtime.ts. */
const CHANNEL = "auction_changed";
/** Must differ from LOCK_KEY in src/lib/ticker.ts, so a live ticker is not disturbed. */
const PROBE_LOCK_KEY = 0x4d41_4931;
const WAIT_MS = 5_000;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

/* The host, with the password stripped — enough to tell a pooled endpoint from
   a direct one at a glance, without putting a credential in a log. */
const shown = connectionString.replace(/\/\/[^@]*@/, "//<redacted>@");
console.info(`Checking ${shown}\n`);

const listener = new pg.Client({ connectionString });
const pool = new pg.Pool({ connectionString, max: 2 });

/*
 * A unique payload per run. Without it a stale notification from a previous
 * run — or from a real bid landing at the same moment — could be mistaken for
 * this one's, and the check would pass while the path was broken.
 */
const token = `check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let failed = false;

try {
  await listener.connect();

  const { rows } = await listener.query("SHOW server_version");
  console.info(`server_version: ${rows[0].server_version}`);

  const delivered = new Promise<boolean>((resolve) => {
    listener.on("notification", (msg) => {
      if (msg.channel === CHANNEL && msg.payload === token) resolve(true);
    });
    setTimeout(() => resolve(false), WAIT_MS);
  });

  await listener.query(`LISTEN ${CHANNEL}`);

  /*
   * Published through the POOL, deliberately. That is what `publish()` does,
   * and it is the combination that fails under a transaction pooler: the
   * notify goes out on one server connection while the listen sits on another.
   */
  await pool.query("SELECT pg_notify($1, $2)", [CHANNEL, token]);

  if (await delivered) {
    console.info(`✅ LISTEN/NOTIFY  — delivered on "${CHANNEL}"`);
  } else {
    failed = true;
    console.error(
      `❌ LISTEN/NOTIFY  — nothing arrived on "${CHANNEL}" within ${WAIT_MS}ms.\n` +
        "   The auction room will not update for anybody: bids will be accepted\n" +
        "   and the price will not move on screen. Almost always a transaction-\n" +
        "   mode pooler in DATABASE_URL — point it at the database directly, or\n" +
        "   switch the pooler to session mode. See DEPLOY.md.",
    );
  }

  const lock = await listener.query<{ got: boolean }>(
    "SELECT pg_try_advisory_lock($1) AS got",
    [PROBE_LOCK_KEY],
  );
  if (lock.rows[0]?.got) {
    console.info("✅ advisory lock — acquired");
    await listener.query("SELECT pg_advisory_unlock($1)", [PROBE_LOCK_KEY]);
  } else {
    failed = true;
    console.error(
      "❌ advisory lock — refused. The ticker elects its leader with one of\n" +
        "   these, so no lot would ever advance a round or be hammered.",
    );
  }
} catch (err) {
  failed = true;
  console.error("❌ check failed to run:", err);
} finally {
  await listener.end().catch(() => {});
  await pool.end().catch(() => {});
}

console.info(failed ? "\nFAILED" : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
