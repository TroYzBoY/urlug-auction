"use server";

import { refresh } from "next/cache";
import { markAllRead } from "@/lib/repo/notifications";
import { unwatch, watch } from "@/lib/repo/watchlist";
import { currentUser } from "@/lib/session";

/**
 * Following a lot, and clearing the inbox.
 *
 * Both are cheap, idempotent and per-user, so neither is rate-limited and
 * neither returns a message — the button's own state is the feedback. What they
 * do share with every other action here is reading the user from the session
 * rather than from an argument.
 */

export async function toggleWatch(lotId: string, next: boolean): Promise<void> {
  const user = await currentUser();
  // Silently ignored when signed out. The button is only rendered for a
  // signed-in bidder, and a redirect from a background toggle would be worse
  // than nothing happening.
  if (!user) return;

  if (next) await watch(user.id, lotId);
  else await unwatch(user.id, lotId);

  refresh();
}

export async function markNotificationsRead(): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  await markAllRead(user.id);
  refresh();
}
