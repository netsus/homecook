import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { readRuntimeState } from "./omo-session-runtime.mjs";

function ensureNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function normalizeOptionalPath(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function buildRootWorkItemPath(rootDir, workItemId) {
  return resolve(rootDir, ".workflow-v2", "work-items", `${workItemId}.json`);
}

function buildWorktreeWorkItemPath(worktreePath, workItemId) {
  return resolve(worktreePath, ".workflow-v2", "work-items", `${workItemId}.json`);
}

function listFallbackWorkItemPaths({
  rootDir,
  workItemId,
  worktreePath = null,
}) {
  const rootWorkItemPath = buildRootWorkItemPath(rootDir, workItemId);
  const runtimeState = readRuntimeState({
    rootDir,
    workItemId,
    slice: workItemId,
  }).state;
  const runtimeWorktreePath = normalizeOptionalPath(runtimeState.workspace?.path);
  const conventionalWorktreePath = resolve(rootDir, ".worktrees", workItemId);

  return [...new Set(
    [
      buildWorktreeWorkItemPath(rootDir, workItemId),
      worktreePath ? buildWorktreeWorkItemPath(worktreePath, workItemId) : null,
      runtimeWorktreePath ? buildWorktreeWorkItemPath(runtimeWorktreePath, workItemId) : null,
      buildWorktreeWorkItemPath(conventionalWorktreePath, workItemId),
    ]
      .filter((candidatePath) =>
        typeof candidatePath === "string" &&
        candidatePath.length > 0 &&
        candidatePath !== rootWorkItemPath
      ),
  )];
}

export function readTrackedWorkItemWithRecovery({
  rootDir = process.cwd(),
  workItemId,
  worktreePath = null,
}) {
  const normalizedRootDir = resolve(rootDir);
  const normalizedWorkItemId = ensureNonEmptyString(workItemId, "workItemId");
  const rootWorkItemPath = buildRootWorkItemPath(normalizedRootDir, normalizedWorkItemId);

  if (existsSync(rootWorkItemPath)) {
    return {
      workItemPath: rootWorkItemPath,
      workItem: readJson(rootWorkItemPath),
      tracked: true,
      recoveredFrom: null,
    };
  }

  for (const fallbackPath of listFallbackWorkItemPaths({
    rootDir: normalizedRootDir,
    workItemId: normalizedWorkItemId,
    worktreePath,
  })) {
    if (!existsSync(fallbackPath)) {
      continue;
    }

    const workItem = readJson(fallbackPath);
    mkdirSync(dirname(rootWorkItemPath), { recursive: true });
    writeFileSync(rootWorkItemPath, `${JSON.stringify(workItem, null, 2)}\n`);

    return {
      workItemPath: rootWorkItemPath,
      workItem,
      tracked: true,
      recoveredFrom: fallbackPath,
    };
  }

  return {
    workItemPath: rootWorkItemPath,
    workItem: null,
    tracked: false,
    recoveredFrom: null,
  };
}
