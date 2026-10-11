import { Page } from '@playwright/test';
// Measurement helpers copied from the staff web quality spec: target size, contrast, focus indicator.
export async function offenders(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const sel = 'button, a[href], input, select, [role=switch], .mat-mdc-select';
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      if (el.classList.contains('skip') || el.closest('.cdk-visually-hidden, .sr')) continue;
      if (el instanceof HTMLInputElement && (el.type === 'hidden' || el.type === 'checkbox')) continue;
      if (el.tagName === 'A' && el.closest('p') && !el.classList.contains('btn')) continue; // inline text links inside sentences
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

export async function contrast(page: Page) {
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
      if (el.matches('button, a[href], .search, .lang, .mdc-notched-outline__leading')) {
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
export async function focusReport(page: Page, tabs: number): Promise<{ bad: string[]; min: number; seen: number }> {
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

