import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Auth } from './auth';
import { Live } from './live';

describe('Live updates', () => {
  function make() {
    const fakeAuth = { signedIn: signal(false), beforeLogout: [] as (() => void)[], token: null, ensureFresh: async () => undefined };
    TestBed.configureTestingModule({ providers: [{ provide: Auth, useValue: fakeAuth }] });
    return { live: TestBed.inject(Live), fakeAuth };
  }

  it('renders only the highest version: duplicates and out-of-order events are dropped (A9)', () => {
    const { live } = make();
    const t0 = live.tick();
    expect(live.accept(10)).toBe(true);
    expect(live.accept(10)).toBe(false); // duplicate
    expect(live.accept(9)).toBe(false);  // out of order
    expect(live.accept(12)).toBe(true);
    expect(live.accept(11)).toBe(false); // late
    expect(live.tick() - t0).toBe(2);
  });

  it('is off while signed out and registers a logout hook that stops it', async () => {
    const { live, fakeAuth } = make();
    expect(live.state()).toBe('off');
    expect(fakeAuth.beforeLogout.length).toBe(1);
    fakeAuth.beforeLogout[0]();
    expect(live.state()).toBe('off');
  });
});
