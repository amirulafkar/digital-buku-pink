# Demo script (about 15 minutes)

Digital Buku Pink is a prototype for demonstration. It is not MOH-approved. Every name, phone number and code in this demo is fictional. Do not show it as a real clinic system.

Dry-run on 2026-10-17 against the dev servers on a freshly reset database. Each step below worked as written, except the gaps listed in "Known demo gaps" at the end.

## Before you start
1. Postgres up: `docker compose -f db/docker-compose.yml up -d`.
2. Fresh data: `CONFIRM_RESET=yes bash db/seed/reset.sh` (prints four activation codes once; you will issue new ones in step 1, so ignore them).
3. Three terminals in Git Bash: `sh db/dev-api.sh` (API on 5080), `cd web && npm start` (staff, http://127.0.0.1:4200), `cd mobile && npm start` (mother app, http://127.0.0.1:4300; open it in a browser at phone size, about 375 x 812).
4. Staff accounts (username, password is `SEED_STAFF_PASSWORD` in your git-ignored `db/.env`): `aini.demo` (nurse), `faridah.demo` (clinic admin, read-only), `rina.demo` (nurse at the other clinic).
5. Mothers (fictional, KK Demo Satu): Siti (0100000001), Dewi (0100000002), Mei Ling (0100000003), Priya (0100000004). Nadia (0100000005) belongs to the other clinic, KK Demo Dua.
6. The mother app dev build has a "paste a QR token" field on the Scan screen. The production build does not (checked by `npm run check:prod`). The staff web has no screen that shows the clinic QR yet, so the demo gets the token from the API (snippet in step 2).

## Say first (talking points)
- Staff always control the queue. The app never reorders, never decides urgency and never assigns a room by itself.
- There is no waiting time anywhere. The mother app says so in words: "Staff decide the order. This app does not estimate waiting time." (that sentence is the only place the phrase appears).
- Bahasa Malaysia and English on every screen. The Malay text still needs a native speaker's review.
- The safety notice on every mother screen after check-in is a placeholder. MOH must approve its wording before any real use.

## 1. Nurse issues activation codes (FR-01)
1. Staff web, sign in as `aini.demo`. The board is empty. The left panel says it is a prototype, not approved by the Ministry of Health, with fictional data.
2. Open Codes. Search "Siti", choose Issue code. The code appears once, with Copy. Note it. Close the dialog.
3. Repeat for "Dewi". The list shows both as unused, valid 7 days, one use. Reload: the code text is not shown again.

## 2. Siti activates and checks in by QR (FR-01, FR-02, FR-03, FR-12, FR-13)
1. Mother app, Activate. Enter Siti's code, phone 0100000001, and a password of at least 8 characters. You land on Log in. Sign in. Home shows the greeting and today's appointment, read-only.
2. Get a clinic QR token (it lives 60 seconds and holds no personal data). In Git Bash from the repo root:
   ```sh
   set -a; . db/.env; set +a
   T=$(curl -s -X POST http://127.0.0.1:5080/api/v1/auth/login -H 'Content-Type: application/json' -d "{\"identifier\":\"aini.demo\",\"password\":\"$SEED_STAFF_PASSWORD\"}" | sed 's/.*"accessToken":"\([^"]*\)".*/\1/')
   curl -s -X POST http://127.0.0.1:5080/api/v1/staff/qr-tokens -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{}'
   ```
   Copy the `token` value.
3. Mother app, Scan, paste the token, submit. Confirmation shows "Your number is A001". The pink safety notice is visible.
4. Open Status. Siti is Waiting. Under the steps there is no time, only the line that staff decide the order.

## 3. Counter check-in for Dewi, who has no phone (FR-04)
1. Staff web, Patients, search "Dewi", choose Check in. A queue number appears (A002, because she has an appointment today; the earlier plan said W003).
2. For a person with no record at all, use Walk-in (top bar or the Patients form) with a name: she gets a W number. Optional.
3. Queue: the rows are in check-in order, Siti then Dewi. There is no sort control and no "next patient" button.

## 4. Urgent and assign, staff only (FR-05, FR-06, FR-07)
1. On Dewi's row choose Assign. Pick Room 1, switch Urgent on. Save is blocked until a reason is chosen (Staff judgement, Accessibility need, Family request, Other). Choose one, Save.
2. The row shows "Urgent, set by staff". Point out that Dewi's row did not move: urgency is a label, order is still check-in order.
3. Assign Siti to Room 2. Her status stays Waiting: assigning never changes status.

## 5. Called view for the mother (FR-05)
1. Staff web, Siti's row, Call. Within a few seconds Siti's Status shows Called, "Go to Bilik 2." and the safety notice, with no page reload.
2. In room, then Done change the steps the same way. Switch the mother app to BM in Settings: every label follows.

## 6. Audit view (FR-11, NFR-10)
The staff web has no audit screen yet. Show it through the API as the clinic admin (same snippet, `faridah.demo`):
```sh
TA=$(curl -s -X POST http://127.0.0.1:5080/api/v1/auth/login -H 'Content-Type: application/json' -d "{\"identifier\":\"faridah.demo\",\"password\":\"$SEED_STAFF_PASSWORD\"}" | sed 's/.*"accessToken":"\([^"]*\)".*/\1/')
curl -s "http://127.0.0.1:5080/api/v1/staff/audit?limit=20" -H "Authorization: Bearer $TA"
```
Rows show who, what, when, with ids and codes only: no names, phones or token values. The same call as `aini.demo` returns 403. The database refuses UPDATE, DELETE and TRUNCATE on `audit_log` (tests S1 T8 and S6A1).

## 7. Failure cases
1. Expired QR: get a token (step 2.2), wait 61 seconds, paste it as Priya (activate her first with a code from the Codes screen). The app says "This code has expired. Scan the current one." Nothing is created.
2. Duplicate check-in: Siti scans again with a fresh token. She gets A001 again and the board still has one row for her.
3. Wrong clinic: activate Nadia (code from `rina.demo`), sign in as Nadia, paste a KK Demo Satu token. The app says "This code is for another clinic. Ask staff." Nothing is created.
4. Server stopped: press Ctrl+C in the API terminal. Within about 20 seconds both the staff board and the mother Status show "No connection. Showing the last update from HH:MM." with a Retry button; the mother's scan is disabled and the safety notice stays. Restart the API and press Retry: the banner clears. Then explain the paper fallback in the README: the clinic runs the paper queue, and entries are re-keyed afterwards if wanted.
5. Unauthorised role: sign in as `faridah.demo` (admin). The board is read-only, no Call or Assign buttons, and she cannot open the Patients page.

## Close
Remind the audience what is not built: FR-10 notifications, FR-14 (reopen a missed entry), FR-15 (staff password reset), an offline queue, a native app, and the staff QR display and audit screens. See "Known limitations" in the root README.

## Known demo gaps (found in the dry run)
- No staff screen shows the rotating QR, and no staff screen shows the audit log. Steps 2.2 and 6 use the API. Adding screens is new scope and needs an equal-size replacement.
- Step 7.4 (restart the API, press Retry, banner clears) was not run by hand in the dry run; it is covered by the automated test S5-A9.
- Dewi's counter check-in is A002, not W003 as in the scope document.
- Room names differ by app: the staff web shows "Room 2", the mother app shows the stored name "Bilik 2".
- Playwright, not a person, ran the dry run; the camera path was not tried on a real phone.
