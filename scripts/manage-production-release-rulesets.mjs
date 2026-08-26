#!/usr/bin/env node

import { getProductionReleaseRulesetPlan } from "./lib/production-release-rulesets.mjs";
import {
  C2_CONFIRMATION,
  executeProductionReleaseControls,
  ProductionReleaseApplyError,
} from "./lib/production-release-rulesets-apply.mjs";

function printHelp() {
  process.stdout.write(`Usage:
  node scripts/manage-production-release-rulesets.mjs plan [--root-dir <path>] [--json]
  node scripts/manage-production-release-rulesets.mjs verify [--root-dir <path>] [--actual-dir <path>] [--json]
  node scripts/manage-production-release-rulesets.mjs apply [--root-dir <path>] [--json]
  node scripts/manage-production-release-rulesets.mjs apply --execute --confirm ${C2_CONFIRMATION} \\
    --repo netsus/homecook --snapshot-dir <absolute-create-only-path> \\
    --app-id 4724458 --app-private-key-file <absolute-path>

Safety contract:
- plan / verify are read-only local desired-state validation
- apply defaults to dry-run
- apply --execute is C2-only and requires all fail-closed execution gates
`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {
    actualDir: null,
    appId: null,
    appPrivateKeyFile: null,
    command,
    confirm: null,
    execute: false,
    json: false,
    repo: null,
    rootDir: process.cwd(),
    snapshotDir: null,
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
    } else if (token === "--app-id") {
      options.appId = value;
    } else if (token === "--app-private-key-file") {
      options.appPrivateKeyFile = value;
    } else if (token === "--confirm") {
      options.confirm = value;
    } else if (token === "--repo") {
      options.repo = value;
    } else if (token === "--snapshot-dir") {
      options.snapshotDir = value;
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
    const result = executeProductionReleaseControls({
      appId: options.appId,
      confirmation: options.confirm,
      privateKeyFile: options.appPrivateKeyFile,
      repository: options.repo,
      rootDir: options.rootDir,
      snapshotDir: options.snapshotDir,
    });
    printResult(result, options.json);
    process.exit(0);
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
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof ProductionReleaseApplyError && process.argv.includes("--json")) {
    process.stderr.write(`${JSON.stringify({
      error: message,
      manual_action_required: error.manualActionRequired,
      partial_state: error.partialState,
      private_key: { supplied: process.argv.includes("--app-private-key-file") },
    }, null, 2)}\n`);
  } else {
    process.stderr.write(`${message}\n`);
  }
  process.exit(1);
}
