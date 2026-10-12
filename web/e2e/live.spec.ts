import { Page, expect, request, test } from '@playwright/test';

// Live updates (SignalR) for the staff dashboard. Needs a freshly reset database and the dev API.
const PASSWORD = process.env['SEED_STAFF_PASSWORD'] ?? '';
const API = 'http://127.0.0.1:5080/api/v1/';

async function staffApi(username: string) {
  const anon = await request.newContext({ baseURL: API });
  const r = await anon.post('auth/login', { data: { identifier: username, password: PASSWORD } });
  expect(r.ok()).toBeTruthy();
  const { accessToken } = await r.json();
  return request.newContext({ baseURL: API, extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` } });
}

async function login(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/queue');
}

/** Counts SignalR queue events arriving on this page's WebSocket. */
function watchEvents(page: Page) {
  const seen = { events: 0, sockets: 0, closed: 0 };
  page.on('websocket', ws => {
    seen.sockets++;
    ws.on('framereceived', f => { if (String(f.payload).includes('queue.changed')) seen.events++; });
    ws.on('close', () => seen.closed++);
  });
  return seen;
}

test('LIVE-1 a change made elsewhere appears on the nurse screen within 2 s, with no timer polling', async ({ page }) => {
  const seen = watchEvents(page);
  await login(page, 'aini.demo');
  await expect(page.getByTestId('live-state')).toHaveText('Live');
  const queueCalls: number[] = [];
  page.on('request', r => { if (r.url().endsWith('/api/v1/staff/queue')) queueCalls.push(Date.now()); });
  const name = `Live walk-in ${Date.now()}`;
  const api = await staffApi('aini.demo');
  const t0 = Date.now();
  await api.post('staff/checkins', { data: { walkInName: name, idempotencyKey: crypto.randomUUID() } });
  await expect(page.locator('[data-testid=queue-list] > li', { hasText: name })).toBeVisible({ timeout: 2000 });
  expect(Date.now() - t0).toBeLessThan(2500);
  expect(seen.events).toBeGreaterThanOrEqual(1);
  expect(queueCalls.length).toBe(1); // one refetch caused by the event; the 5 s timer does not poll while live
  await page.waitForTimeout(6500);
  expect(queueCalls.length).toBe(1); // still no timer-driven polling
});

test('LIVE-2 another clinic receives zero events (isolation) while this clinic does', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const sa = watchEvents(a);
  const sb = watchEvents(b);
  await login(a, 'aini.demo');
  await login(b, 'rina.demo');
  await expect(a.getByTestId('live-state')).toHaveText('Live');
  await expect(b.getByTestId('live-state')).toHaveText('Live');
  const api = await staffApi('aini.demo');
  for (let i = 0; i < 2; i++) await api.post('staff/checkins', { data: { walkInName: `Isolation ${i} ${Date.now()}`, idempotencyKey: crypto.randomUUID() } });
  await expect.poll(() => sa.events, { timeout: 3000 }).toBeGreaterThanOrEqual(2);
  await b.waitForTimeout(1500);
  expect(sb.events).toBe(0);
  await expect(b.locator('[data-testid=queue-list] > li')).toHaveCount(0);
  await ctxA.close(); await ctxB.close();
});

test('LIVE-3 hub down: a visible "off" state, polling takes over, and it returns to Live when the hub is back', async ({ page }) => {
  await page.route('**/hubs/**', r => r.abort());
  await login(page, 'aini.demo');
  await expect(page.getByTestId('live-state')).toHaveText('Live updates are off. Refreshing every 5 seconds.');
  const name = `Polled ${Date.now()}`;
  const api = await staffApi('aini.demo');
  await api.post('staff/checkins', { data: { walkInName: name, idempotencyKey: crypto.randomUUID() } });
  await expect(page.locator('[data-testid=queue-list] > li', { hasText: name })).toBeVisible({ timeout: 9000 }); // polling covers it
  await page.unroute('**/hubs/**');
  await expect(page.getByTestId('live-state')).toHaveText('Live', { timeout: 20_000 });
});

test('LIVE-4 logging out closes the live connection', async ({ page }) => {
  const seen = watchEvents(page);
  await login(page, 'aini.demo');
  await expect(page.getByTestId('live-state')).toHaveText('Live');
  expect(seen.sockets).toBeGreaterThanOrEqual(1);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect.poll(() => seen.closed, { timeout: 4000 }).toBeGreaterThanOrEqual(1);
});

test('LIVE-5 the paper-fallback banner shows when the API is down, in English and Bahasa Malaysia', async ({ page }) => {
  await login(page, 'aini.demo');
  await page.route('**/api/v1/staff/queue', r => r.abort());
  await expect(page.getByText('System is down. Use the paper queue and re-key entries later.')).toBeVisible({ timeout: 12_000 });
  await page.getByRole('button', { name: 'BM', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ms');
  await expect(page.getByText('Sistem terhenti. Gunakan giliran kertas dan masukkan semula entri kemudian.')).toBeVisible();
  await expect(page.getByTestId('live-state')).toBeVisible();
});
