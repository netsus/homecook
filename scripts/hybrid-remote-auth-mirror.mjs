#!/usr/bin/env node

const message =
  "FORBIDDEN: remote Auth mirror is historical under the local-only Supabase contract.";

process.stderr.write(`${message}\n`);
process.exitCode = 1;
