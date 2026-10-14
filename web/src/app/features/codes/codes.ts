import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { Api, CodeRow } from '../../core/api';
import { Auth } from '../../core/auth';
import { I18n } from '../../core/i18n';
import { Connectivity } from '../../core/poll';
import { PatientSearch, SearchPick } from '../../shared/patient-search';
import { EmptyState, ErrorState, Skeleton } from '../../shared/states';
import { CodeDialog } from './code-dialog';

@Component({
  selector: 'app-codes',
  imports: [MatButtonModule, PatientSearch, Skeleton, EmptyState, ErrorState],
  template: `
    <section aria-labelledby="codes-h">
      <h1 id="codes-h">{{ i.t('codes.title') }}</h1>

      <div class="two" [class.solo]="!auth.isNurse()">
      @if (auth.isNurse()) {
        <div class="issue panel">
          <h2>{{ i.t('codes.issue.title') }}</h2>
          <p class="muted">{{ i.t('codes.issue.help') }}</p>
          <p class="live" role="status" aria-live="polite">{{ error() }}</p>
          <app-patient-search [actions]="['issue']" [disabled]="offline()" (pick)="issue($event)" />
        </div>
      }

      <div class="listing panel">
      <h2 class="list-h">{{ i.t('codes.list') }}</h2>
      @if (failed()) {
        <app-error [text]="i.t('codes.error')" (retry)="load()" />
      } @else if (!loaded()) {
        <app-skeleton [count]="4" />
      } @else if (rows().length === 0) {
        <app-empty [text]="i.t('codes.empty')" icon="ph-key">
          <p class="muted">{{ i.t(auth.isNurse() ? 'codes.empty.hint.nurse' : 'codes.empty.hint.admin') }}</p>
          @if (auth.isNurse()) { <button mat-stroked-button type="button" (click)="focusSearch()"><i class="ph ph-magnifying-glass" aria-hidden="true"></i>{{ i.t('codes.empty.find') }}</button> }
        </app-empty>
      } @else {
        <div class="scroll">
          <table role="table" data-testid="codes-table">
            <caption class="sr">{{ i.t('codes.list') }}</caption>
            <thead role="rowgroup"><tr role="row">
              <th scope="col" role="columnheader">{{ i.t('codes.col.patient') }}</th>
              <th scope="col" role="columnheader">{{ i.t('codes.col.issued') }}</th>
              <th scope="col" role="columnheader">{{ i.t('codes.col.expires') }}</th>
              <th scope="col" role="columnheader">{{ i.t('codes.col.status') }}</th>
            </tr></thead>
            <tbody>
              @for (r of rows(); track r.id) {
                <tr role="row" [attr.data-status]="r.status">
                  <th scope="row" role="rowheader">{{ r.patientDisplayName }}</th>
                  <td role="cell" [attr.data-label]="i.t('codes.col.issued')">{{ i.dateTime(r.issuedAt) }}</td>
                  <td role="cell" [attr.data-label]="i.t('codes.col.expires')">{{ i.dateTime(r.expiresAt) }}</td>
                  <td role="cell" [attr.data-label]="i.t('codes.col.status')"><span class="st" [attr.data-status]="r.status">
                    <i class="ph" [class]="icon(r.status)" aria-hidden="true"></i>{{ i.tk('codes.status', r.status) }}</span></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
      </div>
      </div>
    </section>`,
  styles: [`
    h1 { margin: 0 0 1rem; font-family: var(--font-head); font-size: 2rem; }
    h2 { margin: 0 0 .25rem; font-family: var(--font-head); font-size: 1.15rem; }
    .two { display: grid; gap: 1.25rem; align-items: start; }
    @media (min-width: 62rem) { .two { grid-template-columns: minmax(18rem, 2fr) minmax(0, 3fr); } .two.solo { grid-template-columns: minmax(0, 1fr); } }
    .issue { display: grid; gap: .5rem; }
    .muted { margin: 0; color: var(--muted); }
    .live { min-height: 1.25rem; margin: 0; color: var(--danger-ink); font-weight: 600; }
    .list-h { margin: 0 0 .75rem; }
    .scroll { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--r-3); background: var(--bg); box-shadow: var(--neu-inset); }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: .8rem 1rem; border-bottom: 1px solid var(--line); }
    thead th { font-size: .8rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); background: var(--surface-2); box-shadow: var(--neu-inset); }
    tbody tr:last-child > * { border-bottom: 0; }
    tbody th { font-weight: 600; }
    .st { display: inline-flex; gap: .4rem; align-items: center; font-size: .875rem; font-weight: 700; padding: .2rem .7rem; border-radius: var(--r-pill); border: 1px solid var(--edge); background: var(--bg); box-shadow: var(--neu-raised-sm); }
    .st[data-status=unused] { background: var(--accent-soft); color: var(--accent-ink); }
    .st[data-status=expired], .st[data-status=used] { color: var(--muted); box-shadow: var(--neu-inset); }
    td:last-child, th:last-child { white-space: nowrap; }
    @media (max-width: 40rem) {
      thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
      table, tbody { display: block; }
      tr { display: grid; grid-template-columns: 1fr 1fr; gap: .25rem 1rem; padding: .9rem 1rem; border-bottom: 1px solid var(--line); }
      tbody tr:last-child { border-bottom: 0; }
      th, td { border: 0; padding: 0; }
      tbody th { grid-column: 1 / -1; }
      td::before { content: attr(data-label); display: block; font-size: .875rem; color: var(--muted); font-weight: 600; }
    }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  `],
})
export class Codes implements OnInit {
  i = inject(I18n);
  auth = inject(Auth);
  private api = inject(Api);
  private dialog = inject(MatDialog);
  private conn = inject(Connectivity);

  rows = signal<CodeRow[]>([]);
  loaded = signal(false);
  failed = signal(false);
  error = signal<string | null>(null);
  offline = computed(() => !this.conn.canWrite());

  ngOnInit(): void { void this.load(); }

  focusSearch(): void { document.querySelector<HTMLInputElement>('[data-testid=search-input]')?.focus(); }

  icon(s: string): string { return s === 'unused' ? 'ph-key' : s === 'used' ? 'ph-check-circle' : 'ph-calendar-x'; }

  async load(): Promise<void> {
    this.failed.set(false);
    try { this.rows.set(await this.api.codes()); this.loaded.set(true); } catch { this.failed.set(true); }
  }

  async issue(p: SearchPick): Promise<void> {
    this.error.set(null);
    try {
      const r = await this.api.issueCode(p.hit.id);
      this.dialog.open(CodeDialog, { data: { code: r.code, patient: p.hit.displayName }, autoFocus: 'first-tabbable' })
        .afterClosed().subscribe(() => void this.load());
      void this.load();
    } catch { this.error.set(this.i.t('codes.failed')); }
  }
}
