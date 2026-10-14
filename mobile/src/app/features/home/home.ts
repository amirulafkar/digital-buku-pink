import { PageHeading } from '../../shared/page-heading';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, Me, NextAppointment } from '../../core/api';
import { I18n } from '../../core/i18n';
import { Connectivity } from '../../core/poll';
import { ErrorState, Skeleton } from '../../shared/states';

@Component({
  selector: 'app-home',
  imports: [PageHeading, RouterLink, Skeleton, ErrorState],
  template: `
    <section class="page" aria-labelledby="h">
      @if (failed()) { <app-error [text]="i.t('home.error')" (retry)="load()" /> }
      @else if (!me()) { <app-skeleton /> }
      @else {
        <div>
          <h1 id="h" pageHeading>{{ i.t('home.hello', { name: me()!.displayName }) }}</h1>
          <p class="muted">{{ i.t('home.clinic', { clinic: me()!.clinicName }) }}</p>
        </div>
        <div class="card appt" data-testid="appointment">
          <h2>{{ i.t('home.appt.title') }}</h2>
          @if (next()?.scheduledAt; as at) {
            <p class="when"><i class="ph ph-calendar-blank" aria-hidden="true"></i>{{ i.t('home.appt.at', { date: i.date(at), time: i.time(at) }) }}</p>
            <p class="kind">{{ i.tk('visit', next()!.type ?? '') }}</p>
          } @else { <p class="muted">{{ i.t('home.appt.none') }}</p> }
        </div>
        @if (!conn.canWrite()) {
          <button type="button" class="btn block disabled" aria-disabled="true" aria-describedby="off-line" (click)="$event.preventDefault()" data-testid="home-checkin"><i class="ph ph-qr-code" aria-hidden="true"></i>{{ i.t('home.checkin') }}</button>
          <p id="off-line" class="msg" role="status"><i class="ph ph-wifi-slash" aria-hidden="true"></i>{{ i.t('scan.offline') }}</p>
        } @else {
          <a class="btn primary block" routerLink="/scan" data-testid="home-checkin"><i class="ph ph-qr-code" aria-hidden="true"></i>{{ i.t('home.checkin') }}</a>
        }
      }
    </section>`,
  styles: [`
    .appt { display: grid; gap: .5rem; } .appt h2 { font-size: 1.1rem; }
    .when { display: flex; gap: .5rem; align-items: center; font-weight: 700; font-size: 1.15rem; } .kind { color: var(--muted); }
    .disabled { background: var(--surface-2); color: var(--text); border: 1px solid var(--edge); box-shadow: none; cursor: not-allowed; }
  `],
})
export class Home implements OnInit {
  i = inject(I18n);
  conn = inject(Connectivity);
  private api = inject(Api);
  me = signal<Me | null>(null);
  next = signal<NextAppointment | null>(null);
  failed = signal(false);

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    this.failed.set(false);
    try {
      const [me, next] = await Promise.all([this.api.me(), this.api.nextAppointment()]);
      this.me.set(me); this.next.set(next);
    } catch { this.failed.set(true); }
  }
}
