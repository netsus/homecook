#!/usr/bin/env node

import { superviseWorkItem } from "./lib/omo-autonomous-supervisor.mjs";
import { assertSupportedClaudeProvider } from "./lib/omo-provider-config.mjs";
import { ensureLaunchAgentInstalled } from "./lib/omo-scheduler.mjs";

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/omo-supervise.mjs --work-item <id> [options]",
      "",
      "Options:",
      "  --work-item <id>                 Workflow-v2 work item id",
      "  --slice <id>                     Optional slice override",
      "  --claude-budget-state <state>    Optional override: available | constrained | unavailable",
      "  --mode <artifact-only|execute>   Default: execute",
      "  --gh-bin <path>                  Override gh binary path",
      "  --claude-provider <name>         Override Claude provider: claude-cli",
      "  --claude-bin <path>              Override claude binary path",
      "  --claude-model <model>           Override Claude model alias/name",
      "  --claude-effort <level>          Override Claude effort: low | medium | high",
      "  --opencode-bin <path>            Override opencode binary path",
      "  --max-transitions <n>            Override per-invocation transition cap",
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
      token === "--gh-bin" ||
      token === "--claude-provider" ||
      token === "--claude-bin" ||
      token === "--claude-model" ||
      token === "--claude-effort" ||
      token === "--opencode-bin" ||
      token === "--max-transitions" ||
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

  if (options.mode !== "artifact-only" && options.workItem) {
    ensureLaunchAgentInstalled({
      rootDir: process.cwd(),
      workItemId: options.workItem,
      ghBin: options.ghBin,
      claudeBin: options.claudeBin,
      opencodeBin: options.opencodeBin,
    });
  }

  const result = superviseWorkItem({
    workItemId: options.workItem,
    slice: options.slice,
    claudeBudgetState: options.claudeBudgetState,
    mode: options.mode,
    ghBin: options.ghBin,
    claudeProvider: assertSupportedClaudeProvider(options.claudeProvider),
    claudeBin: options.claudeBin,
    claudeModel: options.claudeModel,
    claudeEffort: options.claudeEffort,
    opencodeBin: options.opencodeBin,
    maxTransitions:
      Number.isInteger(Number(options.maxTransitions)) && Number(options.maxTransitions) > 0
        ? Number(options.maxTransitions)
        : undefined,
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
      `Wait kind: ${result.wait?.kind ?? "none"}`,
      `Artifact dir: ${result.artifactDir}`,
      `Transitions: ${result.transitions.length}`,
      `Claude provider: ${result.runtime?.sessions?.claude_primary?.provider ?? "pending"}`,
    ].join("\n") + "\n",
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
