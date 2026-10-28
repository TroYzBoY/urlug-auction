import { expect, test } from "@playwright/test";
import {
  balanceFor,
  bidsOf,
  currentPts,
  makeBidder,
  makeLiveLot,
  reset,
  signIn,
} from "./fixtures";

/**
 * The paths that only exist when browser, server and database are all present.
 *
 * The unit tests prove the rules; the integration tests prove the row lock.
 * What is left, and what these cover, is that the pieces are wired to each
 * other: that a session cookie survives a redirect, that a Server Function
 * reaches the database, and that an SSE push arrives in a tab nobody touched.
 */

/*
 * The headline number: the lot's total presses.
 *
 * Located by the live region it sits in, and by its screen-reader copy
 * specifically, not the visible one. RollingNumber counts to a new value
 * rather than jumping to it, so the visible span holds intermediate values for
 * a few hundred milliseconds; the sr-only span is always the settled figure.
 */
const TOTAL = 'p[aria-live="polite"][aria-atomic="true"] span.sr-only';

/* The press button, whose name also carries what it costs: "Дарах −1 оноо". */
const PRESS = { name: /^Дарах/ } as const;

test.beforeEach(async () => {
  await reset();
});

test("a signed-in presser presses, is charged, and the count moves", async ({
  page,
}) => {
  await makeLiveLot("E01", 3);
  const presser = await makeBidder("99110001", "Т-201");
  await signIn(page, presser);

  await page.goto("/auction/E01");

  // The room, not the catalogue preview — the lot is live.
  await expect(
    page.getByRole("heading", { name: "Хүрэл цоморлиг" }),
  ).toBeVisible();

  await page.getByRole("button", PRESS).click();

  /*
   * Asserted against the DATABASE, not the DOM. The client applies the press
   * optimistically, so a DOM assertion would pass even if the Server Function
   * had refused it — which is precisely the failure this test exists to catch.
   */
  await expect
    .poll(() => currentPts("E01"), { timeout: 10_000 })
    .toBe(1);
  expect(await bidsOf("E01", presser.phone)).toEqual([1]);
  expect(await balanceFor(presser.phone)).toBe(497);
});

test("a signed-out visitor sees the room but is asked to sign in", async ({
  page,
}) => {
  await makeLiveLot("E02", 2);
  await page.goto("/auction/E02");

  // The whole panel is readable — what a press costs, the counts. Hiding it
  // would make the room unintelligible to exactly the people deciding whether
  // to register.
  await expect(page.getByText("Нэг дарах", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Дарахын тулд нэвтэрнэ үү/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", PRESS)).toBeDisabled();

  // And nothing reached the database.
  expect(await currentPts("E02")).toBe(0);
});

test("a second tab sees the press without reloading", async ({ browser }) => {
  await makeLiveLot("E03");
  const alice = await makeBidder("99110002", "Т-202");

  const watcher = await browser.newContext();
  const watcherPage = await watcher.newPage();
  await watcherPage.goto("/auction/E03");
  await expect(watcherPage.locator(TOTAL)).toHaveText("0");

  const presserContext = await browser.newContext();
  const presserPage = await presserContext.newPage();
  await signIn(presserPage, alice);
  await presserPage.goto("/auction/E03");
  await presserPage.getByRole("button", PRESS).click();
  await expect.poll(() => currentPts("E03"), { timeout: 10_000 }).toBe(1);

  /*
   * The watcher never navigated. If this fails, the SSE stream is not
   * delivering — which is the single most load-bearing piece of the room and
   * the one a presser would experience as a frozen count.
   */
  await expect(watcherPage.locator(TOTAL)).toHaveText("1", {
    timeout: 15_000,
  });

  await watcher.close();
  await presserContext.close();
});

test("each presser counts their own, the last one leads, and a double tap is two presses", async ({
  browser,
}) => {
  await makeLiveLot("E05");
  const alice = await makeBidder("99110005", "Т-205");
  const bob = await makeBidder("99110006", "Т-206");

  const aliceContext = await browser.newContext();
  const alicePage = await aliceContext.newPage();
  await signIn(alicePage, alice);
  await alicePage.goto("/auction/E05");
  for (let i = 0; i < 3; i++) {
    await alicePage.getByRole("button", PRESS).click();
  }
  await expect
    .poll(() => bidsOf("E05", alice.phone), { timeout: 10_000 })
    .toEqual([1, 2, 3]);

  const bobContext = await browser.newContext();
  const bobPage = await bobContext.newPage();
  await signIn(bobPage, bob);
  await bobPage.goto("/auction/E05");
  await expect(bobPage.locator(TOTAL)).toHaveText("3");

  // Two taps without waiting for the first: two presses, counted from his own.
  const press = bobPage.getByRole("button", PRESS);
  await press.click();
  await press.click();
  await expect
    .poll(() => bidsOf("E05", bob.phone), { timeout: 10_000 })
    .toEqual([1, 2]);
  expect(await currentPts("E05")).toBe(5);

  // His count is his own, and pressing last is what leads — not pressing most.
  await expect(
    bobPage.getByText("2 удаа", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    bobPage.getByText(/Та сүүлд дарсан/).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(
    alicePage
      .getByText("Таны араас өөр хүн дарсан")
      .filter({ visible: true })
      .first(),
  ).toBeVisible({
    timeout: 15_000,
  });

  await aliceContext.close();
  await bobContext.close();
});

test("a presser who cannot cover a press is told before tapping", async ({
  page,
}) => {
  await makeLiveLot("E04", 5);
  const presser = await makeBidder("99110004", "Т-204", 3);
  await signIn(page, presser);
  await page.goto("/auction/E04");

  await expect(
    page.getByText("Нэг дарахад 5 оноо шаардана. Танд 3 оноо байна."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Оноо цэнэглэх" })).toBeVisible();
  await expect(page.getByRole("button", PRESS)).toBeDisabled();
  expect(await currentPts("E04")).toBe(0);
  expect(await balanceFor(presser.phone)).toBe(3);

  /*
   * This covers the panel. The SERVER's refusal — the balance checked and
   * charged in one statement, so simultaneous presses cannot overdraw it — is
   * proved in src/lib/repo/bids.integration.test.ts, calling `placeBid`
   * directly.
   */
});

test("an unverified account is refused at the panel and at the server", async ({
  page,
}) => {
  await makeLiveLot("E06");
  const presser = await makeBidder("99110007", "Т-207");

  /*
   * Sign in FIRST, then strip the verification.
   *
   * The other way round does not work and should not: login diverts an
   * unverified number to the code step rather than to /lots, which is the
   * behaviour a separate test covers. Doing it in this order gives the panel
   * exactly what it is being asked about — a live session whose account is not
   * verified — instead of never getting past the login form.
   */
  await signIn(page, presser);

  const { Client } = await import("pg");
  const client = new Client({
    connectionString:
      process.env.TEST_DATABASE_URL ??
      "postgres://urlug:urlug@localhost:5432/urlug_test",
  });
  await client.connect();
  await client.query(
    "UPDATE users SET phone_verified_at = NULL WHERE phone = $1",
    [presser.phone],
  );
  await client.end();

  await page.goto("/auction/E06");

  await expect(page.getByRole("button", PRESS)).toBeDisabled();
  expect(await currentPts("E06")).toBe(0);
});
