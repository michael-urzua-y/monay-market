#!/bin/sh
# Programador de backups para el sidecar de Docker.
# Ejecuta backup-db.sh de forma periódica sin depender de cron del sistema.
#
# Variables:
#   POSTGRES_USER / POSTGRES_DB / POSTGRES_PASSWORD  (desde postgres/.env)
#   PGHOST                     host del servicio postgres (ej: "postgres")
#   BACKUP_INTERVAL_SECONDS    intervalo entre backups (default 86400 = 24h)
#   BACKUP_INITIAL_DELAY       espera inicial antes del primer backup (default 30s)
set -e

export PGPASSWORD="${POSTGRES_PASSWORD}"
INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
INITIAL_DELAY="${BACKUP_INITIAL_DELAY:-30}"

echo "[backup] Sidecar iniciado. host=${PGHOST:-localhost} intervalo=${INTERVAL}s"
sleep "$INITIAL_DELAY"

while true; do
  if /scripts/backup-db.sh; then
    echo "[backup] Backup OK."
  else
    echo "[backup] ERROR en el backup; se reintentará en el próximo ciclo."
  fi
  sleep "$INTERVAL"
done
