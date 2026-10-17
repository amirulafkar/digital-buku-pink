# Results S7: free-tier demo deployment (no feature)
Progress notes (survive a stall). Nothing committed.

- Step 1 done (2026-10-18): API side in api/Api/Program.cs (exact-origin CORS from Cors:AllowedOrigins, forwarded headers gated by Hosting:TrustForwardedHeaders, ForwardLimit 1), appsettings.json placeholder `Cors:AllowedOrigins: []`, tests in api/Tests/S7Tests.cs: 22 S7 tests pass.
- Step 2 done (2026-10-18): web+mobile apiBase via environment.ts / environment.pages.ts, api-base.ts interceptor (first in chain) + hub URL, angular.json configuration `pages` (outputPath dist/pages), scripts/csp.mjs, public/_redirects and _headers; unit tests web 26 (was 22), mobile 27 (was 23); build:pages OK both apps, csp check OK; tamper check exits 1.
- Step 2b done: real Chromium cross-origin check (page at http://localhost:9999, API at 127.0.0.1:5080 with Cors__AllowedOrigins set, dev-api.sh): with SignalR withCredentials=false login, GET, PATCH preflight, negotiate and WebSocket all work; with the SignalR default (withCredentials=true) negotiate is blocked (no Access-Control-Allow-Credentials), so live.ts sets withCredentials:false and the server allows no credentials; an unlisted origin is blocked. Chromium needed --disable-features=LocalNetworkAccessChecks for loopback to loopback in this harness. WebSocket was ws:// (local, plain); wss needs the deployed TLS host.
- Step 3a: api/Dockerfile and api/.dockerignore written; db/neon/01-roles.sql written (not yet proven). docker build running.
- Step 3 done (2026-10-18): docker build of api/Dockerfile OK; container ran against local Postgres: /health 200, process uid 1654 (user app, non-root), staff login 200, CORS header for listed origin, X-Forwarded-For '203.0.113.99, 198.51.100.77' stored as audit ip 198.51.100.77; container and image removed. Image logs one harmless message 'Cannot load library libgssapi_krb5.so.2' (Npgsql optional Kerberos). db/neon/01-roles.sql proven on a scratch postgres:16 container (removed): weak or missing passwords refused, run twice OK, dotnet ef migrate + seed as dbp_owner OK, dbp_app: UPDATE/DELETE/TRUNCATE on audit_log, TRUNCATE patient, CREATE TABLE, DROP TRIGGER all refused, DML allowed; owner UPDATE blocked by the trigger; is_demo all true.
- Step 4 done (2026-10-18): docs/deploy-demo.md (accounts, Neon roles/migrate/seed from PC, Render env table, Pages build, warm-up, smoke D1-D10, backup and restore drill, rollback, limits), README pointer plus one known-limitation line (hub access_token in host logs).
- Step 5 partial: API 91 passed (69 + 22 S7), NuGet audit clean; web unit 26, mobile unit 27; mobile build:prod/check:prod OK (40 files, was 39); prod builds unchanged in dev (connect-src still ws://127.0.0.1/localhost, no onrender string in either prod bundle); pages builds OK. e2e suites running.

## Final results (2026-10-18, Git Bash, fresh DB via reset.sh before each DB-backed suite)
| Suite | Result | Baseline |
| --- | --- | --- |
| API `dotnet test api/DigitalBukuPink.slnx` | 91 passed, 0 failed (22 new in api/Tests/S7Tests.cs) | 69 |
| NuGet audit | no vulnerable packages (Api, Data, Tests) | clean |
| Web unit | 26 passed (4 new, api-base.spec.ts) | 22 |
| Web e2e | 61 passed | 61 |
| Mobile unit | 27 passed (4 new) | 23 |
| Mobile e2e | 80 passed | 80 |
| Mobile `build:prod` and `check:prod` | OK, 40 production files checked (was 39: bundle chunking changed with the new module) | OK |
| `npm run build:pages` web and mobile, `check:pages` | OK, `connect-src 'self' https://dbp-api.onrender.com wss://dbp-api.onrender.com`; tampering (added `https://*.pages.dev`) makes the check exit 1 | new |

## Acceptance
- S7-A1: S7Tests S7A1_* (listed origins echoed, no credentials header; preview, wrong scheme, wrong port, look-alike and "null" origins get nothing; preflight allows Authorization, Content-Type, X-SignalR-User-Agent and only GET, POST, PATCH; empty config means no CORS headers; wildcard, path, trailing slash or ftp origin stops the API at start). Real browser proof in the step 2b note above.
- S7-A2: S7A2_* (forwarded address reaches audit ip, last entry wins with ForwardLimit 1, header ignored unless Hosting:TrustForwardedHeaders=true, rate limit bucket per forwarded client, /health 200 with an unreachable database in under 1 s, empty body).
- S7-A3: web and mobile `core/api-base.spec.ts`: interceptor prefixes only /api/ and /hubs/, empty base changes nothing, only api-base.ts imports the environment file, no storage, URL or cookie read near apiBase.
- S7-A4: `npm run check:pages` in web and mobile (see table). Dev and normal production builds unchanged: connect-src still `'self' ws://127.0.0.1:<port> ws://localhost:<port>`, no `onrender` string in either bundle, proxy.conf.json untouched, dev apiBase is empty.
- Dockerfile proof: see the step 3 note above. Neon roles proof: see the step 3 note above.

## Deviations from the brief
1. The Pages build is a separate Angular configuration `pages` (outputPath `dist/pages`, file `environment.pages.ts`), not the `production` configuration with `environment.prod.ts`. Reason: the existing mobile prod.spec serves the `production` build through the local API proxy; baking an absolute Render URL and a locked CSP into `production` would break it and send test traffic to an external host. `build:prod`, `check:prod` and the e2e are untouched.
2. Only the hub URL (live.ts, 2 files) and a new interceptor changed, not the 16 REST call sites: the interceptor prefixes /api/ and /hubs/ paths, so those call sites keep their relative URLs.
3. Forwarded headers are off unless `Hosting__TrustForwardedHeaders=true` is set as an env var on Render (fix round 1: the image no longer sets it; proven locally with and without the variable). Reason: a local `dotnet run` has no proxy, and trusting X-Forwarded-For there would let a caller choose the rate-limit key. Behind Render the image is on by default.
4. CORS also allows the request header `X-SignalR-User-Agent` (the SignalR JS client sends it on negotiate). The client uses `withCredentials: false`; the server allows no credentials. In real Chromium the SignalR default (credentials on) is blocked without `Access-Control-Allow-Credentials`; with it off, REST, PATCH preflight, negotiate and the WebSocket work (step 2b).
5. mobile/scripts/verify-prod.mjs accepts an optional folder argument (default unchanged) so the Pages build gets the same developer-path check.

## Gaps and not verified
- Nothing was deployed. Render, Neon and Cloudflare behaviour, wss through the Render proxy, real X-Forwarded-For from Render, Render log retention, and every D1 to D10 smoke check are for the human to run (docs/deploy-demo.md). Provider limits are not stated as fact.
- The restore drill on a Neon branch (D9) and the camera on a real phone over HTTPS (D3) are not done.
- The real-browser CORS check used http origins on loopback (plain ws://); the TLS and wss path is untested until deployed.
- The apiBase `https://dbp-api.onrender.com` is a proposed name; the human edits environment.pages.ts to the real URL before building (the CSP follows it automatically).
- The Docker image logs a harmless line about libgssapi_krb5 (optional Kerberos library for Npgsql).

## Decisions needed
1. Confirm deviation 1 (separate `pages` configuration instead of replacing `production`).
2. Confirm forwarded headers default off outside the image (deviation 3).
3. Seed time and activation-code expiry: record the seed time after the human seeds Neon.

## Fix round 1 (privacy-security follow-ups, 2026-10-18)
- Dockerfile no longer sets Hosting__TrustForwardedHeaders; it is a Render env var in the deploy table. Local proof (docker build, two containers, image and containers removed): variable off, spoofed `X-Forwarded-For: 203.0.113.99` stored audit ip `::ffff:172.17.0.1` (the socket peer); variable on, stored `203.0.113.99` (why it must only be set behind a trusted proxy). Image env has no such variable.
- Cors:AllowedOrigins accepts plain http only in Development; Production refuses it at start (test S7A1_Plain_http_origins_are_accepted_only_in_Development). Also switched to KnownIPNetworks (the old property is obsolete in .NET 10); forwarded-header tests still pass.
- `_headers` (web and mobile) now: HSTS, X-Content-Type-Options nosniff, Referrer-Policy no-referrer, X-Frame-Options DENY, header CSP carrying only frame-ancestors 'none' (the meta CSP is unchanged and cannot carry it). build:pages and check:pages pass in both apps.
- deploy-demo.md: Render env row, smoke D11 (spoofed X-Forwarded-For must not be the stored ip), pg_dump, pg_restore and psql admin examples use PGPASSWORD or PG* variables (no password in a URL or argument), the hub-token paragraph states the 15-minute bearer-token risk. brief-S7.md line 7 reworded as "reported by the human, verify on the live page".
- Re-run: API 92 passed (91 plus 1 new), web unit 26, mobile unit 27. e2e suites not re-run (no app source change; only `_headers`, Dockerfile, Program.cs CORS validation and docs changed).
