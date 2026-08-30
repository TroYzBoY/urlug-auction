import "server-only";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ENVIRONMENT
 *
 * ── Why these are getters ────────────────────────────────────────────────────
 *
 * The obvious version reads and validates everything at module load, so a
 * missing DATABASE_URL is a loud failure rather than `undefined` appearing in a
 * connection string forty minutes later. That is the right instinct and the
 * wrong place: `next build` imports every server module to collect page data,
 * with NODE_ENV=production, so a module-level throw makes the app unbuildable
 * on any machine that does not hold production credentials. CI would need the
 * database password to typecheck a CSS change.
 *
 * So validation is split. Reading a value validates it — lazily, at the point
 * of use — and `assertRuntimeEnv()` forces the whole set at server boot, from
 * instrumentation.ts, which runs when a server starts and never during a build.
 * A misconfigured deploy still fails immediately and by name; a build no longer
 * needs secrets.
 *
 * `server-only` at the top makes importing this from a Client Component a build
 * error rather than a secret in a JS bundle.
 * ─────────────────────────────────────────────────────────────────────────────
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example.`,
    );
  }
  return value;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    throw new Error(
      `Environment variable ${name} must be an integer, got "${raw}".`,
    );
  }
  return n;
}

export const IS_PRODUCTION = process.env.NODE_ENV === "production";

export const env = {
  get databaseUrl(): string {
    return required("DATABASE_URL");
  },

  /** Rows in the pg pool. The listener and the ticker hold one each outside it. */
  get dbPoolMax(): number {
    return optionalInt("DATABASE_POOL_MAX", 10);
  },

  /** Session lifetime. Long enough to survive a 2h45m sale plus a night. */
  get sessionTtlDays(): number {
    return optionalInt("SESSION_TTL_DAYS", 30);
  },

  /**
   * SMS provider. Absent in development, where OTP codes go to the server log
   * instead — see src/lib/sms.ts. Absent in production is a boot failure, via
   * assertRuntimeEnv: a sign-up flow that silently drops its verification codes
   * locks every new bidder out, and looks fine from the outside.
   */
  get smsApiUrl(): string | null {
    return process.env.SMS_API_URL ?? null;
  },
  get smsApiKey(): string | null {
    return process.env.SMS_API_KEY ?? null;
  },
  get smsSender(): string {
    return process.env.SMS_SENDER ?? "URLUG";
  },

  /**
   * Skips phone verification entirely — see `otpBypassed()` in src/lib/sms.ts.
   * A development convenience for a machine with no SMS provider, where the
   * only place a code appears is the server log.
   *
   * Setting this in a production environment is refused at boot below, rather
   * than quietly ignored. Verification is not a formality: `placeBid` rejects
   * an unverified account, because a bidder who cannot be reached cannot be
   * handed a lot.
   */
  get devSkipOtp(): boolean {
    return process.env.DEV_SKIP_OTP === "1";
  },

  /**
   * ⚠ TEMPORARY: accept registrations without phone verification, IN
   * PRODUCTION.
   *
   * Deliberately NOT `DEV_SKIP_OTP`. That flag is development-only and the boot
   * assertion below refuses a production server carrying it — a guard worth
   * keeping exactly as it is, because its failure mode is a staging env file
   * travelling to production unnoticed. This is the opposite: a decision
   * somebody made on purpose, for a stated reason, with a name that says so and
   * a boot banner nobody can miss.
   *
   * What it costs while it is on: the site's public URL will accept unlimited
   * registrations on unverified numbers. `placeBid` still requires a verified
   * account, and verification is what makes a winner reachable — so this must
   * come off before the house takes real money.
   *
   * It never applies to a password reset. Handing out a session to somebody who
   * knows a phone number is one thing; letting them take over an existing
   * account by resetting its password is a different hole, and turning this on
   * must not open it.
   *
   *   fly secrets unset ALLOW_UNVERIFIED_SIGNUP --app urlug
   */
  get allowUnverifiedSignup(): boolean {
    return process.env.ALLOW_UNVERIFIED_SIGNUP === "1";
  },

  /** Version string recorded against each user's terms acceptance. */
  get termsVersion(): string {
    return process.env.TERMS_VERSION ?? "2026-08-21";
  },
} as const;

/**
 * Forces every variable at server boot. Called from `register()` in
 * src/instrumentation.ts — which runs per server process and never during a
 * build, which is the whole point of it being a function rather than top-level
 * code.
 */
export function assertRuntimeEnv(): void {
  const problems: string[] = [];

  for (const check of [
    () => env.databaseUrl,
    () => env.dbPoolMax,
    () => env.sessionTtlDays,
  ]) {
    try {
      check();
    } catch (err) {
      problems.push((err as Error).message);
    }
  }

  if (IS_PRODUCTION && !env.smsApiUrl) {
    problems.push(
      "SMS_API_URL is required in production — without it phone verification " +
        "codes are never delivered and nobody can complete registration.",
    );
  }

  /*
   * Refused rather than ignored. Ignoring it would mean a production server
   * that boots and runs while its operator believes verification is off — and
   * the more dangerous inverse, a staging box promoted to production with the
   * flag still in its environment file, silently accepting unverified accounts.
   */
  if (IS_PRODUCTION && env.devSkipOtp) {
    problems.push(
      "DEV_SKIP_OTP is set in a production environment. It disables phone " +
        "verification and must never be set outside development — remove it.",
    );
  }

  /*
   * Not a refusal — this one is meant to be usable in production, for a while,
   * on purpose. But it is the single largest hole an operator can open in this
   * system, so it is impossible to have running and not know about.
   */
  if (IS_PRODUCTION && env.allowUnverifiedSignup) {
    console.warn(
      [
        "",
        "  \u26a0  ALLOW_UNVERIFIED_SIGNUP=1 - PHONE VERIFICATION IS OFF.",
        "     Anyone can register on this public URL without receiving a code.",
        "     Intended as a stopgap while an SMS gateway is being connected.",
        "     Remove it as soon as one is:",
        "       fly secrets unset ALLOW_UNVERIFIED_SIGNUP",
        "",
      ].join("\n"),
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `Environment is not usable:\n  - ${problems.join("\n  - ")}\n\nSee .env.example.`,
    );
  }
}
