# Status (the memory between sessions)

Gate G0: WAIVED. G0 waived: user instruction in chat on 2026-10-11, no reason given.
Current phase: 0 (kits written: interview-guides.md, observation-sheet.md, g0-evidence.md)
Current slice: S3 done (API 51/51, ng 7/7, e2e 30/30; privacy-security no blockers; architect gaps closed or accepted; UX score 9.1/10); next: S4 (Ionic mother app)
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
