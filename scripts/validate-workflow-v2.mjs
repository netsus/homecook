#!/usr/bin/env node

import { validateWorkflowV2Examples } from "./lib/validate-workflow-v2.mjs";

const results = validateWorkflowV2Examples();
const failed = results.filter((result) => result.errors.length > 0);

if (failed.length === 0) {
  process.stdout.write("workflow-v2 validation passed\n");
  process.exit(0);
}

for (const result of failed) {
  console.error(`workflow-v2 validation failed for ${result.name}`);
  for (const error of result.errors) {
    console.error(`- ${error.path}: ${error.message}`);
  }
}

process.exit(1);
