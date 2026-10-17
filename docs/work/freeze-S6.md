# Freeze checklist (S6)

Scope freeze date: 2026-10-14 (human decision, recorded in status.md). After this date a new feature must replace one of equal size from the requirement list. Verified on 2026-10-17 against briefs S1 to S5, results-S5.md and the tests named below. The brief's proposed table was checked row by row; two rows differ from the proposal (FR-03 and NFR-11, both marked CHANGED).

Status words: met, partial, cut, not built. Evidence names are tests or briefs; "API" tests are in api/Tests, "web" in web/e2e, "mobile" in mobile/e2e.

## Functional requirements (04a)

| ID | Priority | Status | Evidence and note |
| --- | --- | --- | --- |
| FR-01 | Must | met | API S1 T1, T2, T2b (single use, expiry, hash only); staff issue UI web S3-E6 (brief-S3); mother activation mobile S4-A1 (brief-S4). |
| FR-02 | Must | met | API S2T3 (403 wrong_clinic, nothing created, refusal audited); mobile S4-A4b (wrong-clinic copy). |
| FR-03 | Must | partial (CHANGED, proposed: met) | API S2T1, S2T2 (token 60 s, hash only, shared per clinic, expired or unknown 400); mobile S4-A4 on the dev paste path. Gaps: no staff screen shows the rotating QR (brief-S3 listed none; the token comes from POST /staff/qr-tokens only); the camera path (jsQR) has never run on a real device. |
| FR-04 | Must | met | API S2T5 (walk-in W number, patient forbidden); web S3-E2 (counter check-in appears on the board). |
| FR-05 | Must | met | API S2T6 (state machine, 409 on illegal move); web S3-E3; S5 live updates API S5_A1, mobile S5-A7, S5-A8. Fallback poll for the mother is 15 s plus request time (human decision: wording accepted, no code change). |
| FR-06 | Must | met | API S2T7 (room rules, order unchanged); web S3-E4. |
| FR-07 | Should | met | API S3 urgent reason-code test; web S3-E5; staff only, never system-set (S5_A4: urgent never reaches the mother). |
| FR-08 | Must | met | web S3-E7 and API S3 search tests (POST body, minimal profile, clinic scoped, no query text in audit). |
| FR-09 | Should | met | mobile S4-A3 (read-only next appointment); API S4 next-appointment test. |
| FR-10 | Should | cut | Cut first by design in S4 (no Inbox, no GET /notifications, no notification table). |
| FR-11 | Must | met | API S1 T7, S2T9 (who, what, when, ip, no personal data); S2 Roles test and S6A2 (admin read, clinic scoped). Note: 03 section 4 lists an audit viewer screen on the web; none was built (brief-S3 Open Question 1, kept out), the log is read through GET /staff/audit. |
| FR-12 | Must | partial | One shared notice on every signed-in mobile screen in BM and EN (mobile S4-A7, S5-A10). The wording is a PLACEHOLDER and needs MOH approval before any pilot. |
| FR-13 | Must | met | API S2T4, S2T4d; mobile S4-A5 (lost response retried with the same key, one row). |
| FR-14 | Should | cut, not built (human decision 2026-10-14) | Reopen of a missed entry was excluded in S2 and S3. Marking missed with a reason exists as part of FR-05 (API S2T4c). |
| FR-15 | Should | cut, not built (human decision 2026-10-14) | No password-reset endpoint or screen in S1 to S5. |
| FR-16 | Must | partial | Language switch and key parity on both apps (unit i18n.spec in mobile and web, web S3-E1, brief S5-A12). All Malay strings are unreviewed by a native speaker (marked per key). |

Must items: 11. Met 8 (FR-01, 02, 04, 05, 06, 08, 11, 13). Partial 3 (FR-03, 12, 16). CHANGED: the brief proposed 9 met, 2 partial. Should items: FR-07 and FR-09 met; FR-10 cut; FR-14 and FR-15 cut (not built).

## Non-functional requirements (04a)

| ID | Status | Evidence and note |
| --- | --- | --- |
| NFR-01 | met | API S1 T6, S2T8 (other clinic 404), S4 queue-me own row, S6A2 (audit own clinic); S5_A2 hub clinic groups. |
| NFR-02 | partial | Hashing, 15 minute access JWT, refresh rotation, revocation and reuse detection tested (API S1 T3, T4, T4c). TLS is not configured here (reverse proxy later). The staff web keeps its refresh token in sessionStorage (accepted in S3); the mother app keeps both tokens in memory. |
| NFR-03 | met after S6 | API S1 T9 and S6A3 (every patient is_demo, constraint ck_patient_is_demo, seeded phones 010-000-0001 to 0005, no identity or clinical column names). |
| NFR-04 | partial | mobile S5-A14: check-in to confirmation about 0.5 s on a 1.6 Mbit/s, 150 ms link. Local machine only; no real device, no web timing, no load test. |
| NFR-05 | met | API S2T4; mobile S4-A5, S4-A6, S5-A9 and the S5 fix (no write while offline, one POST after reconnect). Offline means banners and retry only; there is no offline queue (decision). |
| NFR-06 | met after S6 | Paper fallback described in the root README (content per 04b UF-05i). |
| NFR-07 | partial | axe zero serious violations, 44 px targets, 200% text and 320 px reflow on the mobile screens and the staff board (S3-E11, S5-A11). No manual screen-reader pass. The staff board scrolls sideways at 200% root text (pre-existing). |
| NFR-08 | partial | Every screen has BM and EN (key parity tests). BM needs a native review. |
| NFR-09 | met | S5-A8 (hub blocked, polling takes over, banner shows); small JSON payloads, no images. Single hub instance only. |
| NFR-10 | met | API S1 T8 (app role and owner, UPDATE, DELETE, TRUNCATE all refused), S2T10, S6A1 (single-row attempts, two guard triggers, content unchanged), S6A2 (admin query). |
| NFR-11 | partial (CHANGED, proposed: met) | backup.sh and restore-drill.sh built; one restore drill run and recorded in results-S6.md. The spec says daily: the schedule is documented in the README, not installed (human decision 2026-10-14). |
| NFR-12 | met after S6 | docs/design/fhir-mapping.md (design note only; no code, no endpoint). |

## Tripwires (00-handoff)
- Tripwire 3 (scope): no feature added since the freeze date. S6 adds scripts, docs and tests only. Green.
- Tripwire 4 (hours): the weekly hours target is still unset in status.md, so it cannot be filled. Red per the handoff rule. First Sunday check 2026-10-18.
- Tripwire 7 (hosting cap): unset. Red until filled.

## Post-freeze additions
None recorded. Log any addition in status.md together with the item of equal size it replaces.

## Not built, for the record
FR-10, FR-14, FR-15; offline write queue; native build; staff QR display screen; staff audit viewer screen; real-device camera test; load test; scheduler install.
