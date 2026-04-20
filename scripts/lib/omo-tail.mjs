import { existsSync, readFileSync, statSync } from "node:fs";

import {
  formatLaunchAgentSnapshot,
  getDefaultTickLogPaths,
  readLaunchAgentSnapshot,
  toSerializableLaunchAgentSnapshot,
} from "./omo-scheduler.mjs";
import { readWorkItemSessionStatus } from "./omo-session-orchestrator.mjs";
import { formatBriefStatus } from "./omo-status-summary.mjs";

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

  return date.toISOString();
}

function parseLogLines(content) {
  const lines = content.split(/\r?\n/);
  if (lines.at(-1) === "") {
    lines.pop();
  }

  return lines;
}

export function readLogTail(filePath, { lines = 20 } = {}) {
  const normalizedPath = ensureNonEmptyString(filePath, "filePath");
  if (!Number.isInteger(lines) || lines < 1) {
    throw new Error("lines must be an integer greater than or equal to 1.");
  }

  if (!existsSync(normalizedPath)) {
    return {
      path: normalizedPath,
      exists: false,
      updatedAt: null,
      lineCount: 0,
      truncated: false,
      lines: [],
    };
  }

  const content = readFileSync(normalizedPath, "utf8");
  const allLines = parseLogLines(content);

  return {
    path: normalizedPath,
    exists: true,
    updatedAt: statSync(normalizedPath).mtime,
    lineCount: allLines.length,
    truncated: allLines.length > lines,
    lines: allLines.slice(-lines),
  };
}

/**
 * @param {{
 *   rootDir?: string,
 *   workItemId: string,
 *   slice?: string,
 *   homeDir?: string,
 *   lines?: number,
 *   readStatus?: ({ rootDir, workItemId, slice }: { rootDir?: string, workItemId: string, slice?: string }) => any,
 *   readSchedulerSnapshot?: ({ workItemId, homeDir }: { workItemId: string, homeDir?: string }) => any,
 * }} [options]
 */
export function buildOperatorTailSnapshot({
  rootDir = process.cwd(),
  workItemId,
  slice = undefined,
  homeDir = process.env.HOME ?? "",
  lines = 20,
  readStatus = readWorkItemSessionStatus,
  readSchedulerSnapshot = readLaunchAgentSnapshot,
} = {}) {
  const normalizedWorkItemId = ensureNonEmptyString(workItemId, "workItemId");
  const status = readStatus({
    rootDir,
    workItemId: normalizedWorkItemId,
    slice,
  });

  let scheduler = null;
  let schedulerError = null;
  try {
    scheduler = readSchedulerSnapshot({
      workItemId: normalizedWorkItemId,
      homeDir,
    });
  } catch (error) {
    schedulerError = error instanceof Error ? error.message : String(error);
  }

  const defaultLogs = getDefaultTickLogPaths(normalizedWorkItemId, homeDir);
  const stdoutPath = scheduler?.stdoutLog ?? defaultLogs.stdout;
  const stderrPath = scheduler?.stderrLog ?? defaultLogs.stderr;

  return {
    workItemId: normalizedWorkItemId,
    slice: status.slice,
    status,
    scheduler,
    schedulerError,
    logs: {
      stdout: readLogTail(stdoutPath, { lines }),
      stderr: readLogTail(stderrPath, { lines }),
    },
  };
}

function serializeLogTail(logTail) {
  return {
    path: logTail.path,
    exists: logTail.exists,
    updatedAt: logTail.updatedAt?.toISOString() ?? null,
    lineCount: logTail.lineCount,
    truncated: logTail.truncated,
    lines: logTail.lines,
  };
}

export function toSerializableOperatorTailSnapshot(snapshot) {
  return {
    workItemId: snapshot.workItemId,
    slice: snapshot.slice,
    status: snapshot.status,
    scheduler: snapshot.scheduler ? toSerializableLaunchAgentSnapshot(snapshot.scheduler) : null,
    schedulerError: snapshot.schedulerError,
    logs: {
      stdout: serializeLogTail(snapshot.logs.stdout),
      stderr: serializeLogTail(snapshot.logs.stderr),
    },
  };
}

function formatLogTailSection(label, logTail) {
  const heading = `== ${label} ==`;
  const summary = [
    `path            : ${logTail.path}`,
    `exists          : ${logTail.exists ? "yes" : "no"}`,
    `updatedAt       : ${formatTimestamp(logTail.updatedAt)}`,
    `linesShown      : ${logTail.lines.length}/${logTail.lineCount}`,
    `truncated       : ${logTail.truncated ? "yes" : "no"}`,
  ];

  const body = !logTail.exists
    ? ["(missing)"]
    : logTail.lines.length === 0
      ? ["(empty)"]
      : logTail.lines;

  return [heading, ...summary, ...body].join("\n");
}

export function formatOperatorTailSnapshot(snapshot) {
  const sections = [
    "== Status ==",
    formatBriefStatus(snapshot.status),
    "== Scheduler ==",
    snapshot.scheduler
      ? formatLaunchAgentSnapshot(snapshot.scheduler)
      : [`loaded          : no`, `error           : ${snapshot.schedulerError ?? "unavailable"}`].join("\n"),
    formatLogTailSection("stdout tail", snapshot.logs.stdout),
    formatLogTailSection("stderr tail", snapshot.logs.stderr),
  ];

  return sections.join("\n\n");
}
