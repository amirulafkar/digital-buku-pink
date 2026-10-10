import { Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark';
const KEY = 'dbp.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.initial());

  constructor() { this.apply(this.theme()); }

  private initial(): Theme {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  toggle(): void { this.set(this.theme() === 'dark' ? 'light' : 'dark'); }

  set(t: Theme): void {
    this.theme.set(t);
    localStorage.setItem(KEY, t);
    this.apply(t);
  }

  private apply(t: Theme): void { document.documentElement.dataset['theme'] = t; }
}
