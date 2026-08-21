import Image from "next/image";
import { DitherLayer } from "./DitherLayer";
import type { LotCategory } from "@/lib/types";

/**
 * Stand-in for lot photography.
 *
 * Every lot needs an image and none exist yet, so rather than grey boxes this
 * draws a warm ground plus a single-stroke silhouette chosen by category. No
 * network assets, no layout shift, and it reads as intentional in a client
 * demo. When real photos arrive, swap the inner content for <Image> — the
 * aspect box and overlays around it stay.
 */

const SILHOUETTES: Record<LotCategory, React.ReactNode> = {
  // Vessel: bowl with a footed base and a flared rim.
  antique: (
    <>
      <path d="M28 34h44M32 34c0 22 6 34 18 34s18-12 18-34" />
      <path d="M42 68h16M46 68v6h8v-6" />
      <path d="M38 42c8 4 16 4 24 0" />
    </>
  ),
  // Framed canvas with a horizon.
  painting: (
    <>
      <rect x="22" y="20" width="56" height="60" rx="1" />
      <rect x="29" y="27" width="42" height="46" rx="1" />
      <path d="M29 58c7-9 12-4 17-9s10 2 25-6" />
      <circle cx="60" cy="38" r="4" />
    </>
  ),
  // Pocket-watch case with hands.
  timepiece: (
    <>
      <circle cx="50" cy="52" r="26" />
      <circle cx="50" cy="52" r="21" />
      <path d="M50 52V38M50 52l10 7" />
      <path d="M44 22h12M50 22v4" />
      <circle cx="50" cy="52" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  // Pair of hanging drops.
  jewellery: (
    <>
      <path d="M36 24v8M64 24v8" />
      <circle cx="36" cy="38" r="6" />
      <circle cx="64" cy="38" r="6" />
      <path d="M36 44c-5 8-5 18 0 26 5-8 5-18 0-26Z" />
      <path d="M64 44c-5 8-5 18 0 26 5-8 5-18 0-26Z" />
    </>
  ),
  // Helmet dome with a finial.
  arms: (
    <>
      <path d="M28 66c0-20 10-34 22-34s22 14 22 34" />
      <path d="M50 32V22M46 22h8" />
      <path d="M26 66h48" />
      <path d="M38 66v10M62 66v10" />
      <path d="M50 40v26" />
    </>
  ),
  // Sutra leaf with text lines.
  manuscript: (
    <>
      <rect x="16" y="36" width="68" height="30" rx="1" />
      <path d="M24 44h22M24 51h30M24 58h18" />
      <circle cx="68" cy="51" r="7" />
      <path d="M68 46v10M63 51h10" />
    </>
  ),
};

/** Each category gets its own warm ground so a grid does not look uniform. */
const GROUNDS: Record<LotCategory, string> = {
  antique:
    "radial-gradient(120% 90% at 30% 8%, #e6d4bd 0%, #d8c0a2 45%, #b99873 100%)",
  painting:
    "radial-gradient(120% 90% at 70% 10%, #e9dcc8 0%, #cdb693 48%, #9e7c56 100%)",
  timepiece:
    "radial-gradient(120% 90% at 45% 5%, #ecdfcb 0%, #d3b892 45%, #a8834f 100%)",
  jewellery:
    "radial-gradient(120% 90% at 25% 12%, #e8d3c4 0%, #d0ab97 48%, #a8746b 100%)",
  arms: "radial-gradient(120% 90% at 60% 6%, #ded3c4 0%, #b9a894 45%, #857463 100%)",
  manuscript:
    "radial-gradient(120% 90% at 35% 10%, #eadfc9 0%, #cfbb96 46%, #9a8354 100%)",
};

export function LotPlate({
  category,
  code,
  image,
  alt,
  priority = false,
  dither = false,
  ditherRes,
  className = "",
  ratio = "aspect-[4/5]",
}: {
  category: LotCategory;
  code?: string;
  /** Catalogue photograph. Falls back to the drawn silhouette when absent. */
  image?: string;
  /** What the photograph shows — the lot title. */
  alt?: string;
  /** Set on the one plate that is above the fold, to skip lazy loading. */
  priority?: boolean;
  /**
   * Render as a 1-bit ordered dither that resolves to the photograph on
   * hover, or on scroll where there is no hover.
   *
   * Opt-in, because it belongs to *browsing*: the catalogue reads as a printed
   * index, and the lot's own page shows the object plainly. Turning it on
   * everywhere would mean a bidder never sees what they are bidding on.
   */
  dither?: boolean;
  /** Dot size. Raise it for large plates — see DEFAULT_RES in DitherLayer. */
  ditherRes?: number;
  className?: string;
  ratio?: string;
}) {
  return (
    <div
      className={`relative isolate overflow-hidden ${ratio} ${className}`}
      style={{ background: GROUNDS[category] }}
    >
      {image ? (
        <Image
          src={image}
          alt={alt ?? ""}
          fill
          /* The catalogue is two-up on phones and three-up from lg, so a card
             image is never wider than half the viewport until the desktop grid
             narrows it to a third. Stating 100vw here would make every phone
             download an image at twice the resolution it can display. */
          sizes="(max-width: 1024px) 50vw, 33vw"
          priority={priority}
          className="object-cover"
        />
      ) : null}

      {image && dither && <DitherLayer src={image} res={ditherRes} />}

      {!image && (
        <>
          {/* Sheen — one soft diagonal so the ground does not read as flat fill. */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-60 mix-blend-soft-light"
            style={{
              background:
                "linear-gradient(118deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 42%, rgba(0,0,0,0.22) 100%)",
            }}
          />

          <svg
            viewBox="0 0 100 100"
            aria-hidden
            className="absolute inset-0 size-full text-[#3d2a19] opacity-40"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {SILHOUETTES[category]}
          </svg>
        </>
      )}


      {/* Inner hairline, inset so it reads as a mount rather than a border.
          Kept over photographs too — it is what makes the grid read as a
          catalogue of mounted objects rather than a wall of thumbnails. */}
      <div
        aria-hidden
        className="absolute inset-2.5 border border-[#3d2a19]/15 mix-blend-overlay"
      />

      {code && (
        <span className="absolute bottom-3 left-3 text-[0.625rem] font-semibold tracking-[0.18em] text-[#3d2a19]/55 mix-blend-overlay">
          {code}
        </span>
      )}
    </div>
  );
}
