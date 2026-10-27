import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { reportError } from "@/lib/observability";
import { tickFor } from "@/lib/ticker";

/**
 * POST /api/cron/tick — the ticker, on a host with no process to run it in.
 *
 * Called by Supabase's pg_cron (db/supabase.sql) in every second that a clock is
 * close to due, and once an hour with `?sweep=1` for the housekeeping. On a
 * server that runs `startTicker` it is harmless: the ticker there holds the
 * lock, and this answers `leader: false` without doing anything.
 *
 * ⚠ AUTHENTICATED. It hammers lots and sends texts. `Authorization: Bearer
 * <CRON_SECRET>` — the header Vercel Cron sends too — and with no secret
 * configured it refuses everything rather than accepting anything.
 */

/*
 * Room for TICK_BUDGET_MS and an outbox batch finishing after it. Cut off in
 * the middle of that batch, messages already sent are not marked as sent, and
 * the next call texts them again.
 */
export const maxDuration = 60;

/*
 * How long one call keeps the clocks. Shorter than it could be, so that a call
 * is never killed holding work; pg_cron starts the next within a second.
 */
const TICK_BUDGET_MS = 30_000;

function authorised(request: Request): boolean {
  const secret = env.cronSecret;
  if (!secret) return false;
  const a = Buffer.from(request.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  // Length first: `timingSafeEqual` throws on a mismatch rather than failing.
  return a.length === b.length && timingSafeEqual(a, b);
}

async function tick(request: Request): Promise<Response> {
  if (!authorised(request)) {
    return new Response("Forbidden", { status: 403 });
  }

  const sweep = new URL(request.url).searchParams.get("sweep") === "1";

  try {
    const report = await tickFor(TICK_BUDGET_MS, { sweep });
    return Response.json(report, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    reportError(err, { event: "ticker.cron_failed" });
    return Response.json(
      { ok: false },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}

export async function POST(request: Request) {
  return tick(request);
}

/* Vercel Cron calls with GET, should a project schedule it there instead. */
export async function GET(request: Request) {
  return tick(request);
}
