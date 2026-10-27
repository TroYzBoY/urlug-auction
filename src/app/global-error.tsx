"use client";

import "./globals.css";
import { ErrorScreen } from "@/components/site/ErrorScreen";
import { t } from "@/lib/copy";

/**
 * Catches what error.tsx cannot: a failure in the root layout or template
 * itself. It replaces the whole document, so it brings its own <html>, <body>
 * and stylesheet — nothing from the layout reaches it.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="mn">
      <body className="bg-ground text-ink min-h-dvh antialiased">
        <title>{`${t.error.title} · ${t.brand.name}`}</title>
        <ErrorScreen digest={error.digest} onRetry={retry} />
      </body>
    </html>
  );
}
