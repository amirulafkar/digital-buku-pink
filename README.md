# Digital Buku Pink (prototype)

Fictional data only. This is a prototype and is not MOH-approved.

## Run locally (Git Bash on Windows)
1. `cp db/.env.example db/.env` and fill in local values (git-ignored; never commit).
2. `docker compose -f db/docker-compose.yml up -d` (Postgres 16 on 127.0.0.1:5433).
3. `db/seed/seed.sh` migrates (owner role) and seeds demo data; activation codes print once.
   `CONFIRM_RESET=yes db/seed/reset.sh` wipes and reseeds (dev only).
4. Run the API with env: `ConnectionStrings__Default` (app role `dbp_app`) and `Auth__Key`.
5. Tests (needs the Postgres container up and db/.env): `dotnet test api/DigitalBukuPink.slnx`.

Layout: `api/` (Api, Data, Tests), `db/`, `web/` (stub), `mobile/` (stub), `docs/`.

Notes: CORS and HSTS are not configured in the API; confirm them at the reverse proxy later. Auth endpoints are rate limited per IP (`Auth:RateLimitPerMinute`). Set `CODE_PEPPER` and `JWT_KEY` (at least 32 bytes) in db/.env; the API refuses to start without them. `seed` runs only with `ASPNETCORE_ENVIRONMENT=Development`. After pulling the pepper change, run `CONFIRM_RESET=yes db/seed/reset.sh`.
