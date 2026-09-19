import { ImageResponse } from "next/og";
import { POINT_MNT, ROUNDS, TOTAL_MINUTES, TOTAL_ROUNDS } from "@/lib/auction";
import { t } from "@/lib/copy";

/**
 * The share card.
 *
 * Built from `auction.ts` and `copy.ts` rather than exported from a design
 * tool, so it cannot go stale: change the format and the card that advertises
 * it changes with it. A committed PNG would still be claiming six rounds long
 * after there were seven.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${t.brand.name} — ${t.brand.tagline}`;

export default function OpengraphImage() {
  const hours = Math.floor(TOTAL_MINUTES / 60);
  const minutes = TOTAL_MINUTES % 60;
  const first = ROUNDS[0]!.bidClockSec / 60;
  const last = ROUNDS[ROUNDS.length - 1]!.bidClockSec;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        position: "relative",
        background: "linear-gradient(120deg, #080b16 42%, #1a2140 100%)",
        color: "#f3f5ff",
        padding: "68px 76px",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: 6,
          background: "linear-gradient(90deg, #47eaff 0%, #8338ff 100%)",
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div
          style={{
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "0.22em",
            color: "#f3f5ff",
          }}
        >
          {t.brand.name.toUpperCase()}
        </div>
        <div
          style={{ fontSize: 22, color: "#ba95ff", letterSpacing: "0.14em" }}
        >
          {t.home.slatePlace.toUpperCase()}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            fontSize: 104,
            fontWeight: 500,
            letterSpacing: "-0.045em",
            lineHeight: 1,
            display: "flex",
          }}
        >
          {t.home.headline[0]}
        </div>
        <div
          style={{
            fontSize: 104,
            fontWeight: 500,
            letterSpacing: "-0.045em",
            lineHeight: 1,
            color: "#47eaff",
            display: "flex",
          }}
        >
          {t.home.headline[1]}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 56,
          borderTop: "1px solid #1a2140",
          paddingTop: 26,
          fontSize: 24,
          color: "#a0acc8",
        }}
      >
        <div style={{ display: "flex" }}>
          {TOTAL_ROUNDS} {t.common.roundWord}
        </div>
        <div style={{ display: "flex" }}>
          {hours} цаг {minutes} минут
        </div>
        <div style={{ display: "flex" }}>
          {first} мин → {last} сек
        </div>
        {/*
            "төгрөг", not "₮".

            `next/og` renders with a font it downloads per character set, and it
            cannot resolve one for U+20AE — the build logs "Failed to load
            dynamic font for ₮" and the glyph comes out blank or as a box. The
            word costs three characters of width and always renders.
          */}
        <div style={{ display: "flex" }}>
          1 {t.common.point} ={" "}
          {POINT_MNT.toLocaleString("en-US").replace(/,/g, " ")} төгрөг
        </div>
      </div>
    </div>,
    size,
  );
}
