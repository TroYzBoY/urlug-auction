import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getLots } from "@/lib/api";
import { absoluteUrl } from "@/lib/site";

/**
 * Static pages plus one entry per lot.
 *
 * ⚠ Reads the database, so it is a dynamic route. That is correct here — the
 * catalogue changes between sales and a sitemap frozen at build time would
 * advertise lots that have gone and omit the ones that are live.
 *
 * If the database is unreachable the static pages are still returned. A crawler
 * getting a partial sitemap is better than a 500, which some treat as a signal
 * to back off from the whole site.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  /*
   * Forces request-time rendering. Without it Next prerenders this at build,
   * where there is no database — the catch below would swallow the connection
   * error and bake a sitemap containing only the static pages, permanently.
   * The failure is silent, which is what makes it worth a line of code.
   */
  await connection();

  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/overview"), lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: absoluteUrl("/lots"), lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: absoluteUrl("/rules"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: absoluteUrl("/about"), lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: absoluteUrl("/contact"), lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: absoluteUrl("/terms"), lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: absoluteUrl("/privacy"), lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  try {
    const lots = await getLots();
    return [
      ...staticPages,
      ...lots.map((lot) => ({
        url: absoluteUrl(`/auction/${lot.id}`),
        lastModified: now,
        // A live lot changes by the second; a sold one never changes again.
        changeFrequency:
          lot.status === "live" ? ("hourly" as const) : ("monthly" as const),
        priority: lot.status === "live" ? 0.8 : 0.4,
      })),
    ];
  } catch (err) {
    console.error("[sitemap] catalogue unavailable", err);
    return staticPages;
  }
}
