# Results S6: tests, backup, FHIR note, README, demo script, freeze
Dates: first pass 2026-10-14 (interrupted), completed 2026-10-17. Nothing committed. Fictional data only.

## Test results (actual runs, Git Bash, fresh DB via reset.sh before each run)
| Suite | Command | Result | S5 baseline |
| --- | --- | --- | --- |
| API | `dotnet test api/DigitalBukuPink.slnx` | 69 passed, 0 failed (4 new in api/Tests/S6Tests.cs) | 65 |
| NuGet audit | `dotnet list api/DigitalBukuPink.slnx package --vulnerable --include-transitive` | no vulnerable packages in Api, Data, Tests | clean |
| Backup and drill | `db/backup/backup.sh`, `db/backup/restore-drill.sh` | passed, see below | new |
| Web unit | `npm ci`, then `npm test -- --watch=false` | 22 passed | 22 |
| Web e2e | `npm run e2e` (fresh DB) | 61 passed, 0 failed | 61 |
| Mobile unit | `npm install`, then `npm test -- --watch=false` | 23 passed | 23 |
| Mobile build | `npm run build:prod` | exit 0 | |
| Mobile prod check | `npm run check:prod` | OK, 39 production files, no developer paste path | OK |
| Mobile e2e | `npm run e2e` (fresh DB, prod build present) | 80 passed, 0 failed | 80 |

Order deviation: the brief runs backup and drill right after the API tests. They ran after the demo dry run instead, so the drill had real rows (queue, audit) to compare. The dev DB was reset again before each e2e suite. Mobile package-lock.json did not change (`git status` clean for both lock files).

## Restore drill (NFR-11), run once
- Date: 2026-10-17 18:28 (local, UTC+8). Dump: `db/backups/dbp-20261017-1828.dump`, 43,947 bytes (git-ignored; holds password, code, refresh-token and QR-token hashes and audit IPs; not shared, deleted after the run). The lead re-ran backup and drill the same day to verify (dump `dbp-20261017-1847.dump`, 79,452 bytes, 12 of 12 tables match, scratch database dropped) and deleted that dump too.
- Result: passed, 12 of 12 tables match; scratch database `dbp_restore_drill` dropped.

| table | source | restored |
| --- | --- | --- |
| __EFMigrationsHistory | 3 | 3 |
| activation_code | 8 | 8 |
| appointment | 4 | 4 |
| audit_log | 38 | 38 |
| clinic | 2 | 2 |
| patient | 5 | 5 |
| qr_token | 4 | 4 |
| queue_entry | 2 | 2 |
| refresh_token | 12 | 12 |
| room | 3 | 3 |
| staff | 3 | 3 |
| user_account | 8 | 8 |

Extra check (2026-10-14, before the pause): after adding one qr_token row to the source, the drill against the older dump printed MISMATCH, exited 1 and still dropped the scratch database. The empty-dump exit in backup.sh was not exercised.

## New API tests (api/Tests/S6Tests.cs)
- S6-A1: S1 T8 already covered app role and owner for UPDATE, DELETE and TRUNCATE (42501), so no owner case was missing. Added `S6A1_Audit_rows_survive_every_update_delete_and_truncate_attempt_unchanged`: the two guard triggers exist, single-row UPDATE and DELETE are refused for both roles, count and content digest unchanged.
- S6-A2: `S6A2_Audit_read_is_own_clinic_only_and_refused_for_nurse_mother_and_anonymous`: S2 Roles test did not check clinic scoping. Admin A sees clinic A markers and not clinic B's, and the reverse; no actor from the other clinic; limit capped at 200; nurses (both clinics), mother 403, anonymous 401; no write verbs.
- S6-A3: `S6A3_Seed_data_is_fictional_and_no_column_is_identity_or_clinical` plus `S6A3_column_name_detector_catches_clinical_and_identity_names_but_not_clinic_id`. Whole-word matching on column names (ic, nric, bp, lab, address, diagnos, vital, weight and others), because a plain "ic" match would flag `clinic_id`.

## S6-A4 definition-of-done map (03 section 9)
| Case | Named passing tests |
| --- | --- |
| Valid check-in | API `S2T1_Valid_scan_checks_in_and_token_is_shared_and_stored_hashed`; mobile S4-A4 (flows.spec.ts); web S3-E2 (staff check-in) |
| Invalid or expired QR | API `S2T2_Expired_or_unknown_token_is_400_and_creates_nothing`, `S2T2c_Oversized_token_is_rejected_and_unknown_tokens_are_not_audited`; mobile S4-A4 (expired copy) |
| Duplicate check-in | API `S2T4_Repeat_check_in_returns_same_entry`, `S2T4d_Retry_after_token_expiry_returns_existing_entry`, `Parallel_check_ins_get_unique_queue_numbers`; mobile S4-A5 |
| Wrong clinic | API `S2T3_Wrong_clinic_is_403_with_refusal_audit`, `S2T8_Other_clinic_cannot_see_or_change_entries`, `S6A2_...`; mobile S4-A4b |
| Unauthorised role | API `S2T5_Staff_walk_in_gets_W_number_and_patient_is_forbidden`, `Roles_admin_is_read_only_and_audit_is_admin_only`, `S6A2_...`, `T6_Clinic_scoping_repository_and_routes`; web S3-E8 |
| Downtime | web S3-E9 and S5-W3; mobile S4-A6 and S5-A9 (offline banner, writes and scan disabled, last status kept, recovery); API `S5_emit_failure_keeps_the_201_and_the_state_change_and_is_logged` |

Gap in A4: every downtime test simulates the API being down by aborting browser requests. No automated test stops the real API process. One manual stop of the real API process was done in the dry run (below).

## S6-A6 README check
Searched README.md, web/README.md, mobile/README.md. All three contain "fictional" and "not MOH-approved". No match for "every 5 s", "arrives in S5", "(stub)", "legacy-peer-deps", "estimat" or "wait" (the README wording says "no time prediction of any kind"). The demo script quotes the app's own sentence "This app does not estimate waiting time."

## S6-A7 demo dry run (2026-10-17, scripted with Playwright, dev servers, reset seed)
Verified working: nurse issues codes (shown once, correct format); Siti activates, logs in, home shows appointment; clinic token via the API then pasted into the dev Scan field gives A001 with the safety notice; Dewi counter check-in gives A002; urgent needs a reason (options Staff judgement, Accessibility need, Family request, Other) and shows "Urgent, set by staff" while order is unchanged; assign Room 1 and Room 2 leaves status unchanged; Call makes Siti's status show Called and "Go to Bilik 2." without reload; BM switch; audit via API as clinic admin (23 rows, actions login_success, status, assign, urgent, token_refresh, checkin, search, qr_issue, activate, activation_issue, activation_revoke) and 403 for the nurse; after 62 s an old token shows the expired copy; a second scan returns A001 with one row; Nadia (other clinic) gets the wrong-clinic copy; the real API process was stopped and both apps showed "No connection. Showing the last update from HH:MM." with Retry, the notice still visible. The curl snippets in the script were run separately and worked. Text check on 9 screens found no waiting-time or estimate wording; the only match was the app's own negative sentence.
Not verified: camera scan on a real phone; restart-and-Retry recovery by hand (covered by S5-A9).

## Deviations and gaps for the lead
1. FR-03 marked partial in the freeze (no staff QR display screen; camera never on a device). NFR-11 marked partial (daily schedule not installed). Brief proposed met for both. Must items: 8 met, 3 partial.
2. The demo scenario in 03 section 8 shows Dewi as W003; counter check-in of a known patient gives an A number (A002). Only a name with no record gets W.
3. Room names differ: staff web "Room 2", mother app "Bilik 2".
4. Seed activation codes expire 7 days after reset; the demo issues new ones.
5. Staff web has no QR display and no audit viewer (03 section 4 lists the audit viewer). New screens would need an equal-size replacement.
