#!/bin/sh
# Backup script for Monay Market PostgreSQL database.
# Can be executed manually or via cron inside the postgres container.
#
# Usage (from host):
#   docker compose exec postgres /scripts/backup-db.sh
#
# The script creates compressed dumps in /backups/ inside the container.
# Mount a host volume to persist them outside Docker.

set -e

BACKUP_DIR="/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="monay_market_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup..."
pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "$BACKUP_DIR/$FILENAME"
echo "[$(date)] Backup created: $BACKUP_DIR/$FILENAME"

# Keep only last 7 backups
cd "$BACKUP_DIR"
ls -t monay_market_*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm -f
echo "[$(date)] Cleanup done. Keeping last 7 backups."

# List current backups
echo "Current backups:"
ls -lh "$BACKUP_DIR"/monay_market_*.sql.gz 2>/dev/null || echo "  (none)"
