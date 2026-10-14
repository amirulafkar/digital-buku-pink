import { COALESCE_MS, Connectivity, Poller, SAFETY_POLL_MS, liveState } from './poll';

const OPT = { fallbackMs: 15_000, offlineMs: 60_000 };

describe('liveState (state machine)', () => {
  it('connected unless offline or the hub is down while a live screen is open', () => {
    expect(liveState(false, true, 'up')).toBe('connected');
    expect(liveState(false, true, 'connecting')).toBe('connected'); // a quick reconnect shows no banner
    expect(liveState(false, true, 'down')).toBe('reconnecting');
    expect(liveState(false, false, 'down')).toBe('connected');      // no live screen open: no live banner
    expect(liveState(true, true, 'up')).toBe('offline');
    expect(liveState(true, true, 'down')).toBe('offline');          // offline wins over reconnecting
  });

  it('moves connected -> reconnecting -> connected -> offline -> connected', () => {
    const c = new Connectivity();
    c.liveWanted.set(true);
    c.setHub('up');
    expect(c.state()).toBe('connected');
    c.setHub('down');
    expect(c.state()).toBe('reconnecting');
    c.setHub('up');
    expect(c.state()).toBe('connected');
    c.reportFailure();
    expect(c.state()).toBe('offline');
    c.reportOk();
    expect(c.state()).toBe('connected');
  });

  it('canWrite is false while offline and true again after a successful load', () => {
    const c = new Connectivity();
    expect(c.canWrite()).toBe(true);
    c.reportFailure();
    expect(c.offline()).toBe(true);
    expect(c.canWrite()).toBe(false);
    c.reportOk();
    expect(c.canWrite()).toBe(true);
    expect(c.lastOk()).not.toBeNull();
  });

  it('the browser going offline also turns canWrite off', () => {
    const c = new Connectivity();
    window.dispatchEvent(new Event('offline'));
    expect(c.canWrite()).toBe(false);
    window.dispatchEvent(new Event('online'));
    expect(c.canWrite()).toBe(true);
  });
});

describe('Poller', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('uses the mother-app intervals: 15 s fallback, 60 s safety while the hub is up, 60 s offline', async () => {
    expect(SAFETY_POLL_MS).toBe(60_000);
    const conn = new Connectivity();
    let calls = 0;
    let fail = false;
    const p = new Poller(async () => { calls++; if (fail) throw new Error('x'); }, conn, OPT);
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(2); // fallback 15 s (hub not up)

    conn.setHub('up');     // reconnecting -> connected: one refetch at once
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(3);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(calls).toBe(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(4); // safety poll 60 s

    conn.setHub('down');   // falls back to the short poll
    await vi.advanceTimersByTimeAsync(15_000);
    expect(calls).toBe(5);

    fail = true;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(calls).toBe(6);
    expect(conn.offline()).toBe(true);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(calls).toBe(6); // offline poll 60 s
    fail = false;
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(7);
    expect(conn.offline()).toBe(false);
    p.stop();
  });

  it('uses the staff board intervals: 5 s fallback, 15 s offline', async () => {
    const conn = new Connectivity();
    let calls = 0;
    let fail = false;
    const p = new Poller(async () => { calls++; if (fail) throw new Error('x'); }, conn, { fallbackMs: 5000, offlineMs: 15_000 });
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toBe(2);
    fail = true;
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toBe(3);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(calls).toBe(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(4);
    p.stop();
  });

  it('turns a burst of hub events into one load within 500 ms', async () => {
    const conn = new Connectivity();
    conn.setHub('up');
    let calls = 0;
    const p = new Poller(async () => { calls++; }, conn, OPT);
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);
    for (let n = 0; n < 6; n++) { p.changed(); await vi.advanceTimersByTimeAsync(50); }
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(calls).toBe(2); // one GET for the whole burst
    await vi.advanceTimersByTimeAsync(COALESCE_MS * 2);
    expect(calls).toBe(2);
    p.changed();
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(calls).toBe(3);
    p.stop();
  });

  it('Retry runs exactly one refetch and clears offline when it works', async () => {
    const conn = new Connectivity();
    let calls = 0;
    let fail = true;
    const p = new Poller(async () => { calls++; if (fail) throw new Error('x'); }, conn, OPT);
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(conn.offline()).toBe(true);
    fail = false;
    conn.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(2);
    expect(conn.offline()).toBe(false);
    p.stop();
  });

  it('stops listening to the hub and to Retry after stop()', async () => {
    const conn = new Connectivity();
    let calls = 0;
    const p = new Poller(async () => { calls++; }, conn, OPT);
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    p.stop();
    conn.setHub('up');
    conn.retry();
    p.changed();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls).toBe(1);
  });
});

describe('Poller with a flapping hub', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('failed hub retries do not keep postponing the fallback poll', async () => {
    const conn = new Connectivity();
    let calls = 0;
    const p = new Poller(async () => { calls++; }, conn, { fallbackMs: 15_000, offlineMs: 60_000 });
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);
    // The hub fails its first tries at 0 s, 2 s and 10 s.
    for (const at of [0, 2000, 8000]) {
      await vi.advanceTimersByTimeAsync(at);
      conn.setHub('connecting');
      conn.setHub('down');
    }
    await vi.advanceTimersByTimeAsync(5000); // 15 s since the first load
    expect(calls).toBe(2);
    p.stop();
  });
});
