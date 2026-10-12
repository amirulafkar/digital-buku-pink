import { Page, expect, test } from '@playwright/test';

// Regenerates review screenshots into web/screenshots (git-ignored). Not an assertion test.
// Names follow the earlier set: 01/02 login, 05 search, 06 code issued, 10-21 screens by theme and language, 40 assign dialog.
const PASSWORD = process.env['SEED_STAFF_PASSWORD'] ?? '';
const OUT = 'screenshots';

async function newPage(browser: import('@playwright/test').Browser, theme: 'light' | 'dark', lang: 'en' | 'ms') {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
  await ctx.addInitScript(([t, l]) => { localStorage.setItem('dbp.theme', t); localStorage.setItem('dbp.lang', l); }, [theme, lang]);
  return { ctx, page: await ctx.newPage() };
}

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/Username|Nama pengguna/).fill('aini.demo');
  await page.getByLabel(/Password|Kata laluan/).fill(PASSWORD);
  await page.getByRole('button', { name: /Sign in|Log masuk/ }).click();
  await page.waitForURL('**/queue');
}

test('prepare demo data (runs first)', async ({ page }) => {
  await signIn(page);
  await page.goto('/patients');
  for (const n of ['Siti', 'Dewi', 'Mei Ling', 'Priya']) {
    await page.getByTestId('search-input').fill(n);
    await page.locator('[data-testid=search-results] li', { hasText: `${n} (demo)` }).getByRole('button', { name: 'Check in' }).click();
    await page.getByTestId('patients-msg').getByText('Queue number').waitFor();
  }
  for (const w of ['Nurul (walk-in demo)', 'Hana (walk-in demo)', 'Aisyah (walk-in demo)']) {
    await page.getByTestId('walkin-name').fill(w);
    await page.getByTestId('walkin-submit').click();
    await page.waitForTimeout(400);
  }
  await page.goto('/queue');
  const r = (no: string) => page.locator(`[data-testid=queue-list] > li[data-no=${no}]`);
  await r('A001').locator('[data-action=call]').click();
  await r('A001').locator('[data-action=inroom]').click();
  await r('A002').locator('[data-action=call]').click();
  await r('A003').locator('[data-action=call]').click();
  await r('A003').locator('[data-action=inroom]').click();
  await r('A003').locator('[data-action=complete]').click();
  await r('A004').locator('[data-action=missed]').click();
  await page.getByTestId('missed-reason').click();
  await page.getByRole('option', { name: 'No answer when called' }).click();
  await page.getByTestId('missed-confirm').click();
  await r('A001').locator('[data-action=assign]').click();
  await page.getByTestId('assign-room').click();
  await page.getByRole('option', { name: 'Room 1' }).click();
  await page.getByTestId('assign-nurse').click();
  await page.getByRole('option', { name: 'Aini (demo)' }).click();
  await page.getByTestId('assign-save').click();
  await page.waitForTimeout(800);
});

test('login screens', async ({ browser }) => {
  for (const [n, theme] of [['01', 'light'], ['02', 'dark']] as const) {
    const { ctx, page } = await newPage(browser, theme, 'en');
    await page.goto('/login');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${n}-login-${theme}-en.png` });
    await ctx.close();
  }
});

test('search, code issued and assign dialog (light, English)', async ({ browser }) => {
  const { ctx, page } = await newPage(browser, 'light', 'en');
  await signIn(page);
  await page.goto('/patients');
  await page.getByTestId('search-input').fill('Si');
  await page.locator('[data-testid=search-results] li').first().waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/05-patients-search-light-en.png` });

  await page.goto('/codes');
  await page.getByTestId('search-input').fill('Priya');
  await page.locator('[data-testid=search-results] li').first().getByRole('button', { name: 'Issue code' }).click();
  await page.getByTestId('issued-code').waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/06-code-issued-light-en.png` });
  await page.getByTestId('code-done').click();

  await page.goto('/queue');
  await page.locator('[data-testid=queue-list] > li').first().waitFor();
  await page.locator('[data-action=assign]:enabled').first().click();
  await page.getByTestId('assign-urgent').getByRole('switch').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/40-assign-light-en.png` });
  await ctx.close();
});

test('queue at 1024 and 768 wide, Bahasa Malaysia (light)', async ({ browser }) => {
  for (const [n, width] of [['52', 1024], ['53', 768]] as const) {
    const { ctx, page } = await newPage(browser, 'light', 'ms');
    await page.setViewportSize({ width, height: 900 });
    await signIn(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ms');
    await expect(page.getByRole('heading', { name: 'Giliran hari ini' })).toBeVisible();
    await page.locator('[data-testid=queue-list] > li').first().waitFor();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${n}-queue-${width}-ms.png`, fullPage: true });
    await ctx.close();
  }
});

test('queue at 1024 and 768 wide (light)', async ({ browser }) => {
  for (const [n, width] of [['50', 1024], ['51', 768]] as const) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: 'light' });
    await ctx.addInitScript(() => { localStorage.setItem('dbp.theme', 'light'); localStorage.setItem('dbp.lang', 'en'); });
    const page = await ctx.newPage();
    await signIn(page);
    await page.locator('[data-testid=queue-list] > li').first().waitFor();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${n}-queue-${width}.png`, fullPage: true });
    await ctx.close();
  }
});

const sets = [
  ['10', 'queue', 'light', 'en'], ['11', 'patients', 'light', 'en'], ['12', 'codes', 'light', 'en'],
  ['13', 'queue', 'dark', 'en'], ['14', 'patients', 'dark', 'en'], ['15', 'codes', 'dark', 'en'],
  ['16', 'queue', 'light', 'ms'], ['17', 'patients', 'light', 'ms'], ['18', 'codes', 'light', 'ms'],
  ['19', 'queue', 'dark', 'ms'], ['20', 'patients', 'dark', 'ms'], ['21', 'codes', 'dark', 'ms'],
] as const;

for (const [n, screen, theme, lang] of sets) {
  test(`${screen} ${theme} ${lang}`, async ({ browser }) => {
    const { ctx, page } = await newPage(browser, theme, lang);
    await signIn(page);
    await page.goto(`/${screen}`);
    // The language switch must have applied before anything is captured.
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    const heading = { queue: lang === 'ms' ? 'Giliran hari ini' : "Today's queue", patients: lang === 'ms' ? 'Pesakit' : 'Patients', codes: lang === 'ms' ? 'Kod pengaktifan' : 'Activation codes' }[screen];
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    if (screen === 'queue') await page.locator('[data-testid=queue-list] > li').first().waitFor();
    if (screen === 'codes') await page.getByTestId('codes-table').waitFor().catch(() => undefined);
    if (screen === 'patients') {
      await page.getByTestId('search-input').fill('Si');
      await page.locator('[data-testid=search-results] li').first().waitFor();
    }
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${n}-${screen}-${theme}-${lang}.png` });
    await ctx.close();
  });
}

// ---- State evidence at 1440 wide (loading, empty, error, offline, Missed filter) ----
async function statePage(browser: import('@playwright/test').Browser) {
  const { ctx, page } = await newPage(browser, 'light', 'en');
  await signIn(page);
  return { ctx, page };
}

test('state: loading skeleton', async ({ browser }) => {
  const { ctx, page } = await statePage(browser);
  await page.route('**/api/v1/staff/queue', async r => { await new Promise(res => setTimeout(res, 4000)); await r.continue(); });
  await page.goto('/queue');
  await page.locator('app-skeleton').first().waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/60-loading.png` });
  await ctx.close();
});

test('state: empty queue', async ({ browser }) => {
  const { ctx, page } = await statePage(browser);
  await page.route('**/api/v1/staff/queue', r => r.fulfill({ json: { queueDate: '2026-01-01', entries: [] } }));
  await page.goto('/queue');
  await page.locator('app-empty').first().waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/61-empty.png` });
  await ctx.close();
});

test('state: error with retry', async ({ browser }) => {
  const { ctx, page } = await statePage(browser);
  await page.route('**/api/v1/staff/queue', r => r.fulfill({ status: 500, json: { error: 'x' } }));
  await page.goto('/queue');
  await page.locator('app-error').first().waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/62-error.png` });
  await ctx.close();
});

test('state: offline banner', async ({ browser }) => {
  const { ctx, page } = await statePage(browser);
  await page.locator('[data-testid=queue-list] > li').first().waitFor();
  await page.route('**/api/v1/staff/queue', r => r.abort());
  await page.getByText('System is down. Use the paper queue and re-key entries later.').waitFor({ timeout: 12_000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/63-offline.png` });
  await ctx.close();
});

test('state: Missed filter', async ({ browser }) => {
  const { ctx, page } = await statePage(browser);
  await page.locator('[data-testid=queue-list] > li').first().waitFor();
  await page.locator('[data-tab=missed]').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/64-missed-filter.png` });
  await ctx.close();
});
