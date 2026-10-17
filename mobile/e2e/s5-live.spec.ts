import { Page, expect, test } from '@playwright/test';
import { trackHub } from './hub';
import { MOTHERS, MOTHER_PW, advance, ensureEntry, ensureMother, hubReady, loginUI, nurse, qrToken } from './support';

// S5 live updates, fallback, offline and token hygiene. Mother "Priya" is used in order: first check-in (A14), then two staff steps
// (A7, A8), then a room change (A9). Run db/seed/reset.sh for a fresh day. The API is "stopped" by aborting its requests in the browser
// (the same way S4 does), so the API process and the hub stay up for the staff side of each test.

const priya = MOTHERS.priya;
const openStatus = (page: Page) => page.getByRole('navigation').getByRole('link', { name: 'Status' }).click();
const openScan = (page: Page) => page.getByRole('navigation').getByRole('link', { name: 'Scan' }).click();
const qmeGets = (page: Page) => {
  const hits = { n: 0 };
  page.on('request', r => { if (r.method() === 'GET' && r.url().endsWith('/api/v1/queue/me')) hits.n++; });
  return hits;
};

test('S5-A14 NFR-04 check-in confirmation appears in under 2 s on a throttled link (proposed target)', async ({ page, context }) => {
  await ensureMother(priya);
  await loginUI(page, priya.phone);
  await page.getByRole('link', { name: /Scan|Imbas/ }).click();
  await page.waitForURL('**/scan');
  await page.getByTestId('dev-token').fill(await qrToken());
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  // Roughly a weak 4G phone: 150 ms round trip, 1.6 Mbit/s down, 750 kbit/s up.
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  const t0 = Date.now();
  await page.getByTestId('dev-submit').click();
  await page.waitForURL('**/confirmation');
  await expect(page.getByTestId('queue-no')).toBeVisible();
  const ms = Date.now() - t0;
  console.log(`S5-A14 check-in to confirmation on throttled link: ${ms} ms`);
  expect(ms).toBeLessThan(2000);
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
});

test('S5-A7 FR-05 a staff change shows on /status within 5 s without reload, and the hub (not a poll) did it', async ({ page }) => {
  const before = await ensureEntry(priya);
  await loginUI(page, priya.phone);
  await hubReady(page, () => openStatus(page));
  await expect(page.getByTestId('queue-no')).toHaveText(before.queueNo);
  await expect(page.getByTestId('conn-banner')).toHaveAttribute('data-state', 'connected');
  await expect(page.getByTestId('paused-text')).toHaveCount(0);

  const gets = qmeGets(page); // while the hub is up the only poll is the 60 s safety poll, so any GET here came from the event
  const to = await advance('Priya');
  const t0 = Date.now();
  await expect(page.locator(`[data-step=${to}]`)).toHaveAttribute('data-state', 'current', { timeout: 5000 });
  console.log(`S5-A7 staff change to mother screen: ${Date.now() - t0} ms`);
  await page.waitForTimeout(1500);
  expect(gets.n).toBe(1); // one refetch for the event
});

test('S5-A8 NFR-09 with the hub blocked, /status still updates within 15 s and says live updates are paused', async ({ page }) => {
  await ensureEntry(priya);
  await page.route('**/hubs/**', r => r.abort());
  await loginUI(page, priya.phone);
  await openStatus(page);
  await expect(page.getByTestId('paused-text')).toHaveText('Live updates paused. Checking again.');
  await expect(page.getByTestId('conn-banner')).toHaveAttribute('data-state', 'reconnecting');
  await expect(page.getByTestId('safety-notice')).toBeVisible();
  // Scanning stays available while only the live link is down.
  await openScan(page);
  await expect(page.getByTestId('open-camera')).not.toHaveAttribute('aria-disabled', 'true');
  await openStatus(page);
  await expect(page.getByTestId('paused-text')).toBeVisible();

  const to = await advance('Priya');
  const t0 = Date.now();
  await expect(page.locator(`[data-step=${to}]`)).toHaveAttribute('data-state', 'current', { timeout: 16_500 });
  const took = Date.now() - t0;
  console.log(`S5-A8 fallback poll update: ${took} ms`);
  expect(took).toBeLessThan(16_500);
});

test('S5-A9 NFR-05 API unreachable: offline banner, scan off, last status kept, then Retry clears it with one refetch', async ({ page }) => {
  const row = await ensureEntry(priya);
  await loginUI(page, priya.phone);
  await hubReady(page, () => openStatus(page));
  await expect(page.getByTestId('queue-no')).toHaveText(row.queueNo);
  const banner = page.getByTestId('conn-banner');
  await expect(banner).toHaveAttribute('role', 'status');

  // The API goes away; a staff change over the hub makes the screen try to refetch and fail.
  await page.route('**/api/v1/queue/me', r => r.abort());
  const n = await nurse();
  const rooms = await (await n.get('staff/rooms')).json();
  expect((await n.patch(`staff/queue/${row.id}`, { data: { roomId: rooms[0].id } })).ok()).toBeTruthy();
  await expect(banner).toHaveAttribute('data-state', 'offline', { timeout: 8000 });
  await expect(page.getByTestId('offline-text')).toContainText('No connection. Showing the last update from');
  await expect(page.getByTestId('conn-retry')).toBeVisible();
  await expect(page.getByTestId('queue-no')).toHaveText(row.queueNo);
  await expect(page.getByTestId('updated')).toContainText('Last updated');
  const text = (await page.locator('body').innerText()).replace(/Staff decide the order\. This app does not estimate waiting time\./, '');
  expect(text).not.toMatch(/wait(ing)?\s*time|estimat|priorit|urgent|minutes?/i);

  await openScan(page);
  await expect(page.getByTestId('open-camera')).toBeDisabled();
  await expect(banner).toHaveAttribute('data-state', 'offline');
  await openStatus(page);
  await page.waitForTimeout(2500); // let the hub reconnect and its one refetch (which still fails) settle

  await page.unroute('**/api/v1/queue/me');
  const gets = qmeGets(page);
  await page.getByTestId('conn-retry').click();
  await expect(banner).toHaveAttribute('data-state', 'connected');
  await expect(page.getByTestId('conn-retry')).toHaveCount(0);
  await page.waitForTimeout(1500);
  expect(gets.n).toBe(1);
  await expect(page.getByTestId('queue-no')).toHaveText(row.queueNo);
});

test('S5-A10 FR-12 safety notice on status and home in connected, reconnecting and offline states, EN and BM', async ({ browser }) => {
  await ensureEntry(priya);
  const text = { en: 'Tell staff immediately or go to a hospital if you are worried.', ms: 'Beritahu kakitangan dengan segera atau pergi ke hospital jika anda risau.' };
  const bannerText = { en: /^No connection\./, ms: /^Tiada sambungan\./ };
  const pausedText = { en: 'Live updates paused. Checking again.', ms: 'Kemas kini langsung dijeda. Sedang menyemak semula.' };
  const retryText = { en: 'Retry', ms: 'Cuba lagi' };
  const other = { en: /Tiada sambungan|Kemas kini langsung|Cuba lagi/, ms: /No connection|Live updates paused|Retry/ };

  for (const lang of ['en', 'ms'] as const) {
    // Connected, then offline (browser offline).
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    await loginUI(page, priya.phone, lang);
    await hubReady(page, () => openStatus(page));
    await expect(page.getByTestId('conn-banner')).toHaveAttribute('data-state', 'connected');
    await expect(page.getByTestId('safety-notice')).toContainText(text[lang]);
    await page.getByRole('navigation').getByRole('link').nth(0).click();
    await page.waitForURL('**/home');
    await expect(page.getByTestId('safety-notice')).toContainText(text[lang]);
    await openStatus(page);
    await ctx.setOffline(true);
    await expect(page.getByTestId('conn-banner')).toHaveAttribute('data-state', 'offline');
    await expect(page.getByTestId('offline-text')).toHaveText(bannerText[lang]);
    await expect(page.getByTestId('conn-retry')).toContainText(retryText[lang]);
    expect(await page.getByTestId('conn-banner').innerText()).not.toMatch(other[lang]);
    await expect(page.getByTestId('safety-notice')).toContainText(text[lang]);
    await page.getByRole('navigation').getByRole('link').nth(0).click();
    await page.waitForURL('**/home');
    await expect(page.getByTestId('safety-notice')).toContainText(text[lang]);
    await expect(page.getByTestId('conn-banner')).toHaveAttribute('data-state', 'offline');
    await ctx.close();

    // Reconnecting: the hub is blocked, the API answers.
    const ctx2 = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page2 = await ctx2.newPage();
    await page2.route('**/hubs/**', r => r.abort());
    await loginUI(page2, priya.phone, lang);
    await openStatus(page2);
    await expect(page2.getByTestId('paused-text')).toHaveText(pausedText[lang]);
    expect(await page2.getByTestId('conn-banner').innerText()).not.toMatch(other[lang]);
    await expect(page2.getByTestId('safety-notice')).toContainText(text[lang]);
    await page2.getByRole('navigation').getByRole('link').nth(0).click();
    await page2.waitForURL('**/home');
    await expect(page2.getByTestId('safety-notice')).toContainText(text[lang]);
    await ctx2.close();
  }
});

test('S5-A13 NFR-02 no token in localStorage, sessionStorage or cookies after the live connect and after a reconnect', async ({ page, context }) => {
  await ensureEntry(priya);
  const hub = await trackHub(page); // the hub is long polling: one negotiate per connection, drop() aborts the held poll
  await loginUI(page, priya.phone);
  await hubReady(page, () => openStatus(page));
  await expect.poll(() => hub.negotiates()).toBe(1);

  const clean = async (label: string) => {
    const dump = await page.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage }, c: document.cookie }));
    expect(dump, `${label}: storage`).not.toMatch(/eyJ|access_token|refresh/i);
    expect(dump, label).not.toContain(MOTHER_PW);
    expect(await context.cookies(), `${label}: cookies`).toEqual([]);
    expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
    expect(await page.evaluate(() => Object.keys(localStorage).filter(k => !k.startsWith('dbp.m.')))).toEqual([]);
  };
  await clean('after connect');

  // Drop the live connection: the client reconnects by itself with a token read from memory.
  await hub.drop();
  await expect.poll(() => hub.negotiates(), { timeout: 15_000 }).toBe(2);
  await expect(page.getByTestId('conn-banner')).toHaveAttribute('data-state', 'connected');
  await page.waitForTimeout(500);
  await clean('after reconnect');

});

test('S5-fix NFR-05 a token read while offline is not sent; it is kept and Try again sends it once back online', async ({ page, context }) => {
  await ensureMother(MOTHERS.dewi);
  await loginUI(page, MOTHERS.dewi.phone);
  await page.getByRole('link', { name: 'Scan' }).click();
  await page.waitForURL('**/scan');
  const token = await qrToken();
  const posts: string[] = [];
  page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/api/v1/checkins')) posts.push(r.url()); });
  await context.setOffline(true);
  await expect(page.getByTestId('conn-banner')).toHaveAttribute('data-state', 'offline');
  await page.getByTestId('dev-token').fill(token);
  await page.getByTestId('dev-submit').click();
  await page.waitForTimeout(800);
  expect(posts).toHaveLength(0);                       // nothing left the device
  await expect(page).toHaveURL(/\/scan$/);
  await expect(page.getByText('You are offline. Scanning is paused until you are back online.')).toBeVisible();
  await expect(page.getByTestId('scan-retry')).toBeDisabled();

  await context.setOffline(false); // the browser online event clears the offline state // the browser's online event clears the offline state
  await expect(page.getByTestId('scan-retry')).toBeEnabled();
  await page.getByTestId('scan-retry').click();
  await page.waitForURL('**/confirmation');
  expect(posts).toHaveLength(1);
});
