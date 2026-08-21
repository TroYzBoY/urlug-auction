import "server-only";
import { Client } from "pg";
import { env } from "./env";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * REAL-TIME FAN-OUT
 *
 * Postgres LISTEN/NOTIFY → one listener connection per app instance → the SSE
 * subscribers held in that instance's memory.
 *
 * ── Why not an in-process EventEmitter ───────────────────────────────────────
 *
 * Because it only works with exactly one instance. Bid arrives at instance A,
 * subscribers are spread across A and B, and everyone on B watches a frozen
 * price until they reload. Routing the notification through the database — the
 * one thing all instances already share — makes the count of instances stop
 * mattering.
 *
 * ── Why the payload is just an id ────────────────────────────────────────────
 *
 * NOTIFY payloads are capped at 8000 bytes and, more to the point, a payload
 * carrying state would race: two bids in the same millisecond produce two
 * notifications that can arrive in either order, and a subscriber applying the
 * second then the first would show a price going backwards. Sending only "lot
 * 014 changed" makes every subscriber re-read the row, so the worst case is a
 * redundant read, not a wrong price.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const CHANNEL = "auction_changed";

type Listener = (lotId: string) => void;

interface Hub {
  client: Client | null;
  connecting: Promise<void> | null;
  listeners: Map<string, Set<Listener>>;
  /** Set on shutdown so the reconnect loop stops trying. */
  closed: boolean;
}

declare global {
  var __maisonHub: Hub | undefined;
}

const hub: Hub = (globalThis.__maisonHub ??= {
  client: null,
  connecting: null,
  listeners: new Map(),
  closed: false,
});

async function connect(): Promise<void> {
  if (hub.closed || hub.client) return;

  /*
   * A dedicated Client, not a pooled one. A LISTEN registration belongs to the
   * connection that issued it; a pooled connection gets handed to some other
   * query and released, and the LISTEN goes with it.
   */
  const client = new Client({ connectionString: env.databaseUrl });

  client.on("notification", (msg) => {
    const lotId = msg.payload;
    if (!lotId) return;
    for (const fn of hub.listeners.get(lotId) ?? []) {
      try {
        fn(lotId);
      } catch (err) {
        console.error("[realtime] listener threw", err);
      }
    }
  });

  client.on("error", (err) => {
    console.error("[realtime] listener connection error", err);
    hub.client = null;
    void client.end().catch(() => {});
    scheduleReconnect();
  });

  client.on("end", () => {
    if (hub.client === client) {
      hub.client = null;
      scheduleReconnect();
    }
  });

  await client.connect();
  await client.query(`LISTEN ${CHANNEL}`);
  hub.client = client;
}

function scheduleReconnect(): void {
  if (hub.closed) return;
  /*
   * A flat 1s retry rather than exponential backoff. The failure this recovers
   * from is a database restart, which resolves in seconds, and during a sale
   * the cost of staying disconnected for a backed-off minute is every bidder
   * watching a dead clock. The connection count is one, so retrying is cheap.
   */
  setTimeout(() => {
    hub.connecting = null;
    void ensureListening().catch((err) =>
      console.error("[realtime] reconnect failed", err),
    );
  }, 1_000);
}

function ensureListening(): Promise<void> {
  hub.connecting ??= connect().catch((err) => {
    hub.connecting = null;
    scheduleReconnect();
    throw err;
  });
  return hub.connecting;
}

/**
 * Subscribes to changes on one lot. Returns an unsubscribe function that the
 * SSE handler must call from its `cancel` — a Set that only grows is a leak
 * that presents as memory climbing through a long sale.
 */
export async function subscribe(
  lotId: string,
  fn: Listener,
): Promise<() => void> {
  await ensureListening();

  let set = hub.listeners.get(lotId);
  if (!set) {
    set = new Set();
    hub.listeners.set(lotId, set);
  }
  set.add(fn);

  return () => {
    const current = hub.listeners.get(lotId);
    if (!current) return;
    current.delete(fn);
    if (current.size === 0) hub.listeners.delete(lotId);
  };
}

/**
 * Announces that a lot's state changed.
 *
 * ⚠ Call this AFTER the transaction commits, never inside it. A notification
 * sent from inside a transaction that then rolls back tells every subscriber to
 * go and read a bid that does not exist.
 *
 * (Postgres actually defers NOTIFY to commit, so an in-transaction call would
 * be correct here — but only because this code happens to use Postgres. Keeping
 * the call outside makes the ordering explicit and survives a change of
 * transport.)
 */
export async function publish(lotId: string): Promise<void> {
  const { getPool } = await import("./db");
  try {
    await getPool().query("SELECT pg_notify($1, $2)", [CHANNEL, lotId]);
  } catch (err) {
    /*
     * Swallowed on purpose. The bid is committed and durable; failing to
     * announce it means clients see it on their next poll or reconnect instead
     * of instantly. Rethrowing would turn a cosmetic delay into a failed bid
     * for a bidder whose money has already moved.
     */
    console.error("[realtime] publish failed", lotId, err);
  }
}

export async function shutdownRealtime(): Promise<void> {
  hub.closed = true;
  hub.listeners.clear();
  const client = hub.client;
  hub.client = null;
  if (client) await client.end().catch(() => {});
}
