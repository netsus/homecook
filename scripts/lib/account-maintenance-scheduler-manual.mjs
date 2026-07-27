import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

import {
  ACCOUNT_MAINTENANCE_LABEL,
  renderAccountMaintenanceLaunchdPlist,
} from "./account-maintenance-scheduler.mjs";
import {
  ACCOUNT_MAINTENANCE_KEYCHAIN_ACCOUNT,
  ACCOUNT_MAINTENANCE_KEYCHAIN_SERVICE,
  normalizeAccountMaintenanceTickUrl,
} from "./account-maintenance-live.mjs";

function normalizeExactCommit(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/.test(value)) {
    throw new Error("expectedCommit must be an exact 40-character Git SHA");
  }
  return value;
}

export function installAccountMaintenanceLaunchd({
  confirmed,
  expectedCommit,
  tickUrl,
  homeDir,
  rootDir = process.cwd(),
  userId = process.getuid(),
  execFile = execFileSync,
  fileSystem = {
    mkdir: mkdirSync,
    writeFile: writeFileSync,
    chmod: chmodSync,
    exists: existsSync,
    readFile: readFileSync,
    rename: renameSync,
    rm: rmSync,
  },
}) {
  if (!confirmed) {
    throw new Error("Manual Only confirmation is required for launchd install");
  }
  if (typeof homeDir !== "string" || homeDir.trim() === "") {
    throw new Error("homeDir must be a non-empty string");
  }
  const exactCommit = normalizeExactCommit(expectedCommit);
  const normalizedTickUrl = normalizeAccountMaintenanceTickUrl(tickUrl);
  const normalizedRootDir = resolve(rootDir);
  const gitOptions = {
    cwd: normalizedRootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  };
  const head = execFile("git", ["rev-parse", "HEAD"], gitOptions).trim();
  const master = execFile(
    "git",
    ["rev-parse", "origin/master"],
    gitOptions,
  ).trim();
  if (head !== exactCommit || master !== exactCommit) {
    throw new Error("Launchd install requires the exact merged origin/master commit");
  }

  execFile(
    "/usr/bin/security",
    [
      "find-generic-password",
      "-s",
      ACCOUNT_MAINTENANCE_KEYCHAIN_SERVICE,
      "-a",
      ACCOUNT_MAINTENANCE_KEYCHAIN_ACCOUNT,
    ],
    { stdio: "ignore" },
  );

  const launchAgentsDir = resolve(homeDir, "Library", "LaunchAgents");
  const target = resolve(
    launchAgentsDir,
    `${ACCOUNT_MAINTENANCE_LABEL}.plist`,
  );
  const temporaryTarget = `${target}.tmp-${process.pid}`;
  const previousPlist = fileSystem.exists(target)
    ? fileSystem.readFile(target, "utf8")
    : null;
  const renderedPlist = renderAccountMaintenanceLaunchdPlist({
    rootDir: normalizedRootDir,
    homeDir,
    tickUrl: normalizedTickUrl,
  });

  fileSystem.mkdir(launchAgentsDir, { recursive: true, mode: 0o700 });
  try {
    fileSystem.writeFile(temporaryTarget, renderedPlist, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    fileSystem.chmod(temporaryTarget, 0o600);
    fileSystem.rename(temporaryTarget, target);
  } catch (error) {
    fileSystem.rm(temporaryTarget, { force: true });
    throw error;
  }

  const domain = `gui/${userId}`;
  let previousJobWasLoaded = false;
  try {
    execFile("/bin/launchctl", ["bootout", `${domain}/${ACCOUNT_MAINTENANCE_LABEL}`], {
      stdio: "ignore",
    });
    previousJobWasLoaded = true;
  } catch {
    // A first install has no prior job to boot out.
  }
  try {
    execFile("/bin/launchctl", ["bootstrap", domain, target], {
      stdio: "ignore",
    });
    execFile(
      "/bin/launchctl",
      ["kickstart", "-k", `${domain}/${ACCOUNT_MAINTENANCE_LABEL}`],
      { stdio: "ignore" },
    );
  } catch {
    try {
      execFile(
        "/bin/launchctl",
        ["bootout", `${domain}/${ACCOUNT_MAINTENANCE_LABEL}`],
        { stdio: "ignore" },
      );
    } catch {
      // The replacement may have failed before launchd loaded it.
    }

    if (previousPlist === null) {
      fileSystem.rm(target, { force: true });
    } else {
      fileSystem.writeFile(temporaryTarget, previousPlist, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      fileSystem.chmod(temporaryTarget, 0o600);
      fileSystem.rename(temporaryTarget, target);
      if (previousJobWasLoaded) {
        execFile("/bin/launchctl", ["bootstrap", domain, target], {
          stdio: "ignore",
        });
        execFile(
          "/bin/launchctl",
          ["kickstart", "-k", `${domain}/${ACCOUNT_MAINTENANCE_LABEL}`],
          { stdio: "ignore" },
        );
      }
    }
    throw new Error("Launchd install failed and the previous state was restored.");
  }

  return {
    ok: true,
    action: "install",
    exactCommit,
    target,
    secretSource: "macos-keychain",
  };
}

export function buildManualSchedulerAction({
  action,
  dryRun,
  homeDir,
  rootDir = process.cwd(),
  tickUrl,
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
            tickUrl: normalizeAccountMaintenanceTickUrl(tickUrl),
          })
        : null,
  };
}

export function runManualSchedulerCli(action, argv) {
  let homeDir = process.env.HOME;
  let dryRun = false;
  let json = false;
  let confirmed = false;
  let expectedCommit;
  let tickUrl;

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
    if (token === "--confirm-manual-only") {
      confirmed = true;
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
    if (token === "--expected-commit") {
      expectedCommit = argv[index + 1];
      if (!expectedCommit || expectedCommit.startsWith("--")) {
        throw new Error("--expected-commit requires a value");
      }
      index += 1;
      continue;
    }
    if (token === "--tick-url") {
      tickUrl = argv[index + 1];
      if (!tickUrl || tickUrl.startsWith("--")) {
        throw new Error("--tick-url requires a value");
      }
      index += 1;
      continue;
    }
    throw new Error(`unknown option: ${token}`);
  }

  const result =
    action === "install" && !dryRun
      ? installAccountMaintenanceLaunchd({
          confirmed,
          expectedCommit,
          tickUrl,
          homeDir,
        })
      : buildManualSchedulerAction({
          action,
          dryRun,
          homeDir,
          tickUrl,
        });
  process.stdout.write(
    json
      ? `${JSON.stringify(result, null, 2)}\n`
      : `${action} ${result.dryRun ? "dry-run" : "complete"} target: ${result.target}\n`,
  );
}
