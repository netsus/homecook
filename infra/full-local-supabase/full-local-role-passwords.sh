#!/bin/sh
set -eu

: "${HOMECOOK_POSTGRES_ROLE_PASSWORD:?HOMECOOK_POSTGRES_ROLE_PASSWORD is required}"
: "${FULL_LOCAL_AUTH_EXPECTED_ISSUER:?FULL_LOCAL_AUTH_EXPECTED_ISSUER is required}"

psql \
  --dbname postgres \
  --username supabase_admin \
  --set ON_ERROR_STOP=1 \
  --set role_password="$HOMECOOK_POSTGRES_ROLE_PASSWORD" \
  --set auth_issuer="$FULL_LOCAL_AUTH_EXPECTED_ISSUER" <<'SQL'
SET log_statement = 'none';
ALTER ROLE authenticator WITH PASSWORD :'role_password';
ALTER ROLE supabase_auth_admin WITH PASSWORD :'role_password';
ALTER ROLE supabase_storage_admin WITH PASSWORD :'role_password';
ALTER ROLE supabase_admin WITH PASSWORD :'role_password';
ALTER DATABASE postgres SET app.settings.auth_expected_issuer TO :'auth_issuer';
SQL
