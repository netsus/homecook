#!/usr/bin/env node

import { runStageWithArtifacts } from "./lib/omo-lite-runner.mjs";

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/omo-lite-run-stage.mjs --slice <id> --stage <1-6> [options]",
      "",
      "Options:",
      "  --slice <id>                      Product slice id",
      "  --stage <1-6>                    Product slice stage number",
      "  --work-item <id>                 Optional workflow-v2 work item id for artifact metadata",
      "  --claude-budget-state <state>    Optional override: available | constrained | unavailable",
      "  --mode <artifact-only|execute>   Artifact bundle only or run opencode for Codex stages",
      "  --artifact-dir <path>            Override artifact output directory",
      "  --opencode-bin <path>            Override opencode binary path",
      "  --agent <name>                   Override OMO/OpenCode agent for executable stages",
      "  --sync-status                    Apply the dispatch status patch to workflow-v2 tracked state",
      "  --json                           Print run result as JSON",
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
    mode: "artifact-only",
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
    if (token === "--sync-status") {
      options.syncStatus = true;
      continue;
    }

    if (
      token === "--slice" ||
      token === "--stage" ||
      token === "--work-item" ||
      token === "--claude-budget-state" ||
      token === "--mode" ||
      token === "--artifact-dir" ||
      token === "--opencode-bin" ||
      token === "--agent"
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

  const result = runStageWithArtifacts({
    slice: options.slice,
    stage: options.stage,
    workItemId: options.workItem,
    claudeBudgetState: options.claudeBudgetState,
    mode: options.mode,
    artifactDir: options.artifactDir,
    opencodeBin: options.opencodeBin,
    agent: options.agent,
    syncStatus: options.syncStatus,
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  process.stdout.write(
    [
      `Prepared OMO-lite stage artifact for slice ${options.slice} stage ${options.stage}`,
      `Artifact dir: ${result.artifactDir}`,
      `Execution mode: ${result.execution.mode}`,
      `Actor: ${result.dispatch.actor}`,
      result.execution.executed
        ? `Executed via agent: ${result.execution.agent}`
        : `Execution skipped: ${result.execution.reason ?? "artifact-only mode"}`,
    ].join("\n") + "\n",
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
