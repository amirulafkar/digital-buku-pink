import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Api } from '../core/api';
import { I18n } from '../core/i18n';

/** Walk-in check-in: a name only. No phone number is kept. */
@Component({
  selector: 'app-walkin-dialog',
  imports: [FormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>{{ i.t('patients.walkin.title') }}</h2>
    <form (ngSubmit)="submit()">
      <mat-dialog-content>
        <mat-form-field appearance="outline">
          <mat-label>{{ i.t('patients.walkin.name') }}</mat-label>
          <input matInput name="walkin" maxlength="60" autocomplete="off" [(ngModel)]="name" data-testid="dialog-walkin-name" />
        </mat-form-field>
        <p class="hint">{{ i.t('patients.walkin.hint') }}</p>
        @if (failed()) { <p class="err" role="alert">{{ i.t('queue.action.failed') }}</p> }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-stroked-button type="button" mat-dialog-close>{{ i.t('assign.cancel') }}</button>
        <button mat-flat-button type="submit" [disabled]="busy() || !name.trim()" data-testid="dialog-walkin-submit">
          <i class="ph ph-user-plus" aria-hidden="true"></i>{{ i.t('patients.walkin.submit') }}</button>
      </mat-dialog-actions>
    </form>`,
  styles: [`
    mat-dialog-content { display: grid; min-width: min(24rem, 80vw); }
    .hint { margin: 0; color: var(--muted); }
    .err { margin: .5rem 0 0; color: var(--danger-ink); font-weight: 700; }
    button i { margin-right: .35rem; }
  `],
})
export class WalkInDialog {
  i = inject(I18n);
  private api = inject(Api);
  private ref = inject(MatDialogRef<WalkInDialog, string>);
  name = '';
  busy = signal(false);
  failed = signal(false);

  async submit(): Promise<void> {
    const n = this.name.trim();
    if (!n) return;
    this.busy.set(true);
    this.failed.set(false);
    try { const r = await this.api.checkInWalkIn(n); this.ref.close(r.queueNo); }
    catch { this.failed.set(true); }
    finally { this.busy.set(false); }
  }
}
