import { Injectable, signal } from '@angular/core';

/** Tiny cross-component signal: the shell bumps it after a write so the queue reloads at once. */
@Injectable({ providedIn: 'root' })
export class Events {
  readonly queueChanged = signal(0);
  /** In-memory handoff of the top bar search text to the Patients screen. Never put in a URL. */
  readonly searchHandoff = signal<string | null>(null);
  bump(): void { this.queueChanged.update(n => n + 1); }
}
