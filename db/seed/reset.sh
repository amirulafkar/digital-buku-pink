#!/bin/sh
# DEV ONLY. Destroys all data in the local database (as owner) and re-seeds.
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
set -a; . "$ROOT/db/.env"; set +a
if [ "${CONFIRM_RESET:-}" != "yes" ]; then echo "Set CONFIRM_RESET=yes to wipe the local dev database."; exit 1; fi
docker compose -f "$ROOT/db/docker-compose.yml" exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_OWNER_USER" -d "$POSTGRES_DB" \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
"$ROOT/db/seed/seed.sh"
