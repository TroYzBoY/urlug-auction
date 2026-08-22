-- ─────────────────────────────────────────────────────────────────────────────
-- URLUG — schema
--
-- Postgres. Apply with `npm run db:migrate` (idempotent — safe to re-run).
--
-- Three rules this schema exists to enforce, because the front-end cannot:
--
--   1. `bids` is APPEND-ONLY. No UPDATE, no DELETE, ever. When a bidder
--      disputes a result this table is the evidence, and evidence that can be
--      edited is not evidence.
--   2. Balance is a SUM over `ledger_entries`, not a number someone can set.
--      `balances` is a cache written in the same transaction, with a periodic
--      reconciliation query in db/reconcile.sql to prove the two agree.
--   3. Money is INTEGER POINTS. 1 point = 1000₮ (POINT_MNT in
--      src/lib/auction.ts). No floats anywhere near a price.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Users ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE user_role   AS ENUM ('bidder', 'staff', 'admin');
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('active', 'suspended', 'closed');
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  phone             TEXT        NOT NULL UNIQUE,
  name              TEXT        NOT NULL,
  password_hash     TEXT        NOT NULL,
  -- Anonymised label shown in the bid feed, e.g. "Т-207". Assigned once and
  -- never reused: a paddle that changes hands makes the feed a lie.
  paddle            TEXT        NOT NULL UNIQUE,
  phone_verified_at TIMESTAMPTZ,
  role              user_role   NOT NULL DEFAULT 'bidder',
  status            user_status NOT NULL DEFAULT 'active',
  -- Which version of the rules they accepted, and when.
  terms_version     TEXT,
  terms_accepted_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_phone_idx ON users (phone);

-- ── Sessions ─────────────────────────────────────────────────────────────────
-- Only the SHA-256 of the session token is stored. A database dump therefore
-- does not hand the reader a set of working sessions.

CREATE TABLE IF NOT EXISTS sessions (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash   TEXT        NOT NULL UNIQUE,
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  ip           TEXT,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_user_idx    ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

-- ── One-time codes (phone verification, password reset) ──────────────────────
-- Hashed like passwords. `attempts` is what stops a six-digit code from being
-- guessed: five tries and the code is dead, regardless of rate limits.

CREATE TABLE IF NOT EXISTS otp_codes (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  phone       TEXT        NOT NULL,
  purpose     TEXT        NOT NULL CHECK (purpose IN ('verify', 'reset')),
  code_hash   TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  attempts    INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS otp_lookup_idx ON otp_codes (phone, purpose, created_at DESC);

-- ── Catalogue ────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE lot_status AS ENUM ('upcoming', 'live', 'sold', 'unsold');
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS lots (
  -- Catalogue code is the natural key and is what appears in the URL.
  id                 TEXT        PRIMARY KEY,
  code               TEXT        NOT NULL,
  title              TEXT        NOT NULL,
  maker              TEXT        NOT NULL,
  year               TEXT        NOT NULL,
  category           TEXT        NOT NULL,
  note               TEXT        NOT NULL,
  provenance         TEXT        NOT NULL,
  condition          TEXT        NOT NULL,
  dimensions         TEXT        NOT NULL,
  estimate_low_pts   INT         NOT NULL CHECK (estimate_low_pts  >= 0),
  estimate_high_pts  INT         NOT NULL CHECK (estimate_high_pts >= estimate_low_pts),
  opening_pts        INT         NOT NULL CHECK (opening_pts       >= 0),
  image              TEXT,
  starts_at          TIMESTAMPTZ NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lots_starts_idx ON lots (starts_at);

-- ── Live auction state ───────────────────────────────────────────────────────
--
-- One row per lot. This row is the SERIALIZATION POINT: every bid takes
-- `SELECT ... FOR UPDATE` on it, so two bids arriving in the same millisecond
-- are ordered by the database rather than by luck.
--
-- The three clocks are stored as absolute timestamps, never as durations, so a
-- reader never has to know when the row was written to interpret it.

DO $$ BEGIN
  CREATE TYPE auction_outcome AS ENUM ('scheduled', 'running', 'sold', 'unsold');
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS auctions (
  lot_id            TEXT            PRIMARY KEY REFERENCES lots (id) ON DELETE CASCADE,
  opens_at          TIMESTAMPTZ     NOT NULL,
  round             INT             NOT NULL DEFAULT 1 CHECK (round BETWEEN 1 AND 6),
  current_pts       INT             NOT NULL CHECK (current_pts >= 0),
  leader_user_id    BIGINT          REFERENCES users (id) ON DELETE SET NULL,
  leader_paddle     TEXT,
  bid_clock_ends_at TIMESTAMPTZ     NOT NULL,
  round_ends_at     TIMESTAMPTZ     NOT NULL,
  outcome           auction_outcome NOT NULL DEFAULT 'scheduled',
  hammer_round      INT,
  settled_at        TIMESTAMPTZ,
  bid_count         INT             NOT NULL DEFAULT 0,
  -- Bumped on every write. Lets a reader detect a stale snapshot without
  -- comparing timestamps that may be equal at millisecond resolution.
  version           BIGINT          NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- The ticker scans for auctions whose clocks are due. Both predicates are
-- cheap because settled rows drop out of the index.
CREATE INDEX IF NOT EXISTS auctions_due_idx
  ON auctions (bid_clock_ends_at, round_ends_at)
  WHERE outcome IN ('scheduled', 'running');

-- ── Bids — APPEND ONLY ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bids (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lot_id          TEXT        NOT NULL REFERENCES lots (id) ON DELETE RESTRICT,
  user_id         BIGINT      NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  paddle          TEXT        NOT NULL,
  points          INT         NOT NULL CHECK (points > 0),
  round           INT         NOT NULL CHECK (round BETWEEN 1 AND 6),
  placed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Client-generated. A retried request after a dropped connection resolves to
  -- the bid that already landed instead of placing a second one.
  idempotency_key TEXT        NOT NULL,
  ip              TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS bids_idempotency_idx ON bids (lot_id, idempotency_key);
-- Two bids can never share a price on one lot: the price strictly increases.
CREATE UNIQUE INDEX IF NOT EXISTS bids_price_idx      ON bids (lot_id, points);
CREATE INDEX        IF NOT EXISTS bids_feed_idx       ON bids (lot_id, id DESC);
CREATE INDEX        IF NOT EXISTS bids_user_idx       ON bids (user_id, placed_at DESC);

-- Enforce append-only in the database, not merely by convention in the code.
CREATE OR REPLACE FUNCTION bids_are_immutable() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'bids is append-only (attempted %)', TG_OP;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bids_no_update ON bids;
CREATE TRIGGER bids_no_update BEFORE UPDATE OR DELETE ON bids
  FOR EACH ROW EXECUTE FUNCTION bids_are_immutable();

-- ── Participation ────────────────────────────────────────────────────────────
--
-- `hasBid` in RoomState comes from here. It is what separates a normal raise
-- from a late entry (round × LATE_ENTRY_MULTIPLIER), so it must be a server
-- fact — a client that could claim `hasBid: true` would bypass the late-entry
-- floor entirely.

CREATE TABLE IF NOT EXISTS lot_participants (
  lot_id           TEXT        NOT NULL REFERENCES lots (id)  ON DELETE CASCADE,
  user_id          BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  entered_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  entered_in_round INT         NOT NULL,
  -- Charged once per lot, at entry, whether or not they go on to bid.
  join_fee_pts     INT         NOT NULL DEFAULT 0,
  first_bid_at     TIMESTAMPTZ,
  PRIMARY KEY (lot_id, user_id)
);

-- ── Money ────────────────────────────────────────────────────────────────────
--
-- Double-entry-ish: every movement is a row. `balances` is a cache of the sum,
-- written in the same transaction, and CHECK (pts >= 0) is the last line of
-- defence against a negative balance surviving a logic bug.

CREATE TABLE IF NOT EXISTS ledger_entries (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    BIGINT      NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  delta_pts  INT         NOT NULL CHECK (delta_pts <> 0),
  kind       TEXT        NOT NULL CHECK (kind IN (
                'topup', 'join_fee', 'hammer_settlement', 'refund', 'adjustment', 'bonus'
             )),
  ref_type   TEXT,
  ref_id     TEXT,
  memo       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ledger_user_idx ON ledger_entries (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ledger_once_idx
  ON ledger_entries (user_id, kind, ref_type, ref_id)
  WHERE ref_type IS NOT NULL AND ref_id IS NOT NULL;

CREATE OR REPLACE FUNCTION ledger_is_immutable() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only (attempted %)', TG_OP;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_no_update ON ledger_entries;
CREATE TRIGGER ledger_no_update BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_is_immutable();

CREATE TABLE IF NOT EXISTS balances (
  user_id    BIGINT      PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  pts        INT         NOT NULL DEFAULT 0 CHECK (pts >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Audit ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id BIGINT      REFERENCES users (id) ON DELETE SET NULL,
  action        TEXT        NOT NULL,
  target_type   TEXT,
  target_id     TEXT,
  detail        JSONB,
  ip            TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_actor_idx  ON audit_log (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_action_idx ON audit_log (action, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_target_idx ON audit_log (target_type, target_id, created_at DESC);

-- ── Rate limiting ────────────────────────────────────────────────────────────
--
-- In the database rather than in process memory on purpose: an in-memory
-- limiter resets on every deploy and is per-instance, so N instances multiply
-- every limit by N. Fixed windows, which over-admit at a boundary by at most
-- one window's allowance — acceptable, and far cheaper than a sliding log.

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket       TEXT        NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count        INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

CREATE INDEX IF NOT EXISTS rate_limits_sweep_idx ON rate_limits (window_start);

-- ── Contact messages ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contact_messages (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT        NOT NULL,
  contact    TEXT        NOT NULL,
  topic      TEXT        NOT NULL,
  message    TEXT        NOT NULL,
  ip         TEXT,
  handled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_created_idx ON contact_messages (created_at DESC);

-- ── Top-ups ──────────────────────────────────────────────────────────────────
--
-- A row per attempt to buy points, created before the payment provider is
-- contacted and resolved when it answers. It exists so that "the money left my
-- account but the points never arrived" has a record to investigate rather than
-- being one side's word against the other.
--
-- The provider's own reference is unique, which is what makes crediting
-- idempotent: a webhook delivered three times settles the same row once.

DO $$ BEGIN
  CREATE TYPE topup_status AS ENUM ('pending', 'paid', 'failed', 'expired');
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS topups (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       BIGINT       NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  -- What the bidder gets, and what they pay. Both fixed at creation: a package
  -- whose price changes mid-payment is a dispute.
  points        INT          NOT NULL CHECK (points > 0),
  amount_mnt    INT          NOT NULL CHECK (amount_mnt > 0),
  status        topup_status NOT NULL DEFAULT 'pending',
  provider      TEXT         NOT NULL DEFAULT 'qpay',
  -- The provider's invoice id. NULL until it answers.
  provider_ref  TEXT,
  -- Ours, sent to the provider so its callback can find this row.
  reference     TEXT         NOT NULL UNIQUE,
  paid_at       TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ  NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX        IF NOT EXISTS topups_user_idx     ON topups (user_id, created_at DESC);
CREATE INDEX        IF NOT EXISTS topups_pending_idx  ON topups (expires_at) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS topups_provider_idx ON topups (provider, provider_ref)
  WHERE provider_ref IS NOT NULL;

-- ── Consent ──────────────────────────────────────────────────────────────────
--
-- `users.terms_version` records the latest acceptance; this records every one.
-- The question a regulator asks is not "which rules does this bidder accept
-- now" but "which text were they shown on the day they placed that bid", and
-- only a history answers it.

CREATE TABLE IF NOT EXISTS consents (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  document    TEXT        NOT NULL CHECK (document IN ('terms', 'privacy', 'rules', 'age')),
  version     TEXT        NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip          TEXT
);

CREATE INDEX IF NOT EXISTS consents_user_idx ON consents (user_id, accepted_at DESC);

-- Date of birth, for the 18+ requirement. Nullable because the column arrives
-- after the first accounts did; new registrations require it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- ── Watchlist ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS watchlist (
  user_id    BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  lot_id     TEXT        NOT NULL REFERENCES lots (id)  ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lot_id)
);

CREATE INDEX IF NOT EXISTS watchlist_lot_idx ON watchlist (lot_id);

-- ── Notifications ────────────────────────────────────────────────────────────
--
-- An outbox, not a send-and-hope. Rows are written inside the transaction that
-- caused them and delivered by a worker afterwards, so a notification can never
-- describe a bid that rolled back, and an SMS gateway being down delays
-- delivery instead of losing it.
--
-- `dedupe_key` is what stops a bidder who is outbid eleven times in the last
-- ten seconds of round 6 receiving eleven messages.

DO $$ BEGIN
  CREATE TYPE notification_channel AS ENUM ('sms', 'inapp');
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed', 'skipped');
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS notifications (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     BIGINT               NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  channel     notification_channel NOT NULL,
  kind        TEXT                 NOT NULL,
  body        TEXT                 NOT NULL,
  href        TEXT,
  status      notification_status  NOT NULL DEFAULT 'pending',
  attempts    INT                  NOT NULL DEFAULT 0,
  -- Unique per (user, key). Two events that should collapse into one message
  -- share a key; anything genuinely distinct carries a timestamp in its key.
  dedupe_key  TEXT                 NOT NULL,
  read_at     TIMESTAMPTZ,
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ          NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_idx
  ON notifications (user_id, dedupe_key);
CREATE INDEX IF NOT EXISTS notifications_outbox_idx
  ON notifications (created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS notifications_inbox_idx
  ON notifications (user_id, id DESC);

-- ── Winner settlement ────────────────────────────────────────────────────────
--
-- What a winner owes, tracked separately from the auction row. The auction says
-- who won and at what price; this says whether they have paid, which is a
-- different question with a different lifecycle.

DO $$ BEGIN
  CREATE TYPE settlement_status AS ENUM ('due', 'paid', 'waived', 'forfeited');
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS settlements (
  lot_id     TEXT              PRIMARY KEY REFERENCES lots (id) ON DELETE CASCADE,
  user_id    BIGINT            NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  hammer_pts INT               NOT NULL CHECK (hammer_pts >= 0),
  status     settlement_status NOT NULL DEFAULT 'due',
  -- Terms give the winner seven working days to make contact.
  due_by     TIMESTAMPTZ       NOT NULL,
  paid_at    TIMESTAMPTZ,
  note       TEXT,
  created_at TIMESTAMPTZ       NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ       NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS settlements_user_idx ON settlements (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS settlements_due_idx  ON settlements (due_by) WHERE status = 'due';

-- ── Lot photographs ──────────────────────────────────────────────────────────
--
-- A catalogue entry needs several views of the same object — front, back, the
-- port side, the scuff on the corner — and a bidder committing real money is
-- entitled to all of them. `lots.image` held exactly one, which was enough for
-- an antique shot on a plinth and is not enough for a phone somebody is bidding
-- on sight unseen.
--
-- A table rather than a TEXT[] column, for two reasons that only show up later:
--
--   • `alt` belongs to the image, not to the lot. "Урд тал", "Ар тал",
--     "Хажуу тал" is what a screen reader needs, and one alt for a whole
--     gallery describes nothing.
--   • Reordering is an UPDATE of one row rather than a rewrite of an array,
--     which matters when an operator is dragging thumbnails around.
--
-- `sort_order` decides the gallery order, and position 0 is the cover — the one
-- a card in the catalogue grid shows.

CREATE TABLE IF NOT EXISTS lot_images (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lot_id     TEXT        NOT NULL REFERENCES lots (id) ON DELETE CASCADE,
  url        TEXT        NOT NULL,
  -- What the photograph shows, for a screen reader and for a broken image.
  alt        TEXT        NOT NULL DEFAULT '',
  sort_order INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per position per lot: an operator cannot end up with two covers.
CREATE UNIQUE INDEX IF NOT EXISTS lot_images_order_idx
  ON lot_images (lot_id, sort_order);
CREATE INDEX IF NOT EXISTS lot_images_lot_idx ON lot_images (lot_id, sort_order);

-- Contact email. NOT a login credential — accounts are identified and
-- authenticated by phone number, and nothing in the auth path reads this. It
-- exists so staff accounts can be reached by mail and so an operator can
-- recognise an account they created.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
CREATE INDEX IF NOT EXISTS users_email_idx ON users (email) WHERE email IS NOT NULL;
