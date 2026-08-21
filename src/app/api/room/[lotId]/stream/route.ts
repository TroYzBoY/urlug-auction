import type { NextRequest } from "next/server";
import { getRoomState } from "@/lib/repo/lots";
import { subscribe } from "@/lib/realtime";
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
 * Coalescing window. Ten bids in the last second of round 6 should produce a
 * few pushes, not ten round trips to the database per subscriber. Small enough
 * that nobody perceives it as lag.
 */
const COALESCE_MS = 60;

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

  const initial = await getRoomState(lotId, viewerId);
  if (!initial) {
    return new Response("Not found", { status: 404 });
  }

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

      send("state", initial);

      const push = async () => {
        try {
          const state = await getRoomState(lotId, viewerId);
          if (state) send("state", state);
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
