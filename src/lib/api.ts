import "server-only";
import * as lots from "./repo/lots";
import type { Lot, RoomState } from "./types";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BACK-END SEAM
 *
 * Every read the app performs goes through this module. It used to return rows
 * from `src/lib/mock.ts`; it now delegates to `src/lib/repo/*`, which reads
 * Postgres. The signatures did not change, so nothing that calls these had to.
 *
 * Reads only. Writes are Server Functions in `src/app/actions/` — a mutation
 * reachable from a Client Component has to be a `'use server'` boundary, and
 * putting them here would blur the line between "anyone may call this" and
 * "this checks who is calling".
 *
 * ⚠ Everything here is `server-only`. Importing it from a Client Component is a
 * build error, which is the intent: these functions open database connections.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export async function getLots(): Promise<Lot[]> {
  return lots.getLots();
}

export async function getLot(id: string): Promise<Lot | null> {
  return lots.getLot(id);
}

/**
 * The lot the hero and the header CTA point at.
 *
 * Returns null between sales — the mock version could not, because there was
 * always a hard-coded lot to fall back to. Callers must handle an empty house;
 * a hero that 404s its own button is worse than one that says nothing is on.
 */
export async function getLiveLot(): Promise<Lot | null> {
  return lots.getLiveLot();
}

export async function getLiveLots(): Promise<Lot[]> {
  return lots.getLiveLots();
}

export async function getUpcomingLots(): Promise<Lot[]> {
  return lots.getUpcomingLots();
}

export async function getResultLots(): Promise<Lot[]> {
  return lots.getResultLots();
}

/**
 * The room's initial state, rendered into the page so the first paint is
 * correct before the SSE stream connects.
 *
 * `viewerUserId` comes from the session on the server. It is never a parameter
 * the client supplies — see the note on `getRoomState`.
 */
export async function getRoomState(
  lotId: string,
  viewerUserId: number | null,
): Promise<RoomState | null> {
  return lots.getRoomState(lotId, viewerUserId);
}

/**
 * The shape a bid attempt resolves to.
 *
 * Kept exported from here because `BidPanel` and `AuctionRoom` import it, and
 * the real implementation now lives behind a Server Function — see
 * `src/app/actions/bid.ts`.
 */
export type BidResult =
  | { ok: true; acceptedPts: number }
  | {
      ok: false;
      reason:
        | "too-low"
        | "round-closed"
        | "not-registered"
        | "not-verified"
        | "insufficient-funds"
        | "suspended"
        | "rate-limited"
        | "error";
    };
