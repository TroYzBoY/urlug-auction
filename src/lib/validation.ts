import { z } from "zod";
import { MINIMUM_AGE, isOldEnough } from "./legal";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * INPUT SCHEMAS
 *
 * Shared by the client (for the same messages the user would get anyway) and by
 * the server (where they are the actual gate). Server Functions are ordinary
 * HTTP endpoints — anything reachable from a browser is reachable from curl —
 * so every action parses its arguments through one of these before touching a
 * repository, whatever the form component already checked.
 *
 * Messages are Mongolian: they are user-facing copy and surface directly in the
 * forms.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const MINIMUM_AGE_MESSAGE = `Дуудлага худалдаанд оролцохын тулд ${MINIMUM_AGE} нас хүрсэн байх ёстой.`;

/*
 * Mongolian mobile numbers are 8 digits and begin 8 or 9. Stored normalised —
 * spaces stripped, no country code — so "9911 2233" and "99112233" cannot
 * become two accounts for one person, which is the multi-account rule failing
 * before anyone even tries to break it.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .pipe(
    z
      .string()
      .regex(/^[89]\d{7}$/, "Утасны дугаар 8 оронтой, 8 эсвэл 9-өөр эхэлнэ."),
  );

export const passwordSchema = z
  .string()
  .min(8, "Нууц үг дор хаяж 8 тэмдэгт байна.")
  // Bounded because argon2 hashes whatever it is handed: an unbounded field is
  // a way to make the server spend a second per request.
  .max(200, "Нууц үг хэт урт байна.");

export const nameSchema = z
  .string()
  .trim()
  .min(2, "Нэрээ бүрэн бичнэ үү.")
  .max(80, "Нэр хэт урт байна.");

/*
 * Date of birth, not a "I am over 18" checkbox.
 *
 * A checkbox records that someone clicked a checkbox. A date is a fact that can
 * be re-checked later — which matters when the question is asked by a regulator
 * rather than by us, and when the account has since had a birthday.
 */
export const dateOfBirthSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Төрсөн огноог сонгоно уу.")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Төрсөн огноо буруу байна.")
  .refine((v) => {
    const d = new Date(v);
    // A future date, or one implying an age past any human lifespan, is a
    // typo rather than a person.
    return d <= new Date() && d >= new Date("1900-01-01");
  }, "Төрсөн огноо буруу байна.")
  .refine((v) => isOldEnough(new Date(v)), MINIMUM_AGE_MESSAGE);

export const registerSchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
  password: passwordSchema,
  dateOfBirth: dateOfBirthSchema,
  terms: z.literal(true, {
    message: "Дүрэм, нөхцөлийг зөвшөөрөх шаардлагатай.",
  }),
});

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, "Нууц үгээ оруулна уу.").max(200),
});

export const otpSchema = z.object({
  phone: phoneSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Баталгаажуулах код 6 оронтой."),
});

export const resetSchema = z.object({
  phone: phoneSchema,
  code: z.string().trim().regex(/^\d{6}$/, "Баталгаажуулах код 6 оронтой."),
  password: passwordSchema,
});

/*
 * A bid. `points` is bounded above as well as below — Number.MAX_SAFE_INTEGER
 * in an INT column is a database error rather than a rejection, and a rejection
 * is what the bidder should see.
 */
export const bidSchema = z.object({
  lotId: z.string().min(1).max(32),
  points: z
    .number()
    .int("Үнэ бүхэл тоо байна.")
    .positive("Үнэ эерэг байна.")
    .max(2_000_000_000, "Үнэ хэт өндөр байна."),
  /*
   * Client-generated, and the reason a retried request after a dropped
   * connection cannot place a second bid. Format is not enforced beyond
   * length — it is opaque to the server, only its uniqueness matters.
   */
  idempotencyKey: z.string().min(8).max(64),
});

export const contactSchema = z.object({
  name: nameSchema,
  contact: z.string().trim().min(3, "Холбогдох мэдээллээ бичнэ үү.").max(120),
  topic: z.string().trim().min(1).max(80),
  message: z
    .string()
    .trim()
    .min(10, "Мессеж дор хаяж 10 тэмдэгт байна.")
    .max(4000, "Мессеж хэт урт байна."),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type BidInput = z.infer<typeof bidSchema>;
export type ContactInput = z.infer<typeof contactSchema>;

/** First message only — forms show one error per field, not a list. */
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Мэдээлэл буруу байна.";
}
