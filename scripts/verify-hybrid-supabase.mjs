#!/usr/bin/env node

const message =
  "FORBIDDEN: hybrid remote/local verification is historical under the local-only Supabase contract.";

process.stderr.write(`${message}\n`);
process.exitCode = 1;
