"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { toggleWatch } from "@/app/actions/watch";
import { t } from "@/lib/copy";

/**
 * The heart on a lot card: follow the lot from the grid without opening it.
 * The same action and the same optimistic flip as WatchButton on the lot
 * page, so the two can never disagree about whether a lot is followed.
 *
 * Signed out (`watching` null) it is a link to sign in that comes back here,
 * rather than a button that silently does nothing.
 */
export function CardWatch({
  lotId,
  watching,
}: {
  lotId: string;
  watching: boolean | null;
}) {
  const [optimistic, setOptimistic] = useOptimistic(watching ?? false);
  const [, startTransition] = useTransition();

  const heart = (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-4"
      fill={optimistic ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    >
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
    </svg>
  );

  if (watching === null) {
    return (
      <Link
        href="/login?redirect=/lots"
        className="card-action"
        aria-label={t.lots.watchSignIn}
        title={t.lots.watchSignIn}
      >
        {heart}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className="card-action"
      data-on={optimistic || undefined}
      aria-pressed={optimistic}
      aria-label={optimistic ? t.lots.watchRemove : t.lots.watchAdd}
      title={optimistic ? t.lots.watchRemove : t.lots.watchAdd}
      onClick={() =>
        startTransition(async () => {
          setOptimistic(!optimistic);
          await toggleWatch(lotId, !optimistic);
        })
      }
    >
      {heart}
    </button>
  );
}
