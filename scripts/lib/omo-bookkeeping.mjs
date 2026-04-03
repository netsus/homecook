import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function ensureNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeTextFileIfChanged(filePath, nextContents) {
  const previous = readFileSync(filePath, "utf8");
  if (previous === nextContents) {
    return false;
  }

  writeFileSync(filePath, nextContents);
  return true;
}

function resolveDocsRoot({ rootDir = process.cwd(), worktreePath = null } = {}) {
  if (typeof worktreePath === "string" && worktreePath.trim().length > 0) {
    return resolve(worktreePath.trim());
  }

  return resolve(rootDir);
}

function resolveRoadmapPath({ rootDir = process.cwd(), worktreePath = null } = {}) {
  return resolve(resolveDocsRoot({ rootDir, worktreePath }), "docs", "workpacks", "README.md");
}

function resolveWorkpackPath({ rootDir = process.cwd(), worktreePath = null, slice }) {
  return resolve(
    resolveDocsRoot({ rootDir, worktreePath }),
    "docs",
    "workpacks",
    ensureNonEmptyString(slice, "slice"),
    "README.md",
  );
}

export function readSliceRoadmapStatus({
  rootDir = process.cwd(),
  worktreePath = null,
  slice,
}) {
  const normalizedSlice = ensureNonEmptyString(slice, "slice");
  const roadmapPath = resolveRoadmapPath({ rootDir, worktreePath });
  if (!existsSync(roadmapPath)) {
    if (typeof worktreePath === "string" && worktreePath.trim().length > 0) {
      return readSliceRoadmapStatus({
        rootDir,
        slice: normalizedSlice,
      });
    }

    return {
      status: null,
      filePath: roadmapPath,
      missing: true,
      reason: "roadmap_missing",
    };
  }

  const contents = readFileSync(roadmapPath, "utf8");
  const rowPattern = new RegExp(
    `^(\\|\\s*\`${escapeRegExp(normalizedSlice)}\`\\s*\\|\\s*)([^|]+)(\\|.*)$`,
    "m",
  );
  const match = contents.match(rowPattern);
  if (!match) {
    return {
      status: null,
      filePath: roadmapPath,
      missing: true,
      reason: "roadmap_row_missing",
    };
  }

  return {
    status: match[2].trim(),
    filePath: roadmapPath,
    missing: false,
    reason: null,
  };
}

export function updateSliceRoadmapStatus({
  worktreePath,
  slice,
  status,
}) {
  const roadmapPath = resolveRoadmapPath({ worktreePath });
  const contents = readFileSync(roadmapPath, "utf8");
  const rowPattern = new RegExp(
    `^(\\|\\s*\`${escapeRegExp(ensureNonEmptyString(slice, "slice"))}\`\\s*\\|\\s*)([^|]+)(\\|.*)$`,
    "m",
  );
  const match = contents.match(rowPattern);
  if (!match) {
    throw new Error(`Slice roadmap row for ${slice} not found.`);
  }

  const currentCell = match[2];
  const currentStatus = currentCell.trim();
  const nextStatus = ensureNonEmptyString(status, "status");
  if (currentStatus === nextStatus) {
    return {
      changed: false,
      filePath: roadmapPath,
    };
  }

  const paddedStatus =
    nextStatus.length <= currentCell.length ? nextStatus.padEnd(currentCell.length, " ") : nextStatus;
  const nextContents = contents.replace(rowPattern, `$1${paddedStatus}$3`);

  return {
    changed: writeTextFileIfChanged(roadmapPath, nextContents),
    filePath: roadmapPath,
  };
}

const DESIGN_STATUS_MATCHERS = {
  temporary: /\(temporary\)/,
  "pending-review": /\(pending-review\)/,
  confirmed: /\(confirmed\)/,
  "N/A": /\bN\/A\b/,
};

export function readWorkpackDesignStatus({
  rootDir = process.cwd(),
  worktreePath = null,
  slice,
}) {
  const workpackPath = resolveWorkpackPath({ rootDir, worktreePath, slice });
  if (!existsSync(workpackPath)) {
    if (typeof worktreePath === "string" && worktreePath.trim().length > 0) {
      return readWorkpackDesignStatus({
        rootDir,
        slice,
      });
    }

    return {
      status: null,
      filePath: workpackPath,
      missing: true,
      reason: "workpack_missing",
    };
  }

  const contents = readFileSync(workpackPath, "utf8");
  const lines = contents.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim() === "## Design Status");
  if (startIndex === -1) {
    return {
      status: null,
      filePath: workpackPath,
      missing: true,
      reason: "design_status_section_missing",
    };
  }

  const nextSectionIndex = lines.findIndex(
    (line, index) => index > startIndex && /^##\s+/.test(line.trim()),
  );
  const endIndex = nextSectionIndex === -1 ? lines.length : nextSectionIndex;
  const checkedStatuses = [];

  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const line = lines[index];
    if (!/^- \[[x ]\]/.test(line)) {
      continue;
    }

    for (const [status, matcher] of Object.entries(DESIGN_STATUS_MATCHERS)) {
      if (matcher.test(line) && /^- \[x\]/.test(line)) {
        checkedStatuses.push(status);
      }
    }
  }

  if (checkedStatuses.length !== 1) {
    return {
      status: null,
      filePath: workpackPath,
      missing: true,
      reason: checkedStatuses.length === 0 ? "design_status_missing" : "design_status_ambiguous",
    };
  }

  return {
    status: checkedStatuses[0],
    filePath: workpackPath,
    missing: false,
    reason: null,
  };
}

export function updateWorkpackDesignStatus({
  worktreePath,
  slice,
  targetStatus,
}) {
  const workpackPath = resolveWorkpackPath({ worktreePath, slice });
  const contents = readFileSync(workpackPath, "utf8");
  const lines = contents.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim() === "## Design Status");
  if (startIndex === -1) {
    throw new Error(`Design Status section missing in ${workpackPath}`);
  }
  const nextSectionIndex = lines.findIndex(
    (line, index) => index > startIndex && /^##\s+/.test(line.trim()),
  );
  const endIndex = nextSectionIndex === -1 ? lines.length : nextSectionIndex;
  let changed = false;

  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const line = lines[index];
    if (!/^- \[[x ]\]/.test(line)) {
      continue;
    }

    for (const [status, matcher] of Object.entries(DESIGN_STATUS_MATCHERS)) {
      if (!matcher.test(line)) {
        continue;
      }

      const nextPrefix = status === targetStatus ? "- [x]" : "- [ ]";
      const nextLine = line.replace(/^- \[[x ]\]/, nextPrefix);
      if (nextLine !== line) {
        lines[index] = nextLine;
        changed = true;
      }
    }
  }

  if (!changed) {
    return {
      changed: false,
      filePath: workpackPath,
    };
  }

  return {
    changed: writeTextFileIfChanged(workpackPath, `${lines.join("\n")}\n`),
    filePath: workpackPath,
  };
}

function readTrackedStatusItem({ rootDir, workItemId }) {
  const statusPath = resolve(rootDir, ".workflow-v2", "status.json");
  if (!existsSync(statusPath)) {
    return null;
  }

  const statusData = readJson(statusPath);
  const items = Array.isArray(statusData?.items) ? statusData.items : [];
  return items.find((item) => item?.id === workItemId) ?? null;
}

function readTrackedWorkItem({ rootDir, workItemId }) {
  const workItemPath = resolve(rootDir, ".workflow-v2", "work-items", `${workItemId}.json`);
  if (!existsSync(workItemPath)) {
    return null;
  }

  return readJson(workItemPath);
}

function normalizeLifecycle(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function resolveMaxObservedStage(runtimeState) {
  const candidates = [
    runtimeState?.active_stage,
    runtimeState?.current_stage,
    runtimeState?.last_completed_stage,
    runtimeState?.wait?.stage,
  ].filter((value) => Number.isInteger(value) && value >= 0);

  if (candidates.length === 0) {
    return 0;
  }

  return Math.max(...candidates);
}

function shouldRequireMergedRoadmap({ runtimeState, lifecycleStates, maxStage }) {
  if (
    runtimeState?.phase === "done" ||
    runtimeState?.phase === "merge_pending" ||
    lifecycleStates.includes("merged") ||
    (Number.isInteger(runtimeState?.last_completed_stage) && runtimeState.last_completed_stage >= 6) ||
    runtimeState?.wait?.pr_role === "closeout" ||
    Boolean(runtimeState?.prs?.closeout?.url)
  ) {
    return true;
  }

  return maxStage >= 6 && runtimeState?.phase === "merge_pending";
}

function shouldRequireInProgressRoadmap({ requireMergedRoadmap, runtimeState, lifecycleStates, maxStage }) {
  if (requireMergedRoadmap) {
    return false;
  }

  if (runtimeState?.prs?.backend?.url || runtimeState?.prs?.frontend?.url || runtimeState?.prs?.closeout?.url) {
    return true;
  }

  if (maxStage >= 3) {
    return true;
  }

  return lifecycleStates.some((value) => ["ready_for_review", "blocked", "merged"].includes(value));
}

function shouldRequireConfirmedDesign({
  requireMergedRoadmap,
  runtimeState,
  lifecycleStates,
  designStatus,
}) {
  if (designStatus === "N/A") {
    return false;
  }

  return (
    requireMergedRoadmap ||
    lifecycleStates.includes("merged") ||
    (Number.isInteger(runtimeState?.last_completed_stage) && runtimeState.last_completed_stage >= 5) ||
    (Number.isInteger(runtimeState?.wait?.stage) && runtimeState.wait.stage >= 6) ||
    (Number.isInteger(runtimeState?.active_stage) && runtimeState.active_stage >= 6) ||
    runtimeState?.phase === "done"
  );
}

function buildRepairAction(kind, targetStatus, filePath) {
  return {
    kind,
    target_status: targetStatus,
    file_path: filePath,
  };
}

export function evaluateBookkeepingInvariant({
  rootDir = process.cwd(),
  workItemId,
  slice,
  runtimeState,
  worktreePath = null,
}) {
  const normalizedWorkItemId = ensureNonEmptyString(workItemId, "workItemId");
  const normalizedSlice =
    typeof slice === "string" && slice.trim().length > 0 ? slice.trim() : normalizedWorkItemId;
  const trackedStatusItem = readTrackedStatusItem({
    rootDir,
    workItemId: normalizedWorkItemId,
  });
  const trackedWorkItem = readTrackedWorkItem({
    rootDir,
    workItemId: normalizedWorkItemId,
  });
  const roadmap = readSliceRoadmapStatus({
    rootDir,
    worktreePath,
    slice: normalizedSlice,
  });
  const design = readWorkpackDesignStatus({
    rootDir,
    worktreePath,
    slice: normalizedSlice,
  });
  const lifecycleStates = [
    normalizeLifecycle(runtimeState?.status?.lifecycle),
    normalizeLifecycle(trackedStatusItem?.lifecycle),
    normalizeLifecycle(trackedWorkItem?.status?.lifecycle),
  ].filter(Boolean);
  const maxStage = resolveMaxObservedStage(runtimeState);
  const requireMergedRoadmap = shouldRequireMergedRoadmap({
    runtimeState,
    lifecycleStates,
    maxStage,
  });
  const requireInProgressRoadmap = shouldRequireInProgressRoadmap({
    requireMergedRoadmap,
    runtimeState,
    lifecycleStates,
    maxStage,
  });
  const requireConfirmedDesign = shouldRequireConfirmedDesign({
    requireMergedRoadmap,
    runtimeState,
    lifecycleStates,
    designStatus: design.status,
  });
  const expectedRoadmapStatus = requireMergedRoadmap
    ? "merged"
    : requireInProgressRoadmap
      ? "in-progress"
      : null;
  const issues = [];
  const repairActions = [];

  if (roadmap.missing || design.missing) {
    return {
      outcome: "ambiguous_drift",
      reason: roadmap.reason ?? design.reason ?? "bookkeeping_source_missing",
      slice: normalizedSlice,
      workItemId: normalizedWorkItemId,
      docs: {
        roadmap,
        design,
      },
      tracked: {
        statusItem: trackedStatusItem,
        workItem: trackedWorkItem,
      },
      issues: [
        ...(roadmap.missing
          ? [{ kind: "roadmap_status", actual: null, expected: expectedRoadmapStatus, reason: roadmap.reason }]
          : []),
        ...(design.missing
          ? [{ kind: "design_status", actual: null, expected: requireConfirmedDesign ? "confirmed" : null, reason: design.reason }]
          : []),
      ],
      repairActions: [],
    };
  }

  if (expectedRoadmapStatus && roadmap.status !== expectedRoadmapStatus) {
    issues.push({
      kind: "roadmap_status",
      actual: roadmap.status,
      expected: expectedRoadmapStatus,
      file_path: roadmap.filePath,
    });
    repairActions.push(buildRepairAction("roadmap_status", expectedRoadmapStatus, roadmap.filePath));
  }

  if (requireConfirmedDesign && design.status !== "confirmed") {
    issues.push({
      kind: "design_status",
      actual: design.status,
      expected: "confirmed",
      file_path: design.filePath,
    });
    repairActions.push(buildRepairAction("design_status", "confirmed", design.filePath));
  }

  if (issues.length === 0) {
    return {
      outcome: "ok",
      reason: null,
      slice: normalizedSlice,
      workItemId: normalizedWorkItemId,
      docs: {
        roadmap,
        design,
      },
      tracked: {
        statusItem: trackedStatusItem,
        workItem: trackedWorkItem,
      },
      issues: [],
      repairActions: [],
    };
  }

  const isPostMerge = requireMergedRoadmap && (runtimeState?.phase === "done" || lifecycleStates.includes("merged"));

  return {
    outcome: isPostMerge ? "repairable_post_merge" : "repairable_pre_merge",
    reason: isPostMerge ? "official_docs_drift_after_merge" : "official_docs_drift_before_merge",
    slice: normalizedSlice,
    workItemId: normalizedWorkItemId,
    docs: {
      roadmap,
      design,
    },
    tracked: {
      statusItem: trackedStatusItem,
      workItem: trackedWorkItem,
    },
    issues,
    repairActions,
  };
}

export function applyBookkeepingRepairPlan({
  worktreePath,
  slice,
  repairActions,
}) {
  const normalizedActions = Array.isArray(repairActions) ? repairActions : [];
  const changedFiles = [];

  for (const action of normalizedActions) {
    if (action?.kind === "roadmap_status") {
      const result = updateSliceRoadmapStatus({
        worktreePath,
        slice,
        status: action.target_status,
      });
      if (result.changed && result.filePath) {
        changedFiles.push(result.filePath);
      }
      continue;
    }

    if (action?.kind === "design_status") {
      const result = updateWorkpackDesignStatus({
        worktreePath,
        slice,
        targetStatus: action.target_status,
      });
      if (result.changed && result.filePath) {
        changedFiles.push(result.filePath);
      }
    }
  }

  return {
    changed: changedFiles.length > 0,
    changedFiles,
  };
}
