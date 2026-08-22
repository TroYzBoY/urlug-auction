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

export const registerSchema = z
  .object({
    name: nameSchema,
    phone: phoneSchema,
    password: passwordSchema,
    /*
     * Checked on the server, not only in the browser. The confirmation exists
     * to catch a typo in a field nobody can read back, and a typo that reaches
     * the database is an account whose owner cannot sign in to it — recoverable
     * only through the SMS reset, which costs a message and a support request.
     *
     * Not `passwordSchema`: the length rule belongs to the password itself, and
     * applying it twice reports "at least 8 characters" against the second box
     * when the real fault is in the first.
     */
    passwordConfirm: z.string(),
    dateOfBirth: dateOfBirthSchema,
    terms: z.literal(true, {
      message: "Дүрэм, нөхцөлийг зөвшөөрөх шаардлагатай.",
    }),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    message: "Нууц үг хоёулаа таарахгүй байна.",
    path: ["passwordConfirm"],
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

/* ── Admin ──────────────────────────────────────────────────────────────────
 *
 * These carry money and take lots away from people, so the bounds are real
 * bounds rather than sanity checks. `estimateHighPts >= estimateLowPts` and
 * `openingPts` fitting inside an INT are both database constraints too — this
 * layer exists so a mistyped figure comes back as a message rather than a 500.
 */

const LOT_CATEGORIES = [
  "antique",
  "painting",
  "timepiece",
  "jewellery",
  "arms",
  "manuscript",
] as const;

const ptsField = (label: string) =>
  z
    .number({ message: `${label} тоо байна.` })
    .int(`${label} бүхэл тоо байна.`)
    .min(0, `${label} сөрөг байж болохгүй.`)
    // INT in Postgres. A larger number is a database error rather than a
    // rejection, and a rejection is what the operator should see.
    .max(2_000_000_000, `${label} хэт өндөр байна.`);

export const lotSchema = z
  .object({
    /* Appears in the URL, so it is restricted to what is safe there. */
    id: z
      .string()
      .trim()
      .min(1, "Лотын дугаар шаардлагатай.")
      .max(32)
      .regex(/^[A-Za-z0-9_-]+$/, "Лотын дугаар зөвхөн үсэг, тоо, зураас байна."),
    code: z.string().trim().min(1, "Кодыг бичнэ үү.").max(40),
    title: z.string().trim().min(1, "Нэрийг бичнэ үү.").max(160),
    maker: z.string().trim().max(120).default(""),
    year: z.string().trim().max(40).default(""),
    category: z.enum(LOT_CATEGORIES, { message: "Ангиллыг сонгоно уу." }),
    note: z.string().trim().max(4000).default(""),
    provenance: z.string().trim().max(500).default(""),
    condition: z.string().trim().max(500).default(""),
    dimensions: z.string().trim().max(200).default(""),
    estimateLowPts: ptsField("Доод үнэлгээ"),
    estimateHighPts: ptsField("Дээд үнэлгээ"),
    openingPts: ptsField("Нээлтийн үнэ"),
    /*
     * The gallery, as newline-separated `url | alt` lines — the shape a
     * textarea produces. Parsed here so the repository receives a real list and
     * the admin form stays one field rather than five paired inputs that have
     * to be added and removed.
     *
     * An empty `alt` is allowed and normalised to "": a lot photographed
     * before its captions are written should still save.
     */
    images: z
      .string()
      .max(4000)
      .default("")
      .transform((raw) =>
        raw
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [url, ...rest] = line.split("|");
            return { url: url!.trim(), alt: rest.join("|").trim() };
          })
          .filter((image) => image.url.length > 0),
      )
      .pipe(
        z
          .array(z.object({ url: z.string().max(500), alt: z.string().max(200) }))
          .max(12, "Нэг лотод 12-оос олон зураг оруулах боломжгүй."),
      ),
    opensAt: z
      .string()
      .trim()
      .refine((v) => !Number.isNaN(Date.parse(v)), "Эхлэх хугацаа буруу байна."),
  })
  .refine((v) => v.estimateHighPts >= v.estimateLowPts, {
    message: "Дээд үнэлгээ доод үнэлгээнээс бага байж болохгүй.",
    path: ["estimateHighPts"],
  });

/*
 * A reason is REQUIRED on every destructive control. The audit row without one
 * answers "what happened" but not "why", and the second question is the one
 * asked when a bidder disputes a lot that an operator stopped.
 */
export const lotControlSchema = z.object({
  lotId: z.string().trim().min(1).max(32),
  reason: z
    .string()
    .trim()
    .min(4, "Шалтгааныг бичнэ үү — аудитын бүртгэлд үлдэнэ.")
    .max(500),
});

export const rescheduleSchema = z.object({
  lotId: z.string().trim().min(1).max(32),
  opensAt: z
    .string()
    .trim()
    .refine((v) => !Number.isNaN(Date.parse(v)), "Хугацаа буруу байна."),
});

export const userStatusSchema = z.object({
  userId: z.number().int().positive(),
  status: z.enum(["active", "suspended", "closed"]),
  reason: z
    .string()
    .trim()
    .min(4, "Шалтгааныг бичнэ үү — аудитын бүртгэлд үлдэнэ.")
    .max(500),
});

export const userRoleSchema = z.object({
  userId: z.number().int().positive(),
  role: z.enum(["bidder", "staff", "admin"]),
  reason: z
    .string()
    .trim()
    .min(4, "Шалтгааныг бичнэ үү — аудитын бүртгэлд үлдэнэ.")
    .max(500),
});

export const adjustSchema = z.object({
  userId: z.number().int().positive(),
  deltaPts: z
    .number({ message: "Дүн тоо байна." })
    .int("Дүн бүхэл тоо байна.")
    .refine((v) => v !== 0, "Дүн тэг байж болохгүй.")
    .min(-1_000_000, "Дүн хэт бага байна.")
    .max(1_000_000, "Дүн хэт өндөр байна."),
  memo: z
    .string()
    .trim()
    .min(4, "Тайлбар бичнэ үү — хэрэглэгчийн гүйлгээний түүхэнд харагдана.")
    .max(200),
});

export type LotInputParsed = z.infer<typeof lotSchema>;

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type BidInput = z.infer<typeof bidSchema>;
export type ContactInput = z.infer<typeof contactSchema>;

/** First message only — forms show one error per field, not a list. */
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Мэдээлэл буруу байна.";
}
