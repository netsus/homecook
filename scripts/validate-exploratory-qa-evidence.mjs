#!/usr/bin/env node

import { validateExploratoryQaEvidence } from "./lib/validate-exploratory-qa-evidence.mjs";

const prBodyFile = process.argv[2];
const env = prBodyFile
  ? {
      ...process.env,
      PR_BODY_FILE: prBodyFile,
    }
  : process.env;

const results = validateExploratoryQaEvidence({
  env,
});
const failed = results.filter((result) => result.errors.length > 0);

if (failed.length === 0) {
  process.stdout.write("exploratory QA evidence validation passed\n");
  process.exit(0);
}

for (const result of failed) {
  console.error(`exploratory QA evidence validation failed for ${result.name}`);
  for (const error of result.errors) {
    console.error(`- ${error.path}: ${error.message}`);
  }
}

process.exit(1);
