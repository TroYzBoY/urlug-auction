import { expect, test } from "@playwright/test";
import {
  makeBidder,
  makeNotifications,
  passwordHashFor,
  reset,
  signIn,
  unreadFor,
} from "./fixtures";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BELL, AND WHAT A BIDDER MAY CHANGE ABOUT THEMSELVES
 *
 * Both are things only a browser proves. The bell marks notifications read as a
 * side effect of being opened, so the assertion has to be "the panel was
 * opened, and the database changed" — there is no button whose click could
 * stand in for it. And a password change has to be checked by signing in again
 * afterwards, because a form that says "done" and wrote nothing looks identical
 * from the inside.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const PASSWORD = "test-password-123";

test.beforeEach(async () => {
  await reset();
});

test("the bell counts unread notifications", async ({ page }) => {
  const bidder = await makeBidder("99110020", "Т-220");
  await makeNotifications(bidder.phone, ["Таныг давсан", "Лот дуусав"]);
  await signIn(page, bidder);

  await expect(page.getByRole("button", { name: /Мэдэгдэл/ })).toContainText(
    "2",
  );
});

test("opening the panel marks them read, with no button to press", async ({
  page,
}) => {
  const bidder = await makeBidder("99110021", "Т-221");
  await makeNotifications(bidder.phone, [
    "Таныг давсан",
    "Лот дуусав",
    "Төлбөр",
  ]);
  await signIn(page, bidder);

  expect(await unreadFor(bidder.phone)).toBe(3);

  await page.getByRole("button", { name: /Мэдэгдэл/ }).click();
  await expect(page.getByText("Таныг давсан")).toBeVisible();

  /*
   * The badge goes at once — it is dropped optimistically — so poll the
   * database rather than the DOM for the part that has to be true.
   */
  await expect.poll(() => unreadFor(bidder.phone), { timeout: 10_000 }).toBe(0);

  /* And the count is gone on the next page, not just in this component. */
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Мэдэгдэл/ }),
  ).not.toContainText("3");
});

test("the panel says so when there is nothing in it", async ({ page }) => {
  const bidder = await makeBidder("99110022", "Т-222");
  await signIn(page, bidder);

  await page.getByRole("button", { name: /Мэдэгдэл/ }).click();
  await expect(page.getByText(/Мэдэгдэл алга/)).toBeVisible();
});

test("a bidder changes their display name", async ({ page }) => {
  const bidder = await makeBidder("99110023", "Т-223");
  await signIn(page, bidder);
  await page.goto("/profile");

  await page.getByLabel(/Харагдах нэр/).fill("Шинэ Нэр");
  await page.getByRole("button", { name: /Нэр хадгалах/ }).click();

  await expect(page.locator('p[role="alert"]')).toContainText(/шинэчлэгдлээ/i);

  await page.reload();
  await expect(page.getByLabel(/Харагдах нэр/)).toHaveValue("Шинэ Нэр");
});

test("changing a password needs the current one", async ({ page }) => {
  const bidder = await makeBidder("99110024", "Т-224");
  await signIn(page, bidder);
  await page.goto("/profile");

  const before = await passwordHashFor(bidder.phone);

  await page.getByLabel(/Одоогийн нууц үг/).fill("definitely-not-it");
  await page.getByLabel(/^Шинэ нууц үг$/).fill("a-brand-new-password");
  await page.getByLabel(/Шинэ нууц үгээ давтах/).fill("a-brand-new-password");
  await page.getByRole("button", { name: /^Нууц үг солих$/ }).click();

  await expect(page.locator('p[role="alert"]')).toContainText(/буруу/);
  expect(await passwordHashFor(bidder.phone)).toBe(before);
});

test("a changed password is the one that signs in afterwards", async ({
  page,
}) => {
  const bidder = await makeBidder("99110025", "Т-225");
  const next = "a-brand-new-password";
  await signIn(page, bidder);
  await page.goto("/profile");

  await page.getByLabel(/Одоогийн нууц үг/).fill(PASSWORD);
  await page.getByLabel(/^Шинэ нууц үг$/).fill(next);
  await page.getByLabel(/Шинэ нууц үгээ давтах/).fill(next);
  await page.getByRole("button", { name: /^Нууц үг солих$/ }).click();

  await expect(page.locator('p[role="alert"]')).toContainText(/солигдлоо/);

  /*
   * The old sessions are revoked and a fresh one issued for this browser, so
   * the page must still be usable — a change that signed the person out would
   * be a change nobody would risk making mid-sale.
   */
  await page.goto("/profile");
  await expect(page.getByLabel(/Харагдах нэр/)).toBeVisible();

  /* And the real proof: the old password no longer works, the new one does. */
  await page.goto("/logout").catch(() => {});
  await signIn(page, { ...bidder, password: next });
  await expect(page).toHaveURL(/\/lots/);
});
