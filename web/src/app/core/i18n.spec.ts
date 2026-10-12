import { EN, MS, MS_REVIEWED, MS_REVIEW_STATUS, msUnreviewed } from './i18n';

describe('i18n catalogue', () => {
  it('has every key in both languages', () => {
    expect(Object.keys(MS).sort()).toEqual(Object.keys(EN).sort());
  });

  it('marks Bahasa Malaysia as needing native review', () => {
    expect(MS_REVIEW_STATUS).toBe('needs-native-review');
  });

  it('tracks native review per key and lists the open ones', () => {
    const open = msUnreviewed();
    expect(open.length + MS_REVIEWED.size).toBe(Object.keys(MS).length);
    for (const k of MS_REVIEWED) expect(k in MS, k).toBe(true);
    console.info(`BM keys still needing native review: ${open.length} of ${Object.keys(MS).length}`);
  });

  it('flags every BM string as needing native review while MS_REVIEWED is empty', () => {
    if (MS_REVIEWED.size === 0) expect(msUnreviewed().length).toBe(Object.keys(MS).length);
  });

  it('has no empty strings, no em dashes and no waiting-time wording', () => {
    for (const [k, v] of [...Object.entries(EN), ...Object.entries(MS)]) {
      expect(v.trim().length, k).toBeGreaterThan(0);
      expect(v, k).not.toContain('—');
      expect(v, k).not.toMatch(/estimat|wait(ing)?\s*time|anggaran|masa\s+menunggu/i);
    }
  });

  it('uses the same placeholders in both languages', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const k of Object.keys(EN) as (keyof typeof EN)[]) expect(ph(MS[k]), k).toBe(ph(EN[k]));
  });

  it('has a Bahasa Malaysia string for every English key and lists any that are missing (NFR-08)', () => {
    const missing = Object.keys(EN).filter(k => !(k in MS) || !String((MS as Record<string, string>)[k]).trim());
    expect(missing, `Missing MS keys: ${missing.join(', ')}`).toEqual([]);
  });

  it('keeps MS_REVIEWED empty until a native reviewer signs off, so every key is still flagged', () => {
    expect(MS_REVIEWED.size).toBe(0);
    expect(msUnreviewed().length).toBe(Object.keys(EN).length);
  });
});
