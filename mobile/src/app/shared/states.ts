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

/**
 * Connection banner (brief S5). One persistent status region so a screen reader hears each change.
 * reconnecting: live updates paused, polling instead. offline: last update time and a Retry button.
 * It never shows a wait time. Writes are gated on Connectivity.canWrite, not on this banner.
 */
@Component({
  selector: 'app-offline-banner',
  template: `
    <div class="live" role="status" data-testid="conn-banner" [attr.data-state]="conn.state()">
      @if (conn.state() === 'offline') {
        <div class="bar off">
          <i class="ph ph-wifi-slash" aria-hidden="true"></i>
          <span class="txt" data-testid="offline-text">{{ conn.lastOk() ? i.t('state.offline', { time: i.time(conn.lastOk()!) }) : i.t('state.offline.nodata') }}</span>
          <button type="button" class="retry" (click)="conn.retry()" data-testid="conn-retry"><i class="ph ph-arrow-clockwise" aria-hidden="true"></i>{{ i.t('state.retry') }}</button>
        </div>
      } @else if (conn.state() === 'reconnecting') {
        <div class="bar paused"><i class="ph ph-plugs" aria-hidden="true"></i><span class="txt" data-testid="paused-text">{{ i.t('state.live.paused') }}</span></div>
      }
    </div>`,
  styles: [`
    .bar { display: flex; flex-wrap: wrap; gap: .5rem .6rem; align-items: center; padding: .6rem 1rem; font-weight: 700; border-bottom: 1px solid var(--warn-ink); }
    .off { background: var(--warn-soft); color: var(--warn-ink); }
    .paused { background: var(--accent-soft); color: var(--accent-ink); border-bottom-color: var(--accent-ink); }
    .txt { flex: 1 1 12rem; min-width: 0; overflow-wrap: anywhere; }
    .bar > i { font-size: 1.25rem; flex: none; }
    .retry { display: inline-flex; align-items: center; justify-content: center; gap: .4rem; min-height: 44px; min-width: 44px; padding: 0 1rem; font: inherit; font-weight: 700;
      color: inherit; background: transparent; border: 1px solid currentColor; border-radius: var(--r-2); cursor: pointer; }
    .retry i { font-size: 1.2rem; }
  `],
})
export class OfflineBanner {
  i = inject(I18n);
  conn = inject(Connectivity);
}
