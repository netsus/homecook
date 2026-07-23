#!/usr/bin/env node

import {
  buildAccountMaintenanceSchedulerVerification,
} from "./lib/account-maintenance-scheduler.mjs";

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/account-maintenance-scheduler-verify.mjs [options]",
      "",
      "Options:",
      "  --dry-run                      Verify the scheduler contract without launchctl",
      "  --home-dir <path>              Override HOME used for rendered log paths",
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
    if (token === "--home-dir") {
      options.homeDir = requireValue(argv, index, token);
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

  const result = buildAccountMaintenanceSchedulerVerification({
    rootDir: process.cwd(),
    homeDir: options.homeDir ?? process.env.HOME,
    dryRun: options.dryRun,
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(
      [
        `Account maintenance scheduler verify: ${result.ok ? "pass" : "fail"}`,
        "",
        `Label: ${result.launchd.label}`,
        `Cadence: ${result.launchd.startIntervalSeconds}s`,
        `Stdout: ${result.launchd.standardOutPath}`,
        `Stderr: ${result.launchd.standardErrorPath}`,
        `Manual-only: ${result.manualOnly.join(", ")}`,
      ].join("\n") + "\n",
    );
  }

  if (!result.ok) {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
