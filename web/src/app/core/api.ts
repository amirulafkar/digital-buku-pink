import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type Status = 'waiting' | 'called' | 'in_room' | 'completed' | 'missed';

export interface QueueEntry {
  id: string; queueNo: string; displayName: string | null; walkInName: string | null; status: Status;
  roomId: string | null; staffId: string | null; urgent: boolean; urgentReason: string | null;
  source: 'qr' | 'staff'; checkedInAt: string;
}
export interface QueueResponse { queueDate: string; entries: QueueEntry[] }
export interface Room { id: string; name: string }
export interface Nurse { id: string; displayName: string }
export interface PatientHit { id: string; displayName: string; todayAppointment: { time: string; type: string } | null }
export interface CodeRow { id: string; patientDisplayName: string; issuedAt: string; expiresAt: string; status: 'unused' | 'used' | 'expired' }
export interface PatchBody { status?: Status; roomId?: string; staffId?: string; reason?: string; urgent?: boolean; urgentReason?: string }

export const URGENT_REASONS = ['staff_judgement', 'accessibility_need', 'family_request', 'other'] as const;
export const MISSED_REASONS = ['no_answer', 'left_clinic', 'other'] as const;

/** Thin typed wrapper. The clinic always comes from the token on the server, never from the client. */
@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);
  private base = '/api/v1/staff';

  queue = () => firstValueFrom(this.http.get<QueueResponse>(`${this.base}/queue`));
  rooms = () => firstValueFrom(this.http.get<Room[]>(`${this.base}/rooms`));
  nurses = () => firstValueFrom(this.http.get<Nurse[]>(`${this.base}/nurses`));
  patch = (id: string, body: PatchBody) => firstValueFrom(this.http.patch(`${this.base}/queue/${id}`, body));
  // The typed text goes in the JSON body only, never in a URL, history entry or log.
  search = (q: string) => firstValueFrom(this.http.post<PatientHit[]>(`${this.base}/patients/search`, { q, limit: 20 }));
  checkInPatient = (patientId: string) => firstValueFrom(this.http.post<{ queueNo: string }>(`${this.base}/checkins`,
    { patientId, idempotencyKey: crypto.randomUUID() }));
  checkInWalkIn = (walkInName: string) => firstValueFrom(this.http.post<{ queueNo: string }>(`${this.base}/checkins`,
    { walkInName, idempotencyKey: crypto.randomUUID() }));
  issueCode = (patientId: string) => firstValueFrom(this.http.post<{ code: string; expiresAt: string }>(`${this.base}/activation-codes`, { patientId }));
  codes = () => firstValueFrom(this.http.get<CodeRow[]>(`${this.base}/activation-codes`));
}
