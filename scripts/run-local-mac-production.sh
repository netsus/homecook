#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
NODE_BIN=${HOMECOOK_NODE_BIN:-}
CODEX_NODE_BIN=""

if [ -n "${HOME:-}" ]; then
  CODEX_NODE_BIN="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi

if [ -n "$NODE_BIN" ] && [ ! -x "$NODE_BIN" ]; then
  printf 'HOMECOOK_NODE_BIN is not executable: %s\n' "$NODE_BIN" >&2
  exit 1
fi

if [ -z "$NODE_BIN" ] && command -v node >/dev/null 2>&1; then
  NODE_BIN=$(command -v node)
fi

if [ -z "$NODE_BIN" ]; then
  for candidate in \
    "$CODEX_NODE_BIN" \
    "/opt/homebrew/bin/node" \
    "/usr/local/bin/node"
  do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      NODE_BIN=$candidate
      break
    fi
  done
fi

if [ -z "$NODE_BIN" ]; then
  printf '%s\n' \
    'Node.js was not found. Install Node.js or set HOMECOOK_NODE_BIN to its executable path.' \
    >&2
  exit 1
fi

exec "$NODE_BIN" "$SCRIPT_DIR/local-mac-production.mjs" "$@"
