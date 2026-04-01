#!/usr/bin/env node

import { reconcileWorkItemBookkeeping } from "./lib/omo-reconcile.mjs";

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/omo-reconcile.mjs --work-item <id> [options]",
      "",
      "Options:",
      "  --work-item <id>                 Workflow-v2 work item id",
      "  --slice <id>                     Optional slice override",
      "  --gh-bin <path>                  Override gh binary path",
      "  --now <iso-timestamp>            Override timestamp for deterministic runs/tests",
      "  --json                           Print JSON output",
      "  --help                           Show this help text",
      "",
      "Example:",
      "  pnpm omo:reconcile -- --work-item 05-planner-week-core",
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

    if (token === "--work-item" || token === "--slice" || token === "--gh-bin" || token === "--now") {
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

  const result = reconcileWorkItemBookkeeping({
    workItemId: options.workItem,
    slice: options.slice,
    ghBin: options.ghBin,
    now: options.now,
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  process.stdout.write(
    [
      `Work item: ${result.workItemId}`,
      `Slice: ${result.slice}`,
      `Action: ${result.action}`,
      `Branch: ${result.branch ?? "-"}`,
      `PR: ${result.pr?.url ?? "-"}`,
      `Checks: ${result.checks?.bucket ?? "-"}`,
    ].join("\n") + "\n",
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
