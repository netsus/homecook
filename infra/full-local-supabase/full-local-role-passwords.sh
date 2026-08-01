#!/bin/sh
set -eu

: "${HOMECOOK_POSTGRES_ROLE_PASSWORD:?HOMECOOK_POSTGRES_ROLE_PASSWORD is required}"

psql \
  --dbname postgres \
  --username supabase_admin \
  --set ON_ERROR_STOP=1 \
  --set role_password="$HOMECOOK_POSTGRES_ROLE_PASSWORD" <<'SQL'
SET log_statement = 'none';
ALTER ROLE authenticator WITH PASSWORD :'role_password';
ALTER ROLE supabase_auth_admin WITH PASSWORD :'role_password';
ALTER ROLE supabase_storage_admin WITH PASSWORD :'role_password';
ALTER ROLE supabase_admin WITH PASSWORD :'role_password';
SQL
