import { Client } from "pg";
import { hash } from "@node-rs/argon2";
import type { Page } from "@playwright/test";

/**
 * Fixtures for the end-to-end suite.
 *
 * They talk to the database directly rather than driving the UI to set things
 * up. Registering a bidder through the sign-up form takes four page loads and
 * an SMS code; doing it in SQL takes one statement, and the sign-up flow has
 * its own test where it is the subject rather than the scaffolding.
 */

const url =
  process.env.TEST_DATABASE_URL ??
  "postgres://urlug:urlug@localhost:5432/urlug_test";

/** ⚠ Guard, not paranoia: `reset()` truncates every table. */
function assertTestDatabase(): void {
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) {
    throw new Error(
      `Refusing to run e2e against "${name}" — the database name must end in _test.`,
    );
  }
}

async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  assertTestDatabase();
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function reset(): Promise<void> {
  await withClient((c) =>
    c.query(`
      TRUNCATE users, sessions, otp_codes, lots, auctions, bids,
               lot_participants, ledger_entries, balances, audit_log,
               rate_limits, contact_messages, topups, consents,
               watchlist, notifications, settlements
      RESTART IDENTITY CASCADE
    `),
  );
}

export interface TestBidder {
  phone: string;
  password: string;
  paddle: string;
}

const TEST_PASSWORD = "test-password-123";

/* Must match src/lib/password.ts, or nothing hashed here verifies at sign-in. */
const ARGON = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

/**
 * The password hash every test bidder shares, computed once per run.
 *
 * This used to be a literal, with a comment explaining that hashing is slow and
 * the value had been computed once and pasted in. It had not been: the string
 * verified against nothing, so every signIn in this suite was guaranteed to
 * fail. Nobody noticed, because the suite had never been run.
 *
 * Computing it removes both failure modes at once — a value that is derived
 * cannot be mistyped, and it cannot drift out of step with ARGON above. The
 * cost the comment was worried about is real but it is paid once for the whole
 * run, not once per fixture, because the promise is memoised.
 */
let hashOnce: Promise<string> | null = null;
function testPasswordHash(): Promise<string> {
  hashOnce ??= hash(TEST_PASSWORD, ARGON);
  return hashOnce;
}

/** A verified bidder who can sign in and bid. */

export async function makeBidder(
  phone: string,
  paddle: string,
  balancePts = 500,
  role: "bidder" | "staff" | "admin" = "bidder",
): Promise<TestBidder> {
  await withClient(async (c) => {
    const res = await c.query<{ id: number }>(
      `INSERT INTO users (name, phone, password_hash, paddle, phone_verified_at,
                          date_of_birth, role)
       VALUES ('Тест биддер', $1, $2, $3, now(), '1995-06-15', $4::user_role)
       RETURNING id`,
      [phone, await testPasswordHash(), paddle, role],
    );
    await c.query("INSERT INTO balances (user_id, pts) VALUES ($1, $2)", [
      res.rows[0]!.id,
      balancePts,
    ]);
  });

  return { phone, password: TEST_PASSWORD, paddle };
}

/**
 * An admin.
 *
 * Made here rather than by promoting through the UI, because promoting needs an
 * admin and the first one has nobody to promote them — the same reason
 * db/make-admin.ts exists.
 */
export async function makeAdmin(
  phone: string,
  paddle: string,
): Promise<TestBidder> {
  return makeBidder(phone, paddle, 0, "admin");
}

/** A lot that is open and taking bids right now. */
export async function makeLiveLot(
  lotId: string,
  openingPts = 1200,
): Promise<void> {
  await withClient(async (c) => {
    const opensAt = new Date(Date.now() - 30_000);
    await c.query(
      `INSERT INTO lots (id, code, title, maker, year, category, note, provenance,
                         condition, dimensions, estimate_low_pts, estimate_high_pts,
                         opening_pts, starts_at)
       VALUES ($1, $2, 'Хүрэл цоморлиг', 'Тодорхойгүй', 'XVIII зуун', 'antique',
               'Тест лот.', '', '', '', $3, $4, $3, $5)`,
      [lotId, `ЛОТ ${lotId}`, openingPts, openingPts * 2, opensAt],
    );
    await c.query(
      `INSERT INTO auctions (lot_id, opens_at, round, current_pts,
                             bid_clock_ends_at, round_ends_at, outcome)
       VALUES ($1, $2, 1, $3, now() + interval '5 minutes',
               now() + interval '1 hour', 'running')`,
      [lotId, opensAt, openingPts],
    );
  });
}

/** Signs in through the real form, so the session cookie is a real one. */
export async function signIn(page: Page, bidder: TestBidder): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/Утасны дугаар/).fill(bidder.phone);
  await page.getByLabel(/^Нууц үг$/).fill(bidder.password);
  await page.getByRole("button", { name: /Нэвтрэх/ }).click();
  await page.waitForURL(/\/lots/);
}

/** The current price on a lot, read from the database rather than the DOM. */
export async function currentPts(lotId: string): Promise<number> {
  return withClient(async (c) => {
    const res = await c.query<{ current_pts: number }>(
      "SELECT current_pts FROM auctions WHERE lot_id = $1",
      [lotId],
    );
    return res.rows[0]?.current_pts ?? 0;
  });
}
