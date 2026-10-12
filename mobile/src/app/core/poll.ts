import { Injectable, computed, signal } from '@angular/core';

/** Tracks browser connectivity and whether the API is reachable. Writes are disabled while offline. */
@Injectable({ providedIn: 'root' })
export class Connectivity {
  private browserOnline = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  private apiFailing = signal(false);
  readonly offline = computed(() => !this.browserOnline() || this.apiFailing());

  constructor() {
    window.addEventListener('online', () => this.browserOnline.set(true));
    window.addEventListener('offline', () => this.browserOnline.set(false));
  }

  reportOk(): void { this.apiFailing.set(false); }
  reportFailure(): void { this.apiFailing.set(true); }
}

/**
 * Polls a loader. Pauses while the tab is hidden, refreshes right away when it becomes visible,
 * and backs off from 5 s to 15 s after an error. Order of data is never changed here.
 */
export class Poller {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private failed = false;
  private onVisibility = () => {
    if (!this.running) return;
    if (document.hidden) this.clear();
    else void this.tick(true);
  };

  constructor(
    private load: () => Promise<void>,
    private conn: Connectivity,
    private okMs = 5000,
    private errorMs = 15000,
    /** While this returns true (live updates are connected) the timer does not poll; explicit refreshes still run. */
    private skip: () => boolean = () => false,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    document.addEventListener('visibilitychange', this.onVisibility);
    void this.tick(true); // the first load never waits for the live connection
  }

  stop(): void {
    this.running = false;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.clear();
  }

  /** Immediate reload (for example after a write). */
  async refreshNow(): Promise<void> { this.clear(); await this.tick(true); }

  private clear(): void { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }

  private async tick(force = false): Promise<void> {
    this.clear();
    if (!this.running || document.hidden) return;
    if (!force && this.skip()) { this.timer = setTimeout(() => void this.tick(), this.okMs); return; }
    try {
      await this.load();
      this.failed = false;
      this.conn.reportOk();
    } catch {
      this.failed = true;
      this.conn.reportFailure();
    }
    if (this.running && !document.hidden) this.timer = setTimeout(() => void this.tick(), this.failed ? this.errorMs : this.okMs);
  }
}
