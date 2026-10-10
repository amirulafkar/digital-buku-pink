import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { I18n } from '../../core/i18n';

/** Shows a freshly issued code once. The code lives only in this dialog's memory. */
@Component({
  selector: 'app-code-dialog',
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>{{ i.t('codes.dialog.title') }}</h2>
    <mat-dialog-content>
      <p class="who">{{ data.patient }}</p>
      <p class="code" data-testid="issued-code" aria-live="polite">{{ data.code }}</p>
      <p>{{ i.t('codes.once') }}</p>
      <p class="valid">{{ i.t('codes.valid') }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button type="button" (click)="copy()" data-testid="copy-code">
        <i class="ph" [class]="copied() ? 'ph-check' : 'ph-copy'" aria-hidden="true"></i>{{ copied() ? i.t('codes.copied') : i.t('codes.copy') }}</button>
      <button mat-flat-button type="button" mat-dialog-close data-testid="code-done">{{ i.t('codes.close') }}</button>
    </mat-dialog-actions>`,
  styles: [`
    mat-dialog-content { display: grid; gap: .25rem; min-width: min(24rem, 80vw); }
    .who { margin: 0; color: var(--muted); }
    .code { margin: .5rem 0; padding: 1rem; text-align: center; font-family: var(--font-head); font-size: 2rem; font-weight: 600; letter-spacing: .12em;
      background: var(--bg); border-radius: var(--r-3); border: 1px solid var(--edge); box-shadow: var(--neu-inset); user-select: all; }
    .valid { margin: 0; font-weight: 600; }
    button i { margin-right: .35rem; }
  `],
})
export class CodeDialog {
  i = inject(I18n);
  data = inject<{ code: string; patient: string }>(MAT_DIALOG_DATA);
  copied = signal(false);

  async copy(): Promise<void> {
    try { await navigator.clipboard.writeText(this.data.code); this.copied.set(true); } catch { /* clipboard may be blocked; the code is selectable */ }
  }
}
