#!/usr/bin/env node

import {
  buildAccountMaintenanceTickResult,
} from "./lib/account-maintenance-scheduler.mjs";

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/account-maintenance-tick.mjs [options]",
      "",
      "Options:",
      "  --dry-run                      Print the feature-off maintenance plan",
      "  --mode <dry-run|launchd>       Reserved runner mode (default: dry-run)",
      "  --json                         Print JSON output",
      "  --help                         Show this help text",
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
    dryRun: false,
    json: false,
    mode: "dry-run",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--") continue;
    if (token === "--help") {
      options.help = true;
      continue;
    }
    if (token === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--mode") {
      options.mode = requireValue(argv, index, token);
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
    return;
  }

  const dryRun = options.dryRun || options.mode !== "launchd";
  if (!dryRun) {
    throw new Error(
      "Live account-maintenance ticks remain manual-only until the #3 joint activation gate. Use --dry-run.",
    );
  }

  const result = buildAccountMaintenanceTickResult({
    dryRun: true,
    rootDir: process.cwd(),
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  process.stdout.write(
    [
      "Account maintenance tick: dry-run",
      "",
      `Feature state: ${result.featureState}`,
      `Endpoint: ${result.endpoint}`,
      `Cadence: ${result.cadenceSeconds}s`,
      `Phases: ${result.phases.join(" -> ")}`,
      `Live mode: manual-only until ${result.liveMode.activationGate}`,
    ].join("\n") + "\n",
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
