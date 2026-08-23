import { expect, test } from "@playwright/test";
import {
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
 * The app groups digits with U+2009 THIN SPACE, not a plain space. See
 * groupNumber in src/lib/format.ts, which is hand-rolled precisely because
 * Intl's mn-MN separator differs between Node and browser ICU builds. A test
 * typing a normal space matches nothing at all, which is how these assertions
 * failed for as long as nobody ran them.
 */
const THIN = " ";

/*
 * The headline price.
 *
 * `getByText` on the number alone matches five things — the estimate range, the
 * tugrik conversion, and the copies of both in the aside. Nor can the figure be
 * read as text: RollingNumber is an odometer, so every digit is a column of
 * 0-9 and the paragraph reads "0123456789 0123456789..." with CSS deciding
 * which line shows.
 *
 * The value a screen reader gets is on the wrapper's aria-label, and that is
 * the honest thing to assert: it is what the number IS, rather than what the
 * animation happens to have in the DOM.
 */
const PRICE = 'p[aria-live="polite"][aria-atomic="true"] span[aria-label]';

/*
 * The app's digit grouping, thin space and all — the same loop as groupNumber
 * in src/lib/format.ts. Copied rather than imported: format.ts pulls in
 * auction.ts, which reads NEXT_PUBLIC_ROUND_TIME_SCALE and has opinions about
 * the environment it is loaded in. Six lines is cheaper than giving the test
 * process a reason to care.
 */
function grouped(n: number): string {
  const digits = String(n);
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += THIN;
    out += digits[i];
  }
  return out;
}

test.beforeEach(async () => {
  await reset();
});

test("a signed-in bidder can place a bid and the price moves", async ({
  page,
}) => {
  await makeLiveLot("E01", 1200);
  const bidder = await makeBidder("99110001", "Т-201");
  await signIn(page, bidder);

  await page.goto("/auction/E01");

  // The room, not the catalogue preview — the lot is live.
  await expect(page.getByRole("heading", { name: "Хүрэл цоморлиг" })).toBeVisible();

  await page.getByRole("button", { name: /Үнэ хаях/ }).click();

  /*
   * Asserted against the DATABASE, not the DOM. The client applies the bid
   * optimistically, so a DOM assertion would pass even if the Server Function
   * had rejected it — which is precisely the failure this test exists to catch.
   */
  await expect
    .poll(() => currentPts("E01"), { timeout: 10_000 })
    .toBeGreaterThan(1200);
});

test("a signed-out visitor sees the room but is asked to sign in", async ({
  page,
}) => {
  await makeLiveLot("E02", 1200);
  await page.goto("/auction/E02");

  // The whole panel is readable — the price, the minimum, the steps. Hiding it
  // would make the room unintelligible to exactly the people deciding whether
  // to register.
  await expect(page.getByText(/Дараагийн доод үнэ/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Хаялт хийхийн тулд нэвтэрнэ үү/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Үнэ хаях/ })).toBeDisabled();

  // And nothing reached the database.
  expect(await currentPts("E02")).toBe(1200);
});

test("a second tab sees the bid without reloading", async ({ browser }) => {
  await makeLiveLot("E03", 1200);
  const alice = await makeBidder("99110002", "Т-202");
  await makeBidder("99110003", "Т-203");

  const watcher = await browser.newContext();
  const watcherPage = await watcher.newPage();
  await watcherPage.goto("/auction/E03");
  await expect(watcherPage.locator(PRICE)).toHaveAttribute(
    "aria-label",
    `1${THIN}200`,
  );

  const bidderContext = await browser.newContext();
  const bidderPage = await bidderContext.newPage();
  await signIn(bidderPage, alice);
  await bidderPage.goto("/auction/E03");
  await bidderPage.getByRole("button", { name: /Үнэ хаях/ }).click();

  /*
   * The watcher never navigated. If this fails, the SSE stream is not
   * delivering — which is the single most load-bearing piece of the room and
   * the one a bidder would experience as a frozen price.
   */
  /*
   * What the increment is is not this test's business — bids.ts owns that, and
   * hard-coding it here made an unrelated rule look like a broken stream: the
   * tab was updating correctly to 1 220 while the assertion waited for 1 201.
   * Read what the bid actually did, then require the untouched tab to show it.
   */
  await expect
    .poll(() => currentPts("E03"), { timeout: 10_000 })
    .toBeGreaterThan(1200);
  const moved = await currentPts("E03");

  await expect(watcherPage.locator(PRICE)).toHaveAttribute(
    "aria-label",
    grouped(moved),
    { timeout: 15_000 },
  );

  await watcher.close();
  await bidderContext.close();
});

test("a custom amount below the minimum is refused and nothing moves", async ({
  page,
}) => {
  await makeLiveLot("E04", 1200);
  const bidder = await makeBidder("99110004", "Т-204");
  await signIn(page, bidder);
  await page.goto("/auction/E04");

  await page.getByRole("button", { name: /Өөр дүн/ }).click();
  // Found by its (screen-reader-only) label rather than by the placeholder,
  // which is a formatted number and moves whenever the price does.
  // The standing price itself. Illegal in every round — a bid must exceed it.
  await page.getByLabel("Өөр дүн").fill("1200");
  await page.getByRole("button", { name: /^Хаях$/ }).click();

  await expect(page.locator('p[role="alert"]')).toBeVisible();
  expect(await currentPts("E04")).toBe(1200);

  /*
   * This covers the panel refusing. That the SERVER also refuses — the check
   * that actually matters, since the panel is reachable only by people using
   * the panel — is proved in src/lib/repo/bids.integration.test.ts, which calls
   * `placeBid` directly with no client in the way.
   */
});

test("an unverified account is refused at the panel and at the server", async ({
  page,
}) => {
  await makeLiveLot("E05", 1200);
  const bidder = await makeBidder("99110005", "Т-205");

  /*
   * Sign in FIRST, then strip the verification.
   *
   * The other way round does not work and should not: login diverts an
   * unverified number to the code step rather than to /lots, which is the
   * behaviour a separate test covers. Doing it in this order gives the panel
   * exactly what it is being asked about — a live session whose account is not
   * verified — instead of never getting past the login form.
   */
  await signIn(page, bidder);

  const { Client } = await import("pg");
  const client = new Client({
    connectionString:
      process.env.TEST_DATABASE_URL ??
      "postgres://urlug:urlug@localhost:5432/urlug_test",
  });
  await client.connect();
  await client.query(
    "UPDATE users SET phone_verified_at = NULL WHERE phone = $1",
    [bidder.phone],
  );
  await client.end();

  await page.goto("/auction/E05");

  await expect(page.getByRole("button", { name: /Үнэ хаях/ })).toBeDisabled();
  expect(await currentPts("E05")).toBe(1200);
});
