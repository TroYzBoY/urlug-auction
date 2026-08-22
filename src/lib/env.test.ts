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

async function load(nodeEnv: string, flag: string | undefined) {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("DATABASE_URL", "postgres://user:pw@localhost:5432/urlug");
  vi.stubEnv("SMS_API_URL", "https://sms.example.test/send");
  if (flag === undefined) vi.stubEnv("DEV_SKIP_OTP", "");
  else vi.stubEnv("DEV_SKIP_OTP", flag);

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

  it("boots a development server with the flag", async () => {
    const { env } = await load("development", "1");
    expect(() => env.assertRuntimeEnv()).not.toThrow();
  });
});
