# MAISON — дуудлага худалдааны танхим

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

Compose also creates a second database, `maison_test`, for the integration
tests. `docker compose down -v` destroys both.

### Tests

```bash
npm test         # 52 unit tests, no database needed
npm run test:db  # 38 integration tests against maison_test
npm run test:all
```

The split matters. `auction.ts` and `auction-engine.ts` are pure, so the rules
and the clock are tested in milliseconds with no fixtures — that suite must
stay runnable on a laptop with nothing installed.

The integration suite covers what only exists in the database and cannot be
mocked, because a mocked row lock always holds: that `SELECT ... FOR UPDATE`
really serialises twenty simultaneous bidders down to one winner, that the
idempotency index really collapses a retry, that a balance really cannot be
overdrawn, and that `bids` and `ledger_entries` really do refuse UPDATE and
DELETE.

⚠ Those tests TRUNCATE every table. `test/db.ts` refuses to run against a
database whose name does not end in `_test`.

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

### Deployment constraint

The SSE route holds a connection open for the length of a sale, and the ticker
holds a pg connection for its advisory lock. Both need a **long-running Node
server** — a container or a VPS. On a serverless platform the stream is killed
at the execution limit and every bidder reconnects every few minutes for hours.

---

## Design system

Autumn/brown, premium and minimal. Two skins share **one** set of token names in
[`src/app/globals.css`](src/app/globals.css):

| Role       | Light shell (browsing) | Dark roast (live room) |
| ---------- | ---------------------- | ---------------------- |
| ground     | `#faf7f2` bone         | `#17120e` roast        |
| surface    | `#f3ede4`              | `#241a13`              |
| ink        | `#1c1714` umber        | `#f4ece2`              |
| accent     | `#7a4b2a` chestnut     | `#c98a4b` amber gold   |
| flare      | `#c6743e` burnt amber  | `#d99a55`              |
| rust       | `#a3341f` urgency      | `#cf5f34`              |
| olive      | `#5c6b4b` confirmed    | `#7d8a5f`              |

Tokens come in two layers: a **raw palette** of plain custom properties (the
only literal colours in the codebase, deliberately outside `@theme` so Tailwind
does not emit a utility per swatch), and **semantic tokens** inside `@theme`
that point at them. Re-skinning is re-pointing semantics at different raws.

Because plain `@theme` (not `@theme inline`) emits utilities as
`var(--color-x)`, all four states below work through ordinary cascade — a
component written with `bg-surface text-ink` is correct in every one and never
needs a `dark:` variant. **Add a state by copying a block, not by touching
components.**

| State                          | Resolves to                                    |
| ------------------------------ | ---------------------------------------------- |
| `:root`                        | light — the default, and what the server renders |
| `@media (prefers-color-scheme: dark)` + `:root:not([data-theme="light"])` | dark, following the OS |
| `:root[data-theme="dark"]`     | dark, explicitly chosen                        |
| `[data-skin="room"]`           | **always dark** — see below                    |

The live bidding room is a *place*, not a theme, so it stays dark even for a
light-mode visitor. Custom properties inherit, so `[data-skin="room"]` on the
wrapper beats `:root` for everything inside it regardless of specificity. The
room's header therefore drops the theme control — offering a light switch there
would promise something it will not do.

⚠ The two dark blocks in `globals.css` are duplicates by necessity (a media
query and a selector cannot be merged). **Keep them in sync.**

### Theme switching

Three states, with **system as the default**, stored in `localStorage`.
"system" is the *absence* of `data-theme`, which hands the decision back to
`prefers-color-scheme` — including when the OS flips at sunset.

The inline script in `layout.tsx` applies the saved choice **before first
paint**; that is what prevents a white flash on load. A cookie would let the
server read it, but reading cookies in the root layout opts the whole app out of
static prerendering, so the script is the right trade here.

`ThemeToggle` treats the theme as **external state, not React state** — the
truth lives in the `data-theme` attribute, and `useSyncExternalStore` reads it.
Mirroring it into `useState` would need an effect (a cascading render, which the
`react-hooks/set-state-in-effect` rule exists to catch) and give React a second
source of truth. Subscribing to `storage` also means changing the theme in one
tab updates every other open tab for free.

**Type:** Inter (`next/font/google`, latin + cyrillic) — not Manrope, which an
earlier draft of this file named. Manrope is a geometric sans with circular
bowls; beside Helvetica it reads as a different typeface, so Mac and Windows
would have looked like two brands. Inter is a neo-grotesque from the same
lineage: same closed apertures, same horizontal terminals, and a full Cyrillic
set the Mongolian copy needs.

Helvetica Neue leads the stack in `globals.css` and can only ever *lead* — it is
not web-licensed and is absent on Windows and Android. If the client licenses
it, drop the woff2 files in `public/fonts` and declare `@font-face`; Inter stays
as the metrical fallback and nothing else changes.

---

## Motion

Four kinds, and one rule: **no animation may ever be the reason content is
invisible.**

**Scroll reveals** (`Reveal` + `reveal-manager.ts`). The hidden state lives
behind a `.js` class the head script adds before first paint — no script, no
hidden rule, content renders plainly.

The manager deliberately does **not** use `IntersectionObserver`, which is the
obvious choice and the wrong one. IO only notifies when an intersection ratio
*crosses a threshold*; jump straight past an element — anchor link, End key,
`scrollTo`, a browser-restored scroll position — and it goes from ratio 0 (below
the viewport) to ratio 0 (above it) without crossing anything. No callback, and
that section sits at opacity 0 forever. So the test is positional instead:
"has this element's top come past the trigger line", which is true both for
elements scrolling in and for elements already scrolled beyond.

One passive listener and one rAF-throttled pass serve every Reveal on the page,
and the whole thing detaches once everything is revealed. A `setTimeout`
backstop covers documents that produce no frames at all (a tab loaded in the
background, where rAF can stay parked indefinitely) — content ends up visible,
just un-animated, which nobody can see anyway.

**Entrances.** Above-the-fold content uses `rise-in` keyframes with staggered
`animationDelay` rather than reveals — there is no intersection to wait for. The
room gets a slower `room-in` fade, matching the drop into a dark space.

⚠ **`room-in` is opacity-only and must stay that way.** It animates `<main>`,
which contains the bid panel, and the panel is `position: fixed` on phones. A
transformed (or filtered) ancestor becomes the containing block for fixed
descendants, so adding a `scale` here un-pins the panel from the viewport for the
whole animation and bottoms it out against `<main>` instead — hundreds of pixels
below the fold, so phone users watch the bid button fly up into place on every
load. This was shipped and fixed; the constraint is commented at both the
keyframes and the usage site. Anything that needs a transform must go on an
element that is not an ancestor of the panel.

**Shared-element morph.** A lot's plate carries the same
`<ViewTransition name={...}>` in the catalogue grid and on the lot page, so the
browser animates one object moving between routes instead of two swapping. Per
the React docs, `default="none"` stops it crossfading on unrelated transitions —
and the explicit `share="morph"` must stay, or the pair silently stops morphing.
Applied only between the light-shell pages; the room is a deliberate hard cut,
and the room renders two responsive plates, which would collide on name.

**Theme crossfade.** `document.startViewTransition` fades the whole page in one
composited step. A colour transition on every element would instead repaint the
entire tree on every hover, for the sake of one interaction.

⚠ `startViewTransition` runs its callback on a *later frame*, and a hidden
document may not produce one for seconds — which would strand the theme change,
since the attribute write lives in that callback. Hence the
`visibilityState === "visible"` guard. Measured at several seconds' delay on a
backgrounded tab before the guard went in.

Everything is disabled under `prefers-reduced-motion`, view transitions
included — those need stopping explicitly.

---

## Layout

```
src/
  app/
    layout.tsx              Inter, metadata, safe area, pre-paint script + CSP nonce
    globals.css             raw palette → semantic tokens, 4 theme states,
                            keyframes, reveal rules, view-transition CSS
    page.tsx                home: hero, live lot, round ladder, catalogue, results
    rules/page.tsx          the format in prose + table
    auction/[id]/page.tsx   one URL per lot, three states (see below)
    not-found.tsx
    actions/     'use server' — bid.ts, auth.ts, contact.ts
    api/room/[lotId]/stream/   SSE: RoomState out, nothing in
    forgot/      password reset, both steps on one URL
  components/
    site/        Header, Footer, RoundLadder, ThemeToggle,
                 Reveal + reveal-manager
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
