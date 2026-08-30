/**
 * Runs once per server process, before the first request — and never during a
 * build, which is what makes it the right place for the environment assertion.
 *
 * The runtime check is not optional. The ticker holds a long-lived pg
 * connection for its advisory lock and registers signal handlers; neither
 * exists in the Edge runtime, where `pg` cannot even be imported. Everything
 * Node-specific is behind a dynamic import so Turbopack does not have to
 * analyse it for the Edge bundle at all.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { assertRuntimeEnv } = await import("./lib/env");
  assertRuntimeEnv();

  /*
   * Said out loud, once per process. A control that is off should be visible in
   * the place its operator already looks — the alternative is a flag left in an
   * env file months ago and remembered by nobody.
   */
  const { otpBypassed } = await import("./lib/sms");
  if (otpBypassed()) {
    const which =
      process.env.ALLOW_UNVERIFIED_SIGNUP === "1"
        ? "ALLOW_UNVERIFIED_SIGNUP=1"
        : "DEV_SKIP_OTP=1";
    console.warn(`
  ${which} - phone verification is OFF. Registering signs you straight in
  and no code is sent. Anyone who can reach this server can open an account
  on a number they do not own.
`);
  }

  const { startTicker, bindShutdown } = await import("./lib/ticker");

  bindShutdown();
  await startTicker();
}
