"use client";

import { ViewTransition } from "react";
import { usePathname } from "next/navigation";

/**
 * The page transition: the old page lifts away and blurs out, the new one
 * settles up into place, and the header stays put across both.
 *
 * A template rather than the layout because a template remounts on navigation
 * — that remount is what fires `enter` and `exit`. A layout persists, so a
 * ViewTransition there would never see either.
 *
 * ⚠ The room arrives by opacity alone, quickly and with no delay. Its price
 * and bid button must be legible on the frame they arrive — a five-second
 * clock may already be running — so it never slides or blurs in (the same
 * rule AuctionRoom states for its own root). `enter` is read from the NEW
 * page's template, so this is decided by where the navigation is going.
 *
 * `default="none"` keeps it to navigations. A refresh, a Suspense boundary
 * resolving or the room's live updates are not page changes and must not fade
 * the page out. The lot plate's morph (LotCard → LotPreview) is a named pair
 * inside this, so it is captured separately and still flies between pages.
 *
 * The <div> is load-bearing. React names the DOM nodes directly under a
 * ViewTransition itself, and a page that returns its header at the top level
 * would have the header's own `site-header` name overwritten — it would then
 * fade out with the page instead of holding still. One plain block under the
 * boundary takes React's name and leaves the header's alone.
 *
 * A Client Component only to read the path; the pages it wraps stay Server
 * Components. Without View Transitions support the page simply swaps.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const room = usePathname().startsWith("/auction/");
  return (
    <ViewTransition
      enter={room ? "page-fade" : "page-in"}
      exit="page-out"
      default="none"
    >
      <div>{children}</div>
    </ViewTransition>
  );
}
