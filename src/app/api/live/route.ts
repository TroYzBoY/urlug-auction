import { livePrices, type LivePrice } from "@/lib/repo/home";
import { reportError } from "@/lib/observability";

/**
 * Where every live lot stands, for the catalogue's marquee and cards.
 *
 * ⚠ Polled, not streamed, on purpose. The room's SSE stream costs one held
 * connection per viewer, and fly.toml's concurrency limit is sized for one per
 * BIDDER. A front page opening a stream per live lot for every visitor would
 * spend that budget on people browsing, and bidders would be the ones turned
 * away. A poll every few seconds costs a short request each.
 *
 * Memoised in-process for two seconds, so a thousand visitors polling cost the
 * database one indexed query every two seconds, not a thousand. Two seconds is
 * well inside the poll interval, so nobody sees a price older than one poll.
 */
const TTL_MS = 2000;
let cache: { at: number; lots: LivePrice[] } | null = null;
let pending: Promise<LivePrice[]> | null = null;

async function current(): Promise<LivePrice[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.lots;
  /* One query in flight however many requests arrive during it. */
  pending ??= livePrices()
    .then((lots) => {
      cache = { at: Date.now(), lots };
      return lots;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

export async function GET() {
  try {
    return Response.json(
      { lots: await current() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    reportError(err, { event: "live.prices_unavailable" });
    return Response.json(
      { lots: [] },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
