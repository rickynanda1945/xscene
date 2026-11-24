#!/bin/sh
set -eu
if [ "${AUTO_MIGRATE:-true}" = "true" ]; then
  node scripts/migrate.mjs
fi
exec node server.js
