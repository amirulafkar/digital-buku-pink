#!/bin/sh
# Creates the DML-only application role. Table grants (and the audit_log restrictions)
# are applied by the S1_Init migration, which runs as the owner role.
set -e
psql -v ON_ERROR_STOP=1 -v app_pw="$APP_DB_PASSWORD" -v dbname="$POSTGRES_DB" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE dbp_app LOGIN PASSWORD :'app_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE :"dbname" TO dbp_app;
GRANT USAGE ON SCHEMA public TO dbp_app;
SQL
