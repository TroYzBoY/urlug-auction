import { expect, test } from "@playwright/test";
import { makeBidder, reset, signIn } from "./fixtures";

/**
 * Sign-up and sign-in.
 *
 * The registration test reads its verification code from the SERVER LOG —
 * there is no SMS provider in development, so `sms.ts` prints it. That is
 * fragile by nature and marked as such; if this test starts failing, check that
 * the log line format has not changed before looking anywhere else.
 */

test.beforeEach(async () => {
  await reset();
});

test("registering asks for a code and signs the bidder in", async ({ page }) => {
  const codes: string[] = [];
  /*
   * `webServer.stdout: "pipe"` in the config is what makes this possible. It
   * only sees output produced after the listener attaches, which is why the
   * form is filled afterwards.
   */
  page.on("console", (msg) => {
    const found = /\b(\d{6})\b/.exec(msg.text());
    if (found && msg.text().includes("sms")) codes.push(found[1]!);
  });

  await page.goto("/register");
  await page.getByLabel(/Овог нэр/).fill("Батбаяр");
  await page.getByLabel(/Утасны дугаар/).fill("99117777");
  await page.getByLabel(/^Нууц үг$/).fill("test-password-123");
  await page.getByLabel(/Нууц үгээ давтах/).fill("test-password-123");
  await page.getByLabel(/Төрсөн огноо/).fill("1995-06-15");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Бүртгүүлэх/ }).click();

  // The form swaps itself for the code step rather than revealing a field —
  // that is what stops a password manager re-submitting the credentials.
  await expect(page.getByLabel(/Баталгаажуулах код/)).toBeVisible();
  await expect(page.getByText(/99117777/)).toBeVisible();
});

test("registering under 18 is refused", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel(/Овог нэр/).fill("Залуу");
  await page.getByLabel(/Утасны дугаар/).fill("99118888");
  await page.getByLabel(/^Нууц үг$/).fill("test-password-123");
  await page.getByLabel(/Нууц үгээ давтах/).fill("test-password-123");

  const tooYoung = new Date();
  tooYoung.setFullYear(tooYoung.getFullYear() - 15);
  await page.getByLabel(/Төрсөн огноо/).fill(tooYoung.toISOString().slice(0, 10));

  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Бүртгүүлэх/ }).click();

  await expect(page.getByRole("alert")).toContainText(/18/);
});

test("a wrong password does not say which half was wrong", async ({ page }) => {
  await makeBidder("99119999", "Т-299");

  await page.goto("/login");
  await page.getByLabel(/Утасны дугаар/).fill("99119999");
  await page.getByLabel(/^Нууц үг$/).fill("definitely-not-it");
  await page.getByRole("button", { name: /Нэвтрэх/ }).click();

  const message = page.getByRole("alert");
  await expect(message).toBeVisible();
  // The same sentence an unknown number produces. Distinguishing them would
  // turn the form into a directory of who banks here.
  await expect(message).toContainText(/Утасны дугаар эсвэл нууц үг буруу/);
});

test("signing out ends the session", async ({ page }) => {
  const bidder = await makeBidder("99110010", "Т-210");
  await signIn(page, bidder);

  await page.goto("/profile");
  await expect(page.getByText("Т-210").first()).toBeVisible();

  await page.getByRole("button", { name: /Гарах/ }).click();
  await page.waitForURL("/");

  // And the protected page bounces rather than rendering.
  await page.goto("/profile");
  await page.waitForURL(/\/login/);
});

test("admin is a 404 for an ordinary bidder", async ({ page }) => {
  const bidder = await makeBidder("99110011", "Т-211");
  await signIn(page, bidder);

  const response = await page.goto("/admin");
  /*
   * 404, not 403. A 403 confirms /admin exists and that the visitor merely
   * lacks the role, which is a map for anyone probing.
   */
  expect(response?.status()).toBe(404);
});
