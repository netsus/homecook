#!/bin/sh
set -eu

: "${HOMECOOK_SECRET_EXPORTS:?HOMECOOK_SECRET_EXPORTS is required}"

old_ifs=$IFS
IFS=';'
for mapping in $HOMECOOK_SECRET_EXPORTS; do
  case "$mapping" in
    *=*) ;;
    *) echo "Invalid secret mapping." >&2; exit 64 ;;
  esac
  env_name=${mapping%%=*}
  file_name=${mapping#*=}
  case "$env_name" in
    ''|*[!A-Z0-9_]*) echo "Invalid secret environment name." >&2; exit 64 ;;
  esac
  case "$file_name" in
    ''|*[!a-z0-9_]*) echo "Invalid secret file name." >&2; exit 64 ;;
  esac
  secret_path="/run/secrets/$file_name"
  if [ ! -f "$secret_path" ] || [ ! -s "$secret_path" ]; then
    echo "Required secret file is missing: $file_name" >&2
    exit 78
  fi
  secret_value=$(cat "$secret_path")
  export "$env_name=$secret_value"
  unset secret_value
done
IFS=$old_ifs

exec "$@"
