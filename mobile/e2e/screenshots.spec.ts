import { expect, test } from '@playwright/test';
import { MOTHERS, MOTHER_PW, checkInUI, ensureMother, loginUI } from './support';

// Writes review screenshots into mobile/screenshots (git-ignored). The language switch is asserted before every capture.
const OUT = 'screenshots';
const HEADING = {
  en: { activate: 'Activate your account', login: 'Log in', home: /Hello, / , scan: 'Check in', confirmation: 'Check-in complete', status: 'Your visit', settings: 'Settings' },
  ms: { activate: 'Aktifkan akaun anda', login: 'Log masuk', home: /Helo, /, scan: 'Daftar masuk', confirmation: 'Pendaftaran selesai', status: 'Lawatan anda', settings: 'Tetapan' },
} as const;

for (const theme of ['light', 'dark'] as const) {
  for (const lang of ['en', 'ms'] as const) {
    test(`phone screenshots, ${theme}, ${lang}`, async ({ browser }) => {
      await ensureMother(MOTHERS.siti);
      const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: theme, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      const shot = async (n: string, name: keyof (typeof HEADING)['en']) => {
        await expect(page.locator('html')).toHaveAttribute('lang', lang);
        await expect(page.getByRole('heading', { name: HEADING[lang][name], level: 1 })).toBeVisible();
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT}/${n}-${name}-${theme}-${lang}.png`, fullPage: true });
      };
      await page.addInitScript(([l, t]) => { localStorage.setItem('dbp.m.lang', l); localStorage.setItem('dbp.m.theme', t); }, [lang, theme]);
      await page.goto('/activate'); await shot('01', 'activate');
      await page.goto('/login'); await shot('02', 'login');
      await loginUI(page, MOTHERS.siti.phone, lang, theme); await shot('03', 'home');
      await page.getByRole('navigation').getByRole('link').nth(1).click(); await page.waitForURL('**/scan'); await shot('04', 'scan');
      await checkInUI(page); await shot('05', 'confirmation');
      await page.getByTestId('open-status').click(); await page.waitForURL('**/status'); await shot('06', 'status');
      await page.getByRole('navigation').getByRole('link').nth(3).click(); await page.waitForURL('**/settings'); await shot('07', 'settings');
      await ctx.close();
    });
  }
}

// Error and failure states, EN and BM. The language is asserted before each capture, plus the BM wording of the message itself.
const MSG = {
  en: { login: 'Phone or password is not right.', offline: 'You are offline. Scanning is paused', camera: 'Camera is off.', expired: 'This code has expired. Scan the current one.', status: 'Could not load your visit. Try again.' },
  ms: { login: 'Nombor telefon atau kata laluan tidak betul.', offline: 'Anda di luar talian. Pengimbasan dijeda', camera: 'Kamera ditutup.', expired: 'Kod ini telah tamat. Imbas kod yang terkini.', status: 'Lawatan anda tidak dapat dimuatkan. Cuba lagi.' },
} as const;

for (const theme of ['light', 'dark'] as const) {
  for (const lang of ['en', 'ms'] as const) {
    test(`error-state screenshots, ${theme}, ${lang}`, async ({ browser }) => {
      await ensureMother(MOTHERS.dewi);
      await ensureMother(MOTHERS.meiling);
      await ensureMother(MOTHERS.nadia, true);
      const mk = async () => {
        const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: theme, deviceScaleFactor: 2 });
        await ctx.addInitScript(([l, t]) => { localStorage.setItem('dbp.m.lang', l); localStorage.setItem('dbp.m.theme', t); }, [lang, theme]);
        return { ctx, page: await ctx.newPage() };
      };
      const snap = async (page: import('@playwright/test').Page, n: string, name: string, text: string) => {
        await expect(page.locator('html')).toHaveAttribute('lang', lang);
        await expect(page.getByText(text).first()).toBeVisible();
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${OUT}/${n}-${name}-${theme}-${lang}.png`, fullPage: true });
      };
      let { ctx, page } = await mk();
      await page.goto('/login');
      await page.getByTestId('phone').fill(MOTHERS.dewi.phone);
      await page.getByTestId('password').fill(`${MOTHER_PW}-wrong`);
      await page.getByTestId('login-submit').click();
      await snap(page, '20', 'login-error', MSG[lang].login);
      await ctx.close();

      ({ ctx, page } = await mk());
      await loginUI(page, MOTHERS.dewi.phone, lang, theme);
      await page.getByTestId('home-checkin').waitFor();
      await ctx.setOffline(true);
      await snap(page, '21', 'home-offline', MSG[lang].offline);
      await ctx.setOffline(false);
      await page.route('**/api/v1/queue/me', r => r.abort());
      await page.getByRole('navigation').getByRole('link').nth(2).click();
      await snap(page, '24', 'status-failure', MSG[lang].status);
      await ctx.close();

      ({ ctx, page } = await mk());
      await loginUI(page, MOTHERS.meiling.phone, lang, theme);
      await page.getByRole('navigation').getByRole('link').nth(1).click();
      await page.evaluate(() => Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: () => Promise.reject(new DOMException('no', 'NotAllowedError')) }, configurable: true }));
      await page.getByTestId('open-camera').click();
      await snap(page, '22', 'camera-denied', MSG[lang].camera);
      await ctx.close();

      ({ ctx, page } = await mk());
      await loginUI(page, MOTHERS.nadia.phone, lang, theme);
      await page.getByRole('navigation').getByRole('link').nth(1).click();
      await page.getByTestId('dev-token').fill('not-a-real-token-value');
      await page.getByTestId('dev-submit').click();
      await snap(page, '23', 'expired-qr', MSG[lang].expired);
      await ctx.close();
    });
  }
}
