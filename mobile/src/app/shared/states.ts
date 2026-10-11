import { Component, inject, input, output } from '@angular/core';
import { I18n } from '../core/i18n';
import { Connectivity } from '../core/poll';

@Component({
  selector: 'app-skeleton',
  template: `<div class="sk" role="status"><p class="cap"><i class="ph ph-circle-notch spin" aria-hidden="true"></i>{{ i.t('state.loading') }}</p><div class="bar"></div><div class="bar"></div></div>`,
  styles: [`
    .sk { display: grid; gap: .75rem; }
    .cap { display: flex; align-items: center; gap: .5rem; color: var(--muted); font-weight: 600; }
    .spin { animation: spin 1s linear infinite; }
    .bar { height: 3.5rem; border-radius: var(--r-3); background: var(--bg); box-shadow: var(--neu-inset); }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class Skeleton { i = inject(I18n); }

@Component({
  selector: 'app-error',
  template: `<div class="msg bad" role="alert"><i class="ph ph-warning-circle" aria-hidden="true"></i><span>{{ text() }}</span></div>
    <button type="button" class="btn" (click)="retry.emit()"><i class="ph ph-arrow-clockwise" aria-hidden="true"></i>{{ i.t('state.retry') }}</button>`,
  styles: [`:host { display: grid; gap: .75rem; }`],
})
export class ErrorState {
  i = inject(I18n);
  text = input.required<string>();
  retry = output<void>();
}

@Component({
  selector: 'app-offline-banner',
  template: `@if (conn.offline()) { <div class="off" role="status"><i class="ph ph-wifi-slash" aria-hidden="true"></i><span>{{ i.t('state.offline') }}</span></div> }`,
  styles: [`
    .off { display: flex; gap: .6rem; align-items: center; padding: .7rem 1rem; background: var(--warn-soft); color: var(--warn-ink); font-weight: 700; border-bottom: 1px solid var(--warn-ink); }
    i { font-size: 1.25rem; }
  `],
})
export class OfflineBanner {
  i = inject(I18n);
  conn = inject(Connectivity);
}
