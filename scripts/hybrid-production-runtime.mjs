#!/usr/bin/env node

process.stderr.write(
  "FORBIDDEN: hybrid production runtime is historical; use the full-local production runtime.\n",
);
process.exit(1);
