"use client";

import { useEffect, useRef, useState } from "react";
import { serverNow } from "@/lib/server-clock";

/**
 * Milliseconds remaining until `endsAt`, driven by requestAnimationFrame.
 *
 * `endsAt` is a deadline set by the SERVER, so the comparison is against
 * `serverNow()` — the local clock plus a measured offset — and not against
 * `Date.now()`. A browser whose clock is four seconds fast would otherwise show
 * round 6's five-second bid clock as one second.
 *
 * Three things this deliberately gets right:
 *
 * 1. Returns `null` before the first client frame. A countdown has no correct
 *    server value, so rendering `null` as a placeholder keeps the markup
 *    identical on both sides instead of mismatching on hydration.
 * 2. `granularityMs` suppresses state updates smaller than the display can
 *    show. The bid clock shows tenths and asks for 50ms; the round clock shows
 *    whole minutes and asks for 1000ms, so it re-renders once a second rather
 *    than sixty times.
 * 3. `onExpire` fires exactly once per `endsAt` value, from the rAF callback
 *    rather than during render, and the loop then stops until the parent
 *    supplies a new deadline.
 */
export function useCountdown(
  endsAt: number,
  { granularityMs = 50, onExpire }: { granularityMs?: number; onExpire?: () => void } = {},
) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const lastSet = useRef<number>(Number.POSITIVE_INFINITY);
  const firedFor = useRef<number>(0);
  const expire = useRef(onExpire);

  useEffect(() => {
    expire.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    let raf = 0;
    lastSet.current = Number.POSITIVE_INFINITY;

    const loop = () => {
      const left = endsAt - serverNow();

      if (left <= 0) {
        setRemaining(0);
        if (firedFor.current !== endsAt) {
          firedFor.current = endsAt;
          expire.current?.();
        }
        return; // Stop; a new endsAt restarts the effect.
      }

      if (Math.abs(lastSet.current - left) >= granularityMs) {
        lastSet.current = left;
        setRemaining(left);
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [endsAt, granularityMs]);

  return remaining;
}
