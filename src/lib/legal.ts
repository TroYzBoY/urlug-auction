/**
 * Document versions.
 *
 * Every consent row records which version the bidder accepted, so the question
 * "which text were they shown on the day they placed that bid" has an answer.
 * Bump the relevant constant whenever the corresponding page changes
 * materially — a version that never moves makes the consent record worthless.
 *
 * Plain constants rather than environment variables: the version belongs to the
 * text, and the text is in the repository. A deploy that changes one without
 * the other would be lying.
 */
export const TERMS_VERSION = "2026-08-21";
export const PRIVACY_VERSION = "2026-08-21";
export const RULES_VERSION = "2026-08-21";

/** How long personal data is kept after an account closes. */
export const RETENTION_YEARS = 5;

/** Documents a bidder accepts at registration, recorded individually. */
export const REGISTRATION_CONSENTS = [
  { document: "terms" as const, version: TERMS_VERSION },
  { document: "privacy" as const, version: PRIVACY_VERSION },
  { document: "rules" as const, version: RULES_VERSION },
] as const;

/** Minimum age to hold an account. */
export const MINIMUM_AGE = 18;

/**
 * Whole years elapsed, by calendar date rather than by dividing milliseconds.
 *
 * `(now - dob) / 365.25 days` is wrong for anyone whose birthday is today, and
 * a bidder turned away on their eighteenth birthday is a complaint. Comparing
 * month and day directly has no such edge.
 */
export function ageOn(dateOfBirth: Date, on: Date = new Date()): number {
  let age = on.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = on.getMonth() - dateOfBirth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && on.getDate() < dateOfBirth.getDate())) {
    age -= 1;
  }
  return age;
}

export function isOldEnough(dateOfBirth: Date, on: Date = new Date()): boolean {
  return ageOn(dateOfBirth, on) >= MINIMUM_AGE;
}
