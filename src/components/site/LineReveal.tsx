"use client";

import { motion } from "framer-motion";

/**
 * Cinematic type entrance: each line rises out from behind a mask, one after
 * the other, the way a title card resolves.
 *
 * The mask is what separates this from a plain fade — the line does not appear
 * *through* the background, it travels up from behind a hard edge. That reads as
 * deliberate staging rather than a page loading.
 *
 * Each line needs its own overflow-hidden wrapper, so the caller passes an array
 * of strings rather than one block of text: line breaks are a typographic
 * decision here, not something to leave to the browser.
 */
export function LineReveal({
  lines,
  className = "",
  lineClassName = "",
  delay = 0,
  stagger = 0.09,
  as: Tag = "h1",
}: {
  lines: React.ReactNode[];
  className?: string;
  lineClassName?: string;
  delay?: number;
  stagger?: number;
  as?: "h1" | "h2" | "p" | "div";
}) {
  return (
    <Tag className={className}>
      {lines.map((line, i) => (
        /* pb/-mb pair: descenders (у, ф, р) would be sliced by the mask
           otherwise, since overflow-hidden clips at the line box. */
        <span key={i} className="block overflow-hidden pb-[0.12em] -mb-[0.12em]">
          <motion.span
            initial={{ y: "110%" }}
            animate={{ y: 0 }}
            transition={{
              duration: 0.9,
              delay: delay + i * stagger,
              ease: [0.16, 1, 0.3, 1],
            }}
            className={`block ${lineClassName}`}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}
