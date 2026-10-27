import type { CSSProperties } from "react";

/*
 * The columns, as steps out from the centre of the screen (`--c`, in units of
 * `--col` in globals.css), with when each one's light falls and how slowly.
 * Uneven on purpose: lights that fall in step read as a loading bar.
 */
const COLUMNS = [
  { c: -4, delay: 2.2, period: 13 },
  { c: -3, delay: 7.5, period: 12 },
  { c: -2, delay: 0.4, period: 14 },
  { c: -1, delay: 5.1, period: 11 },
  { c: 1, delay: 3.3, period: 12.5 },
  { c: 2, delay: 9, period: 13.5 },
  { c: 3, delay: 1.4, period: 11.5 },
  { c: 4, delay: 6.2, period: 14.5 },
] as const;

/**
 * The layer behind every page: the drifting grid, a few brighter columns with
 * light falling down them now and then, the wash at the top and the fade at
 * the sides. All of it is drawn by `.backdrop` in globals.css; this is only
 * the markup. Decorative, so hidden from assistive tech.
 */
export function Backdrop() {
  return (
    <div aria-hidden className="backdrop">
      <i />
      <span className="backdrop-cols">
        {COLUMNS.map(({ c, delay, period }) => (
          <b
            key={c}
            style={
              {
                "--c": c,
                "--delay": `${delay}s`,
                "--period": `${period}s`,
              } as CSSProperties
            }
          />
        ))}
      </span>
    </div>
  );
}
