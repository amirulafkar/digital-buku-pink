import { expect, test } from '@playwright/test';
import { focusReport } from './measure';
import { MOTHERS, MOTHER_PW, checkInUI, ensureMother, loginUI } from './support';

// Behaviour details raised in review: offline home, first-load failure, field errors, confirmation, camera denied.

test('home offline: the check-in control is a focusable button that announces it is unavailable and does nothing', async ({ page, context }) => {
  await ensureMother(MOTHERS.siti);
  await loginUI(page, MOTHERS.siti.phone);
  await expect(page.getByTestId('home-checkin')).toHaveAttribute('href', /\/scan/);
  await context.setOffline(true);
  const c = page.getByTestId('home-checkin');
  await expect(c).toHaveAttribute('aria-disabled', 'true');
  expect(await c.evaluate(e => e.tagName)).toBe('BUTTON');
  expect(await c.getAttribute('href')).toBeNull();
  expect(await c.evaluate(e => getComputedStyle(e).opacity)).toBe('1');
  await c.focus();
  await expect(c).toBeFocused();
  await expect(c).toHaveAttribute('aria-describedby', 'off-line');
  await c.click({ force: true }); // aria-disabled: Playwright would wait forever for it to be enabled
  await expect(page).toHaveURL(/\/home$/); // does nothing
  await expect(page.getByText('You are offline. Scanning is paused until you are back online.')).toBeVisible();
  await context.setOffline(false);
});

test('status first-load failure says there is no status yet and offers a retry that works', async ({ page }) => {
  await ensureMother(MOTHERS.siti);
  await loginUI(page, MOTHERS.siti.phone);
  await checkInUI(page);
  await page.route('**/hubs/**', r => r.abort()); // keep the live connection out of it: a hub that comes up refreshes the screen by itself and would race the click below
  await page.route('**/api/v1/queue/me', r => r.abort());
  await page.getByRole('navigation').getByRole('link', { name: 'Status' }).click();
  await expect(page.getByText('Could not load your visit. Try again.')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Showing the last known status')).toHaveCount(0);
  await page.unroute('**/api/v1/queue/me');
  await page.getByRole('button', { name: 'Refresh now' }).click();
  await expect(page.getByTestId('queue-no')).toHaveText(/^A\d{3}$/);
});

test('login: a network error keeps the password and names the field; wrong details clear it and focus the phone', async ({ page }) => {
  await ensureMother(MOTHERS.dewi);
  await page.goto('/login');
  await page.getByTestId('phone').fill(MOTHERS.dewi.phone);
  await page.getByTestId('password').fill(MOTHER_PW);
  await page.route('**/api/v1/auth/login', r => r.abort());
  await page.getByTestId('login-submit').click();
  await expect(page.getByRole('alert')).toHaveText('No connection. Try again.');
  await expect(page.getByTestId('password')).toHaveValue(MOTHER_PW);
  // A network error is a form-level alert: no field is marked invalid.
  await expect(page.getByTestId('phone')).toHaveAttribute('aria-invalid', 'false');
  await expect(page.getByTestId('password')).toHaveAttribute('aria-invalid', 'false');
  await expect(page.locator('form')).toHaveAttribute('aria-describedby', 'err');
  await page.unroute('**/api/v1/auth/login');

  await page.getByTestId('password').fill(`${MOTHER_PW}-wrong`);
  await page.getByTestId('login-submit').click();
  await expect(page.getByRole('alert')).toHaveText('Phone or password is not right.');
  await expect(page.getByTestId('password')).toHaveValue('');
  await expect(page.getByTestId('phone')).toBeFocused();
  await expect(page.getByTestId('phone')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByTestId('password')).toHaveAttribute('aria-invalid', 'true');
});

test('login and activate: a rate-limit or network error is not tied to any field', async ({ page }) => {
  await page.goto('/activate');
  await page.getByTestId('code').fill('ABCD-EFGH-IJ');
  await page.getByTestId('phone').fill(MOTHERS.priya.phone);
  await page.getByTestId('password').fill(MOTHER_PW);
  await page.route('**/api/v1/auth/activate', r => r.fulfill({ status: 429, json: {} }));
  await page.getByTestId('activate-submit').click();
  await expect(page.getByRole('alert')).toHaveText('Too many tries. Wait a minute.');
  for (const f of ['code', 'phone', 'password']) await expect(page.getByTestId(f)).toHaveAttribute('aria-invalid', 'false');
  await expect(page.getByTestId('password')).toHaveValue(MOTHER_PW);
});

test('activate: a short password points at the password field and focuses it', async ({ page }) => {
  await page.goto('/activate');
  await page.getByTestId('code').fill('ABCD-EFGH-IJ');
  await page.getByTestId('phone').fill(MOTHERS.priya.phone);
  await page.getByTestId('password').fill('short');
  await page.getByTestId('activate-submit').click();
  await expect(page.getByRole('alert')).toContainText('at least 8 characters');
  await expect(page.getByTestId('password')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByTestId('password')).toBeFocused();
  await expect(page.getByTestId('code')).toHaveAttribute('aria-invalid', 'false');
});

test('confirmation says "Checked in" once, with the live region on the sentence only', async ({ page }) => {
  await ensureMother(MOTHERS.dewi);
  await loginUI(page, MOTHERS.dewi.phone);
  await checkInUI(page);
  const text = await page.locator('main').innerText();
  expect((text.match(/Checked in/g) ?? []).length).toBe(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check-in complete');
  await expect(page.locator('[role=status]').filter({ hasText: 'Checked in. Your number is' })).toHaveCount(1);
  await expect(page.locator('.card.big')).not.toHaveAttribute('role', 'status');
});

test('camera denied: recovery steps and a visible retry', async ({ page }) => {
  await ensureMother(MOTHERS.dewi);
  await loginUI(page, MOTHERS.dewi.phone);
  await page.getByRole('link', { name: 'Scan' }).click();
  await page.addInitScript(() => { /* no camera in the test browser */ });
  await page.evaluate(() => { Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) }, configurable: true }); });
  await page.getByTestId('open-camera').click();
  await expect(page.getByTestId('scan-error')).toContainText('Allow the camera in your browser or device settings');
  // One retry button only (no second "Open camera"), plus the ask-staff fallback.
  await expect(page.getByTestId('camera-retry')).toBeVisible();
  await expect(page.getByTestId('open-camera')).toHaveCount(0);
  await expect(page.getByTestId('ask-text')).toHaveCount(0);
  await page.getByTestId('ask-staff').click();
  await expect(page.getByTestId('ask-text')).toHaveText('Ask staff at the counter to check you in. They can do it for you.');
});

test('brand name is the same in English and Bahasa Malaysia', async ({ page }) => {
  await page.goto('/login');
  const en = await page.locator('.brand .name').innerText();
  await page.getByRole('button', { name: 'BM', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ms');
  expect(await page.locator('.brand .name').innerText()).toBe(en);
  expect(en).toBe('Digital Buku Pink');
});

// Every focusable element on every screen shows a 2px, 3:1 focus indicator (not just the first few tab stops).
for (const theme of ['light', 'dark'] as const) {
  test(`focus indicator on EVERY focusable element of every screen, ${theme}`, async ({ browser }) => {
    await ensureMother(MOTHERS.siti);
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: theme });
    await ctx.addInitScript(t => localStorage.setItem('dbp.m.theme', t), theme);
    const page = await ctx.newPage();
    const all = async (label: string) => {
      await page.waitForTimeout(400);
      const count = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]'))
        .filter(e => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0).length);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      const r = await focusReport(page, count + 2);
      expect(r.seen, `${label}: every focusable element was reached`).toBeGreaterThanOrEqual(count);
      expect(r.bad, label).toEqual([]);
      return r.min;
    };
    let min = 99;
    for (const p of ['/activate', '/login']) { await page.goto(p); min = Math.min(min, await all(p)); }
    await loginUI(page, MOTHERS.siti.phone, 'en', theme);
    min = Math.min(min, await all('/home'));
    for (const [n, p] of ['/home', '/scan', '/status', '/settings'].entries()) {
      await page.getByRole('navigation').getByRole('link').nth(n).click();
      await page.waitForURL(`**${p}`);
      min = Math.min(min, await all(p));
    }
    await page.getByRole('navigation').getByRole('link').nth(1).click();
    await checkInUI(page);
    min = Math.min(min, await all('/confirmation'));
    console.log(`FOCUS-ALL ${theme}: every focusable element on every screen, min focus indicator contrast ${min}:1`);
    await ctx.close();
  });
}

test('scan offline: the camera button is a focusable aria-disabled button with a visible offline line, and does nothing', async ({ page, context }) => {
  await ensureMother(MOTHERS.siti);
  await loginUI(page, MOTHERS.siti.phone);
  await page.getByRole('navigation').getByRole('link', { name: 'Scan' }).click();
  await page.waitForURL('**/scan');
  await context.setOffline(true);
  const b = page.getByTestId('open-camera');
  await expect(b).toHaveAttribute('aria-disabled', 'true');
  await expect(b).not.toHaveAttribute('disabled', /.*/);
  await expect(b).toHaveAttribute('aria-describedby', 'scan-off');
  await b.focus();
  await expect(b).toBeFocused();
  await expect(page.getByText('You are offline. Scanning is paused until you are back online.')).toBeVisible();
  await b.click({ force: true });
  await expect(page.getByTestId('scan-error')).toHaveCount(0);
  await context.setOffline(false);
});

test('document titles follow the language and the route', async ({ page }) => {
  await ensureMother(MOTHERS.siti);
  await loginUI(page, MOTHERS.siti.phone);
  await expect(page).toHaveTitle('Home | Digital Buku Pink');
  await page.getByRole('navigation').getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveTitle('Settings | Digital Buku Pink');
  await page.getByRole('button', { name: 'BM', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ms');
  await expect(page).toHaveTitle('Tetapan | Digital Buku Pink');
  await page.getByRole('navigation').getByRole('link', { name: 'Imbas' }).click();
  await expect(page).toHaveTitle('Daftar masuk | Digital Buku Pink');
  await page.getByRole('navigation').getByRole('link', { name: 'Status' }).click();
  await expect(page).toHaveTitle('Lawatan anda | Digital Buku Pink');
});

test('after each navigation on a signed-in screen, focus moves to the page heading', async ({ page }) => {
  await ensureMother(MOTHERS.siti);
  await loginUI(page, MOTHERS.siti.phone);
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toBeFocused();
  await expect(h1).toHaveAttribute('tabindex', '-1');
  for (const [name, heading] of [['Scan', 'Check in'], ['Status', 'Your visit'], ['Settings', 'Settings'], ['Home', /Hello, /]] as const) {
    await page.getByRole('navigation').getByRole('link', { name }).click();
    await expect(h1).toHaveText(heading);
    await expect(h1).toBeFocused();
  }
});
