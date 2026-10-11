import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface Me { displayName: string; clinicName: string; language: string }
export interface NextAppointment { scheduledAt: string | null; type?: string | null; clinicName?: string | null }
export interface MyQueue { queueNo: string | null; status?: string; updatedAt?: string; roomName?: string | null }
export interface CheckInResult { queueEntryId: string; queueNo: string; status: string; checkedInAt: string }
export type CheckInError = 'token_invalid' | 'wrong_clinic' | 'no_appointment_today' | 'rate' | 'network' | 'other';

@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);
  me = () => firstValueFrom(this.http.get<Me>('/api/v1/me'));
  nextAppointment = () => firstValueFrom(this.http.get<NextAppointment>('/api/v1/appointments/next'));
  queueMe = () => firstValueFrom(this.http.get<MyQueue>('/api/v1/queue/me'));
  checkIn = (token: string, idempotencyKey: string) =>
    firstValueFrom(this.http.post<CheckInResult>('/api/v1/checkins', { token, idempotencyKey }));
}

export function checkInError(e: unknown): CheckInError {
  if (!(e instanceof HttpErrorResponse)) return 'other';
  if (e.status === 0) return 'network';
  if (e.status === 429) return 'rate';
  const code = (e.error as { code?: string } | null)?.code;
  if (code === 'token_invalid' || code === 'wrong_clinic' || code === 'no_appointment_today') return code;
  return 'other';
}

/**
 * One idempotency key per check-in attempt, reused on retry only (FR-13, NFR-05).
 * The key is dropped after success or when the mother starts a new scan.
 */
@Injectable({ providedIn: 'root' })
export class CheckIn {
  private api = inject(Api);
  private key: string | null = null;
  private lastToken: string | null = null;
  readonly last = signal<CheckInResult | null>(null);

  /** A new scan (different token) gets a new key; the same token after a lost response reuses it. */
  async submit(token: string, newAttempt: boolean): Promise<CheckInResult> {
    if (newAttempt || !this.key || this.lastToken !== token) { this.key = crypto.randomUUID(); this.lastToken = token; }
    const r = await this.api.checkIn(token, this.key);
    this.last.set(r);
    this.key = null; this.lastToken = null;
    return r;
  }
}
