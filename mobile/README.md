# Mother app

Ionic (`@ionic/angular` standalone shell) on Angular 21 with Capacitor, built as a PWA first. Bahasa Malaysia and English on every screen. Prototype for demonstration, not MOH-approved (not approved by the Ministry of Health). All data is fictional.

## Screens
Activate, log in (phone and password), Home (greeting and next appointment), Scan (camera QR), Confirmation (A### number), Status (steps, room when called; live updates over the SignalR hub, with a fallback refresh every 15 s plus request time when the hub is down, and a 60 s safety refresh while connected), Settings (language, privacy, log out). Bottom tab bar: Home, Scan, Status, Settings.

**FR-10 notifications were not built in this slice** (cut first, as planned): there is no Inbox tab and no `GET /notifications`.

## Run
1. Postgres and seed: root README (`CONFIRM_RESET=yes db/seed/reset.sh` for a clean database).
2. API (Git Bash): `sh ../db/dev-api.sh` (http://127.0.0.1:5080, dev only).
3. App: `npm install` (not `npm ci`: the lock file is out of sync with npm 8.19), then `npm start` (http://127.0.0.1:4300, proxies `/api`).
4. Unit tests: `npm test -- --watch=false`. E2E (375x812 and 360x640): `npx playwright install chromium` once, then `npm run e2e` (needs `SEED_STAFF_PASSWORD` and `SEED_MOTHER_PASSWORD` in `../db/.env`; the specs issue activation codes through the staff API for the fictional demo mothers). Screenshots: `npx playwright test e2e/screenshots.spec.ts` writes to `screenshots/` (git-ignored).
5. Production check: `npm run check:prod` (build, then `verify:prod`) proves the developer-only paste field is not in the production bundle. `e2e/prod.spec.ts` serves that build and proves URL or storage flags cannot enable it (run `npm run build:prod` before `npm run e2e`).

## Rules this app follows
- Tokens: the access token and refresh token live in memory only (a reload means log in again; this is stricter than the staff web app, which keeps its refresh token in sessionStorage). Nothing is written to localStorage, sessionStorage or Preferences except the device-local language and theme choice. A native build will put the refresh token behind a secure-storage adapter (Keychain or Keystore) after a plugin licence check; no such plugin is installed yet.
- The phone number is never put in a URL, a log or storage.
- One idempotency key per check-in attempt, reused only to retry a lost response (FR-13).
- No time prediction of any kind, no priority or urgent wording, no other patients' data.
- QR scanning uses the camera (`getUserMedia`) and `jsQR`. The developer-only "paste a QR token" field is loaded behind `ngDevMode`, so production builds contain neither the component nor its chunk. It still calls the real `POST /checkins`.
- The FR-12 safety notice is one shared component on every signed-in screen. Its wording is a PLACEHOLDER marked "NEEDS MOH APPROVAL" and must be approved before any pilot. All Bahasa Malaysia text needs native review (tracked per key in `src/app/core/i18n.ts`).
- Offline (S5) means a banner and a Retry button only: scan is disabled, the last status stays with its time. There is no offline queue and no native build.
- Strict Content-Security-Policy meta tag in `src/index.html`; also set a CSP at the reverse proxy, with the `wss` origin for the hub.
