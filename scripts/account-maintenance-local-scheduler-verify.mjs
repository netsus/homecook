#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ACCOUNT_MAINTENANCE_LOCAL_LABEL,
  buildAccountMaintenanceLocalSchedulerVerification,
} from "./lib/account-maintenance-scheduler.mjs";

function requireValue(argv, index, token) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${token} requires a value`);
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
    throw new Error(`unknown option: ${token}`);
  }
  return options;
}

function readInstalledState({ homeDir, dryRun }) {
  const target = resolve(
    homeDir,
    "Library",
    "LaunchAgents",
    `${ACCOUNT_MAINTENANCE_LOCAL_LABEL}.plist`,
  );
  if (dryRun) {
    return {
      checkedLaunchctl: false,
      installed: existsSync(target),
      loaded: null,
      plist: null,
      target,
    };
  }

  let loaded = false;
  try {
    execFileSync(
      "/bin/launchctl",
      ["print", `gui/${process.getuid()}/${ACCOUNT_MAINTENANCE_LOCAL_LABEL}`],
      { stdio: "ignore" },
    );
    loaded = true;
  } catch {
    loaded = false;
  }

  return {
    checkedLaunchctl: true,
    installed: existsSync(target),
    loaded,
    plist: existsSync(target) ? readFileSync(target, "utf8") : null,
    target,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const homeDir = options.homeDir ?? process.env.HOME;
  const verification = buildAccountMaintenanceLocalSchedulerVerification({
    rootDir: process.cwd(),
    homeDir,
    dryRun: options.dryRun,
  });
  const installedState = readInstalledState({
    homeDir,
    dryRun: options.dryRun,
  });
  const result = {
    ...verification,
    checkedLaunchctl: installedState.checkedLaunchctl,
    installed: installedState.installed,
    loaded: installedState.loaded,
    plistMatches:
      options.dryRun
        ? null
        : installedState.plist === verification.launchd.plist,
    target: installedState.target,
  };
  const ok =
    result.ok
    && (
      options.dryRun
      || (result.installed && result.loaded && result.plistMatches)
    );

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ ...result, ok }, null, 2)}\n`);
  } else {
    process.stdout.write(
      [
        `Account maintenance local scheduler verify: ${ok ? "pass" : "fail"}`,
        "",
        `Label: ${result.launchd.label}`,
        `Cadence: ${result.launchd.startIntervalSeconds}s`,
        `Target: ${result.target}`,
        `Installed: ${result.installed ? "yes" : "no"}`,
        `Loaded: ${result.loaded === null ? "not checked" : result.loaded ? "yes" : "no"}`,
        `Plist matches dry-run contract: ${
          result.plistMatches === null
            ? "not checked"
            : result.plistMatches
              ? "yes"
              : "no"
        }`,
      ].join("\n") + "\n",
    );
  }

  if (!ok) {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
