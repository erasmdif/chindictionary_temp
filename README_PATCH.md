# CHIND — Text Comparison UI refinement

Incremental patch for the already installed Text Comparison tool.

## Changes

- Refines the Text Comparison visual language to better match Dictionary / Character Detail.
- Keeps the comparison workspace at a controlled viewport-relative height.
- Gives the compared text and Scholarly Inspector independent internal scrollbars.
- Automatically scrolls the inspector back to the top when a newly selected token is opened.
- Adds contextual inspector actions:
  - Character record
  - first available Dictionary locus
  - Character Index
  - historical glyph source when available
  - first / second component records for disyllabic units
- Adds a new verbal **Text comparison** section to `/documentation` (no infographic yet).

## Files overwritten

- `usr/components/text-comparison/TextComparison.tsx`
- `usr/components/text-comparison/text-comparison.css`
- `usr/pages/documentation.astro`

## Not changed

- No Directus query or endpoint changes.
- No `core/**` files.
- No original sCMS `.ts`, `.tsx` or `.mjs` files.
- No package changes or new dependencies.

Restart after drag & drop:

```bash
env -u DIRECTUS_TOKEN -u DIRECTUS_URL npm run dev
```
