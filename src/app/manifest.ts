import type { MetadataRoute } from "next";
import { t } from "@/lib/copy";

/**
 * Enough for a bidder to add the site to a phone home screen and have it open
 * without browser chrome — which matters here more than on most sites, because
 * round 6's bid clock is five seconds and the address bar is 60px of the
 * viewport that the bid panel could be using.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${t.brand.name} — ${t.brand.tagline}`,
    short_name: t.brand.name,
    description: t.home.lede,
    // The catalogue, not the cinematic landing: someone who pinned the site
    // wants the lots, not the title sequence, every time.
    start_url: "/overview",
    display: "standalone",
    background_color: "#faf7f2",
    theme_color: "#17120e",
    lang: "mn",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
