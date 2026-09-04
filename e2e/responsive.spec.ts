import { expect, test } from "@playwright/test";
import { makeBidder, makeLiveLot, reset, signIn } from "./fixtures";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * IT HAS TO FIT ON THE PHONE PEOPLE ACTUALLY HAVE
 *
 * One assertion, on every page, at every width a real handset uses: the
 * document must not scroll sideways.
 *
 * ── Why horizontal overflow specifically ─────────────────────────────────────
 *
 * It is the failure that is both the most damaging and the easiest to ship
 * without noticing. A desktop browser at 1440px never shows it; a phone shows a
 * page that slides under the thumb, with the right-hand edge of every line cut
 * off and a bid button that drifts off screen while a five-second clock runs.
 * And a single element causes it — one unwrapped number, one fixed width, one
 * grid that cannot go narrower — so it is invisible in review and obvious to
 * everybody holding a phone.
 *
 * ── The widths ───────────────────────────────────────────────────────────────
 *
 * CSS pixels, which is what a layout sees — not the marketing resolution.
 * Chosen to cover the actual installed base rather than to be a round number:
 *
 *   280  Galaxy Z Fold, folded. The narrowest screen anybody browses on.
 *   320  iPhone SE (1st gen), iPhone 5s. Still in use, and the classic floor.
 *   360  Galaxy S8 through S24, and most of Android. The single commonest.
 *   375  iPhone SE 2/3, 6/7/8, 12/13 mini, X/XS/11 Pro.
 *   390  iPhone 12/13/14/15/16.
 *   412  Pixel, Galaxy S２x Ultra.
 *   430  iPhone 15/16 Pro Max — the widest phone, included because a layout
 *        can also break by stretching.
 *
 * Everything here is below Tailwind's `sm` (640px), so these all exercise the
 * UNPREFIXED styles. A rule that only appears at `sm:` is a rule no phone ever
 * sees.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const WIDTHS = [280, 320, 360, 375, 390, 412, 430] as const;

/** A tall viewport, so nothing is judged on a vertical scrollbar's account. */
const HEIGHT = 900;

/**
 * Reports the elements sticking out past the right edge, not merely that
 * something does.
 *
 * A bare "the page is 40px too wide" sends somebody hunting through every
 * component on it. The offender's tag, classes and measured box turns that into
 * a fix. Text nodes are skipped — only elements can be styled.
 */
interface OverflowReport {
  scrollWidth: number;
  clientWidth: number;
  offenders: {
    tag: string;
    cls: string;
    left: number;
    right: number;
    text: string;
  }[];
}

/**
 * Reports the elements sticking out past the right edge, not merely that
 * something does.
 *
 * A bare "the page is 40px too wide" sends somebody hunting through every
 * component on it. The offender's tag, classes and measured box turns that into
 * a fix. Text nodes are skipped — only elements can be styled.
 *
 * ⚠ A real function, passed by reference. Handed to `page.evaluate` as a
 * STRING, an arrow function is an expression that evaluates to a function
 * rather than being called, and every assertion then reads properties of
 * undefined — which looks exactly like fourteen failing pages.
 */
function overflowProbe(): OverflowReport {
  const docWidth = document.documentElement.clientWidth;
  const offenders: OverflowReport["offenders"] = [];

  for (const el of Array.from(document.querySelectorAll("body *"))) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    // 1px of tolerance: sub-pixel rounding is not a layout bug.
    if (r.right > docWidth + 1 || r.left < -1) {
      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.getAttribute("class") ?? "").slice(0, 120),
        left: Math.round(r.left),
        right: Math.round(r.right),
        text: (el.textContent ?? "").trim().slice(0, 40),
      });
    }
  }

  return {
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: docWidth,
    // The last few are the innermost: outer boxes usually just carry the
    // offender rather than being it.
    offenders: offenders.slice(-6),
  };
}

const PUBLIC_PAGES = ["/lots", "/rules", "/about", "/login", "/register", "/contact"];

test.beforeAll(async () => {
  await reset();
});

for (const width of WIDTHS) {
  test(`public pages fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: HEIGHT });

    for (const path of PUBLIC_PAGES) {
      await page.goto(path);
      const result = await page.evaluate(overflowProbe);
      expect(
        result.scrollWidth,
        `${path} at ${width}px overflows by ${
          result.scrollWidth - result.clientWidth
        }px. Offenders: ${JSON.stringify(result.offenders, null, 2)}`,
      ).toBeLessThanOrEqual(result.clientWidth + 1);
    }
  });
}

for (const width of WIDTHS) {
  test(`the auction room fits at ${width}px`, async ({ page }) => {
    /*
     * The room is checked signed IN. Signed out it hides the bid panel's
     * controls behind a sign-in link, which is the easy case — the step chips,
     * the custom-amount row and the commit button are what has to fit.
     */
    const lotId = `R${width}`;
    await makeLiveLot(lotId, 1200);
    const bidder = await makeBidder(`9911${String(width).padStart(4, "0")}`, `Т-${width}`);

    await page.setViewportSize({ width, height: HEIGHT });
    await signIn(page, bidder);
    await page.goto(`/auction/${lotId}`);

    const result = await page.evaluate(overflowProbe);
    expect(
      result.scrollWidth,
      `the room at ${width}px overflows by ${
        result.scrollWidth - result.clientWidth
      }px. Offenders: ${JSON.stringify(result.offenders, null, 2)}`,
    ).toBeLessThanOrEqual(result.clientWidth + 1);
  });
}
