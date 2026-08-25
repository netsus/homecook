#!/usr/bin/env node

import { getProductionReleaseRulesetPlan } from "./lib/production-release-rulesets.mjs";

function printHelp() {
  process.stdout.write(`Usage:
  node scripts/manage-production-release-rulesets.mjs plan [--root-dir <path>] [--json]
  node scripts/manage-production-release-rulesets.mjs verify [--root-dir <path>] [--actual-dir <path>] [--json]
  node scripts/manage-production-release-rulesets.mjs apply [--root-dir <path>] [--json] [--execute]

Stage C1 scope:
- plan / verify are read-only local desired-state validation
- apply defaults to dry-run
- apply --execute remains blocked until explicit C2 operator-approved admin execution
`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {
    actualDir: null,
    command,
    execute: false,
    json: false,
    rootDir: process.cwd(),
  };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--") {
      continue;
    }
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--execute") {
      options.execute = true;
      continue;
    }

    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${token} requires a value.`);
    }

    if (token === "--root-dir") {
      options.rootDir = value;
    } else if (token === "--actual-dir") {
      options.actualDir = value;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
    index += 1;
  }

  return options;
}

function printResult(result, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  process.stdout.write(`mode: ${result.mode}\n`);
  process.stdout.write(`dry_run: ${result.dry_run ? "true" : "false"}\n`);
  process.stdout.write(`activation_blocked: ${result.activation_blocked ? "true" : "false"}\n`);
  process.stdout.write(`actual_state: ${result.actual_state}\n`);
  for (const ruleset of result.rulesets) {
    process.stdout.write(`- ${ruleset.name}: ${ruleset.pattern}\n`);
  }
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (!options.command || options.command === "help" || options.command === "--help") {
    printHelp();
    process.exit(0);
  }

  if (!["plan", "verify", "apply"].includes(options.command)) {
    throw new Error(`Unknown command: ${options.command}`);
  }

  if (options.command === "apply" && options.execute) {
    throw new Error(
      "C2 explicit operator-approved admin execution is required before apply --execute can call GitHub.",
    );
  }

  const plan = getProductionReleaseRulesetPlan({
    actualDir: options.actualDir,
    rootDir: options.rootDir,
  });
  printResult({
    dry_run: options.command === "apply",
    mode: options.command,
    ...plan,
  }, options.json);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
