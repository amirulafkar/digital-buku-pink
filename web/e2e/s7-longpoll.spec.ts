import { APIRequestContext, Request, expect, request, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { trackHub } from './hub';

// S7 follow-up proof: the staff board's live connection is long polling and the JWT never appears in any URL.
// Records every request the page makes while it connects, receives an event, loses the connection and reconnects.

const PASSWORD = process.env['SEED_STAFF_PASSWORD'] ?? '';
const API = 'http://127.0.0.1:5080/api/v1/';

test('S7-LP web board: no request URL holds a token, every hub request carries the Authorization header, no WebSocket is opened', async ({ page }) => {
  expect(PASSWORD, 'SEED_STAFF_PASSWORD must be set in db/.env').not.toBe('');
  const seen: { method: string; url: string; auth: string | undefined }[] = [];
  const sockets: string[] = [];
  const hubCtl = await trackHub(page);
  page.on('websocket', w => sockets.push(w.url()));
  page.on('request', (r: Request) => { seen.push({ method: r.method(), url: r.url(), auth: r.headers()['authorization'] }); }); // headers() does not wait for a response, so held long polls are fine

  await page.goto('/login');
  await page.getByLabel(/Username|Nama pengguna/).fill('aini.demo');
  await page.getByLabel(/Password|Kata laluan/).fill(PASSWORD);
  const negotiated = page.waitForResponse(r => r.url().includes('/hubs/queue/negotiate') && r.ok());
  await page.getByRole('button', { name: /Sign in|Log masuk/ }).click();
  await page.waitForURL('**/queue');
  await negotiated;
  await page.waitForTimeout(1500);

  // An event: a walk-in created by "another staff member" must reach the board through the poll.
  const anon = await request.newContext({ baseURL: API });
  const jwt = (await (await anon.post('auth/login', { data: { identifier: 'aini.demo', password: PASSWORD } })).json()).accessToken as string;
  const api: APIRequestContext = await request.newContext({ baseURL: API, extraHTTPHeaders: { Authorization: `Bearer ${jwt}` } });
  const name = `Tester LP ${Date.now()}`;
  const refetchBefore = seen.filter(s => s.url.endsWith('/api/v1/staff/queue')).length;
  expect((await api.post('staff/checkins', { data: { walkInName: name, idempotencyKey: randomUUID() } })).status()).toBe(201);
  await expect(page.locator('[data-testid=queue-list] > li', { hasText: name })).toBeVisible({ timeout: 5000 });
  expect(seen.filter(s => s.url.endsWith('/api/v1/staff/queue')).length, 'the event caused a refetch').toBeGreaterThan(refetchBefore);

  // Lose the connection and reconnect.
  const negotiates = () => seen.filter(s => s.method === 'POST' && s.url.includes('/hubs/queue/negotiate')).length;
  expect(negotiates()).toBe(1);
  await hubCtl.drop();
  await expect.poll(negotiates, { timeout: 15_000 }).toBe(2);
  await expect(page.getByTestId('conn-banner')).toHaveAttribute('data-state', 'connected');
  await page.waitForTimeout(1500);

  const hub = seen.filter(s => s.url.includes('/hubs/'));
  expect(hub.filter(s => s.method === 'GET').length, 'long polls were made').toBeGreaterThan(1);
  const all = seen.map(s => s.url).join('\n');
  expect(all).not.toMatch(/access_token/i);
  expect(all).not.toContain(jwt.slice(0, 20));
  expect(all).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/); // no JWT shaped text in any URL
  for (const h of hub) expect(h.auth, `${h.method} ${h.url}`).toMatch(/^Bearer eyJ/); // the close (DELETE) call too
  expect(sockets.filter(u => u.includes('/hubs/')), 'no hub WebSocket (the dev server has its own reload socket)').toEqual([]);
});
