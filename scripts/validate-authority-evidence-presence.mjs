#!/usr/bin/env node

import { validateAuthorityEvidencePresence } from "./lib/validate-authority-evidence-presence.mjs";

const results = validateAuthorityEvidencePresence();
const failed = results.filter((result) => result.errors.length > 0);

if (failed.length === 0) {
  process.stdout.write("authority evidence presence validation passed\n");
  process.exit(0);
}

for (const result of failed) {
  console.error(`authority evidence presence validation failed for ${result.name}`);
  for (const error of result.errors) {
    console.error(`- ${error.path}: ${error.message}`);
  }
}

process.exit(1);
