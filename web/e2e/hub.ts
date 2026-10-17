import { Page, Route } from '@playwright/test';

/**
 * The live hub is long polling, so there is no socket to close. This counts hub connections (one negotiate each) and can drop the
 * connection on demand by aborting the poll the browser is holding open, which makes the client close and reconnect by itself.
 * Call it before the page opens the hub.
 */
export async function trackHub(page: Page) {
  const st = { negotiates: 0 };
  const held = new Set<Route>();
  page.on('request', r => { if (r.method() === 'POST' && r.url().includes('/hubs/queue/negotiate')) st.negotiates++; });
  await page.route(/\/hubs\/queue\?id=/, async route => {
    held.add(route);
    try { await route.fulfill({ response: await route.fetch({ timeout: 0 }) }); } catch { /* aborted by drop(), or the page went away */ } finally { held.delete(route); }
  });
  return {
    negotiates: () => st.negotiates,
    drop: async () => { await Promise.all([...held].map(r => r.abort().catch(() => undefined))); },
  };
}
