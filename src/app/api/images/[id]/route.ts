import { readImage } from "@/lib/repo/media";

/**
 * GET /api/images/<sha256> — an uploaded photograph.
 *
 * The id is the hash of the bytes, so the bytes behind a URL can never change
 * and browsers, the image optimiser and any CDN may keep it for a year.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/images/[id]">,
) {
  const { id } = await ctx.params;
  if (!/^[a-f0-9]{64}$/.test(id)) {
    return new Response("Not found", { status: 404 });
  }

  const image = await readImage(id);
  if (!image) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "content-type": image.contentType,
      "content-length": String(image.bytes.length),
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
