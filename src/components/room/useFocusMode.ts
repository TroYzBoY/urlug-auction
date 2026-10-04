"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FOCUS MODE — the room with everything but the bidding taken away
 *
 * A preference, not a page state: somebody who bids in focus mode on lot 101
 * wants it on lot 102 as well, so it is remembered on the device. localStorage
 * rather than a cookie because nothing on the server needs it — it changes what
 * is drawn, never what is allowed — and a cookie would travel with every
 * request for no reason. Listed on /privacy with the other device storage.
 *
 * `useSyncExternalStore` so the server render and the hydrating render agree
 * (off) and React swaps in the stored value straight after, with no hydration
 * mismatch and no hand-written effect to keep in step with the toggle.
 *
 * Storage can be missing or throw (private windows, blocked site data). The
 * toggle must still work for the visit, so the last value set is also kept in
 * memory and wins over a storage read that fails.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const KEY = "urlug.room.focus";

const listeners = new Set<() => void>();

/** The last value set in this tab. null until the toggle is first used. */
let memory: boolean | null = null;

function read(): boolean {
  if (memory !== null) return memory;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);

  // Another tab toggled it. Drop the in-memory copy so the new value is read.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    memory = null;
    onChange();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function useFocusMode(): [boolean, (on: boolean) => void] {
  const focus = useSyncExternalStore(subscribe, read, () => false);

  const setFocus = useCallback((on: boolean) => {
    memory = on;
    try {
      if (on) window.localStorage.setItem(KEY, "1");
      else window.localStorage.removeItem(KEY);
    } catch {
      // Remembered for this visit only; see `memory`.
    }
    for (const listener of listeners) listener();
  }, []);

  return [focus, setFocus];
}
