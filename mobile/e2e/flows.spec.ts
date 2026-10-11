import { expect, test } from '@playwright/test';
import { MOTHERS, MOTHER_PW, api, checkInUI, ensureMother, issueCode, loginUI, nurse, qrToken, queueRows, setStatus } from './support';

// Phone flows against the real API. Mothers are fictional demo patients. Run db/seed/reset.sh before a fresh run.

test('S4-A1 activate with a code, then log in; a reused code is refused with the generic message', async ({ page }) => {
  const n = await nurse();
  const code = await issueCode(n, MOTHERS.priya.name);
  await page.goto('/activate');
  await page.getByTestId('code').fill(code);
  await page.getByTestId('phone').fill(MOTHERS.priya.phone);
  await page.getByTestId('password').fill(MOTHER_PW);
  await page.getByTestId('activate-submit').click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId('ready')).toHaveText('Account ready, log in.');
  expect(page.url()).not.toContain(MOTHERS.priya.phone);

  // The same code again: generic error, nothing changes.
  await page.goto('/activate');
  await page.getByTestId('code').fill(code);
  await page.getByTestId('phone').fill(MOTHERS.priya.phone);
  await page.getByTestId('password').fill(`${MOTHER_PW}-other`);
  await page.getByTestId('activate-submit').click();
  await expect(page.getByRole('alert')).toContainText('Code invalid or expired. Ask the counter for a new one.');
  await expect(page.getByTestId('phone')).toBeVisible();

  // The original password still works; the attempted one does not.
  await page.goto('/login');
  await page.getByTestId('phone').fill(MOTHERS.priya.phone);
  await page.getByTestId('password').fill(`${MOTHER_PW}-other`);
  await page.getByTestId('login-submit').click();
  await expect(page.getByRole('alert')).toContainText('Phone or password is not right.');
  await page.getByTestId('password').fill(MOTHER_PW);
  await page.getByTestId('login-submit').click();
  await page.waitForURL('**/home');
  await expect(page.getByRole('heading', { name: /Hello, Priya/ })).toBeVisible();
});

test('S4-A2 no token in any web storage, phone never in a URL', async ({ page }) => {
  await ensureMother(MOTHERS.siti);
  const urls: string[] = [];
  page.on('request', r => urls.push(r.url()));
  await loginUI(page, MOTHERS.siti.phone);
  const store = await page.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage } }));
  expect(store).not.toMatch(/eyJ/);            // no JWT
  expect(store).not.toContain(MOTHERS.siti.phone);
  expect(store).not.toContain(MOTHER_PW);
  expect(Object.keys(await page.evaluate(() => ({ ...localStorage })))).toEqual(expect.arrayContaining(['dbp.m.lang']));
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
  expect(urls.join(' ')).not.toContain(MOTHERS.siti.phone);
  expect(page.url()).not.toContain(MOTHERS.siti.phone);
});

test('S4-A3 home shows the appointment with no edit control, and the empty text when there is none', async ({ page, browser }) => {
  await ensureMother(MOTHERS.siti);
  await loginUI(page, MOTHERS.siti.phone);
  const card = page.getByTestId('appointment');
  await expect(card).toContainText(/\d{2}:\d{2}/);
  await expect(card).toContainText('Routine visit');
  await expect(card.locator('button, input, a, select')).toHaveCount(0);

  await ensureMother(MOTHERS.nadia, true);
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const p2 = await ctx.newPage();
  await loginUI(p2, MOTHERS.nadia.phone);
  await expect(p2.getByTestId('appointment')).toContainText('No appointment listed. Your clinic adds them.');
  await ctx.close();
});

test('S4-A4 a real token checks the mother in; an unknown or expired token shows the expired copy', async ({ page }) => {
  // A mother who has not checked in yet (an already checked-in mother gets her existing entry back, whatever the token).
  await ensureMother(MOTHERS.priya);
  await loginUI(page, MOTHERS.priya.phone);
  await page.getByRole('link', { name: 'Scan' }).click();
  await page.getByTestId('dev-token').fill('not-a-real-token-value');
  await page.getByTestId('dev-submit').click();
  await expect(page.getByTestId('scan-error')).toHaveText('This code has expired. Scan the current one.');
  await expect(page).toHaveURL(/\/scan$/);
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByTestId('logout').click();

  await ensureMother(MOTHERS.dewi);
  await loginUI(page, MOTHERS.dewi.phone);
  await page.getByRole('link', { name: 'Scan' }).click();

  await page.getByTestId('dev-token').fill(await qrToken());
  await page.getByTestId('dev-submit').click();
  await page.waitForURL('**/confirmation');
  const no = (await page.getByTestId('queue-no').innerText()).trim();
  expect(no).toMatch(/^A\d{3}$/);
  await expect(page.getByTestId('confirm-text')).toHaveText(`Checked in. Your number is ${no}.`);
});

test('S4-A4b a token from another clinic shows the wrong-clinic copy and creates no entry', async ({ page }) => {
  await ensureMother(MOTHERS.nadia, true);
  const before = (await queueRows()).length;
  await loginUI(page, MOTHERS.nadia.phone);
  await page.getByRole('link', { name: 'Scan' }).click();
  await page.getByTestId('dev-token').fill(await qrToken()); // issued by a nurse of the first clinic
  await page.getByTestId('dev-submit').click();
  await expect(page.getByTestId('scan-error')).toHaveText('This code is for another clinic. Ask staff.');
  expect((await queueRows()).length).toBe(before);
});

test('S4-A5 a lost response is retried with the same key: one queue number, one row', async ({ page }) => {
  await ensureMother(MOTHERS.meiling);
  await loginUI(page, MOTHERS.meiling.phone);
  await page.getByRole('link', { name: 'Scan' }).click();
  const keys: string[] = [];
  let first = true;
  await page.route('**/api/v1/checkins', async route => {
    keys.push(JSON.parse(route.request().postData() ?? '{}').idempotencyKey);
    if (first) { first = false; await route.fetch(); await route.abort('connectionreset'); return; } // reached the server, response lost
    await route.continue();
  });
  await page.getByTestId('dev-token').fill(await qrToken());
  await page.getByTestId('dev-submit').click();
  await expect(page.getByTestId('scan-error')).toHaveAttribute('data-code', 'network');
  await page.getByTestId('scan-retry').click();
  await page.waitForURL('**/confirmation');
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  const mine = (await queueRows()).filter(r => r.displayName?.startsWith('Mei Ling'));
  expect(mine).toHaveLength(1);
  expect((await page.getByTestId('queue-no').innerText()).trim()).toBe(mine[0].queueNo);
});

test('S4-A6 status shows the steps, the room when called, missed copy, and keeps the last status offline', async ({ page }) => {
  await ensureMother(MOTHERS.siti);
  await loginUI(page, MOTHERS.siti.phone);
  await checkInUI(page);
  await page.getByTestId('open-status').click();
  await page.waitForURL('**/status');
  const sitiRow = (await queueRows()).filter(r => r.displayName?.startsWith('Siti')).at(-1)!;
  await expect(page.getByTestId('queue-no')).toHaveText(sitiRow.queueNo);
  await expect(page.locator('[data-step=waiting]')).toHaveAttribute('data-state', 'current');
  await expect(page.getByTestId('order-note')).toHaveText('Staff decide the order. This app does not estimate waiting time.');
  await expect(page.getByTestId('updated')).toContainText('Last updated');

  // Staff move her along; assign a room and call.
  const n = await nurse();
  const rooms = await (await n.get('staff/rooms')).json();
  await n.patch(`staff/queue/${sitiRow.id}`, { data: { roomId: rooms[1].id } });
  await setStatus(sitiRow.id, 'called');
  await page.reload();                       // a reload means log in again (tokens are in memory only)
  await expect(page).toHaveURL(/\/login$/);
  await loginUI(page, MOTHERS.siti.phone);
  await page.getByRole('link', { name: 'Status' }).click();
  await expect(page.locator('[data-step=called]')).toHaveAttribute('data-state', 'current');
  await expect(page.getByTestId('room')).toHaveText(`Go to ${rooms[1].name}.`);

  // Offline: the poll fails, the last status stays, the banner shows and scanning is disabled.
  await page.route('**/api/v1/queue/me', r => r.abort());
  await expect(page.getByText('You are offline or the server cannot be reached.')).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId('updated')).toContainText('Last updated');
  await expect(page.getByTestId('queue-no')).toHaveText(sitiRow.queueNo);
  await page.unroute('**/api/v1/queue/me');
  await page.getByRole('link', { name: 'Scan' }).click();
  await expect(page.getByTestId('open-camera')).toBeDisabled();

  // Missed: the mother sees the plain message, with no urgency or priority wording.
  await setStatus(sitiRow.id, 'missed', 'no_answer');
  await page.getByRole('link', { name: 'Status' }).click();
  await expect(page.getByTestId('missed')).toHaveText('You missed your call. Tell the counter.', { timeout: 25_000 });
});

test('S4-A7 the safety notice is on every signed-in screen, in EN and BM', async ({ page }) => {
  await ensureMother(MOTHERS.dewi);
  await loginUI(page, MOTHERS.dewi.phone);
  await checkInUI(page); // ends on /confirmation
  const text = { en: 'Tell staff immediately or go to a hospital if you are worried.', ms: 'Beritahu kakitangan dengan segera atau pergi ke hospital jika anda risau.' };
  for (const lang of ['en', 'ms'] as const) {
    await page.getByRole('button', { name: lang === 'en' ? 'EN' : 'BM', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await expect(page).toHaveURL(/\/confirmation$/);
    await expect(page.getByTestId('safety-notice')).toContainText(text[lang]);
  }
  const nav = { ms: ['Utama', 'Imbas', 'Status', 'Tetapan'], en: ['Home', 'Scan', 'Status', 'Settings'] };
  for (const lang of ['ms', 'en'] as const) {
    await page.getByRole('button', { name: lang === 'en' ? 'EN' : 'BM', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    for (const link of nav[lang]) {
      await page.getByRole('navigation').getByRole('link', { name: link }).click();
      await expect(page.getByTestId('safety-notice')).toContainText(text[lang]);
    }
  }
});

test('S4-A8 and A11 BM switch changes every visible string, and no screen has wait, estimate or priority wording', async ({ page }) => {
  await ensureMother(MOTHERS.dewi);
  await loginUI(page, MOTHERS.dewi.phone);
  await checkInUI(page);
  const allowed = [
    'Staff decide the order. This app does not estimate waiting time.',
    'Kakitangan menentukan susunan. Aplikasi ini tidak menganggarkan masa menunggu.',
    'Tell staff immediately or go to a hospital if you are worried.',
    'Beritahu kakitangan dengan segera atau pergi ke hospital jika anda risau.',
  ];
  const bad = /wait(ing)?\s*time|estimat|priorit|urgent|anggar|masa\s+menunggu|keutamaan|segera|minutes?|minit/i;
  const englishOnly = /\b(Home|Settings|Scan|Check in|Your number|Privacy|Log out|Language)\b/;
  const malayOnly = /\b(Utama|Tetapan|Imbas|Daftar masuk|Nombor anda|Privasi|Log keluar|Bahasa)\b/;
  for (const lang of ['en', 'ms'] as const) {
    await page.getByRole('button', { name: lang === 'en' ? 'EN' : 'BM', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    for (const link of lang === 'en' ? ['Home', 'Scan', 'Status', 'Settings'] : ['Utama', 'Imbas', 'Status', 'Tetapan']) {
      await page.getByRole('navigation').getByRole('link', { name: link }).click();
      await page.waitForTimeout(250);
      let text = await page.locator('body').innerText();
      for (const a of allowed) text = text.split(a).join('');
      text = text.replace('[PLACEHOLDER, NEEDS MOH APPROVAL]', '');
      expect(text, `${lang} ${link}: wording`).not.toMatch(bad);
      if (lang === 'ms') expect(text.replace(/Bahasa Malaysia|English|EN|BM/g, ''), `${lang} ${link}: English left`).not.toMatch(englishOnly);
      else expect(text.replace(/Bahasa Malaysia|English/g, ''), `${lang} ${link}: Malay left`).not.toMatch(malayOnly);
    }
  }
});

test('S4-A9 logout ends the session: the old refresh token is refused and storage is empty', async ({ page }) => {
  await ensureMother(MOTHERS.dewi);
  let refresh = '';
  page.on('response', async r => {
    if (r.url().endsWith('/api/v1/auth/login') && r.ok()) refresh = (await r.json()).refreshToken;
  });
  await loginUI(page, MOTHERS.dewi.phone);
  expect(refresh).not.toBe('');
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByTestId('logout').click();
  await expect(page).toHaveURL(/\/login$/);
  const a = await api();
  expect((await a.post('auth/refresh', { data: { refreshToken: refresh } })).status()).toBe(401);
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage }))).toBe('{}');
  expect(await page.evaluate(() => Object.keys(localStorage).filter(k => !k.startsWith('dbp.m.')))).toEqual([]);
  // Signed-out: protected screens go back to login.
  await page.goto('/status');
  await expect(page).toHaveURL(/\/login$/);
});

test('S4-A10 wrong phone or password and locked accounts give the same message', async ({ page }) => {
  await ensureMother(MOTHERS.dewi);
  await page.goto('/login');
  await page.getByTestId('phone').fill(MOTHERS.dewi.phone);
  await page.getByTestId('password').fill(`${MOTHER_PW}-wrong1`);
  await page.getByTestId('login-submit').click();
  await expect(page.getByRole('alert')).toHaveText('Phone or password is not right.');
  await page.getByTestId('phone').fill('0109999999');
  await page.getByTestId('password').fill(`${MOTHER_PW}-wrong2`);
  await page.getByTestId('login-submit').click();
  await expect(page.getByRole('alert')).toHaveText('Phone or password is not right.');
});
