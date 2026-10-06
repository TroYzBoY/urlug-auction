import { expect, test } from "@playwright/test";
import {
  clockLeftOf,
  finalRoundEndingIn,
  makeBidder,
  makeLiveLot,
  reset,
  signIn,
} from "./fixtures";

/**
 * The room on a phone: one screen, focus mode, and the moment bidding stops.
 *
 * responsive.spec.ts already proves nothing sticks out sideways. These prove
 * the vertical half — that the bid button is ON the screen without a scroll —
 * at the sizes a phone actually leaves for the page once the browser has drawn
 * its own bars, not the device's nominal resolution.
 */

/*
 * 375×548 is an iPhone SE in Safari with both toolbars showing — the smallest
 * real viewport this has to fit. 360×640 is the commonest Android width at a
 * typical visible height.
 */
const PHONES = [
  { width: 375, height: 548 },
  { width: 360, height: 640 },
] as const;

test.beforeEach(async () => {
  await reset();
});

for (const { width, height } of PHONES) {
  test(`the room fits one ${width}×${height} screen, bid button included`, async ({
    page,
  }) => {
    await makeLiveLot("F01");
    const bidder = await makeBidder("99110301", "Т-301");
    await page.setViewportSize({ width, height });
    await signIn(page, bidder);

    for (const focus of [false, true]) {
      await page.evaluate((on) => {
        if (on) localStorage.setItem("urlug.room.focus", "1");
        else localStorage.removeItem("urlug.room.focus");
      }, focus);
      await page.goto("/auction/F01");

      const bid = page.getByRole("button", { name: /Үнэ хаях/ });
      await expect(bid).toBeVisible();
      const box = (await bid.boundingBox())!;
      expect(
        box.y + box.height,
        `bid button bottom (focus ${focus}) at ${width}×${height}`,
      ).toBeLessThanOrEqual(height);

      const scroll = await page.evaluate(() => ({
        page: document.documentElement.scrollHeight,
        viewport: window.innerHeight,
      }));
      expect(scroll.page, `page scrolls (focus ${focus})`).toBeLessThanOrEqual(
        scroll.viewport + 1,
      );

      // Both clocks are on screen in both modes.
      for (const timer of await page.getByRole("timer").all()) {
        await expect(timer).toBeInViewport();
      }
      await expect(page.getByRole("timer")).toHaveCount(2);
    }
  });
}

test("focus mode keeps the clocks and the bid, and is remembered", async ({
  page,
}) => {
  await makeLiveLot("F02");
  const bidder = await makeBidder("99110302", "Т-302");
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, bidder);
  await page.evaluate(() => localStorage.removeItem("urlug.room.focus"));
  await page.goto("/auction/F02");

  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByText("Тодорхойгүй · XVIII зуун")).toBeVisible();

  await page.getByRole("button", { name: "Фокус" }).click();

  // The header and the catalogue line go; the console stays.
  await expect(page.getByRole("banner")).toHaveCount(0);
  await expect(page.getByText("Тодорхойгүй · XVIII зуун")).toHaveCount(0);
  await expect(page.getByRole("timer")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Үнэ хаях/ })).toBeVisible();
  // The name leaves the screen, not the page: still the heading.
  await expect(
    page.getByRole("heading", { name: "Хүрэл цоморлиг" }),
  ).toHaveCount(1);

  // A preference, not a page state.
  await page.reload();
  await expect(page.getByRole("button", { name: "Бүгдийг харах" })).toBeVisible();
  await expect(page.getByRole("banner")).toHaveCount(0);

  await page.getByRole("button", { name: "Бүгдийг харах" }).click();
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("button", { name: "Фокус" })).toBeVisible();
});

test("the last clock reaching zero takes the bid button away before the server answers", async ({
  page,
}) => {
  await makeLiveLot("F03");
  const bidder = await makeBidder("99110303", "Т-303");
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, bidder);

  /*
   * The stream is cut so the server's verdict never arrives — which isolates
   * the one thing under test: the screen acting on its own clock reaching zero
   * in the final round. Normally the push lands within a fraction of a second
   * and this phase is barely visible; that it is barely visible is the point.
   */
  await page.route("**/stream", (route) => route.abort());
  await finalRoundEndingIn("F03", 4_000);
  await page.goto("/auction/F03");

  await expect(page.getByRole("button", { name: /Үнэ хаях/ })).toBeVisible();
  await expect(page.getByText("Хаялт хаагдаж байна")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByRole("button", { name: /Үнэ хаях/ })).toHaveCount(0);
  await expect(page.getByRole("timer")).toHaveCount(0);
});

test("the final round's log shows the bid clock a real bid was accepted on, to the millisecond", async ({
  page,
}) => {
  await makeLiveLot("F04");
  const bidder = await makeBidder("99110304", "Т-304");
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, bidder);
  await finalRoundEndingIn("F04", 60_000);
  await page.goto("/auction/F04");

  const log = page.getByRole("region", { name: "Сүүлийн тойргийн бүртгэл" });
  await expect(log).toBeVisible();
  await expect(log.getByText("Энэ тойрогт хаялт хараахан алга")).toBeVisible();

  await page.getByRole("button", { name: /Үнэ хаях/ }).click();

  /*
   * The row appears when the server's push brings the measurement — never
   * from this screen's clock — and it says what the database says.
   */
  const row = log.getByRole("listitem").filter({ hasText: "Та" });
  await expect(row).toBeVisible();
  const shown = (await row.textContent())!.match(/(\d+\.\d{3})/)![1]!;
  const stored = await clockLeftOf("F04");
  expect(Number(shown)).toBe(stored / 1000);
  expect(stored).toBeGreaterThan(50_000);
  expect(stored).toBeLessThanOrEqual(60_000);
});
