#!/bin/sh
set -eu

: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${HYBRID_AUTH_EXPECTED_ISSUER:?HYBRID_AUTH_EXPECTED_ISSUER is required}"
: "${HYBRID_SESSION_ATTESTATION_HMAC_KEY_V1:?HYBRID_SESSION_ATTESTATION_HMAC_KEY_V1 is required}"

psql \
  --dbname "$POSTGRES_DB" \
  --username supabase_admin \
  --set ON_ERROR_STOP=1 \
  --set role_password="$POSTGRES_PASSWORD" \
  --set database_name="$POSTGRES_DB" \
  --set auth_expected_issuer="$HYBRID_AUTH_EXPECTED_ISSUER" \
  --set attestation_hmac_key="$HYBRID_SESSION_ATTESTATION_HMAC_KEY_V1" <<'SQL'
ALTER ROLE authenticator WITH PASSWORD :'role_password';
ALTER ROLE supabase_storage_admin WITH PASSWORD :'role_password';
ALTER DATABASE :"database_name"
  SET app.settings.auth_expected_issuer TO :'auth_expected_issuer';
ALTER DATABASE :"database_name"
  SET app.settings.homecook_session_attestation_hmac_key_v1
  TO :'attestation_hmac_key';
SQL
