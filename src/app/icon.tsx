import { ImageResponse } from "next/og";
import { t } from "@/lib/copy";

/**
 * The favicon, generated rather than committed as a binary.
 *
 * The mark is one letter from `copy.ts`, so renaming the house renames the
 * favicon too — the same reason the page titles are built from `brand.name`
 * instead of being typed out. A committed .ico would have to be remembered.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // A cyan mark on navy stays crisp at tab size; the purple edge
        // connects the small mark to the site's second accent.
        background: "#080b16",
        color: "#47eaff",
        borderBottom: "3px solid #8338ff",
        borderRadius: 6,
        fontSize: 22,
        fontWeight: 700,
        letterSpacing: "-0.02em",
      }}
    >
      {t.brand.mark}
    </div>,
    size,
  );
}
