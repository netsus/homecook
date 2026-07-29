#!/bin/sh
set -eu

: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

psql \
  --dbname "$POSTGRES_DB" \
  --username supabase_admin \
  --set ON_ERROR_STOP=1 \
  --set role_password="$POSTGRES_PASSWORD" <<'SQL'
ALTER ROLE authenticator WITH PASSWORD :'role_password';
ALTER ROLE supabase_storage_admin WITH PASSWORD :'role_password';
SQL
