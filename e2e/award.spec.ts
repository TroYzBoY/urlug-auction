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

    // Expire the final round with two real bid records. The ticker and the
    // decision action must turn this running row into review themselves.
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
           bid_clock_ends_at = now() - interval '1 second'
         WHERE lot_id = $1`,
        [LOT],
      );
    });

    const viewer = await browser.newContext();
    const room = await viewer.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    room.on("pageerror", (error) => errors.push(error.message));
    try {
      expect((await room.goto(`/auction/${LOT}`))?.status()).toBe(200);
      await expect(
        room.getByText("ШАЛГАЖ БАЙНА", { exact: true }),
      ).toBeVisible();

      await signIn(page, admin);
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
        room.getByText("ЦОХИВ", { exact: true }).first(),
      ).toBeVisible();
      await expect(room.locator('dt:has-text("Хүлээн авагч") + dd')).toHaveText(
        override ? "Доод хаялттай оролцогч" : "Тэргүүлсэн оролцогч",
      );
      await expect(
        room.locator(
          'p[aria-live="polite"][aria-atomic="true"] span[aria-hidden]',
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
