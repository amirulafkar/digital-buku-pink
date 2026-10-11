import { expect, test } from '@playwright/test';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { MOTHERS, MOTHER_PW, ensureMother } from './support';

// Serves the PRODUCTION build (npm run build:prod) and proves the developer-only paste path is absent and cannot be switched on.
const DIST = 'dist/mobile/browser';
const PORT = 4400;
const TYPES: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };

test('production build: no paste field, and URL or storage flags cannot enable it', async ({ browser }) => {
  expect(existsSync(join(DIST, 'index.html')), 'run `npm run build:prod` first').toBeTruthy();
  await ensureMother(MOTHERS.dewi);
  const server = createServer(async (req, res) => {
    const url = (req.url ?? '/').split('?')[0];
    if (url.startsWith('/api/')) {
      const body = await new Promise<Buffer>(r => { const c: Buffer[] = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
      const up = await fetch('http://127.0.0.1:5080' + req.url, { method: req.method, headers: { 'content-type': 'application/json', ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : body });
      res.writeHead(up.status, { 'content-type': up.headers.get('content-type') ?? 'application/json' });
      res.end(Buffer.from(await up.arrayBuffer()));
      return;
    }
    const file = join(DIST, url === '/' ? 'index.html' : url);
    const path = existsSync(file) && extname(file) ? file : join(DIST, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(readFileSync(path));
  });
  await new Promise<void>(r => server.listen(PORT, '127.0.0.1', r));
  try {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    await ctx.addInitScript(() => { localStorage.setItem('devScan', '1'); localStorage.setItem('dbp.devScan', 'true'); });
    const page = await ctx.newPage();
    const requested: string[] = [];
    page.on('request', r => requested.push(r.url()));
    await page.goto(`http://127.0.0.1:${PORT}/login?devScan=1&dev=1`);
    await page.getByTestId('phone').fill(MOTHERS.dewi.phone);
    await page.getByTestId('password').fill(MOTHER_PW);
    await page.getByTestId('login-submit').click();
    await page.waitForURL('**/home');
    await page.getByRole('navigation').getByRole('link', { name: 'Scan' }).click();
    await page.waitForURL('**/scan');
    await expect(page.getByTestId('open-camera')).toBeVisible();
    await expect(page.getByTestId('dev-token')).toHaveCount(0);
    await expect(page.getByTestId('dev-scan')).toHaveCount(0);
    await expect(page.getByText('Developer only')).toHaveCount(0);
    expect(requested.filter(u => /dev-scan/.test(u))).toEqual([]);
    await page.goto(`http://127.0.0.1:${PORT}/scan?devScan=1`).catch(() => undefined); // a reload signs out; the flag is still ignored
    await expect(page.getByTestId('dev-token')).toHaveCount(0);
    await ctx.close();
  } finally { server.close(); }
});
