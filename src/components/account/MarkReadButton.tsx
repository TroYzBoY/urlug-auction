"use client";

import { useFormStatus } from "react-dom";
import { markNotificationsRead } from "@/app/actions/watch";
import { t } from "@/lib/copy";

/** A form, not a link — marking read is a state change. */
export function MarkReadButton() {
  return (
    <form action={markNotificationsRead}>
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
      className="eyebrow text-accent transition-opacity hover:opacity-75 disabled:opacity-50"
    >
      {t.account.markRead}
    </button>
  );
}
