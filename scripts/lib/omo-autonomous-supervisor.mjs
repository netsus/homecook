import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { runStageWithArtifacts } from "./omo-lite-runner.mjs";
import { syncWorkflowV2Status } from "./omo-lite-supervisor.mjs";
import { createGithubAutomationClient } from "./omo-github.mjs";
import {
  acquireRuntimeLock,
  listRuntimeStates,
  markStageCompleted,
  readRuntimeState,
  releaseRuntimeLock,
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
  getWorktreeHeadSha,
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
}) {
  const artifactDir = resolveSupervisorArtifactDir({
    rootDir,
    workItemId,
    now,
  });
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(resolve(artifactDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
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
  now,
}) {
  const nextState = saveRuntime({
    rootDir,
    workItemId,
    state: setWaitState({
      state,
      kind: "human_escalation",
      reason,
      updatedAt: now,
    }),
  });
  syncStatus({
    rootDir,
    workItemId,
    patch: {
      lifecycle: "blocked",
      approval_state: "human_escalation",
      verification_status: "pending",
      notes: `wait_kind=human_escalation reason=${reason}`,
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

function handleDeferredStageExecution({
  rootDir,
  workItemId,
  slice,
  stage,
  prRole,
  prPath,
  headSha,
  runResult,
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

  if (runResult.execution?.mode === "scheduled-retry") {
    const nextState = saveRuntime({
      rootDir,
      workItemId,
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

  const nextState = saveRuntime({
    rootDir,
    workItemId,
    state: setWaitState({
      state: runtimeState,
      kind: "human_escalation",
      prRole,
      stage,
      headSha,
      reason: runResult.execution?.reason ?? "stage execution could not continue",
      updatedAt: now,
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
    extraNotes: [`artifact_dir=${runResult.artifactDir}`],
  });
  return {
    state: nextState,
    wait: nextState.wait,
    transitioned: false,
  };
}

function determineInitialStage(state) {
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
  if (!state.wait?.kind) {
    return {
      state,
      action: "run-stage",
      nextStage: determineInitialStage(state),
    };
  }

  if (state.wait.kind === "human_escalation") {
    return {
      state,
      action: "stop",
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

function ensureStageRecorded({ rootDir, workItemId, state, stage, artifactDir }) {
  if (state.last_completed_stage >= stage) {
    return state;
  }

  return saveRuntime({
    rootDir,
    workItemId,
    state: markStageCompleted({
      state,
      stage,
      artifactDir,
    }),
  });
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
    startPoint: "master",
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
    now,
  });
  if (deferredOutcome) {
    return deferredOutcome;
  }
  const stageResult = validateStageResult(stage, runResult.stageResult);
  worktree.assertClean();

  nextState = ensureStageRecorded({
    rootDir,
    workItemId,
    state: nextState,
    stage,
    artifactDir: runResult.artifactDir,
  });

  const headSha = worktree.getHeadSha();

  worktree.pushBranch({
    branch: branchName,
  });

  const pr =
    existingPr?.url
      ? {
          number: existingPr.number,
          url: existingPr.url,
          draft: existingPr.draft ?? (prRole !== "docs"),
        }
      : github.createPullRequest({
          base: "master",
          head: branchName,
          title: stageResult.pr.title,
          body: stageResult.pr.body_markdown,
          draft: prRole !== "docs",
          workItemId,
        });

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

  if (prRole === "docs") {
    const checks = github.getRequiredChecks({
      prRef: pr.url,
    });

    if (checks.bucket === "fail") {
      throw new Error("Required checks failed.");
    }

    if (checks.bucket === "pending") {
      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setWaitState({
          state: nextState,
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
        state: nextState,
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

  const checks = github.getRequiredChecks({
    prRef: pr.url,
  });

  if (checks.bucket === "fail") {
    throw new Error("Required checks failed.");
  }

  if (checks.bucket === "pending") {
    nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setWaitState({
        state: nextState,
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
      state: nextState,
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
  const activePr = getActivePullRequest(state, prRole);
  if (!activePr?.url) {
    throw new Error(`No active ${prRole} pull request found.`);
  }

  worktree.checkoutBranch({
    branch: activePr.branch ?? resolveBranchName({ slice: state.slice ?? workItemId, stage }),
    startPoint: "master",
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
    now,
  });
  if (deferredOutcome) {
    return deferredOutcome;
  }
  const stageResult = validateStageResult(stage, runResult.stageResult);
  nextState = ensureStageRecorded({
    rootDir,
    workItemId,
    state: nextState,
    stage,
    artifactDir: runResult.artifactDir,
  });

  const reviewRole = prRole === "backend" ? "backend" : "frontend";
  nextState = saveRuntime({
    rootDir,
    workItemId,
    state: setLastReview({
      state: nextState,
      role: reviewRole,
      decision: stageResult.decision,
      routeBackStage: stageResult.route_back_stage,
      approvedHeadSha: stageResult.approved_head_sha,
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
      } else {
        throw error;
      }
    }
  }

  if (stageResult.decision === "approve") {
    if (stage === 5) {
      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setWaitState({
          state: nextState,
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
            state: nextState,
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

    if (stage === 3) {
      worktree.syncBaseBranch();
      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setWaitState({
          state: nextState,
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
      });
      return {
        state: nextState,
        wait: nextState.wait,
        transitioned: true,
      };
    }

    nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setWaitState({
        state: nextState,
        kind: null,
        updatedAt: now,
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
        notes: "wait_kind=none merged=true",
      },
      now,
    });
    return {
      state: nextState,
      wait: null,
      transitioned: false,
      merged: true,
    };
  }

  const routeBackStage = stageResult.route_back_stage ?? defaultBackRoute(stage);
  nextState = saveRuntime({
    rootDir,
    workItemId,
    state: setWaitState({
      state: nextState,
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

  return {
    auth: {
      assertGhAuth() {
        github.assertAuth();
      },
      assertOpencodeAuth() {},
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
      dependencies.auth?.assertOpencodeAuth?.();
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
        },
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
      try {
        dependencies.worktree.assertClean({
          worktreePath: state.workspace.path,
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
          },
        });

        return {
          ...blocked,
          artifactDir,
          transitions,
        };
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
          },
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
          },
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
          },
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
          },
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
      },
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
  if (typeof workItemId === "string" && workItemId.trim().length > 0) {
    const supervise = dependencies.supervise ?? superviseWorkItem;
    return [
      supervise({
        rootDir,
        workItemId: workItemId.trim(),
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
    .filter(({ state }) => {
      const kind = state.wait?.kind;
      if (!kind) {
        return false;
      }

      if (!["ci", "merge", "blocked_retry", "ready_for_next_stage"].includes(kind)) {
        return false;
      }

      if (kind === "blocked_retry") {
        return isRetryDue(state.retry, now);
      }

      return true;
    })
    .map(({ state }) =>
      supervise({
        rootDir,
        workItemId: state.work_item_id,
        now,
        ...options,
      }),
    );
}
