import AxeBuilder from '@axe-core/playwright';
import { Page, expect, test } from '@playwright/test';
import { contrast, offenders } from './measure';
import { MOTHERS, ensureEntry, hubReady, loginUI } from './support';

// S5-A11 (NFR-07): the status screen in its three connection states, both themes, EN and BM, on both phone sizes.
// Bars: axe (serious and worse, plus moderate as in S4), contrast, 44 px targets, banner is a status region, text at 200% and 320 px reflow.

const priya = MOTHERS.priya;
const openStatus = (page: Page) => page.getByRole('navigation').getByRole('link', { name: 'Status' }).click();

async function audit(page: Page, label: string): Promise<string[]> {
  await page.waitForTimeout(500);
  const axe = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze())
    .violations.filter(v => ['serious', 'critical', 'moderate'].includes(v.impact ?? '')).map(v => `${label} axe ${v.id}: ${v.nodes[0]?.html.slice(0, 100)}`);
  const c = await contrast(page);
  const t = await offenders(page);
  return [...axe, ...c.fails.map(x => `${label} ${x}`), ...t.map(x => `${label} target ${x}`)];
}

/** Banner text is not clipped and nothing scrolls sideways at 200% text and at 320 CSS px. */
async function reflow(page: Page, label: string): Promise<string[]> {
  const bad: string[] = [];
  const probe = () => page.evaluate(() => {
    const b = document.querySelector<HTMLElement>('[data-testid=conn-banner]')!;
    const retry = document.querySelector<HTMLElement>('[data-testid=conn-retry]');
    const r = retry?.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    return {
      sideways: document.documentElement.scrollWidth > vw + 1,
      bannerClipped: b.scrollWidth > b.clientWidth + 1,
      retryOut: r ? r.left < -0.5 || r.right > vw + 0.5 : false,
      retryH: r ? r.height : 99,
      safety: !!document.querySelector('[data-testid=safety-notice]'),
    };
  });
  const orig = page.viewportSize()!;
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  let p = await probe();
  if (p.sideways || p.bannerClipped || p.retryOut || p.retryH < 43.9) bad.push(`${label} 200% text ${JSON.stringify(p)}`);
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  await page.setViewportSize({ width: 320, height: 640 });
  p = await probe();
  if (p.sideways || p.bannerClipped || p.retryOut || p.retryH < 43.9 || !p.safety) bad.push(`${label} 320px ${JSON.stringify(p)}`);
  await page.setViewportSize(orig);
  return bad;
}

for (const theme of ['light', 'dark'] as const) {
  for (const lang of ['en', 'ms'] as const) {
    test(`S5-A11 status in connected, reconnecting and offline states: axe, targets, reflow, ${theme}, ${lang}`, async ({ browser }, info) => {
      test.setTimeout(120_000);
      await ensureEntry(priya);
      const failures: string[] = [];
      const where = `status ${theme} ${lang} ${info.project.name}`;

      const ctx = await browser.newContext({ viewport: info.project.use.viewport!, colorScheme: theme });
      const page = await ctx.newPage();
      await loginUI(page, priya.phone, lang, theme);
      await hubReady(page, () => openStatus(page));
      await expect(page.getByTestId('conn-banner')).toHaveAttribute('data-state', 'connected');
      await expect(page.getByTestId('conn-banner')).toHaveAttribute('role', 'status');
      failures.push(...(await audit(page, `${where} connected`)));

      await ctx.setOffline(true);
      await expect(page.getByTestId('conn-banner')).toHaveAttribute('data-state', 'offline');
      failures.push(...(await audit(page, `${where} offline`)));
      failures.push(...(await reflow(page, `${where} offline`)));
      await ctx.close();

      const ctx2 = await browser.newContext({ viewport: info.project.use.viewport!, colorScheme: theme });
      const page2 = await ctx2.newPage();
      await page2.route('**/hubs/**', r => r.abort());
      await loginUI(page2, priya.phone, lang, theme);
      await openStatus(page2);
      await expect(page2.getByTestId('conn-banner')).toHaveAttribute('data-state', 'reconnecting');
      await expect(page2.getByTestId('conn-banner')).toHaveAttribute('role', 'status');
      failures.push(...(await audit(page2, `${where} reconnecting`)));
      failures.push(...(await reflow(page2, `${where} reconnecting`)));
      await ctx2.close();

      expect(failures).toEqual([]);
    });
  }
}
