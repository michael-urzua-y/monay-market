#!/bin/sh
set -e

npm run migration:run
exec npm run start:prod
