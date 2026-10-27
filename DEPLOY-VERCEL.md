# Deploying URLUG to Vercel + Supabase

[`DEPLOY.md`](DEPLOY.md) says this app wants a long-running Node process. Vercel
does not have one, so three things were changed to make it work there. Know the
cost of each before you choose this over [Fly.io](DEPLOY-PLATFORM.md):

| On a long-running server | On Vercel | What it costs |
| --- | --- | --- |
| The ticker loops in-process every 250ms | Supabase's pg_cron checks every second and calls `/api/cron/tick` when a clock is under 5s from due. That call loops at 250ms until nothing is near | Measured locally: a lot hammered 111ms after its clock. At a handover between calls (at most every 30s, in a continuous final round) a hammer can be 1–2s late |
| One SSE stream for the whole sale | The stream ends itself at 290s and the browser is back within a second, with a full state | A one-second gap every five minutes per viewer |
| Ten pooled connections | Supabase's session pooler, shared by every Vercel instance | 15 clients on the smallest compute, so `DATABASE_POOL_MAX=5`. Raise the pooler's pool size before a busy sale |

Also true on Vercel:

- **A request or response body over 4.5MB is refused by Vercel** before the
  app sees it. The lot form shrinks photographs in the browser first, so uploads
  are normally far smaller; an image stored above 4.5MB cannot be served.
- `next/image` resizing counts against Vercel's image quota.
- **Vercel's Hobby plan is for non-commercial use only.** An auction that takes
  money needs Pro. Hobby is fine for a trial.
- **Supabase's Free plan has no point-in-time recovery, and a project with no
  activity for a week is paused.** `bids` and `ledger_entries` are people's
  money (see the backups section in `DEPLOY.md`). For real sales, use Pro with
  the PITR add-on.

---

## Region

Bidders are in Mongolia, and the database must sit next to the functions,
because `placeBid` runs several statements while holding the auction's row
lock (see `DEPLOY-PLATFORM.md`). Tokyo serves both:

- **Supabase:** Northeast Asia (Tokyo), `ap-northeast-1`
- **Vercel:** `hnd1`, already pinned in [`vercel.json`](vercel.json)

Seoul (`ap-northeast-2` + `icn1`) also works. If you use it, change `vercel.json`
to match. Never put the two in different regions.

---

## 1. Supabase project

1. **New project** in the Tokyo region, with a strong database password.
2. **Connect → Session pooler.** Copy that connection string. It is the
   `DATABASE_URL` everywhere below:

   ```
   postgresql://postgres.<ref>:<password>@<host>.pooler.supabase.com:5432/postgres
   ```

   - ✅ The session pooler, **port 5432**. It supports `LISTEN`, advisory locks
     and `SET`, and is reachable over IPv4.
   - ❌ Not the transaction pooler (port 6543). It has no `LISTEN` and no
     advisory locks, so rooms stop updating and nothing errors.
   - ❌ Not the direct connection (`db.<ref>.supabase.co`). It is IPv6-only,
     and Vercel cannot reach it.

3. **Apply the schema from your machine:**

   ```bash
   DATABASE_URL="<session pooler url>" npm run db:migrate
   ```

   PowerShell: `$env:DATABASE_URL="<session pooler url>"; npm run db:migrate`.
   Prefix the next command the same way. A value already in the environment
   wins over `.env.local`.

4. **Prove that realtime works through that URL:**

   ```bash
   DATABASE_URL="<session pooler url>" node --experimental-strip-types db/check-realtime.ts
   ```

   Both checks must pass. `/api/health` passes either way, so it proves nothing
   here.

5. **Turn the Data API off** (Project Settings → Data API). The app talks to
   Postgres directly and never uses it. Left on, it serves the `public` schema
   (phone numbers, password hashes) to anyone holding the project's key.
   `db/supabase.sql` adds a second lock below.

6. **Enable `pg_cron` and `pg_net`** (Database → Extensions).

## 2. Vercel project

1. **Add New → Project →** import `TroYzBoY/urlug-auction`. Vercel detects
   Next.js; leave the build settings as they are. Keep **Fluid compute** on
   (the default; Settings → Functions). The room stream's 300s limit relies on
   it.

2. **Environment variables, scoped to Production:**

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | the session pooler URL |
   | `DATABASE_POOL_MAX` | `5` |
   | `NEXT_PUBLIC_SITE_URL` | `https://<project>.vercel.app`, or your domain |
   | `NEXT_PUBLIC_ROUND_TIME_SCALE` | `1` |
   | `CRON_SECRET` | `node -e "console.log(crypto.randomBytes(32).toString('hex'))"` |
   | `SMS_API_URL`, `SMS_API_KEY`, `SMS_SENDER` | your gateway |
   | `QPAY_API_URL`, `QPAY_USERNAME`, `QPAY_PASSWORD`, `QPAY_INVOICE_CODE`, `QPAY_CALLBACK_SECRET` | to take money |

   - The server **refuses to boot** without `SMS_API_URL`, or without
     `CRON_SECRET` on Vercel. `ALLOW_UNVERIFIED_SIGNUP=1` is the documented
     stopgap while there is no gateway yet (see `.env.example`).
   - **Never** set `DEV_SKIP_OTP`. Set `ENABLE_HSTS=1` only once the final
     domain serves HTTPS.
   - `NEXT_PUBLIC_*` values are baked in at build time, which Vercel handles
     because it builds with these variables. **Changing one means
     redeploying.**
   - ⚠ **Production scope only.** Preview deployments (one per pushed branch)
     that are given the production `DATABASE_URL` read and write the real
     database. Without the variables they fail to boot, which is the safe
     outcome. For working previews, give them a second Supabase project.

3. **Deploy.**

## 3. The ticker

In the Supabase **SQL editor**:

```sql
-- The production URL, no trailing slash — never a preview URL.
select vault.create_secret('https://<project>.vercel.app', 'urlug_site_url');
-- The same value as CRON_SECRET on Vercel.
select vault.create_secret('<CRON_SECRET>', 'urlug_cron_secret');
```

Then paste and run all of [`db/supabase.sql`](db/supabase.sql). It:

- revokes `anon`/`authenticated` on every table and turns on row level
  security, as the second lock behind the Data API switch
- schedules `urlug-tick` (every second, calls only when something is due),
  `urlug-sweep` (hourly housekeeping) and `urlug-cron-history` (daily, trims
  pg_cron's log)

It checks its prerequisites first: the schema, both extensions and both
secrets. It is safe to run again, and **should** be run again after any schema
change, so that new tables get row level security too.

**Check it** from your machine:

```bash
curl -X POST -H "Authorization: Bearer <CRON_SECRET>" https://<project>.vercel.app/api/cron/tick
# {"leader":true,"settled":0,"sent":0}
```

`403` means the secret does not match. Once a lot is running, check that
Supabase is calling:

```sql
select status, return_message, start_time from cron.job_run_details
 order by start_time desc limit 5;
select status_code, content, created from net._http_response
 order by created desc limit 5;
```

## 4. First admin

From your machine, against the same database:

```bash
DATABASE_URL="<session pooler url>" npm run db:make-admin -- --phone 99XXXXXX --create --password "choose-a-strong-one"
```

## 5. After the first deploy

Everything in the checklist at the end of
[`DEPLOY-PLATFORM.md`](DEPLOY-PLATFORM.md) applies, the `robots.txt` check
above all:

```bash
curl -s https://<project>.vercel.app/robots.txt | grep Sitemap
```

---

## Later

**A schema change:** `npm run db:migrate` against Supabase *before* the code
that needs it is deployed, then run `db/supabase.sql` again.

**A new domain:** change `NEXT_PUBLIC_SITE_URL` on Vercel and redeploy, then
point the ticker at it:

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'urlug_site_url'),
  'https://your-domain.mn');
```

**A new `CRON_SECRET`:** the same in both places. Change it on Vercel and
redeploy, then `vault.update_secret` on `urlug_cron_secret`. Ticks between the
two answer `403`.

**Stopping the ticker:** see the last lines of `db/supabase.sql`.

**Not during a sale.** The rule in `DEPLOY.md` holds here too. A Vercel deploy
switches new requests to the new version at once, but streams already open
finish on the old one, so a room briefly runs on two versions:

```sql
SELECT lot_id, round, bid_clock_ends_at FROM auctions WHERE outcome = 'running';
```

Empty means go.
