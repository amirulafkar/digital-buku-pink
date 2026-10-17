# Results S7: free-tier demo deployment (no feature)
Progress notes (survive a stall). Nothing committed. NOTE: statements below about the hub token in the query string and about WebSockets are superseded by the long polling follow-up at the end of this file.

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
| `npm run build:pages` web and mobile, `check:pages` | OK, `connect-src 'self' https://dbp-api.onrender.com` (the `wss://` entry was dropped in the long polling follow-up); tampering (added `https://*.pages.dev`) makes the check exit 1 | new |

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
- Long polling follow-up (2026-10-18), progress: server hub Transports=LongPolling only and query access_token handling removed; clients use HttpTransportType.LongPolling; CORS allows DELETE; API tests 95; proofs run: .NET LP test, real Chromium web spec (no token in URLs, header on every poll), cross-origin real SignalR JS check, latency, idle and 1-minute-token expiry measurements. e2e suites pending.

## Follow-up: SignalR over long polling (token out of the URL), 2026-10-18
Outcome: WORKS CLEANLY, kept. The access token is no longer in any URL the clients request and is not in the API's own logs (all tested). Render's and Cloudflare's edge logs were NOT inspected, so the "token in host logs" limitation is reduced, not proven closed; verify after deploy (smoke D12, read the Render request log).

What changed
- Clients (web and mobile live.ts): `transport: HttpTransportType.LongPolling`, `withCredentials: false`. The JWT goes in the `Authorization` header of the negotiate, every poll and the close call; the URL has only `?id=<opaque connection id>`.
- Server (api/Api/Program.cs): the hub offers LongPolling only (`Transports`), and the `OnMessageReceived` query-string handling is REMOVED, so a token in any URL authenticates nothing, hub included (the path is closed). CORS is now path-scoped: REST routes allow GET, POST, PATCH only; only the hub path also allows DELETE (the long polling client ends its connection with it); no REST route accepts DELETE (test S7A1_Every_REST_route_refuses_DELETE_with_and_without_a_Bearer). No hub contract change (`QueueChanged()`, groups, `CloseOnAuthenticationExpiration` unchanged).
- Tests updated: S5_A6 (query token now refused on the hub), S7 CORS tests (DELETE allowed, hub GET and DELETE preflights with Authorization), existing e2e W4 and A13 used `routeWebSocket`; they now count negotiates and drop the connection through new `e2e/hub.ts` (`trackHub`, aborts the held poll). One mobile test (fixes.spec "status first-load failure") became racy because long polling connects faster and refreshes the screen before the test's click; it now blocks the hub, as that test is about the REST retry only.

Proof of no token in any URL (all pass)
- API `S7LongPollTests`: negotiate offers LongPolling only; a WebSocket-only client cannot connect; during connect, an event, stop and reconnect every hub request has the Bearer header (except the DELETE), none has `access_token` or the JWT in its URL, and the Serilog output contains neither the tokens nor `access_token`.
- Real Chromium, web `e2e/s7-longpoll.spec.ts` and mobile `e2e/s7-longpoll.spec.ts`: every request URL recorded across connect, event, dropped connection and reconnect has no `access_token` and no JWT-shaped text; every hub request has `Authorization: Bearer eyJ...`; no hub WebSocket opens.
- Cross-origin (real SignalR JS in a page on http://localhost:9999, API on 127.0.0.1:5080 with Cors__AllowedOrigins): login, negotiate, polls, event delivery and stop all work; the browser sent the Authorization header on negotiate, polls and DELETE; no CORS failure; event reached the page 196 ms after the staff POST. Dev API log had 0 matches for `access_token`. (Chromium needed `--disable-features=LocalNetworkAccessChecks` for loopback to loopback in this harness.)

Cost, measured locally (dev servers, 8 samples each, Playwright)
- Staff PATCH to the mother's /status and to the staff board: median 524 ms, range 520 to 554 ms. Dominated by the existing 500 ms coalescing window; the event itself arrives in about 0.2 s. For reference the existing e2e timings on this run: S5-A7 820 ms (mother, includes test overhead), S5-W1 852 ms and 1103 ms (board), fallback polls unchanged (S5-A8 15.1 s, S5-W2 5.1 s). No latency regression; well inside "a few seconds".
- Idle requests (2 minutes, one open screen): mother and staff pages each made 3 requests: 1 hub poll (the server ends a poll after about 90 s, the client re-polls) and 2 safety refreshes. About 1.5 requests per minute in total, 0.5 per minute from the hub; the WebSocket made none after connecting (plus its keep-alive frames).
- Token expiry: with `Auth__AccessMinutes=1` a staff board stayed live over two expiries: a silent reconnect (new negotiate) at about +61 s and +121 s, no 401 responses, banner stayed connected, and updates after each expiry took 765 ms and 555 ms (so the hub, not the 60 s safety poll, delivered them). The 15 minute close is also covered by the API test S5_connection_is_closed_by_the_server_when_the_access_token_expires, which already ran over long polling.
- Offline, Retry, banners, coalescing, reconnect schedule: unchanged and covered by the existing e2e and unit tests, all passing.

Final counts (fresh DB before each DB suite)
| Suite | Result | Before |
| --- | --- | --- |
| API | 95 passed, 0 failed (3 new in S7LongPollTests.cs) | 92 |
| NuGet audit | clean | clean |
| Web unit | 26 | 26 |
| Web e2e | 62 passed (new s7-longpoll spec) | 61 |
| Mobile unit | 27 | 27 |
| Mobile build:prod and check:prod | OK, 40 files | OK |
| Mobile e2e | 81 passed (new s7-longpoll spec) | 80 |

Notes and decisions
- The unused `wss://<api>` entry was dropped from connect-src (fix round 1): the built CSP is exactly `connect-src 'self' https://<api>`; `check:pages` rejects any ws or wss origin and a tampered policy (wss added, wildcard added) exits 1 in both apps.
- Not verified: behaviour through Render's real proxy (held poll requests, idle timeouts, whether a held request keeps a free instance awake or counts toward a limit) and whether Render logs show only `?id=`; deploy check D12 covers it.
- Long polling costs a held HTTP request per open screen on the single free API instance.

## Long polling fix round 1 (2026-10-18)
- Docs, README and the appsettings comment no longer claim edge logs are token-free: only the clients' URLs and the API's own logs are tested; Render and Cloudflare logs are to be checked after deploy (smoke D12 now includes reading the Render request log for `access_token` and `eyJ`).
- CORS is path-scoped (`DemoApi`: GET, POST, PATCH; `DemoHub`: GET, POST, DELETE). Restored tests: REST preflight lists no DELETE or PUT, hub preflights allow GET, POST, DELETE and not PATCH, and every REST route answers DELETE with 401, 404 or 405 without a Bearer and 404 or 405 with one. The duplicate PUT assert is gone.
- The DELETE exemption is removed from the Bearer assertion in S7LongPollTests, web and mobile s7-longpoll specs: the .NET client's close call carries the Bearer (test passes; the browser client's DELETE had it in the earlier cross-origin trace). The API test also asserts a DELETE was actually made. e2e not re-run by me this round (the lead runs them).
- S5_A6 extended: a token in the query of hub GET, DELETE and POST is refused with 401.
- CSP: `connect-src 'self' https://<api>` only; csp.mjs rejects ws and wss origins; tamper check exits 1 (wss added, wildcard added) in web and mobile; `check:pages` passes in both.
- Counts this round: API 96 passed (95 plus the REST DELETE test), web and mobile unit below.
