# Deploying URLUG to a managed container platform

The app needs a **long-running Node process** with a **direct (not
transaction-pooled) Postgres connection** — see [`DEPLOY.md`](DEPLOY.md) for why.
All three platforms below satisfy that. Render is the most turnkey and ships a
blueprint in this repo; Railway and Fly.io are one `Dockerfile` away.

Whatever the platform, three env rules are non-negotiable:

- `SMS_API_URL` **must be set** — the server refuses to boot without it.
- `NEXT_PUBLIC_ROUND_TIME_SCALE` **must be `1`** — the build throws otherwise.
- `DEV_SKIP_OTP` **must be absent** — a production server refuses to boot with it.

---

## Region — the one decision that decides how the room feels

Bidders are in Mongolia. **Deploy to the nearest region, and put the database in
the same one.** Nothing else in this document affects perceived speed as much,
and no amount of application tuning recovers a bad choice here.

| Platform | Choose |
| --- | --- |
| Render | `singapore` (set on the service *and* the database — [`render.yaml`](render.yaml) pins both) |
| Railway | Southeast Asia |
| Fly.io | `sin` |

Two things make this bigger than a single round trip:

- **Every bid is a round trip.** Round 6 gives a bidder five seconds to answer.
  A deploy in US-West spends a large fraction of that on the wire before the
  server has done anything, and the bidder experiences it as the site being
  slow at the exact moment the lot is decided.
- **A cross-region database is worse than a distant server.** `placeBid` runs
  several statements in one transaction while holding
  `SELECT … FOR UPDATE` on the auction row. Split the two apart and every one of
  those statements crosses an ocean *while holding the lock that serialises
  every other bidder on that lot*. Same region makes them sub-millisecond hops.

Render defaults to Oregon when no region is given, so this is a thing you have
to say rather than a thing you get.

### What is already tuned, and should be left alone

The server-side latency budget has been measured and is small. Before reaching
for it, confirm the region is right — these are milliseconds, and the wire is
tens or hundreds.

| Knob | Where | Why it is where it is |
| --- | --- | --- |
| SSE coalescing, 25ms | `src/app/api/room/[lotId]/stream/route.ts` | Almost the whole fixed delivery cost. Lower it and a duel becomes one serialise-and-write per subscriber per bid. |
| Room snapshot cache, 40ms | `src/lib/room-cache.ts` | Sits inside the SSE window, so it adds nothing to latency; it collapses a burst to one database read for the whole instance. |
| Bid transaction | `src/lib/repo/bids.ts` | ~5ms locally. Dominated by network once deployed. |

After deploy, measure rather than guess: `bid.placed` is timed and logged with a
duration, so the p99 in the logs is the real answer for real bidders.

---

## Option A — Render (recommended)

A [`render.yaml`](render.yaml) blueprint is in the repo: a Docker web service on
a paid instance (free spins down and kills SSE) + a managed Postgres, with
`/api/health` as the health check and an idempotent migration as the
pre-deploy step.

1. Push this repo to GitHub.
2. Render dashboard → **New → Blueprint** → pick the repo. It reads `render.yaml`.
3. Fill the `sync: false` secrets when prompted:
   `SMS_API_URL`, `SMS_API_KEY`, `QPAY_*`, and `NEXT_PUBLIC_SITE_URL`
   (set the last to the service URL Render assigns, e.g.
   `https://urlug.onrender.com`, or your custom domain).
4. **Apply.** Render builds the image, provisions Postgres, runs
   `db/migrate.ts` (schema), then routes traffic once `/api/health` is green.
5. Create the first admin — Render service → **Shell**:
   ```bash
   node --experimental-strip-types db/make-admin.ts --phone 99XXXXXX --create --password "choose-a-strong-one"
   ```

> ⚠ Confirm the `plan` names in `render.yaml` against the dashboard before
> applying — Render renames tiers occasionally and an unknown plan fails the
> blueprint.

---

## Option B — Railway

Railway auto-detects the `Dockerfile`; no config file needed.

1. **New Project → Deploy from GitHub repo.**
2. **Add → Database → PostgreSQL.** Use the `DATABASE_URL` it exposes
   (Railway's is a direct connection — good for `LISTEN/NOTIFY`).
3. Service → **Variables**: set `DATABASE_URL` (reference the DB),
   `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_ROUND_TIME_SCALE=1`, `SMS_API_URL`,
   `SMS_API_KEY`, `SMS_SENDER=URLUG`, `QPAY_*`, `TERMS_VERSION=2026-08-21`.
4. Migrate once, from the service shell (or `railway run`):
   ```bash
   node --experimental-strip-types db/migrate.ts
   ```
5. Create the first admin the same way (`db/make-admin.ts`, as above).
6. Point the health check at `/api/health`.

---

## Option C — Fly.io

```bash
fly launch --no-deploy          # generates fly.toml from the Dockerfile
fly postgres create             # managed Postgres; attach it:
fly postgres attach <db-name>   # sets DATABASE_URL as a secret
fly secrets set \
  NEXT_PUBLIC_SITE_URL=https://<app>.fly.dev \
  NEXT_PUBLIC_ROUND_TIME_SCALE=1 \
  SMS_API_URL=... SMS_API_KEY=... SMS_SENDER=URLUG \
  QPAY_API_URL=... QPAY_USERNAME=... QPAY_PASSWORD=... \
  QPAY_INVOICE_CODE=... QPAY_CALLBACK_SECRET=... \
  TERMS_VERSION=2026-08-21
fly deploy
fly ssh console -C "node --experimental-strip-types db/migrate.ts"
fly ssh console                 # then run db/make-admin.ts for the first admin
```

In `fly.toml` set the health check path to `/api/health` and, because SSE
streams run up to 2h45m, raise/disable any idle-connection timeout.

---

## After any deploy — the checklist

- [ ] Service **and** database are in the nearest region, and it is the *same*
      region for both (see above).
- [ ] `/api/health` returns 200 (503 means it cannot reach Postgres).
- [ ] `NEXT_PUBLIC_SITE_URL` matches the real public URL (wrong → blank share
      cards, sitemap pointing at localhost).
- [ ] First admin created (`db/make-admin.ts`), can reach `/admin`.
- [ ] A real SMS gateway is wired in `SMS_API_URL` and a test code arrives.
- [ ] `QPAY_*` filled and a test invoice completes (the dev-confirm route is
      dead in production).
- [ ] Custom domain attached and HTTPS verified end to end.
- [ ] **Only then** set `ENABLE_HSTS=1` — it has a two-year no-undo. Never on
      staging.
- [ ] Backups: WAL archiving / point-in-time recovery, and **test the restore**
      (see DEPLOY.md — nightly dumps alone lose a day of bids).
- [ ] Place one real bid and read the `bid.placed` duration out of the logs. If
      the p99 is over a second, round 6's five-second clock is a fifth gone
      before the server answers — check the region pairing first.

Do not redeploy while a lot is running:

```sql
SELECT lot_id, round, bid_clock_ends_at FROM auctions WHERE outcome = 'running';
```

Empty means go.
