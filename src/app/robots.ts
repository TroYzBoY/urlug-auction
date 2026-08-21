import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Auth, account and admin screens are disallowed — not as a security control
 * (robots.txt is a request, not a fence; the real gate is the session check on
 * each route) but because a sign-in form in search results is noise, and an
 * indexed `/admin` invites people to try the door.
 *
 * The SSE stream is excluded too: a crawler that opens it holds a connection
 * for the length of a sale.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/login",
        "/register",
        "/forgot",
        "/profile",
        "/wallet",
        "/admin",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
