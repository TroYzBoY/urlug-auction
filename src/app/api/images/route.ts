import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { log } from "@/lib/observability";
import {
  MAX_IMAGE_BYTES,
  imagePath,
  saveImage,
  sniffImage,
} from "@/lib/repo/media";
import { clientIpFrom, requireAdmin } from "@/lib/session";

/**
 * POST /api/images — an admin uploads one photograph for a lot's gallery.
 *
 * A route handler rather than a Server Function because Server Functions cap a
 * request body at 1MB, and a photograph is usually more. The lot form resizes
 * the image in the browser first (AdminForms), so what arrives is normally a
 * few hundred kilobytes; the cap here is for whatever skipped that step.
 *
 * Answers with the path to put in the gallery. The lot itself is not touched —
 * the photograph joins a lot when the lot form is saved.
 */
export async function POST(request: NextRequest) {
  /* 404 for everyone else, as on every admin surface. */
  const admin = await requireAdmin();

  /*
   * Same-origin only. The session cookie is SameSite=Lax, so a cross-site POST
   * arrives without it and is refused above already; this is the second lock,
   * and the one Server Functions get from Next without asking.
   */
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!origin || !host || new URL(origin).host !== host) {
    return Response.json({ error: "Хүсэлт буруу байна." }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return Response.json({ error: "Зураг сонгоно уу." }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return Response.json(
      { error: "Зураг хэт том байна — 8MB-аас бага байх ёстой." },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type) {
    return Response.json(
      { error: "Зөвхөн JPEG, PNG эсвэл WebP зураг оруулна." },
      { status: 415 },
    );
  }

  const id = await saveImage(bytes, type, {
    id: admin.id,
    ip: clientIpFrom(h),
    userAgent: h.get("user-agent")?.slice(0, 500) ?? null,
  });

  log.info({
    event: "admin.image_uploaded",
    actorId: admin.id,
    imageId: id,
    bytes: bytes.length,
  });

  return Response.json({ url: imagePath(id) });
}
