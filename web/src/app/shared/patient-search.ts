import { Component, OnDestroy, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Api, PatientHit } from '../core/api';
import { I18n, Key } from '../core/i18n';
import { EmptyState, ErrorState, Skeleton } from './states';

export type SearchAction = 'checkin' | 'issue';
export interface SearchPick { action: SearchAction; hit: PatientHit }

/** Debounced (300 ms) patient search. Under 2 characters no request is sent. Shows name and today's appointment only. */
@Component({
  selector: 'app-patient-search',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, Skeleton, EmptyState, ErrorState],
  template: `
    <mat-form-field appearance="outline" class="q">
      <mat-label>{{ i.t('patients.search') }}</mat-label>
      <input matInput type="search" name="q" autocomplete="off" [ngModel]="q()" (ngModelChange)="onType($event)" data-testid="search-input" />
    </mat-form-field>

    @switch (state()) {
      @case ('loading') { <app-skeleton [count]="3" /> }
      @case ('error') { <app-error [text]="i.t('patients.error')" (retry)="run(q())" /> }
      @case ('done') {
        @if (hits().length === 0) {
          <app-empty [text]="i.t('patients.empty')" icon="ph-magnifying-glass">
            <p class="idle">{{ i.t('patients.empty.hint') }}</p>
            <button mat-stroked-button type="button" (click)="clear()" data-testid="search-clear"><i class="ph ph-x" aria-hidden="true"></i>{{ i.t('patients.clear') }}</button>
          </app-empty>
        } @else {
          <ul class="hits" data-testid="search-results">
            @for (h of hits(); track h.id) {
              <li [attr.data-id]="h.id">
                <div class="who">
                  <span class="nm">{{ h.displayName }}</span>
                  <span class="appt">
                    @if (h.todayAppointment; as a) { {{ i.t('patients.appt', { time: i.time(a.time), type: i.tk('visit', a.type) }) }} }
                    @else { {{ i.t('patients.noappt') }} }
                  </span>
                </div>
                <div class="acts">
                  @if (actions().includes('checkin')) {
                    <button mat-flat-button type="button" [disabled]="disabled()" (click)="pick.emit({ action: 'checkin', hit: h })">
                      <i class="ph ph-user-plus" aria-hidden="true"></i>{{ i.t(label('checkin')) }}</button>
                  }
                  @if (actions().includes('issue')) {
                    <button mat-stroked-button type="button" [disabled]="disabled()" (click)="pick.emit({ action: 'issue', hit: h })">
                      <i class="ph ph-key" aria-hidden="true"></i>{{ i.t(label('issue')) }}</button>
                  }
                </div>
              </li>
            }
          </ul>
        }
      }
      @default { <p class="idle">{{ i.t('patients.min') }}</p> }
    }`,
  styles: [`
    :host { display: grid; gap: .75rem; }
    .q { width: 100%; }
    .hits { list-style: none; margin: 0; padding: 0; display: grid; gap: .5rem; }
    li { display: flex; justify-content: space-between; gap: 1rem; align-items: center; flex-wrap: wrap; padding: .9rem 1.1rem;
      border: 1px solid var(--line); border-radius: var(--r-3); background: var(--bg); box-shadow: var(--neu-raised-sm); animation: rise var(--dur) var(--ease); }
    .who { display: grid; gap: .15rem; }
    .nm { font-weight: 600; }
    .appt, .idle { color: var(--muted); margin: 0; }
    .acts button { min-height: 44px; }
    .acts { display: flex; gap: .5rem; flex-wrap: wrap; }
    .acts i { margin-right: .35rem; font-size: 1.1rem; }
    @keyframes rise { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  `],
})
export class PatientSearch implements OnDestroy {
  i = inject(I18n);
  private api = inject(Api);
  actions = input<SearchAction[]>(['checkin', 'issue']);
  disabled = input(false);
  initial = input<string | undefined>(undefined);
  pick = output<SearchPick>();

  constructor() { effect(() => { const v = this.initial(); if (v) untracked(() => this.onType(v)); }); }

  q = signal('');
  hits = signal<PatientHit[]>([]);
  state = signal<'idle' | 'loading' | 'done' | 'error'>('idle');
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;
  readonly hasQuery = computed(() => this.q().trim().length >= 2);

  label(a: SearchAction): Key { return a === 'checkin' ? 'patients.checkin' : 'patients.issue'; }

  onType(v: string): void {
    this.q.set(v);
    if (this.timer) clearTimeout(this.timer);
    this.seq++;
    if (v.trim().length < 2) { this.state.set('idle'); this.hits.set([]); return; }
    this.timer = setTimeout(() => void this.run(v), 300);
  }

  async run(v: string): Promise<void> {
    const my = ++this.seq;
    this.state.set('loading');
    try {
      const r = await this.api.search(v.trim());
      if (my !== this.seq) return;
      this.hits.set(r);
      this.state.set('done');
    } catch { if (my === this.seq) this.state.set('error'); }
  }

  clear(): void { this.onType(''); document.querySelector<HTMLInputElement>('[data-testid=search-input]')?.focus(); }

  ngOnDestroy(): void { if (this.timer) clearTimeout(this.timer); }
}
