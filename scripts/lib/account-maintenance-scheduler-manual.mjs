import { resolve } from "node:path";

import {
  ACCOUNT_MAINTENANCE_LABEL,
  renderAccountMaintenanceLaunchdPlist,
} from "./account-maintenance-scheduler.mjs";

export function buildManualSchedulerAction({
  action,
  dryRun,
  homeDir,
  rootDir = process.cwd(),
}) {
  if (action !== "install" && action !== "uninstall") {
    throw new Error(`unsupported scheduler action: ${action}`);
  }
  if (!dryRun) {
    throw new Error(
      `${action} is Manual Only; inspect --dry-run output before operator execution`,
    );
  }
  if (typeof homeDir !== "string" || homeDir.trim() === "") {
    throw new Error("homeDir must be a non-empty string");
  }

  const target = resolve(
    homeDir,
    "Library",
    "LaunchAgents",
    `${ACCOUNT_MAINTENANCE_LABEL}.plist`,
  );

  return {
    ok: true,
    action,
    dryRun: true,
    checkedLaunchctl: false,
    manualOnly: true,
    target,
    renderedPlist:
      action === "install"
        ? renderAccountMaintenanceLaunchdPlist({
            rootDir,
            homeDir,
          })
        : null,
  };
}

export function runManualSchedulerCli(action, argv) {
  let homeDir = process.env.HOME;
  let dryRun = false;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") continue;
    if (token === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (token === "--json") {
      json = true;
      continue;
    }
    if (token === "--home-dir") {
      homeDir = argv[index + 1];
      if (!homeDir || homeDir.startsWith("--")) {
        throw new Error("--home-dir requires a value");
      }
      index += 1;
      continue;
    }
    throw new Error(`unknown option: ${token}`);
  }

  const result = buildManualSchedulerAction({
    action,
    dryRun,
    homeDir,
  });
  process.stdout.write(
    json
      ? `${JSON.stringify(result, null, 2)}\n`
      : `${action} dry-run target: ${result.target}\n`,
  );
}
