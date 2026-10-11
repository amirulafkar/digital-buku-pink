import { Component, inject } from '@angular/core';
import { I18n } from '../core/i18n';

/** Not-MOH-approved and fictional-data notice, visible on every screen. */
@Component({
  selector: 'app-moh-notice',
  template: `<p class="n" role="note"><i class="ph ph-info" aria-hidden="true"></i><span>{{ i.t('notice.full') }}</span></p>`,
  styles: [`
    .n { display: flex; gap: .6rem; align-items: flex-start; padding: .7rem .9rem; border-radius: var(--r-3); background: var(--bg); color: var(--muted); font-size: .875rem; line-height: 1.45;
      border: 1px solid var(--line); box-shadow: var(--neu-inset); }
    :host { display: block; min-width: 0; }
    span { min-width: 0; overflow-wrap: anywhere; }
    i { font-size: 1.2rem; color: var(--accent-ink); margin-top: .05rem; flex: none; }
  `],
})
export class MohNotice { i = inject(I18n); }

/**
 * FR-12 safety notice. One shared component, shown on every signed-in screen.
 * The wording is a PLACEHOLDER that MOH must approve before any pilot (flagged in the text itself).
 */
@Component({
  selector: 'app-safety-notice',
  template: `<aside class="s" role="note" [attr.aria-label]="i.t('safety.label')"><i class="ph ph-first-aid-kit" aria-hidden="true"></i><span data-testid="safety-notice">{{ i.t('safety.text') }}</span></aside>`,
  styles: [`
    .s { display: flex; gap: .5rem; align-items: flex-start; padding: .5rem .7rem; border-radius: var(--r-2); background: var(--accent-soft); color: var(--accent-ink);
      border: 1px solid var(--edge); font-size: .875rem; line-height: 1.35; font-weight: 600; }
    :host { display: block; min-width: 0; }
    span { min-width: 0; overflow-wrap: anywhere; }
    i { font-size: 1.15rem; margin-top: .05rem; flex: none; }
  `],
})
export class SafetyNotice { i = inject(I18n); }
