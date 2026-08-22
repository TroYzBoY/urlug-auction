/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ANALYTICS
 *
 * Off unless `NEXT_PUBLIC_ANALYTICS_SRC` is set, and shaped for a cookie-free,
 * self-hostable counter — Plausible or Umami. That choice is a legal one as
 * much as a technical one: no cookie and no cross-site identifier means no
 * consent banner and nothing to declare beyond what `/privacy` already says.
 *
 * ⚠ Adding a script that DOES set a cookie or profile visitors makes the
 * privacy page wrong. Update it in the same change, or do not add the script.
 *
 * The script is loaded from an external origin, so `connect-src`/`script-src`
 * in `src/proxy.ts` must name that host — the CSP is `'self'` only by default,
 * which will block it. Deliberate: the failure is visible rather than silent.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const ANALYTICS_SRC = process.env.NEXT_PUBLIC_ANALYTICS_SRC ?? null;
export const ANALYTICS_DOMAIN = process.env.NEXT_PUBLIC_ANALYTICS_DOMAIN ?? null;

export const analyticsEnabled = Boolean(ANALYTICS_SRC);
