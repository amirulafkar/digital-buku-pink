# Staff web (S3)

Angular 21 (standalone components, signals) with Angular Material 3 as the base and custom design tokens. Nurse dashboard: login, queue, patients, activation codes. Prototype, not MOH-approved. Fictional data only.

## Run
1. Start Postgres and seed: see the root README (`db/seed/reset.sh` for a clean database).
2. `npm install --legacy-peer-deps` (npm 10.9 hits an arborist bug without the flag).
3. API: `sh ../db/dev-api.sh` (http://127.0.0.1:5080, dev only, rate limits raised).
4. UI: `npm start` (http://127.0.0.1:4200, proxies `/api` to the API).
5. Unit tests: `npm test`. E2E and axe: `npx playwright install chromium` once, then `npm run e2e` (starts both servers if needed; needs `SEED_STAFF_PASSWORD` in `../db/.env`).

## Notes
- Access token lives in memory only. The refresh token is in sessionStorage (cleared when the tab closes). Neither is in localStorage.
- All strings are in `src/app/core/i18n.ts` (typed keys, every key in `ms` and `en`). The Bahasa Malaysia text is marked `needs-native-review` until a Malaysian reviewer signs off.
- Fonts (Geist, Outfit) and icons (Phosphor) are self-hosted from npm packages. One accent colour, light and dark themes via CSS tokens in `src/styles.scss`.
- The queue is shown in server order only. There is no client sort, no auto-select and no waiting-time text anywhere.
- Polling every 5 s (15 s after an error, paused when the tab is hidden). SignalR arrives in S5.
