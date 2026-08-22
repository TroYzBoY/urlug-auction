import { getPool } from "@/lib/db";
import { reportError } from "@/lib/observability";

/**
 * Liveness and readiness in one endpoint, for the uptime monitor and for a
 * container orchestrator's health check.
 *
 * It queries the database rather than returning a bare 200. A process that is
 * up but cannot reach Postgres serves every page as an error, and a health
 * check that says "fine" through that is worse than no health check — it is the
 * reason nobody was paged.
 *
 * ⚠ Deliberately terse on failure. `{ ok: false }` and a 503 is all a monitor
 * needs; the reason goes to the log. An unauthenticated endpoint that returns
 * database error messages describes the schema to whoever asks.
 */
export async function GET() {
  const started = performance.now();

  try {
    // `SELECT 1` proves a connection can be checked out and a statement run —
    // which `pool.totalCount` or a TCP check would not.
    await getPool().query("SELECT 1");

    return Response.json(
      { ok: true, ms: Math.round(performance.now() - started) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    reportError(err, { event: "health.database_unreachable" });
    return Response.json(
      { ok: false },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
