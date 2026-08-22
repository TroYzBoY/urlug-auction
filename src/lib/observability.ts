import "server-only";
import { IS_PRODUCTION } from "./env";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LOGGING AND ERROR REPORTING
 *
 * ── Why structured ───────────────────────────────────────────────────────────
 *
 * `console.error("bid failed", lotId, err)` is unsearchable once it is one line
 * among millions. The question after an incident is "show me every bid on lot
 * 014 between 14:02 and 14:03 that took over a second", and that is a query
 * against fields, not a grep for a phrase.
 *
 * JSON in production, human-readable in development — a developer reading a
 * terminal and a log aggregator want opposite things, and choosing one means
 * one of them is badly served.
 *
 * ── Why no vendor ────────────────────────────────────────────────────────────
 *
 * `reportError` is a seam, not a Sentry integration. Wiring a specific vendor
 * needs an account and a DSN this repository does not have, and a half-written
 * integration is worse than an obvious hole. Everything that should be reported
 * already calls through here, so adding Sentry later is one function body.
 * ─────────────────────────────────────────────────────────────────────────────
 */

type Level = "debug" | "info" | "warn" | "error";

export interface LogFields {
  /** What happened, as a stable dotted name: "bid.rejected", "topup.paid". */
  event: string;
  [key: string]: unknown;
}

/*
 * Field names that must never reach a log, whatever a caller passes. Logs are
 * read far more widely than the database is, are shipped to third parties, and
 * outlive the incident that produced them.
 */
const REDACTED = new Set([
  "password",
  "passwordHash",
  "password_hash",
  "token",
  "tokenHash",
  "code",
  "codeHash",
  "code_hash",
  "secret",
  "authorization",
  "cookie",
]);

function redact(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = REDACTED.has(key) ? "[redacted]" : value;
  }
  return out;
}

function emit(level: Level, fields: LogFields): void {
  const safe = redact(fields);

  if (!IS_PRODUCTION) {
    const { event, ...rest } = safe;
    const detail = Object.keys(rest).length > 0 ? rest : "";
    console[level === "debug" ? "log" : level](`[${event}]`, detail);
    return;
  }

  console[level === "debug" ? "log" : level](
    JSON.stringify({ level, time: new Date().toISOString(), ...safe }),
  );
}

export const log = {
  debug: (fields: LogFields) => emit("debug", fields),
  info: (fields: LogFields) => emit("info", fields),
  warn: (fields: LogFields) => emit("warn", fields),
  error: (fields: LogFields) => emit("error", fields),
};

/**
 * An error worth a human's attention.
 *
 * ⚠ Never throws. It is called from catch blocks that are already handling a
 * failure, and a reporter that throws replaces the real error with its own — at
 * the exact moment the real one mattered most.
 *
 * To wire Sentry: `npm i @sentry/node`, init it in `instrumentation.ts`, and
 * add `Sentry.captureException(error, { extra: context })` below.
 */
export function reportError(error: unknown, context: LogFields): void {
  try {
    log.error({
      ...context,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  } catch {
    // Deliberately empty. See above.
  }
}

/**
 * Times an operation and logs how long it took.
 *
 * Used on the bid path, where latency is not a performance nicety: a bid that
 * takes 900ms in round 6 has spent a fifth of the clock, and the bidder
 * experiences that as the site being broken.
 */
export async function timed<T>(
  event: string,
  fields: Omit<LogFields, "event">,
  fn: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  try {
    const result = await fn();
    log.info({ event, ...fields, ms: Math.round(performance.now() - started) });
    return result;
  } catch (err) {
    reportError(err, {
      event: `${event}.failed`,
      ...fields,
      ms: Math.round(performance.now() - started),
    });
    throw err;
  }
}
