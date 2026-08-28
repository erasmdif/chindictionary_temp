import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const secrets = [process.env.DIRECTUS_TOKEN].filter(Boolean).map(value => Buffer.from(value));

if (!fs.existsSync(dist)) {
  console.error('Secret audit failed: dist/ does not exist.');
  process.exit(1);
}

if (!secrets.length) {
  console.error('Secret audit failed: DIRECTUS_TOKEN is not available to the audit step.');
  process.exit(1);
}

const hits = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    const data = fs.readFileSync(full);
    if (secrets.some(secret => data.indexOf(secret) !== -1)) {
      hits.push(path.relative(process.cwd(), full));
    }
  }
}

walk(dist);

if (hits.length) {
  console.error('SECURITY ERROR: a deployment secret was found in generated output.');
  for (const hit of hits) console.error(`- ${hit}`);
  process.exit(1);
}

console.log('Secret audit passed: DIRECTUS_TOKEN was not found in dist/.');
