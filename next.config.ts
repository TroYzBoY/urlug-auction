import type { NextConfig } from "next";

/**
 * Headers that do not need a per-request value live here rather than in
 * `src/proxy.ts`, so they cover `/api` and `/public` too — which the proxy
 * matcher deliberately skips. The Content-Security-Policy is the one exception:
 * it carries a nonce, so it has to be minted per request.
 */
const SECURITY_HEADERS = [
  {
    /*
     * Two years, with preload. ⚠ Turn this on only once the domain and every
     * subdomain are serving HTTPS: a browser that has seen this header refuses
     * plain HTTP for the whole period and there is no way to take it back
     * quickly. Preload submission is a further one-way door.
     */
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  /*
   * Send the origin cross-site, the full path same-site. The default
   * (`strict-origin-when-cross-origin`) is nearly this, but being explicit
   * matters on a site whose URLs contain lot ids that appear in a bidder's
   * history.
   */
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    // Nothing here uses a camera, a microphone or a location.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  /*
   * Isolates this origin from same-site pages in other processes, which is what
   * makes the session cookie unreachable from a compromised subdomain.
   */
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  /*
   * Traces the imports each route actually uses and emits a self-contained
   * server into .next/standalone, so the Docker image ships that instead of
   * the whole of node_modules. Affects `next build` only — `next dev` is
   * untouched.
   */
  output: "standalone",

  /* Naming the framework and its version to every visitor buys nothing. */
  poweredByHeader: false,

  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      {
        /*
         * The event stream must not be cached or buffered anywhere between the
         * server and the browser. The route sets these too; they are repeated
         * here so a CDN sees them on the response even if the platform strips
         * headers set inside a streamed body.
         */
        source: "/api/room/:path*/stream",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-transform" },
          { key: "X-Accel-Buffering", value: "no" },
        ],
      },
    ];
  },

  /*
   * `pg` opens TCP sockets and loads native-ish bindings; bundling it into the
   * server build breaks the LISTEN connection in src/lib/realtime.ts.
   * `@node-rs/argon2` is already externalised by Next.js's own list, but naming
   * it costs nothing and documents the requirement.
   */
  serverExternalPackages: ["pg", "@node-rs/argon2"],
};

export default nextConfig;
