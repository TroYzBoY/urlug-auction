-- ─────────────────────────────────────────────────────────────────────────────
-- URLUG ON SUPABASE
--
-- Run in the dashboard's SQL editor after db/schema.sql has been applied, and
-- again after any later schema change. Every statement is safe to repeat.
-- DEPLOY-VERCEL.md walks through the whole deploy; this file is one step of it.
--
-- Two things Supabase needs that plain Postgres does not:
--
--   1. Its HTTP API kept away from these tables.
--   2. pg_cron to drive the ticker, because Vercel has no process to run it in.
--
-- Not in schema.sql on purpose: the roles, extensions and vault named here
-- exist only on Supabase, and schema.sql must apply to any Postgres 14+.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── Prerequisites ────────────────────────────────────────────────────────────
--
-- Checked first, so a missing one stops the script before anything has run.

DO $$ BEGIN
  IF to_regclass('public.auctions') IS NULL THEN
    RAISE EXCEPTION 'Apply db/schema.sql first (npm run db:migrate).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION 'Enable pg_cron and pg_net first: Database → Extensions.';
  END IF;
  IF (SELECT count(*) FROM vault.decrypted_secrets
       WHERE name IN ('urlug_site_url', 'urlug_cron_secret')) < 2 THEN
    RAISE EXCEPTION
      'Create the vault secrets urlug_site_url and urlug_cron_secret first. See DEPLOY-VERCEL.md.';
  END IF;
END $$;


-- ── 1. Nothing through the Data API ──────────────────────────────────────────
--
-- Supabase serves the `public` schema over HTTP (PostgREST) and grants its
-- `anon` and `authenticated` roles every table created there. This app never
-- uses that API — it speaks to Postgres directly, as `postgres` — so every
-- table here, phone numbers and password hashes included, would be one leaked
-- project key away from a curl.
--
-- Switching the Data API off (Project Settings → Data API) is the first lock.
-- This is the second, for the day somebody switches it back on: no grants, and
-- row level security with no policies, so a grant added by mistake still
-- returns nothing. `postgres` owns every table and is held back by neither.

REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- And on whatever schema.sql creates later.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;


-- ── 2. The ticker ────────────────────────────────────────────────────────────
--
-- Something has to notice that a clock reached zero when nobody was bidding
-- (src/lib/ticker.ts). On Vercel no process lives long enough to keep that
-- loop, so the database calls /api/cron/tick instead.
--
-- Every second it asks whether anything is due within five seconds — a clock
-- about to run out, a lot about to open, a text waiting to go — and only then
-- makes the call. The call keeps the clocks at 250ms for as long as something
-- is near (`tickFor`). A day with no sale costs one indexed query a second and
-- no requests at all.
--
-- ⚠ The WHERE is the ticker's scan (`settleDueAuctions`) moved five seconds
--   forward. Change one and change the other.
-- ⚠ Five seconds must not exceed LOOKAHEAD_MS in src/lib/ticker.ts.
-- ⚠ The timeout outlasts the route's maxDuration. Shorter, and pg_net records a
--   failure for a call that is still running and doing its job.

SELECT cron.schedule(
  'urlug-tick',
  '1 seconds',
  $job$
  SELECT net.http_post(
           url := (SELECT decrypted_secret FROM vault.decrypted_secrets
                    WHERE name = 'urlug_site_url') || '/api/cron/tick',
           headers := jsonb_build_object(
             'Authorization',
             'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets
                            WHERE name = 'urlug_cron_secret')),
           timeout_milliseconds := 65000)
   WHERE EXISTS (
           SELECT 1 FROM public.auctions
            WHERE (outcome = 'scheduled' AND opens_at <= now() + interval '5 seconds')
               OR (outcome = 'running'
                   AND (bid_clock_ends_at <= now() + interval '5 seconds'
                        OR round_ends_at <= now() + interval '5 seconds')))
      OR EXISTS (SELECT 1 FROM public.notifications WHERE status = 'pending')
  $job$
);

-- Housekeeping, hourly: rate-limit windows, dead sessions and codes, stale
-- top-ups, old notifications. On a long-running server the ticker does this.
SELECT cron.schedule(
  'urlug-sweep',
  '17 * * * *',
  $job$
  SELECT net.http_post(
           url := (SELECT decrypted_secret FROM vault.decrypted_secrets
                    WHERE name = 'urlug_site_url') || '/api/cron/tick?sweep=1',
           headers := jsonb_build_object(
             'Authorization',
             'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets
                            WHERE name = 'urlug_cron_secret')),
           timeout_milliseconds := 65000)
  $job$
);

-- pg_cron keeps a row for every run and never deletes one: at one a second that
-- is 86,400 rows a day. Two days is plenty to debug with.
SELECT cron.schedule(
  'urlug-cron-history',
  '43 4 * * *',
  $job$ DELETE FROM cron.job_run_details WHERE end_time < now() - interval '2 days' $job$
);

-- To stop all three:
--   SELECT cron.unschedule(j) FROM unnest(ARRAY['urlug-tick', 'urlug-sweep', 'urlug-cron-history']) AS j;
