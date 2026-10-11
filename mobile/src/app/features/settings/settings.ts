import { PageHeading } from '../../shared/page-heading';
import { Component, inject } from '@angular/core';
import { Auth } from '../../core/auth';
import { I18n } from '../../core/i18n';

@Component({
  imports: [PageHeading],
  selector: 'app-settings',
  template: `
    <section class="page" aria-labelledby="h">
      <h1 id="h" pageHeading>{{ i.t('settings.title') }}</h1>
      <div class="card group" role="group" [attr.aria-labelledby]="'lg'">
        <h2 id="lg">{{ i.t('settings.language') }}</h2>
        <div class="seg">
          <button type="button" class="btn" [attr.aria-pressed]="i.lang() === 'en'" (click)="i.set('en')" lang="en" data-testid="lang-en">English</button>
          <button type="button" class="btn" [attr.aria-pressed]="i.lang() === 'ms'" (click)="i.set('ms')" lang="ms" data-testid="lang-ms">Bahasa Malaysia</button>
        </div>
      </div>
      <div class="card">
        <h2>{{ i.t('settings.privacy.title') }}</h2>
        <p class="muted" data-testid="privacy">{{ i.t('settings.privacy.text') }}</p>
      </div>
      <button class="btn block" type="button" (click)="logout()" data-testid="logout"><i class="ph ph-sign-out" aria-hidden="true"></i>{{ i.t('settings.logout') }}</button>
      <p class="muted small">{{ i.t('settings.version') }}</p>
    </section>`,
  styles: [`
    .group, .card { display: grid; gap: .75rem; } h2 { font-size: 1.1rem; }
    .seg { display: grid; grid-template-columns: 1fr 1fr; gap: .6rem; }
    .seg .btn[aria-pressed=true] { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
    .small { font-size: .875rem; }
  `],
})
export class Settings {
  i = inject(I18n);
  private auth = inject(Auth);
  logout(): void { void this.auth.logout(); }
}
