"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { markNotificationsRead } from "@/app/actions/watch";
import { lotDate } from "@/lib/format";
import { t } from "@/lib/copy";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BELL
 *
 * A count, and a panel that shows what the count was about.
 *
 * ── Opening is what marks them read ──────────────────────────────────────────
 *
 * There is no "mark all as read" button. A button like that asks the reader to
 * do bookkeeping the interface can do by watching them: they opened the panel,
 * the notifications were in front of them, they are read. The one it used to
 * live on has been removed from the profile page rather than kept as a second
 * way to do the same thing.
 *
 * ── The badge clears before the server answers ───────────────────────────────
 *
 * `dismissed` drops the count the moment the panel opens, and the write is sent
 * in a transition behind it. A badge that lingered for the length of a round
 * trip would read as "it did not work", and the failure it would be honest
 * about — the write not landing — is one the next page load corrects anyway.
 *
 * The unread MARKS on the rows do not clear, and keeping them takes work:
 * `markNotificationsRead` ends in `refresh()`, so the server re-renders and
 * hands this component a fresh list in which nothing is unread any more. The
 * rows would go plain under the reader's eyes, mid-read, which is the one
 * moment the marks are load-bearing. So the set is frozen when the panel opens
 * and the frozen copy is what the rows are drawn from.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface BellItem {
  id: number;
  body: string;
  href: string | null;
  createdAt: string;
  unread: boolean;
}

export function NotificationBell({
  items,
  unread,
}: {
  items: BellItem[];
  unread: number;
}) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  /* Which ids were unread when the panel was first opened. See above. */
  const [frozen, setFrozen] = useState<Set<number> | null>(null);
  const [, startTransition] = useTransition();
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);

  const badge = dismissed ? 0 : unread;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;

    if (frozen === null) {
      setFrozen(new Set(items.filter((i) => i.unread).map((i) => i.id)));
    }
    if (unread > 0 && !dismissed) {
      setDismissed(true);
      startTransition(() => {
        void markNotificationsRead();
      });
    }
  }

  /*
   * Escape, and a click anywhere outside. Both are registered only while the
   * panel is open — a document-level listener that lives for the whole session
   * so that a closed panel can ignore it is a listener on every click a bidder
   * ever makes.
   */
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };

    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={
          badge > 0
            ? `${t.account.notifications} — ${badge} ${t.account.notificationsNew}`
            : t.account.notifications
        }
        className="text-ink-soft hover:bg-raise hover:text-ink relative grid size-8 touch-manipulation place-items-center rounded-full transition-colors"
      >
        <BellIcon ringing={badge > 0} />
        {badge > 0 && (
          <span
            aria-hidden
            data-numerals
            className="bg-rust text-ground absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full px-1 text-[0.5625rem] font-bold"
          >
            {badge > t.account.unreadCap ? `${t.account.unreadCap}+` : badge}
          </span>
        )}
      </button>

      {open && (
        <motion.div
          id={panelId}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          /*
           * Anchored to the right so it cannot push the viewport wide on a
           * phone, and capped in height so a long backlog scrolls inside the
           * panel rather than running off the screen.
           */
          className="border-line-strong/30 bg-surface/95 absolute top-10 right-0 z-50 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border shadow-[0_12px_40px_rgb(0,0,0,0.35)] backdrop-blur-xl"
        >
          <p className="eyebrow border-line/60 text-ink border-b px-4 py-3">
            {t.account.notifications}
          </p>

          {items.length === 0 ? (
            <p className="text-muted px-4 py-5 text-sm">
              {t.account.notificationsEmpty}
            </p>
          ) : (
            <ul className="max-h-[min(24rem,60vh)] overflow-y-auto">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="border-line/40 border-b last:border-0"
                >
                  <Row
                    item={item}
                    unread={frozen ? frozen.has(item.id) : item.unread}
                    onNavigate={() => setOpen(false)}
                  />
                </li>
              ))}
            </ul>
          )}

          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="eyebrow border-line/60 text-accent hover:bg-raise block border-t px-4 py-3 transition-colors"
          >
            {t.account.notificationsAll}
          </Link>
        </motion.div>
      )}
    </div>
  );
}

function Row({
  item,
  unread,
  onNavigate,
}: {
  item: BellItem;
  unread: boolean;
  onNavigate: () => void;
}) {
  const body = (
    <>
      <span className="flex items-start gap-2.5">
        {/*
          The unread mark, kept after opening — see the note at the top.
          A dot alone was too quiet at this size against a dark panel, so an
          unread row carries a tint as well; the dot is what a colour-blind
          reader has, the tint is what everyone else notices first.
        */}
        <span
          aria-hidden
          className={`mt-1.5 size-2 shrink-0 rounded-full ${
            unread ? "bg-flare" : "bg-transparent"
          }`}
        />
        <span className={unread ? "text-ink font-medium" : "text-muted"}>
          {item.body}
        </span>
      </span>
      <span data-numerals className="text-faint mt-1 block pl-4.5 text-xs">
        {lotDate(item.createdAt)}
      </span>
    </>
  );

  const className = `block px-4 py-3 text-sm leading-relaxed transition-colors ${
    unread ? "bg-flare/6" : ""
  }`;

  return item.href ? (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`${className} hover:bg-raise`}
    >
      {body}
    </Link>
  ) : (
    <span className={className}>{body}</span>
  );
}

function BellIcon({ ringing }: { ringing: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden
      className="size-4.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 2.6a4.6 4.6 0 0 0-4.6 4.6c0 3.2-1 4.4-1.6 5 -.3.3-.1.9.4.9h11.6c.5 0 .7-.6.4-.9 -.6-.6-1.6-1.8-1.6-5A4.6 4.6 0 0 0 10 2.6Z" />
      <path d="M8.3 15.6a1.8 1.8 0 0 0 3.4 0" />
      {ringing && (
        <path d="M3.4 5.2a6 6 0 0 1 1.6-2.4M16.6 5.2a6 6 0 0 0-1.6-2.4" />
      )}
    </svg>
  );
}
