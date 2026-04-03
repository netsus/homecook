#!/usr/bin/env node

import { validateAutomationSpecs } from "./lib/validate-workflow-v2.mjs";

const results = validateAutomationSpecs();
const failed = results.filter((result) => result.errors.length > 0);

if (failed.length === 0) {
  process.stdout.write("automation-spec validation passed\n");
  process.exit(0);
}

for (const result of failed) {
  console.error(`automation-spec validation failed for ${result.name}`);
  for (const error of result.errors) {
    console.error(`- ${error.path}: ${error.message}`);
  }
}

process.exit(1);
