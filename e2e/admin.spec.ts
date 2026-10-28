import { crc32, inflateRawSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import {
  addLotImage,
  balanceFor,
  makeAdmin,
  makeBidder,
  makeLiveLot,
  reset,
  signIn,
} from "./fixtures";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ADMIN DASHBOARD
 *
 * Two things only a browser can prove: that a lot typed into the form reaches
 * the catalogue, and that the export button hands back a file Excel can open.
 *
 * The authorisation checks matter as much as the features. `/admin` and
 * `/admin/export` both answer 404 rather than 403 to anyone without the role,
 * so neither confirms its own existence to somebody guessing at URLs — and a
 * test that only signed in as an admin would never notice if that stopped
 * being true.
 * ─────────────────────────────────────────────────────────────────────────────
 */

test.beforeEach(async () => {
  await reset();
});

test("the dashboard and the export are 404 for an ordinary bidder", async ({
  page,
}) => {
  const bidder = await makeBidder("99110010", "Т-210");
  await signIn(page, bidder);

  expect((await page.goto("/admin"))?.status()).toBe(404);
  expect((await page.goto("/admin/export"))?.status()).toBe(404);
});

test("an admin creates a lot and it appears in the catalogue", async ({
  page,
}) => {
  const admin = await makeAdmin("99110011", "Т-211");
  await signIn(page, admin);
  await page.goto("/admin");

  await page.getByRole("button", { name: /Шинэ лот/ }).click();

  await page.getByLabel(/Лотын дугаар/).fill("E90");
  await page.getByLabel(/^Код$/).fill("ЛОТ E90");
  await page.getByLabel(/Лотын нэр/).fill("Шалгах эдлэл");
  await page.getByLabel(/Нэг дарах үнэ/).fill("4");

  // The preview redraws the card as it is typed.
  const preview = page.getByRole("complementary", { name: "Урьдчилан харах" });
  await expect(preview.getByText("Шалгах эдлэл")).toBeVisible();
  await expect(preview.getByText("ЛОТ E90").first()).toBeVisible();

  /*
   * A week out, at 20:00. A lot that opens in the past would be promoted by the
   * ticker before the assertion below could see it scheduled.
   *
   * The time is the point. The form's datetime-local has no zone, the e2e
   * server runs in UTC as production does (playwright.config.ts), and 20:00
   * typed must come back as 20:00 — Ulaanbaatar time — not as 04:00.
   */
  const day = new Date(Date.now() + 7 * 24 * 3600_000)
    .toISOString()
    .slice(0, 10);
  await page.getByLabel(/Эхлэх/).fill(`${day}T20:00`);

  await page.getByRole("button", { name: /^Үүсгэх$/ }).click();

  /*
   * The row, not the confirmation. Both say "ЛОТ E90" — asserting on the text
   * alone would pass on the success message while the table stayed empty, which
   * is the half of this that is worth testing.
   */
  await expect(page.getByRole("link", { name: /ЛОТ E90/ })).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    page.getByRole("row").filter({ hasText: "ЛОТ E90" }),
  ).toContainText("· 20:00");

  // And it is a real lot, not just a row: the catalogue serves its page.
  const response = await page.goto("/auction/E90");
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Шалгах эдлэл" }),
  ).toBeVisible();
});

test("a lot needs only its name, its press price and its time", async ({
  page,
}) => {
  const admin = await makeAdmin("99110017", "Т-217");
  await signIn(page, admin);
  await page.goto("/admin");

  await page.getByRole("button", { name: /Шинэ лот/ }).click();
  await page.getByLabel(/Лотын нэр/).fill("Нэргүй эдлэл");
  // The press price keeps its default of 1; the id and code are left empty.
  const day = new Date(Date.now() + 7 * 24 * 3600_000)
    .toISOString()
    .slice(0, 10);
  await page.getByLabel(/Эхлэх/).fill(`${day}T20:00`);
  await page.getByRole("button", { name: /^Үүсгэх$/ }).click();

  // Given the next free number, which is its code too.
  const row = page.getByRole("row").filter({ hasText: "Нэргүй эдлэл" });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(
    row.getByRole("link", { name: /^\d{3} Нэргүй эдлэл$/ }),
  ).toBeVisible();
});

test("an admin downloads the money export as a readable workbook", async ({
  page,
}) => {
  const admin = await makeAdmin("99110012", "Т-212");
  await signIn(page, admin);
  await page.goto("/admin");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: /Excel татах/ }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(
    /^urlug-tulbur-\d{4}-\d{2}-\d{2}\.xlsx$/,
  );

  const path = await download.path();
  expect(path).toBeTruthy();

  const { readFileSync } = await import("node:fs");
  const buf = readFileSync(path!);

  /*
   * Unpacked rather than merely weighed. A wrong offset or a wrong checksum
   * produces a file of exactly the right size that Excel refuses to open, and
   * "the response had bytes in it" would pass for that.
   */
  const files = unzip(buf);
  expect([...files.keys()]).toContain("xl/workbook.xml");
  const book = files.get("xl/workbook.xml")!;
  for (const tab of ["Цэнэглэлт", "Лотын төлбөр", "Гүйлгээ"]) {
    expect(book).toContain(tab);
  }
  expect(files.has("xl/worksheets/sheet3.xml")).toBe(true);
});

test("an admin opens an account for somebody, and it signs straight in", async ({
  page,
}) => {
  const admin = await makeAdmin("99110013", "Т-213");
  await signIn(page, admin);
  await page.goto("/admin");

  await page.getByRole("button", { name: /Шинэ хэрэглэгч/ }).click();
  await page.getByLabel(/^Овог$/).fill("Батбаяр");
  await page.getByLabel(/^Нэр$/).fill("Сарнай");
  await page.getByLabel(/Утасны дугаар/).fill("8811 2233");
  await page.getByLabel(/Төрсөн огноо/).fill("1990-05-01");
  await page.getByLabel(/^Нууц үг$/).fill("desk-password-1");
  await page.getByLabel(/нөхцөл, нууцлалын бодлогыг зөвшөөрсөн/).check();
  await page.getByRole("button", { name: /Бүртгэл үүсгэх/ }).click();

  await expect(page.getByText(/Бүртгэл үүслээ — паддл Т-/)).toBeVisible({
    timeout: 10_000,
  });

  /*
   * Signed in as the new account through the real form. No code step: the
   * operator vouched for the number, so the account is verified already — the
   * thing that would otherwise strand it behind an SMS nobody is sending.
   */
  await page.context().clearCookies();
  await signIn(page, {
    phone: "88112233",
    password: "desk-password-1",
    paddle: "",
  });
});

test("an admin records a cash payment and the bidder's points rise", async ({
  page,
}) => {
  await makeBidder("99110014", "Т-214", 0);
  const admin = await makeAdmin("99110015", "Т-215");
  await signIn(page, admin);
  await page.goto("/admin");

  const row = page.getByRole("row", { name: /Т-214/ });
  await row.getByRole("button", { name: "Удирдах" }).click();

  await row.getByPlaceholder("Дүн (₮)").fill("50000");
  // What will be credited, shown before it is sent — the check on a typo.
  await expect(row.getByText("= 50 оноо")).toBeVisible();
  await row.getByRole("button", { name: /^Бүртгэх$/ }).click();

  await expect(row.getByText(/бүртгэгдэж 50 оноо нэмэгдлээ/)).toBeVisible({
    timeout: 10_000,
  });
  expect(await balanceFor("99110014")).toBe(50);
  // Cleared, so the same payment is not one tap from being paid in twice.
  await expect(row.getByPlaceholder("Дүн (₮)")).toHaveValue("");
});

test("an admin replaces a lot's photograph by uploading one, and the room shows it", async ({
  page,
}) => {
  await makeLiveLot("U01");
  const admin = await makeAdmin("99110016", "Т-216");
  await signIn(page, admin);
  await page.goto("/admin/lots/U01");

  // Resized in the browser, uploaded, and appended to the gallery as a line.
  await page
    .locator('input[type="file"]')
    .setInputFiles("public/media/lots/101/01.jpg");
  const gallery = page.locator('textarea[name="images"]');
  await expect(gallery).toHaveValue(/^\/api\/images\/[a-f0-9]{64}$/, {
    timeout: 15_000,
  });
  const path = await gallery.inputValue();

  await page.getByRole("button", { name: "Хадгалах" }).click();
  await expect(page.getByText(/шинэчлэгдлээ/)).toBeVisible({ timeout: 10_000 });

  // Served back as a JPEG — the re-encoded one, not the original file.
  const image = await page.request.get(path);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/jpeg");

  // The room's picture on a phone is that upload.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/auction/U01");
  await expect(page.locator(".lot-plate img")).toHaveAttribute(
    "src",
    new RegExp(encodeURIComponent(path)),
  );
});

test("a licensed photograph is credited on the credits page", async ({
  page,
}) => {
  await makeLiveLot("C01");
  await addLotImage(
    "C01",
    "/media/lots/101/01.jpg",
    "Зураг: Тест Зохиогч (CC BY 4.0)",
  );

  await page.goto("/lots");
  await page.getByRole("link", { name: "Зургийн эх сурвалж" }).click();
  await expect(page).toHaveURL(/\/credits$/);
  await expect(page.getByText("Зураг: Тест Зохиогч (CC BY 4.0)")).toBeVisible();
});

/** Enough of a ZIP reader to prove the download is a real archive. */
function unzip(buf: Buffer): Map<string, string> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  expect(eocd).toBeGreaterThanOrEqual(0);

  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, string>();

  for (let n = 0; n < count; n++) {
    const expectedCrc = buf.readUInt32LE(at + 16);
    const compressed = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const localAt = buf.readUInt32LE(at + 42);
    const name = buf.toString("utf8", at + 46, at + 46 + nameLen);

    const dataAt =
      localAt +
      30 +
      buf.readUInt16LE(localAt + 26) +
      buf.readUInt16LE(localAt + 28);
    const raw = inflateRawSync(buf.subarray(dataAt, dataAt + compressed));
    expect(crc32(raw), `checksum for ${name}`).toBe(expectedCrc);
    out.set(name, raw.toString("utf8"));

    at += 46 + nameLen + extraLen + commentLen;
  }

  return out;
}
