# Digital Buku Pink (prototype)

> **Prototype for demonstration. Fictional data only. Not MOH-approved.** It is not MOH-approved, not an official system, and must not be used with real patients; all data is fictional.

A mother app (Ionic PWA), a nurse dashboard (Angular) and an ASP.NET Core API with PostgreSQL and SignalR. Staff always control the queue: the system never reorders, sets urgency or assigns a room by itself, and it shows no time prediction of any kind.

Layout: `api/` (Api, Data, Tests), `db/` (Compose, seed, backup), `web/` (Angular staff dashboard), `mobile/` (Ionic mother app, PWA), `docs/` (briefs, design notes, demo script, freeze checklist).

## Run locally (Git Bash on Windows)
1. `cp db/.env.example db/.env` and fill in local values (git-ignored; never commit).
2. `docker compose -f db/docker-compose.yml up -d` (Postgres 16 on 127.0.0.1:5433).
3. `db/seed/seed.sh` migrates (owner role) and seeds fictional demo data; activation codes print once. `CONFIRM_RESET=yes db/seed/reset.sh` wipes and reseeds (dev only).
4. API for the UIs: `sh db/dev-api.sh` (http://127.0.0.1:5080, dev only, rate limits raised). Otherwise run the API with `ConnectionStrings__Default` (app role `dbp_app`) and `Auth__Key`.
5. Staff web: `cd web && npm ci && npm start` (http://127.0.0.1:4200). Mother app: `cd mobile && npm install && npm start` (http://127.0.0.1:4300). Details in `web/README.md` and `mobile/README.md`.
6. Demo: follow `docs/demo-script.md`. Free-tier online demo (Neon, Render, Cloudflare Pages): `docs/deploy-demo.md`.

### Tests
| Suite | Command |
| --- | --- |
| API (needs the Postgres container and db/.env) | `dotnet test api/DigitalBukuPink.slnx` |
| NuGet audit | `dotnet list api/DigitalBukuPink.slnx package --vulnerable --include-transitive` |
| Web unit and e2e | `cd web && npm test -- --watch=false` and `npm run e2e` |
| Mobile unit | `cd mobile && npm test -- --watch=false` |
| Mobile production build and check | `npm run build:prod`, then `npm run check:prod` |
| Mobile e2e | `npm run e2e` (after `npm run build:prod`) |

### Windows caveats
- `core.autocrlf=true` turns shell scripts into CRLF and breaks them. `.gitattributes` pins `*.sh` to LF; check with `git ls-files --eol`.
- Playwright configs start the servers through `sh`, so run e2e from Git Bash (or put `sh` on PATH). dotnet must be on PATH (`C:\Program Files\dotnet`).
- Web installs with `npm ci`. Mobile installs with `npm install` (its lock file is out of sync with npm 8.19; do not commit lock changes unless needed).
- Reset the database before each e2e suite: `CONFIRM_RESET=yes db/seed/reset.sh`. The e2e specs move the same fictional mothers through the queue, so a used day makes them fail.
- Run `npm run build:prod` in `mobile/` before `npm run e2e` (a spec serves the production build).

## Backup and restore drill (NFR-11)
- `db/backup/backup.sh` writes a custom-format `pg_dump` to `$BACKUP_DIR` (default `db/backups/`, git-ignored) as `dbp-YYYYMMDD-HHMM.dump` and exits non-zero if the file is empty.
- `db/backup/restore-drill.sh [dump]` restores the newest dump into a scratch database `dbp_restore_drill`, compares `count(*)` of every public table with the source, prints the table and drops the scratch database. It exits 1 on any mismatch. Run it right after a backup, with nothing writing to the source.
- Dumps contain password, activation-code, refresh-token and QR-token hashes and audit-log IP addresses: never commit, share or upload them. Prototype data is fictional, but treat the files as secrets.
- Proposed schedule, **not installed**: daily at 02:00 with 7 days of retention. Windows Task Scheduler action: `"C:\Program Files\Git\bin\bash.exe" -lc "cd /d/Claude/Projects/digital-buku-pink && db/backup/backup.sh"` (adjust the path). Cron form: `0 2 * * * cd /path/to/repo && db/backup/backup.sh && find db/backups -name 'dbp-*.dump' -mtime +7 -delete`. Nothing in this repository installs a scheduler.

## Paper fallback (NFR-06)
This prototype is best effort. If the app, the API or the network is down, the clinic keeps working on paper:
1. Staff run the paper queue as they do today: write each mother's name and arrival order on the clinic's paper list.
2. Mothers who see "No connection" in the app go to the counter. The app keeps showing the last status it had, with its time, and the safety notice stays on screen.
3. Staff call people in the order they decide, as usual. Nothing here depends on the app.
4. When the system is back, entries may be re-keyed afterwards if the clinic wants them, using Patients, Check in (or Walk-in for a name with no record). Re-keying is optional.
5. Mothers with a worry should tell staff immediately or go to a hospital; the app never replaces that.

## Known limitations
- Offline means banners and retry only. There is no offline queue or outbox, and no native build (PWA first; store release only after approval).
- FR-10 notifications were skipped; FR-14 (reopen a missed entry) and FR-15 (staff password reset) are not built (freeze decision, `docs/work/freeze-S6.md`).
- The FR-12 safety notice wording is a placeholder and needs MOH approval before any pilot. The Malay text needs native-speaker review.
- Staff web has no screen for the rotating QR and no audit viewer; both are reachable only through the API (`POST /api/v1/staff/qr-tokens`, `GET /api/v1/staff/audit`).
- Reverse proxy to do before any pilot: mask `access_token` in logs for `/hubs/queue`, add the `wss` origin to the Content-Security-Policy, forward WebSocket upgrades, enable TLS and HSTS. The API now allows only the origins in `Cors__AllowedOrigins` (see docs/deploy-demo.md); HSTS comes from the Pages `_headers` file and must be added at any other proxy.
- There is no rate limit on the SignalR hub, and only one hub instance is supported (no backplane). The 429 rate-limit paths are untested because tests raise the limits.
- The staff web keeps its refresh token in sessionStorage; the mobile app keeps tokens in memory only (a reload means log in again).
- The staff board scrolls sideways at 200% text size. The mother app fallback refresh is every 15 s plus request time when live updates are down.
- No real-device camera test and no load test. The `/scan` paste field is a developer aid and is compiled out of production builds.
- Backups: a daily schedule is documented but not installed.
- Online demo only: the SignalR hub sends `access_token` in the query string, so host request logs may contain it. Accepted for the fictional-data demo (`docs/deploy-demo.md`).

## Notes
Auth endpoints are rate limited per IP (`Auth:RateLimitPerMinute`). Check-in, QR, activation-code issue and patient search are rate limited per user (`Auth:CheckinPerMinute`, `Auth:QrPerMinute`, `Auth:SearchPerMinute`, default 60). Patient search is `POST /api/v1/staff/patients/search` with a JSON body so typed text never appears in a URL. Serve the web app behind a reverse proxy with a strict Content-Security-Policy (the apps also ship a CSP meta tag) plus HSTS. Set `CODE_PEPPER` and `JWT_KEY` (at least 32 bytes) in `db/.env`; the API refuses to start without them. `seed` runs only with `ASPNETCORE_ENVIRONMENT=Development`. FHIR mapping note (design only): `docs/design/fhir-mapping.md`.
