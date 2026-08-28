#!/usr/bin/env node
// add-collection.mjs — Scaffold a new Astro content collection in s:CMS
// Usage: node scripts/add-collection.mjs
//    or: npm run add-collection

import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR    = join(__dirname, '..');
const CONFIG_FILE = join(ROOT_DIR, 'usr', 'content.config.ts');

// ─── Color helpers ────────────────────────────────────────────────────────────
const G = '\x1b[32m', Y = '\x1b[33m', R = '\x1b[31m';
const B = '\x1b[1m',  X = '\x1b[0m';
const ok    = (...a) => console.log(`${G}✔${X}  ${a.join(' ')}`);
const warn  = (...a) => console.log(`${Y}⚠${X}  ${a.join(' ')}`);
const error = (...a) => { console.error(`${R}✖${X}  ${a.join(' ')}`); process.exit(1); };

if (!existsSync(CONFIG_FILE)) error(`Cannot find ${CONFIG_FILE} — are you running from the project root?`);

// ─── Readline helper ──────────────────────────────────────────────────────────
const rl  = createInterface({ input: process.stdin, output: process.stdout });
rl.on('SIGINT', () => { console.log(''); process.exit(0); });
const ask = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

// ─── Schema fields per collection type ───────────────────────────────────────
const SCHEMA = {
  blog: [
    '    title: z.string(),',
    '    description: z.string(),',
    '    date: z.coerce.date(),',
    '    author: z.string().optional(),',
    '    tags: z.array(z.string()).optional(),',
    '    image: z.string().optional(),',
    '    draft: z.boolean().optional(),',
  ].join('\n'),
  docs: [
    '    title: z.string(),',
    '    description: z.string().optional(),',
    '    order: z.number().optional(),',
    '    category: z.string().optional(),',
    '    draft: z.boolean().optional(),',
  ].join('\n'),
  generic: [
    '    title: z.string(),',
    '    description: z.string().optional(),',
    '    draft: z.boolean().optional(),',
  ].join('\n'),
};

// ─── Page templates ───────────────────────────────────────────────────────────
// __COL__ is substituted with the collection name after the template is defined.
// Inside templates: \` → ` and \${ → ${ so JS doesn't interpolate them.
// \\ → \ in the output (needed for JS regex /\.mdx?$/ inside Astro files).

const INDEX = {

  blog: `---
import { getCollection } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';

export const prerender = true;

// TODO: customise title and description below
const title = '__COL__';
const description = 'All entries in the __COL__ collection';

const entries = (await getCollection('__COL__'))
  .filter(e => !e.data.draft)
  .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
---

<BaseLayout title={title} description={description}>
  <main class="container py-5">
    <div class="mb-5">
      <h1 class="mb-0">{title}</h1>
      <p class="lead">{description}</p>
    </div>

    <div class="row g-4">
      {entries.map(entry => (
        <div class="col-12 col-md-6 col-lg-4">
          <article class="card h-100 shadow-sm">
            {entry.data.image && (
              <img
                src={entry.data.image}
                alt={entry.data.title}
                class="card-img-top"
                style="height:200px;object-fit:cover;"
              />
            )}
            <div class="card-body d-flex flex-column">
              <h5 class="card-title">
                <a
                  href={\`/__COL__/\${entry.id.replace(/\\.mdx?$/, '')}\`}
                  class="text-decoration-none text-dark"
                >
                  {entry.data.title}
                </a>
              </h5>
              <p class="card-text text-muted small flex-grow-1">
                {entry.data.description}
              </p>
              {entry.data.tags && (
                <div class="d-flex flex-wrap gap-1 mt-2">
                  {entry.data.tags.map(tag => (
                    <span class="badge bg-primary-subtle text-primary-emphasis">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div class="card-footer text-muted small">
              <time datetime={entry.data.date.toISOString()}>
                {entry.data.date.toLocaleDateString('en-US', {
                  year: 'numeric', month: 'long', day: 'numeric',
                })}
              </time>
              {entry.data.author && <span> · {entry.data.author}</span>}
            </div>
          </article>
        </div>
      ))}
    </div>

    {entries.length === 0 && (
      <p class="text-center text-muted mt-5">
        No entries yet — add Markdown files to{' '}
        <code>usr/content/__COL__/</code> and set <code>draft: false</code>.
      </p>
    )}
  </main>
</BaseLayout>
`,

  docs: `---
import { getCollection, type CollectionEntry } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';

export const prerender = true;

// TODO: customise title, description, and category groupings below
const title = '__COL__';
const description = 'Documentation for __COL__';

type Entry = CollectionEntry<'__COL__'>;

const entries = (await getCollection('__COL__'))
  .filter((e: Entry) => !e.data.draft)
  .sort((a: Entry, b: Entry) => (a.data.order ?? 999) - (b.data.order ?? 999));
---

<BaseLayout title={title} description={description}>
  <main class="container py-5">
    <div class="mb-5">
      <h1 class="mb-0">{title}</h1>
      <p class="lead text-secondary">{description}</p>
    </div>

    <div class="row g-3">
      {entries.map(entry => (
        <div class="col-12 col-md-6">
          <a
            href={\`/__COL__/\${entry.id.replace(/\\.mdx?$/, '')}\`}
            class="card p-4 h-100 text-decoration-none border shadow-sm d-block"
          >
            <h3 class="h5 fw-semibold text-body mb-2 mt-0">
              {entry.data.title}
            </h3>
            {entry.data.description && (
              <p class="text-secondary mb-0 small">{entry.data.description}</p>
            )}
            {entry.data.category && (
              <span class="badge bg-secondary-subtle text-secondary-emphasis mt-2">
                {entry.data.category}
              </span>
            )}
          </a>
        </div>
      ))}
    </div>

    {entries.length === 0 && (
      <p class="text-center text-muted mt-5">
        No entries yet — add Markdown files to{' '}
        <code>usr/content/__COL__/</code> and set <code>draft: false</code>.
      </p>
    )}
  </main>
</BaseLayout>
`,

  generic: `---
import { getCollection } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';

export const prerender = true;

// TODO: customise title and description below
const title = '__COL__';
const description = 'All entries in the __COL__ collection';

const entries = (await getCollection('__COL__'))
  .filter(e => !e.data.draft);
---

<BaseLayout title={title} description={description}>
  <main class="container py-5">
    <div class="mb-5">
      <h1 class="mb-0">{title}</h1>
      <p class="lead">{description}</p>
    </div>

    <ul class="list-group list-group-flush">
      {entries.map(entry => (
        <li class="list-group-item">
          <a
            href={\`/__COL__/\${entry.id.replace(/\\.mdx?$/, '')}\`}
            class="text-decoration-none fw-semibold"
          >
            {entry.data.title}
          </a>
          {entry.data.description && (
            <p class="mb-0 text-muted small">{entry.data.description}</p>
          )}
        </li>
      ))}
    </ul>

    {entries.length === 0 && (
      <p class="text-center text-muted mt-5">
        No entries yet — add Markdown files to{' '}
        <code>usr/content/__COL__/</code> and set <code>draft: false</code>.
      </p>
    )}
  </main>
</BaseLayout>
`,
};

const SLUG = {

  blog: `---
import { getCollection, render } from 'astro:content';
import { type CollectionEntry } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';

export const prerender = true;

export async function getStaticPaths() {
  const entries = await getCollection('__COL__');
  return entries.map(entry => ({
    params: { slug: entry.id.replace(/\\.mdx?$/, '') },
    props:  { entry },
  }));
}

interface Props { entry: CollectionEntry<'__COL__'>; }

const { entry } = Astro.props;
const { Content } = await render(entry);

const formattedDate = entry.data.date.toLocaleDateString('en-US', {
  year: 'numeric', month: 'long', day: 'numeric',
});
---

<BaseLayout title={entry.data.title} description={entry.data.description}>
  <main class="container py-5">
    <article>
      <div class="mb-4 text-end">
        <a href="/__COL__" class="btn btn-outline-secondary btn-sm">
          ← Back to __COL__
        </a>
      </div>

      <h1 class="mb-3">{entry.data.title}</h1>
      <p class="lead text-muted mb-4">{entry.data.description}</p>

      <div class="d-flex flex-wrap align-items-center gap-3 small text-muted mb-4 pb-4 border-bottom">
        <time datetime={entry.data.date.toISOString()}>{formattedDate}</time>
        {entry.data.author && <span>· By {entry.data.author}</span>}
        {entry.data.tags && entry.data.tags.map(tag => (
          <span class="badge bg-primary-subtle text-primary-emphasis">{tag}</span>
        ))}
      </div>

      {entry.data.image && (
        <img
          src={entry.data.image}
          alt={entry.data.title}
          class="img-fluid rounded mb-5 w-100"
          style="max-height:400px;object-fit:cover;"
        />
      )}

      <div class="markdown-content">
        <Content />
      </div>
    </article>
  </main>
</BaseLayout>
`,

  docs: `---
import { getCollection, render } from 'astro:content';
import { type CollectionEntry } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';

export const prerender = true;

export async function getStaticPaths() {
  const entries = await getCollection('__COL__');
  return entries.map(entry => ({
    params: { slug: entry.id.replace(/\\.mdx?$/, '') },
    props:  { entry },
  }));
}

interface Props { entry: CollectionEntry<'__COL__'>; }

const { entry } = Astro.props;
const { Content } = await render(entry);
---

<BaseLayout title={entry.data.title} description={entry.data.description}>
  <main class="container py-4">
    <article>
      <div class="mb-4 text-end">
        <a href="/__COL__" class="small btn btn-outline-secondary btn-sm">
          ← Back to __COL__
        </a>
      </div>

      <h1 class="mb-2">{entry.data.title}</h1>
      {entry.data.description && (
        <p class="lead text-muted mb-4">{entry.data.description}</p>
      )}
      {entry.data.category && (
        <span class="badge bg-secondary-subtle text-secondary-emphasis mb-4 d-inline-block">
          {entry.data.category}
        </span>
      )}

      <div class="markdown-content mt-4">
        <Content />
      </div>
    </article>
  </main>
</BaseLayout>
`,

  generic: `---
import { getCollection, render } from 'astro:content';
import { type CollectionEntry } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';

export const prerender = true;

export async function getStaticPaths() {
  const entries = await getCollection('__COL__');
  return entries.map(entry => ({
    params: { slug: entry.id.replace(/\\.mdx?$/, '') },
    props:  { entry },
  }));
}

interface Props { entry: CollectionEntry<'__COL__'>; }

const { entry } = Astro.props;
const { Content } = await render(entry);
---

<BaseLayout title={entry.data.title} description={entry.data.description}>
  <main class="container py-5">
    <article>
      <div class="mb-4 text-end">
        <a href="/__COL__" class="btn btn-outline-secondary btn-sm">
          ← Back to __COL__
        </a>
      </div>

      <h1 class="mb-3">{entry.data.title}</h1>
      {entry.data.description && (
        <p class="lead text-muted mb-4">{entry.data.description}</p>
      )}

      <div class="markdown-content mt-4">
        <Content />
      </div>
    </article>
  </main>
</BaseLayout>
`,
};

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // Parse existing collections
  const cfgSrc    = readFileSync(CONFIG_FILE, 'utf8');
  const exportM   = cfgSrc.match(/export const collections\s*=\s*\{([^}]+)\}/s);
  const existing  = exportM
    ? [...exportM[1].matchAll(/(\w+)\s*:/g)].map(m => m[1])
    : [];

  console.log('');
  console.log(`${B}Existing collections:${X}`);
  if (existing.length === 0) console.log('  (none)');
  else for (const c of existing) console.log(`  • ${c}`);
  console.log('');

  // ─── Prompt: collection name ────────────────────────────────────────────────
  let colName;
  while (true) {
    const raw = (await ask(`${B}New collection name${X} (lowercase letters, numbers, hyphens): `)).replace(/\s/g, '');
    if (!/^[a-z]([a-z0-9-]*[a-z0-9])?$/.test(raw)) {
      warn('Name must start with a letter and contain only lowercase letters, numbers, and hyphens.');
      continue;
    }
    if (existing.includes(raw)) {
      warn(`Collection '${raw}' already exists. Choose a different name.`);
      continue;
    }
    colName = raw;
    break;
  }

  // ─── Derive camelCase variable name: my-news → myNewsCollection ──────────
  const parts   = colName.split('-');
  const varName = parts[0] + parts.slice(1).map(p => p[0].toUpperCase() + p.slice(1)).join('') + 'Collection';

  // ─── Prompt: collection type ──────────────────────────────────────────────
  console.log('');
  console.log(`${B}Collection type:${X}`);
  console.log('  1) blog    — articles (date, author, tags, image, draft)');
  console.log('  2) docs    — documentation pages (order, category, draft)');
  console.log('  3) generic — simple entries (title, optional description, draft)');
  console.log('');
  const typeRaw = (await ask('Choose type [1/2/3] (default: 3): ')).trim() || '3';
  const colType = typeRaw === '1' ? 'blog' : typeRaw === '2' ? 'docs' : 'generic';
  ok(`Type: ${colType}`);
  rl.close();

  // ─── 1. Update usr/content.config.ts ──────────────────────────────────────
  const newBlock =
    `\n// Schema for ${colName} entries  [${colType} type]\n` +
    `// TODO: customize the schema fields to match your content structure\n` +
    `const ${varName} = defineCollection({\n` +
    `  loader: glob({\n` +
    `    pattern: '**/*.{md,mdx}',\n` +
    `    base: './usr/content/${colName}',\n` +
    `  }),\n` +
    `  schema: z.object({\n` +
    `${SCHEMA[colType]}\n` +
    `  }),\n` +
    `});\n`;

  const MARKER = '// Export all collections';
  let cfg = readFileSync(CONFIG_FILE, 'utf8');
  if (!cfg.includes(MARKER)) error(`Marker '${MARKER}' not found in config.ts`);

  cfg = cfg.replace(MARKER, newBlock + MARKER);
  cfg = cfg.replace(
    /(export const collections\s*=\s*\{)([^}]+)(\};)/s,
    (_, open, inner, close) => `${open}${inner.trimEnd()}\n  ${colName}: ${varName},\n${close}`
  );
  writeFileSync(CONFIG_FILE, cfg, 'utf8');
  ok('usr/content.config.ts updated');

  // ─── 2. Sample content file ───────────────────────────────────────────────
  const today      = new Date().toISOString().slice(0, 10);
  const contentDir = join(ROOT_DIR, 'usr', 'content', colName);
  mkdirSync(contentDir, { recursive: true });

  const SAMPLE_NAME = { blog: 'sample-post.md', docs: 'sample-doc.md', generic: 'sample.md' };
  const SAMPLE_BODY = {
    blog:
      `---\ntitle: "Sample Post"\n` +
      `description: "A sample post in the ${colName} collection."\n` +
      `date: ${today}\nauthor: "Your Name"\ntags: ["sample"]\ndraft: true\n---\n\n` +
      `# Sample Post\n\nThis is a sample post. Replace this file with real content.\n`,
    docs:
      `---\ntitle: "Sample Document"\n` +
      `description: "A sample document in the ${colName} collection."\n` +
      `order: 1\ncategory: "general"\ndraft: true\n---\n\n` +
      `# Sample Document\n\nThis is a sample document. Replace this file with real content.\n`,
    generic:
      `---\ntitle: "Sample Entry"\n` +
      `description: "A sample entry in the ${colName} collection."\n` +
      `draft: true\n---\n\n` +
      `# Sample Entry\n\nThis is a sample entry. Replace this file with real content.\n`,
  };

  const samplePath = join(contentDir, SAMPLE_NAME[colType]);
  writeFileSync(samplePath, SAMPLE_BODY[colType], 'utf8');
  ok(relative(ROOT_DIR, samplePath));

  // ─── 3. Page templates ────────────────────────────────────────────────────
  const pagesDir = join(ROOT_DIR, 'usr', 'pages', colName);
  mkdirSync(pagesDir, { recursive: true });

  const sub       = (s) => s.replaceAll('__COL__', colName);
  const indexPath = join(pagesDir, 'index.astro');
  const slugPath  = join(pagesDir, '[...slug].astro');

  writeFileSync(indexPath, sub(INDEX[colType]), 'utf8');
  writeFileSync(slugPath,  sub(SLUG[colType]),  'utf8');
  ok(relative(ROOT_DIR, indexPath));
  ok(relative(ROOT_DIR, slugPath));

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('');
  console.log(`${G}${B}Collection '${colName}' scaffolded successfully!${X}`);
  console.log('');
  console.log(`  ${B}Next steps:${X}`);
  console.log(`    1. Open ${B}usr/content.config.ts${X} and review the schema for '${colName}'`);
  console.log(`    2. Edit the page files in ${B}usr/pages/${colName}/${X} to customise the UI`);
  console.log(`    3. Replace the sample file in ${B}usr/content/${colName}/${X} with real content`);
  console.log(`    4. Run ${B}npm run dev${X} and visit ${B}/${colName}${X}`);
  console.log('');
}

main().catch(err => error(String(err)));
