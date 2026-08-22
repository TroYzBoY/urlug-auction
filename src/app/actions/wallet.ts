"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { recordDetached } from "@/lib/audit";
import { createInvoice } from "@/lib/payments";
import { LIMITS, consume } from "@/lib/rate-limit";
import { createTopup, findPackage } from "@/lib/repo/topups";
import { clientIpFrom, currentUser } from "@/lib/session";
import { t } from "@/lib/copy";

/**
 * Starting a top-up.
 *
 * The bidder chooses a package; the server decides the price. `points` is the
 * only thing the form sends, and it is looked up in `PACKAGES` — a client that
 * could name its own `amountMnt` could buy 400 points for one tögrög.
 */

export type WalletState = { status: "idle" } | { status: "error"; message: string };

export async function startTopup(
  _prev: WalletState,
  formData: FormData,
): Promise<WalletState> {
  const user = await currentUser();
  if (!user) redirect("/login?redirect=/wallet");
  if (!user.phoneVerified) {
    return {
      status: "error",
      message: "Утасны дугаараа баталгаажуулсны дараа оноо худалдан авах боломжтой.",
    };
  }

  const points = Number.parseInt(String(formData.get("points") ?? ""), 10);
  if (!findPackage(points)) {
    return { status: "error", message: "Багц сонгоно уу." };
  }

  const ip = clientIpFrom(await headers());
  const limited = await consume(`topup:${user.id}`, LIMITS.topup);
  if (!limited.ok) {
    return {
      status: "error",
      message: "Хэт олон удаа оролдлоо. Хэсэг хүлээнэ үү.",
    };
  }

  const created = await createTopup(user.id, points, ip);
  if (!created.ok) {
    return { status: "error", message: "Багц сонгоно уу." };
  }

  let paymentUrl: string;
  try {
    const invoice = await createInvoice({
      reference: created.topup.reference,
      amountMnt: created.topup.amountMnt,
      description: `${t.brand.name} — ${created.topup.points} оноо`,
    });
    paymentUrl = invoice.paymentUrl;
  } catch (err) {
    /*
     * The pending row stays. A top-up that failed before the provider was ever
     * reached is still worth a record — it is the difference between "we have
     * no idea what you are talking about" and "we can see your attempt at
     * 14:02 and it never got as far as the bank".
     */
    console.error("[wallet] invoice failed", created.topup.reference, err);
    recordDetached({
      actorUserId: user.id,
      action: "topup.invoice_failed",
      targetType: "topup",
      targetId: created.topup.reference,
      detail: { message: String(err) },
      ip,
    });
    return {
      status: "error",
      message: "Төлбөрийн систем түр ажиллахгүй байна. Дараа дахин оролдоно уу.",
    };
  }

  redirect(paymentUrl);
}
