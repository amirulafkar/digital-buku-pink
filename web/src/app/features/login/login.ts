import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { Auth } from '../../core/auth';
import { I18n } from '../../core/i18n';

@Component({
  selector: 'app-login',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <section class="card" aria-labelledby="login-h">
      <div class="brand"><i class="ph ph-heartbeat" aria-hidden="true"></i></div>
      <h1 id="login-h">{{ i.t('login.title') }}</h1>
      @if (auth.expired()) { <p class="info" role="status"><i class="ph ph-info" aria-hidden="true"></i>{{ i.t('login.expired') }}</p> }
      @if (failed()) { <p class="fail" role="alert"><i class="ph ph-warning-circle" aria-hidden="true"></i>{{ i.t('login.error') }}</p> }
      <form (ngSubmit)="submit()" #f="ngForm" novalidate>
        <mat-form-field appearance="outline">
          <mat-label>{{ i.t('login.username') }}</mat-label>
          <input matInput name="username" autocomplete="username" required [(ngModel)]="username" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ i.t('login.password') }}</mat-label>
          <input matInput type="password" name="password" autocomplete="current-password" required [(ngModel)]="password" />
        </mat-form-field>
        <button mat-flat-button type="submit" [disabled]="busy() || !username || !password">
          {{ busy() ? i.t('login.busy') : i.t('login.submit') }}
        </button>
      </form>
    </section>`,
  styles: [`
    :host { display: grid; place-items: center; padding: 3rem 1rem; }
    .card { width: min(26rem, 100%); background: var(--bg); border: 1px solid var(--line); border-radius: var(--r-3); box-shadow: var(--neu-raised);
      padding: 2.25rem; display: grid; gap: 1rem; animation: rise var(--dur-long) var(--ease); }
    .brand i { font-size: 2rem; color: var(--accent-ink); width: 4rem; height: 4rem; display: grid; place-items: center; border-radius: var(--r-3);
      background: var(--bg); box-shadow: var(--neu-raised-sm); border: 1px solid var(--line); }
    h1 { margin: 0; font-family: var(--font-head); font-size: 1.6rem; }
    form { display: grid; gap: .5rem; }
    button { height: 3rem; margin-top: .5rem; }
    .info, .fail { display: flex; gap: .5rem; align-items: center; margin: 0; padding: .65rem .85rem; border-radius: var(--r-2); }
    .info { background: var(--bg); box-shadow: var(--neu-inset); border: 1px solid var(--line); }
    .fail { background: var(--danger-soft); color: var(--danger-ink); border: 1px solid var(--danger); }
    @keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  `],
})
export class Login {
  i = inject(I18n);
  auth = inject(Auth);
  private router = inject(Router);
  username = '';
  password = '';
  busy = signal(false);
  failed = signal(false);

  async submit(): Promise<void> {
    this.busy.set(true);
    this.failed.set(false);
    const ok = await this.auth.login(this.username.trim(), this.password);
    this.busy.set(false);
    if (ok) await this.router.navigateByUrl('/queue');
    else { this.failed.set(true); this.password = ''; }
  }
}
