import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MISSED_REASONS, Nurse, PatchBody, QueueEntry, Room, URGENT_REASONS } from '../../core/api';
import { I18n, Key } from '../../core/i18n';

export interface AssignData { entry: QueueEntry; rooms: Room[]; nurses: Nurse[] }

@Component({
  selector: 'app-assign-dialog',
  imports: [FormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatSelectModule, MatSlideToggleModule],
  template: `
    <h2 mat-dialog-title>{{ i.t('assign.title', { no: data.entry.queueNo }) }}</h2>
    <mat-dialog-content>
      <p class="note">{{ i.t('assign.note') }}</p>
      <mat-form-field appearance="outline">
        <mat-label>{{ i.t('assign.room') }}</mat-label>
        <mat-select [(ngModel)]="room" name="room" data-testid="assign-room">
          <mat-option [value]="null">{{ i.t('assign.none') }}</mat-option>
          @for (r of data.rooms; track r.id) { <mat-option [value]="r.id">{{ i.roomName(r.name) }}</mat-option> }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>{{ i.t('assign.nurse') }}</mat-label>
        <mat-select [(ngModel)]="nurse" name="nurse" data-testid="assign-nurse">
          <mat-option [value]="null">{{ i.t('assign.none') }}</mat-option>
          @for (n of data.nurses; track n.id) { <mat-option [value]="n.id">{{ n.displayName }}</mat-option> }
        </mat-select>
      </mat-form-field>
      <mat-slide-toggle hideIcon [ngModel]="urgent()" (ngModelChange)="urgent.set($event)" name="urgent" data-testid="assign-urgent">{{ i.t('assign.urgent') }}</mat-slide-toggle>
      <p class="note">{{ i.t('assign.urgent.note') }}</p>
      @if (urgent()) {
        <mat-form-field appearance="outline" class="reason">
          <mat-label>{{ i.t('assign.urgent.reason') }}</mat-label>
          <mat-select [ngModel]="reason()" (ngModelChange)="reason.set($event)" (openedChange)="!$event && touched.set(true)" name="reason" data-testid="assign-reason" required>
            @for (r of urgentReasons; track r) { <mat-option [value]="r">{{ i.t(key(r)) }}</mat-option> }
          </mat-select>
        </mat-form-field>
        @if (!reason()) { <p class="hint" [class.bad]="touched()" [attr.role]="touched() ? 'alert' : null">{{ i.t('assign.urgent.required') }}</p> }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button type="button" (click)="ref.close()">{{ i.t('assign.cancel') }}</button>
      <button mat-flat-button type="button" [disabled]="!valid()" (click)="save()" data-testid="assign-save">{{ i.t('assign.save') }}</button>
    </mat-dialog-actions>`,
  styles: [`
    mat-dialog-content { display: grid; gap: .5rem; min-width: min(24rem, 80vw); }
    .note, .hint { margin: 0 0 .5rem; color: var(--muted); font-size: .9rem; }
    .hint.bad { color: var(--danger-ink); font-weight: 700; }
  `],
})
export class AssignDialog {
  i = inject(I18n);
  data = inject<AssignData>(MAT_DIALOG_DATA);
  ref = inject(MatDialogRef<AssignDialog, PatchBody>);
  urgentReasons = URGENT_REASONS;
  room: string | null = this.data.entry.roomId;
  nurse: string | null = this.data.entry.staffId;
  urgent = signal(this.data.entry.urgent);
  reason = signal<string | null>(this.data.entry.urgentReason);
  touched = signal(false); // the reason error appears only after the user has had a go at the field

  key = (r: string) => `reason.${r}` as Key;
  valid = computed(() => !this.urgent() || !!this.reason());

  save(): void {
    if (!this.valid()) return;
    const e = this.data.entry;
    const body: PatchBody = {};
    if (this.room && this.room !== e.roomId) body.roomId = this.room;
    if (this.nurse && this.nurse !== e.staffId) body.staffId = this.nurse;
    if (this.urgent() !== e.urgent || (this.urgent() && this.reason() !== e.urgentReason)) {
      body.urgent = this.urgent();
      if (this.urgent()) body.urgentReason = this.reason()!;
    }
    this.ref.close(body);
  }
}

@Component({
  selector: 'app-missed-dialog',
  imports: [FormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>{{ i.t('missed.title', { no: data.entry.queueNo }) }}</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline">
        <mat-label>{{ i.t('missed.reason') }}</mat-label>
        <mat-select [ngModel]="reason()" (ngModelChange)="reason.set($event)" (openedChange)="!$event && touched.set(true)" name="reason" data-testid="missed-reason" required>
          @for (r of reasons; track r) { <mat-option [value]="r">{{ i.t(key(r)) }}</mat-option> }
        </mat-select>
      </mat-form-field>
      @if (!reason()) { <p class="hint" [class.bad]="touched()" [attr.role]="touched() ? 'alert' : null">{{ i.t('missed.required') }}</p> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button type="button" (click)="ref.close()">{{ i.t('assign.cancel') }}</button>
      <button mat-flat-button type="button" [disabled]="!reason()" (click)="ref.close(reason())" data-testid="missed-confirm">{{ i.t('missed.confirm') }}</button>
    </mat-dialog-actions>`,
  styles: [`mat-dialog-content { display: grid; min-width: min(22rem, 80vw); } .hint { margin: 0; color: var(--muted); } .hint.bad { color: var(--danger-ink); font-weight: 700; }`],
})
export class MissedDialog {
  i = inject(I18n);
  data = inject<{ entry: QueueEntry }>(MAT_DIALOG_DATA);
  ref = inject(MatDialogRef<MissedDialog, string>);
  reasons = MISSED_REASONS;
  reason = signal<string | null>(null);
  touched = signal(false);
  key = (r: string) => `reason.${r}` as Key;
}
