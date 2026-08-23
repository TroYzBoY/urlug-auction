import { crc32, inflateRawSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { makeAdmin, makeBidder, reset, signIn } from "./fixtures";

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
  await page.getByLabel(/Үнэлгээ — доод/).fill("1000");
  await page.getByLabel(/Үнэлгээ — дээд/).fill("2000");
  await page.getByLabel(/Нээлтийн үнэ/).fill("800");

  /*
   * A week out. The form takes a datetime-local, which has no timezone — the
   * server reads it in its own, and a lot that opens in the past would be
   * promoted by the ticker before the assertion below could see it scheduled.
   */
  const opensAt = new Date(Date.now() + 7 * 24 * 3600_000);
  await page.getByLabel(/Эхлэх/).fill(opensAt.toISOString().slice(0, 16));

  await page.getByRole("button", { name: /^Үүсгэх$/ }).click();

  /*
   * The row, not the confirmation. Both say "ЛОТ E90" — asserting on the text
   * alone would pass on the success message while the table stayed empty, which
   * is the half of this that is worth testing.
   */
  await expect(page.getByRole("link", { name: /ЛОТ E90/ })).toBeVisible({
    timeout: 10_000,
  });

  // And it is a real lot, not just a row: the catalogue serves its page.
  const response = await page.goto("/auction/E90");
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Шалгах эдлэл" }),
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
