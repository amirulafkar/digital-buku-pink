import { Component, inject, input, output } from '@angular/core';
import { I18n } from '../core/i18n';
import { Connectivity } from '../core/poll';

@Component({
  selector: 'app-skeleton',
  template: `
    <div class="sk" role="status">
      <p class="cap"><i class="ph ph-circle-notch spin" aria-hidden="true"></i>{{ i.t('state.loading') }}</p>
      @for (r of rows(); track r) { <div class="bar"></div> }
    </div>`,
  styles: [`
    .sk { display: grid; gap: .75rem; }
    .cap { margin: 0; display: flex; align-items: center; gap: .5rem; color: var(--muted); font-weight: 600; }
    .spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .bar { height: 3.5rem; border-radius: var(--r-3); background: var(--bg); box-shadow: var(--neu-inset); animation: pulse 1.4s var(--ease) infinite; }
    @keyframes pulse { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
  `],
})
export class Skeleton {
  i = inject(I18n);
  count = input(4);
  rows = () => Array.from({ length: this.count() }, (_, n) => n);
}

@Component({
  selector: 'app-empty',
  template: `<div class="empty"><i class="ph" [class]="icon()" aria-hidden="true"></i><p>{{ text() }}</p><ng-content /></div>`,
  styles: [`
    .empty { display: grid; justify-items: center; gap: .5rem; padding: 2.5rem 1rem; text-align: center; color: var(--muted);
      border: 1px solid var(--edge); border-radius: var(--r-3); box-shadow: var(--neu-inset); }
    i { font-size: 2rem; color: var(--accent-ink); }
    p { margin: 0; color: var(--text); }
  `],
})
export class EmptyState {
  text = input.required<string>();
  icon = input('ph-tray');
}

@Component({
  selector: 'app-error',
  template: `
    <div class="err" role="alert"><i class="ph ph-warning-circle" aria-hidden="true"></i><span>{{ text() }}</span>
      <button type="button" class="btn-link" (click)="retry.emit()"><i class="ph ph-arrow-clockwise" aria-hidden="true"></i>{{ i.t('state.retry') }}</button></div>`,
  styles: [`
    .err { display: flex; align-items: center; gap: .75rem; padding: .85rem 1rem; border-radius: var(--r-2); background: var(--danger-soft); color: var(--danger-ink); flex-wrap: wrap; border: 1px solid var(--danger); box-shadow: var(--neu-raised-sm); }
    i { font-size: 1.25rem; }
    .btn-link { margin-left: auto; display: inline-flex; gap: .35rem; align-items: center; border: 1px solid currentColor; background: transparent;
      color: inherit; border-radius: var(--r-2); padding: .4rem .9rem; min-height: 44px; font: inherit; font-weight: 600; cursor: pointer; }
  `],
})
export class ErrorState {
  i = inject(I18n);
  text = input.required<string>();
  retry = output<void>();
}

@Component({
  selector: 'app-offline-banner',
  template: `
    @if (conn.offline()) {
      <div class="offline" role="status"><i class="ph ph-wifi-slash" aria-hidden="true"></i><span>{{ i.t('state.offline') }}</span></div>
    }`,
  styles: [`
    .offline { display: flex; gap: .6rem; align-items: center; padding: .65rem 1.25rem; background: var(--warn-soft); color: var(--warn-ink); border-top: 1px solid var(--warn-ink);
      font-weight: 700; box-shadow: var(--neu-inset); animation: drop var(--dur) var(--ease); }
    i { font-size: 1.25rem; }
    @keyframes drop { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
  `],
})
export class OfflineBanner {
  i = inject(I18n);
  conn = inject(Connectivity);
}
