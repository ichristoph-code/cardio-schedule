#!/usr/bin/env bash
#
# Take a point-in-time backup of the app database.
#
#   ./scripts/backup-db.sh                          # the database in .env
#   BACKUP_DIR=/Volumes/usb ./scripts/backup-db.sh  # somewhere else
#   DATABASE_URL="postgres://..." ./scripts/backup-db.sh
#
# Run this BEFORE anything bulk or structural: a schema migration, an Excel
# vacation import, a bulk delete. Neon's own restore window is a safety net,
# not a backup — it expires, and it goes away with the account.
#
# The dump holds real physician schedules. Keep it out of the repo (.gitignore
# covers *.dump) and off shared drives. BACKUP_DIR defaults to ~/cardio-backups,
# outside the project, so it can't be committed by accident.

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/cardio-backups}"

# An explicit DATABASE_URL wins; otherwise read the first one out of .env.
if [[ -z "${DATABASE_URL:-}" ]]; then
  env_file="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env"
  if [[ ! -f "$env_file" ]]; then
    echo "No DATABASE_URL set, and no .env at $env_file" >&2
    exit 1
  fi
  DATABASE_URL="$(
    grep -m1 '^DATABASE_URL=' "$env_file" |
      cut -d= -f2- |
      sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
  )"
fi

if [[ -z "$DATABASE_URL" ]]; then
  echo "DATABASE_URL is empty — nothing to back up." >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump not found. Install the PostgreSQL client tools:" >&2
  echo "  brew install postgresql@17" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
out="$BACKUP_DIR/cardio-$(date +%Y%m%d-%H%M%S).dump"

echo "→ Backing up to $out"

# --format=custom is what pg_restore reads, and it compresses.
# --no-owner/--no-acl let the dump restore into a database whose role names
# differ (a local Postgres, say) instead of failing on missing roles.
#
# If this reports a server version mismatch, the local pg_dump is older than
# the server: upgrade the client tools (brew install postgresql@17).
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl --file "$out"

echo "✓ Wrote $(du -h "$out" | cut -f1) to $out"
echo
echo "To restore this into a database — THIS REPLACES ITS CONTENTS:"
echo "  pg_restore --clean --if-exists --no-owner -d \"\$DATABASE_URL\" \"$out\""
