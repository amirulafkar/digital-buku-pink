import AxeBuilder from '@axe-core/playwright';
import { Page, expect, test } from '@playwright/test';
import { contrast, focusReport, offenders } from './measure';
import { MOTHERS, MOTHER_PW, checkInUI, ensureMother, loginUI, qrToken } from './support';

// Accessibility bars on every phone screen: axe, 44px targets, text and border contrast, focus ring, reflow.
const SIGNED_IN = ['home', 'scan', 'status', 'settings'] as const;

async function scan(page: Page, label: string) {
  await page.waitForTimeout(500);
  const axe = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze())
    .violations.filter(v => v.impact === 'serious' || v.impact === 'critical' || v.impact === 'moderate').map(v => `${v.id}: ${v.nodes[0]?.html.slice(0, 100)}`);
  const c = await contrast(page);
  const t = await offenders(page);
  return { label, axe, contrast: c.fails, targets: t, minText: c.minText, minBorder: c.minBorder };
}

for (const theme of ['light', 'dark'] as const) {
  for (const lang of ['en', 'ms'] as const) {
    test(`A12 axe, contrast and target size on every screen, ${theme}, ${lang}`, async ({ browser }, info) => {
      await ensureMother(MOTHERS.siti);
      const ctx = await browser.newContext({ viewport: info.project.use.viewport!, colorScheme: theme });
      await ctx.addInitScript(([l, t]) => { localStorage.setItem('dbp.m.lang', l); localStorage.setItem('dbp.m.theme', t); }, [lang, theme]);
      const page = await ctx.newPage();
      const results: Awaited<ReturnType<typeof scan>>[] = [];

      for (const path of ['/activate', '/login']) {
        await page.goto(path);
        await expect(page.locator('html')).toHaveAttribute('lang', lang);
        results.push(await scan(page, path));
      }
      await loginUI(page, MOTHERS.siti.phone, lang, theme);
      for (const s of SIGNED_IN) {
        await page.getByRole('navigation').getByRole('link').nth(SIGNED_IN.indexOf(s)).click();
        await page.waitForURL(`**/${s}`);
        results.push(await scan(page, `/${s}`));
      }
      await page.getByRole('navigation').getByRole('link').nth(1).click();
      await checkInUI(page);
      results.push(await scan(page, '/confirmation'));

      const failures = results.flatMap(r => [...r.axe.map(x => `${r.label} axe ${x}`), ...r.contrast.map(x => `${r.label} ${x}`), ...r.targets.map(x => `${r.label} target ${x}`)]);
      console.log(`A12 ${theme} ${lang} ${info.project.name}: min text ${Math.min(...results.map(r => r.minText))}:1, min control border ${Math.min(...results.map(r => r.minBorder))}:1`);
      expect(failures).toEqual([]);
      await ctx.close();
    });
  }
}

for (const theme of ['light', 'dark'] as const) {
  test(`A12 focus ring is at least 2px and 3:1 on every screen, ${theme}`, async ({ browser }, info) => {
    await ensureMother(MOTHERS.siti);
    const ctx = await browser.newContext({ viewport: info.project.use.viewport!, colorScheme: theme });
    await ctx.addInitScript(t => localStorage.setItem('dbp.m.theme', t), theme);
    const page = await ctx.newPage();
    const bad: string[] = [];
    let min = 99;
    await page.goto('/login');
    let r = await focusReport(page, 12); bad.push(...r.bad.map(b => `login ${b}`)); min = Math.min(min, r.min);
    await loginUI(page, MOTHERS.siti.phone, 'en', theme);
    for (const s of SIGNED_IN) {
      await page.getByRole('navigation').getByRole('link').nth(SIGNED_IN.indexOf(s)).click();
      await page.waitForURL(`**/${s}`);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      r = await focusReport(page, 14); bad.push(...r.bad.map(b => `${s} ${b}`)); min = Math.min(min, r.min);
      expect(r.seen, `${s}: focus moved`).toBeGreaterThan(3);
    }
    console.log(`A12 focus ${theme} ${info.project.name}: min focus indicator contrast ${min}:1`);
    expect(bad).toEqual([]);
    await ctx.close();
  });
}

test('A12 reflow at 320px and at 200% text: no horizontal overflow on any screen, EN and BM', async ({ browser }) => {
  await ensureMother(MOTHERS.siti);
  const found: Record<string, string[]> = {};
  const measure = (page: Page) => page.evaluate(() => {
    const out: string[] = [];
    const de = document.documentElement;
    if (de.scrollWidth > de.clientWidth) out.push(`page ${de.scrollWidth} > ${de.clientWidth}`);
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > window.innerWidth + 0.5 && !el.closest('.skip, .sr')) {
        out.push(`${el.tagName.toLowerCase()}.${typeof el.className === 'string' ? el.className.split(' ')[0] : ''} right=${Math.round(r.right)}`);
        if (out.length > 6) break;
      }
    }
    return out;
  });
  for (const [mode, vw, css] of [['320px', 320, ''], ['200% text', 375, 'html{font-size:200% !important}']] as const) {
    for (const lang of ['en', 'ms'] as const) {
      const ctx = await browser.newContext({ viewport: { width: vw, height: 700 } });
      if (css) await ctx.addInitScript(c => document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = c; document.head.append(st); }), css);
      const page = await ctx.newPage();
      await page.addInitScript(l => localStorage.setItem('dbp.m.lang', l), lang);
      for (const path of ['/activate', '/login']) {
        await page.goto(path);
        await page.waitForTimeout(300);
        found[`${mode} ${lang} ${path}`] = await measure(page);
      }
      await loginUI(page, MOTHERS.siti.phone, lang);
      for (const [n, path] of ['/home', '/scan', '/status', '/settings'].entries()) {
        await page.getByRole('navigation').getByRole('link').nth(n).click();
        await page.waitForURL(`**${path}`);
        await page.waitForTimeout(400);
        found[`${mode} ${lang} ${path}`] = await measure(page);
      }
      await ctx.close();
    }
  }
  const offending = Object.fromEntries(Object.entries(found).filter(([, v]) => v.length));
  expect(offending).toEqual({});
});

// Error and failure states get the same bars: axe (including moderate), contrast and 44px targets.
for (const theme of ['light', 'dark'] as const) {
  for (const lang of ['en', 'ms'] as const) {
    test(`A12 error states: login error, network error, camera denied, wrong clinic, expired QR, offline, status failure, ${theme}, ${lang}`, async ({ browser }, info) => {
      await ensureMother(MOTHERS.dewi);
      await ensureMother(MOTHERS.meiling);
      await ensureMother(MOTHERS.nadia, true);
      const newPage = async () => {
        const ctx = await browser.newContext({ viewport: info.project.use.viewport!, colorScheme: theme });
        await ctx.addInitScript(([l, t]) => { localStorage.setItem('dbp.m.lang', l); localStorage.setItem('dbp.m.theme', t); }, [lang, theme]);
        return { ctx, page: await ctx.newPage() };
      };
      const results: Awaited<ReturnType<typeof scan>>[] = [];

      // Login: wrong details, then a network error.
      let { ctx, page } = await newPage();
      await page.goto('/login');
      await page.getByTestId('phone').fill(MOTHERS.dewi.phone);
      await page.getByTestId('password').fill(`${MOTHER_PW}-wrong`);
      await page.getByTestId('login-submit').click();
      await page.getByRole('alert').waitFor();
      results.push(await scan(page, 'login error'));
      await page.route('**/api/v1/auth/login', r => r.abort());
      await page.getByTestId('password').fill(MOTHER_PW);
      await page.getByTestId('login-submit').click();
      await expect(page.getByRole('alert')).toContainText(lang === 'en' ? 'No connection' : 'Tiada sambungan');
      results.push(await scan(page, 'network error'));
      await ctx.close();

      // Camera denied (a mother who is never checked in by these tests).
      ({ ctx, page } = await newPage());
      await loginUI(page, MOTHERS.meiling.phone, lang, theme);
      await page.getByRole('navigation').getByRole('link').nth(1).click();
      await page.evaluate(() => Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: () => Promise.reject(new DOMException('no', 'NotAllowedError')) }, configurable: true }));
      await page.getByTestId('open-camera').click();
      await page.getByTestId('scan-error').waitFor();
      results.push(await scan(page, 'camera denied'));
      await ctx.close();

      // Expired QR, then a QR from another clinic (Nadia belongs to the second clinic and is never checked in).
      ({ ctx, page } = await newPage());
      await loginUI(page, MOTHERS.nadia.phone, lang, theme);
      await page.getByRole('navigation').getByRole('link').nth(1).click();
      await page.getByTestId('dev-token').fill('not-a-real-token-value');
      await page.getByTestId('dev-submit').click();
      await expect(page.getByTestId('scan-error')).toHaveAttribute('data-code', 'token_invalid');
      results.push(await scan(page, 'expired QR'));
      await page.getByTestId('dev-token').fill(await qrToken());
      await page.getByTestId('dev-submit').click();
      await expect(page.getByTestId('scan-error')).toHaveAttribute('data-code', 'wrong_clinic');
      results.push(await scan(page, 'wrong clinic'));
      await ctx.close();

      // Offline home and status failure.
      ({ ctx, page } = await newPage());
      await loginUI(page, MOTHERS.dewi.phone, lang, theme);
      await page.getByTestId('home-checkin').waitFor(); // home has loaded before the network goes
      await ctx.setOffline(true);
      await page.getByText(lang === 'en' ? 'You are offline. Scanning is paused' : 'Anda di luar talian. Pengimbasan dijeda').waitFor();
      results.push(await scan(page, 'offline home'));
      await ctx.setOffline(false);
      await page.route('**/api/v1/queue/me', r => r.abort());
      await page.getByRole('navigation').getByRole('link').nth(2).click();
      await page.getByText(lang === 'en' ? 'Could not load your visit' : 'Lawatan anda tidak dapat dimuatkan').waitFor({ timeout: 10_000 });
      results.push(await scan(page, 'status failure'));
      await ctx.close();

      const failures = results.flatMap(r => [...r.axe.map(x => `${r.label} axe ${x}`), ...r.contrast.map(x => `${r.label} ${x}`), ...r.targets.map(x => `${r.label} target ${x}`)]);
      console.log(`A12 errors ${theme} ${lang} ${info.project.name}: ${results.length} states, min text ${Math.min(...results.map(r => r.minText))}:1, min control border ${Math.min(...results.map(r => r.minBorder))}:1`);
      expect(failures).toEqual([]);
    });
  }
}
