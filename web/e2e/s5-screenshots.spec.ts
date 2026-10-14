import { expect, test } from '@playwright/test';

// S5 evidence: the staff board with the paused and offline banners. Output goes to the git-ignored screenshots folder.
const OUT = 'screenshots';
const PASSWORD = process.env['SEED_STAFF_PASSWORD'] ?? '';

for (const [theme, lang] of [['light', 'en'], ['dark', 'ms']] as const) {
  test(`S5 screenshots: board paused and offline (${theme}, ${lang})`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: theme });
    await ctx.addInitScript(([t, l]) => { localStorage.setItem('dbp.theme', t); localStorage.setItem('dbp.lang', l); }, [theme, lang]);
    const page = await ctx.newPage();
    await page.route('**/hubs/**', r => r.abort());
    await page.goto('/login');
    await page.getByLabel(/Username|Nama pengguna/).fill('aini.demo');
    await page.getByLabel(/Password|Kata laluan/).fill(PASSWORD);
    await page.getByRole('button', { name: /Sign in|Log masuk/ }).click();
    await page.waitForURL('**/queue');
    await expect(page.getByTestId('paused-text')).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/s5-board-paused-${theme}-${lang}.png` });
    await ctx.setOffline(true);
    await expect(page.getByTestId('conn-retry')).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/s5-board-offline-${theme}-${lang}.png` });
    await ctx.close();
  });
}
