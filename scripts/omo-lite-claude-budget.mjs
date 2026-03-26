#!/usr/bin/env node

import {
  clearClaudeBudgetOverride,
  resolveClaudeBudgetState,
  writeClaudeBudgetOverride,
} from "./lib/omo-lite-claude-budget.mjs";

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/omo-lite-claude-budget.mjs [options]",
      "",
      "Options:",
      "  --status                         Print the resolved Claude budget state",
      "  --set <state>                    Set repo-local override: available | constrained | unavailable",
      "  --clear                          Remove repo-local override file",
      "  --reason <text>                  Optional reason to persist with --set",
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
    status: false,
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
    if (token === "--status") {
      options.status = true;
      continue;
    }
    if (token === "--clear") {
      options.clear = true;
      continue;
    }

    if (token === "--set" || token === "--reason") {
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

  if (options.set) {
    const result = writeClaudeBudgetOverride({
      state: options.set,
      reason: options.reason,
    });

    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    process.stdout.write(
      `Set Claude budget override to ${result.override.state} at ${result.overridePath}\n`,
    );
    return;
  }

  if (options.clear) {
    const result = clearClaudeBudgetOverride({});

    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    process.stdout.write(`Cleared Claude budget override at ${result.overridePath}\n`);
    return;
  }

  const resolved = resolveClaudeBudgetState({});

  if (options.json || options.status || (!options.set && !options.clear)) {
    if (options.json) {
      process.stdout.write(`${JSON.stringify(resolved, null, 2)}\n`);
      return;
    }

    process.stdout.write(
      [
        `Claude budget state: ${resolved.state}`,
        `Source: ${resolved.source}`,
        resolved.reason ? `Reason: ${resolved.reason}` : null,
      ]
        .filter(Boolean)
        .join("\n") + "\n",
    );
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
