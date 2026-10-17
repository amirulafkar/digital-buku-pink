# Brief S6: Tests, backup, FHIR note, README, demo script, freeze
Sources: 03 section 9 (definition of done) and section 10 (week 10); 00-handoff tripwires 3 and 4; 04a FR-01..16 (Must list), NFR-03, 06, 10, 11, 12; brief-S5; results-S5.md; status.md. Fictional data. Show "Prototype, not MOH-approved" in README and on screen. No new features.
## Requirements
- Covers: NFR-11 (backup and restore drill), NFR-12 (design note), NFR-06 (paper fallback doc), NFR-10 and NFR-03 (checks), DoD docs and tests, freeze checklist.
- Must (04a): FR-01, 02, 03, 04, 05, 06, 08, 11, 12, 13, 16. Should: FR-07, FR-09 built; FR-10 cut (S4); FR-14, FR-15 not built (decision 2).
- Not S6: new FR, endpoint, screen, offline queue, native build, load test, scheduler install, estimated wait.
## Backup (NFR-11)
- `db/backup/backup.sh`: `docker compose -f db/docker-compose.yml exec -T postgres pg_dump -Fc -U $POSTGRES_OWNER_USER -d $POSTGRES_DB` to `$BACKUP_DIR` (default `db/backups/`, git-ignored), file `dbp-YYYYMMDD-HHMM.dump`. Non-zero exit if the file is empty.
- `db/backup/restore-drill.sh`: create scratch DB `dbp_restore_drill` (refuse if it equals POSTGRES_DB), pg_restore into it, compare count(*) for every public base table with the source, print the table, drop the scratch DB. Exit 1 on any mismatch.
- Dumps hold password and code hashes: never commit or share. No scheduler is installed. README documents a Task Scheduler or cron line (proposed 02:00 daily), marked "not installed".
- Run the drill once; record date, dump size and counts in docs/work/results-S6.md.
## FHIR note (NFR-12)
- `docs/design/fhir-mapping.md` (new): queue_entry -> Encounter (status map proposed), patient -> Patient, clinic -> Organization, room -> Location, nurse account -> Practitioner, audit_log -> AuditEvent. Use 04c table names. No clinical resources, no endpoint, no code.
## Tests and checks
- S6-A1 NFR-10: Given the app role and owner, When UPDATE, DELETE or TRUNCATE on audit_log, Then each fails. Existing: S1Tests T8, S2Tests (near l.429). Add owner case if missing.
- S6-A2 NFR-10 query: Given clinic_admin, When GET /api/v1/staff/audit, Then only own-clinic rows; nurse and mother are refused per policy. Add test if absent.
- S6-A3 NFR-03: Given a fresh seed, Then every patient.is_demo is true (ck_patient_is_demo), every seeded phone is in the fictional range, and no column name matches ic, nric, address, diagnos, lab, vital, bp or weight. Add to api/Tests/S6Tests.cs.
- S6-A4 DoD: Given the six DoD cases (valid check-in, invalid or expired QR, duplicate, wrong clinic, unauthorised role, downtime), Then each maps to a named passing test in results-S6.md. Any unmapped case is a gap.
- S6-A5 Full suite on fresh DB: zero failures; counts not below S5 baseline (API 65, mobile unit 23, mobile e2e 80, web unit 22, web e2e 61).
- S6-A6 Docs: Given README files, Then they contain "fictional" and "not MOH-approved", no stale text ("every 5 s", "arrives in S5", "(stub)"), and no wait or estimate wording.
- S6-A7 Demo dry run: Given a reset seed, When docs/demo-script.md is followed, Then each step works and no screen shows a wait time.
## Docs
- Root README.md: banner, run steps with Windows caveats (core.autocrlf=true breaks .sh files; `sh` must be on PATH for Playwright; web `npm ci`, mobile `npm install`; reset the DB before e2e; `npm run build:prod` before mobile e2e); NFR-06 paper fallback (content per 04b UF-05i); known limitations.
- Known limitations: offline = banners and retry only; no offline queue; no native build; FR-10 skipped; FR-12 wording placeholder; Malay needs native review; proxy must mask access_token in logs; CSP needs wss origin; no hub rate limit; web refresh token in sessionStorage; mobile tokens in memory; staff board sideways scroll at 200% text; mother fallback poll 15 s; no real-device camera or load test; single hub instance; 429 paths untested; /scan dev paste field (compiled out of prod).
- Fix stale lines: web/README.md ("every 5 s", "arrives in S5", install command); mobile/README.md (install command, poll text); root README "mobile/ (stub)".
- New docs/demo-script.md: seed names from 03 section 8 (Aini, Siti, Dewi); QR check-in, counter check-in, urgent, assign, called view, audit view; failure cases (expired QR, duplicate, wrong clinic, server stopped to paper fallback). Talking points: staff control order, no wait time.
## Freeze (week 10)
- docs/work/freeze-S6.md (new): one row per Must, Should and NFR item: met, partial or cut, with slice evidence (tech-lead verifies against brief-S2..S5). Proposed now: FR-01..06, 08, 11, 13 met; FR-07, FR-09 met; FR-12, FR-16 partial; FR-10 cut; FR-14, FR-15 not built. NFR-01, 05, 09 met; 02, 04, 07, 08 partial; 03, 06, 10, 11, 12 met after S6.
- Post-freeze log in status.md. Red: 3+ post-freeze additions, or any addition without an equal-size replacement from the requirement list (03 section 12; 00-handoff tripwire 3). Must now: 9 of 11 met, 2 partial.
- Tripwire 4 cannot be filled (hours target unset in status.md). Per the handoff rule that is red; first check Sun 18 Oct.
## Files to change
- New: db/backup/backup.sh, db/backup/restore-drill.sh, docs/design/fhir-mapping.md, docs/demo-script.md, docs/work/freeze-S6.md, docs/work/results-S6.md (lead), api/Tests/S6Tests.cs (A1-A3 gaps only).
- Edit: README.md, web/README.md, mobile/README.md, .gitignore (db/backups/), db/.env.example (BACKUP_DIR), docs/work/status.md (lead).
- No app code except tests. A failing test is a bug for tech-lead, not a reason to change spec.
## Full suite (Git Bash, fresh DB, in order)
1. `docker compose -f db/docker-compose.yml up -d`; `CONFIRM_RESET=yes db/seed/reset.sh`
2. `dotnet test api/DigitalBukuPink.slnx`; `dotnet list api/DigitalBukuPink.slnx package --vulnerable --include-transitive`
3. `db/backup/backup.sh`; `db/backup/restore-drill.sh`
4. web: `npm ci`; `npm test`; `npm run e2e`
5. mobile: `npm install`; `npm test`; `npm run build:prod`; `npm run check:prod`; `npm run e2e`
## Out of scope
New features; FR-10, FR-14, FR-15 build; offline queue; native build; load test; real-device sign-off; pilot DB; installing a scheduler; CLAUDE.md edits; MOH wording.
## Decisions for human
1. Freeze anchor: 03 says week 10; 00-handoff says build W4 (2 Nov) to hard stop W9 (13 Dec); S1-S5 already done 14 Oct. Pick the date.
2. FR scope: 03 section 2 lists FR-01..12 only; CLAUDE.md freezes FR-01..16. Confirm FR-14, FR-15 are cut.
3. Set hours target and hosting cap (tripwires 4 and 7).
4. NFR-11 says daily: is a documented, uninstalled schedule enough for the prototype? Retention proposed 7 days.
5. A8 wording (15 s plus request time) or shorten the mother fallback poll.
6. Commands go in README, not CLAUDE.md (human-owned file).
7. FR-12 wording and Malay native review remain pilot blockers.
