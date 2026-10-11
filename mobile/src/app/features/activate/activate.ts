import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../../core/auth';
import { I18n, Key } from '../../core/i18n';

@Component({
  selector: 'app-activate',
  imports: [FormsModule, RouterLink],
  template: `
    <section class="page" aria-labelledby="h">
      <h1 id="h">{{ i.t('activate.title') }}</h1>
      <p class="muted">{{ i.t('activate.intro') }}</p>
      @if (error()) { <p id="err" class="msg bad" role="alert"><i class="ph ph-warning-circle" aria-hidden="true"></i>{{ i.t(error()!) }}</p> }
      <form class="card form" (ngSubmit)="submit()" [attr.aria-describedby]="error() ? 'err' : null" novalidate>
        <div class="field"><label for="code">{{ i.t('activate.code') }}</label>
          <input id="code" name="code" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" [(ngModel)]="code" [attr.aria-invalid]="bad() === 'code'" [attr.aria-describedby]="bad() === 'code' ? 'err' : null" data-testid="code" /></div>
        <div class="field"><label for="phone">{{ i.t('activate.phone') }}</label>
          <input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" [(ngModel)]="phone" [attr.aria-invalid]="bad() === 'phone'" [attr.aria-describedby]="bad() === 'phone' ? 'err' : null" data-testid="phone" /></div>
        <div class="field"><label for="pw">{{ i.t('activate.password') }}</label>
          <input id="pw" name="pw" type="password" autocomplete="new-password" [(ngModel)]="password" [attr.aria-invalid]="bad() === 'pw'" [attr.aria-describedby]="bad() === 'pw' ? 'err' : null" data-testid="password" /></div>
        <button class="btn primary block" type="submit" [disabled]="busy()" data-testid="activate-submit">{{ busy() ? i.t('activate.busy') : i.t('activate.submit') }}</button>
      </form>
      <p class="alt"><span>{{ i.t('activate.have') }}</span> <a class="btn" routerLink="/login">{{ i.t('activate.gologin') }}</a></p>
    </section>`,
  styles: [`
    .form { display: grid; gap: 1rem; }
    .alt { display: flex; flex-wrap: wrap; gap: .75rem; align-items: center; justify-content: space-between; }
  `],
})
export class Activate {
  i = inject(I18n);
  private auth = inject(Auth);
  private router = inject(Router);
  code = ''; phone = ''; password = '';
  busy = signal(false);
  error = signal<Key | null>(null);
  bad = signal<'code' | 'phone' | 'pw' | null>(null); // the field the error belongs to

  private fail(msg: Key, field: 'code' | 'phone' | 'pw', id: string): void {
    this.error.set(msg);
    this.bad.set(field);
    setTimeout(() => document.getElementById(id)?.focus());
  }

  async submit(): Promise<void> {
    this.error.set(null);
    this.bad.set(null);
    if (this.password.length < 8) { this.fail('activate.short', 'pw', 'pw'); return; }
    this.busy.set(true);
    const r = await this.auth.activate(this.code.trim(), this.phone.trim(), this.password);
    this.busy.set(false);
    if (r === 'ok') { this.password = ''; this.code = ''; this.phone = ''; await this.router.navigateByUrl('/login'); }
    else if (r === 'invalid') { this.password = ''; this.fail('activate.error', 'code', 'code'); } // wrong code: clear the password
    else this.error.set(r === 'limited' ? 'login.toomany' : 'login.network'); // form-level: not tied to a field; keep what was typed
  }
}
