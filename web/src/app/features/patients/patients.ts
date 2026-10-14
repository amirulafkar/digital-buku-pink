import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { Events } from '../../core/events';
import { I18n } from '../../core/i18n';
import { Connectivity } from '../../core/poll';
import { PatientSearch, SearchPick } from '../../shared/patient-search';
import { CodeDialog } from '../codes/code-dialog';

@Component({
  selector: 'app-patients',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, PatientSearch, RouterLink],
  template: `
    <section aria-labelledby="pat-h">
      <h1 id="pat-h">{{ i.t('patients.title') }}</h1>
      <p class="live" role="status" aria-live="polite" data-testid="patients-msg">
        @if (done(); as no) { {{ i.t('patients.checkedin', { no }) }} <a routerLink="/queue">{{ i.t('nav.queue') }}</a> }
        @if (error()) { {{ error() }} }
      </p>
      <div class="grid">
      <div class="panel find"><app-patient-search [disabled]="offline()" [initial]="initial()" (pick)="onPick($event)" /></div>

      <form class="walkin panel" (ngSubmit)="walkIn()" aria-labelledby="walk-h">
        <h2 id="walk-h">{{ i.t('patients.walkin.title') }}</h2>
        <mat-form-field appearance="outline">
          <mat-label>{{ i.t('patients.walkin.name') }}</mat-label>
          <input matInput name="walkin" maxlength="60" autocomplete="off" [(ngModel)]="walkInName" data-testid="walkin-name" />
          <mat-hint>{{ i.t('patients.walkin.hint') }}</mat-hint>
        </mat-form-field>
        <button mat-flat-button type="submit" [disabled]="offline() || busy() || !walkInName.trim()" data-testid="walkin-submit">
          <i class="ph ph-user-plus" aria-hidden="true"></i>{{ i.t('patients.walkin.submit') }}</button>
      </form>
      </div>
    </section>`,
  styles: [`
    h1 { margin: 0 0 1rem; font-family: var(--font-head); font-size: 2rem; }
    h2 { margin: 0; font-family: var(--font-head); font-size: 1.15rem; }
    .live { min-height: 1.5rem; margin: 0 0 .5rem; font-weight: 600; }
    .live a { color: var(--accent-ink-strong); margin-left: .5rem; font-weight: 700; }
    .grid { display: grid; gap: 1.25rem; align-items: start; }
    @media (min-width: 62rem) { .grid { grid-template-columns: minmax(0, 3fr) minmax(18rem, 2fr); } }
    .panel { padding: 1.5rem; border: 1px solid var(--line); border-radius: var(--r-3); background: var(--bg); box-shadow: var(--neu-raised); }
    .walkin { display: grid; gap: .9rem; justify-items: start; }
    .walkin mat-form-field { width: 100%; }
    button i { margin-right: .35rem; }
  `],
})
export class Patients {
  i = inject(I18n);
  private api = inject(Api);
  private dialog = inject(MatDialog);
  private conn = inject(Connectivity);

  private events = inject(Events);
  initial = signal<string | undefined>(undefined); // top bar search text, handed over in memory (never via the URL)
  constructor() {
    effect(() => {
      const t = this.events.searchHandoff();
      if (t) { this.initial.set(t); untracked(() => this.events.searchHandoff.set(null)); }
    });
  }
  walkInName = '';
  busy = signal(false);
  done = signal<string | null>(null);
  error = signal<string | null>(null);
  offline = computed(() => !this.conn.canWrite());

  async onPick(p: SearchPick): Promise<void> {
    this.done.set(null);
    this.error.set(null);
    this.busy.set(true);
    try {
      if (p.action === 'checkin') {
        const r = await this.api.checkInPatient(p.hit.id);
        this.done.set(r.queueNo);
      } else {
        const r = await this.api.issueCode(p.hit.id);
        this.dialog.open(CodeDialog, { data: { code: r.code, patient: p.hit.displayName }, autoFocus: 'first-tabbable' });
      }
    } catch { this.error.set(this.i.t(p.action === 'issue' ? 'codes.failed' : 'queue.action.failed')); }
    finally { this.busy.set(false); }
  }

  async walkIn(): Promise<void> {
    const name = this.walkInName.trim();
    if (!name) return;
    this.done.set(null);
    this.error.set(null);
    this.busy.set(true);
    try {
      const r = await this.api.checkInWalkIn(name);
      this.done.set(r.queueNo);
      this.walkInName = '';
    } catch { this.error.set(this.i.t('queue.action.failed')); }
    finally { this.busy.set(false); }
  }
}
