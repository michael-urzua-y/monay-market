#!/bin/sh
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  node -e "
    const { DataSource } = require('typeorm');
    const ds = require('./dist/config/data-source').default;
    ds.initialize().then(d => d.runMigrations()).then(() => { console.log('Migrations completed'); process.exit(0); }).catch(e => { console.error('Migration failed:', e); process.exit(1); });
  "
fi
exec npm run start:prod
