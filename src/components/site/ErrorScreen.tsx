"use client";

import { t } from "@/lib/copy";

/**
 * What a visitor sees when a page fails to render, in place of Next's English
 * "Application error" screen. Shared by app/error.tsx and app/global-error.tsx.
 *
 * The error's own message is never shown. In production a server error reaches
 * the browser as a generic message and a digest, and the digest is all that is
 * printed: it is what matches the line in the server log, and it is something a
 * bidder can read out to whoever answers the phone.
 *
 * The way home is a plain link, not next/link: when the failure is in the root
 * layout, a client-side navigation would try to render that same layout again.
 * A full load starts clean.
 */
export function ErrorScreen({
  digest,
  onRetry,
}: {
  digest?: string;
  onRetry: () => void;
}) {
  return (
    <main
      id="main"
      className="gutter grid min-h-[70dvh] place-content-start pt-20 pb-16"
    >
      <p className="eyebrow text-rust">{t.error.eyebrow}</p>
      <h1 className="display text-ink mt-4 text-[clamp(2.25rem,9vw,4.5rem)]">
        {t.error.title}
      </h1>
      <p className="text-ink-soft mt-6 max-w-xl text-base leading-relaxed">
        {t.error.body}
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-5">
        <button
          type="button"
          onClick={onRetry}
          className="bg-accent text-accent-ink flex h-12 items-center px-6 text-[0.8125rem] font-bold tracking-[0.14em] uppercase transition-opacity hover:opacity-90"
        >
          {t.error.retry}
        </button>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full load on purpose; see above */}
        <a
          href="/"
          className="eyebrow border-accent text-accent border-b pb-1 transition-opacity hover:opacity-70"
        >
          ← {t.common.backHome}
        </a>
      </div>

      {digest && (
        <p data-numerals className="text-muted mt-10 text-xs">
          {t.error.code}: <span className="select-all">{digest}</span>
        </p>
      )}
    </main>
  );
}
