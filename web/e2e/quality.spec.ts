import { Locator, Page, expect, test } from '@playwright/test';

// Measured quality bars: target size (44px) and WCAG contrast (4.5:1 text, 3:1 control borders and icons).
const PASSWORD = process.env['SEED_STAFF_PASSWORD'] ?? '';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Username').fill('aini.demo');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/queue');
}

const row = (page: Page, name: string): Locator => page.locator('[data-testid=queue-list] > li', { hasText: name });

/** Creates a finished row, a missed row and an urgent row so every row style is measured. */
async function prepare(page: Page) {
  const stamp = Date.now();
  const names = [`Done ${stamp}`, `Gone ${stamp}`, `Flag ${stamp}`];
  for (const n of names) {
    await page.getByTestId('topbar-walkin').click();
    await page.getByTestId('dialog-walkin-name').fill(n);
    await page.getByTestId('dialog-walkin-submit').click();
    await expect(row(page, n)).toBeVisible({ timeout: 8000 });
  }
  const a = row(page, names[0]);
  await a.locator('[data-action=call]').click();
  await expect(a.locator('[data-action=inroom]')).toBeEnabled();
  await a.locator('[data-action=inroom]').click();
  await expect(a.locator('[data-action=complete]')).toBeEnabled();
  await a.locator('[data-action=complete]').click();
  await expect(a.locator('app-status-chip', { hasText: 'Done' })).toBeVisible();
  const b = row(page, names[1]);
  await b.locator('[data-action=missed]').click();
  await page.getByTestId('missed-reason').click();
  await page.getByRole('option').first().click();
  await page.getByTestId('missed-confirm').click();
  await expect(b.locator('app-status-chip', { hasText: 'Missed' })).toBeVisible();
  const c = row(page, names[2]);
  await c.locator('[data-action=assign]').click();
  await page.getByTestId('assign-urgent').getByRole('switch').click();
  await page.getByTestId('assign-reason').click();
  await page.getByRole('option').first().click();
  await page.getByTestId('assign-save').click();
  await expect(c.locator('app-status-chip', { hasText: 'Urgent' })).toBeVisible();
}

// ---------- target size ----------
async function offenders(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const sel = 'button, a[href], input, select, [role=switch], .mat-mdc-select';
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      if (el.classList.contains('skip') || el.closest('.cdk-visually-hidden, .sr')) continue;
      if (el instanceof HTMLInputElement && (el.type === 'hidden' || el.type === 'checkbox')) continue;
      if (el.tagName === 'A' && el.closest('p')) continue; // inline text links inside sentences
      let t: HTMLElement = el;
      if (el.tagName === 'INPUT' || el.classList.contains('mat-mdc-select')) t = (el.closest('.search, .mat-mdc-text-field-wrapper, mat-form-field') as HTMLElement) ?? el;
      if (el.getAttribute('role') === 'switch') t = (el.closest('mat-slide-toggle') as HTMLElement) ?? el;
      const r = t.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.width < 43.9 || r.height < 43.9) {
        const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 28);
        out.push(`${el.tagName.toLowerCase()} "${name}" ${Math.round(r.width * 10) / 10}x${Math.round(r.height * 10) / 10}`);
      }
    }
    return out;
  });
}

let smallest = 999;
async function minTarget(page: Page): Promise<number> {
  return page.evaluate(() => {
    let m = 999;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('button, a[href], [role=switch]'))) {
      if (el.classList.contains('skip') || el.closest('.cdk-visually-hidden, .sr') || (el.tagName === 'A' && el.closest('p'))) continue;
      const t = el.getAttribute('role') === 'switch' ? ((el.closest('mat-slide-toggle') as HTMLElement) ?? el) : el;
      const r = t.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) m = Math.min(m, r.width, r.height);
    }
    return Math.round(m * 10) / 10;
  });
}

for (const width of [1440, 1024, 768]) {
  test(`Q1 every interactive element is at least 44x44 at ${width}px`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    await login(page);
    await prepare(page);
    await page.waitForTimeout(700);
    const found: Record<string, string[]> = {};
    found['queue'] = await offenders(page);
    smallest = Math.min(smallest, await minTarget(page));
    await page.locator('[data-action=assign]:enabled').first().click();
    await page.getByTestId('assign-urgent').getByRole('switch').click();
    await page.waitForTimeout(400);
    found['assign dialog'] = await offenders(page);
    await page.keyboard.press('Escape');
    await page.goto('/patients');
    await page.getByTestId('search-input').fill('Si');
    await page.locator('[data-testid=search-results] li').first().waitFor();
    await page.waitForTimeout(500);
    found['patients'] = await offenders(page);
    smallest = Math.min(smallest, await minTarget(page));
    await page.goto('/codes');
    await page.getByTestId('codes-table').waitFor().catch(() => undefined);
    await page.waitForTimeout(500);
    found['codes'] = await offenders(page);
    console.log(`TARGETS ${width}px: smallest button/link/switch ${smallest}px`);
    expect(found).toEqual({ queue: [], 'assign dialog': [], patients: [], codes: [] });
    await ctx.close();
  });
}

// ---------- contrast ----------
async function contrast(page: Page) {
  return page.evaluate(() => {
    type RGBA = [number, number, number, number];
    const unparsed: string[] = [];
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    const cx = cv.getContext('2d', { willReadFrequently: true })!;
    // Resolve any CSS colour (rgb, oklch, color-mix, color(...)) to sRGB by painting one pixel. Never skips silently.
    const parse = (c: string): RGBA => {
      if (c === 'transparent' || c === 'rgba(0, 0, 0, 0)') return [0, 0, 0, 0];
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = '#010203';
      cx.fillStyle = c;
      if (cx.fillStyle === '#010203' && c.replace(/\s/g, '') !== 'rgb(1,2,3)') { unparsed.push(c); return [0, 0, 0, 0]; }
      cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    };
    const over = (top: RGBA, base: RGBA): RGBA => {
      const a = top[3] + base[3] * (1 - top[3]);
      if (a === 0) return [0, 0, 0, 0];
      const ch = (i: number) => (top[i] * top[3] + base[i] * base[3] * (1 - top[3])) / a;
      return [ch(0), ch(1), ch(2), a];
    };
    const lum = (c: RGBA) => {
      const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const ratio = (a: RGBA, b: RGBA) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const pageBg = parse(getComputedStyle(document.body).backgroundColor);
    const bgOf = (el: Element): RGBA => {
      const chain: Element[] = [];
      for (let e: Element | null = el; e; e = e.parentElement) chain.push(e);
      let base: RGBA = pageBg[3] ? pageBg : [255, 255, 255, 1];
      for (const e of chain.reverse()) { const c = parse(getComputedStyle(e).backgroundColor); if (c[3] > 0) base = over(c, base); }
      return base;
    };
    const opacityOf = (el: Element) => { let o = 1; for (let e: Element | null = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
    const visible = (el: Element) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const disabled = (el: Element) => !!el.closest(':disabled, [aria-disabled=true], .mat-mdc-button-disabled');
    const label = (el: Element) => `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : ''} "${(el.textContent ?? '').trim().slice(0, 24)}"`;
    const fails: string[] = [];
    let minText = 99, minBorder = 99;

    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      if (!visible(el) || disabled(el) || el.closest('.sr, .cdk-visually-hidden, .skip')) continue;
      const hasText = Array.from(el.childNodes).some(n => n.nodeType === 3 && (n.textContent ?? '').trim().length > 0);
      const bg = bgOf(el);
      const fgRaw = parse(getComputedStyle(el).color);
      const fg = over([fgRaw[0], fgRaw[1], fgRaw[2], fgRaw[3] * opacityOf(el)], bg);
      if (hasText || el.matches('i.ph')) {
        const need = el.matches('i.ph') ? 3 : 4.5;
        const r = ratio(fg, bg);
        if (hasText) minText = Math.min(minText, r);
        if (r < need) fails.push(`text ${label(el)} ${r.toFixed(2)}:1 (need ${need}) fg=${getComputedStyle(el).color} bg=rgb(${bg.slice(0, 3).map(Math.round)})`);
      }
      // Control borders: 3:1 against the surface behind the control, unless the fill itself contrasts 3:1.
      if (el.matches('button, a[href], .search, .tabs, .lang, .mdc-notched-outline__leading')) {
        const cs = getComputedStyle(el);
        const lead = el.matches('.mdc-notched-outline__leading');
        const w = parseFloat(lead ? cs.borderLeftWidth : cs.borderTopWidth);
        const bc = parse(lead ? cs.borderLeftColor : cs.borderTopColor);
        if (w >= 1 && bc[3] > 0.05) {
          const parentBg = bgOf(el.parentElement ?? el);
          const rb = Math.max(ratio(over(bc, parentBg), parentBg), ratio(bgOf(el), parentBg));
          minBorder = Math.min(minBorder, rb);
          if (rb < 3) fails.push(`border ${label(el)} ${rb.toFixed(2)}:1 (need 3)`);
        }
      }
    }
    for (const u of new Set(unparsed)) fails.push(`UNPARSED COLOUR ${u}`);
    return { fails, minText: Math.round(minText * 100) / 100, minBorder: Math.round(minBorder * 100) / 100 };
  });
}


for (const theme of ['light', 'dark'] as const) {
  for (const width of [1440, 768]) {
    test(`Q2 measured contrast, ${theme} theme, ${width}px, EN and BM`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
      await ctx.addInitScript(t => localStorage.setItem('dbp.theme', t), theme);
      const page = await ctx.newPage();
      await login(page);
      await prepare(page);
      const all: Record<string, { fails: string[]; minText: number; minBorder: number }> = {};
      for (const [lang, code, heading] of [['EN', 'en', "Today's queue"], ['BM', 'ms', 'Giliran hari ini']] as const) {
        await page.getByRole('button', { name: lang, exact: true }).click();
        await expect(page.locator('html')).toHaveAttribute('lang', code);
        await page.goto('/queue');
        await expect(page.locator('html')).toHaveAttribute('lang', code);
        await expect(page.getByRole('heading', { name: heading })).toBeVisible();
        await page.locator('[data-testid=queue-list] > li').first().waitFor();
        await page.waitForTimeout(700);
        all[`${lang} queue`] = await contrast(page);
        await page.locator('[data-action=assign]:enabled').first().click();
        await page.getByTestId('assign-urgent').getByRole('switch').click();
        await page.waitForTimeout(500);
        all[`${lang} assign`] = await contrast(page);
        await page.keyboard.press('Escape');
        await page.goto('/patients');
        await page.getByTestId('search-input').fill('Si');
        await page.locator('[data-testid=search-results] li').first().waitFor();
        await page.waitForTimeout(600);
        all[`${lang} patients`] = await contrast(page);
        await page.goto('/codes');
        await expect(page.getByTestId('codes-table')).toBeVisible();
        await page.waitForTimeout(600);
        all[`${lang} codes`] = await contrast(page);
      }
      const minText = Math.min(...Object.values(all).map(v => v.minText));
      const minBorder = Math.min(...Object.values(all).map(v => v.minBorder));
      console.log(`CONTRAST ${theme} ${width}px: min text ${minText}:1, min control border ${minBorder}:1`);
      const fails = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.fails]));
      expect(fails).toEqual({ 'EN queue': [], 'EN assign': [], 'EN patients': [], 'EN codes': [], 'BM queue': [], 'BM assign': [], 'BM patients': [], 'BM codes': [] });
      await ctx.close();
    });
  }
}

// ---------- focus indicator (WCAG 2.4.7 and 1.4.11): 2px or more, 3:1 against the surface ----------
async function focusReport(page: Page, tabs: number): Promise<{ bad: string[]; min: number; seen: number }> {
  const bad: string[] = [];
  let min = 99, seen = 0;
  for (let n = 0; n < tabs; n++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cv = document.createElement('canvas'); cv.width = cv.height = 1;
      const cx = cv.getContext('2d', { willReadFrequently: true })!;
      const parse = (c: string): [number, number, number, number] | null => {
        cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#010203'; cx.fillStyle = c;
        if (cx.fillStyle === '#010203') return null;
        cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255];
      };
      const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
      const bgOf = (node: Element): number[] => {
        const chain: Element[] = [];
        for (let e: Element | null = node; e; e = e.parentElement) chain.push(e);
        let base = [255, 255, 255];
        for (const e of chain.reverse()) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0) base = [0, 1, 2].map(i => c[i] * c[3] + base[i] * (1 - c[3])); }
        return base;
      };
      const name = `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24)}"`;
      let col: string, width: number, style: string;
      const field = el.closest('mat-form-field');
      const wrap = el.closest('.search');
      if (field) {
        const o = field.querySelector('.mdc-notched-outline__leading') as HTMLElement;
        const cs = getComputedStyle(o); col = cs.borderLeftColor; width = parseFloat(cs.borderLeftWidth); style = cs.borderLeftStyle;
      } else if (wrap) {
        const cs = getComputedStyle(wrap); col = cs.outlineColor; width = parseFloat(cs.outlineWidth); style = cs.outlineStyle;
      } else {
        const cs = getComputedStyle(el); col = cs.outlineColor; width = parseFloat(cs.outlineWidth); style = cs.outlineStyle;
      }
      const fg = parse(col);
      if (!fg) return { name, error: `unparsed colour ${col}` };
      const bg = bgOf(el.parentElement ?? el);
      const a = lum(fg), b = lum(bg);
      return { name, width, style, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
    });
    if (!r) continue;
    seen++;
    if ('error' in r) { bad.push(`${r.name}: ${r.error}`); continue; }
    min = Math.min(min, r.ratio);
    if (r.style === 'none' || r.width < 2 || r.ratio < 3) bad.push(`${r.name}: style=${r.style} width=${r.width} ratio=${r.ratio.toFixed(2)}`);
  }
  return { bad, min: Math.round(min * 100) / 100, seen };
}

for (const theme of ['light', 'dark'] as const) {
  test(`Q3 focus indicator is at least 2px and 3:1, ${theme} theme`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
    await ctx.addInitScript(t => localStorage.setItem('dbp.theme', t), theme);
    const page = await ctx.newPage();
    await login(page);
    await prepare(page);
    const res: Record<string, string[]> = {};
    let min = 99;
    for (const [name, path, tabs] of [['queue', '/queue', 70], ['patients', '/patients', 22], ['codes', '/codes', 22]] as const) {
      await page.goto(path);
      await page.waitForTimeout(700);
      if (path === '/patients') await page.getByTestId('search-input').fill('Si');
      await page.locator('body').click({ position: { x: 2, y: 2 } });
      const r = await focusReport(page, tabs);
      expect(r.seen, `${name}: focus moved`).toBeGreaterThan(8);
      res[name] = r.bad;
      min = Math.min(min, r.min);
    }
    console.log(`FOCUS ${theme}: min focus indicator contrast ${min}:1`);
    expect(res).toEqual({ queue: [], patients: [], codes: [] });
    await ctx.close();
  });
}

// ---------- reflow at 320px (WCAG 1.4.10) ----------
test('Q4 no horizontal scroll at 320px on queue, patients and codes (EN and BM)', async ({ browser }) => {
  const seed = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const sp = await seed.newPage();
  await login(sp);
  await prepare(sp);
  await seed.close();

  const ctx = await browser.newContext({ viewport: { width: 320, height: 700 } });
  const page = await ctx.newPage();
  await login(page);
  const found: Record<string, string[]> = {};
  for (const [lang, code] of [['EN', 'en'], ['BM', 'ms']] as const) {
    await page.getByRole('button', { name: lang, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', code);
    for (const path of ['/queue', '/patients', '/codes']) {
      await page.goto(path);
      if (path === '/queue') await page.locator('[data-testid=queue-list] > li').first().waitFor();
      if (path === '/patients') { await page.getByTestId('search-input').fill('Si'); await page.locator('[data-testid=search-results] li').first().waitFor(); }
      if (path === '/codes') await expect(page.getByTestId('codes-table')).toBeVisible();
      await page.waitForTimeout(600);
      found[`${lang} ${path}`] = await page.evaluate(() => {
        const out: string[] = [];
        const de = document.documentElement;
        if (de.scrollWidth > de.clientWidth) out.push(`page scrollWidth ${de.scrollWidth} > ${de.clientWidth}`);
        for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > window.innerWidth && !el.closest('.cdk-visually-hidden, .sr, .skip')) {
            out.push(`${el.tagName.toLowerCase()}.${typeof el.className === 'string' ? el.className.split(' ')[0] : ''} right=${Math.round(r.right)}`);
            if (out.length > 8) break;
          }
        }
        return out;
      });
    }
  }
  expect(found).toEqual({ 'EN /queue': [], 'EN /patients': [], 'EN /codes': [], 'BM /queue': [], 'BM /patients': [], 'BM /codes': [] });
  await ctx.close();
});

// ---------- states: loading, error, offline and the Missed filter ----------
for (const theme of ['light', 'dark'] as const) {
  test(`Q5 loading, error, offline and Missed-filter states meet contrast, focus and target bars, ${theme}`, async ({ browser }) => {
    test.setTimeout(300_000);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
    await ctx.addInitScript(t => localStorage.setItem('dbp.theme', t), theme);
    const page = await ctx.newPage();
    await login(page);
    await prepare(page);
    const QUEUE = '**/api/v1/staff/queue';
    const results: Record<string, string[]> = {};
    let minText = 99, minBorder = 99, minFocus = 99;

    const measure = async (label: string) => {
      await page.waitForTimeout(350);
      const c = await contrast(page);
      const targets = await offenders(page);
      const f = await focusReport(page, 10);
      minText = Math.min(minText, c.minText); minBorder = Math.min(minBorder, c.minBorder); minFocus = Math.min(minFocus, f.min);
      results[label] = [...c.fails, ...targets.map(t => `target ${t}`), ...f.bad.map(b => `focus ${b}`)];
    };

    for (const [lang, code] of [['EN', 'en'], ['BM', 'ms']] as const) {
      await page.getByRole('button', { name: lang, exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('lang', code);

      // Loading: the queue response is held back.
      await page.route(QUEUE, async r => { await new Promise(res => setTimeout(res, 7000)); await r.continue().catch(() => undefined); });
      await page.goto('/queue');
      await page.locator('app-skeleton').first().waitFor();
      await expect(page.locator('app-skeleton')).toContainText(code === 'en' ? 'Loading' : 'Memuatkan');
      await measure(`${lang} loading`);
      await page.unroute(QUEUE);

      // Error: the queue endpoint fails.
      await page.route(QUEUE, r => r.fulfill({ status: 500, json: { error: 'x' } }));
      await page.goto('/queue');
      await page.locator('app-error').first().waitFor();
      await measure(`${lang} error`);
      await page.unroute(QUEUE);

      // Offline: the page loaded, then the network goes away.
      await page.route('**/hubs/**', r => r.abort()); // S5: no hub, so the 5 s fallback poll finds the failure
      await page.goto('/queue');
      await page.locator('[data-testid=queue-list] > li').first().waitFor();
      await page.route(QUEUE, r => r.abort());
      await page.locator('app-offline-banner .offline').waitFor({ timeout: 15_000 });
      await measure(`${lang} offline`);
      await page.unroute(QUEUE);
      await page.unroute("**/hubs/**");

      // Missed filter.
      await page.goto('/queue');
      await page.locator('[data-testid=queue-list] > li').first().waitFor();
      await page.locator('[data-tab=missed]').click();
      await expect(page.locator('[data-testid=queue-list] > li').first()).toBeVisible();
      await measure(`${lang} missed filter`);
    }
    console.log(`STATES ${theme}: min text ${minText}:1, min control border ${minBorder}:1, min focus ${minFocus}:1`);
    const expected = Object.fromEntries(Object.keys(results).map(k => [k, []]));
    expect(Object.keys(results)).toHaveLength(8);
    expect(results).toEqual(expected);
    await ctx.close();
  });
}

// ---------- filter tabs stay on one row at 768 ----------
test('Q6 filter tabs share one row at 768px in EN and BM, without page overflow', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 768, height: 900 } });
  const page = await ctx.newPage();
  await login(page);
  await prepare(page);
  const res: Record<string, string> = {};
  for (const [lang, code] of [['EN', 'en'], ['BM', 'ms']] as const) {
    await page.getByRole('button', { name: lang, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', code);
    await page.goto('/queue');
    await page.locator('[data-testid=queue-list] > li').first().waitFor();
    await page.waitForTimeout(500);
    res[lang] = await page.evaluate(() => {
      const tops = Array.from(document.querySelectorAll<HTMLElement>('.tabs button')).map(b => Math.round(b.getBoundingClientRect().top));
      const de = document.documentElement;
      const strip = document.querySelector<HTMLElement>('.tabs')!;
      const sr = strip.getBoundingClientRect();
      const clipped = Array.from(strip.querySelectorAll<HTMLElement>('button')).filter(b => { const r = b.getBoundingClientRect(); return r.right > sr.right - 1 || r.left < sr.left; }).length;
      return `rows=${new Set(tops).size} tabs=${tops.length} overflow=${de.scrollWidth - de.clientWidth} stripScroll=${strip.scrollWidth - strip.clientWidth} clipped=${clipped}`;
    });
  }
  expect(res).toEqual({ EN: 'rows=1 tabs=6 overflow=0 stripScroll=0 clipped=0', BM: 'rows=1 tabs=6 overflow=0 stripScroll=0 clipped=0' });
  await ctx.close();
});
