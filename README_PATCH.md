# CHIND Documentation — Analysis annotated callouts fix

Incremental drag&drop patch to apply **after** `chind_documentation_analysis_patch.zip`.

## What changes

The five Latin Analysis documentation screenshots now use the same annotation system already adopted by Dictionary, Index and Character Detail:

- numbered callout buttons placed around the screenshot;
- connector lines pointing to the exact UI area;
- clicking a callout jumps to the corresponding short explanation below;
- the target explanation briefly flashes for orientation.

Annotated figures added for:

1. common Filter bar;
2. common Analysis Note sidebar;
3. Overview;
4. Explore words;
5. Compare sections.

The descriptions remain intentionally short and operational. Detailed methodological interpretation stays inside the Analysis Note panel of the analytical application itself.

## Files overwritten

- `usr/pages/documentation.astro`
- `usr/components/documentation/documentation.css`

The five Analysis screenshots are included again under `usr/public/images/chind/documentation/` so the patch is self-contained.

No `core/**`, Directus endpoint, analysis logic, s:CMS configuration or database structure is modified.
