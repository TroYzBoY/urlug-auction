import Link from "next/link";
import { t } from "@/lib/copy";

/**
 * Page numbers with an ellipsis once the list gets long, so the control stays a
 * fixed width no matter how big the catalogue grows — 200 lots must not produce
 * 200 links.
 *
 * Always shows: first, last, and the current page with one neighbour each side.
 * Everything else collapses to "…". Below 8 pages there is nothing to collapse,
 * so every number is shown.
 */
function pageList(current: number, total: number): (number | "gap")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const out: (number | "gap")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) out.push("gap");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push("gap");

  out.push(total);
  return out;
}

export function Pagination({
  page,
  totalPages,
  makeHref,
}: {
  page: number;
  totalPages: number;
  makeHref: (page: number) => string;
}) {
  if (totalPages <= 1) return null;

  const items = pageList(page, totalPages);

  return (
    <nav
      aria-label={t.lots.title}
      className="mt-10 flex items-center justify-center gap-1.5"
    >
      <Step
        href={makeHref(page - 1)}
        label={t.lots.prev}
        disabled={page === 1}
        glyph="‹"
      />

      {items.map((item, i) =>
        item === "gap" ? (
          <span
            key={`gap-${i}`}
            aria-hidden
            className="grid size-9 place-items-center text-sm text-faint"
          >
            …
          </span>
        ) : (
          <Link
            key={item}
            href={makeHref(item)}
            aria-label={t.lots.pageLabel(item)}
            aria-current={item === page ? "page" : undefined}
            data-numerals
            className={`grid size-9 place-items-center rounded-full text-sm transition-colors ${
              item === page
                ? "bg-ink font-semibold text-ground"
                : "text-ink-soft hover:bg-raise hover:text-ink"
            }`}
          >
            {item}
          </Link>
        ),
      )}

      <Step
        href={makeHref(page + 1)}
        label={t.lots.next}
        disabled={page === totalPages}
        glyph="›"
      />
    </nav>
  );
}

function Step({
  href,
  label,
  disabled,
  glyph,
}: {
  href: string;
  label: string;
  disabled: boolean;
  glyph: string;
}) {
  /* Rendered as a span when there is nowhere to go — a disabled <a> is still
     focusable and still navigates, which is the classic pagination bug. */
  if (disabled) {
    return (
      <span
        aria-hidden
        className="grid size-9 place-items-center rounded-full text-sm text-faint/50"
      >
        {glyph}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={label}
      className="grid size-9 place-items-center rounded-full text-sm text-ink-soft transition-colors hover:bg-raise hover:text-ink"
    >
      {glyph}
    </Link>
  );
}
