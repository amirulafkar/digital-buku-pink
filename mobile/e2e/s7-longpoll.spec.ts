import { Page, Request, expect, test } from '@playwright/test';
import { MOTHERS, ensureEntry, loginUI, myRow, nurse } from './support';
import { trackHub } from './hub';

// S7 follow-up proof for the mother app: the live connection is long polling and the JWT never appears in any URL.
// Priya is used as in the other S5 specs (run db/seed/reset.sh for a fresh day). Room changes are the events, so her queue steps are not consumed.

const priya = MOTHERS.priya;
const openStatus = (page: Page) => page.getByRole('navigation').getByRole('link', { name: 'Status' }).click();

test('S7-LP mobile status: no request URL holds a token, every hub request carries the Authorization header, no hub WebSocket', async ({ page }) => {
  await ensureEntry(priya);
  const seen: { method: string; url: string; auth: string | undefined }[] = [];
  const sockets: string[] = [];
  page.on('websocket', w => sockets.push(w.url()));
  page.on('request', (r: Request) => { seen.push({ method: r.method(), url: r.url(), auth: r.headers()['authorization'] }); });
  const hub = await trackHub(page);

  await loginUI(page, priya.phone);
  const negotiated = page.waitForResponse(r => r.url().includes('/hubs/queue/negotiate') && r.ok());
  await openStatus(page);
  await negotiated;
  await expect(page.getByTestId('conn-banner')).toHaveAttribute('data-state', 'connected');
  await page.waitForTimeout(1500);

  const n = await nurse();
  const rooms: { id: string }[] = await (await n.get('staff/rooms')).json();
  const row = await myRow('Priya');
  const qmeGets = () => seen.filter(s => s.method === 'GET' && s.url.endsWith('/api/v1/queue/me')).length;
  const event = async (i: number) => {
    const before = qmeGets();
    expect((await n.patch(`staff/queue/${row.id}`, { data: { roomId: rooms[i % rooms.length].id } })).ok()).toBeTruthy();
    // with the hub up the only other poll is the 60 s safety poll, so a refetch within 4 s came from the event
    await expect.poll(qmeGets, { timeout: 4000 }).toBeGreaterThan(before);
  };
  await event(0);
  expect(hub.negotiates()).toBe(1);

  await hub.drop();
  await expect.poll(() => hub.negotiates(), { timeout: 15_000 }).toBe(2);
  await expect(page.getByTestId('conn-banner')).toHaveAttribute('data-state', 'connected');
  await page.waitForTimeout(1500);
  await event(1);

  const hubCalls = seen.filter(s => s.url.includes('/hubs/'));
  expect(hubCalls.filter(s => s.method === 'GET').length, 'long polls were made').toBeGreaterThan(1);
  const urls = seen.map(s => s.url).join('\n');
  expect(urls).not.toMatch(/access_token/i);
  expect(urls).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/); // no JWT-shaped text in any URL
  for (const h of hubCalls) expect(h.auth, `${h.method} ${h.url}`).toMatch(/^Bearer eyJ/); // the close (DELETE) call too
  expect(sockets.filter(u => u.includes('/hubs/')), 'no hub WebSocket (the dev server has its own reload socket)').toEqual([]);
});
