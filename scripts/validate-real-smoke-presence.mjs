#!/usr/bin/env node

import { validateRealSmokePresence } from "./lib/validate-real-smoke-presence.mjs";

const prBodyFile = process.argv[2];
const env = prBodyFile
  ? {
      ...process.env,
      PR_BODY_FILE: prBodyFile,
    }
  : process.env;

const results = validateRealSmokePresence({
  env,
});
const failed = results.filter((result) => result.errors.length > 0);

if (failed.length === 0) {
  process.stdout.write("real smoke presence validation passed\n");
  process.exit(0);
}

for (const result of failed) {
  console.error(`real smoke presence validation failed for ${result.name}`);
  for (const error of result.errors) {
    console.error(`- ${error.path}: ${error.message}`);
  }
}

process.exit(1);
