#!/bin/sh
# Dev/prototype backup (NFR-11). Writes a custom-format pg_dump of the local database to $BACKUP_DIR.
# Usage (Git Bash, from anywhere): db/backup/backup.sh
# The dump holds password, activation-code, refresh-token and QR-token hashes plus audit IP addresses: never commit or share it (db/backups/ and *.dump are git-ignored).
# No scheduler is installed by this repo; see the README for a proposed daily schedule (not installed).
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
set -a; . "$ROOT/db/.env"; set +a
: "${POSTGRES_OWNER_USER:?set in db/.env}" "${POSTGRES_DB:?set in db/.env}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/db/backups}"
case "$BACKUP_DIR" in /*|[A-Za-z]:*) ;; *) BACKUP_DIR="$ROOT/$BACKUP_DIR" ;; esac
umask 077
mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/dbp-$(date +%Y%m%d-%H%M).dump"
TMP="$OUT.part"
trap 'rm -f "$TMP"' EXIT
docker compose -f "$ROOT/db/docker-compose.yml" exec -T postgres \
  pg_dump -Fc -U "$POSTGRES_OWNER_USER" -d "$POSTGRES_DB" > "$TMP"
if [ ! -s "$TMP" ]; then echo "Backup failed: dump file is empty." >&2; exit 1; fi
mv "$TMP" "$OUT"
echo "Backup written: $OUT ($(wc -c < "$OUT") bytes)"
