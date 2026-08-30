#!/bin/sh
set -eu

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
DB_NAME="${HOMECOOK_REHEARSAL_DB_NAME:-postgres}"
if [ "$DB_NAME" != "postgres" ]; then
  : "${HOMECOOK_REHEARSAL_RUN_ID:?HOMECOOK_REHEARSAL_RUN_ID is required for DB override}"
  DB_SUFFIX="${DB_NAME#hc_r2_}"
  RUN_COMPACT="$(printf '%s' "$HOMECOOK_REHEARSAL_RUN_ID" | tr -d '-')"
  case "$DB_NAME:$DB_SUFFIX" in
    hc_r2_*:????????????????) ;;
    *) exit 64 ;;
  esac
  case "$DB_SUFFIX" in *[!0-9a-f]*) exit 64 ;; esac
  case "$RUN_COMPACT" in *[!0-9a-f]*|???????????????????????????????) exit 64 ;; esac
  [ "${#RUN_COMPACT}" -eq 32 ] || exit 64
  [ "$DB_SUFFIX" = "${RUN_COMPACT%????????????????}" ] || exit 64
fi
export GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:${POSTGRES_PASSWORD}@postgres:5432/${DB_NAME}"
exec auth
