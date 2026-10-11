// Run after `npm run build:prod`. Fails if anything developer-only reached the production bundle.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = 'dist/mobile/browser';
const banned = ['dev-scan', 'data-testid="dev-token"', 'Developer only: paste a QR token', 'dev-submit'];
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.(js|html|css)$/.test(f) && files.push(p); } })(root);
const hits = [];
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  for (const b of banned) if (text.includes(b)) hits.push(`${f}: ${b}`);
}
if (hits.length) { console.error('Developer-only code found in the production build:\n' + hits.join('\n')); process.exit(1); }
console.log(`OK: ${files.length} production files checked, no developer scan path or paste field.`);
