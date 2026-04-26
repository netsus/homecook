#!/usr/bin/env node

import { readRuntimeState } from "./lib/omo-session-runtime.mjs";
import { generateOmoSliceReport } from "./lib/omo-slice-report.mjs";

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/omo-report.mjs --work-item <id> [options]",
      "",
      "Options:",
      "  --work-item <id>       Workflow v2 work item / slice id",
      "  --now <iso>            Override report generation time",
      "  --json                 Print JSON result",
      "  --help                 Show this help text",
      "",
    ].join("\n"),
  );
}

function requireValue(argv, index, token) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${token} requires a value.`);
  }

  return value;
}

function parseArgs(argv) {
  const options = {
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") continue;
    if (token === "--help") {
      options.help = true;
      continue;
    }
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--work-item" || token === "--now") {
      const key = token
        .replace(/^--/, "")
        .replace(/-([a-z])/g, (_, character) => character.toUpperCase());
      options[key] = requireValue(argv, index, token);
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${token}`);
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    process.exit(0);
  }

  if (!options.workItem) {
    throw new Error("--work-item is required.");
  }

  const runtime = readRuntimeState({
    rootDir: process.cwd(),
    workItemId: options.workItem,
    slice: options.workItem,
  }).state;
  const result = generateOmoSliceReport({
    rootDir: process.cwd(),
    workItemId: options.workItem,
    runtime,
    now: options.now,
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ reportPath: result.reportPath }, null, 2)}\n`);
    return;
  }

  process.stdout.write(`Report: ${result.reportPath}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
