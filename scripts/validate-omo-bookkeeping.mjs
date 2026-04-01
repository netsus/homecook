#!/usr/bin/env node

import { validateOmoBookkeeping } from "./lib/validate-omo-bookkeeping.mjs";

const results = validateOmoBookkeeping();
const failed = results.filter((result) => result.errors.length > 0);

if (failed.length === 0) {
  process.stdout.write("omo bookkeeping validation passed\n");
  process.exit(0);
}

for (const result of failed) {
  console.error(`omo bookkeeping validation failed for ${result.name}`);
  for (const error of result.errors) {
    console.error(`- ${error.path}: ${error.message}`);
  }
}

process.exit(1);
