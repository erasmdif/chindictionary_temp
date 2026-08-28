# s:CMS Astro Development Guide

## Architecture Overview

s:CMS is a static CMS built on Astro with a **strict separation between core system and user code**:

- **`core/`**: Framework components, layouts, and utilities (updateable, do not edit directly)
- **`usr/`**: User content, custom components, and configurations (edit freely)

This separation allows users to update core functionality via `npm run update-scms` without losing customizations. The update script protects `usr/` and merges `.github/` (user files are preserved, upstream `copilot-instructions.md` wins).

### Path Aliases

Always use these TypeScript aliases for imports:
- `@core/*` → `core/*` (framework components/utils)
- `@user/*` → `usr/*` (user code)
- `@components/*` → `usr/components/*`
- `@layouts/*` → `usr/layouts/*`
- `@content/*` → `usr/content/*`

Example: `import { DataTb } from '@core/components/DataTb'`

## Configuration System

### Merged Config Pattern
[astro.config.mjs](astro.config.mjs) merges core settings with [usr/user.config.mjs](usr/user.config.mjs). When modifying:
- Core settings go in `astro.config.mjs` (integrations, srcDir, aliases)
- User overrides go in `usr/user.config.mjs` (site URL, custom integrations)
- Arrays like `integrations` and `vite.resolve.dedupe` are spread-merged, not replaced

`usr/user.config.mjs` exports two objects:
- `userConfig` — Astro config overrides (`site`, `integrations`, `vite`, `markdown`)
- `siteMetadata` — SEO/social metadata (`title`, `description`, `author`, `defaultImage`, `twitter`, etc.)

### Core Integrations (always active)
- `contentAssetsIntegration` — serves co-located content assets (images, PDFs) from `usr/content/` without a manual copy step
- `astro-expressive-code` with `pluginLineNumbers` — syntax-highlighted code blocks
- `@astrojs/mdx`, `@astrojs/react`, `@astrojs/sitemap`

### Content Collections
[usr/content.config.ts](usr/content.config.ts) defines schemas with Zod validation. Use `glob` loader for local files, `directusLoader` from `core/integrations/directusLoader.ts` for CMS data.

## Core Components

### Available Components

| Component | Export(s) | Requires Astro wrapper? |
|---|---|---|
| `BSNavbar` | `default BSNavbar` | No — pure React, use `client:load` |
| `DataTb` | `DataTb`, `CsvSource`, `JsonSource`, `DirectusSource`, `ApiSource` | Yes — `.astro` wrapper available |
| `Gallery` | `GalleryAstro`, `Gallery`, `GalleryMdx`, `processGalleryImages` | Yes — `.astro` wrapper available |
| `Map` | `MapComponent` | No — pure React, use `client:idle` |
| `Map/Search` | `SearchUI`, `SearchUISimple`, `SearchUIAdvanced` | No — pure React |
| `Record` | `RecordProvider`, `Field`, `Image`, `RecordFetcher`, `useRecordFetcher`, `getValueByDotPath` | No — pure React |
| `SEO` | `default SEO` | Astro component |
| `TableOfContents` | `default TableOfContents` | Astro component |
| `ZoteroGeoViewer` | `ZoteroGeoViewer` | Yes — `.astro` wrapper available |

All exports are available via `@core` (from [core/index.ts](core/index.ts)).

### Hybrid Rendering Architecture
Interactive components use a **React client** pattern. Some also have an **Astro wrapper** for SSR data fetching:

1. **Astro wrapper** (e.g., [core/components/DataTb/DataTb.astro](core/components/DataTb/DataTb.astro)) handles SSR data fetching
2. **React component** (e.g., [core/components/DataTb/DataTb.tsx](core/components/DataTb/DataTb.tsx)) provides interactivity
3. **MDX wrapper** (e.g., [core/components/DataTb/DataTbMdx.tsx](core/components/DataTb/DataTbMdx.tsx)) wraps React for MDX use

Components without an Astro wrapper (BSNavbar, Map, Record, SearchUI*) are used directly as React components with a `client:` directive.

### Component Directory Structure
```
components/DataTb/
├── DataTb.astro       # SSR wrapper (not all components have this)
├── DataTb.tsx         # React client component
├── DataTbMdx.tsx      # MDX-compatible wrapper (not all components have this)
├── types.ts           # TypeScript interfaces
├── utils.ts           # Helper functions
├── index.ts           # Public exports
└── README.md          # Component docs
```

### Data Source Abstraction
[core/utils/data-fetcher.ts](core/utils/data-fetcher.ts) re-exports `SourceConfig` from [core/components/DataTb/types.ts](core/components/DataTb/types.ts). Used by DataTb and Map vector layers:

```typescript
type SourceConfig =
  | { type: 'csv';     url: string; delimiter?: string; skipRows?: number; lng?: string; lat?: string }
  | { type: 'json';    url?: string; data?: DataRow[] }
  | { type: 'directus'; collection: string; config: { url: string; token: string }; filter?: ...; fields?: ...; limit?: number; ... }
  | { type: 'api';     url: string; method?: 'GET'|'POST'; headers?: ...; transformer?: (data) => DataRow[] }
  | { type: 'geojson'; url?: string; data?: any }
  | { type: 'vector';  url?: string }
```

**Shorthand for DataTb and Map**: components accept a `directus` prop of type `DirectusShorthand` for convenience:
```typescript
interface DirectusShorthand {
  table: string;
  queryString?: string; // e.g. "filter[status][_eq]=published&limit=10"
  url?: string;         // defaults to PUBLIC_DIRECTUS_URL env var
  token?: string;       // defaults to PUBLIC_DIRECTUS_TOKEN env var
}
```

## Key Development Workflows

### Running the Dev Server
```bash
npm run dev              # Start dev server at localhost:4321
npm run build            # Type-check + production build
npm run preview          # Preview production build
npm run setup-upstream   # Configure upstream remote for updates
npm run update-scms      # Pull latest core from upstream
```

### Working with Directus
1. Set environment variables in `.env` (never committed):
   ```
   PUBLIC_DIRECTUS_URL=https://your-instance.com
   PUBLIC_DIRECTUS_TOKEN=your-token
   ```
   Note: variables must be prefixed `PUBLIC_` to be accessible client-side.
2. Use `directusLoader` in content collections for build-time data
3. Use the `directus` shorthand prop on `DataTb` or `Map` for runtime data
4. Directus SDK (`@directus/sdk`) is used internally in [core/utils/data-fetcher.ts](core/utils/data-fetcher.ts)

### Adding New Core Components
1. Create component directory in `core/components/NewComponent/`
2. Export from [core/index.ts](core/index.ts) for user access
3. If interactive: create a `.tsx` React component with a `client:` directive
4. If it needs SSR data: add an `.astro` wrapper and optionally a `Mdx.tsx` variant
5. Add TypeScript types to `types.ts`, document in `README.md`

### Customizing for Users
Users extend core by:
- Importing core components: `import { DataTb } from '@core'`
- Creating custom components in `usr/components/`
- Modifying `usr/layouts/` to wrap or replace core layouts
- Adding styles in `usr/styles/global.css`

## TypeScript Conventions

- Strict mode enabled (`strictNullChecks: true`)
- Use Zod for runtime validation in content schemas
- Export types from component `types.ts` files
- React components use `type` imports: `import type { DataTbProps } from './types'`

## Styling Approach

- **Bootstrap 5** is the CSS framework (`bootstrap` package)
- Global styles in `usr/styles/global.css` — imports Bootstrap and defines CSS custom properties overriding Bootstrap defaults (`--bs-primary`, `--bs-body-font-family`, etc.)
- There is **no** `core/styles/` directory; all styles live under `usr/`
- Components use Bootstrap utility classes and component classes (e.g. `navbar`, `card`, `btn-primary`)
- `sass` is available as a dev dependency for custom SCSS
- `lucide-react` is available for icons

## Critical Files

- [astro.config.mjs](astro.config.mjs): Main config with merge logic
- [usr/user.config.mjs](usr/user.config.mjs): User overrides (`userConfig`) and site metadata (`siteMetadata`)
- [usr/content.config.ts](usr/content.config.ts): Content collection schemas
- [core/index.ts](core/index.ts): Core package exports
- [core/utils/data-fetcher.ts](core/utils/data-fetcher.ts): Unified data loading
- [core/utils/directus-config.ts](core/utils/directus-config.ts): `DirectusShorthand` and `DirectusSourceConfig` types
- [core/integrations/contentAssetsIntegration.ts](core/integrations/contentAssetsIntegration.ts): Co-located asset serving
- [core/integrations/directusLoader.ts](core/integrations/directusLoader.ts): Astro content loader for Directus

## Common Pitfalls

- **Don't edit `core/` directly** in user projects; changes will be lost on updates
- **Always use path aliases** (`@core`, `@user`) instead of relative paths
- **BSNavbar needs `client:load`** (not `client:idle`) because it controls toggle state immediately on render
- **Map and Search components** have no Astro wrapper — use them directly with `client:idle`
- **Directus env vars must be `PUBLIC_`-prefixed** (`PUBLIC_DIRECTUS_URL`, `PUBLIC_DIRECTUS_TOKEN`) for client-side access
- **Stringify source objects** in `useEffect` deps to prevent infinite re-renders (see [DataTb.tsx](core/components/DataTb/DataTb.tsx))
- **`contentAssetsIntegration`** handles images co-located in `usr/content/` — no need to copy them to `public/`
