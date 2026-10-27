import type { CSSProperties } from "react";

/**
 * The catalogue's headline, set letter by letter.
 *
 * Each letter lifts and sharpens in turn (`.hero-ch` in edgerunners.css),
 * starting at first paint. It is CSS alone, so there is no flash of the
 * finished heading before it plays, and a page whose scripts fail still ends
 * with the heading on screen.
 *
 * Words are wrapped so a line can only break between them, and the real text
 * sits beside the letters for assistive tech.
 */
export function HeroTitle({ lines }: { lines: readonly string[] }) {
  let n = 0;
  return (
    <>
      <span className="sr-only">{lines.join(" ")}</span>
      <span aria-hidden className="contents">
        {lines.map((line, li) => (
          <span
            key={li}
            className={
              li === lines.length - 1
                ? "hero-line hero-line-accent"
                : "hero-line"
            }
          >
            {line.split(" ").map((word, wi, words) => (
              <span key={wi}>
                <span className="hero-word">
                  {[...word].map((ch, ci) => (
                    <span
                      key={ci}
                      className="hero-ch"
                      style={{ "--i": n++ } as CSSProperties}
                    >
                      {ch}
                    </span>
                  ))}
                </span>
                {wi < words.length - 1 && " "}
              </span>
            ))}
          </span>
        ))}
      </span>
    </>
  );
}
