# Original URLUG design — before the neon redesign

The user explicitly requested that the previous design be preserved because they
may ask to return to it. Keep this snapshot until they choose to remove it.

`original-files.zip` contains the exact original bytes of every existing file
changed for the Edgerunners-inspired redesign. It contains no environment files,
credentials, database contents, or dependencies. `manifest.json` records the
original commit and SHA-256 checksums. `redesign-files.json` records the completed
redesign's checksums so later edits can be identified before restoring anything.

The original design used a warm brown ground (`#26170f`), brown cards (`#241c16`),
cream text (`#f6f1e8`), and amber accents (`#c48b48`). It had a narrow floating pill
header, a plain catalogue title, unboxed card descriptions, and a narrow sign-in
form. The font stack, catalogue data, auction behavior, and navigation destinations
were preserved in the redesign.

## Restore the original design

When the user asks to revert:

1. Compare the current files against `redesign-files.json`. Preserve any later
   changes before restoring; do not run a blanket `git reset` or `git restore .`.
2. Extract `original-files.zip` to a temporary directory. Verify its files against
   the SHA-256 values in `manifest.json`.
3. Copy only the paths listed in `manifest.json` back into the project. These are
   the exact previous design files, including the old global styles, catalogue,
   header, cards, authentication components, icons, about-page palette, and
   `src/lib/copy.ts`.
4. `src/app/edgerunners.css` and `src/components/lot/CatalogueHero.tsx` were newly
   added. After restoration they are no longer imported, so they can be retained
   as unused references or removed if unchanged.
5. Keep this backup, unrelated files, local environment configuration, and database
   contents intact. The untracked `e2e/award.spec.ts` existed before the redesign
   and must not be removed as part of reverting it.
6. Run `npm run typecheck`, `npm run build`, and inspect `/lots` and `/login`.

Visual review screenshots from the redesign are in `test-results/design-review/`
(local, ignored by Git). This backup directory is excluded from Docker images.

## Current cyan and purple design

The latest requested design pairs cyan (`#47eaff`) with vivid purple (`#8338ff`)
on a dark navy ground (`#080b16`). It adds a featured catalogue hero and search,
wraps catalogue filters on narrow screens, and keeps the compact navigation menu
through tablet widths so account controls fit. Full header navigation begins at
1024px. Shared colors also cover the lot cards, authentication pages, icons, and
about page.

Keep all three archives: `original-files.zip` preserves the original warm design;
`pink-first-pass.zip` preserves the first pink version of `globals.css`,
`edgerunners.css`, and the catalogue page; `before-cyan-purple-redesign.zip`
preserves the later neon version before the cyan and purple redesign.
`redesign-files.json` records the latest completed design's file checksums.
