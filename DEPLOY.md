# Deploying URLUG

## What this app needs from a host

Not much, but the one requirement is non-negotiable: **a long-running Node
process**.

| | Why |
| --- | --- |
| Persistent Node server | The SSE route holds a connection open for the length of a sale — up to 2h45m. The ticker holds a Postgres connection for its advisory lock. |
| Postgres 14+ | `LISTEN/NOTIFY`, advisory locks, `SELECT … FOR UPDATE`. |
| Session-mode pooling, or none | PgBouncer in **transaction mode breaks `LISTEN`** — the registration belongs to a connection that gets handed to someone else's query. Point `DATABASE_URL` at the server directly, or use session mode. |

**Serverless will not work.** The stream is killed at the platform's execution
limit; `EventSource` reconnects, so it degrades rather than breaks — but every
bidder reconnects every few minutes for hours, and the ticker has no process to
live in. A container platform or a VPS is the shape this wants.

## Environment

Everything is in [`.env.example`](.env.example). The ones a deploy will not
survive without:

```
DATABASE_URL                 required
NEXT_PUBLIC_SITE_URL         absolute URLs in metadata, robots, sitemap
SMS_API_URL                  required in production — boot fails without it
NEXT_PUBLIC_ROUND_TIME_SCALE must be 1 — the build throws otherwise
QPAY_*                       required to take money
ENABLE_HSTS=1                only once the domain and every subdomain are HTTPS
```

The build itself needs **no credentials** — `env.ts` reads through getters and
the pg pool is created lazily, so CI compiles without a production password.

## First deploy

```bash
npm ci
npm run build
npm run db:migrate      # idempotent
NODE_ENV=production node .next/standalone/server.js
```

Or the image: `docker build -t urlug . && docker run -p 3000:3000 --env-file .env urlug`

## Scaling out

Run as many instances as you like. Two things are already handled:

- **One ticker.** Elected with a Postgres advisory lock. A second instance
  declines the job and retries every five seconds, so a redeployed leader is
  replaced without anybody coordinating.
- **Fan-out across instances.** `LISTEN/NOTIFY` rather than an in-process
  emitter, so a bid on instance A reaches subscribers on instance B.

The ceiling is **open connections**, not CPU. Each viewer holds one SSE stream;
size the file-descriptor limit and the reverse proxy's connection limit for
peak concurrent viewers, not for requests per second.

Nginx in front needs `proxy_buffering off` for `/api/room/`. The route sets
`X-Accel-Buffering: no`, which nginx honours — but a proxy that buffers turns
an event stream into a file that arrives at the end of the sale.

## Backups

The tables that cannot be reconstructed are `bids`, `ledger_entries`,
`settlements` and `audit_log`. They are append-only by trigger, so a restore
cannot silently lose an edit — but it can lose rows.

- Continuous archiving (WAL) with **point-in-time recovery**. Nightly dumps
  alone mean losing up to a day of bids, and a bid is somebody's money.
- ⚠ **Test the restore.** An untested backup is a belief, not a backup. Restore
  into a scratch database and run `SELECT * FROM ...` against
  `reconcileBalances()` — it should return no rows.

## Deploying during a sale — don't

A deploy restarts the process. That means:

- every SSE connection drops (they reconnect, but the room blanks for a moment)
- the ticker's advisory lock is released and re-elected

Neither loses data — the engine replays missed boundaries from timestamps, so
downtime cannot change an outcome. But a bidder watching a five-second clock in
round 6 sees the room stall, and that is indistinguishable from being cheated.

**Check before deploying:**

```sql
SELECT lot_id, round, bid_clock_ends_at
  FROM auctions WHERE outcome = 'running';
```

Empty means go. Otherwise wait, or use the admin panel to close the lot
deliberately with a reason recorded.

Automating this is the better answer: a deploy gate that fails when that query
returns rows.

## Rollback

The app rolls back cleanly; **the schema is the thing to be careful with**.
`db/schema.sql` only ever adds, so a previous release runs against a newer
schema. That holds as long as nobody writes a destructive migration — when the
first one is needed, it has to be split across two releases (add, deploy, then
remove in a later one).

```bash
# Redeploy the previous image; no migration step.
docker run -p 3000:3000 --env-file .env urlug:<previous-sha>
```

## Monitoring

`/api/health` queries Postgres and returns 503 when it cannot reach it — point
the uptime monitor there, not at `/`.

What to alert on, in order of how much it matters:

| Alert | Why |
| --- | --- |
| `/api/health` failing **while a lot is running** | The one true emergency. Page someone. |
| `reconcileBalances()` returning rows | Money has appeared or vanished. Visible on `/admin`. |
| `bid.error` in the logs | The server failing, as distinct from refusing. |
| p99 of `bid.placed` over 1s | Round 6's clock is 5s. |
| `notification.send_failed` climbing | The SMS gateway is down; the outbox retries, but codes are not arriving. |

Logs are JSON in production with a stable `event` field — see
`src/lib/observability.ts`. Secrets are redacted by field name.

## Staging

Same image, same Postgres version, a separate database, and:

```
NEXT_PUBLIC_ROUND_TIME_SCALE=60   # a full sale in 2m45s
SMS_API_URL=                      # codes to the log
QPAY_*=                           # empty → the dev confirm route
ENABLE_HSTS unset                 # ⚠ never on staging
```

⚠ `ENABLE_HSTS` on a staging host poisons every visitor's browser against plain
HTTP for that domain for two years. It is the one setting here with no undo.
