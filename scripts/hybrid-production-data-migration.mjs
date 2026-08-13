#!/usr/bin/env node

process.stderr.write(
  "FORBIDDEN: hybrid production data migration is historical; use full-local recovery tooling.\n",
);
process.exit(1);
