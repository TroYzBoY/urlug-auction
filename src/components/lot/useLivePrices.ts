"use client";

import { useSyncExternalStore } from "react";

/**
 * Live prices for the catalogue, shared by the marquee and every card.
 *
 * One poll of /api/live serves the whole page however many components read
 * it, and it runs only while at least one of them is mounted and the tab is
 * visible — a backgrounded catalogue costs nothing. See the route for why this
 * polls rather than streams.
 *
 * Until the first answer arrives, components show the price the server
 * rendered, so nothing waits on this to paint.
 */

export interface LivePrice {
  id: string;
  currentPts: number;
  bidCount: number;
  round: number;
  /** Epoch ms. */
  bidClockEndsAt: number;
}

const POLL_MS = 4000;
const EMPTY: ReadonlyMap<string, LivePrice> = new Map();

let snapshot: ReadonlyMap<string, LivePrice> = EMPTY;
const listeners = new Set<() => void>();
let timer = 0;

async function poll() {
  timer = 0;
  if (document.visibilityState === "visible") {
    try {
      const res = await fetch("/api/live", { cache: "no-store" });
      if (res.ok) {
        const { lots } = (await res.json()) as { lots: LivePrice[] };
        snapshot = new Map(lots.map((l) => [l.id, l]));
        for (const fn of listeners) fn();
      }
    } catch {
      /* A missed poll leaves the last prices standing; the next one retries. */
    }
  }
  if (listeners.size) timer = window.setTimeout(poll, POLL_MS);
}

function onVisible() {
  if (document.visibilityState === "visible" && listeners.size && timer) {
    window.clearTimeout(timer);
    void poll();
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  if (listeners.size === 1) {
    document.addEventListener("visibilitychange", onVisible);
    void poll();
  }
  return () => {
    listeners.delete(fn);
    if (!listeners.size) {
      window.clearTimeout(timer);
      timer = 0;
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}

/** Every live lot's latest price, keyed by lot id. Empty until the first poll. */
export function useLivePrices(): ReadonlyMap<string, LivePrice> {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  );
}
