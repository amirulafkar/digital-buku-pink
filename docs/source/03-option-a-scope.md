# Digital Buku Pink — Option A MVP Scope (Final)

Date: 2026-10-10. Source: Claude Doc "Option A MVP Scope (Final)", https://claude.ai/code/artifact/4035792c-ea5d-4c47-8105-50412d4bd936

The MVP is a fictional-data prototype that proves one thing: a mother can check in on her phone, and a nurse can see her arrival and assign her to a room from a web dashboard, with staff always in control. Nothing else is in scope.

## 1. Scope statement and boundaries

- **Goal:** demonstrate connected check-in, queue status and staff-controlled assignment between an Ionic mobile app and an Angular nurse dashboard on one C# API.
- **Data:** fictional patients and synthetic appointments only. No real patient, no real clinic, no real MOH integration.
- **Claims:** never describe the prototype as official pregnancy registration, MOH-approved, or a Buku Pink replacement.
- **Clinical content:** none stored or displayed, except one fixed safety notice (FR-12) whose wording must later be approved by MOH.
- **Basis:** requirement IDs match Section 16 of the validation report; the prototype is a hypothesis to test with nurses, not proof of need.

## 2. In scope (frozen)

| ID | Feature | App | MoSCoW |
| --- | --- | --- | --- |
| FR-01 | Account activation with a one-time code issued by staff (simulated) | Mobile, web | Must |
| FR-02 | Check the fictional patient is registered at this clinic | API | Must |
| FR-03 | QR check-in with rotating, short-lived token; no personal data in the QR | Mobile, API | Must |
| FR-04 | Assisted check-in by staff (no phone, walk-in) into the same queue | Web | Must |
| FR-05 | Queue board with live status: waiting, called, in room, completed, missed | Web, mobile | Must |
| FR-06 | Staff assign room, nurse or service; software never reorders on its own | Web | Must |
| FR-07 | Urgent flag set by staff with a reason | Web | Should |
| FR-08 | Patient search and minimal profile (display name, clinic, appointment) | Web | Must |
| FR-09 | Next appointment shown read-only | Mobile | Should |
| FR-10 | Simulated status notifications, status text only | Mobile | Should |
| FR-11 | Audit log of logins, check-ins, assignments, reorders, searches | API, web | Must |
| FR-12 | Permanent notice: tell staff immediately or go to hospital if worried | Mobile | Must |
| NFR-01 to NFR-08 | Roles and clinic scoping, encryption in transit, low bandwidth, Bahasa Malaysia and English, accessibility target, error handling, backups, paper fallback | All | Must or Should as listed in the report |

Downscoped if time runs short, in this order: FR-10, FR-09, FR-07, then web accessibility polish. Must items are never cut.

## 3. Out of scope (won't build)

- Real or realistic patient data; any real clinic, CCMS or MySejahtera connection
- Clinical values, risk colour codes, antenatal record fields, uploads or scans of Buku Pink
- Fetal movement or kick chart tools, and any health advice text beyond FR-12
- Online booking, rescheduling, missed-appointment penalties, estimated waiting time
- Automatic routing, priority scoring or room suggestions
- Caregiver access, payments, push services beyond a simple demo, analytics dashboards, multi-clinic administration

## 4. Screens

| App | Screens |
| --- | --- |
| Ionic mobile (mother) | Activate account, log in, home (next appointment, check-in button, safety notice), scan QR, check-in confirmation with queue number, live status, notifications, language and privacy settings |
| Angular web (staff) | Log in, queue board, manual check-in, patient search and minimal profile, assign room or nurse, urgent flag dialog, activation code generator, audit log viewer |

## 5. Technology stack (final)

| Layer | Choice |
| --- | --- |
| Web | Angular (current stable), Angular Material, PWA offline banner |
| Mobile | Ionic with Angular and Capacitor (camera for QR scanning, secure storage) |
| API | ASP.NET Core Web API (C#), OpenAPI docs, SignalR for live queue |
| Database | PostgreSQL with Entity Framework Core migrations |
| Identity | ASP.NET Core Identity, JWT access and refresh tokens, roles: patient, nurse, clinic admin |
| Logging and tests | Serilog; xUnit; Playwright for web; seed script for fictional data |
| Hosting | Docker Compose on your own PC; no paid services (see handoff: proposal to use a cheap VPS instead) |

## 6. Minimal data model

Clinic, Staff, UserAccount, Patient (fictional display name, phone, language), Appointment (date, type, clinic), QueueEntry (queue number, status, room, urgent flag, timestamps), Room, QrToken (clinic, expiry), ActivationCode, Notification (status text), AuditLog (append-only). Not stored: IC number, address, diagnoses, clinical values, risk colour. Full schema: `04c-database-design.md`.

## 7. MVP API

| Endpoint | Purpose |
| --- | --- |
| POST /api/v1/auth/login, /activate, /refresh | Authentication and activation |
| POST /api/v1/staff/patients/{id}/activation-codes | Staff issue a one-time code |
| GET /api/v1/appointments/next | Mother's next appointment |
| POST /api/v1/checkins | QR check-in with idempotency key |
| GET /api/v1/queue/me | Mother's live status |
| GET /api/v1/staff/queue | Queue board |
| POST /api/v1/staff/checkins | Manual or walk-in check-in |
| PATCH /api/v1/staff/queue/{id} | Status, room, urgent flag with reason |
| GET /api/v1/staff/patients?q= | Search with minimal profile |
| GET /api/v1/staff/audit | Audit log (admin) |

No endpoints for clinical records or fetal movement.

## 8. Demonstration scenario (fictional)

1. Nurse Aini (demo) issues activation codes for "Siti (demo)" and "Dewi (demo)".
2. Siti activates her account, scans the rotating clinic QR and receives queue number A014.
3. Dewi has no phone; Aini checks her in at the counter as W003.
4. Aini marks Dewi urgent with a reason, assigns her to Room 1, then assigns Siti to Room 2.
5. Siti's app changes to "called, Room 2"; the audit log shows each action.
6. Show failure cases: expired QR, duplicate check-in, wrong clinic, server stopped (paper fallback).

## 9. Definition of done

| Area | Done when |
| --- | --- |
| Features | All Must items work end to end in the demo scenario |
| Tests | Valid check-in, invalid or expired QR, duplicate check-in, wrong clinic, unauthorised role access, and downtime cases all pass |
| Safety | FR-12 is visible on every post-check-in screen; no clinical data exists in the database; no estimated waiting time anywhere |
| Language | Every screen in Bahasa Malaysia and English |
| Docs | README stating fictional-data-only and not-approved status; demo script; known limitations list |

## 10. Timeline (solo, about 10 hours a week; assumption)

| Weeks | Work |
| --- | --- |
| 1-2 | Repository, database, authentication, roles, seed data |
| 3-4 | Check-in, QR token, queue endpoints, audit log |
| 5-6 | Angular queue board, assignment, search, activation codes |
| 7-8 | Ionic app: activation, scan, status, notifications |
| 9 | SignalR, offline states, Bahasa Malaysia, accessibility pass |
| 10 | Tests, demo script, README, freeze |

Run the validation plan's outreach and interviews in parallel from week 1; do not wait for the build. (The revised plan in `00-handoff.md` makes validation come first and caps the build at six weeks.)

## 11. Success criteria to continue (proposed thresholds, adjust after baseline)

- At least 9 of 10 test users complete check-in unaided in about one minute.
- At least 4 of 5 nurses or midwives who see the demo say the dashboard adds no extra steps compared with today.
- No cross-clinic or cross-patient access in security tests.
- At least one clinic or MOH contact agrees to review the demo.
- A real waiting-time baseline is measured (with permission) before any benefit is claimed.

If nurses report that CCMS already covers antenatal check-in, stop and reassess instead of adding features.

## 12. Scope control and open items

- **Freeze rule:** after week 2, any new feature must replace an existing item of equal size, and must be in the validation report's requirement list.
- **Needs confirmation before any pilot:** clinic registration rule (any nearby clinic or residential zone), how colour codes affect queueing, whether CCMS handles antenatal check-in, hosting and data rules, and approved wording for FR-12.
- **Not part of this scope:** pilot, real data, integration, or replacing the physical Buku Pink; each needs its own approval stage.
