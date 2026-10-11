import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../../core/auth';
import { I18n, Key } from '../../core/i18n';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  template: `
    <section class="page" aria-labelledby="h">
      <h1 id="h">{{ i.t('login.title') }}</h1>
      @if (auth.notice() === 'ready') { <p class="msg" role="status" data-testid="ready"><i class="ph ph-check-circle" aria-hidden="true"></i>{{ i.t('login.ready') }}</p> }
      @if (auth.notice() === 'expired') { <p class="msg" role="status"><i class="ph ph-info" aria-hidden="true"></i>{{ i.t('login.expired') }}</p> }
      @if (error()) { <p id="err" class="msg bad" role="alert"><i class="ph ph-warning-circle" aria-hidden="true"></i>{{ i.t(error()!) }}</p> }
      <form class="card form" (ngSubmit)="submit()" [attr.aria-describedby]="error() ? 'err' : null" novalidate>
        <div class="field"><label for="phone">{{ i.t('login.phone') }}</label>
          <input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" [(ngModel)]="phone" [attr.aria-invalid]="fieldError()" [attr.aria-describedby]="fieldError() ? 'err' : null" data-testid="phone" /></div>
        <div class="field"><label for="pw">{{ i.t('login.password') }}</label>
          <input id="pw" name="pw" type="password" autocomplete="current-password" [(ngModel)]="password" [attr.aria-invalid]="fieldError()" [attr.aria-describedby]="fieldError() ? 'err' : null" data-testid="password" /></div>
        <button class="btn primary block" type="submit" [disabled]="busy()" data-testid="login-submit">{{ busy() ? i.t('login.busy') : i.t('login.submit') }}</button>
      </form>
      <p class="alt"><span>{{ i.t('login.new') }}</span> <a class="btn" routerLink="/activate">{{ i.t('login.goactivate') }}</a></p>
    </section>`,
  styles: [`.form { display: grid; gap: 1rem; } .alt { display: flex; flex-wrap: wrap; gap: .75rem; align-items: center; justify-content: space-between; }`],
})
export class Login {
  i = inject(I18n);
  auth = inject(Auth);
  private router = inject(Router);
  phone = ''; password = '';
  busy = signal(false);
  error = signal<Key | null>(null);
  fieldError = signal(false); // true only when the details themselves were wrong (not for network or rate-limit errors)

  async submit(): Promise<void> {
    this.error.set(null);
    this.fieldError.set(false);
    this.busy.set(true);
    const r = await this.auth.login(this.phone.trim(), this.password);
    this.busy.set(false);
    if (r === 'ok') { this.password = ''; this.phone = ''; await this.router.navigateByUrl('/home'); return; }
    if (r === 'denied') this.password = ''; // wrong details: clear the password; on a network error keep what was typed
    this.fieldError.set(r === 'denied');
    this.error.set(r === 'limited' ? 'login.toomany' : r === 'error' ? 'login.network' : 'login.error');
    if (r === 'denied') setTimeout(() => document.getElementById('phone')?.focus());
  }
}
