-- Neon (demo): create the two application roles once. Run from your PC as Neon's default owner role,
-- against the DIRECT (non-pooler) endpoint. The default owner only creates roles; the app never uses it.
--
--   export NEON_ADMIN_URL='postgresql://<default-owner>:<password>@<direct-host>/<db>?sslmode=require'   # shell only, never a file in the repo
--   export DBP_OWNER_PASSWORD='<new strong password>'  DBP_APP_PASSWORD='<another strong password>'
--   psql "$NEON_ADMIN_URL" -f db/neon/01-roles.sql
--
-- Passwords come from the psql variables owner_pw and app_pw. If you do not pass them with -v, the script reads the
-- environment variables above (\getenv), so they do not appear on the command line. This file holds no secret.
-- Safe to run again: roles are created if missing and their passwords are set to the values you give.
--
-- dbp_owner : runs migrations and the one-off seed from your PC. Owns the tables.
-- dbp_app   : what the API uses. DML only; the S1_Init migration then grants table rights, removes UPDATE, DELETE and
--             TRUNCATE on audit_log and installs the append-only trigger. A table owner can drop triggers, so the API
--             must never run as dbp_owner.
-- Run this BEFORE `dotnet ef database update` (the migration only grants rights if dbp_app already exists).

\set ON_ERROR_STOP on
\if :{?owner_pw}
\else
  \getenv owner_pw DBP_OWNER_PASSWORD
\endif
\if :{?app_pw}
\else
  \getenv app_pw DBP_APP_PASSWORD
\endif
\if :{?owner_pw}
\else
  \echo 'owner_pw is not set (use -v owner_pw=... or DBP_OWNER_PASSWORD)'
  \quit
\endif
\if :{?app_pw}
\else
  \echo 'app_pw is not set (use -v app_pw=... or DBP_APP_PASSWORD)'
  \quit
\endif

SELECT (length(:'owner_pw') < 16 OR length(:'app_pw') < 16 OR :'owner_pw' = :'app_pw') AS weak \gset
\if :weak
  \echo 'Passwords must be at least 16 characters and different from each other.'
  \quit
\endif

SELECT 'CREATE ROLE dbp_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE'
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dbp_owner') \gexec
SELECT 'CREATE ROLE dbp_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE'
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dbp_app') \gexec
SELECT format('ALTER ROLE dbp_owner PASSWORD %L', :'owner_pw') \gexec
SELECT format('ALTER ROLE dbp_app PASSWORD %L', :'app_pw') \gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO dbp_owner, dbp_app', current_database()) \gexec
GRANT USAGE, CREATE ON SCHEMA public TO dbp_owner;
GRANT USAGE ON SCHEMA public TO dbp_app;

\echo 'Roles ready: dbp_owner (migrations, seed) and dbp_app (API, DML only). Next: dotnet ef database update as dbp_owner.'
