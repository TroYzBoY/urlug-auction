# Deploying URLUG to a managed container platform

The app needs a **long-running Node process** with a **direct (not
transaction-pooled) Postgres connection** — see [`DEPLOY.md`](DEPLOY.md) for why.
All three platforms below satisfy that. Render is the most turnkey and ships a
blueprint in this repo; Railway and Fly.io are one `Dockerfile` away.

Whatever the platform, four rules are non-negotiable:

- `SMS_API_URL` **must be set** — the server refuses to boot without it.
- `NEXT_PUBLIC_ROUND_TIME_SCALE` **must be `1`** — the build throws otherwise.
- `DEV_SKIP_OTP` **must be absent** — a production server refuses to boot with it.
- `NEXT_PUBLIC_SITE_URL` **must be a BUILD argument**, not a runtime secret —
  see below. This one is silent when you get it wrong.

### The build-time trap

Next inlines every `NEXT_PUBLIC_*` value **at compile time**, server components
included. A value supplied only as a runtime secret arrives after the output has
already been written, and is ignored — `robots.txt` is prerendered to a static
file with the URL baked into it, so the production site serves
`Sitemap: http://localhost:3000/sitemap.xml` and every share card renders blank.
Nothing errors.

The `Dockerfile` takes it as a build arg:

```bash
docker build --build-arg NEXT_PUBLIC_SITE_URL=https://your-domain.mn .
```

`fly.toml` sets it under `[build.args]`. **Check it after every first deploy to
a new URL:**

```bash
curl -s https://your-domain.mn/robots.txt | grep Sitemap
```

---

## Region — the one decision that decides how the room feels

Bidders are in Mongolia. **Deploy to the nearest region, and put the database in
the same one.** Nothing else in this document affects perceived speed as much,
and no amount of application tuning recovers a bad choice here.

Measured from Ulaanbaatar — one TCP handshake, best of five:

| Region | RTT | |
| --- | --- | --- |
| Ulaanbaatar (domestic) | ~5 ms | a Mongolian datacentre, if you can operate Postgres yourself |
| **Hong Kong** | **57 ms** | **what [`fly.toml`](fly.toml) uses** |
| Tokyo | 84 ms | |
| Seoul / Osaka | 91 ms | |
| Singapore | 107 ms | the best Render can do |
| Frankfurt | 116 ms | |
| Oregon | 190 ms | Render's default when none is given |
| Virginia | 217 ms | |

Mongolian transit runs through China, which is why Hong Kong beats Tokyo despite
being further away in a straight line. Re-measure rather than trusting this
table if the audience's ISPs change — the numbers depend on whose transit the
bidders are on.

| Platform | Choose |
| --- | --- |
| Fly.io | `hkg` |
| Railway | Southeast Asia |
| Render | `singapore` (service *and* database — [`render.yaml`](render.yaml) pins both) |

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

## Option A — Fly.io, Hong Kong (recommended)

Fastest for a Mongolian audience by a clear margin, and the repo carries a
[`fly.toml`](fly.toml) that pins `hkg`, the health check, the release-time
migration and — importantly — the build arg.

```bash
fly launch --no-deploy --copy-config      # keeps the fly.toml in this repo

# Postgres in the SAME region. A database elsewhere puts an ocean inside the
# transaction that holds the bid lock.
fly postgres create --region hkg
fly postgres attach <db-name>             # sets DATABASE_URL as a secret

# Runtime secrets. NEXT_PUBLIC_* deliberately absent — see the build-time trap.
fly secrets set \
  SMS_API_URL=... SMS_API_KEY=... \
  QPAY_API_URL=... QPAY_USERNAME=... QPAY_PASSWORD=... \
  QPAY_INVOICE_CODE=... QPAY_CALLBACK_SECRET=...

# Set the real URL in fly.toml's [build.args] first, then:
fly deploy

# First admin.
fly ssh console -C "node --experimental-strip-types db/make-admin.ts --phone 99XXXXXX --create --password '...'"
```

The schema is applied by `release_command` in `fly.toml`, on a temporary machine
with the secrets attached, before the new version takes traffic. A failure there
aborts the deploy rather than releasing a version its schema cannot serve — so
there is no separate migrate step.

**Three things in `fly.toml` are load-bearing.** Changing them breaks the
auction rather than merely slowing it:

- `auto_stop_machines = false` and `min_machines_running = 1`. Fly stops idle
  machines, and a room can legitimately be silent for most of round 1's
  five-minute clock — which looks exactly like idle. A stopped machine has no
  ticker, so no lot advances a round and no hammer falls until somebody happens
  to load a page.
- `primary_region = "hkg"`, matching the database's region.
- `[build.args] NEXT_PUBLIC_SITE_URL`. Not a secret. See the build-time trap
  above, and check `/robots.txt` after the first deploy.

⚠ `fly postgres` is **unmanaged** — Fly operates the VM, you operate Postgres.
Snapshots are volume-level, not point-in-time. `DEPLOY.md` is emphatic that
`bids` and `ledger_entries` need WAL archiving with a *tested* restore; budget
for that, or use Fly's Managed Postgres offering where it is available in `hkg`.

Scaling out is `fly scale count 2` — the ticker elects one leader through a
Postgres advisory lock and `LISTEN/NOTIFY` fans out across machines, so nothing
else has to change. It also turns a deploy into a rolling one instead of a
restart.

---

## Option B — Render (least effort, ~50ms slower)

Managed Postgres with backups included, and a blueprint that needs no CLI. The
trade is the region: Render's nearest Asian datacentre is Singapore, so this
path cannot go below roughly 107ms from Ulaanbaatar against Hong Kong's 57ms.

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

## Option C — Railway

Railway auto-detects the `Dockerfile`; no config file needed.

1. **New Project → Deploy from GitHub repo.**
2. **Add → Database → PostgreSQL.** Use the `DATABASE_URL` it exposes
   (Railway's is a direct connection — good for `LISTEN/NOTIFY`).
3. Service → **Variables**: set `DATABASE_URL` (reference the DB),
   `SMS_API_URL`, `SMS_API_KEY`, `SMS_SENDER=URLUG`, `QPAY_*`,
   `TERMS_VERSION=2026-08-21`.
   ⚠ `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_ROUND_TIME_SCALE` must reach the
   **Docker build**, not the runtime — pass them as build args (see the
   build-time trap above), or robots.txt ships pointing at localhost.
4. Migrate once, from the service shell (or `railway run`):
   ```bash
   node --experimental-strip-types db/migrate.ts
   ```
5. Create the first admin the same way (`db/make-admin.ts`, as above).
6. Point the health check at `/api/health`.

---

## After any deploy — the checklist

- [ ] Service **and** database are in the nearest region, and it is the *same*
      region for both (see above).
- [ ] `/api/health` returns 200 (503 means it cannot reach Postgres).
- [ ] `curl -s <url>/robots.txt | grep Sitemap` names the real domain. If it
      says localhost, `NEXT_PUBLIC_SITE_URL` reached the runtime instead of the
      build — nothing errored, and every share card is blank.
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
