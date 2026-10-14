# Results S5: SignalR live queue, offline states
Date 2026-10-14. Decisions 1-5 approved by the human. Uncommitted.

## Test results (actual runs on this machine)
| Suite | Command | Result |
| --- | --- | --- |
| API | `dotnet test api/DigitalBukuPink.slnx` | 65 passed, 0 failed (was 55; 10 new in api/Tests/S5Tests.cs) |
| Mobile unit | `ng test --watch=false` in mobile/ | 23 passed (was 8) |
| Mobile e2e | `npx playwright test` in mobile/ (fresh DB via reset.sh, prod build present) | 80 passed (was 63; 17 new incl. 2 screenshot runs and the fix-round offline-scan test) |
| Mobile prod check | `npm run check:prod` | OK, no developer paste path in 39 production files |
| Web unit | `ng test --watch=false` in web/ | 22 passed |
| Web e2e | `npx playwright test` in web/ (fresh DB) | 61 passed (7 new in s5.spec.ts, 2 in s5-screenshots) |
| NuGet audit | `dotnet list api/DigitalBukuPink.slnx package --vulnerable --include-transitive` | clean for Api, Data and Tests after SignalR.Client 10.0.12 -> 10.0.13 |

Not run: native builds (out of scope), real-device camera, a load test, a real API process stop (the API is "stopped" by aborting its requests in the browser), real multi-instance hub (single instance only).

## Fix round 1 (lead review, 2026-10-14)
1. NFR-05: scan.ts submit() now refuses to send while `canWrite` is false (guards QR reads and the dev paste path), stops the camera, keeps the token in memory and shows the existing offline line; Try again is disabled offline and sends once back online. Test `S5-fix` in s5-live.spec.ts: zero POSTs offline, one after; it fails without the guard (verified: 1 POST).
2. NFR-07: tab labels use .875rem unclamped; the bar is `auto-fit minmax(4.25rem, 1fr)`, so it is one row at normal text and wraps to two rows at 200% text; labels wrap anywhere instead of clipping. layout.spec.ts now asserts label font scales (28px at 200%), no clipping, no overlap, no sideways overflow at 320 and 375 px, EN and BM. The 200% bar is taller (two rows).
3. Privacy: Tests.csproj SignalR.Client 10.0.13; the vulnerability audit reports no vulnerable packages in Api, Data or Tests (Api resolves no vulnerable SignalR.Common).
4. BM app name is `Digital Buku Pink` in web and mobile i18n; no test expects the old string.
Accepted by lead (not changed): reconnecting banner after first immediate retry fails; A8 15 s; web refresh token in sessionStorage (deviation 3); no hub rate limit; CSP wss origin and reverse-proxy log masking are pre-pilot notes.

## Brief acceptance map
- A1-A6, emit after commit, emit failure, token expiry close, no client-invokable method: api/Tests/S5Tests.cs. A6 also checks the token never reaches the logs.
- A7: mobile s5-live (update in 0.8 s, exactly one refetch, no poll). A8: fallback poll update measured 15.1 s (see gaps). A9, A10, A13, A14 (check-in to confirmation 0.5 s on a 1.6 Mbit/s, 150 ms link): mobile/e2e/s5-live.spec.ts.
- A11 (axe, 44 px, role=status, 200% text, 320 px, both themes, BM and EN, both phone sizes): mobile/e2e/s5-states-a11y.spec.ts and web/e2e/s5.spec.ts (S5-W6).
- A12: key parity in i18n.spec.ts (mobile, web) plus BM-only and EN-only banner checks in e2e.
- Unit: state machine, 60/15/5 s intervals, coalescing, canWrite, retry schedule 0/2/10/30 s, flapping hub does not postpone the poll.
- Screenshots (git-ignored): mobile/screenshots/s5-status-*.png, web/screenshots/s5-board-*.png.

## Deviations and gaps
1. Banner "reconnecting" appears after the first immediate reconnect try fails, not at the instant of a hub close. A normal close (for example token expiry) therefore reconnects silently. Brief wording says "on hub close".
2. A8 "within 15 s": the fallback poll is 15 s, so a change made just after a poll takes about 15 s plus request time (measured 15.08 s). Test allows 16.5 s. Human to confirm the wording or shorten the mother fallback.
3. Web NFR-02 differs: the staff web keeps its S3 refresh token in sessionStorage (accepted in S3). S5 test W4 checks the live connection adds nothing and the stored value is opaque, not a JWT. Mobile keeps both tokens in memory only (A13 passes as written).
4. At 200% root text the staff board already scrolls sideways with no banner (S3 layout, found now, not caused by S5). The banner itself is not clipped. Fix is for a later web accessibility polish slice.
5. "API stopped" in A9 is simulated by aborting requests in the browser, as S4 did.
6. FR-12 notice needed no change in notices.ts: it already renders on every signed-in screen, so it shows in the new banner states. Verified in A10.
7. Existing tests changed because the offline copy changed and the 5 s poll now only runs without the hub: web S3-E9, Q5, screenshots offline state; mobile S4-A6. They now block the hub or trigger a refetch through a staff change.
8. mobile/package-lock.json also gained a few optional peer entries (@emnapi) because it was re-synced with npm 8.19 when @microsoft/signalr was added. web/package-lock.json changed only for @microsoft/signalr. Both lock files are included in the change set; the lead may prefer to regenerate the mobile one.
9. Vite dev proxy needs `ws: true` for /hubs (set in both proxy.conf.json). Production reverse proxy must forward WebSocket upgrades and must not log query strings for /hubs/queue (the API itself logs no URLs: Microsoft.AspNetCore is Warning).

## Needs human decision
- Decision 6 still open: Malay native review of all new strings (state.offline, state.offline.nodata, state.live.paused in both apps) and FR-12 wording (placeholder).
- Gap 1 and gap 2 wording.
- The dev-only paste field on /scan is not gated by canWrite (it is compiled out of production); the camera path is.
