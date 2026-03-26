#!/usr/bin/env node

import { startWorkItemSession } from "./lib/omo-session-orchestrator.mjs";

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/omo-start.mjs --work-item <id> [options]",
      "",
      "Options:",
      "  --work-item <id>                 Workflow-v2 work item id",
      "  --slice <id>                     Optional slice override for non-product work items",
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
      token === "--work-item" ||
      token === "--slice" ||
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

  const result = startWorkItemSession({
    workItemId: options.workItem,
    slice: options.slice,
    claudeBudgetState: options.claudeBudgetState,
    mode: options.mode,
    opencodeBin: options.opencodeBin,
    now: options.now,
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  process.stdout.write(
    [
      `Started OMO session orchestration for ${result.workItemId}`,
      `Stage: ${result.stage}`,
      `Slice: ${result.slice}`,
      `Artifact dir: ${result.artifactDir}`,
      `Execution mode: ${result.execution.mode}`,
      `Actor: ${result.dispatch.actor}`,
    ].join("\n") + "\n",
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
