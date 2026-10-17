# Brief S7: free-tier demo deployment (no new feature)
Sources: 04a NFR-01, 02, 03, 05, 09, 10, 11; status.md (pre-pilot notes 2026-10-14); brief-S5; results-S5; api/Api/Program.cs; db/init/01-roles.sh; db/seed/seed.sh; S1_Init migration (audit_log grants and trigger). Fictional data only. "Prototype, not MOH-approved" stays on every screen.
## Requirements
- Must: prove NFR-01, 02, 03, 05, 09, 10, 11 on the remote demo. No FR added or changed; no endpoint added; no estimated wait.
## Targets (free tiers, names proposed)
- Staff web: Cloudflare Pages `dbp-staff` (`*.pages.dev`). Mother app: Pages `dbp-mother`.
- API: Docker image on Render free web service `dbp-api` (sleep-after-idle behaviour reported by the human, verify on the live Render page before relying on it; no disk needed).
- DB: Neon free PostgreSQL 16, direct (non-pooler) endpoint, `sslmode=require`.
## Architecture
- Build-time base URL: new `environment.prod.ts` (`apiBase = 'https://dbp-api.onrender.com'`) via angular.json fileReplacements. An interceptor prefixes `/api` and `/hubs`; hub URL built from apiBase. No query, storage or runtime override. Dev keeps `''` plus proxy.conf.json.
- 16 relative URL sites in 6 files change (web and mobile core: auth.ts, api.ts, live.ts). No other app code changes.
- CORS: exact origins from `Cors:AllowedOrigins` (the two production pages.dev origins only; no wildcard, no preview hashes). Methods GET, POST, PATCH; headers Authorization, Content-Type. Allow credentials only if SignalR JS needs it (test decides). Registered before auth and MapHub.
- Hub: `wss://dbp-api.onrender.com/hubs/queue`; negotiate over https with Authorization header. Token in `access_token` query, socket only (S5 rule).
- CSP (build output, meta tag in index.html): `connect-src 'self' https://dbp-api.onrender.com wss://dbp-api.onrender.com`. New `scripts/csp.mjs` writes it from the same apiBase value. Dev CSP unchanged.
- Pages: `public/_redirects` with `/* /index.html 200`; `public/_headers` adds HSTS.
- API Dockerfile (new): multi-stage, SDK 10 build, aspnet 10 runtime, non-root, `ASPNETCORE_HTTP_PORTS=8080`, Production env, no seed run. `.dockerignore` excludes bin, obj, node_modules, db/.env, docs.
- Health: Render HTTP check on `GET /health` (200, no DB touch, so it cannot warm Neon).
- Forwarded headers: UseForwardedHeaders (ForwardLimit 1, KnownProxies and KnownNetworks cleared) so rate limits and audit `ip` see the client, not Render's proxy. Limit values stay at defaults.
## Secrets and config (never committed)
- Render env, secret: ConnectionStrings__Default (dbp_app, sslmode=require), Auth__Key (>= 32 bytes), Auth__CodePepper (>= 16 bytes; must equal the seeding value or codes will not validate).
- Render env, plain: Cors__AllowedOrigins, Auth__Issuer, Auth__Audience.
- Developer PC only: dbp_owner string, Neon owner password, db/.env (git-ignored). Pass as env vars for one-shot commands.
- Frontend build receives only apiBase. No secret reaches Pages.
## Neon roles and migrations
- `db/neon/01-roles.sql` (new, run once by the human; password via psql variable). Creates dbp_owner (migrations, seed) and dbp_app (DML only). Neon default owner only creates roles; app and migrations never use it.
- dbp_app grants match S1_Init: SELECT, INSERT, UPDATE, DELETE, no TRUNCATE; audit_log REVOKE UPDATE, DELETE, TRUNCATE. Audit trigger stays. A table owner can drop triggers, so the app must never run as owner.
- Migrations: `dotnet ef database update --project api/Data` as dbp_owner from the PC. API startup does not migrate (none today).
## Remote seed
- Recommended: one-off `dotnet run --project api/Api -- seed` on the PC with ASPNETCORE_ENVIRONMENT=Development and Seed:ConnectionString = dbp_owner (Neon). No seed code runs on Render. Idempotent (AlreadySeeded).
- Activation codes expire after 7 days and rerunning seed does not reissue them. Re-issue via staff before the demo; record seed time in results-S7.
## Logs, cold start, backup
- Hub access_token in the query may reach Render request logs (S5 privacy finding). Demo accepts only with synthetic data and short retention (Decision 2). Verify Render log retention; no code change in S7.
- Cold start: Render wakes in tens of seconds; Neon wakes on first query. Demo script: warm `/health` and staff login 2 min before. App shows the "connecting" state, not an error (NFR-05). An open hub socket keeps Render awake.
- Backup (NFR-11): `pg_dump --format=custom` from PC as dbp_owner, kept outside the repo, 7-day retention. One restore into a new Neon branch; login and queue read checked; result in results-S7.
## Files to change
- New: api/Dockerfile, api/.dockerignore, api/Tests/S7Tests.cs, db/neon/01-roles.sql, scripts/csp.mjs (web and mobile), environment.prod.ts (web and mobile), public/_redirects and public/_headers (web and mobile), docs/deploy-demo.md.
- Changed: api/Api/Program.cs (CORS, forwarded headers only), api/Api/appsettings.json (placeholders only), web and mobile angular.json (fileReplacements), web and mobile src/app/core/{api,auth,live}.ts (base URL).
- Not touched: db/ compose and init, status.md, README.md (S6 owns), queue rules, S5 hub contract.
## Acceptance tests
- S7-A1 (dotnet test): CORS allows exactly the two origins; unlisted or preview origin gets no ACAO; preflight allows Authorization.
- S7-A2 (dotnet test): forwarded header gives the client IP to the rate limiter and audit ip; `/health` 200 without DB.
- S7-A3 (ng test): interceptor is the only base-URL path; no read of apiBase from query, localStorage or sessionStorage.
- S7-A4 (build check): dist index.html connect-src has exactly the https and wss API origin; no wildcard.
- Deploy smoke (human, real phone for camera): D1 cold `/health` 200, time recorded. D2 staff and mother login from Pages; no token in localStorage or cookies (NFR-02). D3 QR issue, mother scans over HTTPS, check-in 201, replay 200 (NFR-05). D4 staff PATCH shows on /status within 5 s over wss, no reload (NFR-09). D5 block API host: offline banner, scan disabled, last update shown; restore, Retry clears. D6 clinic B nurse sees no clinic A queue (NFR-01). D7 psql as dbp_app: UPDATE, DELETE, TRUNCATE on audit_log refused (NFR-10). D8 is_demo true, names fictional, no IC or address (NFR-03). D9 restore drill (NFR-11). D10 "Prototype, not MOH-approved" on staff and mother screens.
## Rollback
- Pages: redeploy previous build. Render: redeploy previous image. Neon: no S7 migration; if data is wrong, restore dump to a new branch and change ConnectionStrings__Default. Compromise: rotate Auth:Key (ends all sessions).
## Out of scope
- Custom or paid domain, pilot hosting, Redis backplane, native builds or store, MOH or FR-12 wording, same-origin Worker proxy, seed endpoint or seed-only flag, load test, paid tiers, Neon branch automation, scheduled backups (NFR-11 stays manual), login gate unless Decision 3.
## Decisions for human
1. Provider accounts under your name; billing guard (free plans only). Hosting cap is still unset in status.md; record it before deploy.
2. Accept hub token in host request logs for the demo (synthetic data only), or fix first?
3. Public URL, or basic access gate (e.g. Cloudflare Access free tier, limits to verify)?
4. Seed: PC-run with Development env (recommended), or seed-only flag in production (new prod code path; not recommended).
5. Forwarded-header and CORS config count as deployment, not feature, under the frozen scope. Confirm.
6. Accept cold start (tens of seconds) and Neon scale-to-zero for the demo.
7. Provider limits (Render sleep, Neon compute and storage, Pages builds) are from the request, not verified; check live pages before deploy.
