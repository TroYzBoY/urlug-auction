import "server-only";
import { createHash } from "node:crypto";
import { query, queryOne, transaction } from "../db";
import { record } from "../audit";
import type { Actor } from "./admin-write";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * UPLOADED PHOTOGRAPHS
 *
 * Kept in Postgres — see the `media` table in db/schema.sql for why not on
 * disk. Addressed by the SHA-256 of their bytes, so an id names one image for
 * ever and the route that serves it can be cached without expiry.
 *
 * ⚠ Nothing here checks authorisation, like the rest of the admin writes: the
 * upload route calls `requireAdmin()` first.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ImageType = "image/jpeg" | "image/png" | "image/webp";

/** The largest file the upload route accepts. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * What the bytes ARE, from their first few — never the name or the type the
 * browser claimed, both of which the uploader controls.
 *
 * Three formats and no others. SVG above all is refused: it is a document that
 * can carry script, not a picture, and serving one from this origin would be
 * serving a page.
 */
export function sniffImage(bytes: Uint8Array): ImageType | null {
  const at = (i: number) => bytes[i];
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  if (
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (b, i) => at(i) === b,
    )
  ) {
    return "image/png";
  }
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

/**
 * Stores an image and returns its id. The same bytes uploaded again return the
 * same id without a second row, and without a second audit entry.
 */
export async function saveImage(
  bytes: Uint8Array,
  contentType: ImageType,
  actor: Actor,
): Promise<string> {
  const id = createHash("sha256").update(bytes).digest("hex");

  await transaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO media (id, content_type, bytes, size_bytes, uploaded_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [id, contentType, Buffer.from(bytes), bytes.length, actor.id],
    );
    if (inserted.rowCount === 0) return;

    await record(client, {
      actorUserId: actor.id,
      action: "admin.image_uploaded",
      targetType: "media",
      targetId: id,
      detail: { contentType, sizeBytes: bytes.length },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
  });

  return id;
}

export async function readImage(
  id: string,
): Promise<{ contentType: ImageType; bytes: Buffer } | null> {
  const row = await queryOne<{ content_type: ImageType; bytes: Buffer }>(
    "SELECT content_type, bytes FROM media WHERE id = $1",
    [id],
  );
  return row ? { contentType: row.content_type, bytes: row.bytes } : null;
}

export interface CreditRow {
  lotId: string;
  code: string;
  title: string;
  url: string;
  alt: string;
  credit: string;
}

/**
 * Every catalogue photograph that owes somebody a credit — the source of the
 * /credits page. A house photograph has none and does not appear.
 */
export async function photoCredits(): Promise<CreditRow[]> {
  const rows = await query<{
    lot_id: string;
    code: string;
    title: string;
    url: string;
    alt: string;
    credit: string;
  }>(
    `SELECT l.id AS lot_id, l.code, l.title, i.url, i.alt, i.credit
       FROM lot_images i JOIN lots l ON l.id = i.lot_id
      WHERE i.credit IS NOT NULL AND btrim(i.credit) <> ''
      ORDER BY l.starts_at DESC, l.id, i.sort_order`,
  );
  return rows.map((r) => ({
    lotId: r.lot_id,
    code: r.code,
    title: r.title,
    url: r.url,
    alt: r.alt,
    credit: r.credit,
  }));
}

/** The public path an uploaded image is served at. */
export function imagePath(id: string): string {
  return `/api/images/${id}`;
}
