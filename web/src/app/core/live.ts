import { Injectable, effect, inject, signal } from '@angular/core';
import { HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { Auth } from './auth';

export type LiveState = 'live' | 'reconnecting' | 'off';

const BACKOFF_MS = [0, 2000, 5000, 10000, 30000]; // then 30 s

/**
 * Live updates over SignalR. The hub is server-push only and carries no data: an event just says "something changed",
 * and the screen refetches through the normal authenticated REST endpoint. Polling keeps running while this is not connected
 * and pauses while it is, so nothing updates twice.
 */
@Injectable({ providedIn: 'root' })
export class Live {
  private auth = inject(Auth);
  readonly state = signal<LiveState>('off');
  /** Bumps once for every accepted (newer) event, and once after a reconnect (an immediate refetch). */
  readonly tick = signal(0);
  private last = 0;
  private conn: HubConnection | null = null;
  private wanted = false;

  constructor() {
    // Logout disconnects before the tokens are cleared.
    this.auth.beforeLogout.push(() => void this.stop());
    effect(() => { if (this.auth.signedIn()) void this.start(); else void this.stop(); });
  }

  /** Drops events that are not newer than the last one seen (duplicates and out-of-order delivery). */
  accept(version: number): boolean {
    if (!(version > this.last)) return false;
    this.last = version;
    this.tick.update(n => n + 1);
    return true;
  }

  private async start(): Promise<void> {
    if (this.wanted) return;
    this.wanted = true;
    const c = new HubConnectionBuilder()
      .withUrl('/hubs/queue', { accessTokenFactory: async () => { await this.auth.ensureFresh(); return this.auth.token ?? ''; } })
      .withAutomaticReconnect({ nextRetryDelayInMilliseconds: ctx => BACKOFF_MS[Math.min(ctx.previousRetryCount, BACKOFF_MS.length - 1)] })
      .configureLogging(LogLevel.None) // never log URLs: the WebSocket URL carries the access token
      .build();
    this.conn = c;
    c.on('queueChanged', (e: { version?: number }) => { if (typeof e?.version === 'number') this.accept(e.version); });
    c.onreconnecting(() => this.state.set('reconnecting'));
    c.onreconnected(() => { this.state.set('live'); this.tick.update(n => n + 1); });
    c.onclose(() => { if (this.wanted && this.conn === c) { this.state.set('off'); void this.retryStart(c, 1); } });
    for (let attempt = 0; this.wanted && this.conn === c; attempt++) {
      try { await c.start(); this.state.set('live'); this.tick.update(n => n + 1); return; }
      catch {
        this.state.set('off');
        await new Promise(r => setTimeout(r, BACKOFF_MS[Math.min(attempt + 1, BACKOFF_MS.length - 1)]));
      }
    }
  }

  private async retryStart(c: HubConnection, attempt: number): Promise<void> {
    while (this.wanted && this.conn === c) {
      await new Promise(r => setTimeout(r, BACKOFF_MS[Math.min(attempt++, BACKOFF_MS.length - 1)]));
      if (!this.wanted || this.conn !== c) return;
      try { await c.start(); this.state.set('live'); this.tick.update(n => n + 1); return; } catch { this.state.set('off'); }
    }
  }

  async stop(): Promise<void> {
    this.wanted = false;
    const c = this.conn;
    this.conn = null;
    this.last = 0;
    this.state.set('off');
    if (c) { try { await c.stop(); } catch { /* already closed */ } }
  }
}
