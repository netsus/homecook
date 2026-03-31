#!/usr/bin/env node

import { tickSupervisorWorkItems } from "./lib/omo-autonomous-supervisor.mjs";

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/omo-tick.mjs --all|--work-item <id> [options]",
      "",
      "Options:",
      "  --all                            Scan all waitable runtime states",
      "  --work-item <id>                 Resume a specific work item",
      "  --claude-budget-state <state>    Optional override: available | constrained | unavailable",
      "  --mode <artifact-only|execute>   Default: execute",
      "  --gh-bin <path>                  Override gh binary path",
      "  --claude-provider <name>         Override Claude provider: opencode | claude-cli",
      "  --claude-bin <path>              Override claude binary path",
      "  --claude-model <model>           Override Claude model alias/name",
      "  --claude-effort <level>          Override Claude effort: low | medium | high",
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
    all: false,
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
    if (token === "--all") {
      options.all = true;
      continue;
    }

    if (
      token === "--work-item" ||
      token === "--claude-budget-state" ||
      token === "--mode" ||
      token === "--gh-bin" ||
      token === "--claude-provider" ||
      token === "--claude-bin" ||
      token === "--claude-model" ||
      token === "--claude-effort" ||
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

  const results = tickSupervisorWorkItems({
    all: options.all,
    workItemId: options.workItem,
    claudeBudgetState: options.claudeBudgetState,
    mode: options.mode,
    ghBin: options.ghBin,
    claudeProvider: options.claudeProvider,
    claudeBin: options.claudeBin,
    claudeModel: options.claudeModel,
    claudeEffort: options.claudeEffort,
    opencodeBin: options.opencodeBin,
    now: options.now,
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    return;
  }

  if (results.length === 0) {
    process.stdout.write("No waitable work items found.\n");
    return;
  }

  process.stdout.write(
    `${results
      .map((result) => {
        const action = result.action ?? "run";
        const wait = result.wait?.kind ?? "none";
        const reason = result.reason ? ` (${result.reason})` : "";
        return `${result.workItemId}: ${action} -> ${wait}${reason}`;
      })
      .join("\n")}\n`,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
