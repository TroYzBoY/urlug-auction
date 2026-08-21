import Link from "next/link";
import { Header } from "@/components/site/Header";
import { t } from "@/lib/copy";

/**
 * Shared frame for the two auth pages: a single narrow column, centred, with no
 * footer and no catalogue navigation. Sign-in is the one screen on the site with
 * exactly one job, so everything that could pull a visitor sideways is left out.
 */
export function AuthShell({
  title,
  lede,
  children,
  altPrompt,
  altLabel,
  altHref,
}: {
  title: string;
  lede: string;
  children: React.ReactNode;
  altPrompt: string;
  altLabel: string;
  altHref: string;
}) {
  return (
    <>
      <Header />

      {/* pt-28 clears the fixed pill header, matching the other pages. */}
      <main className="gutter flex min-h-dvh flex-col justify-center pt-28 pb-16 md:pt-36">
        <div className="mx-auto w-full max-w-sm">
          <p className="eyebrow text-muted">{t.brand.name}</p>

          <h1 className="display mt-4 text-[clamp(2rem,7vw,3rem)] leading-[1.02] tracking-[-0.035em] text-ink">
            {title}
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-ink-soft">{lede}</p>

          {children}

          <p className="mt-8 border-t border-line/40 pt-6 text-sm text-muted">
            {altPrompt}{" "}
            <Link
              href={altHref}
              className="font-medium text-accent underline-offset-4 transition-opacity hover:opacity-75 hover:underline"
            >
              {altLabel}
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
