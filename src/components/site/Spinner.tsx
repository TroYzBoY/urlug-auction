/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A SPINNER, ON A PAGE WITH NO REQUEST IN FLIGHT
 *
 * This codebase deliberately has almost no loading indicators: bids are applied
 * optimistically, the room's first paint is server-rendered, and a spinner over
 * something that has already visibly happened is noise.
 *
 * The exception this exists for is the review state. What is pending there is
 * not a fetch but a PERSON deciding, and the wait is genuinely open-ended. A
 * bidder who watched a clock reach zero has to be able to tell "the sale is
 * over and you lost" apart from "the sale is over and nobody has decided yet" —
 * and the second is only legible as motion. A line of static text under a
 * stopped clock reads as a page that broke.
 *
 * Decorative, and marked so: whatever it sits beside carries the message and is
 * what a screen reader announces. `motion-reduce:animate-none` leaves a plain
 * ring for anyone who has asked for less movement — they lose nothing, because
 * the text was always the content.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function Spinner({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={`${className} shrink-0 animate-spin text-flare motion-reduce:animate-none`}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.25"
      />
      {/* A quarter arc, so the ring beneath it is what reads as turning. */}
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
