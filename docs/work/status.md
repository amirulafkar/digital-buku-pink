# Status (the memory between sessions)

Gate G0: WAIVED. G0 waived: user instruction in chat on 2026-10-11, no reason given.
Current phase: 0 (kits written: interview-guides.md, observation-sheet.md, g0-evidence.md)
Current slice: S4 done (API 55/55, mobile unit 8/8, mobile e2e 63/63, web e2e 30/30; privacy-security no blockers; UX 9.2/10; architect gaps accepted); next: S5 (SignalR, offline states, BM, accessibility polish)
Declared weekly hours target: (fill in)
Monthly hosting cost cap: (fill in)

## Tripwires (update every Sunday)
| Date | Hours logged | Commits | Open tripwires | Notes |
| --- | --- | --- | --- | --- |

## Decisions and model overrides
(Any use of a model above the default must be written here with a reason.)
- 2026-10-11: S1 accepted deviations recorded in docs/work/brief-S1.md. No model overrides.
- Open: weekly hours target and hosting cap still unset; CORS/HSTS decision deferred to proxy setup; rate limiter untested (tests raise the limit).
- 2026-10-11: S2 decisions delegated to lead and recorded at end of docs/work/brief-S2.md (QR token reusable 60 s, re-check-in rules, clinic_admin read-only). Per-user rate limits untested.
- 2026-10-11: S3 UX loop ended at score 9.1/10 (round 6 of 6; limited by pending Malay native review). Pending human approval: 04c audit enum additions activation_issue, activation_revoke. Search moved to POST body (privacy gate).
- 2026-10-11: S3 left for later (non-blocking): no 429 test for rate limiters (tests raise limits); search privacy e2e checks request and page URLs only (add console, history, storage); web/screenshots are git-ignored and show demo activation codes, do not share. Malay strings all need native review (MS_REVIEWED empty by design).
- 2026-10-11: S4 started. Pending human approval before pilot: FR-12 safety notice exact wording (placeholder used), Malay native review.
- 2026-10-11 (resume point): S4 built in mobile/ (uncommitted). UX score 8.6 after round 2; round-2 fixes sent to tech-lead (offline button, form-level errors, theme label, tab bar at 200% text, axe moderate + error states, error screenshots, settings wording, non-tappable status steps). Next: confirm fixes, re-run API/mobile/web tests, UX round 3 (final), architect check vs brief-S4.md, commit S4. FR-10 notifications skipped by design. Then S5.
- 2026-10-11: S4 committed. FR-10 notifications skipped by design (cut order); FR-12 wording is a PLACEHOLDER needing human/MOH approval before any pilot; mobile tokens in memory only (reload requires login); native build and secure storage deferred; mobile/screenshots are git-ignored and come from the dev build.

## S5 licence check (2026-10-11)
`@microsoft/signalr` (web and mobile) and `Microsoft.AspNetCore.SignalR.Client` (API tests): MIT (package.json `"license": "MIT"`, source dotnet/aspnetcore). Installed.
- 2026-10-11 (PAUSED by user during S5): S5 brief written (docs/work/brief-S5.md, decisions appended). tech-lead had started implementing and was stopped mid-work: S5 code in api/, web/, mobile/ is UNCOMMITTED and possibly incomplete. On resume: check git status, re-run all suites (API, web unit+e2e, mobile unit+e2e, check:prod), finish S5, then UX/privacy/architect reviews and commit. Open: native BM reviewer name and date.
