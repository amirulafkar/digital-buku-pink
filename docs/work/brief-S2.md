# Brief S2: check-in, QR token, queue, audit
Sources: 03 §2, §7; 04a FR-02..06, FR-11, FR-13; 04b UF-02, UF-03; 04c §2-3; CLAUDE.md hard rules. Builds on S1 (Staff policy, clinic_id claim, Audit helper in Data/Services.cs, room table). Fictional data only.
## Requirements
- Covered: FR-02, FR-03, FR-04, FR-05, FR-06, FR-11, FR-13; NFR-01, NFR-03, NFR-05, NFR-10.
- Not S2: FR-07 urgent, FR-08, FR-09, FR-10, FR-12 (UI notice), FR-14 reopen, FR-15, FR-16 UI, NFR-04, NFR-09.
## Migration S2_QueueQr (owner runs; app role DML only)
- qr_token(id, clinic_id, token_hash UQ, expires_at, created_at). No used_at: the token is a shared clinic display, valid for all scans within its 60 s life.
- queue_entry per 04c §2: patient_id?, walk_in_name?, appointment_id?, queue_date (clinic timezone), queue_no, source qr|staff, status, urgent (default false, no S2 writer), urgent_reason?, room_id?, staff_id?, idempotency_key, checked_in_at, called_at, started_at, completed_at.
- Unique: (clinic_id, queue_date, queue_no); (idempotency_key, patient_id, queue_date); (clinic_id, queue_date, idempotency_key) added for walk-in retries; partial (patient_id, queue_date) WHERE status NOT IN (completed, missed).
- Checks: patient_id or walk_in_name set; status in enum. Indexes: queue_entry(clinic_id, queue_date, status); qr_token(expires_at).
- audit_log.action gains qr_issue and checkin_refused (Open Q).
## QR token rules
- Random 32 bytes, base64url. QR payload is the string only: no clinic, patient, name or time.
- Expires 60 s after issue. Stored as SHA-256 hash only (S1 deviation pattern).
- Clinic-bound: token.clinic_id must equal the scanner's JWT clinic_id.
- Reusable within its 60 s life (shared clinic display). Replay is bounded by one active queue entry per patient per day (FR-13). Expired or unknown return the same 400.
## Endpoints (/api/v1; errors {code,message}; clinic from JWT only)
- POST /staff/qr-tokens [Staff] {} -> 201 {token, expiresAt}. Audit qr_issue. NEW, not in 03 §7 (Open Q).
- POST /checkins [patient] {token, idempotencyKey} -> 201 {queueEntryId, queueNo, status, checkedInAt}; 200 same shape on repeat for same queue_date. 400 token_invalid; 403 wrong_clinic; 422 no_appointment_today.
- GET /queue/me [patient] -> 200 {queueNo, status, updatedAt} or {queueNo: null}. Own row only.
- POST /staff/checkins [nurse] {patientId | walkInName, idempotencyKey} -> 201/200 as above, source staff; appointment not required; patientId outside clinic -> 404.
- GET /staff/queue [Staff] -> 200 {queueDate, entries[{id, queueNo, displayName | walkInName, status, roomId, staffId, checkedInAt}]} ordered by checked_in_at.
- PATCH /staff/queue/{id} [nurse] {status?, roomId?, staffId?, reason?} -> 200 entry. Reason required for missed. 404 other clinic; 409 invalid_transition; 422 room or staff outside clinic.
- GET /staff/audit?from&to&limit<=200 [clinic_admin] -> 200 rows {at, actorUserId, action, entity, entityId, detail}. NFR-10 read; viewer UI out.
## Who may do what
- patient: POST /checkins and GET /queue/me, own rows only. Any /staff route -> 403.
- nurse: all queue writes, staff check-in, QR issue, queue reads.
- clinic_admin: queue reads, audit read, QR issue; no queue writes (proposed, Open Q).
## Queue state machine (queue_entry.status)
- check-in -> waiting; waiting -> called -> in_room -> completed (nurse).
- waiting or called -> missed (nurse, reason required).
- Any other move -> 409. completed and missed are terminal in S2.
- No timer, no system transition, no auto-reorder, no auto-assign.
## Staff control rules
- Order = checked_in_at arrival. Only staff PATCH changes room, nurse or status.
- Urgency: not settable in S2; no system-set flag, ever.
- No estimated waiting time in any field, label, log or response.
- Queue number per clinic per queue_date (clinic timezone): A### appointment, W### walk-in, allocated under row lock.
## Audit (every state change, append-only)
- Rows: checkin (source in detail), checkin_refused (reason), qr_issue, status (detail {from, to}), assign (detail {roomId, staffId}).
- Set actor_user_id, clinic_id, entity, entity_id, ip. Same transaction as the change. Detail holds ids and codes only; never name, walk_in_name, phone or token value.
## Seed additions (S1 seed unchanged)
- Clinic KK-DEMO-2 "KK Demo Dua" (fictional); patient Nadia (demo), phone 010-000-0005, no appointment, is_demo true.
- No queue_entry or qr_token rows seeded.
## Acceptance tests (Given/When/Then)
- S2-T1 FR-03: Given nurse-issued token and patient with appointment today, When patient posts it, Then 201 waiting, DB holds hash only; a second patient scanning the same token within 60 s also gets 201.
- S2-T2 FR-03: Given expired or unknown token, When check-in, Then 400 token_invalid, no entry created.
- S2-T3 FR-02: Given Nadia (KK-DEMO-2), When she posts a KK-DEMO-1 token, Then 403 wrong_clinic, no entry, checkin_refused row.
- S2-T4 FR-13, NFR-05: Given a check-in today, When retried with same key or a new token, Then 200 same queueEntryId; one row.
- S2-T5 FR-04: Given walk-in name, When nurse checks in, Then 201 W### source staff; patient gets 403.
- S2-T6 FR-05: Given waiting entry, When nurse moves to called, in_room, completed, Then 200 each with audit row; completed -> waiting Then 409, no change.
- S2-T7 FR-06: Given room in clinic B, When clinic A nurse assigns it, Then 422. Valid assign keeps checked_in_at order and writes assign row.
- S2-T8 NFR-01: Given clinic B nurse, When GET or PATCH a clinic A entry, Then 404, no change.
- S2-T9 NFR-03, FR-11: Given all S2 responses and audit rows, Then no phone, walk_in_name, token value or wait estimate appears; detail holds ids and codes only.
- S2-T10 NFR-10: Given an audit row, When app role runs UPDATE or DELETE, Then it fails.
## Out of scope
- FR-03 mobile scanner, FR-04/05/06 web UI, FR-12 notice, SignalR, FR-10 notifications, Angular, Ionic, FR-07, FR-08, FR-09, FR-14 reopen, FR-15, FR-16, NFR-09 polling, estimated waiting time (never).
## Human-delegated decisions (lead, 2026-10-11; human may overrule)
- QR token reusable within 60 s (shared display). POST /staff/qr-tokens and GET /staff/audit approved. FR-07 urgent excluded from S2; no system-set urgency ever.
- Re-check-in same day: active entry (waiting/called/in_room) or completed returns the existing entry (200). After missed, a new entry is allowed.
- clinic_admin read-only on queue. Audit actions qr_issue, checkin_refused approved. FR-14 reopen excluded.
- Accepted at architect check: existing active/completed entry returns 200 before token validation (token needed only to create an entry). S2-T9 means walk_in_name never appears in audit, logs, errors or patient-facing responses; GET /staff/queue legitimately shows it to staff. Status audit detail may include the fixed reason code.
