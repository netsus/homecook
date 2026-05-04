#!/usr/bin/env node

import {
  readAllWorkItemSessionStatuses,
  readWorkItemSessionStatus,
} from "./lib/omo-session-orchestrator.mjs";
import { formatFullStatus, formatFullStatusList } from "./lib/omo-status-summary.mjs";

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/omo-status.mjs [--work-item <id>] [options]",
      "",
      "Options:",
      "  --work-item <id>                 Workflow-v2 work item id",
      "  --all                            Show all repo-local OMO runtime states",
      "  --slice <id>                     Optional slice override for non-product work items",
      "  --json                           Print JSON output",
      "  --help                           Show this help text",
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
    if (token === "--all") {
      options.all = true;
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

  if (options.all || !options.workItem) {
    const statuses = readAllWorkItemSessionStatuses({
      rootDir: process.cwd(),
    });
    if (options.json) {
      process.stdout.write(`${JSON.stringify(statuses, null, 2)}\n`);
      return;
    }

    process.stdout.write(`${formatFullStatusList(statuses)}\n`);
    return;
  }

  const status = readWorkItemSessionStatus({
    workItemId: options.workItem,
    slice: options.slice,
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${formatFullStatus(status)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
