import { PageHeading } from '../../shared/page-heading';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, MyQueue } from '../../core/api';
import { I18n } from '../../core/i18n';
import { Connectivity, Poller } from '../../core/poll';
import { Skeleton } from '../../shared/states';

const STEPS = ['waiting', 'called', 'in_room', 'completed'] as const;
const ICON: Record<string, string> = { waiting: 'ph-user-circle', called: 'ph-megaphone', in_room: 'ph-door-open', completed: 'ph-check-circle' };

/** Live status. Polls every 15 s while the screen is visible, backs off to 60 s after an error. No wait time, no priority wording. */
@Component({
  selector: 'app-status',
  imports: [PageHeading, RouterLink, Skeleton],
  template: `
    <section class="page" aria-labelledby="h">
      <h1 id="h" pageHeading>{{ i.t('status.title') }}</h1>
      @if (!loaded()) { <app-skeleton /> }
      @else if (data() && !data()!.queueNo) {
        <p class="msg" role="status"><i class="ph ph-info" aria-hidden="true"></i>{{ i.t('status.none') }}</p>
        <a class="btn primary block" routerLink="/scan"><i class="ph ph-qr-code" aria-hidden="true"></i>{{ i.t('status.goscan') }}</a>
      } @else if (data()) {
        <div class="card big">
          <p class="lbl">{{ i.t('status.number') }}</p>
          <p class="num" data-testid="queue-no">{{ data()!.queueNo }}</p>
        </div>

        @if (known()) {
          <ol class="steps" [attr.aria-label]="i.t('status.steps')" data-testid="steps">
            @for (s of steps; track s) {
              <li [attr.data-step]="s" [attr.data-state]="stateOf(s)" [attr.aria-current]="stateOf(s) === 'current' ? 'step' : null">
                <i class="ph" [class]="icon(s)" aria-hidden="true"></i>
                <span>{{ i.tk('status.step', s) }}</span>
                @if (stateOf(s) === 'current') { <span class="now">{{ i.t('status.now') }}</span><span class="sr"> ({{ i.t('status.current') }})</span> }
              </li>
            }
          </ol>
          @if (data()!.roomName) { <p class="msg" role="status" data-testid="room"><i class="ph ph-door-open" aria-hidden="true"></i>{{ i.t('status.room', { room: data()!.roomName! }) }}</p> }
        } @else if (data()!.status === 'missed') {
          <p class="msg bad" role="alert" data-testid="missed"><i class="ph ph-warning-circle" aria-hidden="true"></i>{{ i.t('status.missed') }}</p>
        } @else {
          <p class="msg bad" role="alert"><i class="ph ph-warning-circle" aria-hidden="true"></i>{{ i.t('status.unknown') }}</p>
        }
      }

      @if (failed()) {
        <p class="msg bad" role="alert"><i class="ph ph-warning-circle" aria-hidden="true"></i>{{ i.t(data() ? 'status.error' : 'status.nodata') }}</p>
        <button class="btn" type="button" (click)="refresh()"><i class="ph ph-arrow-clockwise" aria-hidden="true"></i>{{ i.t('status.retry') }}</button>
      }
      @if (updated(); as u) { <p class="muted small" data-testid="updated">{{ i.t('status.updated', { time: i.time(u) }) }}</p> }
      <p class="muted small" data-testid="order-note">{{ i.t('status.order') }}</p>
    </section>`,
  styles: [`
    .big { display: grid; gap: .25rem; justify-items: center; text-align: center; padding: 1.25rem 1rem; }
    .lbl { color: var(--muted); font-weight: 600; }
    .num { font-family: var(--font-head); font-size: 3.5rem; font-weight: 600; line-height: 1; letter-spacing: .02em; }
    // A progress list, not buttons: flat rows, a rail on the left, no shadows, no pointer cursor.
    .steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; cursor: default; }
    .steps { min-width: 0; }
    .steps li { display: flex; flex-wrap: wrap; min-width: 0; gap: .35rem .75rem; align-items: center; min-height: 48px; padding: .6rem .9rem; border-left: 4px solid var(--line); color: var(--muted); font-weight: 600; }
    .steps li i { font-size: 1.4rem; }
    .steps li[data-state=done] { color: var(--text); border-left-color: var(--edge); }
    .steps li[data-state=current] { color: var(--accent-ink); background: var(--accent-soft); border-left-color: var(--accent); font-weight: 700; }
    .now { margin-left: auto; font-size: .875rem; padding: .05rem .6rem; border-radius: var(--r-pill); border: 1px solid var(--accent); background: var(--bg); color: var(--accent-ink); }
    .small { font-size: .875rem; }
  `],
})
export class Status implements OnInit, OnDestroy {
  i = inject(I18n);
  private api = inject(Api);
  private conn = inject(Connectivity);
  steps = STEPS;
  data = signal<MyQueue | null>(null);
  loaded = signal(false);
  failed = signal(false);
  updated = signal<string | null>(null);
  known = computed(() => STEPS.includes(this.data()?.status as (typeof STEPS)[number]));
  private poller = new Poller(() => this.load(), this.conn, 15000, 60000);

  ngOnInit(): void { this.poller.start(); }
  ngOnDestroy(): void { this.poller.stop(); }
  refresh(): void { void this.poller.refreshNow(); }

  icon(s: string): string { return ICON[s]; }
  stateOf(s: string): 'done' | 'current' | 'todo' {
    const cur = STEPS.indexOf(this.data()?.status as (typeof STEPS)[number]);
    const idx = STEPS.indexOf(s as (typeof STEPS)[number]);
    return idx < cur ? 'done' : idx === cur ? 'current' : 'todo';
  }

  private async load(): Promise<void> {
    try {
      this.data.set(await this.api.queueMe());
      this.failed.set(false);
      this.loaded.set(true);
      this.updated.set(new Date().toISOString());
    } catch (e) {
      this.failed.set(true);
      this.loaded.set(true);
      throw e;
    }
  }
}
