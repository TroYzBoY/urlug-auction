import { expect, test } from "@playwright/test";
import {
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

      const bid = page.getByRole("button", { name: /^Дарах/ });
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
  await expect(page.getByRole("button", { name: "Дэлгэрэнгүй" })).toBeVisible();

  await page.getByRole("button", { name: "Фокус" }).click();

  // The header and the picture go; the console stays.
  await expect(page.getByRole("banner")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Дэлгэрэнгүй" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("timer")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /^Дарах/ })).toBeVisible();
  // The name leaves the screen, not the page: still the heading.
  await expect(
    page.getByRole("heading", { name: "Хүрэл цоморлиг" }),
  ).toHaveCount(1);

  // A preference, not a page state.
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Бүгдийг харах" }),
  ).toBeVisible();
  await expect(page.getByRole("banner")).toHaveCount(0);

  await page.getByRole("button", { name: "Бүгдийг харах" }).click();
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("button", { name: "Фокус" })).toBeVisible();
});

test("a phone shows the picture, the clocks and the bid, and the description on demand", async ({
  page,
}) => {
  await makeLiveLot("F04");
  const bidder = await makeBidder("99110304", "Т-304");
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, bidder);
  await page.evaluate(() => localStorage.removeItem("urlug.room.focus"));
  await page.goto("/auction/F04");

  await expect(page.locator(".lot-plate")).toBeVisible();
  await expect(page.getByRole("timer")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /^Дарах/ })).toBeVisible();
  // The words are not on the page until they are asked for.
  await expect(page.getByText("Тест лот.")).toHaveCount(0);

  await page.getByRole("button", { name: "Дэлгэрэнгүй" }).click();
  const sheet = page.getByRole("dialog", { name: "Хүрэл цоморлиг" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Тест лот.")).toBeVisible();
  await expect(sheet.getByText("Тодорхойгүй · XVIII зуун")).toBeVisible();

  // Closing puts the bidder back in the room, bid button and all.
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Дарах/ })).toBeVisible();

  // A desktop has no picture to carry the button; it stands under the title.
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator(".lot-plate")).toBeHidden();
  await expect(page.getByRole("button", { name: "Дэлгэрэнгүй" })).toBeVisible();
});

test("the last clock reaching zero takes the press button away before the server answers", async ({
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

  await expect(page.getByRole("button", { name: /^Дарах/ })).toBeVisible();
  await expect(page.getByText("Лот хаагдаж байна")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByRole("button", { name: /^Дарах/ })).toHaveCount(0);
  await expect(page.getByRole("timer")).toHaveCount(0);
});
