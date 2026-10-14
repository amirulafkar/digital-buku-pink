import { expect, test } from '@playwright/test';
import { MOTHERS, ensureMother, loginUI } from './support';

// Layout bars: FR-12 above the fold, tab bar on one row at 320px, and the on-screen keyboard not hiding fields.

test('FR-12 notice is visible without scrolling on every signed-in screen (phone viewport)', async ({ browser }, info) => {
  await ensureMother(MOTHERS.siti);
  const ctx = await browser.newContext({ viewport: info.project.use.viewport! });
  const page = await ctx.newPage();
  await loginUI(page, MOTHERS.siti.phone);
  const res: Record<string, string> = {};
  for (const [n, path] of ['/home', '/scan', '/status', '/settings'].entries()) {
    await page.getByRole('navigation').getByRole('link').nth(n).click();
    await page.waitForURL(`**${path}`);
    await page.waitForTimeout(300);
    const b = await page.getByTestId('safety-notice').boundingBox();
    const vh = page.viewportSize()!.height;
    res[path] = b && b.y >= 0 && b.y + b.height <= vh ? 'visible' : `y=${b?.y} h=${b?.height} viewport=${vh}`;
  }
  expect(res).toEqual({ '/home': 'visible', '/scan': 'visible', '/status': 'visible', '/settings': 'visible' });
  await ctx.close();
});

test('tab bar stays on one row at 320px with whole labels, in EN and BM, with 44px targets', async ({ browser }) => {
  await ensureMother(MOTHERS.siti);
  const out: Record<string, string> = {};
  for (const lang of ['en', 'ms'] as const) {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 640 } });
    const page = await ctx.newPage();
    await loginUI(page, MOTHERS.siti.phone, lang);
    out[lang] = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll<HTMLElement>('nav.tabs a'));
      const tops = new Set(links.map(a => Math.round(a.getBoundingClientRect().top)));
      const clipped = links.filter(a => { const s = a.querySelector('span')!; return s.scrollWidth > a.clientWidth || s.getBoundingClientRect().right > a.getBoundingClientRect().right + 0.5; }).length;
      const small = links.filter(a => a.getBoundingClientRect().height < 43.9 || a.getBoundingClientRect().width < 43.9).length;
      return `rows=${tops.size} links=${links.length} clipped=${clipped} small=${small}`;
    });
    await ctx.close();
  }
  expect(out).toEqual({ en: 'rows=1 links=4 clipped=0 small=0', ms: 'rows=1 links=4 clipped=0 small=0' });
});

test('with the on-screen keyboard open (short visible viewport) the focused field and the submit button stay reachable', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  for (const path of ['/login', '/activate']) {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(path);
    await page.setViewportSize({ width: 375, height: 340 }); // roughly what is left above a phone keyboard
    const fields = path === '/login' ? ['phone', 'password'] : ['code', 'phone', 'password'];
    for (const f of fields) {
      const input = page.getByTestId(f);
      await input.focus();
      await page.waitForTimeout(150);
      const b = await input.boundingBox();
      expect(b && b.y >= 0 && b.y + b.height <= 340, `${path} ${f} focused input visible`).toBeTruthy();
    }
    const submit = page.getByTestId(path === '/login' ? 'login-submit' : 'activate-submit');
    await submit.scrollIntoViewIfNeeded();
    const sb = await submit.boundingBox();
    expect(sb && sb.y >= 0 && sb.y + sb.height <= 340, `${path} submit reachable by scrolling`).toBeTruthy();
    // Nothing fixed covers it: the element at the submit centre is the submit button itself.
    const top = await page.evaluate(([x, y]) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('button')?.getAttribute('data-testid'), [sb!.x + sb!.width / 2, sb!.y + sb!.height / 2]);
    expect(top).toBe(path === '/login' ? 'login-submit' : 'activate-submit');
  }
  await ctx.close();
});

test('tab labels scale with 200% text (not clamped), wrap to at most two rows, and are never clipped or overlapping, at 320px and 375px, in EN and BM', async ({ browser }) => {
  await ensureMother(MOTHERS.siti);
  const out: Record<string, string> = {};
  for (const [name, vw] of [['320px 200%', 320], ['375px 200%', 375]] as const) {
    for (const lang of ['en', 'ms'] as const) {
      const ctx = await browser.newContext({ viewport: { width: vw, height: 640 } });
      await ctx.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'html{font-size:200% !important}'; document.head.append(st); }));
      const page = await ctx.newPage();
      await loginUI(page, MOTHERS.siti.phone, lang);
      out[`${name} ${lang}`] = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll<HTMLElement>('nav.tabs a'));
        const tops = new Set(links.map(a => Math.round(a.getBoundingClientRect().top)));
        const clipped = links.filter(a => { const s = a.querySelector('span')!; return s.scrollWidth > a.clientWidth || s.getBoundingClientRect().right > a.getBoundingClientRect().right + 0.5 || s.getBoundingClientRect().left < a.getBoundingClientRect().left - 0.5; }).length;
        const de = document.documentElement;
        const rects = links.map(a => a.getBoundingClientRect());
        const overlap = rects.some((a, i) => rects.some((b, j) => j > i && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5));
        const px = parseFloat(getComputedStyle(links[0].querySelector('span')!).fontSize);
        const label = px >= 27 ? 'scaled' : `clamped(${px}px)`; // .875rem at 200% is 28px
        return `rows=${Math.min(tops.size, 2)} links=${links.length} clipped=${clipped} overlap=${overlap} overflow=${de.scrollWidth - de.clientWidth} label=${label} extraRows=${tops.size > 2}`;
      });
      await ctx.close();
    }
  }
  for (const [k, v] of Object.entries(out)) {
    expect(v, k).toMatch(/links=4 clipped=0 overlap=false overflow=0 label=scaled extraRows=false/);
    expect(['1', '2'], k).toContain(v.match(/rows=(\d)/)![1]);
  }
});
