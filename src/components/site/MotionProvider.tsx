"use client";

import { MotionConfig } from "framer-motion";

/**
 * Makes framer-motion honour `prefers-reduced-motion`.
 *
 * This is not optional decoration. The reduced-motion block in globals.css only
 * reaches CSS animations and transitions — framer-motion drives its animations
 * from JavaScript, writing inline styles frame by frame, so it sails straight
 * through that media query and keeps moving for users who have asked the whole
 * system to stop. Without this wrapper the site silently ignores an
 * accessibility preference for every animation that is not pure CSS.
 *
 * `reducedMotion="user"` defers to the OS setting: transform and layout
 * animations are dropped, while opacity crossfades are kept (they do not trigger
 * motion sickness, and removing them would strip state changes of any feedback).
 *
 * Client Component because MotionConfig relies on React context, which a Server
 * Component cannot provide. It renders no DOM of its own, so wrapping the whole
 * tree costs one context provider and nothing else — children passed through
 * from the server layout stay server-rendered.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
