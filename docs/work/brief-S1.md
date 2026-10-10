# Brief S1: repo, database, auth, roles, seed
Sources: 03 §5-7; 04a §1-2; 04b UF-01; 04c §2-4. G0 waived by human. Fictional data only.
## Requirements
- Covered: FR-01 (activate), FR-11 (login and activation audit), NFR-01 (scoping groundwork), NFR-02 (hash, JWT, refresh, revoke), NFR-03 (minimal data), NFR-10 (append-only), FR-16/NFR-08 (language field only).
- Not S1: FR-02..FR-10, FR-12..FR-15, FR-16 UI, NFR-04..07, NFR-09, NFR-11 drill, NFR-12 note (S6).
## Repo layout (C:\Afkar\Personal Projects)
- api\ ASP.NET Core Web API on .NET 10: Api, Data (EF Core), Tests (xUnit).
- web\ Angular dashboard scaffold with Angular Material, no screens.
- mobile\ Ionic + Capacitor stub, README only.
- db\ docker-compose.yml, init SQL, seed and reset scripts.
- docs\work\ briefs and status.md.
## Database (docker compose)
- postgres 16 (proposed; 17 acceptable), named volume, bound to 127.0.0.1, password in git-ignored .env.
- One EF migration S1_Init plus db\init SQL. Roles: owner (migrations) and app (DML only; audit_log SELECT and INSERT only).
- audit_log trigger blocks UPDATE and DELETE; app role has no TRUNCATE.
- All FKs ON DELETE RESTRICT; created_at timestamptz default now() on every table.
## Tables (S1 only)
- clinic(id, code UQ, name, timezone default Asia/Kuala_Lumpur).
- staff(id, clinic_id, display_name, role nurse|clinic_admin, active).
- patient(id, clinic_id, display_name, phone UQ normalised digits, language ms|en, is_demo CHECK true). Phone is the mother login identifier (human decision); fictional numbers only.
- user_account(id, patient_id?, staff_id?, username UQ (staff only; null for patients, who log in by patient.phone), password_hash, status pending|active|disabled, failed_logins, locked_until; CHECK exactly one FK).
- refresh_token(id, user_account_id, token_hash UQ, device_name, expires_at, revoked_at).
- activation_code(id, patient_id, code_hash UQ, issued_by, expires_at, used_at).
- audit_log(id bigint identity, at, actor_user_id?, clinic_id, action, entity, entity_id, detail jsonb, ip inet); index (clinic_id, at).
- appointment and room: needed by seed (Open Q2). Not S1: queue_entry, qr_token, notification.
## Roles and auth
- Hashing: ASP.NET Core Identity PasswordHasher only; no AspNetUsers tables.
- Roles: patient (patient_id set), nurse, clinic_admin. JWT claims: sub, clinic_id, role.
- Access JWT 15 min (proposed); refresh token opaque, stored hashed, rotated on each use, revocable per device.
- Login only when status = active; 5 failed logins lock 15 min (proposed).
- POST /api/v1/auth/login {identifier,password} (staff: username; patient: phone, normalised) -> 200 {accessToken,refreshToken,expiresIn,role} | 401 generic.
- POST /api/v1/auth/refresh {refreshToken} -> 200 same shape | 401. POST /api/v1/auth/logout {refreshToken} -> 204.
- POST /api/v1/auth/activate {code,phone,password} (phone must match the code's patient) -> 204 | 400 "code invalid or expired". One transaction: match code_hash, unused, unexpired; set password, status active, used_at, audit row.
- Login success and failure both audited (failure: actor null).
## Clinic scoping
- clinicId comes from the token claim only, never body or URL. Repository methods require clinicId; no unscoped overloads. Staff routes sit under /api/v1/staff with role policy.
## Seed (fictional only; no IC, addresses)
- clinic KK-DEMO-1 "KK Demo Satu"; rooms Bilik 1, 2, 3.
- staff Aini (demo, nurse), Faridah (demo, clinic_admin); usernames aini.demo, faridah.demo.
- patients Siti, Dewi, Mei Ling, Priya, all "(demo)", is_demo true, clearly fake phones 010-000-0001 to 0004 (never real numbers), mixed ms/en.
- One routine appointment per patient today; one unused activation code per patient (hash stored; plaintext printed once, dev only).
- Passwords from local env, never committed. Reset script is dev only, runs as owner.
## Acceptance tests (Given/When/Then)
- T1 FR-01: Given unused, unexpired code, When activate, Then 204, status active, used_at set, DB holds code_hash only.
- T2 FR-01: Given used or expired code, When activate, Then 400 and no row changes.
- T3 NFR-02: Given active user, When login, Then access JWT lifetime <= 15 min; password_hash is not the password.
- T4 NFR-02: Given rotated or logged-out refresh token, When used, Then 401.
- T5 NFR-02: Given pending or locked account, When login, Then 401.
- T6 NFR-01: Given clinic B user, When repository reads clinic A patient, Then no row; patient token on staff route, Then 403.
- T7 FR-11: Given login and activation, Then audit rows hold actor, clinic, action, ip; detail and logs never contain the phone number or other personal data.
- T8 NFR-10: Given an audit row, When app role runs UPDATE or DELETE, Then it fails.
- T9 NFR-03: Given schema and seed, Then no ic/address/diagnosis columns, no NRIC-pattern values; is_demo=false and dual-FK user_account rows are rejected.
## Out of S1
FR-02..FR-10, FR-12..FR-15, activation-code issue endpoint (S3), Angular and Ionic screens, SignalR, Serilog beyond console, backup drill, FHIR note, RLS (unless Open Q5).
## Accepted deviations (lead, 2026-10-11; human may overrule)
- Refresh tokens: high-entropy random, stored as SHA-256 (PasswordHasher is for passwords only). Activation codes: HMAC-SHA256 with env pepper.
- Failed activation writes an activate_failure audit row (no phone or code); T2 means no code or account rows change.
- Two migrations (S1_Init, S1_ActiveRequiresPassword). Extra: /staff/rooms, auth rate limiter, tests T2c/T3c/T4c.
