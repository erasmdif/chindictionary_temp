# CHIND Dictionary — global search + direct page jump + editorial fallback

Incremental drag-and-drop patch. Copy the `usr/` folder over the project root.

## Changes

1. `/dictionary/` search is now global for occurrence-backed Chinese characters and romanisations. The compact search index is generated from Directus at build time and fetched lazily only when the user starts typing. Search results link directly to the matching page and line.
2. The toolbar `dsl-page-label` is now an editable page-number control. Type a page number and press Enter to jump directly to it.
3. Editorial/empty rows now also recognise `chinese_rom.id = 249` (`NULL/NULL`) and `chinese_rom.id = 9696` (`change_radical/change_radical`), plus equivalent sentinel pairs. They use the existing radical-reconstruction rule: if a later normal line exists on the same page, show the next content row's `occ.radical`; otherwise keep the cell empty.

## Files

Modified (CHIND-created):
- `usr/components/dictionary/DictionaryPageBrowser.tsx`
- `usr/components/dictionary/dictionary-page.css`

New:
- `usr/pages/data/dictionary/search-index.json.ts`

No original sCMS/core files are modified.
