import { ImageResponse } from "next/og";
import { t } from "@/lib/copy";

/** 180×180, the size iOS asks for when a visitor adds the site to a home screen. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#17120e",
          color: "#c98a4b",
          fontSize: 110,
          fontWeight: 700,
          letterSpacing: "-0.02em",
        }}
      >
        {t.brand.mark}
      </div>
    ),
    size,
  );
}
