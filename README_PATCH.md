# CHIND — GitHub Pages prerender cleanup fix

Astro 6 may leave build-time prerender chunks in `dist/.prerender/`. Because CHIND reads `DIRECTUS_TOKEN` through `import.meta.env` during static generation, the build-time Directus helper chunk can contain the token value even though the generated public pages do not.

This patch:

1. removes `dist/.prerender/` after the static build has completed;
2. then runs the existing full secret audit on the remaining `dist/` tree;
3. uploads only the cleaned static artifact to GitHub Pages.

No Directus/core CMS code is modified.

## Local verification

After a successful GitHub Pages build:

```bash
set -a
source .env
set +a

node scripts/prepare-pages-artifact.mjs
node scripts/check-build-secrets.mjs

unset DIRECTUS_TOKEN DIRECTUS_URL
```

Expected output includes:

```text
Removed Astro build-only prerender internals: dist/.prerender/
Secret audit passed: DIRECTUS_TOKEN was not found in dist/.
```
