#!/bin/sh
# DEV ONLY. Runs the API on http://127.0.0.1:5080 as the app role (dbp_app) against the local container.
# Rate limits are raised so e2e runs are not throttled; production defaults are in appsettings.json.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a; . "$ROOT/db/.env"; set +a
export ConnectionStrings__Default="Host=127.0.0.1;Port=${POSTGRES_PORT};Database=${POSTGRES_DB};Username=dbp_app;Password=${APP_DB_PASSWORD}"
export Auth__Key="$JWT_KEY" Auth__CodePepper="$CODE_PEPPER"
export Auth__RateLimitPerMinute=100000 Auth__CheckinPerMinute=100000 Auth__QrPerMinute=100000 Auth__SearchPerMinute=100000
export ASPNETCORE_URLS="http://127.0.0.1:5080" ASPNETCORE_ENVIRONMENT=Development
export PATH="$PATH:/c/Program Files/dotnet"
cd "$ROOT/api"
exec dotnet run --project Api --no-launch-profile
