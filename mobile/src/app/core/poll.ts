import { Injectable, computed, signal } from '@angular/core';

/** Where the live hub is. Only 'down' shows the "Live updates paused" banner; 'connecting' is the short moment before a (re)connect succeeds or fails. */
export type HubStatus = 'idle' | 'connecting' | 'up' | 'down';
/** What the screen tells the person (brief S5). */
export type LiveState = 'connected' | 'reconnecting' | 'offline';

/** Refresh timing in milliseconds. The hub is a hint; REST is always the source of truth. */
export const SAFETY_POLL_MS = 60_000;
export const COALESCE_MS = 500;

/** Pure state rule, so it can be tested without a browser. */
export function liveState(offline: boolean, liveWanted: boolean, hub: HubStatus): LiveState {
  if (offline) return 'offline';
  return liveWanted && hub === 'down' ? 'reconnecting' : 'connected';
}

/**
 * Tracks browser connectivity, whether the API answers, and the live hub.
 * `canWrite` is the one flag every write control reads. A later offline outbox can replace this flag;
 * nothing is stored for later in S5 and every write still carries its idempotencyKey.
 */
@Injectable({ providedIn: 'root' })
export class Connectivity {
  private browserOnline = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  private apiFailing = signal(false);
  readonly hub = signal<HubStatus>('idle');
  /** True while a screen that listens to the hub is open. */
  readonly liveWanted = signal(false);
  /** ISO time of the last successful REST refresh. */
  readonly lastOk = signal<string | null>(null);

  readonly offline = computed(() => !this.browserOnline() || this.apiFailing());
  readonly canWrite = computed(() => !this.offline());
  readonly state = computed<LiveState>(() => liveState(this.offline(), this.liveWanted(), this.hub()));

  private retryHandlers = new Set<() => void>();
  private hubListeners = new Set<(now: HubStatus, before: HubStatus) => void>();

  constructor() {
    window.addEventListener('online', () => this.browserOnline.set(true));
    window.addEventListener('offline', () => this.browserOnline.set(false));
  }

  reportOk(): void { this.apiFailing.set(false); this.lastOk.set(new Date().toISOString()); }
  reportFailure(): void { this.apiFailing.set(true); }

  setHub(s: HubStatus): void {
    const before = this.hub();
    if (before === s) return;
    this.hub.set(s);
    for (const l of [...this.hubListeners]) l(s, before);
  }
  onHub(l: (now: HubStatus, before: HubStatus) => void): () => void { this.hubListeners.add(l); return () => this.hubListeners.delete(l); }

  /** The Retry button. Screens register what a retry means for them (reload, reconnect). */
  addRetry(h: () => void): () => void { this.retryHandlers.add(h); return () => this.retryHandlers.delete(h); }
  retry(): void {
    if (this.retryHandlers.size === 0) {
      // Nothing is loading on this screen: re-read the browser and let the next call decide.
      this.browserOnline.set(typeof navigator === 'undefined' ? true : navigator.onLine);
      this.apiFailing.set(false);
      return;
    }
    for (const h of [...this.retryHandlers]) h();
  }
}

export interface PollOptions {
  /** Interval while the hub is not up (fallback poll). */
  fallbackMs: number;
  /** Interval while offline. */
  offlineMs: number;
  /** Interval while the hub is up (safety poll). */
  safetyMs?: number;
}

/**
 * Loads data now and then. Which "then" depends on the hub: safety poll (60 s) while it is up,
 * fallback poll while it is not, a slower poll while offline. Pauses while the tab is hidden and
 * refreshes at once when it is visible again. Hub events are coalesced into one load within 500 ms.
 * Order of data is never changed here.
 */
export class Poller {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private coalesce: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private stops: (() => void)[] = [];
  private onVisibility = () => {
    if (!this.running) return;
    if (document.hidden) this.clear();
    else void this.tick();
  };

  constructor(private load: () => Promise<void>, private conn: Connectivity, private opt: PollOptions) {}

  /** The next wait, from the current state. */
  intervalMs(): number {
    if (this.conn.offline()) return this.opt.offlineMs;
    return this.conn.hub() === 'up' ? this.opt.safetyMs ?? SAFETY_POLL_MS : this.opt.fallbackMs;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    document.addEventListener('visibilitychange', this.onVisibility);
    this.stops.push(this.conn.onHub((now, before) => {
      if (!this.running) return;
      if (now === 'up') void this.refreshNow();   // reconnecting -> connected: one refetch to close any gap
      else if (before === 'up') this.schedule();  // connected -> not: fall back to the shorter poll
    }));
    this.stops.push(this.conn.addRetry(() => void this.refreshNow()));
    void this.tick();
  }

  stop(): void {
    this.running = false;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.stops.forEach(s => s());
    this.stops = [];
    this.clear();
    if (this.coalesce) { clearTimeout(this.coalesce); this.coalesce = null; }
  }

  /** Immediate reload (for example after a write or Retry). */
  async refreshNow(): Promise<void> { this.clear(); await this.tick(); }

  /** A hub event arrived. A burst becomes one load, 500 ms after the first. */
  changed(): void {
    if (!this.running || this.coalesce) return;
    this.coalesce = setTimeout(() => { this.coalesce = null; void this.refreshNow(); }, COALESCE_MS);
  }

  private clear(): void { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }
  private schedule(): void {
    this.clear();
    if (this.running && !document.hidden) this.timer = setTimeout(() => void this.tick(), this.intervalMs());
  }

  private async tick(): Promise<void> {
    this.clear();
    if (!this.running || document.hidden) return;
    try {
      await this.load();
      this.conn.reportOk();
    } catch {
      this.conn.reportFailure();
    }
    this.schedule();
  }
}
