import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveClaudeProviderConfig,
  resolveCodexProviderConfig,
} from "./omo-provider-config.mjs";

export const DEFAULT_TICK_INTERVAL_SECONDS = 600;

const SCHEDULER_TEMPLATE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "templates",
  "omo-tick.launch-agent.plist.template",
);

function ensureNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function formatTimestamp(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function readFileTimestamp(filePath) {
  if (!filePath || !existsSync(filePath)) {
    return null;
  }

  return statSync(filePath).mtime;
}

function extractMatch(output, pattern) {
  const match = output.match(pattern);
  return match?.[1]?.trim() ?? null;
}

function buildFixedPath(...bins) {
  const basePaths = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"];
  const dynamicPaths = bins
    .filter((binPath) => typeof binPath === "string" && binPath.trim().length > 0)
    .map((binPath) => dirname(binPath));

  return [...new Set([...dynamicPaths, ...basePaths])].join(":");
}

function readSchedulerTemplate() {
  return readFileSync(SCHEDULER_TEMPLATE_PATH, "utf8");
}

function resolveBinaryPath(binary, spawn = spawnSync) {
  const normalizedBinary = ensureNonEmptyString(binary, "binary");

  if (normalizedBinary.includes(path.sep)) {
    if (!existsSync(normalizedBinary)) {
      throw new Error(`Binary does not exist: ${normalizedBinary}`);
    }

    return normalizedBinary;
  }

  const result = spawn("which", [normalizedBinary], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(`Unable to resolve ${normalizedBinary} in PATH.`);
  }

  return ensureNonEmptyString(result.stdout, `${normalizedBinary} path`);
}

export function resolveLaunchAgentLabel(workItemId) {
  return `ai.homecook.omo.tick.${ensureNonEmptyString(workItemId, "workItemId")}`;
}

export function getDefaultTickLogPaths(workItemId, homeDir = process.env.HOME ?? "") {
  const normalizedHomeDir = ensureNonEmptyString(homeDir, "homeDir");
  const logDir = path.join(normalizedHomeDir, "Library", "Logs", "homecook");

  return {
    stdout: path.join(logDir, `omo-tick-${ensureNonEmptyString(workItemId, "workItemId")}.log`),
    stderr: path.join(logDir, `omo-tick-${ensureNonEmptyString(workItemId, "workItemId")}.err.log`),
  };
}

export function resolveLaunchAgentPlistPath(workItemId, homeDir = process.env.HOME ?? "") {
  return path.join(
    ensureNonEmptyString(homeDir, "homeDir"),
    "Library",
    "LaunchAgents",
    `${resolveLaunchAgentLabel(workItemId)}.plist`,
  );
}

export function resolveSchedulerBins({
  rootDir = process.cwd(),
  pnpmBin,
  ghBin,
  claudeBin,
  opencodeBin,
  environment,
  homeDir,
  spawn = spawnSync,
} = {}) {
  const claudeConfig = resolveClaudeProviderConfig({
    rootDir,
    bin: claudeBin,
  });
  const codexConfig = resolveCodexProviderConfig({
    rootDir,
    bin: opencodeBin,
    environment,
    homeDir,
  });
  const resolved = {
    pnpm: resolveBinaryPath(pnpmBin ?? "pnpm", spawn),
    gh: resolveBinaryPath(ghBin ?? "gh", spawn),
    claude: resolveBinaryPath(claudeConfig.bin, spawn),
    opencode: resolveBinaryPath(codexConfig.bin, spawn),
  };

  return {
    ...resolved,
    path: buildFixedPath(resolved.pnpm, resolved.gh, resolved.claude, resolved.opencode),
  };
}

export function renderLaunchAgentPlist({
  rootDir = process.cwd(),
  workItemId,
  homeDir = process.env.HOME ?? "",
  intervalSeconds = DEFAULT_TICK_INTERVAL_SECONDS,
  bins,
} = {}) {
  const normalizedWorkItemId = ensureNonEmptyString(workItemId, "workItemId");
  const normalizedHomeDir = ensureNonEmptyString(homeDir, "homeDir");
  const resolvedBins = bins && typeof bins === "object" ? bins : resolveSchedulerBins({ rootDir, homeDir });
  const resolvedPath =
    typeof resolvedBins.path === "string" && resolvedBins.path.trim().length > 0
      ? resolvedBins.path.trim()
      : buildFixedPath(resolvedBins.pnpm, resolvedBins.gh, resolvedBins.claude, resolvedBins.opencode);
  const logPaths = getDefaultTickLogPaths(normalizedWorkItemId, normalizedHomeDir);
  const template = readSchedulerTemplate();

  return template
    .replaceAll("__LABEL__", resolveLaunchAgentLabel(normalizedWorkItemId))
    .replaceAll("__PNPM_BIN__", ensureNonEmptyString(resolvedBins.pnpm, "bins.pnpm"))
    .replaceAll("__WORK_ITEM_ID__", normalizedWorkItemId)
    .replaceAll("__HOME__", normalizedHomeDir)
    .replaceAll("__PATH__", ensureNonEmptyString(resolvedPath, "bins.path"))
    .replaceAll("__INTERVAL_SECONDS__", String(Number(intervalSeconds)))
    .replaceAll("__WORKING_DIRECTORY__", resolve(rootDir))
    .replaceAll("__STDOUT_LOG__", logPaths.stdout)
    .replaceAll("__STDERR_LOG__", logPaths.stderr);
}

export function parseLaunchAgentSnapshotOutput({
  workItemId,
  homeDir = process.env.HOME ?? "",
  output = "",
  status = 0,
  errorText = "",
} = {}) {
  const normalizedWorkItemId = ensureNonEmptyString(workItemId, "workItemId");
  const label = resolveLaunchAgentLabel(normalizedWorkItemId);
  const defaultLogs = getDefaultTickLogPaths(normalizedWorkItemId, homeDir);

  if (status !== 0) {
    const stdoutUpdatedAt = readFileTimestamp(defaultLogs.stdout);
    const stderrUpdatedAt = readFileTimestamp(defaultLogs.stderr);
    const latestActivityAt =
      stdoutUpdatedAt && stderrUpdatedAt
        ? new Date(Math.max(stdoutUpdatedAt.getTime(), stderrUpdatedAt.getTime()))
        : stdoutUpdatedAt ?? stderrUpdatedAt;

    return {
      workItem: normalizedWorkItemId,
      label,
      loaded: false,
      runningNow: false,
      state: "unloaded",
      runs: null,
      lastExitCode: null,
      intervalSeconds: null,
      stdoutLog: defaultLogs.stdout,
      stderrLog: defaultLogs.stderr,
      stdoutUpdatedAt,
      stderrUpdatedAt,
      lastActivityAt: latestActivityAt,
      error: errorText.trim().length > 0 ? errorText.trim() : "LaunchAgent is not loaded.",
    };
  }

  const state = extractMatch(output, /^\s*state = (.+)$/m) ?? "unknown";
  const runsValue = extractMatch(output, /^\s*runs = (\d+)$/m);
  const lastExitCodeValue = extractMatch(output, /^\s*last exit code = (-?\d+)$/m);
  const intervalValue = extractMatch(output, /^\s*run interval = (\d+) seconds$/m);
  const stdoutLog = extractMatch(output, /^\s*stdout path = (.+)$/m) ?? defaultLogs.stdout;
  const stderrLog = extractMatch(output, /^\s*stderr path = (.+)$/m) ?? defaultLogs.stderr;
  const stdoutUpdatedAt = readFileTimestamp(stdoutLog);
  const stderrUpdatedAt = readFileTimestamp(stderrLog);
  const latestActivityAt =
    stdoutUpdatedAt && stderrUpdatedAt
      ? new Date(Math.max(stdoutUpdatedAt.getTime(), stderrUpdatedAt.getTime()))
      : stdoutUpdatedAt ?? stderrUpdatedAt;

  return {
    workItem: normalizedWorkItemId,
    label,
    loaded: true,
    runningNow: state === "running",
    state,
    runs: runsValue ? Number.parseInt(runsValue, 10) : null,
    lastExitCode: lastExitCodeValue ? Number.parseInt(lastExitCodeValue, 10) : null,
    intervalSeconds: intervalValue ? Number.parseInt(intervalValue, 10) : null,
    stdoutLog,
    stderrLog,
    stdoutUpdatedAt,
    stderrUpdatedAt,
    lastActivityAt: latestActivityAt,
    error: null,
  };
}

export function readLaunchAgentSnapshot({
  workItemId,
  homeDir = process.env.HOME ?? "",
  spawn = spawnSync,
} = {}) {
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  if (!Number.isInteger(uid)) {
    throw new Error("Current platform does not support launchctl gui user inspection.");
  }

  const label = resolveLaunchAgentLabel(workItemId);
  const serviceTarget = `gui/${uid}/${label}`;
  const result = spawn("launchctl", ["print", serviceTarget], {
    encoding: "utf8",
  });

  return parseLaunchAgentSnapshotOutput({
    workItemId,
    homeDir,
    output: result.stdout ?? "",
    status: result.status ?? 1,
    errorText: `${result.stderr ?? ""}\n${result.stdout ?? ""}`,
  });
}

export function toSerializableLaunchAgentSnapshot(snapshot) {
  return {
    workItem: snapshot.workItem,
    label: snapshot.label,
    loaded: snapshot.loaded,
    runningNow: snapshot.runningNow,
    state: snapshot.state,
    runs: snapshot.runs,
    lastExitCode: snapshot.lastExitCode,
    intervalSeconds: snapshot.intervalSeconds,
    stdoutLog: snapshot.stdoutLog,
    stdoutUpdatedAt: snapshot.stdoutUpdatedAt?.toISOString() ?? null,
    stderrLog: snapshot.stderrLog,
    stderrUpdatedAt: snapshot.stderrUpdatedAt?.toISOString() ?? null,
    lastActivityAt: snapshot.lastActivityAt?.toISOString() ?? null,
    error: snapshot.error,
  };
}

export function formatLaunchAgentSnapshot(snapshot) {
  return [
    `workItem        : ${snapshot.workItem}`,
    `label           : ${snapshot.label}`,
    `loaded          : ${snapshot.loaded ? "yes" : "no"}`,
    `runningNow      : ${snapshot.runningNow ? "yes" : "no"}`,
    `state           : ${snapshot.state}`,
    `runs            : ${snapshot.runs ?? "-"}`,
    `lastExitCode    : ${snapshot.lastExitCode ?? "-"}`,
    `intervalSeconds : ${snapshot.intervalSeconds ?? "-"}`,
    `lastActivity    : ${formatTimestamp(snapshot.lastActivityAt)}`,
    `stdoutUpdated   : ${formatTimestamp(snapshot.stdoutUpdatedAt)}`,
    `stderrUpdated   : ${formatTimestamp(snapshot.stderrUpdatedAt)}`,
    `stdoutLog       : ${snapshot.stdoutLog}`,
    `stderrLog       : ${snapshot.stderrLog}`,
    `error           : ${snapshot.error ?? "-"}`,
  ].join("\n");
}

export function verifyLaunchAgentAlignment({
  workItemId,
  expectedIntervalSeconds = DEFAULT_TICK_INTERVAL_SECONDS,
  homeDir = process.env.HOME ?? "",
  launchSnapshot,
  tickWatchSnapshot,
} = {}) {
  const normalizedWorkItemId = ensureNonEmptyString(workItemId, "workItemId");
  const expectedLogs = getDefaultTickLogPaths(normalizedWorkItemId, homeDir);
  const expectedLabel = resolveLaunchAgentLabel(normalizedWorkItemId);
  const errors = [];

  if (!launchSnapshot?.loaded) {
    errors.push("launchctl does not report the LaunchAgent as loaded.");
  }
  if (launchSnapshot?.label !== expectedLabel) {
    errors.push(`launchctl label mismatch: expected ${expectedLabel}, received ${launchSnapshot?.label ?? "missing"}`);
  }
  if (launchSnapshot?.intervalSeconds !== expectedIntervalSeconds) {
    errors.push(
      `launchctl interval mismatch: expected ${expectedIntervalSeconds}, received ${launchSnapshot?.intervalSeconds ?? "missing"}`,
    );
  }
  if (launchSnapshot?.stdoutLog !== expectedLogs.stdout) {
    errors.push(`stdout log mismatch: expected ${expectedLogs.stdout}, received ${launchSnapshot?.stdoutLog ?? "missing"}`);
  }
  if (launchSnapshot?.stderrLog !== expectedLogs.stderr) {
    errors.push(`stderr log mismatch: expected ${expectedLogs.stderr}, received ${launchSnapshot?.stderrLog ?? "missing"}`);
  }

  for (const field of ["label", "loaded", "runningNow", "state", "intervalSeconds", "stdoutLog", "stderrLog"]) {
    if (launchSnapshot?.[field] !== tickWatchSnapshot?.[field]) {
      errors.push(`tick-watch mismatch for ${field}: launchctl=${launchSnapshot?.[field] ?? "missing"} tick-watch=${tickWatchSnapshot?.[field] ?? "missing"}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    expected: {
      label: expectedLabel,
      intervalSeconds: expectedIntervalSeconds,
      stdoutLog: expectedLogs.stdout,
      stderrLog: expectedLogs.stderr,
    },
  };
}
