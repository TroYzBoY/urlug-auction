import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DEV_SKIP_OTP
 *
 * The flag switches off phone verification, which `placeBid` depends on: an
 * unverified bidder cannot be reached, and cannot be handed a lot. So the
 * question worth pinning is not whether it works in development — that is
 * visible the moment it is used — but whether it can possibly be on anywhere
 * else.
 *
 * IS_PRODUCTION is read at module load, so each case re-imports the module
 * under its own environment rather than sharing one.
 * ─────────────────────────────────────────────────────────────────────────────
 */

async function load(
  nodeEnv: string,
  flag: string | undefined,
  allowUnverified: string | undefined = undefined,
) {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("DATABASE_URL", "postgres://user:pw@localhost:5432/urlug");
  vi.stubEnv("SMS_API_URL", "https://sms.example.test/send");
  if (flag === undefined) vi.stubEnv("DEV_SKIP_OTP", "");
  else vi.stubEnv("DEV_SKIP_OTP", flag);
  vi.stubEnv("ALLOW_UNVERIFIED_SIGNUP", allowUnverified ?? "");

  return {
    env: await import("./env"),
    sms: await import("./sms"),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("otpBypassed", () => {
  it("is on in development when the flag is set", async () => {
    const { sms } = await load("development", "1");
    expect(sms.otpBypassed()).toBe(true);
  });

  it("is off in development when the flag is unset", async () => {
    const { sms } = await load("development", undefined);
    expect(sms.otpBypassed()).toBe(false);
  });

  /* Anything other than exactly "1" is off — no truthiness, no "true". */
  it.each(["0", "true", "yes", "TRUE", " 1"])(
    "is off in development for DEV_SKIP_OTP=%j",
    async (value) => {
      const { sms } = await load("development", value);
      expect(sms.otpBypassed()).toBe(false);
    },
  );

  it("is off in production even with the flag set", async () => {
    const { sms } = await load("production", "1");
    expect(sms.otpBypassed()).toBe(false);
  });
});

describe("assertRuntimeEnv", () => {
  it("refuses to boot a production server with the flag set", async () => {
    const { env } = await load("production", "1");
    expect(() => env.assertRuntimeEnv()).toThrow(/DEV_SKIP_OTP/);
  });

  /*
   * The one that matters most. otpBypassed() already returns false in
   * production, so the server would run correctly either way — and that is
   * exactly the problem this catches. A flag that is silently ignored is a flag
   * that stays in the environment file, travels to the next box, and is
   * believed to be doing something. Booting is refused so somebody reads it.
   */
  it("refuses even though the bypass would have been inert anyway", async () => {
    const { env, sms } = await load("production", "1");
    expect(sms.otpBypassed()).toBe(false);
    expect(() => env.assertRuntimeEnv()).toThrow();
  });

  it("boots a production server without the flag", async () => {
    const { env } = await load("production", undefined);
    expect(() => env.assertRuntimeEnv()).not.toThrow();
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ALLOW_UNVERIFIED_SIGNUP
 *
 * The deliberate one. Unlike DEV_SKIP_OTP it is meant to work in production —
 * as a stopgap while an SMS gateway is being connected — so what needs pinning
 * is that it is the ONLY thing that changes: the dev-only flag keeps its
 * production refusal, and turning this on does not quietly turn that on too.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("ALLOW_UNVERIFIED_SIGNUP", () => {
  it("bypasses OTP in production, which DEV_SKIP_OTP cannot", async () => {
    const { sms } = await load("production", undefined, "1");
    expect(sms.otpBypassed()).toBe(true);
  });

  it("boots — it is a decision, not a misconfiguration", async () => {
    const { env } = await load("production", undefined, "1");
    expect(() => env.assertRuntimeEnv()).not.toThrow();
  });

  /* Exactly "1", like every other flag here. */
  it.each(["0", "true", "yes", "TRUE", " 1"])(
    "is off for ALLOW_UNVERIFIED_SIGNUP=%j",
    async (value) => {
      const { sms } = await load("production", undefined, value);
      expect(sms.otpBypassed()).toBe(false);
    },
  );

  /*
   * The window it exists for: a site live before its gateway. Without this the
   * only way to boot was a placeholder SMS_API_URL — which reads as a gateway.
   */
  it("boots without SMS_API_URL, which nothing else can", async () => {
    const { env } = await load("production", undefined, "1");
    vi.stubEnv("SMS_API_URL", "");
    expect(() => env.assertRuntimeEnv()).not.toThrow();
  });

  it("leaves SMS_API_URL required when it is off", async () => {
    const { env } = await load("production", undefined);
    vi.stubEnv("SMS_API_URL", "");
    expect(() => env.assertRuntimeEnv()).toThrow(/SMS_API_URL/);
  });

  it("does not rescue DEV_SKIP_OTP from its production refusal", async () => {
    /*
     * The two must stay independent. If setting the deliberate flag also made
     * the accidental one acceptable, a staging env file reaching production
     * would stop being caught — which is the whole point of that check.
     */
    const { env } = await load("production", "1", "1");
    expect(() => env.assertRuntimeEnv()).toThrow(/DEV_SKIP_OTP/);
  });

  it("boots a development server with the flag", async () => {
    const { env } = await load("development", "1");
    expect(() => env.assertRuntimeEnv()).not.toThrow();
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CRON_SECRET, ON VERCEL
 *
 * There the ticker runs only when /api/cron/tick is called, and the route
 * refuses every call without the secret — so a deploy missing it takes bids
 * and never hands a lot to anybody. Nothing errors until a sale ends, which is
 * why it is a boot failure.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("CRON_SECRET", () => {
  async function production(vercel: string, secret: string) {
    vi.stubEnv("VERCEL", vercel);
    vi.stubEnv("CRON_SECRET", secret);
    return (await load("production", undefined)).env;
  }

  it("refuses to boot on Vercel without it", async () => {
    const env = await production("1", "");
    expect(() => env.assertRuntimeEnv()).toThrow(/CRON_SECRET/);
  });

  it("boots on Vercel with it", async () => {
    const env = await production("1", "s3cret");
    expect(() => env.assertRuntimeEnv()).not.toThrow();
  });

  /* A long-running server keeps its ticker in-process and never calls the route. */
  it("is not needed anywhere else", async () => {
    const env = await production("", "");
    expect(() => env.assertRuntimeEnv()).not.toThrow();
  });
});
