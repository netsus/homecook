#!/usr/bin/env node

import { existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/omo-tick-watch.mjs --work-item <id> [options]",
      "",
      "Options:",
      "  --work-item <id>                 Workflow-v2 work item id",
      "  --json                           Print JSON output",
      "  --watch <seconds>                Refresh every N seconds until interrupted",
      "  --help                           Show this help text",
      "",
      "Examples:",
      "  pnpm omo:tick:watch -- --work-item 05-planner-week-core",
      "  pnpm omo:tick:watch -- --work-item 05-planner-week-core --watch 10",
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
    json: false,
    watchSeconds: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--") continue;
    if (token === "--help") {
      options.help = true;
      continue;
    }
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--work-item") {
      options.workItem = requireValue(argv, index, token);
      index += 1;
      continue;
    }
    if (token === "--watch") {
      const rawValue = requireValue(argv, index, token);
      const watchSeconds = Number.parseInt(rawValue, 10);
      if (!Number.isInteger(watchSeconds) || watchSeconds < 1) {
        throw new Error("--watch requires an integer value greater than or equal to 1.");
      }

      options.watchSeconds = watchSeconds;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${token}`);
  }

  return options;
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

function getDefaultLogPaths(workItemId) {
  const logDir = path.join(process.env.HOME ?? "", "Library", "Logs", "homecook");
  return {
    stdout: path.join(logDir, `omo-tick-${workItemId}.log`),
    stderr: path.join(logDir, `omo-tick-${workItemId}.err.log`),
  };
}

function extractMatch(output, pattern) {
  const match = output.match(pattern);
  return match?.[1]?.trim() ?? null;
}

function readLaunchAgentSnapshot(workItemId) {
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  if (!Number.isInteger(uid)) {
    throw new Error("Current platform does not support launchctl gui user inspection.");
  }

  const label = `ai.homecook.omo.tick.${workItemId}`;
  const serviceTarget = `gui/${uid}/${label}`;
  const printResult = spawnSync("launchctl", ["print", serviceTarget], {
    encoding: "utf8",
  });
  const defaultLogs = getDefaultLogPaths(workItemId);

  if (printResult.status !== 0) {
    const stdoutUpdatedAt = readFileTimestamp(defaultLogs.stdout);
    const stderrUpdatedAt = readFileTimestamp(defaultLogs.stderr);
    const latestActivityAt =
      stdoutUpdatedAt && stderrUpdatedAt
        ? new Date(Math.max(stdoutUpdatedAt.getTime(), stderrUpdatedAt.getTime()))
        : stdoutUpdatedAt ?? stderrUpdatedAt;

    return {
      workItem: workItemId,
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
      error:
        printResult.stderr?.trim() || printResult.stdout?.trim() || "LaunchAgent is not loaded.",
    };
  }

  const output = printResult.stdout;
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
    workItem: workItemId,
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

function toSerializableSnapshot(snapshot) {
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

function formatSnapshot(snapshot) {
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

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    process.exit(0);
  }

  if (!options.workItem) {
    throw new Error("--work-item is required.");
  }

  let isFirstIteration = true;
  do {
    const snapshot = readLaunchAgentSnapshot(options.workItem);
    if (!isFirstIteration) {
      process.stdout.write("\n");
    }

    if (options.json) {
      process.stdout.write(`${JSON.stringify(toSerializableSnapshot(snapshot), null, 2)}\n`);
    } else {
      process.stdout.write(`${formatSnapshot(snapshot)}\n`);
    }

    isFirstIteration = false;
    if (!options.watchSeconds) {
      break;
    }

    await sleep(options.watchSeconds * 1000);
  } while (true);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
