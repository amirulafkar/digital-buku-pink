import { Page, test } from '@playwright/test';
import { MOTHERS, ensureEntry, hubReady, loginUI } from './support';

// S5 evidence: the status screen in its three connection states. Output goes to the git-ignored screenshots folder.
const OUT = 'screenshots';
const priya = MOTHERS.priya;
const openStatus = (page: Page) => page.getByRole('navigation').getByRole('link', { name: 'Status' }).click();

for (const [theme, lang] of [['light', 'en'], ['dark', 'ms']] as const) {
  test(`S5 screenshots: status connected, paused, offline (${theme}, ${lang})`, async ({ browser }) => {
    await ensureEntry(priya);
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: theme });
    const page = await ctx.newPage();
    await loginUI(page, priya.phone, lang, theme);
    await hubReady(page, () => openStatus(page));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/s5-status-connected-${theme}-${lang}.png` });
    await ctx.setOffline(true);
    await page.getByTestId('conn-retry').waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/s5-status-offline-${theme}-${lang}.png` });
    await ctx.close();

    const ctx2 = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: theme });
    const p2 = await ctx2.newPage();
    await p2.route('**/hubs/**', r => r.abort());
    await loginUI(p2, priya.phone, lang, theme);
    await openStatus(p2);
    await p2.getByTestId('paused-text').waitFor();
    await p2.waitForTimeout(300);
    await p2.screenshot({ path: `${OUT}/s5-status-paused-${theme}-${lang}.png` });
    await ctx2.close();
  });
}
