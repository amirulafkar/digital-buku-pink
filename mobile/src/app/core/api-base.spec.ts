import { HttpRequest, HttpResponse } from '@angular/common/http';
import { of } from 'rxjs';
import { apiUrl, makeApiBaseInterceptor } from './api-base';

function seen(base: string, url: string): string {
  let out = '';
  makeApiBaseInterceptor(base)(new HttpRequest('GET', url), r => { out = r.url; return of(new HttpResponse()); }).subscribe();
  return out;
}

describe('S7-A3 API base URL', () => {
  const BASE = 'https://api.example.test';

  it('prefixes /api/ and /hubs/ paths with the build-time base', () => {
    expect(seen(BASE, '/api/v1/auth/login')).toBe(BASE + '/api/v1/auth/login');
    expect(seen(BASE, '/api/v1/staff/queue')).toBe(BASE + '/api/v1/staff/queue');
    expect(seen(BASE, '/hubs/queue')).toBe(BASE + '/hubs/queue');
  });

  it('leaves other URLs alone: absolute, assets, look-alike paths', () => {
    for (const u of ['https://other.example/api/v1/x', '/assets/a.png', '/apix/v1', 'api/v1/relative', '/hubsx/queue']) expect(seen(BASE, u)).toBe(u);
  });

  it('with an empty base (dev and tests, using the proxy) changes nothing', () => {
    expect(seen('', '/api/v1/me')).toBe('/api/v1/me');
    expect(apiUrl('/hubs/queue')).toBe('/hubs/queue'); // the dev environment file has an empty base
  });

  it('only api-base.ts reads the environment, and nothing reads the base from the URL or storage', async () => {
    // @ts-ignore node module, available to the test runner only
    const fs = await import(/* @vite-ignore */ 'node:fs');
    // @ts-ignore
    const path = await import(/* @vite-ignore */ 'node:path');
    const files: string[] = [];
    const walk = (d: string) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : /\.ts$/.test(f) && !/\.spec\.ts$/.test(f) && files.push(p); } };
    walk('src/app');
    expect(files.length).toBeGreaterThan(10);
    const readers = files.filter(f => /environments\/environment/.test(fs.readFileSync(f, 'utf8')));
    expect(readers.map((f: string) => path.basename(f))).toEqual(['api-base.ts']);
    const src: string = fs.readFileSync(path.join('src/app/core/api-base.ts'), 'utf8');
    expect(src).not.toMatch(/localStorage|sessionStorage|location|URLSearchParams|document\.cookie|Preferences/);
    for (const f of files) expect(fs.readFileSync(f, 'utf8'), f).not.toMatch(/(localStorage|sessionStorage|URLSearchParams|location\.(search|hash))[^\n]*apiBase|apiBase[^\n]*(localStorage|sessionStorage|URLSearchParams|location\.(search|hash))/);
  });
});
