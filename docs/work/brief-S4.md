# Brief S4: Ionic mother app (mobile/)
Sources: 03 §2, §3, §7; 04a FR-01..03, FR-09..13, FR-16, NFR-01..05, NFR-07..09; 04b UF-01, UF-02, UF-06; wireframes M2-M5 (content only, not look); S1-S3 briefs; web/src/styles.scss tokens. G0 waived. Fictional data. Say "Prototype, not MOH-approved" on screen.
## Requirements
- Must: FR-01 (activation UI), FR-02 (wrong-clinic message), FR-03 (QR scan), FR-12 (notice), FR-13 (retry-safe check-in), FR-16, NFR-02 (token handling), NFR-05 (offline state), NFR-07, NFR-08.
- Should, cut order from CLAUDE.md: FR-09 (cut 2nd), FR-10 (cut 1st).
- Not S4: FR-11 (server side, already exists), SignalR (S5, polling only), store builds, push services, staff web.
## Screens and behaviour (routes)
- /activate: code, phone, password (min 8, proposed). POST /api/v1/auth/activate -> 204 -> /login with "Account ready, log in." Failure: "Code invalid or expired. Ask the counter for a new one."
- /login: phone and password -> POST /auth/login. Role must be patient. Failure (also locked): "Phone or password is not right."
- /home (M2): greeting (GET /me), next appointment card (GET /appointments/next) or "No appointment listed. Your clinic adds them." Button "Check in with QR" (>= 44px) -> /scan.
- /scan (M3): Capacitor camera reads the QR string, then POST /checkins {token, idempotencyKey}. Camera denied: "Camera is off. Ask staff at the counter."
- DEV-ONLY manual path: paste-token field for browser testing. Compiled out of prod build (build flag). It still calls the real POST /checkins; it never bypasses the API.
- /confirmation: "Checked in. Your number is A014." Shows A### only. 201 and 200 show the same screen.
- /status (M4): queue number and steps waiting, called, in_room, completed. Polls GET /queue/me every 15 s, only while visible; back off to 60 s after an error. Missed: "You missed your call. Tell the counter." Copy: "Staff decide the order. This app does not estimate waiting time."
- /inbox (M5, FR-10, cut first): GET /notifications, status wording only.
- /settings (M5): language BM/EN (device-local), privacy notice text, log out. No push toggle.
- Scan error copy (from M3): token_invalid "This code has expired. Scan the current one." wrong_clinic "This code is for another clinic. Ask staff." no_appointment_today "No appointment found. Please ask staff."
## Rules
- Client makes one idempotencyKey (UUID) per check-in attempt and reuses it on retry only (NFR-05, FR-13).
- Mother never sees urgent flags, reason codes, other patients, room of others, or any wait time. No "you are next" or "priority" copy.
- Unknown status from server: "Status unavailable. Ask the counter."
## Token storage (NFR-02)
- Access JWT (15 min) in memory only. Refresh token in platform secure storage (iOS Keychain, Android Keystore) via a maintained Capacitor plugin with licence checked. Never localStorage, sessionStorage or Preferences.
- Single-flight refresh on 401; store the rotated refresh token each time. Refresh failure: wipe storage, go to /login with "Please log in again."
- Browser dev build: refresh token in memory only (reload means log in again).
- deviceName sent on login: "iOS app", "Android app" or "Web dev". No personal data. Logout posts refreshToken -> 204, wipes storage.
## API (base /api/v1)
- Existing (S1/S2): POST /auth/login, /refresh, /logout, /activate; POST /checkins; GET /queue/me. Own rows only.
- NEW, needs approval: GET /me -> 200 {displayName, clinicName, language}. Own row. No phone or IC. Audit: none (read).
- NEW, needs approval: GET /appointments/next -> 200 {scheduledAt, type, clinicName} or {scheduledAt: null}. patient_id = sub AND clinic_id = JWT clinic. Earliest from now. Clinic timezone. Read-only. Lead wrote /me/appointments; spec 03 §7 says /appointments/next, so the spec path is used.
- NEW, needs approval: GET /queue/me gains roomName (nullable; set only when called or in_room, staff-set). Needed for M4 "go to Room 2".
- NEW, FR-10 (cut first): GET /notifications?limit<=50 -> [{id, kind: called|in_room|completed|missed, bodyText, createdAt, readAt}]. Own rows, clinic-scoped. Row inserted in the same transaction as the staff status PATCH, fixed text only.
- No new endpoint for device or token storage (refresh_token.device_name exists). No PATCH /me/language (language is device-local).
- Errors: 400 token_invalid, 403 wrong_clinic, 422 no_appointment_today, 429 rate limited ("Too many tries. Wait a minute.").
## Tables touched
- Read: patient, appointment, queue_entry, room, clinic. Write: refresh_token (login, refresh, logout), audit_log (existing login and activation rows), notification (only if FR-10 built). No new table.
## Acceptance tests (Playwright, 375x812 and 360x640)
- S4-A1 FR-01: Given unused code, When activate, Then 204 and login screen. Given reused or expired code, Then generic error and no row change.
- S4-A2 NFR-02: Given login, Then no token in any web storage; refresh token only in secure store (device) or memory (web).
- S4-A3 FR-09: Given appointment today, Then time and type shown, no edit control. Given none, Then empty text.
- S4-A4 FR-03: Given pasted real token (dev build), When scan, Then A### shown from API. Given expired token, Then token_invalid copy. Prod build: no paste field.
- S4-A5 FR-13, NFR-05: Given check-in, When response lost and retried with same key, Then one queue number, one row.
- S4-A6 NFR-05: Given API stopped, Then offline message, scan disabled, last status with "Last updated" time, no wait time.
- S4-A7 FR-12: Given each signed-in screen, Then notice visible in BM and EN.
- S4-A8 FR-16, NFR-08: Given BM, Then all visible text BM. Given EN, Then all EN. No missing keys.
- S4-A9 NFR-02: Given logout, Then old refresh token returns 401 and storage is empty.
- S4-A10 NFR-01: Given patient token, Then GET /queue/me returns only own row (API test).
- S4-A11 "No waiting time": Given every screen in BM and EN, Then no wait, estimate, priority or urgent text.
- S4-A12 NFR-07: axe zero serious violations per screen, both themes; targets >= 44x44; text at 200% no clipping; visible focus.
## Design direction
- Same Blush paper neumorphic tokens as web/ (bg #fdf3f6, accent #a02e6d, text #2a1230, radii 8/12/16, neu-raised and neu-inset), dark tokens too. Geist and Outfit self-hosted.
- Bottom tab bar: Home, Scan, Status, Inbox. If FR-10 is cut, Inbox becomes Settings. Respect safe-area insets. Dynamic text sizes (rem, OS scaling), reflow at 320 CSS px. Phosphor icons only. No emoji, no em dashes.
## Decisions for human
1. FR-12 wording is unapproved. Placeholder EN: "[PLACEHOLDER, NEEDS MOH APPROVAL] Tell staff immediately or go to a hospital if you are worried." BM: "[PLACEHOLDER, NEEDS MOH APPROVAL] Beritahu kakitangan dengan segera atau pergi ke hospital jika anda risau." BM needs native review.
2. FR-10 cut first: default is build last behind a flag. If cut, no Inbox, no GET /notifications, no writer.
3. Approve GET /me, GET /appointments/next and roomName on /queue/me.
4. Choose secure-storage plugin (Capacitor has no official one).
5. Confirm password min 8 and 15 s poll (both proposed).
6. Seed a demo appointment for today (S2 seed has none).
## Out of scope
SignalR (S5), native builds and store, push notifications, Later visits list (M2), appointment reminders (M5), push toggle, mother edit or reschedule, FR-14, FR-15 for mothers, urgent display, any estimated wait, staff web changes.
## Human-delegated decisions (lead, 2026-10-11; human may overrule)
- FR-12: build with the brief's placeholder EN and BM strings, one shared component on every post-check-in screen. HUMAN MUST APPROVE the exact wording (MOH) before any pilot; BM needs native review.
- FR-10 notifications: build last, behind a feature flag, first to cut. Approved new endpoints: GET /me, GET /appointments/next (spec path), roomName on GET /queue/me, GET /notifications. Demo mother gets a seeded appointment today.
- Token storage (as built, stricter than the staff web): this is an Ionic PWA. BOTH the access token and the refresh token stay in memory only, behind a `TokenStore` adapter; nothing is written to localStorage or sessionStorage. A page reload therefore requires logging in again. A native secure-storage plugin (Keychain or Keystore) is deferred until a native build is required, then plugs into the same adapter after a licence check.
- Password minimum 8 characters; status poll 15 s; language is device-local (no PATCH /me/language).
- Accepted at architect check (lead, 2026-10-11): scan.denied copy is longer than the brief's one line because it gives a recovery step; the MOH notice wording differs from the brief's shorthand but means the same; GET /appointments/next starts from the start of today (not "from now") so a mother can still check in for an appointment that has just passed; seed appointments are created on first seed only (run reset.sh on an older DB); screenshots are captured from the dev build (prod bundle has no dev paste field, proven by check:prod).
