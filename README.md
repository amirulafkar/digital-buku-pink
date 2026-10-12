# Digital Buku Pink (prototype)

Fictional data only. This is a prototype and is not MOH-approved.

## Run locally (Git Bash on Windows)
1. `cp db/.env.example db/.env` and fill in local values (git-ignored; never commit).
2. `docker compose -f db/docker-compose.yml up -d` (Postgres 16 on 127.0.0.1:5433).
3. `db/seed/seed.sh` migrates (owner role) and seeds demo data; activation codes print once.
   `CONFIRM_RESET=yes db/seed/reset.sh` wipes and reseeds (dev only).
4. Run the API with env: `ConnectionStrings__Default` (app role `dbp_app`) and `Auth__Key`.
5. Tests (needs the Postgres container up and db/.env): `dotnet test api/DigitalBukuPink.slnx`.

Staff web (S3): see `web/README.md` (`npm install --legacy-peer-deps`, `npm start`, `npm test`, `npm run e2e`). `db/dev-api.sh` runs the API on 127.0.0.1:5080 for the UI and e2e (dev only).

Layout: `api/` (Api, Data, Tests), `db/`, `web/` (Angular staff dashboard), `mobile/` (stub), `docs/`.

Notes: CORS and HSTS are not configured in the API; confirm them at the reverse proxy later. Auth endpoints are rate limited per IP (`Auth:RateLimitPerMinute`); check-in, QR, activation-code issue and patient search are rate limited per user (`Auth:CheckinPerMinute`, `Auth:QrPerMinute`, `Auth:SearchPerMinute`, default 60). Patient search is `POST /api/v1/staff/patients/search` with a JSON body so the typed text never appears in a URL. Serve the web app behind a reverse proxy with a strict Content-Security-Policy (the app also ships a CSP meta tag) plus HSTS. Set `CODE_PEPPER` and `JWT_KEY` (at least 32 bytes) in db/.env; the API refuses to start without them. `seed` runs only with `ASPNETCORE_ENVIRONMENT=Development`. After pulling the pepper change, run `CONFIRM_RESET=yes db/seed/reset.sh`.

## Live updates (S5)
`/hubs/queue` is a server-push SignalR hub with no client-to-server methods. Events are `{ type, queueEntryId, version, updatedAt }` only (no names, phones, rooms or waiting times) and are sent after the change is committed. Clients refetch through the normal authenticated REST endpoints, drop events that are not newer than the last seen version, and fall back to polling when the connection is down (polling pauses while it is up). The WebSocket carries the access token in the `access_token` query string (accepted on `/hubs` only); request URLs are never logged. Limits: 3 connections per user, 1 KB messages, 15 s keep-alive, 30 s client timeout, `Auth:HubPerMinute` negotiate limit per IP. Single instance only (in-memory groups); scaling out needs a backplane.

## Paper queue fallback (NFR-06)
When the staff screen shows "System is down. Use the paper queue and re-key entries later.", keep the queue on paper: write each arrival with the time and a running number, call people from the paper list, and re-key the entries into the dashboard (walk-in check-in) once the system is back. Mothers who see the offline message on the app should go to the counter.
