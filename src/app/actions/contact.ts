"use server";

import { headers } from "next/headers";
import { query } from "@/lib/db";
import { LIMITS, consume } from "@/lib/rate-limit";
import { clientIpFrom } from "@/lib/session";
import { contactSchema, firstError } from "@/lib/validation";

/**
 * Contact messages are stored, not emailed.
 *
 * A form that hands its only copy to an SMTP server loses the message whenever
 * that server has a bad day, and nobody finds out — the sender saw a success
 * screen. The row is the record; notifying whoever answers it is a separate
 * concern that can fail loudly and be retried.
 */

export type ContactState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "sent" };

export async function sendMessage(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const parsed = contactSchema.safeParse({
    name: formData.get("name"),
    contact: formData.get("contact"),
    topic: formData.get("topic"),
    message: formData.get("message"),
  });
  if (!parsed.success) {
    return { status: "error", message: firstError(parsed.error) };
  }

  const ip = clientIpFrom(await headers());
  const limited = await consume(`contact:${ip ?? "unknown"}`, LIMITS.contact);
  if (!limited.ok) {
    return {
      status: "error",
      message: "Хэт олон мессеж илгээсэн байна. Дараа дахин оролдоно уу.",
    };
  }

  await query(
    `INSERT INTO contact_messages (name, contact, topic, message, ip)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      parsed.data.name,
      parsed.data.contact,
      parsed.data.topic,
      parsed.data.message,
      ip,
    ],
  );

  return { status: "sent" };
}
