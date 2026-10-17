import { Injectable, inject } from '@angular/core';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { apiUrl } from './api-base';
import { Auth } from './auth';
import { Connectivity } from './poll';

/** Waits (ms) before each reconnect try after the hub closes or fails to start. After the last one we stop and the fallback poll carries on. */
export const RETRY_DELAYS_MS = [0, 2000, 10_000, 30_000];
export const HUB_URL = '/hubs/queue';
export const HUB_EVENT = 'QueueChanged';

/** The small part of a SignalR connection this client needs, so tests can use a fake. */
export interface HubLike {
  on(event: string, cb: () => void): void;
  onclose(cb: () => void): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}
export type HubFactory = () => HubLike;

/**
 * Live refresh signal. The hub says only "something changed"; the screen then reloads over REST.
 * Server to client only: this client never sends anything. The token comes from memory through `token()`
 * and is never stored.
 */
export class LiveClient {
  private active = false;
  private running = false;
  private epoch = 0;
  private hub: HubLike | null = null;
  private undo: (() => void)[] = [];

  constructor(
    private factory: HubFactory,
    private conn: Connectivity,
    private sleep: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms)),
  ) {}

  start(onChanged: () => void): void {
    if (this.active) return;
    this.active = true;
    this.onChanged = onChanged;
    this.conn.liveWanted.set(true);
    this.undo.push(this.conn.addRetry(() => this.ensure()));
    void this.run(true, ++this.epoch);
  }

  stop(): void {
    this.active = false;
    this.epoch++;
    this.undo.forEach(u => u());
    this.undo = [];
    this.conn.liveWanted.set(false);
    this.conn.setHub('idle');
    const h = this.hub; this.hub = null;
    if (h) void h.stop().catch(() => undefined);
  }

  /** Retry pressed: if we gave up, try again from the start of the schedule. */
  ensure(): void {
    if (this.active && !this.running && this.conn.hub() !== 'up') void this.run(true, ++this.epoch);
  }

  private onChanged: () => void = () => undefined;

  private async open(epoch: number): Promise<void> {
    const h = this.factory();
    h.on(HUB_EVENT, () => { if (epoch === this.epoch) this.onChanged(); });
    h.onclose(() => {
      if (epoch !== this.epoch || !this.active) return;
      this.hub = null;
      this.conn.setHub('connecting'); // try again at once; the banner shows only if that fails too
      void this.run(false, epoch);
    });
    this.conn.setHub('connecting');
    await h.start();
    if (epoch !== this.epoch) { void h.stop().catch(() => undefined); return; }
    this.hub = h;
    this.conn.setHub('up');
  }

  /** first: the very first try has no wait. Otherwise the schedule starts at its first delay (0 s). */
  private async run(first: boolean, epoch: number): Promise<void> {
    this.running = true;
    let i = first ? -1 : 0;
    try {
      for (;;) {
        if (epoch !== this.epoch) return;
        if (i >= 0) { await this.sleep(RETRY_DELAYS_MS[i]); if (epoch !== this.epoch) return; }
        try { await this.open(epoch); return; }
        catch {
          if (epoch !== this.epoch) return;
          this.conn.setHub('down');
          i++;
          if (i >= RETRY_DELAYS_MS.length) return; // stop: stay on the fallback poll
        }
      }
    } finally { if (epoch === this.epoch) this.running = false; }
  }
}

/** Real SignalR connection. The access token is read from memory on every connect; a fresh one is fetched if it is about to expire. */
@Injectable({ providedIn: 'root' })
export class Live {
  private auth = inject(Auth);
  private conn = inject(Connectivity);
  private client = new LiveClient(() => {
    const c = new HubConnectionBuilder()
      .withUrl(apiUrl(HUB_URL), { accessTokenFactory: () => this.auth.freshToken(), withCredentials: false })
      .configureLogging(LogLevel.None)
      .build();
    return { on: (e, cb) => c.on(e, cb), onclose: cb => c.onclose(() => cb()), start: () => c.start(), stop: () => c.stop() };
  }, this.conn);

  start(onChanged: () => void): void { this.client.start(onChanged); }
  stop(): void { this.client.stop(); }
}
