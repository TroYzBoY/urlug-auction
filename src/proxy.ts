import { NextResponse, type NextRequest } from "next/server";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SECURITY HEADERS
 *
 * `proxy.ts` — the Next.js 16 name for what was `middleware.ts`. Runs before
 * every rendered route.
 *
 * Its job here is the Content-Security-Policy, which needs a fresh nonce per
 * request and therefore cannot be a static entry in `next.config.ts`. The
 * headers that ARE static live there instead, so they apply to `/api` and to
 * public files as well, which this matcher deliberately skips.
 *
 * ── The cost, stated plainly ─────────────────────────────────────────────────
 *
 * A nonce means the page must be dynamically rendered — a nonce baked into a
 * build-time HTML file is a nonce every visitor shares, which is no nonce at
 * all. The root layout therefore reads `headers()`, and the app gives up static
 * prerendering.
 *
 * That trade was not available before: the previous version of this app had no
 * accounts, so a cached HTML file was correct for everyone. Now the header
 * shows who is signed in and the room renders per-viewer state, so every page
 * was request-scoped regardless. The nonce costs nothing that had not already
 * been spent.
 *
 * The alternative — `script-src 'unsafe-inline'` — would keep prerendering and
 * defeat the point of having a CSP, on a site that holds sessions and money.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const isDev = process.env.NODE_ENV === "development";

  const csp = [
    "default-src 'self'",
    /*
     * `strict-dynamic` lets the nonced entry script load the chunks it needs
     * without every chunk URL being listed. `unsafe-eval` is required in
     * development only, where React uses eval to reconstruct server stacks.
     */
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    /*
     * `unsafe-inline` for styles, and it is not an oversight. framer-motion
     * animates by writing inline `style` attributes on every frame; a nonce
     * cannot cover those, and there is no hash for a value that changes 60
     * times a second. Style injection is a defacement risk rather than an
     * execution one, which is the reason this is the directive to concede.
     */
    "style-src 'self' 'unsafe-inline'",
    // next/font self-hosts Google Fonts at build time, so no external host.
    "font-src 'self'",
    "img-src 'self' blob: data:",
    // Same-origin only: the SSE stream and every Server Function are local.
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  /*
   * The nonce goes onto the REQUEST headers as well as the response. Next.js
   * reads it from the CSP header to nonce its own scripts, and the root layout
   * reads `x-nonce` to nonce the before-paint script — see src/app/layout.tsx.
   */
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      /*
       * Rendered routes only. `/api` gets its headers from next.config.ts — a
       * CSP on a JSON response does nothing, and adding one to the SSE stream
       * is a header per event's worth of noise for no benefit.
       *
       * Prefetches are skipped: they fetch RSC payloads, not documents, so the
       * nonce would be generated and discarded.
       */
      source: "/((?!api|_next/static|_next/image|favicon.ico|media|.*\\.\\w+$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
