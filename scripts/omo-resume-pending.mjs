#!/usr/bin/env node

import { resumePendingWorkItems } from "./lib/omo-session-orchestrator.mjs";

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/omo-resume-pending.mjs [options]",
      "",
      "Options:",
      "  --claude-budget-state <state>    Optional override: available | constrained | unavailable",
      "  --mode <artifact-only|execute>   Default: execute",
      "  --opencode-bin <path>            Override opencode binary path",
      "  --now <iso-timestamp>            Override timestamp for deterministic runs/tests",
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
    mode: "execute",
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

    if (
      token === "--claude-budget-state" ||
      token === "--mode" ||
      token === "--opencode-bin" ||
      token === "--now"
    ) {
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

  const results = resumePendingWorkItems({
    claudeBudgetState: options.claudeBudgetState,
    mode: options.mode,
    opencodeBin: options.opencodeBin,
    now: options.now,
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    return;
  }

  if (results.length === 0) {
    process.stdout.write("No due blocked work items found.\n");
    return;
  }

  process.stdout.write(
    `${results
      .map(
        (result) =>
          `${result.workItemId}: stage ${result.stage} (${result.execution.mode})`,
      )
      .join("\n")}\n`,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
