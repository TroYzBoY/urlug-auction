"use client";

import { ErrorScreen } from "@/components/site/ErrorScreen";

/**
 * Catches a failure in any page below the root layout — the catalogue, a room,
 * an account page — and keeps the layout around it.
 *
 * `retry` re-fetches and re-renders the failed segment, which is what clears
 * most failures here: a database that blinked, a request that landed mid-deploy.
 */
export default function PageError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <ErrorScreen digest={error.digest} onRetry={retry} />;
}
