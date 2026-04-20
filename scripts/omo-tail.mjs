#!/usr/bin/env node

import process from "node:process";

import {
  buildOperatorTailSnapshot,
  formatOperatorTailSnapshot,
  toSerializableOperatorTailSnapshot,
} from "./lib/omo-tail.mjs";

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/omo-tail.mjs --work-item <id> [options]",
      "",
      "Options:",
      "  --work-item <id>                 Workflow-v2 work item id",
      "  --slice <id>                     Optional slice override for non-product work items",
      "  --lines <n>                      Tail the last N log lines per stream (default: 20)",
      "  --watch <seconds>                Refresh every N seconds until interrupted",
      "  --json                           Print JSON output",
      "  --help                           Show this help text",
      "",
      "Examples:",
      "  pnpm omo:tail -- --work-item 07-meal-manage",
      "  pnpm omo:tail -- --work-item 07-meal-manage --lines 10 --watch 15",
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
    lines: 20,
    watchSeconds: null,
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
    if (token === "--work-item" || token === "--slice") {
      const key = token
        .replace(/^--/, "")
        .replace(/-([a-z])/g, (_, character) => character.toUpperCase());
      options[key] = requireValue(argv, index, token);
      index += 1;
      continue;
    }
    if (token === "--lines") {
      const rawValue = requireValue(argv, index, token);
      const lines = Number.parseInt(rawValue, 10);
      if (!Number.isInteger(lines) || lines < 1) {
        throw new Error("--lines requires an integer value greater than or equal to 1.");
      }

      options.lines = lines;
      index += 1;
      continue;
    }
    if (token === "--watch") {
      const rawValue = requireValue(argv, index, token);
      const watchSeconds = Number.parseInt(rawValue, 10);
      if (!Number.isInteger(watchSeconds) || watchSeconds < 1) {
        throw new Error("--watch requires an integer value greater than or equal to 1.");
      }

      options.watchSeconds = watchSeconds;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${token}`);
  }

  return options;
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    process.exit(0);
  }

  if (!options.workItem) {
    throw new Error("--work-item is required.");
  }

  let isFirstIteration = true;
  do {
    const snapshot = buildOperatorTailSnapshot({
      workItemId: options.workItem,
      slice: options.slice,
      lines: options.lines,
    });

    if (!isFirstIteration) {
      process.stdout.write("\n");
    }

    if (options.json) {
      process.stdout.write(`${JSON.stringify(toSerializableOperatorTailSnapshot(snapshot), null, 2)}\n`);
    } else {
      process.stdout.write(`${formatOperatorTailSnapshot(snapshot)}\n`);
    }

    isFirstIteration = false;
    if (!options.watchSeconds) {
      break;
    }

    await sleep(options.watchSeconds * 1000);
  } while (true);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
