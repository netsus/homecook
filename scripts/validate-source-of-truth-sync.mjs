#!/usr/bin/env node

import { validateSourceOfTruthSync } from "./lib/validate-source-of-truth-sync.mjs";

const results = validateSourceOfTruthSync();
const failed = results.filter((result) => result.errors.length > 0);

if (failed.length === 0) {
  process.stdout.write("source-of-truth sync validation passed\n");
  process.exit(0);
}

for (const result of failed) {
  console.error(`source-of-truth sync validation failed for ${result.name}`);
  for (const error of result.errors) {
    console.error(`- ${error.path}: ${error.message}`);
  }
}

process.exit(1);
