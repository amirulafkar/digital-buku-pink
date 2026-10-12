import AxeBuilder from '@axe-core/playwright';
import { Browser, Page, expect, test } from '@playwright/test';

const PASSWORD = process.env['SEED_STAFF_PASSWORD'] ?? '';

async function login(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/queue');
}

async function addWalkIn(page: Page, name: string) {
  await page.goto('/patients');
  await page.getByTestId('walkin-name').fill(name);
  await page.getByTestId('walkin-submit').click();
  await expect(page.getByTestId('patients-msg')).toContainText('Queue number');
}

const row = (page: Page, name: string) => page.locator('[data-testid=queue-list] > li', { hasText: name });
const chip = (r: import('@playwright/test').Locator, text: string) => r.locator('app-status-chip', { hasText: text });

test.beforeAll(() => { expect(PASSWORD, 'SEED_STAFF_PASSWORD must be set in db/.env').not.toBe(''); });

test('S3-E12 top bar walk-in, filter tabs agree with the rows, rooms panel is read-only', async ({ page }) => {
  const name = `Tester Dua Belas ${Date.now()}`;
  await login(page, 'aini.demo');
  await expect(page.getByTestId('topbar-walkin')).toHaveCount(1);
  await page.getByTestId('topbar-walkin').click();
  await page.getByTestId('dialog-walkin-name').fill(name);
  await page.getByTestId('dialog-walkin-submit').click();
  await expect(row(page, name)).toBeVisible({ timeout: 6000 });
  const total = await page.locator('[data-testid=queue-list] > li').count();
  const count = async (tab: string) => Number((await page.locator(`[data-tab=${tab}] .c`).innerText()).trim());
  expect(await count('all')).toBe(total);
  const sum = (await Promise.all(['waiting', 'called', 'in_room', 'completed', 'missed'].map(count))).reduce((a, b) => a + b, 0);
  expect(sum).toBe(total);
  await page.locator('[data-tab=completed]').click();
  expect(await page.locator('[data-testid=queue-list] > li').count()).toBe(await count('completed'));
  await page.locator('[data-tab=all]').click();
  // Rooms panel lists status only: no buttons inside it.
  await expect(page.locator('[data-testid=rooms-status] button')).toHaveCount(0);
  await expect(page.locator('[data-testid=rooms-status]')).toContainText('Room 1');
  // Accessible names on row actions and a named theme toggle.
  await expect(row(page, name).locator('[data-action=call]')).toHaveAttribute('aria-label', /^Call W\d{3}, Tester Dua Belas/);
  await expect(page.getByRole('button', { name: /Dark theme|Light theme/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'EN', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

for (const width of [1440, 1024, 768]) {
  test(`S3-E13 layout at ${width}px: no horizontal overflow, MOH notice visible, targets at least 44px`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    await login(page, 'aini.demo');
    await expect(page.locator('[data-testid=queue-list] > li').first()).toBeVisible();
    await page.waitForTimeout(600);
    for (const path of ['/queue', '/patients', '/codes']) {
      await page.goto(path);
      await page.waitForTimeout(500);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, `${path} overflow`).toBeLessThanOrEqual(0);
      await expect(page.getByText('Not approved by the Ministry of Health')).toBeVisible();
    }
    await page.goto('/queue');
    await page.locator('[data-testid=queue-list] > li').first().waitFor();
    const small = await page.evaluate(() => [...document.querySelectorAll('button:not(:disabled), a[href]')]
      .filter(e => { const r = (e as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 43.5 && !e.classList.contains('skip'); })
      .map(e => (e.textContent ?? '').trim().slice(0, 30) + ':' + Math.round((e as HTMLElement).getBoundingClientRect().height)));
    expect(small).toEqual([]);
    await ctx.close();
  });
}

test('S3-E1 notice visible and BM switch translates every visible string', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByText('Not approved by the Ministry of Health')).toBeVisible();
  await login(page, 'aini.demo');
  await expect(page.getByText('Not approved by the Ministry of Health')).toBeVisible();
  await page.getByRole('button', { name: 'BM', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Giliran hari ini' })).toBeVisible();
  await expect(page.getByText('Tidak diluluskan oleh Kementerian Kesihatan')).toBeVisible();
  const text = await page.locator('body').innerText();
  for (const en of ["Today's queue", 'Sign out', 'Patients', 'Checked in', 'Not approved', 'Read-only', 'Quick actions', 'Rooms', 'Free', 'Search name']) expect(text).not.toContain(en);
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.getByRole('heading', { name: "Today's queue" })).toBeVisible();
});

test('S3-E2 search result check in appears in queue as a staff entry', async ({ page }) => {
  await login(page, 'aini.demo');
  await page.goto('/patients');
  await page.getByTestId('search-input').fill('Siti');
  const hit = page.locator('[data-testid=search-results] li', { hasText: 'Siti (demo)' });
  await expect(hit).toBeVisible();
  await hit.getByRole('button', { name: 'Check in' }).click();
  await expect(page.getByTestId('patients-msg')).toContainText('Queue number');
  const resp = page.waitForResponse(r => r.url().endsWith('/api/v1/staff/queue') && r.ok());
  await page.getByRole('link', { name: 'Queue', exact: true }).first().click();
  const body = await (await resp).json();
  const mine = body.entries.find((e: { displayName: string }) => e.displayName === 'Siti (demo)');
  expect(mine.source).toBe('staff');
  await expect(row(page, 'Siti (demo)')).toBeVisible({ timeout: 6000 });
});

test('S3-E3 call, in room, complete change the chip and disable illegal moves', async ({ page }) => {
  const name = `Tester Tiga ${Date.now()}`;
  await login(page, 'aini.demo');
  await addWalkIn(page, name);
  await page.goto('/queue');
  const r = row(page, name);
  await expect(chip(r, 'Waiting')).toBeVisible();
  await expect(r.locator('[data-action=complete]')).toBeDisabled();
  await r.locator('[data-action=call]').click();
  await expect(chip(r, 'Called')).toBeVisible();
  await r.locator('[data-action=inroom]').click();
  await expect(chip(r, 'In room')).toBeVisible();
  await r.locator('[data-action=complete]').click();
  await expect(chip(r, 'Done')).toBeVisible();
  await expect(r.locator('[data-action=complete]')).toBeDisabled();
  await expect(r.locator('[data-action=call]')).toBeDisabled();
});

test('S3-E4 assign room and nurse shows on the row and keeps queue order', async ({ page }) => {
  const name = `Tester Empat ${Date.now()}`;
  await login(page, 'aini.demo');
  await addWalkIn(page, name);
  await page.goto('/queue');
  const order = async () => page.locator('[data-testid=queue-list] .no').allInnerTexts();
  await expect(row(page, name)).toBeVisible();
  const before = await order();
  await row(page, name).locator('[data-action=assign]').click();
  await page.getByTestId('assign-room').click();
  await page.getByRole('option', { name: 'Room 2' }).click();
  await page.getByTestId('assign-nurse').click();
  await page.getByRole('option', { name: 'Aini (demo)' }).click();
  await page.getByTestId('assign-save').click();
  await expect(row(page, name).locator('[data-col=room]')).toHaveText('2');
  await expect(row(page, name).locator('[data-col=nurse]')).toHaveText('Aini (demo)');
  await expect(chip(row(page, name), 'Waiting')).toBeVisible(); // assign never changes status
  await page.waitForTimeout(6000); // next poll
  expect(await order()).toEqual(before);
});

test('S3-E5 urgent needs a reason, then shows the Urgent chip', async ({ page }) => {
  const name = `Tester Lima ${Date.now()}`;
  await login(page, 'aini.demo');
  await addWalkIn(page, name);
  await page.goto('/queue');
  await row(page, name).locator('[data-action=assign]').click();
  await page.getByTestId('assign-urgent').getByRole('switch').click();
  await expect(page.getByTestId('assign-save')).toBeDisabled();
  await page.getByTestId('assign-reason').click();
  await page.getByRole('option', { name: 'Accessibility need' }).click();
  await expect(page.getByTestId('assign-save')).toBeEnabled();
  await page.getByTestId('assign-save').click();
  await expect(chip(row(page, name), 'Urgent')).toBeVisible();
});

test('S3-E6 issued code is shown once and the list shows it unused', async ({ page }) => {
  await login(page, 'aini.demo');
  await page.goto('/codes');
  await page.getByTestId('search-input').fill('Priya');
  await page.locator('[data-testid=search-results] li', { hasText: 'Priya (demo)' }).getByRole('button', { name: 'Issue code' }).click();
  const code = page.getByTestId('issued-code');
  await expect(code).toHaveText(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{2}$/);
  await expect(page.getByText('Valid for 7 days, one use.')).toBeVisible();
  await page.getByTestId('code-done').click();
  await page.reload();
  await expect(page.getByTestId('issued-code')).toHaveCount(0);
  await expect(page.locator('[data-testid=codes-table] tbody tr[data-status=unused]', { hasText: 'Priya (demo)' }).first()).toBeVisible();
});

test('S3-E7 search needs 2 characters and shows only name and appointment', async ({ page }) => {
  await login(page, 'aini.demo');
  await page.goto('/patients');
  const calls: string[] = [];
  const allUrls: string[] = [];
  page.on('request', r => { allUrls.push(r.url()); if (r.url().includes('/staff/patients')) calls.push(r.url()); });
  await page.getByTestId('search-input').fill('S');
  await page.waitForTimeout(700);
  expect(calls).toHaveLength(0);
  await page.getByTestId('search-input').fill('Dewi');
  const hit = page.locator('[data-testid=search-results] li', { hasText: 'Dewi (demo)' });
  await expect(hit).toBeVisible();
  const text = await hit.innerText();
  expect(text).toMatch(/Appointment \d{2}:\d{2}/);
  expect(text).not.toMatch(/0100000\d{3}/);
  expect(calls.length).toBe(1);

  // The typed text is only ever in the POST body: not in any request URL, resource entry or the page URL.
  const searchReqs = allUrls.filter(u => u.includes('/staff/patients'));
  expect(searchReqs).toEqual([expect.stringMatching(/\/api\/v1\/staff\/patients\/search$/)]);
  expect(allUrls.join(' ')).not.toContain('Dewi');
  expect(page.url()).not.toContain('Dewi');
  const entries = await page.evaluate(() => performance.getEntriesByType('resource').map(r => r.name));
  expect(entries.join(' ')).not.toContain('Dewi');
});

test('S3-E14 top bar search hands the text over in memory, never in the URL', async ({ page }) => {
  const allUrls: string[] = [];
  page.on('request', r => allUrls.push(r.url()));
  await login(page, 'aini.demo');
  await page.getByTestId('global-search').fill('Priya');
  await page.getByTestId('global-search').press('Enter');
  await expect(page).toHaveURL(/\/patients$/);
  await expect(page.locator('[data-testid=search-results] li', { hasText: 'Priya (demo)' })).toBeVisible();
  await expect(page.getByTestId('search-input')).toHaveValue('Priya');
  expect(page.url()).not.toContain('Priya');
  expect(allUrls.join(' ')).not.toContain('Priya');
  expect(await page.evaluate(() => performance.getEntriesByType('resource').map(r => r.name).join(' '))).not.toContain('Priya');
  // Empty-result state offers a next step.
  await page.getByTestId('search-input').fill('Zzzzq');
  await expect(page.getByTestId('search-clear')).toBeVisible();
  await page.getByTestId('search-clear').click();
  await expect(page.getByTestId('search-input')).toHaveValue('');
});

test('S3-E8 clinic admin is read-only and cannot reach patients', async ({ page }) => {
  await login(page, 'faridah.demo');
  await expect(page.locator('[data-action]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Patients' })).toHaveCount(0);
  await expect(page.getByText('You can view the queue but not change it.')).toBeVisible();
  await page.goto('/patients');
  await expect(page).toHaveURL(/\/queue$/);
  await page.getByRole('link', { name: 'Codes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Activation codes' })).toBeVisible();
  await expect(page.getByTestId('search-input')).toHaveCount(0);
});

test('S3-E9 offline banner and disabled writes, then recovery', async ({ page }) => {
  const name = `Tester Sembilan ${Date.now()}`;
  await page.route('**/hubs/**', r => r.abort()); // API down means the live hub is down too; polling then detects it
  await login(page, 'aini.demo');
  await addWalkIn(page, name);
  await page.goto('/queue');
  await expect(row(page, name)).toBeVisible();
  await page.route('**/api/v1/staff/queue', r => r.abort());
  await expect(page.getByText('System is down. Use the paper queue and re-key entries later.')).toBeVisible({ timeout: 12_000 });
  await expect(row(page, name).locator('[data-action=call]')).toBeDisabled();
  await page.unroute('**/api/v1/staff/queue');
  await expect(page.getByText('System is down. Use the paper queue and re-key entries later.')).toBeHidden({ timeout: 25_000 });
  await expect(row(page, name).locator('[data-action=call]')).toBeEnabled();
});

test('S3-E10 no waiting-time or estimate text on any screen in BM or EN', async ({ page }) => {
  const bad = /wait(ing)?\s*time|estimat|average|anggaran|purata|masa\s+menunggu|\b\d+\s*(min|minit|minutes?)\b/i;
  await login(page, 'aini.demo');
  for (const lang of ['EN', 'BM']) {
    await page.getByRole('button', { name: lang, exact: true }).click();
    for (const path of ['/queue', '/patients', '/codes']) {
      await page.goto(path);
      if (path === '/patients') { await page.getByTestId('search-input').fill('Si'); await page.waitForTimeout(800); }
      await page.waitForTimeout(300);
      const body = await page.locator('body').innerText();
      expect(body, `${lang} ${path}`).not.toMatch(bad);
      if (lang === 'EN') expect(body, `EN view has Malay words on ${path}`).not.toMatch(/(Bilik|Menunggu|Giliran|Selesai|Tidak hadir|Pesakit|Kod|Tetapkan|Panggil)/);
    }
  }
});

async function scan(browser: Browser, theme: 'light' | 'dark') {
  const ctx = await browser.newContext({ colorScheme: theme });
  await ctx.addInitScript(t => localStorage.setItem('dbp.theme', t), theme);
  const page = await ctx.newPage();
  const results: Record<string, string[]> = {};
  const check = async (label: string) => {
    await page.waitForTimeout(700); // let entry animations finish so contrast is measured at full opacity
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    results[label] = r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${v.id}: ${v.nodes[0]?.html.slice(0, 120)}`);
  };
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible();
  await check('login');
  await login(page, 'aini.demo');
  await expect(page.locator('[data-testid=queue-list] > li').first()).toBeVisible();
  await check('queue');
  await page.goto('/patients');
  await page.getByTestId('search-input').fill('Si');
  await expect(page.locator('[data-testid=search-results] li').first()).toBeVisible();
  await check('patients');
  await page.goto('/codes');
  await expect(page.getByTestId('codes-table')).toBeVisible();
  await check('codes');
  await ctx.close();
  return results;
}

for (const theme of ['light', 'dark'] as const) {
  test(`S3-E11 axe scan finds no serious violations (${theme})`, async ({ browser }) => {
    const results = await scan(browser, theme);
    expect(results).toEqual({ login: [], queue: [], patients: [], codes: [] });
  });
}
