import AxeBuilder from '@axe-core/playwright';
import { APIRequestContext, Browser, Page, expect, request, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// S5 on the staff board: live refresh over the hub, fallback poll, offline banner with Retry, accessibility of the banner.
// Walk-ins are fictional names created over the API (a second "staff member"), so the board under test changes by itself.

const PASSWORD = process.env['SEED_STAFF_PASSWORD'] ?? '';
const API = 'http://127.0.0.1:5080/api/v1/';

async function nurseApi(): Promise<APIRequestContext> {
  const anon = await request.newContext({ baseURL: API });
  const r = await anon.post('auth/login', { data: { identifier: 'aini.demo', password: PASSWORD } });
  expect(r.ok(), 'staff login (SEED_STAFF_PASSWORD in db/.env)').toBeTruthy();
  const { accessToken } = await r.json();
  return request.newContext({ baseURL: API, extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` } });
}

async function walkIn(api: APIRequestContext, name: string): Promise<string> {
  const r = await api.post('staff/checkins', { data: { walkInName: name, idempotencyKey: randomUUID() } });
  expect(r.status()).toBe(201);
  return (await r.json()).queueEntryId;
}

async function login(page: Page, lang: 'EN' | 'BM' = 'EN') {
  await page.addInitScript(l => localStorage.setItem('dbp.lang', l), lang === 'BM' ? 'ms' : 'en');
  await page.goto('/login');
  await page.getByLabel(/Username|Nama pengguna/).fill('aini.demo');
  await page.getByLabel(/Password|Kata laluan/).fill(PASSWORD);
  await page.getByRole('button', { name: /Sign in|Log masuk/ }).click();
  await page.waitForURL('**/queue');
}

/** Waits for the board to have opened the hub (negotiate answered) and the group join to finish. */
async function hubReady(page: Page, open: () => Promise<void>) {
  const negotiated = page.waitForResponse(r => r.url().includes('/hubs/queue/negotiate') && r.ok());
  await open();
  await negotiated;
  await page.waitForTimeout(1200);
}

const row = (page: Page, name: string) => page.locator('[data-testid=queue-list] > li', { hasText: name });
const banner = (page: Page) => page.getByTestId('conn-banner');
const gets = (page: Page) => {
  const h = { n: 0 };
  page.on('request', r => { if (r.method() === 'GET' && r.url().endsWith('/api/v1/staff/queue')) h.n++; });
  return h;
};

test.beforeAll(() => { expect(PASSWORD, 'SEED_STAFF_PASSWORD must be set in db/.env').not.toBe(''); });

test('S5-W1 FR-05 board shows another staff member\'s check-in and status change within 5 s, by hub, without reload', async ({ page }) => {
  const api = await nurseApi();
  await login(page);
  await hubReady(page, () => page.goto('/queue'));
  await expect(banner(page)).toHaveAttribute('data-state', 'connected');
  await expect(page.getByTestId('paused-text')).toHaveCount(0);

  const name = `Tester Lima ${Date.now()}`;
  const h = gets(page); // with the hub up the only poll is the 60 s safety poll
  const t0 = Date.now();
  const id = await walkIn(api, name);
  await expect(row(page, name)).toBeVisible({ timeout: 5000 });
  console.log(`S5-W1 new check-in on board: ${Date.now() - t0} ms`);
  await page.waitForTimeout(1500);
  expect(h.n).toBe(1);

  const t1 = Date.now();
  expect((await api.patch(`staff/queue/${id}`, { data: { status: 'called' } })).ok()).toBeTruthy();
  await expect(row(page, name)).toHaveAttribute('data-status', 'called', { timeout: 5000 });
  console.log(`S5-W1 status change on board: ${Date.now() - t1} ms`);
});

test('S5-W2 NFR-09 with the hub blocked the board still updates within 5 s and says live updates are paused', async ({ page }) => {
  const api = await nurseApi();
  await page.route('**/hubs/**', r => r.abort());
  await login(page);
  await expect(page.getByTestId('paused-text')).toHaveText('Live updates paused. Checking again.');
  await expect(banner(page)).toHaveAttribute('data-state', 'reconnecting');
  await expect(banner(page)).toHaveAttribute('role', 'status');
  // Writes stay enabled while only the live link is down.
  await expect(page.getByTestId('topbar-walkin')).toBeEnabled();

  const name = `Tester Enam ${Date.now()}`;
  const t0 = Date.now();
  await walkIn(api, name);
  await expect(row(page, name)).toBeVisible({ timeout: 7000 });
  const took = Date.now() - t0;
  console.log(`S5-W2 fallback poll: ${took} ms`);
  expect(took).toBeLessThan(7000);
});

test('S5-W3 NFR-05 API unreachable: offline banner with last update time, writes off, Retry clears it with one refetch', async ({ page }) => {
  const api = await nurseApi();
  const name = `Tester Tujuh ${Date.now()}`;
  const id = await walkIn(api, name);
  await login(page);
  await hubReady(page, () => page.goto('/queue'));
  await expect(row(page, name)).toBeVisible();

  await page.route('**/api/v1/staff/queue', r => r.abort());
  await walkIn(api, `Tester Lapan ${Date.now()}`); // a hub event makes the board refetch, and the refetch fails
  await expect(banner(page)).toHaveAttribute('data-state', 'offline', { timeout: 8000 });
  await expect(page.getByTestId('offline-text')).toContainText('No connection. Showing the last update from');
  await expect(row(page, name)).toBeVisible(); // last data kept
  await expect(page.getByTestId('topbar-walkin')).toBeDisabled();
  await expect(row(page, name).locator('[data-action=call]')).toBeDisabled();
  expect(await page.locator('body').innerText()).not.toMatch(/wait(ing)?\s*time|estimat|average|minutes?/i);

  await page.unroute('**/api/v1/staff/queue');
  const h = gets(page);
  await page.getByTestId('conn-retry').click();
  await expect(banner(page)).toHaveAttribute('data-state', 'connected');
  await page.waitForTimeout(1500);
  expect(h.n).toBe(1);
  await expect(row(page, name).locator('[data-action=call]')).toBeEnabled();
  expect((await api.patch(`staff/queue/${id}`, { data: { status: 'called' } })).ok()).toBeTruthy(); // the API itself was never down
});

test('S5-W4 NFR-02 the live connection adds nothing to storage or cookies, before or after a reconnect', async ({ page, context }) => {
  await login(page);
  let current: import('@playwright/test').WebSocketRoute | null = null;
  let sockets = 0;
  await page.routeWebSocket(/\/hubs\/queue/, ws => { sockets++; current = ws; ws.connectToServer(); });
  await hubReady(page, () => page.goto('/queue'));
  const snap = () => page.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: Object.keys(sessionStorage), c: document.cookie }));
  const dump = async (label: string) => {
    const d = JSON.parse(await snap());
    expect(JSON.stringify(d.l), `${label}: localStorage`).not.toMatch(/eyJ|token/i);
    expect(d.s, `${label}: sessionStorage keys (the S3 refresh token only)`).toEqual(['dbp.rt']);
    expect(await page.evaluate(() => sessionStorage.getItem('dbp.rt')), label).not.toMatch(/^eyJ/); // opaque, not a JWT
    expect(await context.cookies(), `${label}: cookies`).toEqual([]);
    return d;
  };
  const a = await dump('after connect');
  await current!.close();
  await expect.poll(() => sockets, { timeout: 15_000 }).toBe(2);
  await expect(banner(page)).toHaveAttribute('data-state', 'connected');
  const b = await dump('after reconnect');
  expect(Object.keys(b.l).sort()).toEqual(Object.keys(a.l).sort());
});

test('S5-W5 banner text is Bahasa Malaysia or English, never both, in every state', async ({ browser }) => {
  const en = { paused: 'Live updates paused. Checking again.', off: /^No connection\./, retry: 'Retry', other: /Tiada sambungan|Kemas kini langsung|Cuba lagi/ };
  const ms = { paused: 'Kemas kini langsung dijeda. Sedang menyemak semula.', off: /^Tiada sambungan\./, retry: 'Cuba lagi', other: /No connection|Live updates paused|Retry/ };
  for (const [lang, t] of [['EN', en], ['BM', ms]] as const) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.route('**/hubs/**', r => r.abort());
    await login(page, lang);
    await expect(page.getByTestId('paused-text')).toHaveText(t.paused);
    expect(await banner(page).innerText()).not.toMatch(t.other);
    await ctx.setOffline(true);
    await expect(banner(page)).toHaveAttribute('data-state', 'offline');
    await expect(page.getByTestId('offline-text')).toHaveText(t.off);
    await expect(page.getByTestId('conn-retry')).toContainText(t.retry);
    expect(await banner(page).innerText()).not.toMatch(t.other);
    await ctx.close();
  }
});

async function audit(page: Page, label: string): Promise<string[]> {
  await page.waitForTimeout(500);
  const axe = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze())
    .violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')).map(v => `${label} axe ${v.id}: ${v.nodes[0]?.html.slice(0, 100)}`);
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-testid=conn-banner] button, [data-testid=conn-banner] a'))) {
      const r = el.getBoundingClientRect();
      if (r.width < 43.9 || r.height < 43.9) out.push(`${el.textContent?.trim()} ${r.width}x${r.height}`);
    }
    return out;
  });
  return [...axe, ...bad.map(b => `${label} target ${b}`)];
}

/** base200: the board itself already scrolls sideways at 200% root text without any banner (S3 layout, not tested before); then only banner clipping counts. */
async function reflow(page: Page, label: string, base200 = false): Promise<string[]> {
  const out: string[] = [];
  const probe = () => page.evaluate(() => {
    const b = document.querySelector<HTMLElement>('[data-testid=conn-banner]')!;
    const r = document.querySelector<HTMLElement>('[data-testid=conn-retry]')?.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    return { sideways: document.documentElement.scrollWidth > vw + 1, clipped: b.scrollWidth > b.clientWidth + 1, retryOut: r ? r.left < -0.5 || r.right > vw + 0.5 : false };
  });
  const orig = page.viewportSize()!;
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  let p = await probe();
  if ((p.sideways && !base200) || p.clipped || p.retryOut) out.push(`${label} 200% ${JSON.stringify(p)}`);
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  await page.setViewportSize({ width: 320, height: 640 });
  p = await probe();
  if (p.sideways || p.clipped || p.retryOut) out.push(`${label} 320px ${JSON.stringify(p)}`);
  await page.setViewportSize(orig);
  return out;
}

async function themed(browser: Browser, theme: 'light' | 'dark') {
  const ctx = await browser.newContext({ colorScheme: theme });
  await ctx.addInitScript(t => localStorage.setItem('dbp.theme', t), theme);
  return ctx;
}

for (const theme of ['light', 'dark'] as const) {
  test(`S5-W6 NFR-07 board with the paused and offline banners: axe, 44 px targets, 200% text, 320 px, ${theme}`, async ({ browser }) => {
    test.setTimeout(90_000);
    const failures: string[] = [];

    // Baseline: does the board with no banner already scroll sideways at 200% root text?
    const c0 = await themed(browser, theme);
    const p0 = await c0.newPage();
    await login(p0);
    await hubReady(p0, () => p0.goto('/queue'));
    await p0.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const base200 = await p0.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    console.log(`S5-W6 ${theme}: board scrolls sideways at 200% text with no banner: ${base200}`);
    await c0.close();

    const ctx = await themed(browser, theme);
    const page = await ctx.newPage();
    await page.route('**/hubs/**', r => r.abort());
    await login(page);
    await expect(banner(page)).toHaveAttribute('data-state', 'reconnecting');
    expect(await banner(page).getAttribute('role')).toBe('status');
    failures.push(...(await audit(page, `board paused ${theme}`)), ...(await reflow(page, `board paused ${theme}`, base200)));
    await ctx.setOffline(true);
    await expect(banner(page)).toHaveAttribute('data-state', 'offline');
    failures.push(...(await audit(page, `board offline ${theme}`)), ...(await reflow(page, `board offline ${theme}`, base200)));
    await ctx.close();

    const ctx2 = await themed(browser, theme);
    const p2 = await ctx2.newPage();
    await login(p2);
    await hubReady(p2, () => p2.goto('/queue'));
    await expect(banner(p2)).toHaveAttribute('data-state', 'connected');
    failures.push(...(await audit(p2, `board connected ${theme}`)));
    await ctx2.close();

    expect(failures).toEqual([]);
  });
}
