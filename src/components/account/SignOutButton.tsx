"use client";

import { useFormStatus } from "react-dom";
import { logout } from "@/app/actions/auth";
import { t } from "@/lib/copy";

/**
 * A form, not a link.
 *
 * Signing out is a state change, and a GET that changes state can be triggered
 * by anything that prefetches or crawls the page — including `next/link`'s own
 * prefetching, which would sign a bidder out for hovering the wrong control.
 * The POST a form action makes also carries Next.js's Origin check.
 */
export function SignOutButton() {
  return (
    <form action={logout}>
      <Button />
    </form>
  );
}

function Button() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="eyebrow flex h-10 items-center border border-line px-4 text-muted transition-colors hover:border-rust hover:text-rust disabled:opacity-60"
    >
      {t.account.signOut}
    </button>
  );
}
