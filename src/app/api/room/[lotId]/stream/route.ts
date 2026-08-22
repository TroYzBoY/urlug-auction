import type { NextRequest } from "next/server";
import { hasBidOnLot, projectForViewer } from "@/lib/repo/lots";
import { subscribe } from "@/lib/realtime";
import { readRoom } from "@/lib/room-cache";
import { currentUser } from "@/lib/session";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ROOM STREAM (Server-Sent Events)
 *
 * `RoomState` out, nothing in. Bids travel the other way as a Server Function,
 * so this needs one direction only — which is exactly what SSE is, and it comes
 * with reconnection, `Last-Event-ID` and plain HTTP semantics for free.
 * WebSocket would add a second protocol, a second thing to keep alive through
 * proxies, and a bidirectional channel the design does not use.
 *
 * ⚠ DEPLOYMENT: this holds a connection open for the length of a sale (up to
 * 2h45m). It requires a long-running Node server. On a serverless platform the
 * function will be killed at the platform's execution limit; EventSource will
 * reconnect, but every bidder will reconnect every few minutes for hours. Run
 * this on a container or a VPS, or move the stream to a dedicated service.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Below any proxy idle timeout worth worrying about (nginx defaults to 60s). */
const HEARTBEAT_MS = 20_000;

/**
 * Coalescing window — and the single largest term in delivery latency, so it is
 * worth stating what it buys.
 *
 * Measured end to end (bid committed → arriving at a connected client), on one
 * machine with the database local:
 *
 *              fixed    per-subscriber
 *   60ms       ~64ms    ~0.2ms          (100 watchers: first 79ms, last 99ms)
 *   25ms       ~29ms    ~0.2ms
 *
 * Almost all of the fixed cost IS this window. The database transaction is 5ms
 * and the fan-out is 0.2ms a subscriber; everything else is waiting here.
 *
 * It was 60ms when each subscriber re-read the room for itself and a burst of
 * ten notifications meant ten reads per viewer. `src/lib/room-cache.ts` made a
 * burst cost one read for the whole instance, so the window no longer has to
 * pay for that — its remaining job is only to stop ten separate WRITES per
 * subscriber during a duel, which 25ms does just as well.
 *
 * ⚠ Not zero. Without a window, ten bids in the last second of round 6 become
 * ten serialise-and-write passes across every open connection, and that cost is
 * per-subscriber — precisely when the room is busiest and the clock is
 * shortest.
 */
const COALESCE_MS = 25;

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/room/[lotId]/stream">,
) {
  const { lotId } = await ctx.params;

  /*
   * Read on the server, never from a query parameter. `hasBid` and `isYou` are
   * per-viewer, and a client that could name its own viewer id would see
   * another bidder's participation state — and, through `hasBid`, could dodge
   * the late-entry floor.
   */
  const user = await currentUser();
  const viewerId = user?.id ?? null;

  const snapshot = await readRoom(lotId);
  if (!snapshot) {
    return new Response("Not found", { status: 404 });
  }

  /*
   * Read once, here. `hasBid` is sticky — a bidder cannot un-bid a lot — so it
   * is flipped to true below when a bid of theirs appears in the feed rather
   * than re-queried on every push. That is what keeps a push at zero
   * per-subscriber queries without ever reporting it wrongly, and reporting it
   * wrongly would matter: `hasBid` decides whether the late-entry floor
   * applies.
   */
  let viewerHasBid =
    viewerId !== null ? await hasBidOnLot(lotId, viewerId) : false;

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let coalesce: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // The client went away between the closed check and the enqueue.
          cleanup();
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        if (heartbeat) clearInterval(heartbeat);
        if (coalesce) clearTimeout(coalesce);
        try {
          controller.close();
        } catch {
          // Already closed; nothing to do.
        }
      };

      send("state", projectForViewer(snapshot, viewerId, viewerHasBid));

      const push = async () => {
        try {
          /*
           * `fresh: true` — the notification is the statement that whatever is
           * cached is out of date. Every subscriber on this instance watching
           * this lot shares the single read it starts.
           */
          const next = await readRoom(lotId, true);
          if (!next) return;

          if (viewerId !== null && !viewerHasBid) {
            viewerHasBid = next.bids.some((b) => b.userId === viewerId);
          }

          send("state", projectForViewer(next, viewerId, viewerHasBid));
        } catch (err) {
          console.error("[stream] read failed", lotId, err);
        }
      };

      unsubscribe = await subscribe(lotId, () => {
        if (coalesce) return;
        coalesce = setTimeout(() => {
          coalesce = null;
          void push();
        }, COALESCE_MS);
      });

      /*
       * The heartbeat is a comment line, which EventSource ignores. It exists
       * to keep intermediaries from closing an idle connection — round 1's bid
       * clock is five minutes, and a room can legitimately be silent for most
       * of it.
       *
       * It doubles as the liveness check: the enqueue throws once the client
       * has gone, which is how a browser closed without a clean disconnect gets
       * reaped instead of leaking a subscriber for the rest of the sale.
       */
      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          cleanup();
        }
      }, HEARTBEAT_MS);

      /*
       * Fires when the client disconnects. `cancel()` below covers the stream
       * being torn down from our side; this covers the browser's.
       */
      request.signal.addEventListener("abort", cleanup);
    },

    cancel() {
      closed = true;
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
      if (coalesce) clearTimeout(coalesce);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      // `no-transform` matters as much as `no-cache`: a proxy that gzips this
      // buffers it, and a buffered event stream is not a stream.
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Nginx buffers proxied responses by default, which delays every event
      // until the buffer fills. This is the documented opt-out.
      "x-accel-buffering": "no",
    },
  });
}
