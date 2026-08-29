import type { Metadata } from "next";
import { Footer } from "@/components/site/Footer";
import { Descent } from "@/components/descent/Descent";
import { t } from "@/lib/copy";

export const metadata: Metadata = {
  title: t.nav.about,
  description: t.about.lede,
};

/**
 * About is the cinematic front door.
 *
 * The Descent — a fall from the street down to the door of the hall — used to
 * live at `/`; now the home is the catalogue and this piece is what "Бидний
 * тухай" opens. A Server Component rendering one Client Component: the landing
 * has no data to fetch, `Descent` owns the canvas and the scroll engine, and
 * `Footer` stays server-rendered beneath it so the page still ends in real,
 * crawlable navigation rather than a single decorative link.
 *
 * No `Header` on purpose. The piece is navbar-less by design — a floating
 * wordmark and one link, both inside `Descent`, with the full nav in the
 * footer.
 */
export default function AboutPage() {
  return (
    <>
      <main id="main">
        <Descent />
      </main>
      <Footer />
    </>
  );
}
