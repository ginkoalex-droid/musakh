#!/bin/bash
# Restore from backup
# Usage: ./scripts/restore.sh backups/garage_2026-01-01_02-00.sql.gz

set -e

BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup_file.sql.gz>"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "File not found: $BACKUP_FILE"
  exit 1
fi

echo "WARNING: This will overwrite the current database!"
read -p "Type YES to continue: " confirm
if [ "$confirm" != "YES" ]; then
  echo "Aborted."
  exit 0
fi

echo "Restoring from $BACKUP_FILE..."

gunzip -c "$BACKUP_FILE" | docker compose exec -T db \
  psql -U postgres -d garage_inventory

echo "Restore complete."
