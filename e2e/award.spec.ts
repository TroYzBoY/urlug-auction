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
 * Round 6 of LOT with three real presses on it — Т-292 twice, then Т-293
 * once, so Т-293 pressed LAST and Т-292 pressed MORE — and the bid clock
 * ending at `now() + clock`.
 */
async function seedFinalRound(clock: string): Promise<void> {
  await withDatabase(async (client) => {
    for (const [phone, name] of [
      ["99110092", "Олон дарсан оролцогч"],
      ["99110093", "Сүүлд дарсан оролцогч"],
    ] as const) {
      await client.query("UPDATE users SET name = $2 WHERE phone = $1", [
        phone,
        name,
      ]);
    }
    for (const [phone, count] of [
      ["99110092", 1],
      ["99110092", 2],
      ["99110093", 1],
    ] as const) {
      await client.query(
        `INSERT INTO bids (lot_id, user_id, paddle, points, cost_pts, round, idempotency_key)
         SELECT $1, id, paddle, $3, 1, 6, $4 FROM users WHERE phone = $2`,
        [LOT, phone, count, `${phone}-${count}`],
      );
    }
    await client.query(
      `UPDATE auctions SET round = 6, current_pts = 3,
         leader_user_id = (SELECT id FROM users WHERE phone = '99110093'),
         leader_paddle = 'Т-293', bid_count = 3,
         bid_clock_ends_at = now() + $2::interval
       WHERE lot_id = $1`,
      [LOT, clock],
    );
  });
}

async function resultOf() {
  return withDatabase(async (client) => {
    const rows = await client.query(
      `SELECT a.outcome, a.current_pts, u.phone,
              a.awarded_by = (SELECT id FROM users WHERE phone = '99110091') AS by_admin,
              (SELECT count(*)::int FROM settlements s WHERE s.lot_id = a.lot_id) AS settlements
         FROM auctions a LEFT JOIN users u ON u.id = a.leader_user_id
        WHERE a.lot_id = $1`,
      [LOT],
    );
    return rows.rows[0];
  });
}

test("a closed lot goes to its last presser by itself", async ({ page }) => {
  test.setTimeout(60_000);
  await makeBidder("99110092", "Т-292");
  await makeBidder("99110093", "Т-293");
  await makeLiveLot(LOT);
  // Far enough out that the room is open and live before it runs down, even
  // when this is the first page the dev server compiles.
  await seedFinalRound("15 seconds");

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  expect((await page.goto(`/auction/${LOT}`))?.status()).toBe(200);
  await expect(page.getByRole("timer")).toHaveCount(2);

  /*
   * The clock runs out and the result arrives on its own — nobody decides
   * anything. The last presser takes it, not the one who pressed most.
   */
  await expect(page.getByRole("timer")).toHaveCount(0, { timeout: 20_000 });
  await expect(
    page.getByText("ЯЛАГЧ ТОДОРЛОО", { exact: true }).first(),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('dt:has-text("Ялагч") + dd')).toHaveText(
    "Сүүлд дарсан оролцогч",
  );

  expect(await resultOf()).toEqual({
    outcome: "sold",
    current_pts: 3,
    phone: "99110093",
    by_admin: null,
    // The presses were the price: nothing more is owed.
    settlements: 0,
  });
  expect(errors).toEqual([]);
});

test("on a phone, the press history appears once the lot is sold, winner first", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await makeBidder("99110092", "Т-292");
  await makeBidder("99110093", "Т-293");
  await makeLiveLot(LOT);
  await seedFinalRound("15 seconds");
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await page.goto(`/auction/${LOT}`))?.status()).toBe(200);

  // While pressing a phone has no room for it.
  const feed = page.getByRole("region", { name: "Дарсан түүх" });
  await expect(page.getByRole("timer")).toHaveCount(2);
  await expect(feed).toBeHidden();
  await expect(page.getByRole("timer")).toHaveCount(0, { timeout: 20_000 });

  await expect(feed).toBeVisible({ timeout: 10_000 });
  await expect(feed.getByText("Ялагч", { exact: true }).first()).toBeVisible();
  // The real presses are still there, newest first.
  await expect(feed.getByRole("listitem")).toHaveCount(3);
  await expect(feed.getByRole("listitem").first()).toContainText(
    "Сүүлд дарсан оролцогч",
  );
});

test("an admin chooses an Instant winner while the lot runs, and it is announced when it ends", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const admin = await makeAdmin("99110091", "Т-291");
  await makeBidder("99110092", "Т-292");
  await makeBidder("99110093", "Т-293");
  await makeLiveLot(LOT);
  await seedFinalRound("10 minutes");

  const viewer = await browser.newContext();
  const room = await viewer.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  room.on("pageerror", (error) => errors.push(error.message));
  try {
    expect((await room.goto(`/auction/${LOT}`))?.status()).toBe(200);
    await expect(room.getByRole("timer")).toHaveCount(2);

    await signIn(page, admin);
    expect((await page.goto(`/admin/lots/${LOT}`))?.status()).toBe(200);

    // Every presser, with how many times they pressed.
    const pressers = page.getByRole("table").last();
    await expect(pressers.getByRole("row")).toHaveCount(3);
    await expect(
      pressers.getByRole("row").filter({ hasText: "Т-292" }).getByRole("cell").nth(1),
    ).toHaveText("2");
    await expect(
      pressers.getByRole("row").filter({ hasText: "Т-293" }).getByRole("cell").nth(1),
    ).toHaveText("1");

    // Nothing is decided by hand once a lot ends — there is no "unsold" here.
    await expect(
      page.getByRole("button", { name: "Хэн ч аваагүй" }),
    ).toHaveCount(0);

    const picker = page.getByRole("combobox", { name: "Ялагчийг сонгох" });
    const chosen = picker.locator("option").filter({ hasText: "Т-292" });
    await picker.selectOption((await chosen.getAttribute("value"))!);
    await page
      .getByPlaceholder("Тайлбар (аудитад үлдэнэ)")
      .fill("Браузерын шалгалт — Instant");
    await page
      .getByRole("button", { name: "Instant ялагчаар сонгох", exact: true })
      .click();
    // The page re-renders on the saved choice, which it now states.
    await expect(
      page.getByText(/Instant ялагч: Олон дарсан оролцогч · Т-292/),
    ).toBeVisible({ timeout: 15_000 });

    // The lot carries on: the room is still pressing.
    await page.waitForTimeout(1_500);
    await expect(room.getByRole("timer")).toHaveCount(2);

    // Its clock runs out, and the chosen presser is announced through SSE —
    // not the one who pressed last.
    await withDatabase((client) =>
      client.query(
        `UPDATE auctions SET bid_clock_ends_at = now() - interval '1 second'
          WHERE lot_id = $1`,
        [LOT],
      ),
    );
    await expect(
      room.getByText("ЯЛАГЧ ТОДОРЛОО", { exact: true }).first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(room.locator('dt:has-text("Ялагч") + dd')).toHaveText(
      "Олон дарсан оролцогч",
    );

    expect(await resultOf()).toEqual({
      outcome: "sold",
      current_pts: 3,
      phone: "99110092",
      by_admin: true,
      settlements: 0,
    });
    expect(errors).toEqual([]);
  } finally {
    await viewer.close();
  }
});
