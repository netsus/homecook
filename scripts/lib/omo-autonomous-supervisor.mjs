import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { runStageWithArtifacts } from "./omo-lite-runner.mjs";
import { syncWorkflowV2Status } from "./omo-lite-supervisor.mjs";
import { createGithubAutomationClient } from "./omo-github.mjs";
import { resolveClaudeProviderConfig, resolveCodexProviderConfig } from "./omo-provider-config.mjs";
import {
  acquireRuntimeLock,
  resolveRuntimePath,
  listRuntimeStates,
  markStageCompleted,
  readRuntimeState,
  releaseRuntimeLock,
  setRecoveryState,
  setExecutionState,
  setLastReview,
  setPullRequestRef,
  setWaitState,
  setWorkspaceBinding,
  writeRuntimeState,
  isRetryDue,
} from "./omo-session-runtime.mjs";
import { validateStageResult } from "./omo-stage-result.mjs";
import {
  assertWorktreeClean,
  ensureSupervisorWorktree,
  ensureWorktreeBranch,
  getWorktreeBinaryDiff,
  getWorktreeHeadSha,
  getWorktreeCurrentBranch,
  listWorktreeChangedFiles,
  commitWorktreeChanges,
  pushWorktreeBranch,
  syncWorktreeWithBaseBranch,
} from "./omo-worktree.mjs";

function ensureNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function formatTimestampSlug(value) {
  const source =
    typeof value === "string" && value.trim().length > 0 ? value.trim() : new Date().toISOString();
  return source.replace(/[:.]/g, "-");
}

function resolveSupervisorArtifactDir({
  rootDir,
  workItemId,
  now,
}) {
  return resolve(
    rootDir,
    ".artifacts",
    "omo-supervisor",
    `${formatTimestampSlug(now)}-${workItemId}`,
  );
}

function writeSupervisorArtifact({
  rootDir,
  workItemId,
  now,
  summary,
  runtimeState = null,
  worktree = null,
}) {
  const artifactDir = resolveSupervisorArtifactDir({
    rootDir,
    workItemId,
    now,
  });
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(resolve(artifactDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

  const recovery = summary?.recovery ?? runtimeState?.recovery ?? null;
  if (recovery) {
    writeFileSync(resolve(artifactDir, "recovery.json"), `${JSON.stringify(recovery, null, 2)}\n`);

    if (Array.isArray(recovery.changed_files) && recovery.changed_files.length > 0) {
      writeFileSync(resolve(artifactDir, "recovery.changed-files.txt"), `${recovery.changed_files.join("\n")}\n`);
    }

    const worktreePath = runtimeState?.workspace?.path ?? null;
    if (
      recovery.salvage_candidate &&
      typeof worktreePath === "string" &&
      worktreePath.trim().length > 0 &&
      typeof worktree?.getBinaryDiff === "function"
    ) {
      try {
        const patch = worktree.getBinaryDiff({
          worktreePath,
        });
        if (typeof patch === "string" && patch.length > 0) {
          writeFileSync(resolve(artifactDir, "recovery.patch"), patch);
        }
      } catch {
        // Best-effort evidence only; summary/recovery JSON remains the source of truth.
      }
    }
  }

  return artifactDir;
}

function resolveSlice({ workItemId, slice }) {
  return typeof slice === "string" && slice.trim().length > 0 ? slice.trim() : workItemId;
}

function resolveBranchRole(stage) {
  if (stage === 1) return "docs";
  if (stage === 2 || stage === 3) return "backend";
  return "frontend";
}

function resolveBranchName({ slice, stage }) {
  if (stage === 1) {
    return `docs/${slice}`;
  }

  if (stage === 2 || stage === 3) {
    return `feature/be-${slice}`;
  }

  return `feature/fe-${slice}`;
}

function resolvePrRole(stage) {
  if (stage === 1) return "docs";
  if (stage === 2 || stage === 3) return "backend";
  return "frontend";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function writeTextFileIfChanged(filePath, nextContents) {
  const previous = readFileSync(filePath, "utf8");
  if (previous === nextContents) {
    return false;
  }
  writeFileSync(filePath, nextContents);
  return true;
}

function updateSliceRoadmapStatus({
  worktreePath,
  slice,
  status,
}) {
  const roadmapPath = resolve(
    ensureNonEmptyString(worktreePath, "worktreePath"),
    "docs",
    "workpacks",
    "README.md",
  );
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

function updateWorkpackDesignStatus({
  worktreePath,
  slice,
  targetStatus,
}) {
  const workpackPath = resolve(
    ensureNonEmptyString(worktreePath, "worktreePath"),
    "docs",
    "workpacks",
    ensureNonEmptyString(slice, "slice"),
    "README.md",
  );
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
  const statusMatchers = {
    temporary: /\(temporary\)/,
    "pending-review": /\(pending-review\)/,
    confirmed: /\(confirmed\)/,
    "N/A": /\bN\/A\b/,
  };
  let changed = false;

  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const line = lines[index];
    if (!/^- \[[x ]\]/.test(line)) {
      continue;
    }

    for (const [status, matcher] of Object.entries(statusMatchers)) {
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

function applyCodeStageBookkeeping({
  worktreePath,
  slice,
  stage,
}) {
  if (stage === 2) {
    return updateSliceRoadmapStatus({
      worktreePath,
      slice,
      status: "in-progress",
    });
  }

  if (stage === 4) {
    return updateWorkpackDesignStatus({
      worktreePath,
      slice,
      targetStatus: "pending-review",
    });
  }

  return {
    changed: false,
    filePath: null,
  };
}

function applyDesignReviewBookkeeping({
  worktreePath,
  slice,
}) {
  return updateWorkpackDesignStatus({
    worktreePath,
    slice,
    targetStatus: "confirmed",
  });
}

function applyFrontendMergeBookkeeping({
  worktreePath,
  slice,
}) {
  return updateSliceRoadmapStatus({
    worktreePath,
    slice,
    status: "merged",
  });
}

function defaultBackRoute(stage) {
  if (stage === 3) return 2;
  return 4;
}

function bucketToVerification(bucket) {
  if (bucket === "fail") {
    return "failed";
  }

  if (bucket === "pass") {
    return "passed";
  }

  return "pending";
}

function resolveStatePhase(state) {
  return typeof state?.phase === "string" && state.phase.trim().length > 0
    ? state.phase.trim()
    : null;
}

function isPendingFinalizePhase(phase) {
  return ["stage_result_ready", "verify_pending", "commit_pending", "push_pending", "pr_pending"].includes(
    phase,
  );
}

function isPendingReviewPhase(phase) {
  return ["review_pending", "merge_pending"].includes(phase);
}

function shouldAllowDirtyWorktree(state) {
  const phase = resolveStatePhase(state);
  return ["stage_result_ready", "verify_pending", "commit_pending"].includes(phase);
}

function createTickResult({
  workItemId,
  slice = null,
  action,
  reason = null,
  wait = null,
  runtime = null,
}) {
  return {
    workItemId,
    slice,
    action,
    reason,
    wait,
    runtime,
  };
}

function resolveStageProvider({
  rootDir,
  stage,
  claudeProvider,
  claudeBin,
  claudeModel,
  claudeEffort,
  opencodeBin,
  environment,
}) {
  if ([2, 4].includes(stage)) {
    const codexProviderConfig = resolveCodexProviderConfig({
      rootDir,
      bin: opencodeBin,
      environment,
    });

    return {
      provider: "opencode",
      bin: codexProviderConfig.bin,
      label: "Codex OpenCode",
    };
  }

  const claudeProviderConfig = resolveClaudeProviderConfig({
    rootDir,
    provider: claudeProvider,
    bin: claudeBin,
    model: claudeModel,
    effort: claudeEffort,
  });

  return {
    provider: claudeProviderConfig.provider,
    bin: claudeProviderConfig.bin,
    label: claudeProviderConfig.provider === "opencode" ? "Claude OpenCode" : "Claude CLI",
  };
}

function runProviderPreflight({
  bin,
  args,
  rootDir,
  environment,
  errorPrefix,
}) {
  const result = spawnSync(bin, args, {
    cwd: rootDir,
    env: {
      ...process.env,
      ...(environment ?? {}),
    },
    encoding: "utf8",
  });

  if (result.error) {
    throw new Error(`${errorPrefix}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
    const stdout = typeof result.stdout === "string" ? result.stdout.trim() : "";
    const details = stderr || stdout || `exit code ${result.status}`;
    throw new Error(`${errorPrefix}: ${details}`);
  }

  return {
    stdout: typeof result.stdout === "string" ? result.stdout.trim() : "",
    stderr: typeof result.stderr === "string" ? result.stderr.trim() : "",
  };
}

function buildRecoverySnapshot({
  state,
  stage,
  kind,
  reason,
  prRole,
  artifactDir,
  worktreePath,
  worktree,
  now,
}) {
  if (typeof worktreePath !== "string" || worktreePath.trim().length === 0) {
    return null;
  }

  let branch = null;
  let changedFiles = [];

  try {
    branch = worktree.getCurrentBranch({
      worktreePath,
    });
  } catch {
    branch = state.prs?.[prRole ?? ""]?.branch ?? null;
  }

  try {
    changedFiles = worktree.listChangedFiles({
      worktreePath,
    });
  } catch {
    changedFiles = [];
  }

  const sessionRole = [1, 3, 5, 6].includes(stage) ? "claude_primary" : "codex_primary";
  const session = state.sessions?.[sessionRole] ?? null;
  const existingPr = prRole ? state.prs?.[prRole] ?? null : null;

  return {
    kind,
    stage,
    branch,
    reason,
    artifact_dir: artifactDir ?? state.last_artifact_dir,
    changed_files: changedFiles,
    existing_pr:
      existingPr?.url
        ? {
            role: prRole,
            number: existingPr.number ?? null,
            url: existingPr.url,
            draft: existingPr.draft ?? null,
            branch: existingPr.branch ?? null,
            head_sha: existingPr.head_sha ?? null,
          }
        : null,
    salvage_candidate: changedFiles.length > 0,
    session_role: sessionRole,
    session_provider: session?.provider ?? null,
    session_id: session?.session_id ?? null,
    updated_at: now,
  };
}

function createDefaultStageRunner({
  rootDir,
  claudeBudgetState,
  mode,
  opencodeBin,
  claudeProvider,
  claudeBin,
  claudeModel,
  claudeEffort,
  environment,
  homeDir,
  now,
}) {
  return ({ workItemId, slice, stage, executionDir }) =>
    runStageWithArtifacts({
      rootDir,
      executionDir,
      workItemId,
      slice,
      stage,
      claudeBudgetState,
      mode,
      opencodeBin,
      claudeProvider,
      claudeBin,
      claudeModel,
      claudeEffort,
      environment,
      homeDir,
      now,
      syncStatus: false,
      lifecycleMode: "supervisor",
    });
}

function loadRuntime({ rootDir, workItemId, slice }) {
  return readRuntimeState({
    rootDir,
    workItemId,
    slice,
  }).state;
}

function saveRuntime({ rootDir, workItemId, state }) {
  return writeRuntimeState({
    rootDir,
    workItemId,
    state,
  }).state;
}

function syncStatus({
  rootDir,
  workItemId,
  patch,
  now,
}) {
  return syncWorkflowV2Status({
    rootDir,
    workItemId,
    patch,
    updatedAt: now,
  });
}

function applyBlocker({
  rootDir,
  workItemId,
  slice,
  state,
  reason,
  recovery = null,
  prPath = null,
  now,
}) {
  const nextState = saveRuntime({
    rootDir,
    workItemId,
    state: setRecoveryState({
      state: setWaitState({
        state,
        kind: "human_escalation",
        reason,
        updatedAt: now,
      }),
      recovery,
    }),
  });
  const notes = [`wait_kind=human_escalation`, `reason=${reason}`];
  if (recovery?.kind) {
    notes.push(`recovery_kind=${recovery.kind}`);
  }
  if (recovery?.artifact_dir) {
    notes.push(`artifact_dir=${recovery.artifact_dir}`);
  }
  syncStatus({
    rootDir,
    workItemId,
    patch: {
      pr_path: prPath ?? undefined,
      lifecycle: "blocked",
      approval_state: "human_escalation",
      verification_status: "pending",
      notes: notes.join(" "),
    },
    now,
  });

  return {
    slice,
    workItemId,
    wait: nextState.wait,
    runtime: nextState,
  };
}

function updateRuntimeStatusForWait({
  rootDir,
  workItemId,
  wait,
  prPath,
  now,
  approvalState = "not_started",
  lifecycle = "in_progress",
  verificationStatus = "pending",
  extraNotes = [],
}) {
  const notes = [`wait_kind=${wait.kind}`];
  if (wait.pr_role) {
    notes.push(`pr_role=${wait.pr_role}`);
  }
  if (wait.stage) {
    notes.push(`stage=${wait.stage}`);
  }
  if (wait.reason) {
    notes.push(`reason=${wait.reason}`);
  }
  if (wait.head_sha) {
    notes.push(`head_sha=${wait.head_sha}`);
  }
  notes.push(...extraNotes);

  syncStatus({
    rootDir,
    workItemId,
    patch: {
      pr_path: prPath ?? undefined,
      lifecycle,
      approval_state: approvalState,
      verification_status: verificationStatus,
      notes: notes.join(" "),
    },
    now,
  });
}

function isOwnPullRequestApprovalError(error) {
  return (
    error instanceof Error &&
    /can not approve your own pull request/i.test(error.message)
  );
}

function resolveApprovedHeadSha({
  approvedHeadSha,
  activeHeadSha,
}) {
  const normalizedApproved =
    typeof approvedHeadSha === "string" && approvedHeadSha.trim().length > 0
      ? approvedHeadSha.trim()
      : null;
  const normalizedActive =
    typeof activeHeadSha === "string" && activeHeadSha.trim().length > 0 ? activeHeadSha.trim() : null;

  if (!normalizedApproved) {
    return normalizedActive;
  }

  if (!normalizedActive) {
    return normalizedApproved;
  }

  if (
    normalizedApproved === normalizedActive ||
    (normalizedApproved.length < normalizedActive.length &&
      normalizedActive.startsWith(normalizedApproved))
  ) {
    return normalizedActive;
  }

  return normalizedApproved;
}

function setManualGateWait({
  rootDir,
  workItemId,
  state,
  kind,
  prRole,
  stage,
  headSha,
  reason = null,
  now,
  prPath,
  approvalState,
  verificationStatus = "passed",
  extraNotes = [],
}) {
  const nextState = saveRuntime({
    rootDir,
    workItemId,
    state: setWaitState({
      state,
      kind,
      prRole,
      stage,
      headSha,
      reason,
      updatedAt: now,
    }),
  });
  updateRuntimeStatusForWait({
    rootDir,
    workItemId,
    wait: nextState.wait,
    prPath,
    now,
    approvalState,
    lifecycle: "ready_for_review",
    verificationStatus,
    extraNotes,
  });
  return nextState;
}

function finalizeMergedReviewStage({
  rootDir,
  workItemId,
  state,
  stage,
  activePr,
  artifactDir,
  worktree,
  now,
}) {
  if (stage === 3) {
    worktree.syncBaseBranch();
    const nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setWaitState({
        state: markStageCompleted({
          state,
          stage,
          artifactDir,
        }),
        kind: "ready_for_next_stage",
        stage: 4,
        updatedAt: now,
      }),
    });
    updateRuntimeStatusForWait({
      rootDir,
      workItemId,
      wait: nextState.wait,
      prPath: activePr.url,
      now,
      approvalState: "claude_approved",
      lifecycle: "in_progress",
      verificationStatus: "passed",
      extraNotes: ["merge_source=human_verification"],
    });
    return {
      state: nextState,
      wait: nextState.wait,
      transitioned: true,
    };
  }

  const nextState = saveRuntime({
    rootDir,
    workItemId,
    state: markStageCompleted({
      state,
      stage,
      artifactDir,
    }),
  });
  syncStatus({
    rootDir,
    workItemId,
    patch: {
      pr_path: activePr.url,
      lifecycle: "merged",
      approval_state: "dual_approved",
      verification_status: "passed",
      notes: "wait_kind=none merged_after_human_verification",
    },
    now,
  });
  return {
    state: nextState,
    wait: null,
    transitioned: true,
    merged: true,
  };
}

function resolveRunResultRuntimeState({
  rootDir,
  workItemId,
  slice,
  runResult,
}) {
  return (
    runResult.runtimeSync?.state ??
    loadRuntime({
      rootDir,
      workItemId,
      slice,
    })
  );
}

function loadExecutionStageResult(state) {
  const stage = state.active_stage ?? state.current_stage ?? null;
  const stageResultPath = state.execution?.stage_result_path ?? null;
  if (!Number.isInteger(stage)) {
    throw new Error("Active stage is missing for execution finalization.");
  }

  if (typeof stageResultPath !== "string" || stageResultPath.trim().length === 0 || !existsSync(stageResultPath)) {
    throw new Error("stage-result.json is missing for execution finalization.");
  }

  return validateStageResult(stage, JSON.parse(readFileSync(stageResultPath, "utf8")));
}

function runVerifyCommands({
  worktreePath,
  commands,
  artifactDir,
}) {
  const normalizedCommands = Array.isArray(commands)
    ? commands.filter((entry) => typeof entry === "string" && entry.trim().length > 0)
    : [];

  if (normalizedCommands.length === 0) {
    return {
      bucket: "pass",
      commands: [],
    };
  }

  const results = normalizedCommands.map((command, index) => {
    const result = spawnSync("zsh", ["-lc", command], {
      cwd: worktreePath,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
    const prefix = resolve(artifactDir, `verify-${index + 1}`);
    writeFileSync(`${prefix}.stdout.log`, result.stdout ?? "");
    writeFileSync(`${prefix}.stderr.log`, result.stderr ?? "");

    return {
      command,
      exitCode: result.status ?? null,
      ok: result.status === 0 && !result.error,
    };
  });

  return {
    bucket: results.every((entry) => entry.ok) ? "pass" : "fail",
    commands: results,
  };
}

function handleDeferredStageExecution({
  rootDir,
  workItemId,
  slice,
  stage,
  prRole,
  prPath,
  headSha,
  runResult,
  worktree,
  now,
}) {
  if (runResult.execution?.mode === "execute") {
    return null;
  }

  const runtimeState = resolveRunResultRuntimeState({
    rootDir,
    workItemId,
    slice,
    runResult,
  });
  const runtimePhase = resolveStatePhase(runtimeState);

  if (isPendingFinalizePhase(runtimePhase) || isPendingReviewPhase(runtimePhase)) {
    return null;
  }

  if (runResult.execution?.mode === "scheduled-retry") {
    const nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setRecoveryState({
        state: setWaitState({
          state: runtimeState,
          kind: "blocked_retry",
          prRole,
          stage,
          headSha,
          reason: runResult.execution.reason,
          until: runtimeState.retry?.at ?? null,
          updatedAt: now,
        }),
        recovery: null,
      }),
    });
    updateRuntimeStatusForWait({
      rootDir,
      workItemId,
      wait: nextState.wait,
      prPath,
      now,
      approvalState: "awaiting_claude_or_human",
      lifecycle: "blocked",
      verificationStatus: "pending",
      extraNotes: [
        `artifact_dir=${runResult.artifactDir}`,
        ...(runtimeState.retry?.at ? [`retry_at=${runtimeState.retry.at}`] : []),
      ],
    });
    return {
      state: nextState,
      wait: nextState.wait,
      transitioned: false,
    };
  }

  const recovery =
    worktree && runtimeState.workspace?.path
      ? buildRecoverySnapshot({
          state: runtimeState,
          stage,
          kind: "partial_stage_failure",
          reason: runResult.execution?.reason ?? "stage execution could not continue",
          prRole,
          artifactDir: runResult.artifactDir,
          worktreePath: runtimeState.workspace.path,
          worktree,
          now,
        })
      : null;

  const nextState = saveRuntime({
    rootDir,
    workItemId,
    state: setRecoveryState({
      state: setWaitState({
        state: runtimeState,
        kind: "human_escalation",
        prRole,
        stage,
        headSha,
        reason: runResult.execution?.reason ?? "stage execution could not continue",
        updatedAt: now,
      }),
      recovery,
    }),
  });
  updateRuntimeStatusForWait({
    rootDir,
    workItemId,
    wait: nextState.wait,
    prPath,
    now,
    approvalState: "human_escalation",
    lifecycle: "blocked",
    verificationStatus: "pending",
    extraNotes: [
      `artifact_dir=${runResult.artifactDir}`,
      ...(recovery?.kind ? [`recovery_kind=${recovery.kind}`] : []),
    ],
  });
  return {
    state: nextState,
    wait: nextState.wait,
    transitioned: false,
  };
}

function determineInitialStage(state) {
  const phase = resolveStatePhase(state);
  if ((isPendingFinalizePhase(phase) || isPendingReviewPhase(phase)) && Number.isInteger(state.active_stage)) {
    return state.active_stage;
  }

  if (state.wait?.kind === "ready_for_next_stage" && Number.isInteger(state.wait.stage)) {
    return state.wait.stage;
  }

  if (state.wait?.kind === "blocked_retry" && Number.isInteger(state.wait.stage)) {
    return state.wait.stage;
  }

  if (!state.last_completed_stage || state.last_completed_stage < 1) {
    return 1;
  }

  if (state.last_completed_stage >= 6) {
    return null;
  }

  return state.last_completed_stage + 1;
}

function processWaitState({
  rootDir,
  workItemId,
  state,
  github,
  worktree,
  now,
}) {
  const phase = resolveStatePhase(state);

  if (!state.wait?.kind) {
    return {
      state,
      action: "run-stage",
      nextStage:
        (isPendingFinalizePhase(phase) || isPendingReviewPhase(phase)) && Number.isInteger(state.active_stage)
          ? state.active_stage
          : determineInitialStage(state),
    };
  }

  if (state.wait.kind === "human_escalation") {
    return {
      state,
      action: "stop",
      nextStage: null,
    };
  }

  if (state.wait.kind === "human_review" || state.wait.kind === "human_verification") {
    const prRole = state.wait.pr_role;
    const activePr = prRole ? state.prs?.[prRole] : null;
    if (!activePr?.url) {
      throw new Error("Active pull request is missing for manual review/verification wait.");
    }

    const summary = github.getPullRequestSummary({
      prRef: activePr.url,
    });

    if (summary.mergedAt) {
      return finalizeMergedReviewStage({
        rootDir,
        workItemId,
        state,
        stage: state.wait.stage ?? state.active_stage,
        activePr,
        artifactDir: state.execution?.artifact_dir ?? state.last_artifact_dir,
        worktree,
        now,
      });
    }

    if (
      state.wait.kind === "human_review" &&
      typeof summary.reviewDecision === "string" &&
      summary.reviewDecision.toUpperCase() === "APPROVED"
    ) {
      const nextState = setManualGateWait({
        rootDir,
        workItemId,
        state,
        kind: "human_verification",
        prRole,
        stage: state.wait.stage ?? state.active_stage,
        headSha: activePr.head_sha ?? state.wait.head_sha ?? null,
        now,
        prPath: activePr.url,
        approvalState: "claude_approved",
        extraNotes: ["manual_review=approved", "manual_action=verify_behavior_and_merge"],
      });
      return {
        state: nextState,
        action: "wait",
        nextStage: null,
      };
    }

    updateRuntimeStatusForWait({
      rootDir,
      workItemId,
      wait: state.wait,
      prPath: activePr.url,
      now,
      approvalState:
        state.wait.kind === "human_review" ? "awaiting_claude_or_human" : "claude_approved",
      lifecycle: "ready_for_review",
      verificationStatus: "passed",
      extraNotes:
        state.wait.kind === "human_review"
          ? ["manual_action=record_github_approval"]
          : ["manual_action=verify_behavior_and_merge"],
    });
    return {
      state,
      action: "wait",
      nextStage: null,
    };
  }

  if (state.wait.kind === "blocked_retry") {
    if (!isRetryDue(state.retry, now)) {
      return {
        state,
        action: "wait",
        nextStage: null,
      };
    }

    const nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setWaitState({
        state,
        kind: null,
        updatedAt: now,
      }),
    });

    return {
      state: nextState,
      action: "run-stage",
      nextStage: state.wait.stage ?? state.blocked_stage,
    };
  }

  if (state.wait.kind === "ready_for_next_stage") {
    const nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setWaitState({
        state,
        kind: null,
        updatedAt: now,
      }),
    });

    return {
      state: nextState,
      action: "run-stage",
      nextStage: state.wait.stage,
    };
  }

  if (state.wait.kind === "ci") {
    const prRole = state.wait.pr_role;
    const activePr = prRole ? state.prs?.[prRole] : null;
    if (!activePr?.url) {
      throw new Error("Active pull request is missing for CI wait.");
    }

    const checks = github.getRequiredChecks({
      prRef: activePr.url,
    });

    if (checks.bucket === "fail") {
      throw new Error("Required checks failed.");
    }

    if (checks.bucket === "pending") {
      updateRuntimeStatusForWait({
        rootDir,
        workItemId,
        wait: state.wait,
        prPath: activePr.url,
        now,
        verificationStatus: bucketToVerification(checks.bucket),
      });
      return {
        state,
        action: "wait",
        nextStage: null,
      };
    }

    if (prRole === "docs") {
      if (phase === "merge_pending") {
        const nextState = saveRuntime({
          rootDir,
          workItemId,
          state: setWaitState({
            state,
            kind: null,
            updatedAt: now,
          }),
        });
        return {
          state: nextState,
          action: "run-stage",
          nextStage: state.active_stage ?? state.wait.stage,
        };
      }

      github.mergePullRequest({
        prRef: activePr.url,
        headSha: activePr.head_sha ?? state.wait.head_sha ?? "HEAD",
      });
      worktree.syncBaseBranch();
      const nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setWaitState({
          state,
          kind: "ready_for_next_stage",
          stage: 2,
          updatedAt: now,
        }),
      });
      updateRuntimeStatusForWait({
        rootDir,
        workItemId,
        wait: nextState.wait,
        prPath: activePr.url,
        now,
        verificationStatus: "passed",
      });
      return {
        state: nextState,
        action: "run-stage",
        nextStage: 2,
      };
    }

    if (prRole === "backend" && state.wait.stage === 2) {
      if (activePr.draft) {
        github.markReady({
          prRef: activePr.url,
        });
      }
      const nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setWaitState({
          state: setPullRequestRef({
            state,
            role: "backend",
            number: activePr.number,
            url: activePr.url,
            draft: false,
            branch: activePr.branch,
            headSha: activePr.head_sha,
            updatedAt: now,
          }),
          kind: "ready_for_next_stage",
          prRole: "backend",
          stage: 3,
          headSha: activePr.head_sha,
          updatedAt: now,
        }),
      });
      updateRuntimeStatusForWait({
        rootDir,
        workItemId,
        wait: nextState.wait,
        prPath: activePr.url,
        now,
        approvalState: "codex_approved",
        lifecycle: "ready_for_review",
        verificationStatus: "passed",
      });
      return {
        state: nextState,
        action: "run-stage",
        nextStage: 3,
      };
    }

    if (prRole === "frontend" && state.wait.stage === 4) {
      if (activePr.draft) {
        github.markReady({
          prRef: activePr.url,
        });
      }
      const nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setWaitState({
          state: setPullRequestRef({
            state,
            role: "frontend",
            number: activePr.number,
            url: activePr.url,
            draft: false,
            branch: activePr.branch,
            headSha: activePr.head_sha,
            updatedAt: now,
          }),
          kind: "ready_for_next_stage",
          prRole: "frontend",
          stage: 5,
          headSha: activePr.head_sha,
          updatedAt: now,
        }),
      });
      updateRuntimeStatusForWait({
        rootDir,
        workItemId,
        wait: nextState.wait,
        prPath: activePr.url,
        now,
        approvalState: "codex_approved",
        lifecycle: "ready_for_review",
        verificationStatus: "passed",
      });
      return {
        state: nextState,
        action: "run-stage",
        nextStage: 5,
      };
    }

    if (prRole === "frontend" && state.wait.stage === 5) {
      const nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setWaitState({
          state: setPullRequestRef({
            state,
            role: "frontend",
            number: activePr.number,
            url: activePr.url,
            draft: false,
            branch: activePr.branch,
            headSha: activePr.head_sha,
            updatedAt: now,
          }),
          kind: "ready_for_next_stage",
          prRole: "frontend",
          stage: 6,
          headSha: activePr.head_sha,
          updatedAt: now,
        }),
      });
      updateRuntimeStatusForWait({
        rootDir,
        workItemId,
        wait: nextState.wait,
        prPath: activePr.url,
        now,
        approvalState: "claude_approved",
        lifecycle: "ready_for_review",
        verificationStatus: "passed",
      });
      return {
        state: nextState,
        action: "run-stage",
        nextStage: 6,
      };
    }

    if (prRole === "frontend" && state.wait.stage === 6) {
      const nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setWaitState({
          state,
          kind: null,
          updatedAt: now,
        }),
      });
      return {
        state: nextState,
        action: "run-stage",
        nextStage: 6,
      };
    }

    if (phase === "merge_pending") {
      const nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setWaitState({
          state,
          kind: null,
          updatedAt: now,
        }),
      });
      return {
        state: nextState,
        action: "run-stage",
        nextStage: state.active_stage ?? state.wait.stage,
      };
    }

    const nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setWaitState({
        state,
        kind: "ready_for_next_stage",
        prRole,
        stage: state.wait.stage,
        headSha: activePr.head_sha,
        updatedAt: now,
      }),
    });
    return {
      state: nextState,
      action: "run-stage",
      nextStage: nextState.wait.stage,
    };
  }

  return {
    state,
    action: "wait",
    nextStage: null,
  };
}

function assertStageProviderReady({
  auth,
  rootDir,
  stage,
  claudeProvider,
  claudeBin,
  claudeModel,
  claudeEffort,
  opencodeBin,
  environment,
}) {
  const provider =
    typeof auth?.resolveStageProvider === "function"
      ? auth.resolveStageProvider(stage)
      : resolveStageProvider({
          rootDir,
          stage,
          claudeProvider,
          claudeBin,
          claudeModel,
          claudeEffort,
          opencodeBin,
          environment,
        }).provider;

  if (typeof auth?.assertStageProviderReady === "function") {
    auth.assertStageProviderReady({
      stage,
      provider,
    });
    return;
  }

  if (provider === "opencode") {
    auth?.assertOpencodeAuth?.();
    return;
  }

  auth?.assertClaudeAuth?.();
}

function upsertPullRequest({
  rootDir,
  workItemId,
  state,
  role,
  pr,
  branch,
  headSha,
  now,
}) {
  return saveRuntime({
    rootDir,
    workItemId,
    state: setPullRequestRef({
      state,
      role,
      number: pr.number,
      url: pr.url,
      draft: pr.draft,
      branch,
      headSha,
      updatedAt: now,
    }),
  });
}

function getActivePullRequest(state, role) {
  return state.prs?.[role] ?? null;
}

function buildStageRecovery({
  state,
  stage,
  prRole,
  reason,
  now,
  worktree,
}) {
  return buildRecoverySnapshot({
    state,
    stage,
    kind: "partial_stage_failure",
    reason,
    prRole,
    artifactDir: state.execution?.artifact_dir ?? state.last_artifact_dir,
    worktreePath: state.workspace?.path,
    worktree,
    now,
  });
}

function blockWithRecovery({
  rootDir,
  workItemId,
  slice,
  state,
  stage,
  prRole,
  reason,
  now,
  worktree,
}) {
  const recovery = buildStageRecovery({
    state,
    stage,
    prRole,
    reason,
    now,
    worktree,
  });

  const blocked = applyBlocker({
    rootDir,
    workItemId,
    slice,
    state: setExecutionState({
      state,
      activeStage: stage,
      phase: "escalated",
      nextAction: "noop",
      artifactDir: state.execution?.artifact_dir ?? state.last_artifact_dir,
      execution: state.execution,
    }),
    reason,
    recovery,
    prPath: state.prs?.[prRole]?.url ?? null,
    now,
  });

  return {
    state: blocked.runtime,
    wait: blocked.wait,
    transitioned: false,
  };
}

function finalizeCodeStage({
  rootDir,
  workItemId,
  slice,
  state,
  stage,
  prRole,
  branchName,
  worktree,
  github,
  now,
}) {
  let nextState = state;
  const stageResult = loadExecutionStageResult(nextState);
  const artifactDir = nextState.execution?.artifact_dir ?? nextState.last_artifact_dir;
  const verifyCommands = nextState.execution?.verify_commands ?? [];

  if (["stage_result_ready", "verify_pending"].includes(resolveStatePhase(nextState))) {
    nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setExecutionState({
        state: nextState,
        activeStage: stage,
        phase: "verify_pending",
        nextAction: "finalize_stage",
        artifactDir,
        execution: nextState.execution,
      }),
    });

    const verify = runVerifyCommands({
      worktreePath: nextState.workspace.path,
      commands: verifyCommands,
      artifactDir,
    });
    if (verify.bucket === "fail") {
      return blockWithRecovery({
        rootDir,
        workItemId,
        slice,
        state: saveRuntime({
          rootDir,
          workItemId,
          state: setExecutionState({
            state: nextState,
            activeStage: stage,
            phase: "verify_pending",
            nextAction: "noop",
            artifactDir,
            execution: {
              ...nextState.execution,
              verify_bucket: "fail",
            },
          }),
        }),
        stage,
        prRole,
        reason: "Supervisor verify commands failed.",
        now,
        worktree,
      });
    }

    nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setExecutionState({
        state: nextState,
        activeStage: stage,
        phase: "commit_pending",
        nextAction: "finalize_stage",
        artifactDir,
        execution: {
          ...nextState.execution,
          verify_bucket: "pass",
        },
      }),
    });
  }

  if (resolveStatePhase(nextState) === "commit_pending") {
    applyCodeStageBookkeeping({
      worktreePath: nextState.workspace.path,
      slice,
      stage,
    });
    const currentHeadSha = worktree.getHeadSha();

    try {
      worktree.assertClean();
      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setExecutionState({
          state: nextState,
          activeStage: stage,
          phase: "push_pending",
          nextAction: "finalize_stage",
          artifactDir,
          execution: {
            ...nextState.execution,
            commit_sha: nextState.execution?.commit_sha ?? currentHeadSha,
          },
        }),
      });
    } catch {
      commitWorktreeChanges({
        worktreePath: nextState.workspace.path,
        subject: stageResult.commit.subject,
        body: stageResult.commit.body_markdown,
      });
      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setExecutionState({
          state: nextState,
          activeStage: stage,
          phase: "push_pending",
          nextAction: "finalize_stage",
          artifactDir,
          execution: {
            ...nextState.execution,
            commit_sha: worktree.getHeadSha(),
          },
        }),
      });
    }
  }

  if (resolveStatePhase(nextState) === "push_pending") {
    worktree.pushBranch({
      branch: branchName,
    });
    nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setExecutionState({
        state: nextState,
        activeStage: stage,
        phase: "pr_pending",
        nextAction: "finalize_stage",
        artifactDir,
        execution: nextState.execution,
      }),
    });
  }

  if (resolveStatePhase(nextState) === "pr_pending") {
    const existingPr = getActivePullRequest(nextState, prRole);
    const headSha = nextState.execution?.commit_sha ?? worktree.getHeadSha();
    let pr;
    if (existingPr?.url) {
      github.editPullRequest?.({
        prRef: existingPr.url,
        title: stageResult.pr.title,
        body: stageResult.pr.body_markdown,
        workItemId,
      });
      pr = {
        number: existingPr.number,
        url: existingPr.url,
        draft: existingPr.draft ?? (prRole !== "docs"),
      };
    } else {
      pr = github.createPullRequest({
        base: "master",
        head: branchName,
        title: stageResult.pr.title,
        body: stageResult.pr.body_markdown,
        draft: prRole !== "docs",
        workItemId,
      });
    }

    nextState = upsertPullRequest({
      rootDir,
      workItemId,
      state: nextState,
      role: prRole,
      pr,
      branch: branchName,
      headSha,
      now,
    });

    const checks = github.getRequiredChecks({
      prRef: pr.url,
    });

    if (checks.bucket === "fail") {
      return blockWithRecovery({
        rootDir,
        workItemId,
        slice,
        state: nextState,
        stage,
        prRole,
        reason: "Required checks failed.",
        now,
        worktree,
      });
    }

    if (prRole === "docs") {
      if (checks.bucket === "pending") {
        nextState = saveRuntime({
          rootDir,
          workItemId,
          state: setWaitState({
            state: setExecutionState({
              state: nextState,
              activeStage: stage,
              phase: "wait",
              nextAction: "poll_ci",
              artifactDir,
              execution: nextState.execution,
            }),
            kind: "ci",
            prRole: "docs",
            stage,
            headSha,
            updatedAt: now,
          }),
        });
        updateRuntimeStatusForWait({
          rootDir,
          workItemId,
          wait: nextState.wait,
          prPath: pr.url,
          now,
          verificationStatus: "pending",
        });
        return {
          state: nextState,
          wait: nextState.wait,
          transitioned: false,
        };
      }

      github.mergePullRequest({
        prRef: pr.url,
        headSha,
      });
      worktree.syncBaseBranch();
      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setWaitState({
          state: markStageCompleted({
            state: nextState,
            stage,
            artifactDir,
          }),
          kind: "ready_for_next_stage",
          stage: 2,
          updatedAt: now,
        }),
      });
      updateRuntimeStatusForWait({
        rootDir,
        workItemId,
        wait: nextState.wait,
        prPath: pr.url,
        now,
        verificationStatus: "passed",
      });
      return {
        state: nextState,
        wait: nextState.wait,
        transitioned: true,
      };
    }

    if (checks.bucket === "pending") {
      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setWaitState({
          state: markStageCompleted({
            state: nextState,
            stage,
            artifactDir,
          }),
          kind: "ci",
          prRole,
          stage,
          headSha,
          updatedAt: now,
        }),
      });
      updateRuntimeStatusForWait({
        rootDir,
        workItemId,
        wait: nextState.wait,
        prPath: pr.url,
        now,
        verificationStatus: "pending",
      });
      return {
        state: nextState,
        wait: nextState.wait,
        transitioned: false,
      };
    }

    github.markReady({
      prRef: pr.url,
    });
    nextState = upsertPullRequest({
      rootDir,
      workItemId,
      state: nextState,
      role: prRole,
      pr: {
        ...pr,
        draft: false,
      },
      branch: branchName,
      headSha,
      now,
    });
    nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setWaitState({
        state: markStageCompleted({
          state: nextState,
          stage,
          artifactDir,
        }),
        kind: "ready_for_next_stage",
        prRole,
        stage: stage === 2 ? 3 : 5,
        headSha,
        updatedAt: now,
      }),
    });
    updateRuntimeStatusForWait({
      rootDir,
      workItemId,
      wait: nextState.wait,
      prPath: pr.url,
      now,
      approvalState: "codex_approved",
      lifecycle: "ready_for_review",
      verificationStatus: "passed",
    });
    return {
      state: nextState,
      wait: nextState.wait,
      transitioned: true,
    };
  }

  return {
    state: nextState,
    wait: nextState.wait,
    transitioned: false,
  };
}

function handleCodeStage({
  rootDir,
  workItemId,
  slice,
  state,
  stage,
  stageRunner,
  worktree,
  github,
  now,
}) {
  const branchRole = resolveBranchRole(stage);
  const branchName = resolveBranchName({ slice, stage });
  const prRole = resolvePrRole(stage);
  worktree.checkoutBranch({
    branch: branchName,
    startPoint: "origin/master",
  });

  let nextState = saveRuntime({
    rootDir,
    workItemId,
    state: setWorkspaceBinding({
      state,
      path: state.workspace?.path,
      branchRole,
      updatedAt: now,
    }),
  });
  const existingPr = getActivePullRequest(nextState, prRole);
  const phase = resolveStatePhase(nextState);

  if (!isPendingFinalizePhase(phase) || nextState.active_stage !== stage) {
    const runResult = stageRunner({
      rootDir,
      workItemId,
      slice,
      stage,
      executionDir: state.workspace?.path,
    });
    const deferredOutcome = handleDeferredStageExecution({
      rootDir,
      workItemId,
      slice,
      stage,
      prRole,
      prPath: existingPr?.url ?? null,
      headSha: existingPr?.head_sha ?? null,
      runResult,
      worktree,
      now,
    });
    if (deferredOutcome) {
      return deferredOutcome;
    }

    nextState = resolveRunResultRuntimeState({
      rootDir,
      workItemId,
      slice,
      runResult,
    });

    if (!isPendingFinalizePhase(resolveStatePhase(nextState)) && runResult.stageResult) {
      const stageResultPath = resolve(runResult.artifactDir, "stage-result.json");
      mkdirSync(runResult.artifactDir, { recursive: true });
      if (!existsSync(stageResultPath)) {
        writeFileSync(stageResultPath, `${JSON.stringify(runResult.stageResult, null, 2)}\n`);
      }
      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setExecutionState({
          state: nextState,
          activeStage: stage,
          phase: "stage_result_ready",
          nextAction: "finalize_stage",
          artifactDir: runResult.artifactDir,
          execution: {
            provider: runResult.execution?.provider ?? null,
            session_role: stage === 1 ? "claude_primary" : "codex_primary",
            session_id: runResult.execution?.sessionId ?? null,
            artifact_dir: runResult.artifactDir,
            stage_result_path: stageResultPath,
            started_at: now,
            finished_at: now,
            verify_commands: [],
            verify_bucket: null,
            commit_sha: null,
            pr_role: prRole,
          },
          clearRecovery: true,
        }),
      });
    }
  }

  return finalizeCodeStage({
    rootDir,
    workItemId,
    slice,
    state: nextState,
    stage,
    prRole,
    branchName,
    worktree,
    github,
    now,
  });
}

function handleReviewStage({
  rootDir,
  workItemId,
  state,
  stage,
  stageRunner,
  worktree,
  github,
  now,
}) {
  const branchRole = resolveBranchRole(stage);
  const prRole = resolvePrRole(stage);
  let nextState = state;
  let activePr = getActivePullRequest(nextState, prRole);
  if (!activePr?.url) {
    throw new Error(`No active ${prRole} pull request found.`);
  }

  worktree.checkoutBranch({
    branch: activePr.branch ?? resolveBranchName({ slice: state.slice ?? workItemId, stage }),
    startPoint: "origin/master",
  });

  nextState = saveRuntime({
    rootDir,
    workItemId,
    state: setWorkspaceBinding({
      state: nextState,
      path: state.workspace?.path,
      branchRole,
      updatedAt: now,
    }),
  });
  const phase = resolveStatePhase(nextState);

  if ((!isPendingReviewPhase(phase) && phase !== "merge_pending") || nextState.active_stage !== stage) {
    const runResult = stageRunner({
      rootDir,
      workItemId,
      slice: state.slice ?? workItemId,
      stage,
      executionDir: state.workspace?.path,
    });
    const deferredOutcome = handleDeferredStageExecution({
      rootDir,
      workItemId,
      slice: state.slice ?? workItemId,
      stage,
      prRole,
      prPath: activePr.url,
      headSha: activePr.head_sha ?? null,
      runResult,
      worktree,
      now,
    });
    if (deferredOutcome) {
      return deferredOutcome;
    }
    nextState = resolveRunResultRuntimeState({
      rootDir,
      workItemId,
      slice: state.slice ?? workItemId,
      runResult,
    });

    if (!isPendingReviewPhase(resolveStatePhase(nextState)) && runResult.stageResult) {
      const stageResultPath = resolve(runResult.artifactDir, "stage-result.json");
      mkdirSync(runResult.artifactDir, { recursive: true });
      if (!existsSync(stageResultPath)) {
        writeFileSync(stageResultPath, `${JSON.stringify(runResult.stageResult, null, 2)}\n`);
      }
      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setExecutionState({
          state: nextState,
          activeStage: stage,
          phase: "review_pending",
          nextAction: "run_review",
          artifactDir: runResult.artifactDir,
          execution: {
            provider: runResult.execution?.provider ?? null,
            session_role: "claude_primary",
            session_id: runResult.execution?.sessionId ?? null,
            artifact_dir: runResult.artifactDir,
            stage_result_path: stageResultPath,
            started_at: now,
            finished_at: now,
            verify_commands: [],
            verify_bucket: null,
            commit_sha: null,
            pr_role: prRole,
          },
          clearRecovery: true,
        }),
      });
    }
  }

  activePr = getActivePullRequest(nextState, prRole);
  const stageResult = loadExecutionStageResult(nextState);
  const artifactDir = nextState.execution?.artifact_dir ?? nextState.last_artifact_dir;
  const reviewRole = prRole === "backend" ? "backend" : "frontend";

  if (resolveStatePhase(nextState) === "review_pending") {
    nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setLastReview({
        state: nextState,
        role: reviewRole,
        decision: stageResult.decision,
        routeBackStage: stageResult.route_back_stage,
        approvedHeadSha: stageResult.approved_head_sha,
        bodyMarkdown: stageResult.body_markdown,
        updatedAt: now,
      }),
    });

    if (stage === 5) {
      github.commentPullRequest({
        prRef: activePr.url,
        body: stageResult.body_markdown,
      });
    } else {
      try {
        github.reviewPullRequest({
          prRef: activePr.url,
          decision: stageResult.decision,
          body: stageResult.body_markdown,
        });
      } catch (error) {
        if (stageResult.decision === "approve" && isOwnPullRequestApprovalError(error)) {
          github.commentPullRequest({
            prRef: activePr.url,
            body: stageResult.body_markdown,
          });
          nextState = setManualGateWait({
            rootDir,
            workItemId,
            state: nextState,
            kind: "human_review",
            prRole,
            stage,
            headSha: activePr.head_sha ?? null,
            reason: "formal_github_review_required",
            now,
            prPath: activePr.url,
            approvalState: "awaiting_claude_or_human",
            extraNotes: ["manual_action=record_github_approval"],
          });
          return {
            state: nextState,
            wait: nextState.wait,
            transitioned: false,
          };
        } else {
          throw error;
        }
      }
    }

    if (stageResult.decision === "approve") {
      if (stage === 5) {
        const bookkeeping = applyDesignReviewBookkeeping({
          worktreePath: nextState.workspace.path,
          slice: state.slice ?? workItemId,
        });

        if (bookkeeping.changed) {
          commitWorktreeChanges({
            worktreePath: nextState.workspace.path,
            subject: `docs(workpack): confirm ${state.slice ?? workItemId} design status`,
            body: "Stage 5 디자인 리뷰 승인에 따라 Design Status를 confirmed로 정렬합니다.",
          });
          worktree.pushBranch({
            branch: activePr.branch ?? resolveBranchName({ slice: state.slice ?? workItemId, stage }),
          });
          const headSha = worktree.getHeadSha();
          nextState = upsertPullRequest({
            rootDir,
            workItemId,
            state: nextState,
            role: "frontend",
            pr: activePr,
            branch: activePr.branch ?? resolveBranchName({ slice: state.slice ?? workItemId, stage }),
            headSha,
            now,
          });
          nextState = saveRuntime({
            rootDir,
            workItemId,
            state: setWaitState({
              state: markStageCompleted({
                state: nextState,
                stage,
                artifactDir,
              }),
              kind: "ci",
              prRole: "frontend",
              stage: 5,
              headSha,
              updatedAt: now,
            }),
          });
          updateRuntimeStatusForWait({
            rootDir,
            workItemId,
            wait: nextState.wait,
            prPath: activePr.url,
            now,
            approvalState: "claude_approved",
            lifecycle: "ready_for_review",
            verificationStatus: "pending",
            extraNotes: ["bookkeeping=design_status_confirmed"],
          });
          return {
            state: nextState,
            wait: nextState.wait,
            transitioned: false,
          };
        }

        nextState = saveRuntime({
          rootDir,
          workItemId,
          state: setWaitState({
            state: markStageCompleted({
              state: nextState,
              stage,
              artifactDir,
            }),
            kind: "ready_for_next_stage",
            prRole: "frontend",
            stage: 6,
            headSha: activePr.head_sha,
            updatedAt: now,
          }),
        });
        updateRuntimeStatusForWait({
          rootDir,
          workItemId,
          wait: nextState.wait,
          prPath: activePr.url,
          now,
          approvalState: "claude_approved",
          lifecycle: "ready_for_review",
          verificationStatus: "passed",
        });
        return {
          state: nextState,
          wait: nextState.wait,
          transitioned: true,
        };
      }

      if (stage === 6) {
        const bookkeeping = applyFrontendMergeBookkeeping({
          worktreePath: nextState.workspace.path,
          slice: state.slice ?? workItemId,
        });

        if (bookkeeping.changed) {
          commitWorktreeChanges({
            worktreePath: nextState.workspace.path,
            subject: `docs(workpacks): mark ${state.slice ?? workItemId} merged`,
            body: "Stage 6 최종 승인 뒤 frontend PR에 merged bookkeeping을 반영합니다.",
          });
          worktree.pushBranch({
            branch: activePr.branch ?? resolveBranchName({ slice: state.slice ?? workItemId, stage }),
          });
          const headSha = worktree.getHeadSha();
          nextState = upsertPullRequest({
            rootDir,
            workItemId,
            state: nextState,
            role: prRole,
            pr: activePr,
            branch: activePr.branch ?? resolveBranchName({ slice: state.slice ?? workItemId, stage }),
            headSha,
            now,
          });
          nextState = saveRuntime({
            rootDir,
            workItemId,
            state: setWaitState({
              state: setExecutionState({
                state: nextState,
                activeStage: stage,
                nextAction: "poll_ci",
                artifactDir,
                execution: nextState.execution,
              }),
              kind: "ci",
              prRole: "frontend",
              stage: 6,
              headSha,
              phase: "merge_pending",
              nextAction: "poll_ci",
              updatedAt: now,
            }),
          });
          updateRuntimeStatusForWait({
            rootDir,
            workItemId,
            wait: nextState.wait,
            prPath: activePr.url,
            now,
            approvalState: "claude_approved",
            lifecycle: "ready_for_review",
            verificationStatus: "pending",
            extraNotes: ["bookkeeping=slice_status_merged", "manual_action=verify_behavior_and_merge"],
          });
          return {
            state: nextState,
            wait: nextState.wait,
            transitioned: false,
          };
        }
      }

      nextState = setManualGateWait({
        rootDir,
        workItemId,
        state: nextState,
        kind: "human_verification",
        prRole,
        stage,
        headSha: resolveApprovedHeadSha({
          approvedHeadSha: stageResult.approved_head_sha,
          activeHeadSha: activePr.head_sha,
        }),
        now,
        prPath: activePr.url,
        approvalState: "claude_approved",
        extraNotes: ["manual_action=verify_behavior_and_merge"],
      });
      return {
        state: nextState,
        wait: nextState.wait,
        transitioned: false,
      };
    } else {
      const routeBackStage = stageResult.route_back_stage ?? defaultBackRoute(stage);
      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setWaitState({
          state: markStageCompleted({
            state: nextState,
            stage,
            artifactDir,
          }),
          kind: "ready_for_next_stage",
          prRole,
          stage: routeBackStage,
          headSha: activePr.head_sha,
          updatedAt: now,
        }),
      });
      updateRuntimeStatusForWait({
        rootDir,
        workItemId,
        wait: nextState.wait,
        prPath: activePr.url,
        now,
        approvalState: "needs_revision",
        lifecycle: "in_progress",
        verificationStatus: "pending",
      });
      return {
        state: nextState,
        wait: nextState.wait,
        transitioned: true,
      };
    }
  }

  if (resolveStatePhase(nextState) === "merge_pending") {
    if ([3, 6].includes(stage)) {
      nextState = setManualGateWait({
        rootDir,
        workItemId,
        state: nextState,
        kind: "human_verification",
        prRole,
        stage,
        headSha: resolveApprovedHeadSha({
          approvedHeadSha: stageResult.approved_head_sha,
          activeHeadSha: activePr.head_sha,
        }),
        now,
        prPath: activePr.url,
        approvalState: "claude_approved",
        extraNotes: ["migrated_from=merge_pending", "manual_action=verify_behavior_and_merge"],
      });
      return {
        state: nextState,
        wait: nextState.wait,
        transitioned: false,
      };
    }

    const approvedHeadSha = resolveApprovedHeadSha({
      approvedHeadSha: stageResult.approved_head_sha,
      activeHeadSha: activePr.head_sha,
    });
    try {
      github.mergePullRequest({
        prRef: activePr.url,
        headSha: approvedHeadSha,
      });
    } catch (error) {
      if (/up to date|update branch|behind/i.test(error.message)) {
        github.updateBranch({
          prRef: activePr.url,
        });
        nextState = saveRuntime({
          rootDir,
          workItemId,
          state: setWaitState({
            state: setExecutionState({
              state: nextState,
              activeStage: stage,
              phase: "merge_pending",
              nextAction: "poll_ci",
              artifactDir,
              execution: nextState.execution,
            }),
            kind: "ci",
            prRole,
            stage,
            headSha: approvedHeadSha,
            updatedAt: now,
          }),
        });
        updateRuntimeStatusForWait({
          rootDir,
          workItemId,
          wait: nextState.wait,
          prPath: activePr.url,
          now,
          approvalState: "claude_approved",
          lifecycle: "ready_for_review",
          verificationStatus: "pending",
        });
        return {
          state: nextState,
          wait: nextState.wait,
          transitioned: false,
        };
      }

      throw error;
    }

    return finalizeMergedReviewStage({
      rootDir,
      workItemId,
      state: nextState,
      stage,
      activePr,
      artifactDir,
      worktree,
      now,
    });
  }

  return {
    state: nextState,
    wait: nextState.wait,
    transitioned: false,
  };
}

function createDefaultDependencies({
  rootDir,
  ghBin,
  opencodeBin,
  claudeProvider,
  claudeBin,
  claudeModel,
  claudeEffort,
  claudeBudgetState,
  mode,
  environment,
  homeDir,
  now,
}) {
  const github = createGithubAutomationClient({
    rootDir,
    ghBin,
    environment,
  });
  const claudeProviderConfig = resolveClaudeProviderConfig({
    rootDir,
    provider: claudeProvider,
    bin: claudeBin,
    model: claudeModel,
    effort: claudeEffort,
  });
  const codexProviderConfig = resolveCodexProviderConfig({
    rootDir,
    bin: opencodeBin,
    environment,
  });

  return {
    auth: {
      assertGhAuth() {
        github.assertAuth();
      },
      assertOpencodeAuth() {
        const result = runProviderPreflight({
          bin: codexProviderConfig.bin,
          args: ["auth", "list"],
          rootDir,
          environment,
          errorPrefix: "OpenCode auth is unavailable",
        });
        const output = `${result.stdout}\n${result.stderr}`;
        if (/0 credentials|no credentials/i.test(output)) {
          throw new Error("OpenCode auth is not configured for this machine.");
        }
      },
      assertClaudeAuth() {
        runProviderPreflight({
          bin: claudeProviderConfig.bin,
          args: ["--version"],
          rootDir,
          environment,
          errorPrefix: "Claude CLI is unavailable",
        });
      },
      resolveStageProvider(stage) {
        return resolveStageProvider({
          rootDir,
          stage,
          claudeProvider: claudeProviderConfig.provider,
          claudeBin: claudeProviderConfig.bin,
          claudeModel: claudeProviderConfig.model,
          claudeEffort: claudeProviderConfig.effort,
          opencodeBin: codexProviderConfig.bin,
          environment,
        }).provider;
      },
    },
    worktree: {
      ensureWorktree({ workItemId }) {
        return ensureSupervisorWorktree({
          rootDir,
          workItemId,
        });
      },
      assertClean({ worktreePath }) {
        return assertWorktreeClean({
          worktreePath,
        });
      },
      checkoutBranch({ branch, startPoint, worktreePath }) {
        return ensureWorktreeBranch({
          rootDir,
          worktreePath,
          branch,
          startPoint,
        });
      },
      pushBranch({ branch, worktreePath }) {
        return pushWorktreeBranch({
          worktreePath,
          branch,
        });
      },
      syncBaseBranch({ worktreePath }) {
        return syncWorktreeWithBaseBranch({
          rootDir,
          worktreePath,
        });
      },
      getHeadSha({ worktreePath }) {
        return getWorktreeHeadSha({
          worktreePath,
        });
      },
      getCurrentBranch({ worktreePath }) {
        return getWorktreeCurrentBranch({
          worktreePath,
        });
      },
      listChangedFiles({ worktreePath }) {
        return listWorktreeChangedFiles({
          worktreePath,
        });
      },
      getBinaryDiff({ worktreePath }) {
        return getWorktreeBinaryDiff({
          worktreePath,
        });
      },
    },
    github,
    stageRunner: createDefaultStageRunner({
      rootDir,
      claudeBudgetState,
      mode,
      opencodeBin,
      claudeProvider,
      claudeBin,
      claudeModel,
      claudeEffort,
      environment,
      homeDir,
      now,
    }),
  };
}

/**
 * @param {{
 *   rootDir?: string,
 *   workItemId: string,
 *   slice?: string,
 *   now?: string,
 *   maxTransitions?: number,
 *   ghBin?: string,
 *   opencodeBin?: string,
 *   claudeProvider?: "opencode"|"claude-cli",
 *   claudeBin?: string,
 *   claudeModel?: string,
 *   claudeEffort?: "low"|"medium"|"high",
 *   claudeBudgetState?: "available"|"constrained"|"unavailable",
 *   mode?: "artifact-only"|"execute",
 *   environment?: Record<string, string>,
 *   homeDir?: string,
 * }} options
 * @param {Record<string, unknown>} [injectedDependencies]
 */
export function superviseWorkItem(
  {
    rootDir = process.cwd(),
    workItemId,
    slice = undefined,
    now,
    maxTransitions = 8,
    ghBin,
    opencodeBin,
    claudeProvider,
    claudeBin,
    claudeModel,
    claudeEffort,
    claudeBudgetState,
    mode = "execute",
    environment,
    homeDir,
  },
  injectedDependencies = {},
) {
  const normalizedWorkItemId = ensureNonEmptyString(workItemId, "workItemId");
  const resolvedSlice = resolveSlice({
    workItemId: normalizedWorkItemId,
    slice,
  });
  const owner = `omo-supervisor-${process.pid}`;

  acquireRuntimeLock({
    rootDir,
    workItemId: normalizedWorkItemId,
    owner,
    now,
    slice: resolvedSlice,
  });

  try {
    let state = loadRuntime({
      rootDir,
      workItemId: normalizedWorkItemId,
      slice: resolvedSlice,
    });
    const dependencies = {
      ...createDefaultDependencies({
        rootDir,
        ghBin,
        opencodeBin,
        claudeProvider,
        claudeBin,
        claudeModel,
        claudeEffort,
        claudeBudgetState,
        mode,
        environment,
        homeDir,
        now,
      }),
      ...injectedDependencies,
    };

    try {
      dependencies.auth?.assertGhAuth?.();
    } catch (error) {
      const blocked = applyBlocker({
        rootDir,
        workItemId: normalizedWorkItemId,
        slice: resolvedSlice,
        state,
        reason: error.message,
        now,
      });
      const artifactDir = writeSupervisorArtifact({
        rootDir,
        workItemId: normalizedWorkItemId,
        now,
        summary: {
          workItemId: normalizedWorkItemId,
          slice: resolvedSlice,
          transitions: [],
          wait: blocked.wait,
          recovery: blocked.runtime.recovery,
        },
        runtimeState: blocked.runtime,
        worktree: dependencies.worktree,
      });

      return {
        ...blocked,
        artifactDir,
        transitions: [],
      };
    }

    const ensuredWorktree = dependencies.worktree.ensureWorktree({
      rootDir,
      workItemId: normalizedWorkItemId,
      slice: resolvedSlice,
    });
    state = saveRuntime({
      rootDir,
      workItemId: normalizedWorkItemId,
      state: setWorkspaceBinding({
        state,
        path: ensuredWorktree.path,
        branchRole: state.workspace?.branch_role,
        updatedAt: now,
      }),
    });

    const transitions = [];

    for (let transitionIndex = 0; transitionIndex < maxTransitions; transitionIndex += 1) {
      if (!shouldAllowDirtyWorktree(state)) {
        try {
          dependencies.worktree.assertClean({
            worktreePath: state.workspace.path,
          });
        } catch (error) {
          const recovery = buildRecoverySnapshot({
            state,
            stage: state.wait?.stage ?? state.current_stage ?? state.blocked_stage ?? state.last_completed_stage ?? 1,
            kind: "dirty_worktree",
            reason: error.message,
            prRole: state.wait?.pr_role ?? state.workspace?.branch_role ?? null,
            artifactDir: state.last_artifact_dir,
            worktreePath: state.workspace.path,
            worktree: {
              getCurrentBranch: ({ worktreePath }) =>
                dependencies.worktree.getCurrentBranch({
                  worktreePath,
                }),
              listChangedFiles: ({ worktreePath }) =>
                dependencies.worktree.listChangedFiles({
                  worktreePath,
                }),
            },
            now,
          });
          const blocked = applyBlocker({
            rootDir,
            workItemId: normalizedWorkItemId,
            slice: resolvedSlice,
            state,
            reason: error.message,
            recovery,
            prPath: state.prs?.[state.wait?.pr_role ?? ""]?.url ?? null,
            now,
          });
          const artifactDir = writeSupervisorArtifact({
            rootDir,
            workItemId: normalizedWorkItemId,
            now,
            summary: {
              workItemId: normalizedWorkItemId,
              slice: resolvedSlice,
              transitions,
              wait: blocked.wait,
              recovery: blocked.runtime.recovery,
            },
            runtimeState: blocked.runtime,
            worktree: dependencies.worktree,
          });

          return {
            ...blocked,
            artifactDir,
            transitions,
          };
        }
      }

      let waitProcessing;
      try {
        waitProcessing = processWaitState({
          rootDir,
          workItemId: normalizedWorkItemId,
          state,
          github: dependencies.github,
          worktree: {
            syncBaseBranch() {
              return dependencies.worktree.syncBaseBranch({
                rootDir,
                worktreePath: state.workspace.path,
              });
            },
          },
          now,
        });
      } catch (error) {
        const blocked = applyBlocker({
          rootDir,
          workItemId: normalizedWorkItemId,
          slice: resolvedSlice,
          state,
          reason: error.message,
          now,
        });
        const artifactDir = writeSupervisorArtifact({
          rootDir,
          workItemId: normalizedWorkItemId,
          now,
          summary: {
            workItemId: normalizedWorkItemId,
            slice: resolvedSlice,
            transitions,
            wait: blocked.wait,
            recovery: blocked.runtime.recovery,
          },
          runtimeState: blocked.runtime,
          worktree: dependencies.worktree,
        });

        return {
          ...blocked,
          artifactDir,
          transitions,
        };
      }

      state = waitProcessing.state;
      if (waitProcessing.action === "stop" || waitProcessing.action === "wait") {
        const artifactDir = writeSupervisorArtifact({
          rootDir,
          workItemId: normalizedWorkItemId,
          now,
          summary: {
            workItemId: normalizedWorkItemId,
            slice: resolvedSlice,
            transitions,
            wait: state.wait,
            recovery: state.recovery,
          },
          runtimeState: state,
          worktree: dependencies.worktree,
        });

        return {
          workItemId: normalizedWorkItemId,
          slice: resolvedSlice,
          wait: state.wait,
          runtime: state,
          artifactDir,
          transitions,
        };
      }

      const stage = waitProcessing.nextStage;
      if (!Number.isInteger(stage)) {
        const artifactDir = writeSupervisorArtifact({
          rootDir,
          workItemId: normalizedWorkItemId,
          now,
          summary: {
            workItemId: normalizedWorkItemId,
            slice: resolvedSlice,
            transitions,
            wait: state.wait,
            recovery: state.recovery,
          },
          runtimeState: state,
          worktree: dependencies.worktree,
        });

        return {
          workItemId: normalizedWorkItemId,
          slice: resolvedSlice,
          wait: state.wait,
          runtime: state,
          artifactDir,
          transitions,
        };
      }

      try {
        assertStageProviderReady({
          auth: dependencies.auth,
          rootDir,
          stage,
          claudeProvider,
          claudeBin,
          claudeModel,
          claudeEffort,
          opencodeBin,
          environment,
        });
      } catch (error) {
        const blocked = applyBlocker({
          rootDir,
          workItemId: normalizedWorkItemId,
          slice: resolvedSlice,
          state,
          reason: error.message,
          prPath: state.prs?.[resolvePrRole(stage)]?.url ?? null,
          now,
        });
        const artifactDir = writeSupervisorArtifact({
          rootDir,
          workItemId: normalizedWorkItemId,
          now,
          summary: {
            workItemId: normalizedWorkItemId,
            slice: resolvedSlice,
            transitions,
            wait: blocked.wait,
            recovery: blocked.runtime.recovery,
          },
          runtimeState: blocked.runtime,
          worktree: dependencies.worktree,
        });

        return {
          ...blocked,
          artifactDir,
          transitions,
        };
      }

      const stageWorktree = {
        checkoutBranch: ({ branch, startPoint }) =>
          dependencies.worktree.checkoutBranch({
            rootDir,
            worktreePath: state.workspace.path,
            branch,
            startPoint,
          }),
        pushBranch: ({ branch }) =>
          dependencies.worktree.pushBranch({
            worktreePath: state.workspace.path,
            branch,
          }),
        syncBaseBranch: () =>
          dependencies.worktree.syncBaseBranch({
            rootDir,
            worktreePath: state.workspace.path,
          }),
        getHeadSha: () =>
          dependencies.worktree.getHeadSha({
            worktreePath: state.workspace.path,
          }),
        assertClean: () =>
          dependencies.worktree.assertClean({
            worktreePath: state.workspace.path,
          }),
        getCurrentBranch: ({ worktreePath }) =>
          dependencies.worktree.getCurrentBranch({
            worktreePath,
          }),
        listChangedFiles: ({ worktreePath }) =>
          dependencies.worktree.listChangedFiles({
            worktreePath,
          }),
        getBinaryDiff: ({ worktreePath }) =>
          dependencies.worktree.getBinaryDiff({
            worktreePath,
          }),
      };

      const handler =
        [1, 2, 4].includes(stage)
          ? handleCodeStage
          : handleReviewStage;
      const stageOutcome = handler({
        rootDir,
        workItemId: normalizedWorkItemId,
        slice: resolvedSlice,
        state,
        stage,
        stageRunner: dependencies.stageRunner,
        worktree: stageWorktree,
        github: dependencies.github,
        now,
      });

      state = stageOutcome.state;
      transitions.push({
        stage,
        wait: state.wait,
      });

      if (stageOutcome.merged || !stageOutcome.transitioned) {
        const artifactDir = writeSupervisorArtifact({
          rootDir,
          workItemId: normalizedWorkItemId,
          now,
          summary: {
            workItemId: normalizedWorkItemId,
            slice: resolvedSlice,
            transitions,
            wait: state.wait,
            recovery: state.recovery,
          },
          runtimeState: state,
          worktree: stageWorktree,
        });

        return {
          workItemId: normalizedWorkItemId,
          slice: resolvedSlice,
          wait: state.wait,
          runtime: state,
          artifactDir,
          transitions,
        };
      }
    }

    const cappedState = state;
    const artifactDir = writeSupervisorArtifact({
      rootDir,
      workItemId: normalizedWorkItemId,
      now,
      summary: {
        workItemId: normalizedWorkItemId,
        slice: resolvedSlice,
        transitions,
        wait: cappedState.wait,
        recovery: cappedState.recovery,
      },
      runtimeState: cappedState,
      worktree: dependencies.worktree,
    });
    syncStatus({
      rootDir,
      workItemId: normalizedWorkItemId,
      patch: {
        lifecycle:
          cappedState.wait?.kind === "human_escalation" ? "blocked" : "in_progress",
        approval_state:
          cappedState.wait?.kind === "human_escalation" ? "human_escalation" : "not_started",
        verification_status: "pending",
        notes: `wait_kind=${cappedState.wait?.kind ?? "none"} reason=max transitions exceeded`,
      },
      now,
    });

    return {
      workItemId: normalizedWorkItemId,
      slice: resolvedSlice,
      wait: cappedState.wait,
      runtime: cappedState,
      artifactDir,
      transitions,
    };
  } finally {
    releaseRuntimeLock({
      rootDir,
      workItemId: normalizedWorkItemId,
      owner,
      slice: resolvedSlice,
    });
  }
}

/**
 * @param {{
 *   rootDir?: string,
 *   workItemId?: string,
 *   all?: boolean,
 *   now?: string,
 *   ghBin?: string,
 *   opencodeBin?: string,
 *   claudeProvider?: "opencode"|"claude-cli",
 *   claudeBin?: string,
 *   claudeModel?: string,
 *   claudeEffort?: "low"|"medium"|"high",
 *   claudeBudgetState?: "available"|"constrained"|"unavailable",
 *   mode?: "artifact-only"|"execute",
 *   environment?: Record<string, string>,
 *   homeDir?: string,
 * }} [options]
 * @param {Record<string, unknown>} [dependencies]
 */
export function tickSupervisorWorkItems(
  {
    rootDir = process.cwd(),
    workItemId = undefined,
    all = false,
    now,
    ...options
  } = {},
  dependencies = {},
) {
  const isResumableState = (state) => {
    const phase = resolveStatePhase(state);
    if (isPendingFinalizePhase(phase) || isPendingReviewPhase(phase)) {
      return {
        resumable: true,
        reason: null,
      };
    }

    if (!state.wait?.kind) {
      return {
        resumable: false,
        reason: "no_wait_state",
      };
    }

    if (!["ci", "blocked_retry", "ready_for_next_stage"].includes(state.wait.kind)) {
      return {
        resumable: false,
        reason: `unsupported_wait_kind=${state.wait.kind}`,
      };
    }

    if (state.wait.kind === "blocked_retry" && !isRetryDue(state.retry, now)) {
      return {
        resumable: false,
        reason: "retry_not_due",
      };
    }

    return {
      resumable: true,
      reason: null,
    };
  };

  if (typeof workItemId === "string" && workItemId.trim().length > 0) {
    const normalizedWorkItemId = workItemId.trim();
    const runtimePath = resolveRuntimePath({
      rootDir,
      workItemId: normalizedWorkItemId,
    });
    if (!existsSync(runtimePath)) {
      return [
        createTickResult({
          workItemId: normalizedWorkItemId,
          action: "noop",
          reason: "missing_runtime",
        }),
      ];
    }

    const { state } = readRuntimeState({
      rootDir,
      workItemId: normalizedWorkItemId,
    });

    if (state.lock?.owner) {
      return [
        createTickResult({
          workItemId: normalizedWorkItemId,
          slice: state.slice,
          action: "skip_locked",
          reason: `locked_by=${state.lock.owner}`,
          wait: state.wait,
          runtime: state,
        }),
      ];
    }

    const resumable = isResumableState(state);
    if (!resumable.resumable) {
      return [
        createTickResult({
          workItemId: normalizedWorkItemId,
          slice: state.slice,
          action: "noop",
          reason: resumable.reason,
          wait: state.wait ?? null,
          runtime: state,
        }),
      ];
    }

    const supervise = dependencies.supervise ?? superviseWorkItem;
    return [
      supervise({
        rootDir,
        workItemId: normalizedWorkItemId,
        now,
        ...options,
      }),
    ];
  }

  if (!all) {
    throw new Error("tick requires --all or --work-item.");
  }

  const supervise = dependencies.supervise ?? superviseWorkItem;

  return listRuntimeStates(rootDir)
    .flatMap(({ state }) => {
      if (state.lock?.owner) {
        return [
          createTickResult({
            workItemId: state.work_item_id,
            slice: state.slice,
            action: "skip_locked",
            reason: `locked_by=${state.lock.owner}`,
            wait: state.wait,
            runtime: state,
          }),
        ];
      }

      const resumable = isResumableState(state);
      if (!resumable.resumable) {
        if (resumable.reason === "no_wait_state" || resumable.reason?.startsWith("unsupported_wait_kind=")) {
          return [];
        }
        return [
          createTickResult({
            workItemId: state.work_item_id,
            slice: state.slice,
            action: "noop",
            reason: resumable.reason,
            wait: state.wait ?? null,
            runtime: state,
          }),
        ];
      }

      return [
        supervise({
          rootDir,
          workItemId: state.work_item_id,
          now,
          ...options,
        }),
      ];
    })
    .filter(Boolean);
}
