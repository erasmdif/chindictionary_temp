import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const prerenderDir = path.join(dist, '.prerender');

if (!fs.existsSync(dist)) {
  console.error('Artifact preparation failed: dist/ does not exist.');
  process.exit(1);
}

if (fs.existsSync(prerenderDir)) {
  fs.rmSync(prerenderDir, { recursive: true, force: true });
  console.log('Removed Astro build-only prerender internals: dist/.prerender/');
} else {
  console.log('No dist/.prerender/ directory found; nothing to remove.');
}

if (fs.existsSync(prerenderDir)) {
  console.error('Artifact preparation failed: dist/.prerender/ still exists.');
  process.exit(1);
}

console.log('GitHub Pages artifact preparation complete.');
