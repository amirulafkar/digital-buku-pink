# Deploy the demo (free tiers) - human checklist

Prototype, not MOH-approved. Fictional data only. This is deployment work: no feature, no endpoint, no queue rule changed. You do every account and deploy step yourself; nothing in this repository creates accounts, deploys or holds a secret.

Plan (names proposed, change as needed): staff web on Cloudflare Pages `dbp-staff`, mother app on Pages `dbp-mother`, API as a Docker image on a Render free web service `dbp-api`, database on Neon free PostgreSQL 16. Demo URLs are public, with no login gate (human decision 2026-10-17).

## 0. Before you start
- **Check the live provider pages first.** The brief's statements about Render sleeping after idle time, Neon compute and storage limits, and Pages build limits were not verified. Read the current pricing and limits pages for Render, Neon and Cloudflare Pages, and confirm each plan you pick is free and has no card-triggered upgrade. This document does not state any limit as fact.
- Accounts under your name, free plans only. Record the weekly hours target and hosting cap in `docs/work/status.md` if you want tripwires 4 and 7 green (you chose to leave them unset on 2026-10-17).
- Tools on your PC: Git Bash, .NET SDK 10 with `dotnet ef` (`dotnet tool restore` in `api/`), `psql` and `pg_dump` (client 16 or newer), Node and npm.
- Never commit or paste into chat: connection strings, passwords, `Auth__Key`, `Auth__CodePepper`. Use shell environment variables for one-off commands (the examples use `export`).

## 1. Neon (database)
1. Create a Neon project with PostgreSQL 16. Note the **direct** (not pooler) host, database name and the default owner role. Neon connections need `sslmode=require`.
2. In Git Bash, set these for this shell only:
   ```sh
   export PGHOST='<direct-host>' PGDATABASE='<db>' PGUSER='<default-owner>' PGPASSWORD='<its password>' PGSSLMODE=require   # libpq reads these; the password never goes on a command line
   export DBP_OWNER_PASSWORD='<new strong password, 16+ characters>'
   export DBP_APP_PASSWORD='<a different strong password, 16+ characters>'
   ```
3. Create the roles once (the script reads the two passwords from the environment through psql `\getenv`, or take them with `-v owner_pw=... -v app_pw=...`):
   ```sh
   psql -f db/neon/01-roles.sql
   ```
   It creates `dbp_owner` (migrations and seed, from your PC only) and `dbp_app` (the API, DML only). The default Neon owner is not used again. Run this before the migration: the migration grants rights to `dbp_app` only if the role exists.
4. Migrate as `dbp_owner` (Npgsql format, direct host):
   ```sh
   export DBP_OWNER_CONN='Host=<direct-host>;Port=5432;Database=<db>;Username=dbp_owner;Password='"$DBP_OWNER_PASSWORD"';SSL Mode=Require'
   cd api && dotnet ef database update --project Data --startup-project Data
   ```
   The API does not migrate at start.
5. Seed from your PC (Development environment, owner connection; no seed code runs on Render). `Auth__CodePepper` must be the same value you will set on Render, or activation codes will not validate:
   ```sh
   export Auth__Key='<32+ characters, same as Render>'  Auth__CodePepper='<16+ characters, same as Render>'
   export Seed__StaffPassword='<demo staff password you choose>'
   Seed__ConnectionString="$DBP_OWNER_CONN" ConnectionStrings__Default="$DBP_OWNER_CONN" ASPNETCORE_ENVIRONMENT=Development \
     dotnet run --project api/Api -- seed
   ```
   It prints four activation codes once. Note the time. Re-running prints "Already seeded" and does not reissue codes. Activation codes expire after 7 days: issue fresh ones from the staff Codes screen shortly before the demo.

## 2. Render (API)
1. New Web Service from this repository, free plan, runtime Docker. Use the folder `api` as the build context and `api/Dockerfile` as the Dockerfile (the field names on Render may differ; check its live page). The image runs as a non-root user on port 8080, in Production. It does NOT trust `X-Forwarded-For` by itself (anyone who can reach the container directly could then pick their own address); you turn that on with the `Hosting__TrustForwardedHeaders` env var below, because Render's proxy sits in front. With it on, rate limits and the audit `ip` use the last `X-Forwarded-For` entry (one proxy).
2. Health check path: `/health` (answers 200 without touching the database, so it does not wake Neon).
3. Environment variables:

   | Name | Type | Value |
   | --- | --- | --- |
   | `ConnectionStrings__Default` | secret | `Host=<direct-host>;Port=5432;Database=<db>;Username=dbp_app;Password=<DBP_APP_PASSWORD>;SSL Mode=Require` |
   | `Auth__Key` | secret | 32 or more characters |
   | `Auth__CodePepper` | secret | 16 or more characters, same as used for the seed |
   | `Cors__AllowedOrigins` | plain | `https://dbp-staff.pages.dev,https://dbp-mother.pages.dev` (the exact origins Pages gives you; no wildcard, no trailing slash, no preview URLs. A wildcard, path or non-http(s) entry stops the API at start. An empty or missing list does not stop it: CORS is then off and browsers on Pages are blocked, so check this first if the apps cannot reach the API. Unlisted origins, including preview URLs, get no CORS headers) |
   | `Hosting__TrustForwardedHeaders` | plain | `true` (only because the API sits behind Render's proxy; leave unset anywhere else; check smoke D11) |
   | `Auth__Issuer`, `Auth__Audience` | plain | optional, default `dbp` |

   Never set `ASPNETCORE_ENVIRONMENT=Development` on Render: seed and the OpenAPI page are for Development only.
4. Note the service URL, for example `https://dbp-api.onrender.com`.

## 3. Cloudflare Pages (two static sites)
1. Set the API origin the apps are built with. In both `web/src/environments/environment.pages.ts` and `mobile/src/environments/environment.pages.ts`, set `apiBase` to your Render URL (`https://host`, no path, no trailing slash). It is not a secret and is the only value the front ends receive. (Dev builds keep `apiBase: ''` and the Angular proxy.)
2. Build:
   ```sh
   cd web && npm ci && npm run build:pages        # output web/dist/pages/browser
   cd ../mobile && npm install && npm run build:pages   # output mobile/dist/pages/browser
   ```
   `build:pages` also writes the Content-Security-Policy `connect-src 'self' https://<api> wss://<api>` into `index.html` from the same `apiBase` and checks it; `npm run check:pages` repeats the check. The mobile build also confirms the developer paste field is absent.
3. Create two Pages projects (`dbp-staff`, `dbp-mother`) on the free plan and upload each `dist/pages/browser` folder (direct upload or the Pages build settings; check the live Pages page for current options). The folders include `_redirects` (`/* /index.html 200`, single-page routing) and `_headers` (HSTS).
4. Put the two real `*.pages.dev` origins into `Cors__AllowedOrigins` on Render and redeploy the API if they differ from the proposed names.

## 4. Cold start and warm-up
- A free Render service may be asleep and Neon compute may be paused when idle (confirm both on the live pages). The first request can take a while. The apps show "connecting" or the offline banner, not an error.
- Two minutes before a demo: open `https://<api>/health`, then sign in on the staff site once. An open hub connection keeps the API awake while the demo runs.

## 5. Smoke checks D1 to D11 (do all, record results in `docs/work/results-S7.md`)
| ID | Check | Pass when |
| --- | --- | --- |
| D1 | Cold `GET https://<api>/health` | 200; record the seconds it took |
| D2 | Sign in on both Pages sites (NFR-02) | works; DevTools Application tab: no token in localStorage or cookies (staff refresh token is in sessionStorage by design) |
| D3 | Staff issues a QR token (API call from `docs/demo-script.md` step 2.2 against the Render URL); mother scans on a real phone over HTTPS (NFR-05) | check-in 201, scanning again returns 200 with the same number |
| D4 | Staff changes status (Call) | mother's Status updates in 5 s or less without reload (NFR-09), over `wss://` (DevTools Network, WS tab) |
| D5 | Block the API host in the browser (DevTools network blocking) | offline banner, scan disabled, last update time shown; unblock and press Retry: banner clears |
| D6 | Sign in as `rina.demo` (other clinic) (NFR-01) | the queue shows none of clinic 1's entries |
| D7 | As `dbp_app` from your PC: `PGPASSWORD="$DBP_APP_PASSWORD" psql "host=<direct-host> dbname=<db> user=dbp_app sslmode=require" -c "UPDATE audit_log SET action='x'"` then `DELETE FROM audit_log` and `TRUNCATE audit_log` (NFR-10) | each is refused (permission denied) |
| D8 | As `dbp_owner`: `SELECT bool_and(is_demo) FROM patient;` and list `display_name` (NFR-03) | `true`; names are fictional "(demo)" names; no IC number or address column exists |
| D9 | Restore drill (NFR-11), section 6 | login and queue read work against the restored copy |
| D10 | Both sites, every screen | "Prototype, not MOH-approved" text visible (staff side panel and login; mother screens) |
| D11 | Render passes the real client address (NFR-10, rate limits). From your PC: `curl -s -o /dev/null -X POST https://<api>/api/v1/auth/login -H 'X-Forwarded-For: 203.0.113.99' -H 'Content-Type: application/json' -d '{"identifier":"nobody-d11","password":"x"}'`, then as `dbp_owner`: `SELECT ip FROM audit_log ORDER BY id DESC LIMIT 1;` | the stored `ip` is your own public address, NOT `203.0.113.99`. A private or Render proxy address means the env var is missing or the proxy hides the client; `203.0.113.99` means the API trusts a forged header, so unset the env var and stop |

## 6. Backup and one restore drill (NFR-11, manual)
Keep dumps outside this repository (they hold password, code, refresh-token and QR-token hashes and audit IP addresses). Retention proposed: 7 days; delete older files yourself.
```sh
PGPASSWORD="$DBP_OWNER_PASSWORD" PGSSLMODE=require pg_dump --format=custom --host=<direct-host> --username=dbp_owner --dbname=<db> --file="$HOME/dbp-backups/dbp-$(date +%Y%m%d-%H%M).dump"
```
Drill once: create a new Neon branch (check the live Neon page for how), create the roles on it with `01-roles.sql`, then `PGPASSWORD="$DBP_OWNER_PASSWORD" PGSSLMODE=require pg_restore --no-owner --role=dbp_owner --host=<branch-host> --username=dbp_owner --dbname=<branch-db> <dump>` (if your pg_restore objects to `--role`, restore as `dbp_owner` without it). Point a copy of the API, or just `psql`, at the branch: sign-in rows exist (`select count(*) from user_account`) and `select count(*) from queue_entry` matches the source. Delete the branch afterwards.

## 7. Rollback
- Pages: redeploy the previous build.
- Render: redeploy the previous image or commit.
- Neon: there is no S7 migration. If data is wrong, restore a dump into a new branch and change `ConnectionStrings__Default` to point at it.
- Suspected compromise: change `Auth__Key` on Render (ends every session) and, if needed, rotate the database passwords with `01-roles.sql` plus the new `ConnectionStrings__Default`.

## 8. Known limits of this demo deployment
- The SignalR hub sends the access token in the query string (`/hubs/queue?access_token=...`), because browsers cannot set headers on a WebSocket. The host's request logs, and any proxy log, may record that URL. That token is a bearer token valid for 15 minutes: whoever reads it from a log can, until it expires, call the API as that user, meaning read that user's clinic queue or the mother's own queue status (and, for a nurse token, do the nurse actions that role allows). It cannot be refreshed without the refresh token, which is never in a URL. Accepted for the synthetic-data demo (human decision 2026-10-17), with short log retention; check the log retention on Render's live page, and do not copy log lines into chats or tickets.
- Public URLs, no access gate. Fictional data only; do not enter real people's details.
- Free-tier cold starts, single API instance, no backplane, no scheduled backups, no custom domain.
- Preview deployment origins on `pages.dev` are deliberately not allowed by CORS.
- The camera needs HTTPS: test it on the Pages URL on a real phone (D3).
