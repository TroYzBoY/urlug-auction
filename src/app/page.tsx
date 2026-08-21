import { Footer } from "@/components/site/Footer";
import { Descent } from "@/components/descent/Descent";

/**
 * The front door.
 *
 * Purely cinematic: a fall from the street down to the door of the hall, with
 * exactly one thing on it that goes anywhere. Everything that *does* something
 * — the live lot, the round ladder, the index, the results — moved to
 * `/overview`, and the catalogue is at `/lots`.
 *
 * A Server Component rendering one Client Component. The landing has no data to
 * fetch, so nothing here is async; `Descent` owns the canvas and the scroll
 * engine, and `Footer` stays server-rendered beneath it so the page still ends
 * in real, crawlable navigation rather than a single decorative link.
 *
 * No `Header` on purpose. The piece is navbar-less by design — a floating
 * wordmark and one link, both inside `Descent`, with the full nav in the
 * footer.
 */
export default function Page() {
  return (
    <>
      <main>
        <Descent />
      </main>
      <Footer />
    </>
  );
}
