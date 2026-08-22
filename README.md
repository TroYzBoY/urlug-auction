# URLUG — дуудлага худалдааны танхим

Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS 4, TypeScript,
Postgres. Mongolian UI. The auction runs on the server: it owns the clocks,
validates every bid under a row lock, and pushes state over SSE.

```bash
npm run db:up          # Postgres 16 in Docker
npm run db:migrate     # applies db/schema.sql (idempotent)
npm run db:seed        # loads the 12 sample lots
npm run dev
```

`.env.local` already points at that container. Verification codes have no SMS
provider in development, so they are printed to the server log — look for
`[sms:dev]`.

---

## The format

Six rounds, 2h45m total. Two clocks run at once, and that is the whole game:

| Round | Bid clock | Round length | Min raise | Late entry |
| ----- | --------- | ------------ | --------- | ---------- |
| 1     | 5 min     | 25 min       | 1 pt      | —          |
| 2     | 3 min     | 25 min       | 2 pt      | 20 pt      |
| 3     | 1 min     | 25 min       | 2 pt      | 30 pt      |
| 4     | 30 sec    | 25 min       | 2 pt      | 40 pt      |
| 5     | 15 sec    | 25 min       | 2 pt      | 50 pt      |
| 6     | 5 sec     | 40 min       | 2 pt      | 60 pt      |

- **Bid clock** resets to the round's length on every accepted bid. If it hits
  zero, the lot is hammered.
- **Round clock** is fixed wall-clock time. When it expires the auction advances
  a round and the bid clock gets shorter. Round 6 expiring ends the sale.
- **1 point = 1 000₮.** All prices are held in points; ₮ is display only.
- **Late entry:** a bidder who has not yet bid on this lot must enter at
  `round × 10` points above the standing price, from round 2 onward.

All of this lives in [`src/lib/auction.ts`](src/lib/auction.ts) as data, not as
scattered conditionals. **It is the contract — the server must agree with these
numbers, and nothing else in the front-end hard-codes them.**

---

## The back end

Postgres, reached through `src/lib/repo/*`, with the whole of it inside this
Next.js app — no second service. Four pieces:

| Piece | Where | What it is |
| ----- | ----- | ---------- |
| Reads | [`src/lib/api.ts`](src/lib/api.ts) → [`src/lib/repo/lots.ts`](src/lib/repo/lots.ts) | Called from Server Components. `server-only`, so a Client Component importing them is a build error. |
| Writes | [`src/app/actions/`](src/app/actions/) | Server Functions (`'use server'`). Bids, auth, contact. |
| Room updates | [`/api/room/[lotId]/stream`](src/app/api/room/[lotId]/stream/route.ts) | SSE pushing `RoomState`, fanned out over Postgres `LISTEN/NOTIFY`. |
| Clocks | [`src/lib/auction-engine.ts`](src/lib/auction-engine.ts) + [`src/lib/ticker.ts`](src/lib/ticker.ts) | The server owns time. See below. |

### The local stack

```bash
npm run db:up        # docker compose up -d db
npm run db:migrate
npm run db:seed
npm run dev          # app on the host, database in Docker
```

Postgres runs in Docker; the app runs on the host. That split is deliberate —
a bind-mounted `node_modules` on Windows is slow and confusing, and hot reload
is worth more during development than parity with the deploy image.

| Command | |
| ------- | --- |
| `npm run db:up` / `db:down` | start / stop Postgres |
| `npm run db:reset` | destroy the volume and start clean |
| `npm run db:psql` | a psql shell in the container |
| `docker compose --profile app up --build` | the real production image, on :3000 |
| `docker compose --profile tools up -d adminer` | a DB browser on :8080 |

Compose also creates a second database, `urlug_test`, for the integration
tests. `docker compose down -v` destroys both.

### Accounts, money and the legal pages

| Route | |
| ----- | --- |
| `/profile` | balance, bid history, lots won |
| `/wallet` | point packages, top-up and ledger history |
| `/admin` | staff only — stats, lots, users, audit, ledger drift |
| `/terms`, `/privacy` | ⚠ drafted, **not reviewed by a lawyer** |

Two things in there are worth knowing before editing them.

**The terms page interpolates its numbers** from `auction.ts` — round count,
total duration, the late-entry multiplier, the join fee. A terms page is a
promise about how the system behaves, and one typed out by hand drifts from the
code the first time a round length changes, leaving the house contractually
bound to a format it no longer runs.

**Age is a date, not a checkbox.** A checkbox records that someone clicked a
checkbox; a date of birth is a fact that can be re-checked later, which is what
matters when the question comes from a regulator rather than from us. Each
document accepted at registration gets its own `consents` row, so "which text
were they shown on the day they placed that bid" has an answer.

`src/lib/repo/admin.ts` checks **no** authorisation. `requireAdmin()` in
`session.ts` is the only gate, and it calls `notFound()` rather than returning a
403 — a 403 confirms that `/admin` exists.

### Payments

Wired end to end except for the provider itself. `createTopup` opens a `pending`
row before anyone is redirected, so "the money left my account but the points
never arrived" has a record to investigate; `settleTopup` locks that row and
credits once however many times the callback is delivered.

⚠ `src/lib/payments.ts` is a seam, not a QPay integration — that needs merchant
credentials. In development the wallet redirects to a local route that credits
without payment, guarded twice: the route 404s when `NODE_ENV=production`, and
`createInvoice` throws rather than pointing at it. The callback route rejects
everything until `QPAY_CALLBACK_SECRET` is set, because an endpoint that credits
points and does not authenticate its caller is a way to mint money by curl.

### Tests

```bash
npm test          # 72 unit tests, no database needed
npm run test:db   # 39 integration tests against urlug_test
npm run test:e2e  # 9 browser tests — needs the database up
npm run test:all
```

Three layers, each proving what the one below it cannot.

The split matters. `auction.ts` and `auction-engine.ts` are pure, so the rules
and the clock are tested in milliseconds with no fixtures — that suite must
stay runnable on a laptop with nothing installed.

The integration suite covers what only exists in the database and cannot be
mocked, because a mocked row lock always holds: that `SELECT ... FOR UPDATE`
really serialises twenty simultaneous bidders down to one winner, that the
idempotency index really collapses a retry, that a balance really cannot be
overdrawn, and that `bids` and `ledger_entries` really do refuse UPDATE and
DELETE.

The e2e suite covers what needs all three at once: a session cookie surviving a
redirect, a form posting to a Server Function, and — the one worth having —
**an SSE push arriving in a second tab that nobody touched**. That is the most
load-bearing piece of the room and the one a bidder would experience as a
frozen price.

⚠ These tests TRUNCATE every table. `test/db.ts` and `e2e/fixtures.ts` both
refuse to run against a database whose name does not end in `_test`.

### Admin, notifications and settlements

`/admin` is staff-only, gated by `requireAdmin()`, which calls `notFound()`
rather than returning a 403 — a 403 confirms the route exists. It can create and
edit lots, close or cancel a running sale, reschedule, suspend an account and
adjust a balance. Four rules run through all of it:

- **A reason is a required field.** The audit row says *what* happened; *why*
  only exists if somebody was made to type it at the time.
- **Cancelling refunds every join fee**, in the same transaction. Voiding a lot
  people paid to enter and keeping their money is the kind of thing that gets
  forgotten because the auction code has already moved on.
- **A balance adjustment appears in the bidder's own history.** A silent
  correction is indistinguishable from theft from the outside.
- **There is no `deleteBid` or `setBalance`.** The database refuses them.

Notifications are an **outbox**: the row is written inside the transaction that
caused it and delivered by the ticker afterwards, so a message can never
describe a bid that rolled back, and an SMS gateway being down delays delivery
rather than losing it. The dedupe key for "you were outbid" is per lot and per
round — round 6's clock is five seconds, and eleven texts in ten seconds is a
bill as well as an annoyance.

A sold lot opens a **settlement** in the same transaction that hammers it. The
price is not deducted automatically: the format is designed to sell below
estimate, so the hammer is almost always more than the points anyone holds, and
an automatic charge would fail at the exact moment a legal obligation begins.

### Deploying

See [DEPLOY.md](DEPLOY.md). The short version: **not serverless**, and do not
deploy while a lot is running.

### The server owns the auction

[`auction.ts`](src/lib/auction.ts) says what the rules *are*.
[`auction-engine.ts`](src/lib/auction-engine.ts) says where a given auction has
got to, as a pure function of the row and the current time. It is pure on
purpose: the most consequential logic in the system is testable without a
database, and the same function runs in the three places that must agree — the
ticker, the bid path, and the SSE reader.

It **replays** missed boundaries rather than advancing one step per tick. Miss
ninety seconds to a deploy and a naive advance invents a state that never
existed; replaying finds that the lot was actually hammered forty seconds ago
and settles it at that timestamp. Downtime cannot change an outcome.

`isLegalBid` still runs in [`BidPanel`](src/components/room/BidPanel.tsx). It is
a UX affordance — it saves a round trip on an obviously low bid. The control is
[`src/lib/repo/bids.ts`](src/lib/repo/bids.ts), which re-runs the same functions
under `SELECT ... FOR UPDATE` on the auction row. That lock is what makes two
bids in the same millisecond resolve in an order the database chose rather than
one luck chose.

### One knob, and it defends itself

```ts
// src/lib/auction.ts — read from NEXT_PUBLIC_ROUND_TIME_SCALE
export const ROUND_TIME_SCALE = 1;  // 60 compresses 2h45m into 2m45s for demos
```

It moved out of the room component because the **server** now schedules the
clocks; two copies would mean a countdown that disagrees with the moment the
hammer falls. A production build with anything but `1` throws at import rather
than quietly running a 2h45m sale in under three minutes.

The rival-bidder simulator is gone entirely — the stream replaces it. Fake
bidders against real ones is shill bidding, so there is no flag left to forget.

### Latency

Measured end to end — bid committed → arriving at a connected client — on one
machine with Postgres local:

| | 1 watcher | 100 watchers |
| --- | --- | --- |
| bid transaction | 5 ms | 5 ms |
| commit → first client | 31 ms | 45 ms |
| commit → last client | 31 ms | 65 ms |
| spread across clients | 0 ms | 18 ms |

Three things that follow, in order of how much they matter:

**The fixed cost is the coalescing window, not the database.** 25 of the ~31ms
is `COALESCE_MS` in the stream route. The transaction is 5ms and the fan-out is
about **0.2ms per subscriber** — so a thousand viewers implies a ~200ms spread,
and that is the number to plan against, not throughput.

**Everyone sees a bid within ~20ms of each other.** In an auction that matters
more than the absolute figure: no bidder has a systematic advantage over
another. Add the real network on top — a phone in Ulaanbaatar puts perhaps
40–80ms between the server and the screen, equally for everyone.

**Against a five-second clock this is 1–2%.** A bidder in round 6 sees a rival's
bid with 4.9 seconds left rather than 5.0.

⚠ Measured with 100 SSE readers in one Node process, which contend with each
other in a way real browsers on separate machines do not. Treat the spread as a
ceiling.

The fan-out was originally one database read *per subscriber* per push — 64ms
with one watcher, 97ms with a hundred, growing linearly with the audience.
[`src/lib/room-cache.ts`](src/lib/room-cache.ts) collapses that to one read per
lot per push, which is why the window could then be halved.

### Deployment constraint

The SSE route holds a connection open for the length of a sale, and the ticker
holds a pg connection for its advisory lock. Both need a **long-running Node
server** — a container or a VPS. On a serverless platform the stream is killed
at the execution limit and every bidder reconnects every few minutes for hours.

---

## Design system

Dark, everywhere, always, and **flat**. The ground is a single fill and nothing
paints over it.

There used to be a fixed backdrop layer carrying three soft accent blooms —
amber in one corner, flare in another, olive along the bottom — plus a paper
grain, on the theory that large flat fills read as dead screen space. On a light
ground that was true. On a dark one it was not: the blooms read as uneven
patches of colour rather than as depth, and the grain, whose alpha was tuned to
darken a light page and lift a dark one by the same amount, was simply visible
as speckle against roast.

⚠ If the field ever needs lifting again, use **one** very low-contrast wash.
The eye reads two hues as blotching long before it reads them as depth.

Tokens live in
[`src/app/globals.css`](src/app/globals.css) in two layers: a **raw palette** of
plain custom properties (the only literal colours in the codebase, deliberately
outside `@theme` so Tailwind does not emit a utility per swatch), and **semantic
tokens** inside `@theme` that point at them.

| Role | |
| ---- | --- |
| ground | `#17120e` roast |
| surface | `#241a13` |
| ink | `#f4ece2` cream |
| accent | `#c98a4b` amber gold |
| flare | `#d99a55` |
| rust | `#cf5f34` urgency |
| olive | `#7d8a5f` confirmed |

There were four theme states — light, OS-dark, explicitly-dark, and an
always-dark room skin — and keeping the two dark blocks in step was a standing
hazard: a token added to the media query but not the selector was right for
everyone following their OS and wrong for everyone who had used the toggle, and
the difference was invisible until somebody sent a screenshot.

One palette removes the whole class of bug, and it is what the room already did.
The bidding room was always dark regardless of theme, because it is a *place*
rather than a preference. Now the whole site is that place — so the toggle, the
`data-theme` attribute, the `prefers-color-scheme` branch and the `data-skin`
override are all gone, along with the theme half of the pre-paint script.
`src/app/globals.test.ts` fails the build if a second palette creeps back.

**Type:** Inter (`next/font/google`, latin + cyrillic) — a neo-grotesque from
the same lineage as Helvetica, which leads the stack for anyone who has it.
Helvetica Neue is not web-licensed and is absent on Windows and Android, so it
can only ever *lead*, never be served. Inter carries the full Cyrillic set the
Mongolian copy needs.

## Motion

Almost none, outside the landing. What is left is there because it carries
information.

| Kept | Why |
| ---- | --- |
| The live dot's pulse | Distinguishes a lot taking bids from one that is not, at a glance and without reading a label. |
| The clock's urgency colour | Calm → warm → hot as a round's clock runs down. See `urgencyOf` in [`auction.ts`](src/lib/auction.ts). |
| `RollingNumber` on the price | The headline figure rolls rather than swapping, so a change is noticed. |
| Button press feedback | On touch there is no hover state; a control that does not move under the finger reads as broken. |
| The shared-element morph | A lot's plate travels from the catalogue grid into the lot page — it says the object you tapped is the object you are looking at. |

**Gone:** scroll reveals, entrance staggers, the drifting aura behind the hero,
the sheen crossing the CTA, the room's fade-in, and the whole-page theme
crossfade.

The scroll reveals are worth a note, because removing them removed real work.
`reveal-manager.ts` tracked element position rather than intersection events,
precisely so that jumping past an element — an anchor link, the End key, a
restored scroll position — still revealed it, which `IntersectionObserver` gets
wrong. All of that care was in service of never leaving content invisible; not
hiding it in the first place achieves the same thing with no code. `Reveal`
survives as a plain wrapper so its thirty call sites keep their `as` and `id`,
and it is now a Server Component that ships no JavaScript.

Everything remaining is disabled under `prefers-reduced-motion`, view
transitions included — those need stopping explicitly, because the browser runs
them outside the element's own animation timeline.

## The landing

`/` is the Descent: five pinned scenes over a WebGL shaft, scrubbed by scroll.
It stays — it is the piece that explains the format before anyone reads a rule.

What changed is that **the colour no longer moves**. It used to run a journey:
bone at the top, dimming through dusk to roast, with a `heat` term pushing the
lit tone toward chestnut, rust and amber at the dramatic moments. That was the
thing that read as restless rather than as depth — the page's own colour kept
shifting underneath text that was trying to be read, and the custom-property
rewrite it required invalidated style for the whole document several times a
second while somebody was reading it.

Now `depthColors` returns one fixed pair, published once — and the two tones are
four code values apart rather than twenty-five, because the shader mixes between
them by a noise-driven luminance and that distance *is* how blotchy the ground
looks. Enough for the geometry to sit in air; little enough that a still frame
reads as one colour.

### Two washes, and only two

The ambient colour is gone; the *deliberate* colour stayed. Scenes 04 and 05
each carry one full-bleed radial wash, and they are a pair:

| Scene | Colour | Scrubbed by |
| ----- | ------ | ----------- |
| 04 БОСГО — the hammer | rust, peaking at 0.85 | `--flood` |
| 05 ТАНХИМ — the hall | amber, peaking at 0.75 | `--door × --doorFade` |

Red for the hammer, gold for the room you walk into. The piece is quiet
everywhere else precisely so these two read as events rather than as more
decoration, and the hall sits a shade under the hammer on purpose — the hammer
is a moment, the hall is a place you arrive in. Both use `screen` blending, so
they lift the ground toward the colour instead of covering it and the geometry
stays legible through them.

Scene 05 used to be a clipped **rectangle**: a lit doorway 780×560 that widened
as you scrolled, masked at the edges so its bounding box would not show. The
shape was the idea and the idea did not survive being looked at — a hard-edged
lozenge of light in the middle of a dark screen reads as a panel, and no amount
of feathering changes the fact that it is a box. As a wash it reads as the room
filling with light.

Removed and not restored:

| Removed | What it did |
| ------- | ----------- |
| the burn canvas | A viewport-sized WebGL alpha pass composited over everything — the expensive one, on a phone. |
| the vignette, cut 0.26 → 0.10 | Darkened the corners by a quarter, which against a dark ground is a pool of shadow rather than a lens. |

The burn renderer is still compiled but never drawn: bringing it back is one
branch, and a shader that has been proven is worth keeping proven.

Both smoothing stages were also loosened — Lenis `lerp` 0.085 → 0.06 and
`SCRUB_TAU` 0.11 → 0.2 — so the shaft keeps moving briefly after the finger
stops. ⚠ There is a ceiling on that: past roughly 0.3 the lag reads as
unresponsiveness rather than weight, and on a phone it arrives sooner.

## Layout

```
src/
  app/
    layout.tsx              Inter, metadata, safe area, skip link, CSP nonce
    globals.css             raw palette → semantic tokens, ONE dark palette,
                            grain, the live-dot keyframe, view-transition CSS
    page.tsx                home: hero, live lot, round ladder, catalogue, results
    rules/page.tsx          the format in prose + table
    auction/[id]/page.tsx   one URL per lot, three states (see below)
    not-found.tsx
    actions/     'use server' — bid.ts, auth.ts, contact.ts
    api/room/[lotId]/stream/   SSE: RoomState out, nothing in
    forgot/      password reset, both steps on one URL
  components/
    site/        SiteHeader (reads the session), Header, Footer,
                 RoundLadder, Reveal (a plain wrapper now)
    lot/         LotCard, LotPlate, LotPreview
    auth/        AuthForm, AuthShell, OtpForm, ForgotForm
    room/        AuctionRoom, BidClock, BidPanel, BidFeed, RoundRail,
                 useAuctionRoom (stream + optimistic), useCountdown
  lib/
    auction.ts         ← the rules. Single source of truth, shared both ways.
    auction-engine.ts  ← where an auction has got to. Pure. Heavily tested.
    api.ts             ← every read, server-only.
    repo/              lots.ts, bids.ts, users.ts
    db.ts  env.ts  session.ts  password.ts  sms.ts  realtime.ts
    ticker.ts  rate-limit.ts  audit.ts  validation.ts  server-clock.ts
    types.ts  copy.ts  format.ts
  proxy.ts       CSP nonce + security headers
  instrumentation.ts  boot: assert env, elect the ticker
db/
  schema.sql  migrate.ts  seed.ts  fixtures/lots.ts
```

`/auction/[id]` is **one route, three branches**: live lots get the dark bidding
room, upcoming lots get the catalogue preview, and finished lots get their
result. A bidder can bookmark one URL per lot and it becomes the bidding screen
when the session opens, then the result page afterwards.

The seed catalogue is 12 lots across all six categories, covering every status
the UI renders: 1 live, 8 upcoming, 2 sold, 1 unsold. It lives in
`db/fixtures/lots.ts` — outside `src/`, so no code path can reach mock data at
runtime.

### Notes worth knowing before you edit

- **All copy is in [`src/lib/copy.ts`](src/lib/copy.ts).** Components never
  inline strings, so adding English means adding a second dictionary of the same
  shape plus a locale switch — no component edits.
- **Formatting is hand-rolled, not `Intl`** ([`format.ts`](src/lib/format.ts)).
  `Intl`'s grouping separator for `mn-MN` differs between Node and browser ICU
  builds, which surfaces as a hydration mismatch on every price on the page.
- **Seed data is deterministic — never `Date.now()`.** The room is a Client
  Component and so gets server-rendered too. Live deadlines are safe only
  because `useCountdown` returns `null` until the first client frame, so no
  clock text ever reaches the server HTML.
- **`useCountdown` throttles by display precision.** The bid clock asks for 50ms
  (it shows tenths under ten seconds); the round clock asks for 1000ms and so
  re-renders once a second instead of sixty times. Clocks own their own ticking
  so the bid feed does not re-render at 60fps.
- **rAF pauses in a hidden tab.** Remaining time is computed from an absolute
  deadline, so a backgrounded tab self-heals the instant it is refocused. In
  production the server is authoritative for expiry regardless.
- **`LotPlate` is placeholder artwork**, not a grey box: a warm ground plus a
  single-stroke silhouette per category, drawn in CSS/SVG with no network
  assets. Swap the inner content for `<Image>` when real photos arrive; the
  aspect box and overlays around it stay.

---

## Still to do

- Auth: `Нэвтрэх` / `Бүртгүүлэх` are inert buttons.
- Server-side bid validation and the websocket feed (above).
- Real lot photography.
- Payment / settlement after the hammer.
