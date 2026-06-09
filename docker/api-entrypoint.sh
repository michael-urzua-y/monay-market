#!/bin/sh
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  npm run migration:run
fi
exec npm run start:prod
