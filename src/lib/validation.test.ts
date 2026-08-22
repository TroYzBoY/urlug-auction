import { describe, expect, it } from "vitest";
import { firstError, loginSchema, registerSchema } from "./validation";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SIGN-UP AND SIGN-IN SCHEMAS
 *
 * These exist because of a bug that reached a running site: `AuthForm`'s
 * `Field` component never forwarded a `name` attribute, so the name, phone and
 * password-confirmation inputs were not submitted at all. The register action
 * read null and reported "expected string, received null"; the login action
 * read null and reported "wrong phone or password", which is why it went
 * unnoticed for so long — the generic message that protects the login form from
 * enumeration also hid a broken form.
 *
 * The missing attribute itself is now a compiler error (`name` is required on
 * `Field`). What is pinned here is the contract the action depends on: which
 * fields must be present, and what a missing one does.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const VALID = {
  name: "Батбаяр",
  phone: "99112233",
  password: "test-password-123",
  passwordConfirm: "test-password-123",
  dateOfBirth: "1995-06-15",
  terms: true,
};

describe("registerSchema", () => {
  it("accepts a complete registration", () => {
    const parsed = registerSchema.safeParse(VALID);
    expect(parsed.success).toBe(true);
  });

  /*
   * The exact failure the broken form produced. Worth a test of its own: a
   * field that is absent and a field that is empty are different inputs, and
   * only the first one tells you the form never sent it.
   */
  it.each(["name", "phone", "password", "passwordConfirm", "dateOfBirth"])(
    "rejects %s arriving as null, which is what an unsubmitted field looks like",
    (field) => {
      const parsed = registerSchema.safeParse({ ...VALID, [field]: null });
      expect(parsed.success).toBe(false);
    },
  );

  it("rejects a confirmation that does not match", () => {
    const parsed = registerSchema.safeParse({
      ...VALID,
      passwordConfirm: "test-password-124",
    });
    expect(parsed.success).toBe(false);
    expect(firstError(parsed.error!)).toMatch(/таарахгүй/);
  });

  /*
   * The length rule belongs to the password, not to the confirmation. Both
   * boxes holding the same too-short string should complain about the password
   * once rather than name the second box, which is not where the fault is.
   */
  it("blames the password, not the confirmation, when both are too short", () => {
    const parsed = registerSchema.safeParse({
      ...VALID,
      password: "short",
      passwordConfirm: "short",
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error!.issues[0]!.path).toEqual(["password"]);
  });

  it("normalises a spaced phone number rather than rejecting it", () => {
    const parsed = registerSchema.safeParse({ ...VALID, phone: "9911 2233" });
    expect(parsed.success && parsed.data.phone).toBe("99112233");
  });

  it("refuses an unticked terms box", () => {
    const parsed = registerSchema.safeParse({ ...VALID, terms: false });
    expect(parsed.success).toBe(false);
  });

  it("refuses someone under the minimum age", () => {
    const yesterday = new Date();
    yesterday.setFullYear(yesterday.getFullYear() - 18);
    yesterday.setDate(yesterday.getDate() + 1);
    const parsed = registerSchema.safeParse({
      ...VALID,
      dateOfBirth: yesterday.toISOString().slice(0, 10),
    });
    expect(parsed.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts a phone and password", () => {
    const parsed = loginSchema.safeParse({
      phone: "99112233",
      password: "test-password-123",
    });
    expect(parsed.success).toBe(true);
  });

  /* The failure that looked like a wrong password for as long as it existed. */
  it("rejects a phone arriving as null", () => {
    const parsed = loginSchema.safeParse({
      phone: null,
      password: "test-password-123",
    });
    expect(parsed.success).toBe(false);
  });
});
