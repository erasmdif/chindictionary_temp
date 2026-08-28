# s:CMS

A static site Content Management System built on [Astro](https://astro.build/), developed and maintained by [LAD: Laboratorio di Archeologia Digitale alla Sapienza](https://lad.saras.uniroma1.it).

## Features

- **Content Collections** — type-safe content management with Zod schema validation (Markdown and MDX)
- **Interactive Maps** — display geographical data with [MapLibre GL JS](https://maplibre.org/) and multiple data sources
- **Data Tables** — sortable, filterable, paginated tables from CSV, JSON, API, or Directus
- **Image Galleries** — responsive galleries with PhotoSwipe lightbox
- **Table of Contents** — auto-generated from page headings with smooth scrolling
- **Diagrams** — Mermaid diagram support
- **Directus Integration** — connect to a [Directus](https://directus.io/) instance for dynamic content
- **SEO** — meta tags, Open Graph, and JSON-LD structured data
- **Fast by default** — 100% static output via Astro
- **Updateable core** — framework code in `core/` is updated independently from your content in `usr/`

---

## Project Structure

```
scms/
├── core/                      # Framework (updateable — do not edit)
│   ├── components/            # DataTb, Map, Gallery, SEO, TableOfContents, …
│   ├── integrations/          # Astro integrations (assets, Directus loader)
│   ├── utils/                 # Helper utilities
│   └── types/                 # TypeScript definitions
│
├── usr/                       # Your site (preserved during updates)
│   ├── content.config.ts      # Collection schemas (Zod)
│   ├── user.config.mjs        # Site configuration (edit this)
│   ├── content/               # Your content files
│   │   ├── blog/              # Blog posts (.md / .mdx)
│   │   ├── docs/              # Documentation pages (.md / .mdx)
│   │   └── data/              # Data files (CSV, JSON, YAML)
│   ├── components/            # Custom components (override core here)
│   ├── layouts/               # Page layouts
│   ├── pages/                 # Astro routes
│   ├── public/                # Static assets
│   └── styles/
│       └── global.css         # Global stylesheet
│
├── astro.config.mjs           # Astro configuration (merges core + user)
├── tsconfig.json
└── package.json
```

---

## Getting Started

### Prerequisites

- Node.js 22 or higher
- npm

### Installation

1. **Create a new repository from the template**

   Go to [github.com/lad-sapienza/sCMS](https://github.com/lad-sapienza/sCMS), click **"Use this template"**, and create a new repository.

2. **Clone and install**

   ```bash
   git clone https://github.com/YOUR-USERNAME/my-site.git
   cd my-site
   npm install
   ```

3. **Start the development server**

   ```bash
   npm run dev
   ```

   The site is available at **http://localhost:4321**.

---

## Minimum Configuration

Open `usr/user.config.mjs` and fill in your site details:

```js
export const userConfig = {
  site: 'https://yourdomain.com',   // full URL of your published site
  // base: '/my-repo',              // uncomment if not deployed at root (e.g. GitHub Pages subpath)
};

export const siteMetadata = {
  title: 'My Site',
  description: 'A short description used by search engines.',
  author: 'Your Name',
  siteName: 'My Site',
  defaultImage: '/images/social-preview.png',
};
```

For styling, edit `usr/styles/global.css`. For the navigation menu, edit the `menuItems` array in `usr/layouts/BaseLayout.astro`.

### Directus (optional)

If you connect to a Directus instance, create a `.env` file in the project root:

```env
PUBLIC_DIRECTUS_URL=https://your-directus-instance.com
PUBLIC_DIRECTUS_TOKEN=your-token
```

---

## Creating Content

Content lives in `usr/content/`. Each subfolder is a collection.

| Folder | Purpose |
|---|---|
| `usr/content/blog/` | Blog posts and news |
| `usr/content/docs/` | Documentation and guides |
| `usr/content/data/` | Data files (CSV, JSON, YAML) |

### Blog post

```markdown
---
title: 'My First Post'
description: 'A short description'
date: 2026-01-01
author: 'Your Name'
tags: ['news']
---

Write your content here.
```

### Documentation page

```markdown
---
title: 'My Page'
description: 'A short description'
order: 1
category: 'guides'
---

Write your content here.
```

Place images in a subfolder next to the content file and reference them with a standard Markdown image tag. s:CMS copies them automatically during build.

For full details see [Managing Content](usr/content/docs/guides/managing-content.md).

---

## Available Components

Import components from `@core` in any `.mdx` file:

```mdx
import { DataTb, Map, Gallery } from '@core';
```

| Component | Description | Documentation |
|---|---|---|
| `DataTb` | Sortable, filterable, paginated data table | [datatb.mdx](usr/content/docs/components/datatb.mdx) |
| `Map` | Interactive map with MapLibre GL JS | [map.mdx](usr/content/docs/components/map.mdx) |
| `Gallery` | Responsive image gallery with lightbox | [gallery.mdx](usr/content/docs/components/gallery.mdx) |
| `SEO` | Meta tags, Open Graph, JSON-LD | [seo.md](usr/content/docs/components/seo.md) |
| `TableOfContents` | Auto-generated TOC from headings | [tableofcontents.md](usr/content/docs/components/tableofcontents.md) |
| `ZoteroGeoViewer` | Zotero library visualised on a map | [zotero-geoviewer.mdx](usr/content/docs/components/zotero-geoviewer.mdx) |

---

## Directus Integration

Use the built-in loader to pull content from Directus into a collection:

```ts
// usr/content.config.ts
import { directusLoader } from '@core/integrations/directusLoader';

const articles = defineCollection({
  loader: directusLoader({
    table: 'articles',
    fields: ['id', 'title', 'body', 'date_created'],
    sort: ['-date_created'],
  }),
});
```

Use Directus data sources directly in `DataTb` or `Map` components — see their documentation pages linked above.

---

## Scaffolding Scripts

Two CLI scripts help you add content without editing config files by hand.

### `npm run add-collection`

Scaffolds a complete new content collection: updates `usr/content.config.ts`, creates a sample content file, and generates listing and detail page templates.

### `npm run add-content`

Adds a single content file to an existing collection, prompting for frontmatter fields based on the Zod schema.

---

## Build and Deploy

```bash
npm run build     # production build → dist/
npm run preview   # local preview of the production build
```

For deployment to GitHub Pages, Netlify, Vercel, or Cloudflare Pages, see [Deployment](usr/content/docs/guides/deployment.md).

---

## Updating the Core

Pull the latest framework updates without touching your `usr/` files:

```bash
npm run update-scms
```

See [Updating](usr/content/docs/guides/updating.md) for details on handling conflicts and site-specific packages.

---

## Documentation

| Guide | File |
|---|---|
| Getting Started | [guides/getting-started.md](usr/content/docs/guides/getting-started.md) |
| Architecture | [guides/architecture.md](usr/content/docs/guides/architecture.md) |
| Managing Content | [guides/managing-content.md](usr/content/docs/guides/managing-content.md) |
| Theming | [guides/theming.md](usr/content/docs/guides/theming.md) |
| Deployment | [guides/deployment.md](usr/content/docs/guides/deployment.md) |
| Updating | [guides/updating.md](usr/content/docs/guides/updating.md) |

---

## License

BSD-0-Clause — see [LICENSE](LICENSE).

---

## Built by LAD

<a href="https://lad.saras.uniroma1.it">
  <img src="https://lad-sapienza.it/images/lad-blue.png" alt="LAD: Laboratorio di Archeologia Digitale alla Sapienza" height="60">
</a>

s:CMS is developed and maintained by [LAD: Laboratorio di Archeologia Digitale alla Sapienza](https://lad.saras.uniroma1.it), Università degli Studi di Roma "La Sapienza".

- GitHub Issues: [lad-sapienza/sCMS](https://github.com/lad-sapienza/sCMS/issues)
- Previous Gatsby version: [lad-sapienza/scms](https://github.com/lad-sapienza/scms)
