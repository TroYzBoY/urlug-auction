"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { LiveDot } from "@/components/lot/LotCard";
import { t } from "@/lib/copy";
import { ThemeToggle } from "./ThemeToggle";

/**
 * `desktop: false` keeps a link out of the pill but still in the burger. The
 * pill already carries the theme toggle and the login button, and a fourth
 * label crowds it before the max-width does — the menu has room, so contact
 * lives there.
 */
const LINKS = [
  { href: "/lots", label: t.nav.lots, desktop: true },
  { href: "/rules", label: t.nav.rules, desktop: true },
  { href: "/about", label: t.nav.about, desktop: true },
  /* `/` is the cinematic landing now, so the live lot, round ladder, index and
     results moved to /overview. It sits in the burger for the same reason
     contact does — the pill is already full at three labels. */
  { href: "/overview", label: t.nav.overview, desktop: false },
  { href: "/contact", label: t.nav.contact, desktop: false },
] as const;

export function Header({ minimal = false }: { minimal?: boolean }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();

  /*
   * Escape closes the menu. Registered only while it is open, so the site is not
   * carrying a keydown listener on every page for a menu nobody has touched.
   *
   * The listener sets state from an event callback, not from the effect body —
   * the effect only subscribes, which is what effects are for.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (minimal) {
    /*
     * Transparent: the room's own grain and ground read straight through, so
     * the bar stops looking like a separate slab pasted on top of the page.
     *
     * The backdrop blur stays. With nothing behind it at scroll-top it costs
     * nothing visually, but once the lot plate and the feed start passing
     * underneath it is the only thing keeping the wordmark and the live badge
     * legible — a genuinely transparent sticky bar becomes unreadable the moment
     * content scrolls into it. The bottom border goes too: on a transparent bar
     * it reads as a stray line floating over the artwork.
     */
    return (
      <header className="sticky top-0 z-40 bg-transparent backdrop-blur-md">
        <div className="gutter flex h-14 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {/*
              Explicit way out of the room. The wordmark links home too, but a
              bidder deep in a live sale does not read a logo as "exit" — and on
              a phone there is no visible browser back button to fall back on.
            */}
            <Link
              href="/lots"
              aria-label={t.nav.back}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line-strong/30 pr-2.5 pl-2 text-ink-soft transition-colors hover:border-accent hover:text-accent"
            >
              <ChevronLeft />
              <span className="eyebrow hidden text-[0.625rem] sm:inline">
                {t.nav.back}
              </span>
            </Link>

            <Link
              href="/"
              className="min-w-0 truncate font-sans text-xs font-bold tracking-[0.2em] text-ink uppercase"
            >
              {t.brand.name}
            </Link>
          </div>

          <span className="eyebrow flex shrink-0 items-center gap-1.5 text-[0.625rem] font-semibold text-rust sm:text-[0.6875rem]">
            <LiveDot />
            {t.room.liveRoom}
          </span>
        </div>
      </header>
    );
  }

  return (
    <header className="fixed top-3 left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-3xl -translate-x-1/2 sm:top-5 sm:w-[calc(100%-2.5rem)]">
      <motion.div
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="flex h-11 items-center justify-between rounded-full border border-line-strong/20 bg-surface/85 px-3.5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl transition-colors duration-300 sm:px-5"
      >
        <Link
          href="/"
          className="shrink-0 font-sans text-[0.8125rem] font-bold tracking-[0.18em] text-ink uppercase"
        >
          {t.brand.name}
        </Link>

        <nav className="flex items-center gap-2.5 sm:gap-5">
          {/* Full links from sm up; below that they live in the menu. */}
          {LINKS.filter((l) => l.desktop).map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="eyebrow hidden text-[0.6875rem] font-medium text-ink-soft transition-colors duration-200 hover:text-ink sm:block"
            >
              {l.label}
            </Link>
          ))}

          <span aria-hidden className="hidden h-3 w-px bg-line/60 sm:block" />

          <ThemeToggle />

          <Link href="/login" className="hidden sm:block">
            <motion.span
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              className="eyebrow inline-flex h-7.5 items-center rounded-full bg-ink px-3.5 text-[0.625rem] font-bold tracking-[0.14em] text-ground uppercase shadow-sm transition-colors hover:bg-accent hover:text-accent-ink"
            >
              {t.nav.enter}
            </motion.span>
          </Link>

          {/* Burger, phones only. */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? t.nav.close : t.nav.menu}
            className="grid size-7.5 shrink-0 touch-manipulation place-items-center rounded-full text-ink transition-colors hover:bg-raise sm:hidden"
          >
            <Burger open={open} />
          </button>
        </nav>
      </motion.div>

      <AnimatePresence>
        {open && (
          <motion.div
            id={menuId}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="mt-2 overflow-hidden rounded-3xl border border-line-strong/20 bg-surface/95 p-2 shadow-[0_8px_30px_rgb(0,0,0,0.08)] backdrop-blur-xl sm:hidden"
          >
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                /* Closing on tap rather than watching the pathname in an effect:
                   the tap IS the intent, and it avoids a cascading render. */
                onClick={() => setOpen(false)}
                className="block rounded-2xl px-4 py-3 text-sm font-medium text-ink-soft transition-colors hover:bg-raise hover:text-ink"
              >
                {l.label}
              </Link>
            ))}

            {/*
              Login as a plain row, not a filled button — the CTA button was
              removed from this menu on purpose. Without it phones would have no
              route to sign in at all, since the pill version is sm-and-up.
            */}
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="mt-1 block rounded-2xl border-t border-line/40 px-4 py-3 text-sm font-medium text-accent transition-colors hover:bg-raise"
            >
              {t.nav.enter}
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function ChevronLeft() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.5 3.5 5 8l4.5 4.5" />
    </svg>
  );
}

/** Two rules that cross into an ✕ — the state change is the affordance. */
function Burger({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <motion.path
        animate={open ? { d: "M4 4 L12 12" } : { d: "M2.5 5.5 L13.5 5.5" }}
        transition={{ duration: 0.2 }}
      />
      <motion.path
        animate={open ? { d: "M12 4 L4 12" } : { d: "M2.5 10.5 L13.5 10.5" }}
        transition={{ duration: 0.2 }}
      />
    </svg>
  );
}
