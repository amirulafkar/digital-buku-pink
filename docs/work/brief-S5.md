# Brief S5: SignalR live queue, offline states, BM completion, accessibility pass
Sources: 03 week 9 and stack table; 04a FR-05, FR-12, FR-13, FR-16, NFR-04..09; 04b UF-05e, UF-05i; brief-S4; status.md (2026-10-14 offline decision). Fictional data. Show "Prototype, not MOH-approved" on screen.
## Requirements
- Must: FR-05 (board and mother app show changes within a few seconds), FR-12 (notice on new offline and reconnect states), FR-13 (unchanged), FR-16, NFR-04, NFR-05 (offline banner and retry), NFR-07, NFR-08, NFR-09 (polling fallback).
- Unchanged: FR-07, FR-09, FR-10 stay cut or as S4 left them. No FR-14 or FR-15 work.
- Not S5: offline write queue or outbox, native build, store, push, estimated wait, staff web beyond live refresh.
## Architecture
- Hub `/hubs/queue` (ASP.NET Core SignalR), server-to-client only. No client-invokable hub method.
- Auth: JWT bearer. Token from the in-memory accessTokenFactory. Query `access_token` allowed only on `/hubs/queue` (api/Api/Program.cs, JWT OnMessageReceived). Serilog must not log query strings.
- Groups are set on connect from JWT claims only: `clinic:{clinicId}:staff` (Staff policy: nurse, clinic_admin read-only) and `clinic:{clinicId}:patient:{sub}` (Patient role).
- Emit after SaveChangesAsync commits, never inside the transaction. Points: QueueService.cs check-in insert (~l.148) and status/assign/urgent save (~l.250). Emit failure is logged, not returned.
- Emit matrix: check-in 201 -> staff + patient. Status and room change -> staff + patient. Urgent (FR-07) -> staff only. Idempotent replay 200 -> nothing.
## Hub contract
- Event `QueueChanged()`, zero arguments. Client refetches via REST. Payload never includes entry id, name, status, room, urgent, reason or wait.
- Connection closes at access-token expiry (15 min); client reconnects with a fresh token. Server-side test required.
## REST (no new endpoints)
- Staff board: GET /api/v1/staff/queue. Mother: GET /api/v1/queue/me (S4 roomName kept).
- Hub negotiate is a new surface: needs human approval (Decision 1).
## Connection states (mother /status and staff board)
- connected: hub up. Refetch on event, bursts coalesced into one GET within 500 ms. Safety poll 60 s. No banner.
- reconnecting: hub down, API answers. Banner "Live updates paused. Checking again." Fallback poll: mother 15 s, board 5 s. Scan still enabled.
- offline: browser offline or last REST call failed. Banner "No connection. Showing the last update from {time}." Retry button (44 px). Scan disabled. Last status kept with "Last updated" time.
- Transitions: connected -> reconnecting on hub close. Reconnecting -> connected on hub start, then one refetch. Any -> offline on navigator offline or REST failure. Offline -> connected on retry success, then one refetch.
- SignalR auto-reconnect delays 0, 2, 10, 30 s, then stop and stay on fallback poll.
- Rule: write calls keep the S4 idempotencyKey. Offline gate is a `canWrite` flag, so a later outbox can replace it. No pending-write storage in S5.
## Files to change
- API: api/Api/Program.cs (AddSignalR, MapHub, token query), api/Api/QueueService.cs (emit calls), new api/Api/QueueHub.cs and QueueNotifier.cs, new api/Tests/S5Tests.cs.
- Mobile: mobile/src/app/core/poll.ts (Poller, Connectivity), new mobile/src/app/core/live.ts (SignalR client), mobile/src/app/features/status/status.ts (Poller at l.79), mobile/src/app/features/home/home.ts and scan/scan.ts (offline gate), mobile/src/app/app.ts (banner), shared/states.ts, shared/notices.ts (FR-12), core/i18n.ts.
- Web: web/src/app/features/queue/queue.ts (Poller at l.43, 80), web/src/app/core/poll.ts, web/src/app/app.ts (banner), web/src/app/shared/states.ts, web/src/app/core/i18n.ts.
## Acceptance tests
- S5-A1 FR-05 API: Given nurse and mother connected, When staff PATCH status, Then nurse gets QueueChanged and mother gets it only for her own entry.
- S5-A2 Clinic scope: Given clinic B nurse connected, When clinic A check-in, Then no event received.
- S5-A3 Payload: Given any captured frame, Then zero arguments; no name, phone, room, urgent or status text.
- S5-A4 Urgent: Given FR-07 flag, When saved, Then mother connection gets no event.
- S5-A5 FR-13: Given check-in replay returns 200, Then no event; given 201, then exactly one event.
- S5-A6 Auth: Given no token, Then negotiate 401; given query token on any /api route, Then 401.
- S5-A7 FR-05 e2e: Given /status open with fallback poll disabled, When staff PATCH, Then status updates within 5 s without reload.
- S5-A8 NFR-09 e2e: Given hub request blocked, When staff PATCH, Then status updates within 15 s plus request time (poll interval 15 s; test allows 16.5 s) and "Live updates paused" shows.
- S5-A9 NFR-05 e2e: Given API stopped, Then offline banner, scan disabled, last status with "Last updated", no wait text. When API returns and Retry pressed, Then banner clears and one refetch.
- S5-A10 FR-12 e2e: Given status and home in connected, reconnecting and offline states, Then notice visible in BM and EN.
- S5-A11 NFR-07 axe: zero serious violations on status (3 states), board with banner, both themes; banner role=status; targets >= 44 px; 200% text no clipping; 320 px reflow.
- S5-A12 NFR-08, FR-16: every new key has BM and EN; BM view shows no EN text and vice versa.
- S5-A13 NFR-02: after live connect and reconnect, no token in localStorage, sessionStorage or cookies.
- S5-A14 NFR-04: check-in confirmation under 2 s on throttled link (timed e2e, proposed target).
- Unit: state machine transitions; 60/15/5 s intervals; coalescing; canWrite false when offline; BM/EN key parity (i18n.spec.ts).
- API unit: emit after commit; emit failure keeps 201 and the state change.
## Decisions for human
1. Approve hub `/hubs/queue` as a new surface (spec names SignalR; S4 required approval for new REST endpoints).
2. Safety poll while connected: 60 s proposed.
3. clinic_admin joins staff group, read-only (matches Staff policy).
4. Query-string token for hub (browsers cannot set WebSocket headers). Proposed, with log masking.
5. Hub connect and deny not audited (spec silent). Proposed: no.
6. Malay native review for all new strings; FR-12 wording still a placeholder pending MOH.
## Out of scope
Offline write queue or outbox, native builds and secure storage plugin, push, FR-10 notifications, FR-07 and FR-09 changes, estimated or relative wait, mother reschedule, hub client-to-server methods, Redis backplane (single instance only), load testing beyond the NFR-04 timed check.
