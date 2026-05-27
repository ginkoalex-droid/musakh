#!/bin/bash
# Daily PostgreSQL backup
# Add to crontab: 0 2 * * * /opt/garage-inventory/scripts/backup.sh

set -e

BACKUP_DIR="/opt/garage-inventory/backups"
DATE=$(date +%Y-%m-%d_%H-%M)
FILENAME="garage_${DATE}.sql.gz"
KEEP_DAYS=30

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup..."

docker compose -f /opt/garage-inventory/docker-compose.yml exec -T db \
  pg_dump -U postgres garage_inventory | gzip > "$BACKUP_DIR/$FILENAME"

echo "[$(date)] Backup saved: $FILENAME ($(du -sh "$BACKUP_DIR/$FILENAME" | cut -f1))"

# Remove old backups
find "$BACKUP_DIR" -name "garage_*.sql.gz" -mtime +$KEEP_DAYS -delete
echo "[$(date)] Old backups cleaned (kept last $KEEP_DAYS days)"
