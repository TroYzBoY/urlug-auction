import { Client } from "pg";
import { expect, test } from "@playwright/test";
import { makeAdmin, makeBidder, makeLiveLot, reset, signIn } from "./fixtures";

const LOT = "E91";

async function withDatabase<T>(
  read: (client: Client) => Promise<T>,
): Promise<T> {
  const url =
    process.env.TEST_DATABASE_URL ??
    "postgres://urlug:urlug@localhost:5432/urlug_test";
  if (!new URL(url).pathname.endsWith("_test")) {
    throw new Error("Winner verification requires a separate _test database.");
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await read(client);
  } finally {
    await client.end();
  }
}

test.beforeEach(reset);

/**
 * Round 6 of LOT with two real bids on it — Т-293 leading at 1 300 over Т-292
 * at 1 250 — and the bid clock ending at `now() + clock`.
 */
async function seedFinalRound(clock: string): Promise<void> {
  await withDatabase(async (client) => {
    for (const [phone, name, points] of [
      ["99110092", "Доод хаялттай оролцогч", 1250],
      ["99110093", "Тэргүүлсэн оролцогч", 1300],
    ] as const) {
      await client.query("UPDATE users SET name = $2 WHERE phone = $1", [
        phone,
        name,
      ]);
      await client.query(
        `INSERT INTO bids (lot_id, user_id, paddle, points, round, idempotency_key)
         SELECT $1, id, paddle, $3, 6, $2 FROM users WHERE phone = $2`,
        [LOT, phone, points],
      );
    }
    await client.query(
      `UPDATE auctions SET round = 6, current_pts = 1300,
         leader_user_id = (SELECT id FROM users WHERE phone = '99110093'),
         leader_paddle = 'Т-293', bid_count = 2,
         bid_clock_ends_at = now() + $2::interval
       WHERE lot_id = $1`,
      [LOT, clock],
    );
  });
}

test("a lot left to the clock shows the standing leader as winner the moment it closes", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await makeBidder("99110092", "Т-292");
  await makeBidder("99110093", "Т-293");
  await makeLiveLot(LOT);
  // Far enough out that the room is open and live before it runs down.
  await seedFinalRound("5 seconds");

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  expect((await page.goto(`/auction/${LOT}`))?.status()).toBe(200);
  await expect(page.getByRole("timer")).toHaveCount(2);

  /*
   * The server sells it in the same transaction that closes it, and the room
   * shows that straight away: no admin, no wait. Two seconds of slack past the
   * clock covers the ticker's quarter-second cadence and the push.
   */
  await expect(page.getByRole("timer")).toHaveCount(0, { timeout: 10_000 });
  await expect(
    page.getByText("ЯЛАГЧ ТОДОРЛОО", { exact: true }).first(),
  ).toBeVisible({
    timeout: 2_000,
  });
  await expect(page.getByText("Loading…")).toHaveCount(0);
  await expect(page.locator('dt:has-text("Ялагч") + dd')).toHaveText(
    "Тэргүүлсэн оролцогч",
  );

  const result = await withDatabase(async (client) => {
    const rows = await client.query(
      `SELECT a.outcome, a.current_pts, a.awarded_by, u.phone, s.hammer_pts
         FROM auctions a JOIN users u ON u.id = a.leader_user_id
         JOIN settlements s ON s.lot_id = a.lot_id WHERE a.lot_id = $1`,
      [LOT],
    );
    return rows.rows[0];
  });
  expect(result).toEqual({
    outcome: "sold",
    current_pts: 1300,
    awarded_by: null,
    phone: "99110093",
    hammer_pts: 1300,
  });
  expect(errors).toEqual([]);
});

test("on a phone, the bid history appears once the lot is sold, winner first", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await makeBidder("99110092", "Т-292");
  await makeBidder("99110093", "Т-293");
  await makeLiveLot(LOT);
  await seedFinalRound("5 seconds");
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await page.goto(`/auction/${LOT}`))?.status()).toBe(200);

  // While bidding a phone has no room for it.
  const feed = page.getByRole("region", { name: "Хаялтын урсгал" });
  await expect(page.getByRole("timer")).toHaveCount(2);
  await expect(feed).toBeHidden();

  await expect(page.getByRole("timer")).toHaveCount(0, { timeout: 10_000 });
  await expect(feed).toBeVisible({ timeout: 2_000 });
  await expect(feed.getByText("Ялагч", { exact: true }).first()).toBeVisible();
  await expect(
    feed.getByText("Тэргүүлсэн оролцогч", { exact: true }).first(),
  ).toBeVisible();
  // The real bids are still there, in the order they were placed.
  await expect(feed.getByRole("listitem")).toHaveCount(2);
  await expect(feed.getByRole("listitem").first()).toContainText(
    "Тэргүүлсэн оролцогч",
  );
});

for (const override of [false, true]) {
  test(`an admin awards an expired lot to ${override ? "another bidder at their own price" : "the highest bidder"} and the room updates`, async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(90_000);
    const admin = await makeAdmin("99110091", "Т-291");
    await makeBidder("99110092", "Т-292");
    await makeBidder("99110093", "Т-293");
    await makeLiveLot(LOT);

    /*
     * Take the decision before the lot closes, from the lot's own page — the
     * only way in. Left alone, the ticker would sell it to the standing leader
     * the moment the clock below runs out.
     */
    await signIn(page, admin);
    expect((await page.goto(`/admin/lots/${LOT}`))?.status()).toBe(200);
    await expect(page.getByText("Автомат", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "Ялагчийг админ тодруулна", exact: true })
      .click();
    await page
      .getByPlaceholder("Шалтгаан (аудитад үлдэнэ)")
      .fill("Браузерын шалгалт");
    await page
      .getByRole("button", { name: "Тийм, би тодруулна", exact: true })
      .click();
    await expect(
      page.getByText("Админ тодруулна", { exact: true }),
    ).toBeVisible();

    // Expire the final round with two real bid records. The ticker and the
    // decision action must turn this running row into review themselves.
    await seedFinalRound("-1 second");

    const viewer = await browser.newContext();
    const room = await viewer.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    room.on("pageerror", (error) => errors.push(error.message));
    try {
      expect((await room.goto(`/auction/${LOT}`))?.status()).toBe(200);
      await expect(room.getByText("LOADING", { exact: true })).toBeVisible();

      expect((await page.goto("/admin"))?.status()).toBe(200);
      const picker = page.getByRole("combobox", { name: "Ялагчийг сонгох" });
      await expect(picker.locator("option:checked")).toContainText("Т-293");
      await expect(picker.locator("option")).toHaveCount(2);
      if (override) {
        const second = picker.locator("option").filter({ hasText: "Т-292" });
        await picker.selectOption((await second.getAttribute("value"))!);
        await expect(
          page.getByText(
            /Та хамгийн өндөр хаялт хийгээгүй хүнийг сонгож байна/,
          ),
        ).toBeVisible();
      }
      await page
        .getByPlaceholder("Тайлбар (аудитад үлдэнэ)")
        .fill("Браузерын шалгалтын шийдвэр");
      await page.screenshot({
        path: testInfo.outputPath("winner-picker.png"),
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Ялагчийг зарлах", exact: true })
        .click();

      await expect(
        page.getByText("Шалгах хүлээгдэж буй лот алга."),
      ).toBeVisible();
      await expect(picker).toHaveCount(0);
      // No navigation or reload on this page: this must arrive through SSE.
      await expect(
        room.getByText("ЯЛАГЧ ТОДОРЛОО", { exact: true }).first(),
      ).toBeVisible();
      await expect(room.locator('dt:has-text("Ялагч") + dd')).toHaveText(
        override ? "Доод хаялттай оролцогч" : "Тэргүүлсэн оролцогч",
      );
      await expect(
        room.locator(
          'p[aria-live="polite"][aria-atomic="true"] span[aria-hidden]:not(.price-flash)',
        ),
      ).toHaveText(override ? /^1\s250$/ : /^1\s300$/);
      await room.screenshot({ path: testInfo.outputPath("winner-result.png") });

      const result = await withDatabase(async (client) => {
        const rows = await client.query(
          `SELECT a.outcome, a.current_pts, u.phone, s.hammer_pts, s.status,
                  s.user_id = a.leader_user_id AS settlement_matches,
                  a.awarded_by = (SELECT id FROM users WHERE phone = '99110091') AS admin_matches
             FROM auctions a JOIN users u ON u.id = a.leader_user_id
             JOIN settlements s ON s.lot_id = a.lot_id WHERE a.lot_id = $1`,
          [LOT],
        );
        return rows.rows[0];
      });
      expect(result).toEqual({
        outcome: "sold",
        current_pts: override ? 1250 : 1300,
        phone: override ? "99110092" : "99110093",
        hammer_pts: override ? 1250 : 1300,
        status: "due",
        settlement_matches: true,
        admin_matches: true,
      });
      expect(errors).toEqual([]);
    } finally {
      await viewer.close();
    }
  });
}
