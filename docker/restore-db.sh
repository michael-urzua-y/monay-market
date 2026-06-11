#!/bin/sh
# Restore script for Monay Market PostgreSQL database.
#
# Usage (from host):
#   docker compose exec postgres /scripts/restore-db.sh [filename]
#
# If no filename is given, restores the most recent backup.

set -e

BACKUP_DIR="/backups"

if [ -n "$1" ]; then
  FILE="$BACKUP_DIR/$1"
else
  FILE=$(ls -t "$BACKUP_DIR"/monay_market_*.sql.gz 2>/dev/null | head -1)
fi

if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Error: No se encontró archivo de backup."
  echo "Backups disponibles:"
  ls -lh "$BACKUP_DIR"/monay_market_*.sql.gz 2>/dev/null || echo "  (ninguno)"
  exit 1
fi

echo "[$(date)] Restaurando desde: $FILE"
echo "ADVERTENCIA: Esto sobreescribirá la base de datos '$POSTGRES_DB'."
echo "Presione Ctrl+C en 5 segundos para cancelar..."
sleep 5

# Drop and recreate
dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB"
createdb -U "$POSTGRES_USER" "$POSTGRES_DB"

# Restore
gunzip -c "$FILE" | psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" --quiet

echo "[$(date)] Restauración completada desde: $FILE"
