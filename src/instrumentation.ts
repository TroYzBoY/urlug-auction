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

  const { startTicker, bindShutdown } = await import("./lib/ticker");

  bindShutdown();
  await startTicker();
}
