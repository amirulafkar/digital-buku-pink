import { PageHeading } from '../../shared/page-heading';
import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CheckIn } from '../../core/api';
import { I18n } from '../../core/i18n';

@Component({
  selector: 'app-confirmation',
  imports: [PageHeading, RouterLink],
  template: `
    @if (c.last(); as r) {
      <section class="page" aria-labelledby="h">
        <h1 id="h" pageHeading>{{ i.t('confirm.title') }}</h1>
        <div class="card big">
          <i class="ph ph-check-circle" aria-hidden="true"></i>
          <p class="num" data-testid="queue-no" aria-hidden="true">{{ r.queueNo }}</p>
          <p class="text" role="status" data-testid="confirm-text">{{ i.t('confirm.text', { no: r.queueNo }) }}</p>
        </div>
        <p class="muted">{{ i.t('confirm.hint') }}</p>
        <a class="btn primary block" routerLink="/status" data-testid="open-status"><i class="ph ph-list-checks" aria-hidden="true"></i>{{ i.t('confirm.status') }}</a>
      </section>
    }`,
  styles: [`
    .big { display: grid; gap: .5rem; justify-items: center; text-align: center; padding: 1.5rem 1rem; }
    .big i { font-size: 2.5rem; color: var(--accent-ink); }
    .num { font-family: var(--font-head); font-size: 3.5rem; font-weight: 600; line-height: 1; letter-spacing: .02em; }
    .text { font-weight: 600; }
  `],
})
export class Confirmation implements OnInit {
  i = inject(I18n);
  c = inject(CheckIn);
  private router = inject(Router);
  ngOnInit(): void { if (!this.c.last()) void this.router.navigateByUrl('/status'); }
}
