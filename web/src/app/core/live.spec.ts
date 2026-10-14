import { HubLike, LiveClient, RETRY_DELAYS_MS } from './live';
import { Connectivity, HubStatus } from './poll';
import { expiresWithin } from './auth';

class FakeHub implements HubLike {
  handlers = new Map<string, () => void>();
  closeCb: () => void = () => undefined;
  stopped = false;
  constructor(private startResult: () => Promise<void>) {}
  on(e: string, cb: () => void) { this.handlers.set(e, cb); }
  onclose(cb: () => void) { this.closeCb = cb; }
  start() { return this.startResult(); }
  async stop() { this.stopped = true; }
  emit() { this.handlers.get('QueueChanged')?.(); }
  drop() { this.closeCb(); }
}

function setup(results: (() => Promise<void>)[]) {
  const conn = new Connectivity();
  const hubs: FakeHub[] = [];
  const delays: number[] = [];
  const seen: HubStatus[] = [];
  conn.onHub(s => seen.push(s));
  let n = 0;
  const factory = () => { const h = new FakeHub(results[Math.min(n++, results.length - 1)]); hubs.push(h); return h; };
  const client = new LiveClient(factory, conn, async ms => { delays.push(ms); });
  return { conn, hubs, delays, seen, client };
}
const ok = () => Promise.resolve();
const bad = () => Promise.reject(new Error('blocked'));
const flush = async () => { for (let k = 0; k < 20; k++) await Promise.resolve(); };

describe('LiveClient', () => {
  it('connects, passes events on, and reports up', async () => {
    const { conn, hubs, client } = setup([ok]);
    let events = 0;
    client.start(() => events++);
    await flush();
    expect(conn.hub()).toBe('up');
    expect(conn.liveWanted()).toBe(true);
    hubs[0].emit();
    hubs[0].emit();
    expect(events).toBe(2);
    client.stop();
    expect(conn.hub()).toBe('idle');
    expect(conn.liveWanted()).toBe(false);
    expect(hubs[0].stopped).toBe(true);
  });

  it('reconnects at once after a close with no banner state in between', async () => {
    const { conn, hubs, seen, client } = setup([ok, ok]);
    client.start(() => undefined);
    await flush();
    seen.length = 0;
    hubs[0].drop();
    await flush();
    expect(hubs.length).toBe(2);
    expect(conn.hub()).toBe('up');
    expect(seen).not.toContain('down');
    client.stop();
  });

  it('tries 0, 2, 10, 30 s after a failure, then stops and stays down', async () => {
    const { conn, hubs, delays, client } = setup([bad]);
    client.start(() => undefined);
    await flush();
    expect(RETRY_DELAYS_MS).toEqual([0, 2000, 10_000, 30_000]);
    expect(delays).toEqual([0, 2000, 10_000, 30_000]);
    expect(hubs.length).toBe(5); // the first try plus four scheduled tries
    expect(conn.hub()).toBe('down');
    expect(conn.state()).toBe('reconnecting');
    client.stop();
  });

  it('Retry restarts the schedule after it gave up, and recovery clears the down state', async () => {
    const { conn, hubs, client } = setup([bad, bad, bad, bad, bad, ok]);
    client.start(() => undefined);
    await flush();
    expect(conn.hub()).toBe('down');
    conn.retry();
    await flush();
    expect(hubs.length).toBe(6);
    expect(conn.hub()).toBe('up');
    client.stop();
  });

  it('ignores events from a connection that was replaced or stopped', async () => {
    const { hubs, client } = setup([ok]);
    let events = 0;
    client.start(() => events++);
    await flush();
    client.stop();
    hubs[0].emit();
    expect(events).toBe(0);
  });
});

describe('expiresWithin', () => {
  const jwt = (exp: number) => `x.${btoa(JSON.stringify({ exp })).replace(/=/g, '')}.y`;
  it('is true near expiry and false with time left', () => {
    const now = 1_000_000_000_000;
    expect(expiresWithin(jwt(now / 1000 + 10), 30, now)).toBe(true);
    expect(expiresWithin(jwt(now / 1000 + 600), 30, now)).toBe(false);
    expect(expiresWithin('garbage', 30, now)).toBe(true);
  });
});
