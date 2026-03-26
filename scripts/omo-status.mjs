#!/usr/bin/env node

import { readWorkItemSessionStatus } from "./lib/omo-session-orchestrator.mjs";

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/omo-status.mjs --work-item <id> [options]",
      "",
      "Options:",
      "  --work-item <id>                 Workflow-v2 work item id",
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

  const status = readWorkItemSessionStatus({
    workItemId: options.workItem,
    slice: options.slice,
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
    return;
  }

  process.stdout.write(
    [
      `Work item: ${status.workItemId}`,
      `Slice: ${status.slice}`,
      `Current stage: ${status.runtime.current_stage ?? "N/A"}`,
      `Last completed stage: ${status.runtime.last_completed_stage ?? 0}`,
      `Blocked stage: ${status.runtime.blocked_stage ?? "none"}`,
      `Claude session: ${status.runtime.sessions.claude_primary.session_id ?? "missing"}`,
      `Codex session: ${status.runtime.sessions.codex_primary.session_id ?? "missing"}`,
      `Tracked lifecycle: ${status.trackedStatus?.lifecycle ?? status.trackedWorkItem.status.lifecycle}`,
      `Tracked approval: ${status.trackedStatus?.approval_state ?? status.trackedWorkItem.status.approval_state}`,
    ].join("\n") + "\n",
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
