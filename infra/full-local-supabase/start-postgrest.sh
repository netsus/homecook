#!/bin/sh
set -eu

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
export PGRST_DB_URI="postgres://authenticator:${POSTGRES_PASSWORD}@postgres:5432/postgres"
exec postgrest +RTS -N2 -RTS
