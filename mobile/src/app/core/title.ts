import { Injectable, effect, inject, signal } from '@angular/core';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { I18n, Key } from './i18n';

/** Document titles follow the UI language and update on both route changes and language changes (NFR-08). */
@Injectable({ providedIn: 'root' })
export class LocalizedTitle extends TitleStrategy {
  private i18n = inject(I18n);
  private key = signal<Key | null>(null);

  constructor() {
    super();
    effect(() => {
      const k = this.key();
      document.title = k ? `${this.i18n.t(k)} | ${this.i18n.t('app.name')}` : this.i18n.t('app.name');
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    let r = snapshot.root;
    while (r.firstChild) r = r.firstChild;
    this.key.set((r.data['titleKey'] as Key | undefined) ?? null);
  }
}
