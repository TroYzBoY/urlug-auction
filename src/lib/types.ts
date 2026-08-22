export type LotStatus = "upcoming" | "live" | "sold" | "unsold";

/** Drives the generated placeholder artwork + the silhouette shown on a lot. */
export type LotCategory =
  | "antique"
  | "painting"
  | "timepiece"
  | "jewellery"
  | "arms"
  | "manuscript";

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
   * Catalogue photograph, served from /public/media/lots.
   *
   * Optional on purpose: a lot with no photo yet falls back to the drawn
   * silhouette rather than a broken image or a grey box, which is the normal
   * state of a catalogue while it is still being assembled.
   */
  image?: string;

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
  /** Anonymised paddle label shown in the feed, e.g. "Т-207". */
  paddle: string;
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
  outcome: "running" | "sold" | "unsold";
}
