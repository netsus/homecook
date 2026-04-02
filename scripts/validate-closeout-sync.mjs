#!/usr/bin/env node

import { validateCloseoutSync } from "./lib/validate-closeout-sync.mjs";

const results = validateCloseoutSync();
const failed = results.filter((result) => result.errors.length > 0);

if (failed.length === 0) {
  process.stdout.write("closeout sync validation passed\n");
  process.exit(0);
}

for (const result of failed) {
  console.error(`closeout sync validation failed for ${result.name}`);
  for (const error of result.errors) {
    console.error(`- ${error.path}: ${error.message}`);
  }
}

process.exit(1);
