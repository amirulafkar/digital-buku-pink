import { Component, inject } from '@angular/core';
import { I18n } from '../core/i18n';

/** Not-MOH-approved and fictional-data notice. Shown on login and in the footer of every screen. */
@Component({
  selector: 'app-moh-notice',
  template: `
    <p class="notice" role="note"><i class="ph ph-info" aria-hidden="true"></i>
      <span>{{ i.t('notice.full') }}</span></p>`,
  styles: [`
    .notice { display: flex; gap: .65rem; align-items: flex-start; margin: 0; padding: .8rem 1rem; border-radius: var(--r-3);
      background: var(--bg); color: var(--muted); font-size: .875rem; line-height: 1.45; border: 1px solid var(--line); box-shadow: var(--neu-inset); }
    i { font-size: 1.2rem; color: var(--accent-ink); margin-top: .05rem; }
  `],
})
export class MohNotice { i = inject(I18n); }
