/**
 * Loads the sample catalogue into a fresh database.
 *
 * The twelve lots that used to live in `src/lib/mock.ts` are here instead. They
 * are development fixtures, not application code: the difference matters
 * because nothing in `src/` can now import them, so there is no path by which
 * mock data reaches a running server.
 *
 *   node --experimental-strip-types db/seed.ts
 *
 * ⚠ Development only. It refuses to run against NODE_ENV=production, and it
 * schedules every lot relative to `now`, which is meaningless for a real sale.
 */
import { Client } from "pg";
import { bidClockMs, roundEndOffsetMs } from "../src/lib/auction.ts";
import { LOTS } from "./fixtures/lots.ts";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed a production database.");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. See .env.example.");
  process.exit(1);
}

const client = new Client({ connectionString });
await client.connect();

/*
 * The fixtures carry a status. Translate it into an opening time relative to
 * now, so a freshly seeded database has something live to look at immediately
 * rather than a catalogue that starts next Tuesday.
 */
const TOTAL_MS = roundEndOffsetMs(6);

/**
 * When to open each lot, given the status the fixture claims.
 *
 * ⚠ A "live" lot is opened a fraction of ROUND 1'S BID CLOCK ago, not a
 * fraction of the whole programme. That distinction is the entire correctness
 * of this function, and getting it wrong is invisible until the server starts.
 *
 * The first version used 10% of the 2h45m programme — 16 minutes. Round 1's bid
 * clock is five minutes, so by the time the ticker ran, every "live" lot had
 * sat unanswered for eleven minutes past its clock and was correctly hammered
 * as unsold. The engine was right; the seed data described a state that cannot
 * exist. `npm run db:seed` produced a catalogue with nothing live in it.
 */
function opensAtFor(status: string, index: number): Date {
  const now = Date.now();

  switch (status) {
    case "live":
      /*
       * A fifth of round 1's clock in. Under way, visibly counting down, and
       * with four minutes still on the clock for someone to place a bid.
       */
      return new Date(now - bidClockMs(1) * 0.2);

    case "sold":
    case "unsold":
      // Comfortably past the end of a full programme.
      return new Date(now - TOTAL_MS - 60_000 * (index + 1));

    default:
      return new Date(now + 60 * 60_000 * (index + 1));
  }
}

try {
  await client.query("BEGIN");

  for (const [index, lot] of LOTS.entries()) {
    await client.query(
      `
      INSERT INTO lots (id, code, title, maker, year, category, note, provenance,
                        condition, dimensions, estimate_low_pts, estimate_high_pts,
                        opening_pts, image, starts_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (id) DO UPDATE SET
        code = EXCLUDED.code, title = EXCLUDED.title, maker = EXCLUDED.maker,
        year = EXCLUDED.year, category = EXCLUDED.category, note = EXCLUDED.note,
        provenance = EXCLUDED.provenance, condition = EXCLUDED.condition,
        dimensions = EXCLUDED.dimensions,
        estimate_low_pts = EXCLUDED.estimate_low_pts,
        estimate_high_pts = EXCLUDED.estimate_high_pts,
        opening_pts = EXCLUDED.opening_pts, image = EXCLUDED.image,
        starts_at = EXCLUDED.starts_at, updated_at = now()
      `,
      [
        lot.id,
        lot.code,
        lot.title,
        lot.maker,
        lot.year,
        lot.category,
        lot.note,
        lot.provenance,
        lot.condition,
        lot.dimensions,
        lot.estimateLowPts,
        lot.estimateHighPts,
        lot.openingPts,
        lot.image ?? null,
        opensAtFor(lot.status, index),
      ],
    );

    const opensAt = opensAtFor(lot.status, index);
    await client.query(
      `
      INSERT INTO auctions (lot_id, opens_at, round, current_pts, bid_clock_ends_at,
                            round_ends_at, outcome)
      VALUES ($1, $2, 1, $3, $4, $5, 'scheduled')
      ON CONFLICT (lot_id) DO UPDATE SET
        opens_at = EXCLUDED.opens_at,
        round = 1,
        current_pts = EXCLUDED.current_pts,
        leader_user_id = NULL,
        leader_paddle = NULL,
        bid_clock_ends_at = EXCLUDED.bid_clock_ends_at,
        round_ends_at = EXCLUDED.round_ends_at,
        outcome = 'scheduled',
        hammer_round = NULL,
        settled_at = NULL,
        bid_count = 0,
        version = auctions.version + 1,
        updated_at = now()
      `,
      [
        lot.id,
        opensAt,
        lot.openingPts,
        new Date(opensAt.getTime() + bidClockMs(1)),
        new Date(opensAt.getTime() + roundEndOffsetMs(1)),
      ],
    );
  }

  await client.query("COMMIT");
  const live = LOTS.filter((l) => l.status === "live").length;
  const upcoming = LOTS.filter((l) => l.status === "upcoming").length;

  console.info(`Seeded ${LOTS.length} lots: ${live} live, ${upcoming} upcoming.`);
  console.info(
    "Every lot is written as 'scheduled'; the ticker promotes and settles them " +
      "on its first pass after the server starts. Give it a second, then check:",
  );
  console.info(
    "  SELECT lot_id, outcome FROM auctions WHERE outcome = 'running';",
  );
} catch (err) {
  await client.query("ROLLBACK");
  console.error("Seed failed, rolled back:", err);
  process.exitCode = 1;
} finally {
  await client.end();
}
