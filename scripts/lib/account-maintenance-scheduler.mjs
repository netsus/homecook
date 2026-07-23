import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ACCOUNT_MAINTENANCE_LABEL = "com.homecook.account-maintenance";
export const ACCOUNT_MAINTENANCE_INTERVAL_SECONDS = 300;
export const ACCOUNT_MAINTENANCE_HEARTBEAT_SECONDS = 900;
export const ACCOUNT_MAINTENANCE_FAILURE_THRESHOLD = 3;
export const ACCOUNT_MAINTENANCE_OLDEST_PENDING_ALERT_SECONDS = 900;
export const ACCOUNT_MAINTENANCE_LOG_ROTATION_MAX_BYTES = 10 * 1024 * 1024;
export const ACCOUNT_MAINTENANCE_LOG_ROTATION_MAX_FILES = 5;
export const ACCOUNT_MAINTENANCE_SECRET_ENV = "HOMECOOK_MAINTENANCE_WORKER_SECRET";
export const ACCOUNT_MAINTENANCE_TICK_ROUTE = "/internal/account-maintenance/tick";
export const ACCOUNT_MAINTENANCE_PHASES = [
  "scanner",
  "terminal_tombstone_scan",
  "quarantine_recheck",
  "normal_drain",
  "expected_owner_signal_union_zero",
  "auth_delete",
  "complete",
];
export const ACCOUNT_MAINTENANCE_MANUAL_ONLY = [
  "launchd_install",
  "production_secret",
  "live_tick_route",
];

const TEMPLATE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "ops",
  "launchd",
  "com.homecook.account-maintenance.plist.template",
);

function ensureNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function buildPathEnv(nodeBin) {
  const nodeDir = dirname(nodeBin);
  return [...new Set([nodeDir, "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"])].join(
    ":",
  );
}

export function getAccountMaintenanceLogPaths(homeDir = process.env.HOME ?? "") {
  const normalizedHomeDir = ensureNonEmptyString(homeDir, "homeDir");
  const logDir = `${normalizedHomeDir}/Library/Logs/homecook`;

  return {
    stdout: `${logDir}/account-maintenance.log`,
    stderr: `${logDir}/account-maintenance.err.log`,
  };
}

export function renderAccountMaintenanceLaunchdPlist({
  rootDir = process.cwd(),
  homeDir = process.env.HOME ?? "",
  nodeBin = process.execPath,
} = {}) {
  const normalizedRootDir = resolve(ensureNonEmptyString(rootDir, "rootDir"));
  const normalizedHomeDir = ensureNonEmptyString(homeDir, "homeDir");
  const normalizedNodeBin = ensureNonEmptyString(nodeBin, "nodeBin");
  const logPaths = getAccountMaintenanceLogPaths(normalizedHomeDir);
  const template = readFileSync(TEMPLATE_PATH, "utf8");

  return template
    .replaceAll("__ROOT_DIR__", normalizedRootDir)
    .replaceAll("__NODE_BIN__", normalizedNodeBin)
    .replaceAll("__PATH__", buildPathEnv(normalizedNodeBin))
    .replaceAll("__STDOUT_LOG__", logPaths.stdout)
    .replaceAll("__STDERR_LOG__", logPaths.stderr);
}

export function buildAccountMaintenanceTickResult({
  dryRun = false,
  rootDir = process.cwd(),
} = {}) {
  const normalizedRootDir = resolve(ensureNonEmptyString(rootDir, "rootDir"));

  return {
    ok: true,
    dryRun,
    featureState: "dark-ship-legacy",
    rootDir: normalizedRootDir,
    endpoint: ACCOUNT_MAINTENANCE_TICK_ROUTE,
    cadenceSeconds: ACCOUNT_MAINTENANCE_INTERVAL_SECONDS,
    phases: ACCOUNT_MAINTENANCE_PHASES,
    liveMode: {
      enabled: false,
      activationGate: "#3-joint-activation",
      blockedBy: [
        "feature-off-skeleton",
        "manual-only-secret-install",
        "route-not-invoked-outside-dry-run",
      ],
    },
    secret: {
      env: ACCOUNT_MAINTENANCE_SECRET_ENV,
      loaded: false,
      policy: "manual-only",
      source: "keychain-or-env",
    },
    heartbeatSeconds: ACCOUNT_MAINTENANCE_HEARTBEAT_SECONDS,
    alertThresholds: {
      consecutiveFailures: ACCOUNT_MAINTENANCE_FAILURE_THRESHOLD,
      oldestPendingAgeSeconds: ACCOUNT_MAINTENANCE_OLDEST_PENDING_ALERT_SECONDS,
      deadLetter: true,
    },
    logRotation: {
      format: "json",
      maxBytes: ACCOUNT_MAINTENANCE_LOG_ROTATION_MAX_BYTES,
      maxFiles: ACCOUNT_MAINTENANCE_LOG_ROTATION_MAX_FILES,
    },
    storageCompleteMode: "fail-closed-before-f0-joint-activation",
    manualOnly: ACCOUNT_MAINTENANCE_MANUAL_ONLY,
  };
}

export function buildAccountMaintenanceSchedulerVerification({
  rootDir = process.cwd(),
  homeDir = process.env.HOME ?? "",
  dryRun = false,
} = {}) {
  const normalizedRootDir = resolve(ensureNonEmptyString(rootDir, "rootDir"));
  const normalizedHomeDir = ensureNonEmptyString(homeDir, "homeDir");
  const logPaths = getAccountMaintenanceLogPaths(normalizedHomeDir);
  const plist = renderAccountMaintenanceLaunchdPlist({
    rootDir: normalizedRootDir,
    homeDir: normalizedHomeDir,
  });
  const errors = [];

  if (!existsSync(TEMPLATE_PATH)) {
    errors.push(`missing_launchd_template:${TEMPLATE_PATH}`);
  }

  if (!plist.includes(`<string>${ACCOUNT_MAINTENANCE_LABEL}</string>`)) {
    errors.push("missing_label");
  }
  if (!plist.includes("<true/>")) {
    errors.push("missing_run_at_load");
  }
  if (!plist.includes(`<integer>${ACCOUNT_MAINTENANCE_INTERVAL_SECONDS}</integer>`)) {
    errors.push("missing_start_interval");
  }

  return {
    ok: errors.length === 0,
    dryRun,
    checkedLaunchctl: false,
    checkedLiveSecret: false,
    manualOnly: ACCOUNT_MAINTENANCE_MANUAL_ONLY,
    launchd: {
      label: ACCOUNT_MAINTENANCE_LABEL,
      runAtLoad: true,
      startIntervalSeconds: ACCOUNT_MAINTENANCE_INTERVAL_SECONDS,
      workingDirectory: normalizedRootDir,
      programArguments: [process.execPath, "scripts/account-maintenance-tick.mjs", "--mode", "launchd"],
      standardOutPath: logPaths.stdout,
      standardErrorPath: logPaths.stderr,
      secretInstall: "manual-only",
      plist,
    },
    tickDryRun: buildAccountMaintenanceTickResult({
      dryRun: true,
      rootDir: normalizedRootDir,
    }),
    errors,
  };
}
