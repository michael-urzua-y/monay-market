#!/bin/sh
# Crea los archivos .env de Monay para este servidor con claves aleatorias.
# No sobrescribe archivos existentes. Uso (desde la raíz del repo):
#   sh deploy/serviciohyh/crear-env.sh [dominio]      # por defecto pos.serviciohyh.cl
set -eu

DOMAIN="${1:-pos.serviciohyh.cl}"
URL="https://$DOMAIN"
cd "$(dirname "$0")/../.."

secret() { openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-"$1"; }

for f in postgres/.env api/.env dashboard/.env; do
  if [ -e "$f" ]; then
    echo "Ya existe $f: no se toca nada. Bórralo a mano si quieres regenerarlo." >&2
    exit 1
  fi
done

umask 077 # solo el dueño puede leer los secretos

DB_PASSWORD="$(secret 40)"
SUPERADMIN_PASSWORD="$(secret 16)"

cat > postgres/.env <<EOF
POSTGRES_DB=monay_market
POSTGRES_USER=monay_market
POSTGRES_PASSWORD=$DB_PASSWORD
EOF

cat > api/.env <<EOF
DB_HOST=postgres
DB_PORT=5432
DB_USERNAME=monay_market
DB_PASSWORD=$DB_PASSWORD
DB_DATABASE=monay_market
JWT_SECRET=$(secret 64)
JWT_EXPIRATION=12h
APP_DATA_ENCRYPTION_KEY=$(secret 64)
SII_APIGATEWAY_BASE_URL=https://app.apigateway.cl/api/v2
PORT=3000
NODE_ENV=production
PWA_PATH=/app/pwa
STRICT_ENV_VALIDATION=true
RUN_MIGRATIONS=true
CORS_ORIGIN=$URL
WS_CORS_ORIGIN=$URL
PWA_API_URL=
PWA_LOGIN_URL=
LOGIN_RATE_LIMIT_WINDOW_MS=60000
LOGIN_RATE_LIMIT_MAX_ATTEMPTS=10
LOGIN_RATE_LIMIT_BLOCK_MS=300000
SEED_DEMO_DATA=false
SUPERADMIN_PASSWORD=$SUPERADMIN_PASSWORD
EOF

cat > dashboard/.env <<EOF
API_URL=http://api:3000
PUBLIC_APP_URL=$URL
LOGIN_URL=
POS_URL=/pos/
POS_AUTH_COOKIE_SECURE=true
SECRET_KEY=$(secret 64)
FLASK_ENV=production
FLASK_DEBUG=0
STRICT_ENV_VALIDATION=true
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=Lax
SESSION_LIFETIME_SECONDS=43200
MAX_CONTENT_LENGTH=26214400
CERT_UPLOAD_DIR=/app/uploads/certificados
EOF

echo "Archivos creados para $URL: postgres/.env, api/.env, dashboard/.env (solo su dueño puede leerlos)."
echo
echo "  Superadmin → usuario: michael · clave: $SUPERADMIN_PASSWORD"
echo "  Guárdala ahora: no se vuelve a mostrar (queda en api/.env)."
