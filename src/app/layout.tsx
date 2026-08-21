import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Inter } from "next/font/google";
import "./globals.css";
import { MotionProvider } from "@/components/site/MotionProvider";
import { t } from "@/lib/copy";
import { SITE_URL } from "@/lib/site";

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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f2" },
    { media: "(prefers-color-scheme: dark)", color: "#17120e" },
  ],
  /* The bid panel sits against the bottom edge — it needs the safe area. */
  viewportFit: "cover",
};

/*
 * Runs synchronously while the browser parses <head>, so both effects land
 * before the first paint:
 *
 *   1. `data-theme` — the server prerenders the light default (a cookie read
 *      here would opt the whole app out of static prerendering). Applying the
 *      saved choice before paint is what prevents the white flash.
 *   2. `.js` — gates the scroll-reveal hidden state. Reveals only hide
 *      themselves once this class proves scripting is alive, so a script
 *      failure degrades to plain visible content instead of a blank page.
 *
 * "system" is stored as the absence of data-theme, letting the
 * prefers-color-scheme block in globals.css decide.
 */
const BEFORE_PAINT = `(function(){try{var d=document.documentElement;d.classList.add("js");var t=localStorage.getItem("theme");if(t==="light"||t==="dark")d.setAttribute("data-theme",t)}catch(e){}})()`;

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
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
