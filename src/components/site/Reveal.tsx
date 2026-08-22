type RevealProps = {
  children: React.ReactNode;
  className?: string;
  /** Accepted and ignored. See the note below. */
  delay?: number;
  /** Accepted and ignored. See the note below. */
  y?: number;
  as?: "div" | "section" | "article" | "li";
  id?: string;
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A SECTION WRAPPER. IT NO LONGER REVEALS ANYTHING.
 *
 * Scroll reveals are gone from the site. They were the largest source of motion
 * outside the landing, and on a phone they meant most of a page was invisible
 * at any moment — you scrolled, waited a beat, then read.
 *
 * ── Why the component survives ───────────────────────────────────────────────
 *
 * It is used about thirty times across five pages, and it carries `as` and `id`
 * that those call sites depend on for their heading structure and anchors.
 * Deleting it would be a mechanical edit of every page for no gain, and would
 * lose the semantic element choice along the way.
 *
 * `delay` and `y` are kept in the signature and ignored. Removing them would
 * churn every call site to say nothing; leaving them means restoring the
 * animation later is one file, not thirty.
 *
 * ── What went with it ────────────────────────────────────────────────────────
 *
 * `reveal-manager.ts` and the `[data-reveal]` rules in `globals.css`. The
 * manager was careful work — it tracked position rather than intersection
 * precisely so that jumping past an element with an anchor link or the End key
 * still revealed it, which `IntersectionObserver` gets wrong. That care was in
 * service of never leaving content invisible, and not hiding it in the first
 * place achieves the same thing with no code.
 *
 * This is now a Server Component: no "use client", no hook, no JavaScript
 * shipped for it at all.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function Reveal({
  children,
  className = "",
  as: Tag = "div",
  id,
}: RevealProps) {
  return (
    <Tag id={id} className={className}>
      {children}
    </Tag>
  );
}
