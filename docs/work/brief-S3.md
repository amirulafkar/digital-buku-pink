# Brief S3: Angular nurse dashboard (web/)
Sources: 03 §2, §3, §7; 04a FR-01, FR-04..08, FR-11, FR-16, NFR-07..09; 04b UF-01, UF-03; wireframes W0-W4 (content only, not look); S1, S2 briefs. G0 waived. Fictional data only.
## Requirements
- Covered: FR-04 (walk-in), FR-05 (board), FR-06 (room and nurse), FR-07 (urgent, Should, first to cut), FR-08 (search), FR-01 (staff issues codes), FR-11 (UI actions write audit via API), FR-16 and NFR-08 (BM/EN), NFR-07 (WCAG 2.2 AA), NFR-09 (polling).
- Not S3: FR-09, FR-10, FR-12 (mobile only in 03), FR-14 reopen, FR-15, W5 audit viewer (Open Q 1), W1 counter display mode, SignalR (S5), Ionic (S4), S5 polish.
## Screens and behaviour
- W0 /login: username and password (S1 staff login). Shows not-MOH notice and "fictional data" line. Generic error on bad login or lock.
- W1 /queue: today's table in server order (checked_in_at). Columns: large queue number, name or walk-in name, check-in time, status chip (text plus icon), room, nurse, actions. Polls GET /staff/queue every 5 s; pauses when tab hidden; backs off to 15 s after an error.
- W2 assign dialog: room, nurse, urgent toggle with reason (required when on). Save = PATCH only. Assign never changes status. "Call" is a separate explicit button.
- W3 /patients: search (name or phone fragment, min 2 chars, 300 ms debounce). Results show display name, today's appointment time and type only. Actions: Check in (POST /staff/checkins with patientId), Issue code. Walk-in form takes a walk-in name only.
- W4 /activation-codes: issue for a patient; code shown once with Copy; "valid 7 days, one use" line. List: patient name, issued, expires, status unused, used or expired. No revoke.
- Header: BM/EN switch, nav Queue, Patients, Codes (no Audit in S3). Offline banner when poll fails or navigator is offline; write controls disabled while offline.
- clinic_admin (proposed, Open Q 6): queue read-only; no search or codes screens.
## Queue state machine (mirrors S2, UI disables illegal moves)
- waiting -> called -> in_room -> completed. waiting or called -> missed (reason code required). Urgent toggle on any non-terminal entry. completed and missed are terminal.
## Staff-control rules
- No client sort, drag reorder or auto-select of next patient. Order is server order only.
- Urgency only set by staff with reason. No system-set flag.
- No estimated or average waiting time in any label, tooltip, log or copy.
## API gaps S3 needs (new contract, needs human approval as S2 precedent)
- POST /staff/activation-codes [Nurse] {patientId} -> 201 {code, expiresAt}. Code plaintext returned once; DB holds hash only. Patient outside clinic -> 404. Audit activation_issue, detail {patientId}. Rate limit as qr policy.
- GET /staff/activation-codes?patientId [Nurse] -> [{id, patientDisplayName, issuedAt, expiresAt, status}]. Never code or hash.
- GET /staff/patients?q&limit<=20 [Nurse] replaces the unfiltered list. q under 2 chars -> 400. Returns [{id, displayName, todayAppointment {time, type} | null}]. No language, phone or full list. Audit search, detail {resultCount} only; never the query text.
- PATCH /staff/queue/{id} gains urgent (bool) and urgentReason (fixed code list, required when urgent true, else 422). Audit urgent, detail {urgent, reasonCode}.
- GET /staff/nurses [Nurse] -> [{id, displayName}] for the assign dialog.
- Audit enum gains activation_issue. search and urgent already in 04c.
## Tables touched
- Read: patient, appointment (today), queue_entry, room, staff. Write: activation_code (insert), queue_entry (via PATCH), audit_log (insert). No new table expected.
## Angular structure (web/)
- Latest stable Angular at build time: standalone components, signals, new control flow, lazy routes per feature.
- Angular Material 3 as base with custom M3 tokens (palette, typography, shape) bound to CSS variables. No default Material theme.
- core/: auth service (access token in memory only, never localStorage), auth interceptor (Bearer; single-flight refresh on 401; logout on refresh failure), role guard (route data Nurse or ClinicAdmin), i18n service (ms and en), poll service (visibility pause, backoff).
- features/: login, queue, patients, codes. shared/: status chip, not-MOH notice, skeleton, empty, error, offline banner.
- i18n: typed keys, ms and en files, every key in both. Each ms string is marked needs-native-review in the file until a Malaysian reviewer signs off. No string concatenation.
## State coverage (each screen)
- Loading: skeleton rows (table, search results, code list). Empty: plain text plus next action. Error: message plus Retry. Offline: banner, writes disabled. Session expired: back to login with notice.
## Design direction
- Trust-first clinic dashboard: modern and calm, not the wireframe look.
- ONE accent colour; off-white and off-black neutrals; no pure black or white; no purple gradients; no neon glow.
- ONE corner-radius scale; one font pairing (Geist for UI, Outfit for headings), self-hosted, not Inter.
- Light and dark themes via CSS tokens; WCAG AA contrast; visible focus rings.
- Restrained motion: transform and opacity only; honour prefers-reduced-motion.
- Queue table built for scanning: large queue number; status chips use text, not colour alone.
- Icons: Phosphor only, one family; no hand-drawn SVG, no emoji, no decorative dots.
- Copy: no fake screenshots, no em dashes. Desktop first, usable on a tablet.
## Acceptance tests (Playwright, npx playwright test; unit tests via ng test)
- S3-E1 FR-16: Given nurse login, Then not-MOH notice visible; When switch to BM, Then all visible text is BM.
- S3-E2 FR-04/05: Given patient search result, When Check in, Then a queue row appears within 6 s, source staff.
- S3-E3 FR-05: Given waiting row, When Call, In room, Complete, Then status chips change; Complete is disabled on completed.
- S3-E4 FR-06: Given room and nurse, When assigned, Then row shows both; queue order unchanged after next poll.
- S3-E5 FR-07: Given urgent without reason, Then Save blocked; with reason, Then chip text "Urgent".
- S3-E6 FR-01: Given issue code, Then code shown once; after reload it is not shown; list shows unused.
- S3-E7 FR-08: Given query of 1 char, Then no request; given match, Then only name, clinic and appointment.
- S3-E8 NFR-01: Given clinic_admin, Then no write controls; deep link to /codes redirects.
- S3-E9 NFR-09: Given API stopped, Then offline banner and writes disabled; restart, Then recovers.
- S3-E10 "No waiting time": Given all four screens in BM and EN, Then no wait or estimate text.
- S3-E11 NFR-07: axe scan, zero serious violations on four screens, both themes.
## Out of scope
- SignalR, Ionic app, S5 polish, FR-09, FR-10, FR-12 on web, FR-14 reopen, FR-15, W5 audit viewer, counter display mode, walk-in phone capture, code revoke, any estimated waiting time (never).
## Open questions for human
1. 03 §3 lists audit viewer in web; WORKFLOW S3 omits it. Brief keeps it out.
2. W0 says Email; S1 uses staff username. Keep username?
3. Approve new endpoints above (activation codes, patient search, nurses list, urgent writer with fixed reasons).
4. W3 walk-in phone field: drop for NFR-03?
5. Issuing a new code: auto-revoke unused codes for that patient?
6. clinic_admin on web: read-only queue or no access?
## Human-delegated decisions (lead, 2026-10-11; human may overrule)
- Audit viewer stays out of S3. Staff log in with username (label "Username", not Email). New endpoints approved, including staff-set urgent with fixed reason codes (never system-set).
- Walk-in phone field dropped (NFR-03). Issuing a new activation code revokes that patient's unused codes (audited).
- clinic_admin on web: read-only queue and codes list; no check-in, assign or status changes. Nurse does all queue writes and may issue codes.
- Gate fixes (lead, 2026-10-11): patient search becomes POST /staff/patients/search with a JSON body {q, limit} so name or phone text never appears in URLs, browser history or proxy logs (replaces GET ?q). Search gets a per-user rate limit.
- Accepted at architect check: urgent chip text "Urgent, set by staff" (clarity over brief E5 wording "Urgent"); lavender as second hue for the In room state; box-shadow transitions are part of the neumorphic style (reduced-motion honoured); clinic_admin may read /staff/nurses and the codes list (human decision); E8 superseded by that decision.
- Pending human approval: add audit actions activation_issue and activation_revoke to the audit enum in docs/source/04c-database-design.md (spec is frozen; code already uses them).
