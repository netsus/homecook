#!/usr/bin/env node

import {
  appendAccountMaintenanceJsonLog,
  buildAccountMaintenanceTickResult,
  getAccountMaintenanceLogPaths,
} from "./lib/account-maintenance-scheduler.mjs";
import { runAccountMaintenanceLiveTick } from "./lib/account-maintenance-live.mjs";

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/account-maintenance-tick.mjs [options]",
      "",
      "Options:",
      "  --dry-run                      Print the feature-off maintenance plan",
      "  --mode <dry-run|launchd>       Reserved runner mode (default: dry-run)",
      "  --verify-wrong-secret          Run the one-time Manual Only 401 proof",
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
    verifyWrongSecret: false,
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
    if (token === "--verify-wrong-secret") {
      options.verifyWrongSecret = true;
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const dryRun = options.dryRun || options.mode !== "launchd";
  if (!dryRun) {
    let result;
    try {
      result = await runAccountMaintenanceLiveTick({
        tickUrl: process.env.HOMECOOK_MAINTENANCE_TICK_URL,
        verifyWrongSecret: options.verifyWrongSecret,
      });
      appendAccountMaintenanceJsonLog({
        logPath: getAccountMaintenanceLogPaths().stdout,
        entry: result,
      });
    } catch {
      appendAccountMaintenanceJsonLog({
        logPath: getAccountMaintenanceLogPaths().stdout,
        entry: {
          event: "account_maintenance_tick",
          timestamp: new Date().toISOString(),
          ok: false,
          activationAllowed: false,
          externalHeartbeatConfigured: false,
          externalAlertConfigured: false,
        },
      });
      throw new Error("Account maintenance live tick failed closed.");
    }
    if (options.json) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
    return;
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
  await main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
