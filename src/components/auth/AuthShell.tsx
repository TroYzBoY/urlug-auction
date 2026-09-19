import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";
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
      <SiteHeader />

      {/* pt-28 clears the fixed pill header, matching the other pages. */}
      <main
        id="main"
        className="gutter flex min-h-dvh flex-col justify-center pt-28 pb-16 md:pt-36"
      >
        <div className="auth-panel mx-auto w-full max-w-md">
          <p className="catalogue-label eyebrow">{t.brand.name}</p>

          <h1 className="display text-ink mt-4 text-[clamp(2rem,7vw,3rem)] leading-[1.02] tracking-[-0.035em]">
            {title}
          </h1>

          <p className="text-ink-soft mt-3 text-sm leading-relaxed">{lede}</p>

          {children}

          <p className="border-line/40 text-muted mt-8 border-t pt-6 text-sm">
            {altPrompt}{" "}
            <Link
              href={altHref}
              className="text-accent font-medium underline-offset-4 transition-opacity hover:underline hover:opacity-75"
            >
              {altLabel}
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
