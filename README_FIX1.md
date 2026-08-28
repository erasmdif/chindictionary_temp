# CHIN dictionary patch — fix 1

This hotfix replaces only:

`usr/pages/data/dictionary-index.json.ts`

It does not modify `.env`, `core/`, `usr/content.config.ts`, `astro.config.mjs`, package files, or Git configuration.

## Why

The first version requested a deeply expanded Directus response from `occ` using fields such as `word.chinese_id.car` and `word.rom_id.rom`. A restricted read-only policy can allow the individual collections while rejecting a nested field expansion with HTTP 403.

The new endpoint:

1. reads `occ`, `chinese_rom`, `chinese`, and `rom` separately;
2. requests only top-level fields;
3. joins the records in Astro;
4. paginates the Directus reads;
5. if Directus rejects an explicit field list with `403`, retries that collection without the field list so Directus can return only fields visible to the token;
6. reports the specific collection if even the flat read is forbidden.

## Install

Drag the `usr/` directory into the root of the existing project and overwrite the one file when prompted.

Then stop the development server if it is running and restart it:

```bash
npm run dev
```

Test:

- http://localhost:4321/data/dictionary-index.json
- http://localhost:4321/dictionary
- http://localhost:4321/characters

The JSON endpoint is useful for diagnosis. Its first-level keys should include `generatedAt`, `count`, and `data`.
