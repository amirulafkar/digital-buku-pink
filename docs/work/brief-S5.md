# Brief S5: SignalR live updates, offline states, BM completeness, accessibility polish
Sources: 03 (slice 9), 04a FR-05, FR-08, FR-16, NFR-05..09; 04b UF-05d, UF-05e, UF-05i; 00-handoff tripwires 3, 4; S1-S4 briefs; status.md. Prototype, not MOH-approved. Synthetic data only.

## Requirements
- Covered: FR-05 (live status within a few seconds), FR-16 (BM/EN on new strings), NFR-05 (offline state), NFR-06 (paper fallback message), NFR-07 (a11y polish), NFR-08 (BM completeness), NFR-09 (live fails, polling takes over; small payloads).
- Regression only: FR-02 (wrong clinic, UF-05d), FR-12 (notice stays on every post-check-in screen).
- Not S5: FR-08 (REST search, unchanged), FR-10, FR-09.
- Cut order if late: FR-10, FR-09, FR-07, web a11y polish. SignalR and offline states are not on the cut list.

## SignalR design (api/)
- Hub path: `/hubs/queue`. Hub has NO client-to-server methods. Server pushes only.
- Auth: JWT bearer; for `/hubs` requests read `access_token` from the query string (WebSocket limit). Accept it only on the hub path. Redact query strings in all request logs and exceptions; a test asserts the token never appears in logs.
- OnConnectedAsync groups, from JWT claims only (never from client input):
  - Patient: `patient:{userId}` only. Patient cannot join any `clinic:` group (refused).
  - Nurse and clinic_admin (read-only): `clinic:{clinicId}`.
- Publish: after the queue state change is committed, in the same service method as the audit_log write. If publish fails, log it; polling covers it. No event without a committed change.
- Payload (max 1 KB): `{ "type": "queue.changed", "queueEntryId": "<guid>|null", "version": <int>, "updatedAt": "<iso>" }`. Patient events carry her queueEntryId only. No names, phones, room detail, waiting time, position or ordering.
- Clients refetch via existing REST: patient `GET /api/v1/queue/me`; staff `GET /api/v1/staff/queue`. Clients drop events with version <= last seen (no double updates).
- Limits: max 3 concurrent connections per user (proposed); negotiate rate limit per IP (reuse limiter pattern); MaximumReceiveMessageSize 1 KB; KeepAliveInterval 15 s; ClientTimeoutInterval 30 s. Single instance only (in-memory groups); Redis backplane is out of scope.
- No new state transitions and no new audit enum values. Transitions stay staff-only through PATCH /staff/queue/{id}.

## Client integration (web/, mobile/)
- Package: `@microsoft/signalr` (licence check: MIT expected; confirm in package LICENSE before install; record in status.md).
- Lifecycle: connect after login; stop on logout (logout disconnects before clearing tokens); reconnect uses the current access token (refresh via /auth/refresh first if near expiry).
- Automatic reconnect with backoff (0, 2, 5, 10, 30 s, then 30 s cap). Polling (existing core/poll.ts, mobile Poller at 15 s) keeps running while disconnected; on reconnect, one immediate refetch.
- Visible state, plain language (EN and MS): "Live" / "Reconnecting..." / "Live updates are off. Refreshing every 15 seconds."

## Offline states (NFR-05, NFR-06, UF-05e, UF-05i)
- Staff web: banner when API or hub is down: "System is down. Use the paper queue and re-key entries later." (link to paper fallback text in README).
- Mother app: offline banner with last known status and "Go to the counter" copy (UF-05e). Check-in retries stay idempotent (existing IdempotencyKey, FR-13).

## BM completeness (NFR-08, FR-16)
- Add a unit test in web and mobile: every EN key has an MS key (fails listing missing keys). Fill any gaps found by the test.
- Per-key native-review flag stays: MS_REVIEWED stays empty; msUnreviewed() must still equal all keys.

## Accessibility polish (NFR-07)
- One polite live region announces only changes to the patient's own status or the nurse's selected entry. No announcement for unchanged polls. No announce-storm.
- Focus: visible focus, return focus after dialogs close, focus not obscured (WCAG 2.2 2.4.11).
- `prefers-reduced-motion` disables non-essential animation.
- 200% text and 320 CSS px reflow without loss (1.4.4, 1.4.10).

## Acceptance tests (Given / When / Then)
- A1 (FR-05): Given a nurse in clinic A and a patient in clinic A with an open status screen, When the nurse calls the patient, Then her screen updates within 2 s with no status poll requests in that window (Playwright; polling set to 60 s for the test).
- A2 (NFR-09): Given the hub route is aborted, When the status screen is open, Then the banner reads "Live updates are off" and polling updates within 15 s.
- A3 (UF-05d, FR-02): Given a nurse in clinic B, When clinic A's queue changes, Then clinic B receives zero events (API test and Playwright).
- A4: Given a patient token, When she invokes JoinGroup for clinic:{id}, Then the join is refused (API).
- A5: Given an expired or invalid access_token, When connecting to /hubs, Then the connection fails and no group is joined (API).
- A6 (NFR-05): Given the browser is offline, When the mother opens status, Then the offline copy shows last known status (Playwright).
- A7 (NFR-08): Given EN and MS dictionaries, When the test runs, Then every EN key has an MS key (unit, web and mobile).
- A8 (NFR-07): Given reduced-motion is set, When status changes, Then no animation runs; axe has no serious or critical issues on changed screens.
- A9: Given a reconnect after a drop, When events arrive out of order or duplicated, Then the client renders only the highest version (unit).
- A10: Given 200 concurrent clients on one clinic, When one status change is made, Then p95 delivery is under 2 s and no connection leaks (load script).

## Out of scope
Push notifications and FR-10 inbox (cut); native builds and store; multi-instance backplane or Redis (single-instance limit); estimated waiting time (never); new queue states or ordering changes; FR-12 wording change (human approval pending); tripwire-3 freeze changes.

## Open questions for the human
1. Max concurrent hub connections per user (proposed 3)?
2. Is single-instance hosting acceptable for the pilot?
3. Clinic_admin may join the clinic group read-only (proposed yes)?
4. Who is the Malay native reviewer, and when? MS_REVIEWED stays empty until then.
## Human-delegated decisions (lead, 2026-10-11; human may overrule)
- Max 3 hub connections per user. Single-instance hosting is acceptable for the prototype and pilot (in-memory groups; scale-out needs a backplane later). clinic_admin may join the clinic group read-only.
- @microsoft/signalr licence must be confirmed MIT before install; if not, fall back to polling-only and report.
- OPEN for the human: name the native Bahasa Malaysia reviewer and a date (all MS strings still flagged needs native review).
