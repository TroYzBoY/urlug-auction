"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { LiveDot } from "@/components/lot/LotCard";
import { NotificationBell, type BellItem } from "./NotificationBell";
import { t } from "@/lib/copy";
import { pts } from "@/lib/format";

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
  /* The home is the catalogue now, and the live lot, round ladder, index and
     results live at /overview. It sits in the burger for the same reason
     contact does — the pill is already full at three labels. */
  { href: "/overview", label: t.nav.overview, desktop: false },
  { href: "/contact", label: t.nav.contact, desktop: false },
] as const;

/**
 * `account` is read on the SERVER by whatever renders the header and passed
 * down — this component is a Client Component (it owns the burger menu and the
 * theme toggle), and a client cannot read a session cookie that is httpOnly.
 *
 * Optional, so the pages that have not been converted yet still compile and
 * simply render the signed-out header.
 */
export interface HeaderAccount {
  paddle: string;
  balancePts: number;
  isStaff: boolean;
}

/** What the bell needs: the recent list, and how many of them are unread. */
export interface HeaderNotifications {
  items: BellItem[];
  unread: number;
}

export function Header({
  minimal = false,
  account = null,
  notifications = null,
}: {
  minimal?: boolean;
  account?: HeaderAccount | null;
  notifications?: HeaderNotifications | null;
}) {
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
              Explicit way out of the room. The wordmark leads to the catalogue
              too, but a bidder deep in a live sale does not read a logo as
              "exit" — and on a phone there is no visible browser back button to
              fall back on.
            */}
            <Link
              href="/lots"
              aria-label={t.nav.back}
              className="border-line-strong/30 text-ink-soft hover:border-accent hover:text-accent flex h-8 shrink-0 items-center gap-1.5 rounded-full border pr-2.5 pl-2 transition-colors"
            >
              <ChevronLeft />
              <span className="eyebrow hidden text-[0.625rem] sm:inline">
                {t.nav.back}
              </span>
            </Link>

            <Link
              href="/lots"
              className="text-ink min-w-0 truncate font-sans text-xs font-bold tracking-[0.2em] uppercase"
            >
              {t.brand.name}
            </Link>
          </div>

          <span className="eyebrow text-rust flex shrink-0 items-center gap-1.5 text-[0.625rem] font-semibold sm:text-[0.6875rem]">
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
        className="border-line-strong/20 bg-surface/85 flex h-11 items-center justify-between rounded-full border px-3.5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl transition-colors duration-300 sm:px-5"
      >
        <Link
          href="/lots"
          className="text-ink shrink-0 font-sans text-[0.8125rem] font-bold tracking-[0.18em] uppercase"
        >
          {t.brand.name}
        </Link>

        <nav className="flex items-center gap-2.5 sm:gap-5">
          {/* Full links from sm up; below that they live in the menu. */}
          {LINKS.filter((l) => l.desktop).map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="eyebrow text-ink-soft hover:text-ink hidden text-[0.6875rem] font-medium transition-colors duration-200 sm:block"
            >
              {l.label}
            </Link>
          ))}

          <span aria-hidden className="bg-line/60 hidden h-3 w-px sm:block" />

          {notifications && (
            <NotificationBell
              items={notifications.items}
              unread={notifications.unread}
            />
          )}

          {/*
            Staff only, and the desktop counterpart of the entry already in the
            burger menu. An operator moves between the floor and the catalogue
            constantly — watching a lot behave, then going to close or reprice
            it — and until now the only way across on a desktop was to type the
            URL. Outlined rather than filled: it is a door, not the thing the
            page is for.
          */}
          {account?.isStaff && (
            <Link href="/admin" className="hidden sm:block">
              <motion.span
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                className="eyebrow border-accent/45 text-accent hover:bg-accent hover:text-accent-ink inline-flex h-7.5 items-center rounded-full border px-3 text-[0.625rem] font-bold tracking-[0.14em] uppercase transition-colors"
              >
                {t.admin.title}
              </motion.span>
            </Link>
          )}

          {account ? (
            /* Signed in: the paddle and the balance, linking to the profile.
               The balance is here because it is the number that decides whether
               a bidder can act, and hunting for it mid-sale is the wrong time
               to discover it is empty. */
            <Link href="/profile" className="hidden sm:block">
              <motion.span
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                data-numerals
                className="border-line-strong/30 text-ink-soft hover:border-accent hover:text-accent inline-flex h-7.5 items-center gap-2 rounded-full border px-3 text-[0.6875rem] font-medium transition-colors"
              >
                <span>{account.paddle}</span>
                <span aria-hidden className="bg-line/60 h-3 w-px" />
                <span className="text-flare font-semibold">
                  {pts(account.balancePts)}
                </span>
              </motion.span>
            </Link>
          ) : (
            <Link href="/login" className="hidden sm:block">
              <motion.span
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                className="eyebrow bg-ink text-ground hover:bg-accent hover:text-accent-ink inline-flex h-7.5 items-center rounded-full px-3.5 text-[0.625rem] font-bold tracking-[0.14em] uppercase shadow-sm transition-colors"
              >
                {t.nav.enter}
              </motion.span>
            </Link>
          )}

          {/* Burger, phones only. */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? t.nav.close : t.nav.menu}
            className="text-ink hover:bg-raise grid size-7.5 shrink-0 touch-manipulation place-items-center rounded-full transition-colors sm:hidden"
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
            className="border-line-strong/20 bg-surface/95 mt-2 overflow-hidden rounded-3xl border p-2 shadow-[0_8px_30px_rgb(0,0,0,0.08)] backdrop-blur-xl sm:hidden"
          >
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                /* Closing on tap rather than watching the pathname in an effect:
                   the tap IS the intent, and it avoids a cascading render. */
                onClick={() => setOpen(false)}
                className="text-ink-soft hover:bg-raise hover:text-ink block rounded-2xl px-4 py-3 text-sm font-medium transition-colors"
              >
                {l.label}
              </Link>
            ))}

            {/*
              Login as a plain row, not a filled button — the CTA button was
              removed from this menu on purpose. Without it phones would have no
              route to sign in at all, since the pill version is sm-and-up.
            */}
            {account ? (
              <>
                {account.isStaff && (
                  <Link
                    href="/admin"
                    onClick={() => setOpen(false)}
                    className="border-line/40 text-ink-soft hover:bg-raise hover:text-ink mt-1 block rounded-2xl border-t px-4 py-3 text-sm font-medium transition-colors"
                  >
                    {t.admin.title}
                  </Link>
                )}
                <Link
                  href="/wallet"
                  onClick={() => setOpen(false)}
                  className="text-ink-soft hover:bg-raise hover:text-ink block rounded-2xl px-4 py-3 text-sm font-medium transition-colors"
                >
                  {t.account.walletTitle}
                </Link>
                <Link
                  href="/profile"
                  onClick={() => setOpen(false)}
                  className="border-line/40 text-accent hover:bg-raise mt-1 flex items-center justify-between rounded-2xl border-t px-4 py-3 text-sm font-medium transition-colors"
                >
                  <span data-numerals>{account.paddle}</span>
                  <span data-numerals className="text-flare">
                    {pts(account.balancePts)} {t.common.point}
                  </span>
                </Link>
              </>
            ) : (
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="border-line/40 text-accent hover:bg-raise mt-1 block rounded-2xl border-t px-4 py-3 text-sm font-medium transition-colors"
              >
                {t.nav.enter}
              </Link>
            )}
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
