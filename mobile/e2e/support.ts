import { randomUUID } from 'node:crypto';
import { APIRequestContext, Page, expect, request } from '@playwright/test';

export const STAFF_PASSWORD = process.env['SEED_STAFF_PASSWORD'] ?? '';
// Password for the fictional demo mothers, read from the git-ignored db/.env (SEED_MOTHER_PASSWORD).
export const MOTHER_PW = process.env['SEED_MOTHER_PASSWORD'] ?? '';
if (!MOTHER_PW) throw new Error('SEED_MOTHER_PASSWORD must be set in db/.env');
const API = 'http://127.0.0.1:5080/api/v1';

export const MOTHERS = {
  siti: { name: 'Siti', phone: '0100000001' },
  dewi: { name: 'Dewi', phone: '0100000002' },
  meiling: { name: 'Mei Ling', phone: '0100000003' },
  priya: { name: 'Priya', phone: '0100000004' },
  nadia: { name: 'Nadia', phone: '0100000005' },
};

export async function api(): Promise<APIRequestContext> { return request.newContext({ baseURL: API + '/' }); }

async function staff(username: string): Promise<APIRequestContext> {
  const anon = await api();
  const r = await anon.post('auth/login', { data: { identifier: username, password: STAFF_PASSWORD } });
  expect(r.ok(), 'staff login (SEED_STAFF_PASSWORD must be set in db/.env)').toBeTruthy();
  const { accessToken } = await r.json();
  return request.newContext({ baseURL: API + '/', extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` } });
}
export const nurse = () => staff('aini.demo');
export const nurseOtherClinic = () => staff('rina.demo');

export async function patientId(ctx: APIRequestContext, name: string): Promise<string> {
  const r = await ctx.post('staff/patients/search', { data: { q: name, limit: 5 } });
  const rows = await r.json();
  return rows.find((x: { displayName: string }) => x.displayName.startsWith(name)).id;
}

export async function issueCode(ctx: APIRequestContext, name: string): Promise<string> {
  const id = await patientId(ctx, name);
  const r = await ctx.post('staff/activation-codes', { data: { patientId: id } });
  expect(r.status()).toBe(201);
  return (await r.json()).code;
}

/** Makes sure this fictional mother has an active account with the test password. Safe to repeat. */
export async function ensureMother(m: { name: string; phone: string }, other = false): Promise<void> {
  const anon = await api();
  const login = await anon.post('auth/login', { data: { identifier: m.phone, password: MOTHER_PW } });
  if (login.ok()) return;
  const n = other ? await nurseOtherClinic() : await nurse();
  const code = await issueCode(n, m.name);
  const act = await anon.post('auth/activate', { data: { code, phone: m.phone, password: MOTHER_PW } });
  expect(act.status()).toBe(204);
}

export async function qrToken(): Promise<string> {
  const n = await nurse();
  const r = await n.post('staff/qr-tokens', { data: {} });
  return (await r.json()).token;
}

export async function queueRows(): Promise<{ id: string; queueNo: string; displayName: string | null; status: string }[]> {
  const n = await nurse();
  return (await (await n.get('staff/queue')).json()).entries;
}

export async function setStatus(id: string, status: string, reason?: string): Promise<void> {
  const n = await nurse();
  const r = await n.patch(`staff/queue/${id}`, { data: { status, reason } });
  expect(r.ok()).toBeTruthy();
}

// ---- UI helpers ----
export async function loginUI(page: Page, phone: string, lang: 'en' | 'ms' = 'en', theme: 'light' | 'dark' = 'light'): Promise<void> {
  await page.addInitScript(([l, t]) => { localStorage.setItem('dbp.m.lang', l); localStorage.setItem('dbp.m.theme', t); }, [lang, theme]);
  await page.goto('/login');
  await page.getByTestId('phone').fill(phone);
  await page.getByTestId('password').fill(MOTHER_PW);
  await page.getByTestId('login-submit').click();
  await page.waitForURL('**/home');
}

/** Real check-in through the developer paste path (it calls the real POST /checkins). */
export async function checkInUI(page: Page): Promise<string> {
  await page.getByRole('link', { name: /Scan|Imbas/ }).click();
  await page.waitForURL('**/scan');
  await page.getByTestId('dev-token').fill(await qrToken());
  await page.getByTestId('dev-submit').click();
  await page.waitForURL('**/confirmation');
  return (await page.getByTestId('queue-no').innerText()).trim();
}

// ---- S5 helpers ----
/** An API context signed in as a fictional mother (not the UI), for setup only. */
export async function motherApi(m: { name: string; phone: string }, other = false): Promise<APIRequestContext> {
  await ensureMother(m, other);
  const anon = await api();
  const r = await anon.post('auth/login', { data: { identifier: m.phone, password: MOTHER_PW } });
  expect(r.ok()).toBeTruthy();
  const { accessToken } = await r.json();
  return request.newContext({ baseURL: API + '/', extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` } });
}

/** Makes sure this mother has a queue entry today (a repeat returns the same entry). Returns her latest row. */
export async function ensureEntry(m: { name: string; phone: string }): Promise<{ id: string; queueNo: string; status: string }> {
  const ctx = await motherApi(m);
  const r = await ctx.post('checkins', { data: { token: await qrToken(), idempotencyKey: randomUUID() } });
  expect([200, 201]).toContain(r.status());
  return myRow(m.name);
}

export async function myRow(name: string): Promise<{ id: string; queueNo: string; status: string }> {
  const row = (await queueRows()).filter(r => r.displayName?.startsWith(name)).at(-1);
  expect(row, `${name} has a queue entry`).toBeTruthy();
  return row!;
}

const NEXT: Record<string, string> = { waiting: 'called', called: 'in_room', in_room: 'completed' };
/** Staff move the entry one step along. Fails clearly if the entry is already closed (run db/seed/reset.sh). */
export async function advance(name: string): Promise<string> {
  const row = await myRow(name);
  const to = NEXT[row.status];
  expect(to, `${name} is ${row.status}; run CONFIRM_RESET=yes db/seed/reset.sh for a fresh day`).toBeTruthy();
  await setStatus(row.id, to);
  return to;
}

/** Waits until the status screen has opened the live hub (negotiate answered) and the group join has had time to finish. */
export async function hubReady(page: Page, open: () => Promise<void>): Promise<void> {
  const negotiated = page.waitForResponse(r => r.url().includes('/hubs/queue/negotiate') && r.ok());
  await open();
  await negotiated;
  await page.waitForTimeout(1200);
}
