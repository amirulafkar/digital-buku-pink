// Pages build only. Run from the app folder after `ng build --configuration pages`.
//   node scripts/csp.mjs           writes connect-src into dist/pages/browser/index.html, then checks it
//   node scripts/csp.mjs --check   checks only (exit 1 on any problem)
// The origin comes from src/environments/environment.pages.ts, the same value the bundle was built with. No wildcard is ever written.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'dist/pages/browser';
const file = join(dir, 'index.html');
const fail = msg => { console.error('CSP check failed: ' + msg); process.exit(1); };

const env = readFileSync('src/environments/environment.pages.ts', 'utf8');
const api = (env.match(/apiBase:\s*'([^']*)'/) ?? [])[1] ?? '';
if (!/^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d+)?$/i.test(api)) fail(`apiBase "${api}" must be https://host with no path, wildcard or trailing slash`);
const expected = `connect-src 'self' ${api} wss://${api.slice('https://'.length)}`;

let html = readFileSync(file, 'utf8');
if (!process.argv.includes('--check')) {
  if (!/connect-src[^;"]*/.test(html)) fail('index.html has no connect-src to replace');
  html = html.replace(/connect-src[^;"]*/, expected);
  writeFileSync(file, html);
  html = readFileSync(file, 'utf8');
}

const csp = (html.match(/Content-Security-Policy"\s+content="([^"]*)"/i) ?? [])[1];
if (!csp) fail('no Content-Security-Policy meta tag in index.html');
const found = csp.match(/connect-src[^;]*/g) ?? [];
if (found.length !== 1) fail(`expected exactly one connect-src, found ${found.length}`);
if (found[0].trim() !== expected) fail(`connect-src is "${found[0].trim()}", expected "${expected}"`);
if (/\*|ws:\/\/|127\.0\.0\.1|localhost|http:/.test(found[0])) fail('connect-src has a wildcard, plain ws, http or local origin');

const js = readdirSync(dir).filter(f => f.endsWith('.js')).some(f => readFileSync(join(dir, f), 'utf8').includes(api));
if (!js) fail('the built bundle does not contain the API origin (fileReplacements not applied?)');
console.log(`OK: ${found[0].trim()}`);
