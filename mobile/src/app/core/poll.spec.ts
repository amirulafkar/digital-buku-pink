import { Connectivity, Poller } from './poll';

describe('Poller', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('polls every 5 s and backs off to 15 s after an error', async () => {
    const conn = new Connectivity();
    let calls = 0;
    let fail = false;
    const p = new Poller(async () => { calls++; if (fail) throw new Error('x'); }, conn);
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toBe(2);
    fail = true;
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toBe(3);
    expect(conn.offline()).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toBe(3); // backed off
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toBe(4);
    fail = false;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(conn.offline()).toBe(false);
    p.stop();
  });
});
