import { Component, computed, inject, input } from '@angular/core';
import { I18n } from '../core/i18n';

const ICON: Record<string, string> = {
  waiting: 'ph-user-circle',
  called: 'ph-megaphone',
  in_room: 'ph-door-open',
  completed: 'ph-check-circle',
  missed: 'ph-prohibit',
  urgent: 'ph-flag',
};

/** Status is always icon plus text; colour is only a supporting cue. */
@Component({
  selector: 'app-status-chip',
  template: `<span class="chip" [attr.data-status]="status()"><i class="ph" [class]="icon()" aria-hidden="true"></i>{{ label() }}</span>`,
  styles: [`
    .chip { display: inline-flex; align-items: center; gap: .4rem; padding: .25rem .7rem; border-radius: var(--r-pill);
      font-size: .875rem; font-weight: 700; border: 1px solid var(--edge); background: var(--bg); color: var(--text);
      box-shadow: var(--neu-raised-sm); animation: fade var(--dur) var(--ease); max-width: 100%; }
    .chip i { font-size: 1.05rem; }
    [data-status=called] { background: var(--accent-soft); color: var(--accent-ink); }
    [data-status=in_room] { background: var(--lav-soft); color: var(--lav-ink); }
    [data-status=completed] { color: var(--muted); box-shadow: var(--neu-inset); border-color: var(--line); }
    [data-status=missed] { color: var(--muted); box-shadow: var(--neu-inset); }
    [data-status=urgent] { background: var(--surface-2); color: var(--text); border-color: var(--edge); }
    [data-status=urgent] i { color: var(--accent-ink); }
    @keyframes fade { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: none; } }
  `],
})
export class StatusChip {
  readonly status = input.required<string>();
  private i18n = inject(I18n);
  readonly icon = computed(() => ICON[this.status()] ?? 'ph-circle');
  readonly label = computed(() => this.i18n.tk('status', this.status()));
}
