import { defineConfig, devices } from "@playwright/test";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * END-TO-END
 *
 * These exercise the paths that only exist when the browser, the server and the
 * database are all present — a session cookie surviving a redirect, an SSE push
 * reaching a second tab, a form posting to a Server Function. None of that is
 * visible to a unit test or to the repository-level integration suite.
 *
 * ── What they need ───────────────────────────────────────────────────────────
 *
 *   npm run db:up
 *   npm run test:e2e
 *
 * The dev server is started for you (`webServer` below) against the TEST
 * database — never the development one, because these tests register accounts
 * and place bids, and doing that in the database you are demonstrating from is
 * how a demo acquires nine test users called "Тест".
 *
 * ⚠ Verification codes are read from the SERVER LOG. There is no SMS provider
 * in development, so `sms.ts` prints them; the sign-up test scrapes stdout.
 * That is fragile by nature — if it starts failing, check that line first.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const PORT = 3100;
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://urlug:urlug@localhost:5432/urlug_test";

export default defineConfig({
  testDir: "./e2e",
  // These share one database and one server; parallel files would race on the
  // fixtures each of them sets up.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    // A five-second bid clock leaves no room for a slow default.
    actionTimeout: 10_000,
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    command: "npm run dev",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      PORT: String(PORT),
      DATABASE_URL: TEST_DATABASE_URL,
      NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`,
      /*
       * 60 — one real minute per second. A test that waited out a genuine
       * 2h45m sale is not a test. Bid clocks are never scaled, so round 1
       * still gives five real minutes to place a bid.
       */
      NEXT_PUBLIC_ROUND_TIME_SCALE: "60",
      SMS_API_URL: "",
    },
  },
});
