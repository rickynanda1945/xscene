#!/bin/sh
set -eu

set --
if [ -f "${XSCENE_ENV_FILE:-/run/xscene.env}" ]; then
  set -- "--env-file=${XSCENE_ENV_FILE:-/run/xscene.env}"
fi

node "$@" scripts/preflight.mjs

if node "$@" -e 'process.exit((process.env.AUTO_MIGRATE ?? "true") === "true" ? 0 : 1)'; then
  node "$@" scripts/migrate.mjs
fi

exec node "$@" server.js
