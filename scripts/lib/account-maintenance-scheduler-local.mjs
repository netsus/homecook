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
  ACCOUNT_MAINTENANCE_LOCAL_LABEL,
  buildAccountMaintenanceLocalSchedulerVerification,
  renderAccountMaintenanceLocalLaunchdPlist,
} from "./account-maintenance-scheduler.mjs";

export function installAccountMaintenanceLocalLaunchd({
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
  if (typeof homeDir !== "string" || homeDir.trim() === "") {
    throw new Error("homeDir must be a non-empty string");
  }

  const normalizedRootDir = resolve(rootDir);
  const launchAgentsDir = resolve(homeDir, "Library", "LaunchAgents");
  const target = resolve(
    launchAgentsDir,
    `${ACCOUNT_MAINTENANCE_LOCAL_LABEL}.plist`,
  );
  const temporaryTarget = `${target}.tmp-${process.pid}`;
  const previousPlist = fileSystem.exists(target)
    ? fileSystem.readFile(target, "utf8")
    : null;
  const renderedPlist = renderAccountMaintenanceLocalLaunchdPlist({
    rootDir: normalizedRootDir,
    homeDir,
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
    execFile(
      "/bin/launchctl",
      ["bootout", `${domain}/${ACCOUNT_MAINTENANCE_LOCAL_LABEL}`],
      { stdio: "ignore" },
    );
    previousJobWasLoaded = true;
  } catch {
    // A first local install has no prior job to unload.
  }
  try {
    execFile("/bin/launchctl", ["bootstrap", domain, target], {
      stdio: "ignore",
    });
    execFile(
      "/bin/launchctl",
      ["kickstart", "-k", `${domain}/${ACCOUNT_MAINTENANCE_LOCAL_LABEL}`],
      { stdio: "ignore" },
    );
  } catch {
    try {
      execFile(
        "/bin/launchctl",
        ["bootout", `${domain}/${ACCOUNT_MAINTENANCE_LOCAL_LABEL}`],
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
          ["kickstart", "-k", `${domain}/${ACCOUNT_MAINTENANCE_LOCAL_LABEL}`],
          { stdio: "ignore" },
        );
      }
    }
    throw new Error(
      "Local launchd install failed and the previous state was restored.",
    );
  }

  return {
    ok: true,
    action: "install",
    label: ACCOUNT_MAINTENANCE_LOCAL_LABEL,
    target,
    liveMode: "local-dry-run",
  };
}

export function uninstallAccountMaintenanceLocalLaunchd({
  homeDir,
  userId = process.getuid(),
  execFile = execFileSync,
  fileSystem = {
    rm: rmSync,
  },
}) {
  if (typeof homeDir !== "string" || homeDir.trim() === "") {
    throw new Error("homeDir must be a non-empty string");
  }

  const target = resolve(
    homeDir,
    "Library",
    "LaunchAgents",
    `${ACCOUNT_MAINTENANCE_LOCAL_LABEL}.plist`,
  );
  const domain = `gui/${userId}`;
  try {
    execFile(
      "/bin/launchctl",
      ["bootout", `${domain}/${ACCOUNT_MAINTENANCE_LOCAL_LABEL}`],
      { stdio: "ignore" },
    );
  } catch {
    // Uninstall is idempotent if the local job is already absent.
  }
  fileSystem.rm(target, { force: true });

  return {
    ok: true,
    action: "uninstall",
    label: ACCOUNT_MAINTENANCE_LOCAL_LABEL,
    target,
  };
}

export function runLocalSchedulerInstallCli(argv) {
  let homeDir = process.env.HOME;
  let json = false;
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") continue;
    if (token === "--json") {
      json = true;
      continue;
    }
    if (token === "--dry-run") {
      dryRun = true;
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

  const result = dryRun
    ? buildAccountMaintenanceLocalSchedulerVerification({
        homeDir,
        rootDir: process.cwd(),
        dryRun: true,
      })
    : installAccountMaintenanceLocalLaunchd({
        homeDir,
      });
  process.stdout.write(
    json
      ? `${JSON.stringify(result, null, 2)}\n`
      : `local install ${dryRun ? "dry-run" : "complete"} target: ${result.launchd?.label ?? result.target}\n`,
  );
}

export function runLocalSchedulerUninstallCli(argv) {
  let homeDir = process.env.HOME;
  let json = false;
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") continue;
    if (token === "--json") {
      json = true;
      continue;
    }
    if (token === "--dry-run") {
      dryRun = true;
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

  const target = resolve(
    homeDir,
    "Library",
    "LaunchAgents",
    `${ACCOUNT_MAINTENANCE_LOCAL_LABEL}.plist`,
  );
  const result = dryRun
    ? {
        ok: true,
        action: "uninstall",
        dryRun: true,
        label: ACCOUNT_MAINTENANCE_LOCAL_LABEL,
        target,
      }
    : uninstallAccountMaintenanceLocalLaunchd({
        homeDir,
      });
  process.stdout.write(
    json
      ? `${JSON.stringify(result, null, 2)}\n`
      : `local uninstall ${dryRun ? "dry-run" : "complete"} target: ${target}\n`,
  );
}
