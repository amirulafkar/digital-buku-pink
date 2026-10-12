import { Page, expect, test } from '@playwright/test';
import { MOTHERS, checkInUI, ensureMother, loginUI, nurse, queueRows, setStatus } from './support';

// Live status for the mother (SignalR). Priya has not been checked in by any other test; run after db/seed/reset.sh.

function watch(page: Page) {
  const seen = { events: 0, sockets: 0 };
  page.on('websocket', ws => {
    seen.sockets++;
    ws.on('framereceived', f => { if (String(f.payload).includes('queue.changed')) seen.events++; });
  });
  return seen;
}

async function entryOf(name: string) {
  return (await queueRows()).filter(r => r.displayName?.startsWith(name)).at(-1)!;
}

test('LIVE-A1 when the nurse calls her, the open status screen updates within 2 s and the timer does not poll', async ({ page }) => {
  await ensureMother(MOTHERS.priya);
  await loginUI(page, MOTHERS.priya.phone);
  await checkInUI(page);
  await page.getByTestId('open-status').click();
  await page.waitForURL('**/status');
  await expect(page.getByTestId('live-state')).toHaveText('Live');
  await expect(page.locator('[data-step=waiting]')).toHaveAttribute('data-state', 'current');

  const calls: number[] = [];
  page.on('request', r => { if (r.url().endsWith('/api/v1/queue/me')) calls.push(Date.now()); });
  const e = await entryOf('Priya');
  const t0 = Date.now();
  await setStatus(e.id, 'called');
  await expect(page.locator('[data-step=called]')).toHaveAttribute('data-state', 'current', { timeout: 2000 });
  expect(Date.now() - t0).toBeLessThan(2500);
  expect(calls.length).toBe(1);                 // exactly one refetch, caused by the event
  await expect(page.getByTestId('announce')).toHaveText('Your status is now Called.'); // one polite announcement
  await page.waitForTimeout(3000);
  expect(calls.length).toBe(1);                 // no double update
});

test('LIVE-A2 hub down: the banner says live updates are off and the 15 s poll takes over; it recovers when the hub returns', async ({ page }) => {
  await ensureMother(MOTHERS.priya);
  await page.route('**/hubs/**', r => r.abort());
  await loginUI(page, MOTHERS.priya.phone);
  await page.getByRole('navigation').getByRole('link', { name: 'Status' }).click();
  await expect(page.getByTestId('live-state')).toHaveText('Live updates are off. Refreshing every 15 seconds.');
  const e = await entryOf('Priya');
  await setStatus(e.id, 'in_room');
  await expect(page.locator('[data-step=in_room]')).toHaveAttribute('data-state', 'current', { timeout: 20_000 });
  await page.unroute('**/hubs/**');
  await expect(page.getByTestId('live-state')).toHaveText('Live', { timeout: 20_000 });
});

test('LIVE-A3 a mother in another clinic receives zero events when clinic A changes', async ({ browser }) => {
  await ensureMother(MOTHERS.nadia, true);
  await ensureMother(MOTHERS.priya);
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  const seen = watch(page);
  await loginUI(page, MOTHERS.nadia.phone);
  await page.getByRole('navigation').getByRole('link', { name: 'Status' }).click();
  await expect(page.getByTestId('live-state')).toHaveText('Live');
  const e = await entryOf('Priya');
  const n = await nurse();
  await n.patch(`staff/queue/${e.id}`, { data: { urgent: true, urgentReason: 'other' } }); // a change in clinic A (urgent is staff-only)
  await n.post('staff/checkins', { data: { walkInName: `Iso ${Date.now()}`, idempotencyKey: crypto.randomUUID() } });
  await page.waitForTimeout(2000);
  expect(seen.sockets).toBeGreaterThanOrEqual(1);
  expect(seen.events).toBe(0);
  await ctx.close();
});

test('LIVE-A6 offline: the status screen keeps the last status and says to go to the counter, in EN and BM', async ({ page, context }) => {
  await ensureMother(MOTHERS.priya);
  await loginUI(page, MOTHERS.priya.phone);
  await page.getByRole('navigation').getByRole('link', { name: 'Status' }).click();
  await expect(page.getByTestId('queue-no')).toHaveText(/^A\d{3}$/);
  const no = (await page.getByTestId('queue-no').innerText()).trim();
  await context.setOffline(true);
  await expect(page.getByText('You are offline. Showing the last known status. Go to the counter if you need help.')).toBeVisible();
  await expect(page.getByTestId('queue-no')).toHaveText(no);
  await page.getByRole('button', { name: 'BM', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ms');
  await expect(page.getByText('Anda di luar talian. Memaparkan status terakhir yang diketahui. Pergi ke kaunter jika anda perlukan bantuan.')).toBeVisible();
  await context.setOffline(false);
});

test('LIVE-A8 with reduced motion set, a live status change runs no animation', async ({ browser }) => {
  await ensureMother(MOTHERS.priya);
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await loginUI(page, MOTHERS.priya.phone);
  await page.getByRole('navigation').getByRole('link', { name: 'Status' }).click();
  await expect(page.getByTestId('live-state')).toHaveText('Live');
  const e = await entryOf('Priya');
  await setStatus(e.id, 'completed');
  await expect(page.locator('[data-step=completed]')).toHaveAttribute('data-state', 'current', { timeout: 3000 });
  const running = await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running' && a.effect && (a.effect as KeyframeEffect).getTiming().duration! > 1).length);
  expect(running).toBe(0);
  await ctx.close();
});
