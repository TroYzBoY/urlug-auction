"use client";

import { useOptimistic, useTransition } from "react";
import { toggleWatch } from "@/app/actions/watch";
import { t } from "@/lib/copy";

/**
 * Follow / unfollow a lot.
 *
 * `useOptimistic` rather than local state: the toggle flips on the click frame
 * and reconciles from the server, so a slow round trip does not leave the
 * button looking unresponsive — and if the write fails, React reverts it
 * rather than leaving the UI asserting something untrue.
 */
export function WatchButton({
  lotId,
  watching,
}: {
  lotId: string;
  watching: boolean;
}) {
  const [optimistic, setOptimistic] = useOptimistic(watching);
  const [, startTransition] = useTransition();

  return (
    <button
      type="button"
      aria-pressed={optimistic}
      onClick={() =>
        startTransition(async () => {
          setOptimistic(!optimistic);
          await toggleWatch(lotId, !optimistic);
        })
      }
      className={`eyebrow flex h-10 items-center gap-2 border px-4 transition-colors ${
        optimistic
          ? "border-accent text-accent"
          : "border-line text-ink-soft hover:border-line-strong hover:text-ink"
      }`}
    >
      <span aria-hidden>{optimistic ? "★" : "☆"}</span>
      {optimistic ? t.lot.watching : t.lot.watch}
    </button>
  );
}
