import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { runStageWithArtifacts } from "./omo-lite-runner.mjs";
import { buildOperatorGuidance } from "./omo-status-summary.mjs";
import {
  listDueRuntimeStates,
  readRuntimeState,
  withRuntimeLock,
} from "./omo-session-runtime.mjs";

function ensureNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function readTrackedWorkItem(rootDir, workItemId) {
  const workItemPath = resolve(rootDir, ".workflow-v2", "work-items", `${workItemId}.json`);
  if (!existsSync(workItemPath)) {
    throw new Error(`Tracked workflow-v2 work item not found: ${workItemPath}`);
  }

  return {
    workItemPath,
    workItem: readJson(workItemPath),
  };
}

function readTrackedStatus(rootDir) {
  const statusPath = resolve(rootDir, ".workflow-v2", "status.json");
  if (!existsSync(statusPath)) {
    return {
      statusPath,
      statusBoard: null,
    };
  }

  return {
    statusPath,
    statusBoard: readJson(statusPath),
  };
}

function resolveSliceForWorkItem({ rootDir, workItemId, slice }) {
  if (typeof slice === "string" && slice.trim().length > 0) {
    return slice.trim();
  }

  const { workItem } = readTrackedWorkItem(rootDir, workItemId);
  if (
    workItem?.preset === "vertical-slice-strict" ||
    workItem?.preset === "vertical-slice-light" ||
    workItem?.change_type === "product" ||
    /^\d{2}-/.test(workItemId)
  ) {
    return workItemId;
  }

  throw new Error(
    `Unable to infer slice for work item ${workItemId}. Pass --slice explicitly for non-product work items.`,
  );
}

function determineNextStage(runtimeState, now) {
  if (Number.isInteger(runtimeState.blocked_stage) && runtimeState.blocked_stage >= 1) {
    if (runtimeState.retry?.at) {
      const retryAt = new Date(runtimeState.retry.at);
      const reference = new Date(
        typeof now === "string" && now.trim().length > 0 ? now : new Date().toISOString(),
      );

      if (Number.isNaN(retryAt.getTime()) || Number.isNaN(reference.getTime())) {
        throw new Error("Blocked runtime state has an invalid retry timestamp.");
      }

      if (retryAt.getTime() > reference.getTime()) {
        throw new Error(
          `Work item is blocked until ${runtimeState.retry.at}. Use omo:resume-pending later or pass a later --now value.`,
        );
      }
    }

    return runtimeState.blocked_stage;
  }

  if (!runtimeState.last_completed_stage || runtimeState.last_completed_stage < 1) {
    return 1;
  }

  if (runtimeState.last_completed_stage >= 6) {
    throw new Error("All six stages are already completed for this work item.");
  }

  return runtimeState.last_completed_stage + 1;
}

/**
 * @typedef {object} OmoWorkItemSessionOptions
 * @property {string} [rootDir]
 * @property {string} workItemId
 * @property {string} [slice]
 * @property {string} [owner]
 * @property {string} [now]
 * @property {string} [executionDir]
 * @property {"available"|"constrained"|"unavailable"} [claudeBudgetState]
 * @property {"artifact-only"|"execute"} [mode]
 * @property {string} [opencodeBin]
 * @property {"opencode"|"claude-cli"} [claudeProvider]
 * @property {string} [claudeBin]
 * @property {string} [claudeModel]
 * @property {"low"|"medium"|"high"} [claudeEffort]
 * @property {Record<string, string>} [environment]
 * @property {string} [homeDir]
 */

/**
 * @typedef {object} OmoResumePendingOptions
 * @property {string} [rootDir]
 * @property {string} [now]
 * @property {"available"|"constrained"|"unavailable"} [claudeBudgetState]
 * @property {"artifact-only"|"execute"} [mode]
 * @property {string} [opencodeBin]
 * @property {"opencode"|"claude-cli"} [claudeProvider]
 * @property {string} [claudeBin]
 * @property {string} [claudeModel]
 * @property {"low"|"medium"|"high"} [claudeEffort]
 * @property {Record<string, string>} [environment]
 * @property {string} [homeDir]
 */

/**
 * @param {OmoWorkItemSessionOptions & { action: "start"|"continue", stage?: number }} options
 */
function orchestrateStage({
  action,
  rootDir = process.cwd(),
  workItemId,
  slice = undefined,
  owner,
  now,
  stage = undefined,
  ...options
}) {
  const normalizedWorkItemId = ensureNonEmptyString(workItemId, "workItemId");
  const lockOwner =
    owner ??
    `omo-${action}-${process.pid}`;
  const resolvedSlice = resolveSliceForWorkItem({
    rootDir,
    workItemId: normalizedWorkItemId,
    slice,
  });

  return withRuntimeLock(
    {
      rootDir,
      workItemId: normalizedWorkItemId,
      owner: lockOwner,
      now,
      slice: resolvedSlice,
    },
    () => {
      const runtimeSnapshot = readRuntimeState({
        rootDir,
        workItemId: normalizedWorkItemId,
        slice: resolvedSlice,
      });

      if (action === "start" && runtimeSnapshot.state.last_completed_stage > 0) {
        throw new Error(
          `Work item ${normalizedWorkItemId} already started at stage ${runtimeSnapshot.state.last_completed_stage}. Use continue instead.`,
        );
      }

      const resolvedStage =
        Number.isInteger(Number(stage)) && Number(stage) >= 1
          ? Number(stage)
          : action === "start"
            ? 1
            : determineNextStage(runtimeSnapshot.state, now);
      const runResult = runStageWithArtifacts({
        rootDir,
        slice: resolvedSlice,
        stage: resolvedStage,
        workItemId: normalizedWorkItemId,
        syncStatus: true,
        now,
        ...options,
      });

      return {
        action,
        workItemId: normalizedWorkItemId,
        slice: resolvedSlice,
        stage: resolvedStage,
        ...runResult,
      };
    },
  );
}

/**
 * @param {OmoWorkItemSessionOptions} options
 */
export function startWorkItemSession(options) {
  return orchestrateStage({
    ...options,
    action: "start",
  });
}

/**
 * @param {OmoWorkItemSessionOptions} options
 */
export function continueWorkItemSession(options) {
  return orchestrateStage({
    ...options,
    action: "continue",
  });
}

/**
 * @param {OmoWorkItemSessionOptions & { stage: number|string }} options
 */
export function runWorkItemStage(options) {
  return orchestrateStage({
    ...options,
    action: "continue",
    stage: Number(options.stage),
  });
}

/**
 * @param {OmoResumePendingOptions} [options]
 */
export function resumePendingWorkItems({
  rootDir = process.cwd(),
  now,
  ...options
} = {}) {
  const dueStates = listDueRuntimeStates({
    rootDir,
    now,
  });

  return dueStates.map(({ state }) =>
    withRuntimeLock(
      {
        rootDir,
        workItemId: state.work_item_id,
        owner: `omo-resume-pending-${process.pid}`,
        now,
        slice: state.slice,
      },
      () => {
        const runResult = runStageWithArtifacts({
          rootDir,
          slice: state.slice ?? resolveSliceForWorkItem({
            rootDir,
            workItemId: state.work_item_id,
          }),
          stage: state.blocked_stage,
          workItemId: state.work_item_id,
          syncStatus: true,
          now,
          ...options,
        });

        return {
          workItemId: state.work_item_id,
          stage: state.blocked_stage,
          ...runResult,
        };
      },
    ),
  );
}

/**
 * @param {{ rootDir?: string, workItemId: string, slice?: string }} options
 */
export function readWorkItemSessionStatus({
  rootDir = process.cwd(),
  workItemId,
  slice = undefined,
}) {
  const normalizedWorkItemId = ensureNonEmptyString(workItemId, "workItemId");
  const resolvedSlice = resolveSliceForWorkItem({
    rootDir,
    workItemId: normalizedWorkItemId,
    slice,
  });
  const runtime = readRuntimeState({
    rootDir,
    workItemId: normalizedWorkItemId,
    slice: resolvedSlice,
  });
  const { workItem } = readTrackedWorkItem(rootDir, normalizedWorkItemId);
  const { statusBoard } = readTrackedStatus(rootDir);
  const statusItem = Array.isArray(statusBoard?.items)
    ? statusBoard.items.find((item) => item.id === normalizedWorkItemId) ?? null
    : null;

  return {
    workItemId: normalizedWorkItemId,
    slice: resolvedSlice,
    trackedWorkItem: workItem,
    trackedStatus: statusItem,
    runtime: runtime.state,
    operatorGuidance: buildOperatorGuidance(runtime.state),
  };
}
