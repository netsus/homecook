import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
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
export const ACCOUNT_MAINTENANCE_TICK_URL_ENV = "HOMECOOK_MAINTENANCE_TICK_URL";
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
export const ACCOUNT_MAINTENANCE_RELEASE_VERIFIED = [
  "launchd_contract",
  "local_observability_primitives",
];
export const ACCOUNT_MAINTENANCE_RELEASE_BLOCKERS = [
  "actual_launchd_install",
  "production_secret",
  "power_login_sleep",
  "live_tick_log_wiring",
  "external_heartbeat",
  "external_alert_delivery",
  "cleanup_target",
  "next_tick_recovery",
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

function ensureNonNegativeNumber(value, label) {
  if (
    typeof value !== "number"
    || !Number.isFinite(value)
    || value < 0
  ) {
    throw new Error(`${label} must be a non-negative finite number.`);
  }

  return value;
}

function ensurePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }

  return value;
}

function ensureBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }

  return value;
}

function buildPathEnv(nodeBin) {
  const nodeDir = dirname(nodeBin);
  return [...new Set([nodeDir, "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"])].join(
    ":",
  );
}

export function getAccountMaintenanceLogPaths(homeDir = process.env.HOME ?? "") {
  const normalizedHomeDir = ensureNonEmptyString(homeDir, "homeDir");
  const logDir = `${normalizedHomeDir}/Library/Logs/Homecook`;

  return {
    stdout: `${logDir}/account-maintenance.log`,
    stderr: `${logDir}/account-maintenance.err.log`,
  };
}

export function evaluateAccountMaintenanceHealth({
  consecutiveFailures,
  oldestPendingAgeSeconds,
  deadLetterCount,
}) {
  const normalizedConsecutiveFailures = ensureNonNegativeNumber(
    consecutiveFailures,
    "consecutiveFailures",
  );
  const normalizedOldestPendingAgeSeconds = ensureNonNegativeNumber(
    oldestPendingAgeSeconds,
    "oldestPendingAgeSeconds",
  );
  const normalizedDeadLetterCount = ensureNonNegativeNumber(
    deadLetterCount,
    "deadLetterCount",
  );
  const alerts = [];

  if (normalizedConsecutiveFailures >= ACCOUNT_MAINTENANCE_FAILURE_THRESHOLD) {
    alerts.push("consecutive_failures");
  }
  if (
    normalizedOldestPendingAgeSeconds
    > ACCOUNT_MAINTENANCE_OLDEST_PENDING_ALERT_SECONDS
  ) {
    alerts.push("oldest_pending_overdue");
  }
  if (normalizedDeadLetterCount > 0) {
    alerts.push("dead_letter_present");
  }

  return {
    ok: alerts.length === 0,
    alerts,
  };
}

export function recordAccountMaintenanceTickOutcome({
  previousConsecutiveFailures,
  succeeded,
  oldestPendingAgeSeconds,
  deadLetterCount,
}) {
  const normalizedPreviousFailures = ensureNonNegativeNumber(
    previousConsecutiveFailures,
    "previousConsecutiveFailures",
  );
  if (!Number.isSafeInteger(normalizedPreviousFailures)) {
    throw new Error("previousConsecutiveFailures must be a safe integer.");
  }
  if (typeof succeeded !== "boolean") {
    throw new Error("succeeded must be a boolean.");
  }

  const consecutiveFailures = succeeded
    ? 0
    : Math.min(normalizedPreviousFailures + 1, Number.MAX_SAFE_INTEGER);

  return {
    consecutiveFailures,
    recovered: succeeded && normalizedPreviousFailures > 0,
    health: evaluateAccountMaintenanceHealth({
      consecutiveFailures,
      oldestPendingAgeSeconds,
      deadLetterCount,
    }),
  };
}

export function getAccountMaintenanceVerificationStatus({
  contractOk,
  requireReleaseReady,
  releaseReady,
}) {
  const normalizedContractOk = ensureBoolean(contractOk, "contractOk");
  const normalizedRequireReleaseReady = ensureBoolean(
    requireReleaseReady,
    "requireReleaseReady",
  );
  const normalizedReleaseReady = ensureBoolean(
    releaseReady,
    "releaseReady",
  );

  if (!normalizedContractOk) {
    return "fail";
  }
  if (normalizedRequireReleaseReady && !normalizedReleaseReady) {
    return "blocked";
  }

  return "pass";
}

export function appendAccountMaintenanceJsonLog({
  logPath,
  entry,
  maxBytes = ACCOUNT_MAINTENANCE_LOG_ROTATION_MAX_BYTES,
  maxFiles = ACCOUNT_MAINTENANCE_LOG_ROTATION_MAX_FILES,
}) {
  const normalizedLogPath = resolve(ensureNonEmptyString(logPath, "logPath"));
  const normalizedMaxBytes = ensurePositiveInteger(maxBytes, "maxBytes");
  const normalizedMaxFiles = ensurePositiveInteger(maxFiles, "maxFiles");
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error("entry must be a JSON object.");
  }

  const line = `${JSON.stringify(entry)}\n`;
  const lineBytes = Buffer.byteLength(line);
  mkdirSync(dirname(normalizedLogPath), { recursive: true, mode: 0o700 });
  const currentLogBytes = existsSync(normalizedLogPath)
    ? statSync(normalizedLogPath).size
    : 0;

  if (
    currentLogBytes > 0
    && currentLogBytes + lineBytes > normalizedMaxBytes
  ) {
    rmSync(`${normalizedLogPath}.${normalizedMaxFiles}`, { force: true });
    for (let index = normalizedMaxFiles - 1; index >= 1; index -= 1) {
      const source = `${normalizedLogPath}.${index}`;
      if (existsSync(source)) {
        renameSync(source, `${normalizedLogPath}.${index + 1}`);
      }
    }
    renameSync(normalizedLogPath, `${normalizedLogPath}.1`);
  }

  appendFileSync(normalizedLogPath, line, {
    encoding: "utf8",
    mode: 0o600,
  });

  return {
    logPath: normalizedLogPath,
    bytesWritten: lineBytes,
  };
}

export function renderAccountMaintenanceLaunchdPlist({
  rootDir = process.cwd(),
  homeDir = process.env.HOME ?? "",
  nodeBin = process.execPath,
  tickUrl = "",
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
    .replaceAll("__TICK_URL__", tickUrl)
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
    releaseReadiness: {
      ready: ACCOUNT_MAINTENANCE_RELEASE_BLOCKERS.length === 0,
      verified: ACCOUNT_MAINTENANCE_RELEASE_VERIFIED,
      blockers: ACCOUNT_MAINTENANCE_RELEASE_BLOCKERS,
    },
    errors,
  };
}
