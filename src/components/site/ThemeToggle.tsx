"use client";

import { useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { t } from "@/lib/copy";

type Theme = "system" | "light" | "dark";

const STORAGE_KEY = "theme";

/** Chromium/Safari expose this; Firefox (as of writing) does not. */
type WithVT = Document & {
  startViewTransition?: (cb: () => void) => unknown;
};

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * The theme is external state, not React state.
 *
 * The real value lives in one place — the `data-theme` attribute on <html>,
 * written by the inline head script before first paint. Mirroring it into
 * useState would mean reading it in an effect (a cascading render, and what the
 * react-hooks/set-state-in-effect rule exists to prevent) and would give React
 * two sources of truth for the same fact.
 *
 * useSyncExternalStore is built for exactly this: it reads the DOM as the store,
 * uses the server snapshot during SSR and hydration so nothing mismatches, and
 * subscribing to `storage` means changing the theme in one tab updates every
 * other open tab for free.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The applied theme, read straight off the element that decides the colours. */
function getSnapshot(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "light" || attr === "dark" ? attr : "system";
}

/** The server always renders the light default and cannot know the choice. */
function getServerSnapshot(): Theme {
  return "system";
}

function setTheme(next: Theme) {
  const root = document.documentElement;
  try {
    if (next === "system") {
      /* "system" is the *absence* of the attribute, which hands the decision
         back to the prefers-color-scheme block in globals.css — including when
         the OS flips at sunset. */
      root.removeAttribute("data-theme");
      localStorage.removeItem(STORAGE_KEY);
    } else {
      root.setAttribute("data-theme", next);
      localStorage.setItem(STORAGE_KEY, next);
    }
  } catch {
    /* Private mode may block storage; the attribute change still applied. */
  }
  listeners.forEach((l) => l());
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function apply(next: Theme) {
    const doc = document as WithVT;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /*
     * Crossfade the whole page in one composited step. The alternative — a
     * colour transition on every element — would repaint the entire tree on
     * every hover, for the sake of one interaction.
     *
     * The visibility check matters more than it looks. startViewTransition runs
     * its callback on a later frame, and a hidden document may not produce one
     * for seconds — which strands the theme change, since the attribute write
     * lives in that callback. Measured at several seconds' delay on a
     * backgrounded tab. Nothing is animating in a hidden document anyway, so
     * apply it straight away.
     */
    const startVT = doc.startViewTransition;
    const canAnimate =
      typeof startVT === "function" &&
      !reduced &&
      document.visibilityState === "visible";

    if (canAnimate) {
      /* .call so `this` is still the document — it is a Document method. */
      startVT.call(document, () => setTheme(next));
    } else {
      setTheme(next);
    }
  }

  const options: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: "system", label: t.theme.system, icon: <AutoIcon /> },
    { value: "light", label: t.theme.light, icon: <SunIcon /> },
    { value: "dark", label: t.theme.dark, icon: <MoonIcon /> },
  ];

  return (
    <div
      role="group"
      aria-label={t.theme.label}
      className="flex items-center border border-line bg-surface/30 p-0.5"
    >
      {options.map((opt) => {
        const active = theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => apply(opt.value)}
            aria-label={opt.label}
            aria-pressed={active}
            title={opt.label}
            className={`relative grid size-8 place-items-center transition-colors duration-200 ${
              active ? "text-ink font-bold" : "text-faint hover:text-ink"
            }`}
          >
            {active && (
              <motion.span
                layoutId="theme-active-pill"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className="absolute inset-0 bg-raise border border-line-strong"
              />
            )}
            <span className="relative z-10">{opt.icon}</span>
          </button>
        );
      })}
    </div>
  );
}

/* 14px stroke icons, sized to sit beside the 11px eyebrow type. */

function AutoIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-3.5" fill="none">
      <circle cx="8" cy="8" r="5.25" stroke="currentColor" strokeWidth="1.3" />
      {/* Half-filled: "follow the system", without needing a word for it. */}
      <path d="M8 2.75A5.25 5.25 0 0 1 8 13.25Z" fill="currentColor" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    >
      <circle cx="8" cy="8" r="3.1" />
      <path d="M8 1.4v1.6M8 13v1.6M1.4 8h1.6M13 8h1.6M3.4 3.4l1.15 1.15M11.45 11.45l1.15 1.15M12.6 3.4l-1.15 1.15M4.55 11.45L3.4 12.6" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-3.5" fill="none">
      <path
        d="M13 9.9A5.6 5.6 0 0 1 6.1 3a5.6 5.6 0 1 0 6.9 6.9Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
