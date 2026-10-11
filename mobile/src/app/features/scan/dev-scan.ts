import { Component, inject, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n } from '../../core/i18n';

/**
 * DEVELOPER ONLY. Lets browser tests paste a real QR token. It still calls the real POST /checkins; it never bypasses the API.
 * It is loaded with a dynamic import behind `ngDevMode`, so production builds contain neither this component nor its chunk.
 */
@Component({
  selector: 'app-dev-scan',
  imports: [FormsModule],
  template: `
    <form class="card dev" (ngSubmit)="go()" data-testid="dev-scan">
      <h2>{{ t('title') }}</h2>
      <div class="field"><label for="devtoken">{{ t('label') }}</label>
        <input id="devtoken" name="devtoken" autocomplete="off" autocapitalize="off" spellcheck="false" [(ngModel)]="token" data-testid="dev-token" /></div>
      <button class="btn block" type="submit" [disabled]="!token.trim()" data-testid="dev-submit">{{ t('submit') }}</button>
    </form>`,
  styles: [`.dev { display: grid; gap: .75rem; } h2 { font-size: 1.05rem; }`],
})
export class DevScan {
  i = inject(I18n);
  /** Dev-only strings, keyed like the main catalogue but kept in this lazy chunk so production never ships them. */
  private static readonly DEV = {
    en: { title: 'Developer only: paste a QR token', label: 'QR token', submit: 'Check in with token' },
    ms: { title: 'Pembangun sahaja: tampal token QR', label: 'Token QR', submit: 'Daftar masuk dengan token' },
  } as const;
  t = (k: 'title' | 'label' | 'submit') => DevScan.DEV[this.i.lang()][k];
  token = '';
  submitToken = output<string>();
  go(): void { const t = this.token.trim(); this.token = ''; if (t) this.submitToken.emit(t); }
}
