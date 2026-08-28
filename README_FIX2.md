# CHIN Dictionary — Fix 2: lightweight previews

This patch reduces the amount of data loaded for the basic browse pages.

## What changes

- `/dictionary` requests only `occ` records whose printed `page` is between 1 and 5.
- Related `chinese_rom`, `chinese`, and `rom` rows are fetched only for IDs referenced by those preview occurrences.
- `/characters` shows at most the first 100 unique characters, ordered by their first appearance in the printed dictionary preview.
- No Directus/core/configuration file is changed.

## Files replaced

- `usr/pages/data/dictionary-index.json.ts`
- `usr/components/dictionary/DictionaryBrowser.tsx`
- `usr/components/dictionary/CharacterBrowser.tsx`

## Install

Drag the `usr/` folder from this patch into the project root and allow overwrite.
Then restart the development server:

```bash
Ctrl+C
npm run dev
```

No `npm install` or `npm ci` is required.

## Important scope note

At this stage the search/filter controls operate on the published preview subset only (dictionary pages 1–5; maximum 100 characters in the character browse view). This is intentional to keep the basic browsing layer lightweight. A later step can add server-side/on-demand full-corpus search without making the initial page download the entire database.
