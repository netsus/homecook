#!/bin/sh
set -eu

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
export DATABASE_URL="postgres://supabase_storage_admin:${POSTGRES_PASSWORD}@postgres:5432/postgres"
exec docker-entrypoint.sh node dist/start/server.js
