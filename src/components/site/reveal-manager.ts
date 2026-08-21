/**
 * ─────────────────────────────────────────────────────────────────────────────
 * One scroll watcher for every Reveal on the page.
 *
 * This deliberately does NOT use IntersectionObserver, which is the obvious
 * choice and the wrong one here. IO only notifies when an element's intersection
 * ratio *crosses a threshold*. Jump straight past an element — an anchor link,
 * the End key, `scrollTo`, a browser-restored scroll position — and it goes from
 * ratio 0 (below the viewport) to ratio 0 (above it) without ever crossing
 * anything. No callback fires, and that section stays at opacity 0 forever.
 *
 * A reveal animation must never be the reason content is invisible, so the test
 * is positional rather than event-based: "has this element's top come past the
 * trigger line", which is true both for elements scrolling into view and for
 * elements already scrolled beyond.
 *
 * Cost is one passive listener and one rAF-throttled pass over a handful of
 * elements — and the whole thing detaches itself once everything has been
 * revealed, so a fully-scrolled page has no scroll handler at all.
 * ─────────────────────────────────────────────────────────────────────────────
 */

type Pending = { el: Element; show: () => void };

const pending = new Set<Pending>();
let listening = false;
let frame = 0;
let backstop: ReturnType<typeof setTimeout> | 0 = 0;

/** Reveal anything whose top has come past the trigger line. */
function sweep() {
  /* 0.88 leaves the motion finished by the time the reader's eye arrives,
     matching the feel of a -12% rootMargin. */
  const line = window.innerHeight * 0.88;

  for (const p of [...pending]) {
    if (p.el.getBoundingClientRect().top < line) {
      pending.delete(p);
      p.show();
    }
  }

  if (pending.size === 0) stop();
}

function run() {
  if (frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  if (backstop) {
    clearTimeout(backstop);
    backstop = 0;
  }
  sweep();
}

/**
 * rAF is the fast path and wins this race under normal conditions (~16ms), so
 * reveals animate. The timer is a backstop for documents that are not producing
 * frames at all — a tab loaded in the background, where rAF can stay parked
 * indefinitely. Timers still fire there, so content ends up visible (just
 * un-animated, which nobody can see anyway) instead of stuck at opacity 0.
 */
function schedule() {
  if (frame || backstop) return;
  frame = requestAnimationFrame(run);
  backstop = setTimeout(run, 300);
}

function start() {
  if (listening) return;
  listening = true;
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
}

function stop() {
  if (!listening) return;
  listening = false;
  window.removeEventListener("scroll", schedule);
  window.removeEventListener("resize", schedule);
  if (frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  if (backstop) {
    clearTimeout(backstop);
    backstop = 0;
  }
}

/**
 * Watch `el` and call `show` once it has come into view. Returns an unregister
 * function. `show` is called at most once — the manager drops the element
 * immediately, so nothing can re-hide it later.
 *
 * The first check runs on the next frame rather than synchronously, which is
 * what lets already-visible elements animate in instead of snapping.
 */
export function registerReveal(el: Element, show: () => void) {
  const entry: Pending = { el, show };
  pending.add(entry);
  start();
  schedule();

  return () => {
    pending.delete(entry);
    if (pending.size === 0) stop();
  };
}
