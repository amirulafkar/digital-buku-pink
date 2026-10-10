#!/bin/sh
# Dev only. Migrates and seeds the local database as the owner role. Prints activation codes once.
# Usage (Git Bash, from repo root): db/seed/seed.sh
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
set -a; . "$ROOT/db/.env"; set +a
export DBP_OWNER_CONN="Host=127.0.0.1;Port=${POSTGRES_PORT};Database=${POSTGRES_DB};Username=${POSTGRES_OWNER_USER};Password=${POSTGRES_OWNER_PASSWORD}"
cd "$ROOT/api"
dotnet ef database update --project Data --startup-project Data
Seed__ConnectionString="$DBP_OWNER_CONN" Seed__StaffPassword="$SEED_STAFF_PASSWORD" \
  Auth__Key="$JWT_KEY" Auth__CodePepper="$CODE_PEPPER" ASPNETCORE_ENVIRONMENT=Development ConnectionStrings__Default="$DBP_OWNER_CONN" \
  dotnet run --project Api -- seed
