import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Inter } from "next/font/google";
import "./globals.css";
import { MotionProvider } from "@/components/site/MotionProvider";
import { t } from "@/lib/copy";
import { SITE_URL } from "@/lib/site";
import {
  ANALYTICS_DOMAIN,
  ANALYTICS_SRC,
  analyticsEnabled,
} from "@/lib/analytics";

/**
 * Helvetica Neue leads the stack in globals.css; this is what everyone who does
 * not have it actually sees.
 *
 * Inter, not Manrope. Manrope is a geometric sans with circular bowls — beside
 * Helvetica it reads as a different typeface entirely, so Mac and Windows would
 * have looked like two different brands. Inter is a neo-grotesque cut from the
 * same lineage as Helvetica: same closed apertures, same horizontal terminals,
 * near-identical proportions. It also carries a full Cyrillic set, which the
 * Mongolian copy needs and which many Helvetica Neue cuts lack.
 *
 * Helvetica Neue is not web-licensed and does not exist on Windows or Android,
 * so it can only ever be *first* in a stack, never a webfont. If the client
 * licenses it, drop the woff2 files in /public/fonts and declare @font-face —
 * the stack order in globals.css already puts it ahead of this.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

/*
 * Built from copy.ts rather than written out, so renaming the house updates the
 * browser tab and the share cards too. These were hardcoded and kept saying
 * "ХУДАЛДАА" after the rename — metadata is user-facing copy like any other.
 */
const SITE_TITLE = `${t.brand.name} — ${t.brand.tagline}`;

export const metadata: Metadata = {
  /*
   * Without this, every relative URL in the metadata below — the OG image
   * above all — is emitted relative, and no platform that fetches a share card
   * resolves those. The card silently renders blank, which is the kind of bug
   * nobody notices until a link has already been posted.
   */
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s · ${t.brand.name}`,
  },
  description:
    "Зургаан тойрогтой, 2 цаг 45 минут үргэлжлэх дуудлага худалдаа. Тойрог давах тусам үнэ хаях хугацаа 5 минутаас 5 секунд болж хумирна.",
  openGraph: {
    title: SITE_TITLE,
    description:
      "Зургаан тойрог, 2 цаг 45 минут. Хугацаа хумигдана, шийдэмгий нь цохино.",
    type: "website",
    locale: "mn_MN",
  },
};

export const viewport: Viewport = {
  /* One colour, because there is one palette. It tints the browser chrome on
     Android and the status bar on iOS, so it has to match the page ground. */
  themeColor: "#17120e",
  colorScheme: "dark",
  /* The bid panel sits against the bottom edge — it needs the safe area. */
  viewportFit: "cover",
};

/*
 * Runs synchronously while the browser parses <head>.
 *
 * It used to do two things; now it does one. The theme half is gone with the
 * light palette — there is nothing to restore, so nothing can flash.
 *
 * What remains gates the scroll-reveal hidden state on proof that scripting is
 * alive. A script failure then degrades to plain visible content rather than a
 * blank page, which is the only reason this is inline and before paint at all.
 */
const BEFORE_PAINT = `(function(){try{document.documentElement.classList.add("js")}catch(e){}})()`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  /*
   * The CSP nonce, minted per request in src/proxy.ts. Next.js nonces its own
   * scripts by reading the CSP header; this one is ours, so it needs the value
   * explicitly or `script-src 'nonce-…' 'strict-dynamic'` blocks it and the
   * page loads with a white flash and no scroll reveals.
   *
   * ⚠ Reading headers() here opts the whole app out of static prerendering.
   * That was the reason the theme was kept in localStorage rather than a
   * cookie — but the trade has changed: the header now shows who is signed in
   * and the room renders per-viewer, so every page is request-scoped anyway.
   * The alternative is `unsafe-inline`, which is not a real CSP.
   */
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="mn" className={inter.variable} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: BEFORE_PAINT }} />
      </head>
      <body className="min-h-dvh antialiased">
        {/*
          Skip link. Every page here opens with a header, and on the room that
          header sits above a lot plate, a clock and a price — a keyboard or
          screen-reader user would otherwise tab through all of it on every
          navigation to reach the bid panel.

          Visually hidden until focused, which is the whole trick: `sr-only`
          plus `focus:not-sr-only` means it costs nothing visually and appears
          the instant somebody tabs into the page.
        */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-ground"
        >
          {t.common.skipToContent}
        </a>

        {analyticsEnabled && (
          /*
           * `defer`, and nonced so the CSP allows it. Analytics must never be
           * on the critical path of a page whose whole point is a clock.
           */
          <script
            nonce={nonce}
            defer
            src={ANALYTICS_SRC!}
            {...(ANALYTICS_DOMAIN ? { "data-domain": ANALYTICS_DOMAIN } : {})}
          />
        )}

        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
