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
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#17120e",
          color: "#f4ece2",
          padding: "68px 76px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: "0.22em",
              color: "#f4ece2",
            }}
          >
            {t.brand.name.toUpperCase()}
          </div>
          <div style={{ fontSize: 22, color: "#a08d7c", letterSpacing: "0.14em" }}>
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
              color: "#c98a4b",
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
            borderTop: "1px solid #3a2c22",
            paddingTop: 26,
            fontSize: 24,
            color: "#a08d7c",
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
          <div style={{ display: "flex" }}>
            1 {t.common.point} = {POINT_MNT.toLocaleString("en-US").replace(/,/g, " ")}₮
          </div>
        </div>
      </div>
    ),
    size,
  );
}
