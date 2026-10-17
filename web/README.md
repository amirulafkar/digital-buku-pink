# Staff web

Angular 21 (standalone components, signals) with Angular Material 3 as the base and custom design tokens. Nurse dashboard: login, queue, patients, activation codes. Prototype for demonstration, not MOH-approved. All data is fictional.

## Run
1. Start Postgres and seed: see the root README (`db/seed/reset.sh` for a clean database).
2. `npm ci` (clean install from the lock file; works with npm 8.19 and 10.x).
3. API (Git Bash): `sh ../db/dev-api.sh` (http://127.0.0.1:5080, dev only, rate limits raised).
4. UI: `npm start` (http://127.0.0.1:4200, proxies `/api` to the API).
5. Unit tests: `npm test -- --watch=false`. E2E and axe: `npx playwright install chromium` once, then `npm run e2e` (starts both servers if needed; needs `SEED_STAFF_PASSWORD` in `../db/.env`).

## Notes
- Access token lives in memory only. The refresh token is in sessionStorage (cleared when the tab closes). Neither is in localStorage.
- All strings are in `src/app/core/i18n.ts` (typed keys, every key in `ms` and `en`). The Bahasa Malaysia text is marked `needs-native-review` until a Malaysian reviewer signs off.
- Fonts (Geist, Outfit) and icons (Phosphor) are self-hosted from npm packages. One accent colour, light and dark themes via CSS tokens in `src/styles.scss`.
- The queue is shown in server order only. There is no client sort, no auto-select and no time prediction of any kind.
- Live updates use the SignalR hub `/hubs/queue` (S5): the hub only says "queue changed" and the board refetches `GET /api/v1/staff/queue`. While connected a safety poll runs on a 60 s interval. If the hub is down the board polls on a 5 s interval (15 s after a failed request, paused when the tab is hidden) and shows a banner. Offline shows a banner and Retry, and writes are disabled; there is no offline queue.
- Known gap: at 200% root text size the board scrolls sideways.
