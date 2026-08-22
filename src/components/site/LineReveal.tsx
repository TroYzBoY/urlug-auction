/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A HEADING SET LINE BY LINE. IT NO LONGER REVEALS ANYTHING.
 *
 * It used to be a masked type entrance: each line rising out from behind a hard
 * edge, staggered, over 0.9s. It read well — and it was the same gesture as the
 * `animate-rise-in` staggers removed everywhere else, so leaving it meant the
 * one page with a cinematic heading was the one page still animating its
 * content in. The heading is now simply there.
 *
 * ── Why the component survives ───────────────────────────────────────────────
 *
 * Line breaks in a display heading are a TYPOGRAPHIC decision, not something to
 * leave to the browser: "Хугацаа / хумигдана." breaking after "Хугацаа" is the
 * composition, and at a different viewport width the browser would break it
 * somewhere else or not at all. Taking an array of lines is what makes that
 * decision explicit and keeps it.
 *
 * The `pb`/`-mb` pair survives too, for a subtler reason. It was there because
 * `overflow-hidden` clips at the line box and would slice the descenders on
 * у, ф and р. There is no mask any more — but `block` spans with tight
 * `leading` still clip descenders in some browsers at display sizes, and the
 * pair costs nothing.
 *
 * `delay` and `stagger` are accepted and ignored, so restoring the animation is
 * this file rather than every call site. This is now a Server Component: no
 * "use client", no framer-motion, no JavaScript shipped for a heading.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function LineReveal({
  lines,
  className = "",
  lineClassName = "",
  as: Tag = "h1",
}: {
  lines: React.ReactNode[];
  className?: string;
  lineClassName?: string;
  /** Accepted and ignored. See above. */
  delay?: number;
  /** Accepted and ignored. See above. */
  stagger?: number;
  as?: "h1" | "h2" | "p" | "div";
}) {
  return (
    <Tag className={className}>
      {lines.map((line, i) => (
        <span
          key={i}
          className={`block pb-[0.12em] -mb-[0.12em] ${lineClassName}`}
        >
          {line}
        </span>
      ))}
    </Tag>
  );
}
