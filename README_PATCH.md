# CHIN-DICTIONARY — Latin Analysis HTML/entity cache fix

Incremental drag-and-drop patch.

## Files changed
- `usr/pages/data/latin-analysis-corpus.json.ts`
- `usr/components/analysis/LatinAnalysis.tsx`

## What it fixes
`occ.latin_definition_2` contains HTML markup plus HTML entities such as `&sect;`, `&ccedil;`, `&macr;`, `&circ;`, `&nbsp;` and `&rsquo;`.

The corpus endpoint now:
1. strips structural HTML markup;
2. decodes named/numeric HTML entities before tokenisation;
3. lets `§` act as an analytic boundary;
4. lets decoded romanisations such as `çien¯` be rejected as complete tokens.

The previous endpoint was also served with `Cache-Control: public, max-age=3600`. The browser could therefore keep using a stale pre-fix corpus for one hour even after restarting Astro. This patch:
- requests the corpus with `cache: 'no-store'`;
- adds an analysis-schema query key to force a fresh cache key;
- changes the dev/API response header to `Cache-Control: no-store, max-age=0`.

No Directus schema, core s:CMS file, or database content is changed.
