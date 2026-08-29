/**
 * `review` is the gap between the clock stopping and the house naming a winner.
 * The lot is closed to bids and has no result yet — bidders are shown that it
 * is being checked rather than a hammer price that does not exist.
 */
export type LotStatus =
  "upcoming" | "live" | "review" | "sold" | "unsold";

/** Drives the generated placeholder artwork + the silhouette shown on a lot. */
export type LotCategory =
  "antique" | "painting" | "timepiece" | "jewellery" | "arms" | "manuscript";

export interface LotImage {
  url: string;
  /** What this particular view shows: "Урд тал", "Ар тал", "Дэлгэц". */
  alt: string;
  /**
   * Photographer and licence, shown under the gallery when present.
   *
   * Null for a house photograph, which owes nobody a credit. Set for anything
   * licensed on condition of attribution — CC BY and CC BY-SA both require it
   * wherever the image appears, which means beside the image and not in a file
   * next to it.
   */
  credit?: string | null;
}

/**
 * The image a grid shows for a lot, or null when the catalogue has no
 * photographs yet and the drawn silhouette should stand in.
 *
 * A function rather than a `cover` field, so there is one gallery and one
 * definition of which end of it is the front. Two fields for one concept is how
 * a cover ends up disagreeing with the first thumbnail.
 */
export function coverOf(lot: Pick<Lot, "images">): LotImage | null {
  return lot.images[0] ?? null;
}

export interface Lot {
  id: string;
  /** Catalogue code shown to bidders, e.g. "ЛОТ 014". */
  code: string;
  title: string;
  maker: string;
  year: string;
  category: LotCategory;
  /** One-paragraph catalogue note. */
  note: string;
  provenance: string;
  condition: string;
  dimensions: string;
  /** Estimates and opening price are held in POINTS, never in ₮. */
  estimateLowPts: number;
  estimateHighPts: number;
  openingPts: number;
  /**
   * Catalogue photographs, in gallery order. Position 0 is the cover — the one
   * a card in the grid shows.
   *
   * Possibly empty, on purpose: a lot with no photograph yet falls back to the
   * drawn silhouette rather than a broken image or a grey box, which is the
   * normal state of a catalogue while it is being assembled.
   *
   * `alt` belongs to each image rather than to the lot, because "Урд тал" and
   * "Ар тал" is what a screen reader needs — one description for a whole
   * gallery describes nothing.
   */
  images: LotImage[];

  status: LotStatus;
  /** ISO timestamp — when this lot's 2h45m session opens. */
  startsAt: string;
  /**
   * The standing price, in points, for a lot that is live.
   *
   * Equal to `openingPts` until somebody bids. Present so a summary — the hero
   * ticker, a card — can show what a lot is ACTUALLY at rather than what it
   * opened at. It is a snapshot as of the render; the room's SSE stream is what
   * keeps a price live.
   */
  currentPts?: number;

  /* ── Result, present only once a lot has been through the room ─────────── */
  /** Hammer price in points. Set when status is "sold". */
  hammerPts?: number;
  /** Which round the hammer fell in — the format's most telling statistic. */
  hammerRound?: number;
  /** Total bids received, sold or not. */
  bidCount?: number;
}

export interface Bid {
  id: string;
  /**
   * The paddle, e.g. "Т-207". Unique per user and stable, so it is the
   * IDENTITY the room compares on (`isYourLead`). No longer shown to bidders —
   * the feed and the leader now render the bidder's real `name` — but kept
   * because a name is not unique and two bidders called "Бат" must not collapse
   * into one lead.
   */
  paddle: string;
  /** The bidder's real name — what the feed and the leader display. */
  name: string;
  points: number;
  /** Which of the six rounds this bid landed in. */
  round: number;
  /** Epoch ms. */
  at: number;
  /** True for the signed-in bidder, so the feed can mark it. */
  isYou: boolean;
}

/** Everything the room renders from. The SSE payload is exactly this. */
export interface RoomState {
  /**
   * The server's clock at the moment this state was produced.
   *
   * Every deadline below is absolute epoch ms decided by the SERVER, and a
   * browser's clock is routinely minutes out — sometimes deliberately. Without
   * a reference point the client would count down to the wrong instant and, in
   * round 6, show five seconds where there is one. The client subtracts its own
   * `Date.now()` from this to get an offset and applies it to every clock.
   */
  serverNow: number;
  lot: Lot;
  round: number;
  currentPts: number;
  /** Paddle currently in the lead, null before the first bid. */
  leader: string | null;
  /** Epoch ms the bid clock expires. Resets on every accepted bid. */
  bidClockEndsAt: number;
  /** Epoch ms the current round rolls over to the next. */
  roundEndsAt: number;
  /** Newest first. */
  bids: Bid[];
  /** False until the signed-in bidder has placed their first bid on this lot. */
  hasBid: boolean;
  /**
   * `review` means bidding is over and an admin is deciding the winner. The
   * room keeps its stream open through it — the award arrives as another push,
   * so a bidder watching sees the result without reloading.
   */
  outcome: "running" | "review" | "sold" | "unsold";
}
