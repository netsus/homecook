#!/usr/bin/env node

import {
  loadProductionEnvFiles,
  parseProductionDataQualityArgs,
  validateProductionDataQuality,
} from "./lib/production-data-quality.mjs";

loadProductionEnvFiles();

function printHuman(result) {
  if (result.ok) {
    process.stdout.write("Production data quality gate passed.\n");
    if (result.db.skipped) {
      process.stdout.write(`DB scan skipped: ${result.db.skipReason}\n`);
    }
    for (const warning of result.warnings) {
      process.stdout.write(`Warning: ${warning}\n`);
    }
    return;
  }

  process.stderr.write("Production data quality gate failed.\n");
  for (const error of result.errors) {
    process.stderr.write(`- [${error.code}] ${error.message}\n`);
  }
}

try {
  const args = parseProductionDataQualityArgs(process.argv.slice(2));
  const result = await validateProductionDataQuality({
    limit: args.limit,
    requireDb: args.requireDb,
  });

  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    printHuman(result);
  }

  process.exit(result.ok ? 0 : 1);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
