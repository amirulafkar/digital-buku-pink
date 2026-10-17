#!/bin/sh
# Restore drill (NFR-11). Restores a dump into a scratch database, compares count(*) of every public base table
# with the source database, prints the table, drops the scratch database. Exit 1 on any mismatch or failure.
# Usage: db/backup/restore-drill.sh [dump-file]   (default: newest dbp-*.dump in $BACKUP_DIR)
# Run it right after backup.sh with nothing writing to the source database, or counts can differ legitimately.
# The scratch database is never the source database. The dump holds hashes: do not share it.
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
set -a; . "$ROOT/db/.env"; set +a
: "${POSTGRES_OWNER_USER:?set in db/.env}" "${POSTGRES_DB:?set in db/.env}"
DRILL_DB="dbp_restore_drill"
if [ "$DRILL_DB" = "$POSTGRES_DB" ]; then echo "Refusing: scratch database equals POSTGRES_DB." >&2; exit 1; fi
BACKUP_DIR="${BACKUP_DIR:-$ROOT/db/backups}"
case "$BACKUP_DIR" in /*|[A-Za-z]:*) ;; *) BACKUP_DIR="$ROOT/$BACKUP_DIR" ;; esac
DUMP="${1:-$(ls -1t "$BACKUP_DIR"/dbp-*.dump 2>/dev/null | head -n 1)}"
if [ -z "$DUMP" ] || [ ! -s "$DUMP" ]; then echo "No dump found. Run db/backup/backup.sh first." >&2; exit 1; fi

dc() { docker compose -f "$ROOT/db/docker-compose.yml" exec -T postgres "$@"; }
psql_in() { _db="$1"; shift; dc psql -v ON_ERROR_STOP=1 -At -U "$POSTGRES_OWNER_USER" -d "$_db" "$@"; }

WORK="$(mktemp -d)"
cleanup() {
  psql_in postgres -c "DROP DATABASE IF EXISTS $DRILL_DB WITH (FORCE)" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "Dump: $DUMP ($(wc -c < "$DUMP") bytes)"
psql_in postgres -c "DROP DATABASE IF EXISTS $DRILL_DB WITH (FORCE)" >/dev/null
psql_in postgres -c "CREATE DATABASE $DRILL_DB" >/dev/null
dc pg_restore --exit-on-error -U "$POSTGRES_OWNER_USER" -d "$DRILL_DB" < "$DUMP"

TABLES="$(psql_in "$POSTGRES_DB" -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1")"
if [ -z "$TABLES" ]; then echo "No tables found in the source database." >&2; exit 1; fi
SQL=""
for t in $TABLES; do
  [ -n "$SQL" ] && SQL="$SQL UNION ALL "
  SQL="${SQL}SELECT '$t' AS t, count(*) AS n FROM public.\"$t\""
done
SQL="SELECT t, n FROM ($SQL) x ORDER BY t"
psql_in "$POSTGRES_DB" -F ' ' -c "$SQL" > "$WORK/source.txt"
psql_in "$DRILL_DB" -F ' ' -c "$SQL" > "$WORK/restored.txt"

echo "table | source | restored | result"
FAIL=0
while read -r t n; do
  r="$(awk -v t="$t" '$1==t {print $2}' "$WORK/restored.txt")"
  if [ "$r" = "$n" ]; then res="ok"; else res="MISMATCH"; FAIL=1; fi
  echo "$t | $n | ${r:-missing} | $res"
done < "$WORK/source.txt"

if [ "$FAIL" -ne 0 ]; then echo "Restore drill FAILED." >&2; exit 1; fi
echo "Restore drill passed: $(wc -l < "$WORK/source.txt") tables match. Scratch database dropped."
