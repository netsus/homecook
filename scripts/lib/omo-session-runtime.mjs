import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const DEFAULT_RETRY_DELAY_HOURS = 5;
export const DEFAULT_MAX_RETRY_ATTEMPTS = 3;
export const OMO_SESSION_ROLE_TO_AGENT = {
  claude_primary: "athena",
  codex_primary: "hephaestus",
};

function ensureNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function ensureInteger(value, label) {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer.`);
  }

  return value;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function toIsoString(value) {
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date().toISOString();
}

function normalizeSessionEntry(role, entry) {
  const sessionId =
    entry && typeof entry.session_id === "string" && entry.session_id.trim().length > 0
      ? entry.session_id.trim()
      : null;

  return {
    session_id: sessionId,
    provider:
      entry && typeof entry.provider === "string" && entry.provider.trim().length > 0
        ? entry.provider.trim()
        : sessionId
          ? "opencode"
          : null,
    agent:
      entry && typeof entry.agent === "string" && entry.agent.trim().length > 0
        ? entry.agent.trim()
        : OMO_SESSION_ROLE_TO_AGENT[role],
    updated_at:
      entry && typeof entry.updated_at === "string" && entry.updated_at.trim().length > 0
        ? entry.updated_at.trim()
        : null,
  };
}

function normalizeRetry(retry) {
  if (!retry || typeof retry !== "object") {
    return null;
  }

  const attemptCount =
    Number.isInteger(retry.attempt_count) && retry.attempt_count >= 0
      ? retry.attempt_count
      : 0;
  const maxAttempts =
    Number.isInteger(retry.max_attempts) && retry.max_attempts >= 1
      ? retry.max_attempts
      : DEFAULT_MAX_RETRY_ATTEMPTS;

  return {
    at:
      typeof retry.at === "string" && retry.at.trim().length > 0 ? retry.at.trim() : null,
    reason:
      typeof retry.reason === "string" && retry.reason.trim().length > 0
        ? retry.reason.trim()
        : null,
    attempt_count: attemptCount,
    max_attempts: maxAttempts,
  };
}

function normalizeLock(lock) {
  if (!lock || typeof lock !== "object") {
    return null;
  }

  const owner =
    typeof lock.owner === "string" && lock.owner.trim().length > 0 ? lock.owner.trim() : null;
  if (!owner) {
    return null;
  }

  return {
    owner,
    acquired_at:
      typeof lock.acquired_at === "string" && lock.acquired_at.trim().length > 0
        ? lock.acquired_at.trim()
        : null,
  };
}

function normalizeWorkspace(workspace) {
  if (!workspace || typeof workspace !== "object") {
    return {
      path: null,
      branch_role: null,
      updated_at: null,
    };
  }

  return {
    path:
      typeof workspace.path === "string" && workspace.path.trim().length > 0
        ? workspace.path.trim()
        : null,
    branch_role:
      typeof workspace.branch_role === "string" && workspace.branch_role.trim().length > 0
        ? workspace.branch_role.trim()
        : null,
    updated_at:
      typeof workspace.updated_at === "string" && workspace.updated_at.trim().length > 0
        ? workspace.updated_at.trim()
        : null,
  };
}

function normalizePullRequestEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  return {
    number: Number.isInteger(entry.number) ? entry.number : null,
    url:
      typeof entry.url === "string" && entry.url.trim().length > 0
        ? entry.url.trim()
        : null,
    draft: typeof entry.draft === "boolean" ? entry.draft : null,
    branch:
      typeof entry.branch === "string" && entry.branch.trim().length > 0
        ? entry.branch.trim()
        : null,
    head_sha:
      typeof entry.head_sha === "string" && entry.head_sha.trim().length > 0
        ? entry.head_sha.trim()
        : null,
    updated_at:
      typeof entry.updated_at === "string" && entry.updated_at.trim().length > 0
        ? entry.updated_at.trim()
        : null,
  };
}

function normalizePullRequests(prs) {
  if (!prs || typeof prs !== "object") {
    return {
      docs: null,
      backend: null,
      frontend: null,
    };
  }

  return {
    docs: normalizePullRequestEntry(prs.docs),
    backend: normalizePullRequestEntry(prs.backend),
    frontend: normalizePullRequestEntry(prs.frontend),
  };
}

function normalizeWait(wait) {
  if (!wait || typeof wait !== "object") {
    return null;
  }

  const kind =
    typeof wait.kind === "string" && wait.kind.trim().length > 0 ? wait.kind.trim() : null;
  if (!kind) {
    return null;
  }

  return {
    kind,
    pr_role:
      typeof wait.pr_role === "string" && wait.pr_role.trim().length > 0
        ? wait.pr_role.trim()
        : null,
    stage: Number.isInteger(wait.stage) ? wait.stage : null,
    head_sha:
      typeof wait.head_sha === "string" && wait.head_sha.trim().length > 0
        ? wait.head_sha.trim()
        : null,
    reason:
      typeof wait.reason === "string" && wait.reason.trim().length > 0
        ? wait.reason.trim()
        : null,
    until:
      typeof wait.until === "string" && wait.until.trim().length > 0
        ? wait.until.trim()
        : null,
    updated_at:
      typeof wait.updated_at === "string" && wait.updated_at.trim().length > 0
        ? wait.updated_at.trim()
        : null,
  };
}

function normalizeReviewEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  return {
    decision:
      typeof entry.decision === "string" && entry.decision.trim().length > 0
        ? entry.decision.trim()
        : null,
    route_back_stage: Number.isInteger(entry.route_back_stage) ? entry.route_back_stage : null,
    approved_head_sha:
      typeof entry.approved_head_sha === "string" && entry.approved_head_sha.trim().length > 0
        ? entry.approved_head_sha.trim()
        : null,
    updated_at:
      typeof entry.updated_at === "string" && entry.updated_at.trim().length > 0
        ? entry.updated_at.trim()
        : null,
  };
}

function normalizeLastReview(lastReview) {
  if (!lastReview || typeof lastReview !== "object") {
    return {
      backend: null,
      frontend: null,
    };
  }

  return {
    backend: normalizeReviewEntry(lastReview.backend),
    frontend: normalizeReviewEntry(lastReview.frontend),
  };
}

function normalizeRecoveryExistingPr(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  return {
    role:
      typeof entry.role === "string" && entry.role.trim().length > 0 ? entry.role.trim() : null,
    number: Number.isInteger(entry.number) ? entry.number : null,
    url:
      typeof entry.url === "string" && entry.url.trim().length > 0
        ? entry.url.trim()
        : null,
    draft: typeof entry.draft === "boolean" ? entry.draft : null,
    branch:
      typeof entry.branch === "string" && entry.branch.trim().length > 0
        ? entry.branch.trim()
        : null,
    head_sha:
      typeof entry.head_sha === "string" && entry.head_sha.trim().length > 0
        ? entry.head_sha.trim()
        : null,
  };
}

function normalizeRecovery(recovery) {
  if (!recovery || typeof recovery !== "object") {
    return null;
  }

  const kind =
    typeof recovery.kind === "string" && recovery.kind.trim().length > 0
      ? recovery.kind.trim()
      : null;
  if (!kind) {
    return null;
  }

  return {
    kind,
    stage: Number.isInteger(recovery.stage) ? recovery.stage : null,
    branch:
      typeof recovery.branch === "string" && recovery.branch.trim().length > 0
        ? recovery.branch.trim()
        : null,
    reason:
      typeof recovery.reason === "string" && recovery.reason.trim().length > 0
        ? recovery.reason.trim()
        : null,
    artifact_dir:
      typeof recovery.artifact_dir === "string" && recovery.artifact_dir.trim().length > 0
        ? recovery.artifact_dir.trim()
        : null,
    changed_files: Array.isArray(recovery.changed_files)
      ? recovery.changed_files
          .filter((entry) => typeof entry === "string" && entry.trim().length > 0)
          .map((entry) => entry.trim())
      : [],
    existing_pr: normalizeRecoveryExistingPr(recovery.existing_pr),
    salvage_candidate: typeof recovery.salvage_candidate === "boolean" ? recovery.salvage_candidate : false,
    session_role:
      typeof recovery.session_role === "string" && recovery.session_role.trim().length > 0
        ? recovery.session_role.trim()
        : null,
    session_provider:
      typeof recovery.session_provider === "string" && recovery.session_provider.trim().length > 0
        ? recovery.session_provider.trim()
        : null,
    session_id:
      typeof recovery.session_id === "string" && recovery.session_id.trim().length > 0
        ? recovery.session_id.trim()
        : null,
    updated_at:
      typeof recovery.updated_at === "string" && recovery.updated_at.trim().length > 0
        ? recovery.updated_at.trim()
        : null,
  };
}

function baseRuntimeState({ rootDir, workItemId, slice }) {
  return {
    version: 1,
    work_item_id: workItemId,
    slice: slice ?? null,
    repo_root: resolve(rootDir),
    current_stage: null,
    last_completed_stage: 0,
    blocked_stage: null,
    sessions: {
      claude_primary: normalizeSessionEntry("claude_primary", null),
      codex_primary: normalizeSessionEntry("codex_primary", null),
    },
    retry: null,
    last_artifact_dir: null,
    lock: null,
    workspace: normalizeWorkspace(null),
    prs: normalizePullRequests(null),
    wait: null,
    last_review: normalizeLastReview(null),
    recovery: null,
  };
}

function normalizeRuntimeState(rawState, { rootDir, workItemId, slice }) {
  const base = baseRuntimeState({ rootDir, workItemId, slice });
  const runtime = rawState && typeof rawState === "object" ? rawState : {};
  const currentStage =
    Number.isInteger(runtime.current_stage) && runtime.current_stage >= 1 && runtime.current_stage <= 6
      ? runtime.current_stage
      : base.current_stage;
  const lastCompletedStage =
    Number.isInteger(runtime.last_completed_stage) &&
    runtime.last_completed_stage >= 0 &&
    runtime.last_completed_stage <= 6
      ? runtime.last_completed_stage
      : base.last_completed_stage;
  const blockedStage =
    Number.isInteger(runtime.blocked_stage) && runtime.blocked_stage >= 1 && runtime.blocked_stage <= 6
      ? runtime.blocked_stage
      : null;

  return {
    ...base,
    version: Number.isInteger(runtime.version) ? runtime.version : base.version,
    slice:
      typeof runtime.slice === "string" && runtime.slice.trim().length > 0
        ? runtime.slice.trim()
        : base.slice,
    current_stage: currentStage,
    last_completed_stage: lastCompletedStage,
    blocked_stage: blockedStage,
    sessions: {
      claude_primary: normalizeSessionEntry(
        "claude_primary",
        runtime.sessions?.claude_primary,
      ),
      codex_primary: normalizeSessionEntry(
        "codex_primary",
        runtime.sessions?.codex_primary,
      ),
    },
    retry: normalizeRetry(runtime.retry),
    last_artifact_dir:
      typeof runtime.last_artifact_dir === "string" && runtime.last_artifact_dir.trim().length > 0
        ? runtime.last_artifact_dir.trim()
        : null,
    lock: normalizeLock(runtime.lock),
    workspace: normalizeWorkspace(runtime.workspace),
    prs: normalizePullRequests(runtime.prs),
    wait: normalizeWait(runtime.wait),
    last_review: normalizeLastReview(runtime.last_review),
    recovery: normalizeRecovery(runtime.recovery),
  };
}

export function resolveRuntimeDirectory(rootDir = process.cwd()) {
  return resolve(rootDir, ".opencode", "omo-runtime");
}

export function resolveRuntimePath({ rootDir = process.cwd(), workItemId }) {
  const normalizedWorkItemId = ensureNonEmptyString(workItemId, "workItemId");
  return resolve(resolveRuntimeDirectory(rootDir), `${normalizedWorkItemId}.json`);
}

export function readRuntimeState({
  rootDir = process.cwd(),
  workItemId,
  slice,
}) {
  const runtimePath = resolveRuntimePath({
    rootDir,
    workItemId,
  });

  if (!existsSync(runtimePath)) {
    return {
      runtimePath,
      state: baseRuntimeState({
        rootDir,
        workItemId: ensureNonEmptyString(workItemId, "workItemId"),
        slice,
      }),
    };
  }

  return {
    runtimePath,
    state: normalizeRuntimeState(readJson(runtimePath), {
      rootDir,
      workItemId: ensureNonEmptyString(workItemId, "workItemId"),
      slice,
    }),
  };
}

export function writeRuntimeState({
  rootDir = process.cwd(),
  workItemId,
  state,
}) {
  const normalizedWorkItemId = ensureNonEmptyString(workItemId, "workItemId");
  const runtimeDir = resolveRuntimeDirectory(rootDir);
  const runtimePath = resolveRuntimePath({
    rootDir,
    workItemId: normalizedWorkItemId,
  });

  mkdirSync(runtimeDir, { recursive: true });
  writeFileSync(runtimePath, `${JSON.stringify(state, null, 2)}\n`);

  return {
    runtimePath,
    state,
  };
}

export function resolveRetryAt({
  now,
  delayHours = DEFAULT_RETRY_DELAY_HOURS,
}) {
  const base = new Date(
    typeof now === "string" && now.trim().length > 0 ? now : new Date().toISOString(),
  );
  if (Number.isNaN(base.getTime())) {
    throw new Error("now must be a valid ISO timestamp when provided.");
  }

  return new Date(base.getTime() + delayHours * 60 * 60 * 1000).toISOString();
}

export function setSessionBinding({
  state,
  role,
  sessionId,
  provider,
  agent,
  updatedAt,
}) {
  const normalizedRole = ensureNonEmptyString(role, "role");
  const normalizedProvider = ensureNonEmptyString(provider, "provider");

  return {
    ...state,
    sessions: {
      ...state.sessions,
      [normalizedRole]: {
        session_id: ensureNonEmptyString(sessionId, "sessionId"),
        provider: normalizedProvider,
        agent:
          typeof agent === "string" && agent.trim().length > 0
            ? agent.trim()
            : OMO_SESSION_ROLE_TO_AGENT[normalizedRole] ?? null,
        updated_at: toIsoString(updatedAt),
      },
    },
  };
}

export function markStageCompleted({
  state,
  stage,
  artifactDir,
}) {
  const normalizedStage = ensureInteger(Number(stage), "stage");

  return {
    ...state,
    current_stage: normalizedStage,
    last_completed_stage: normalizedStage,
    blocked_stage: null,
    retry: null,
    last_artifact_dir: artifactDir ?? state.last_artifact_dir,
    recovery: null,
  };
}

export function scheduleStageRetry({
  state,
  stage,
  retryAt,
  reason,
  attemptCount,
  maxAttempts = DEFAULT_MAX_RETRY_ATTEMPTS,
  artifactDir,
}) {
  return {
    ...state,
    current_stage: ensureInteger(Number(stage), "stage"),
    blocked_stage: ensureInteger(Number(stage), "stage"),
    retry: {
      at: retryAt,
      reason: ensureNonEmptyString(reason, "reason"),
      attempt_count: ensureInteger(attemptCount, "attemptCount"),
      max_attempts: ensureInteger(maxAttempts, "maxAttempts"),
    },
    last_artifact_dir: artifactDir ?? state.last_artifact_dir,
    recovery: null,
  };
}

export function markSessionUnavailable({
  state,
  stage,
  reason = "session_unavailable",
  attemptCount,
  maxAttempts = DEFAULT_MAX_RETRY_ATTEMPTS,
  artifactDir,
}) {
  return {
    ...state,
    current_stage: ensureInteger(Number(stage), "stage"),
    blocked_stage: ensureInteger(Number(stage), "stage"),
    retry: {
      at: null,
      reason: ensureNonEmptyString(reason, "reason"),
      attempt_count: ensureInteger(attemptCount, "attemptCount"),
      max_attempts: ensureInteger(maxAttempts, "maxAttempts"),
    },
    last_artifact_dir: artifactDir ?? state.last_artifact_dir,
    recovery: null,
  };
}

export function setWorkspaceBinding({
  state,
  path,
  branchRole,
  updatedAt,
}) {
  return {
    ...state,
    workspace: {
      path: typeof path === "string" && path.trim().length > 0 ? path.trim() : null,
      branch_role:
        typeof branchRole === "string" && branchRole.trim().length > 0
          ? branchRole.trim()
          : null,
      updated_at: toIsoString(updatedAt),
    },
  };
}

export function setPullRequestRef({
  state,
  role,
  number,
  url,
  draft,
  branch,
  headSha,
  updatedAt,
}) {
  const normalizedRole = ensureNonEmptyString(role, "role");

  return {
    ...state,
    prs: {
      ...state.prs,
      [normalizedRole]: {
        number: Number.isInteger(number) ? number : null,
        url: typeof url === "string" && url.trim().length > 0 ? url.trim() : null,
        draft: typeof draft === "boolean" ? draft : null,
        branch:
          typeof branch === "string" && branch.trim().length > 0 ? branch.trim() : null,
        head_sha:
          typeof headSha === "string" && headSha.trim().length > 0 ? headSha.trim() : null,
        updated_at: toIsoString(updatedAt),
      },
    },
  };
}

export function setWaitState({
  state,
  kind,
  prRole,
  stage,
  headSha,
  reason,
  until,
  updatedAt,
}) {
  if (!kind) {
    return {
      ...state,
      wait: null,
    };
  }

  return {
    ...state,
    wait: {
      kind: ensureNonEmptyString(kind, "kind"),
      pr_role:
        typeof prRole === "string" && prRole.trim().length > 0 ? prRole.trim() : null,
      stage: Number.isInteger(Number(stage)) ? Number(stage) : null,
      head_sha:
        typeof headSha === "string" && headSha.trim().length > 0 ? headSha.trim() : null,
      reason:
        typeof reason === "string" && reason.trim().length > 0 ? reason.trim() : null,
      until:
        typeof until === "string" && until.trim().length > 0 ? until.trim() : null,
      updated_at: toIsoString(updatedAt),
    },
  };
}

export function setLastReview({
  state,
  role,
  decision,
  routeBackStage,
  approvedHeadSha,
  updatedAt,
}) {
  const normalizedRole = ensureNonEmptyString(role, "role");

  return {
    ...state,
    last_review: {
      ...state.last_review,
      [normalizedRole]: {
        decision:
          typeof decision === "string" && decision.trim().length > 0
            ? decision.trim()
            : null,
        route_back_stage: Number.isInteger(Number(routeBackStage))
          ? Number(routeBackStage)
          : null,
        approved_head_sha:
          typeof approvedHeadSha === "string" && approvedHeadSha.trim().length > 0
            ? approvedHeadSha.trim()
            : null,
        updated_at: toIsoString(updatedAt),
      },
    },
  };
}

export function setRecoveryState({
  state,
  recovery,
}) {
  if (!recovery) {
    return {
      ...state,
      recovery: null,
    };
  }

  return {
    ...state,
    recovery: normalizeRecovery(recovery),
  };
}

export function acquireRuntimeLock({
  rootDir = process.cwd(),
  workItemId,
  owner,
  now,
  slice,
}) {
  const normalizedOwner = ensureNonEmptyString(owner, "owner");
  const { runtimePath, state } = readRuntimeState({
    rootDir,
    workItemId,
    slice,
  });

  if (state.lock?.owner && state.lock.owner !== normalizedOwner) {
    throw new Error(
      `Runtime state for ${workItemId} is locked by ${state.lock.owner}.`,
    );
  }

  const nextState = {
    ...state,
    lock: {
      owner: normalizedOwner,
      acquired_at: toIsoString(now),
    },
  };

  writeRuntimeState({
    rootDir,
    workItemId,
    state: nextState,
  });

  return {
    runtimePath,
    state: nextState,
  };
}

export function releaseRuntimeLock({
  rootDir = process.cwd(),
  workItemId,
  owner,
  slice,
}) {
  const normalizedOwner = ensureNonEmptyString(owner, "owner");
  const { runtimePath, state } = readRuntimeState({
    rootDir,
    workItemId,
    slice,
  });

  if (!state.lock) {
    return {
      runtimePath,
      state,
    };
  }

  if (state.lock.owner !== normalizedOwner) {
    throw new Error(
      `Runtime state for ${workItemId} is locked by ${state.lock.owner}, not ${normalizedOwner}.`,
    );
  }

  const nextState = {
    ...state,
    lock: null,
  };

  writeRuntimeState({
    rootDir,
    workItemId,
    state: nextState,
  });

  return {
    runtimePath,
    state: nextState,
  };
}

export function withRuntimeLock(
  {
    rootDir = process.cwd(),
    workItemId,
    owner,
    now,
    slice,
  },
  callback,
) {
  acquireRuntimeLock({
    rootDir,
    workItemId,
    owner,
    now,
    slice,
  });

  try {
    return callback();
  } finally {
    releaseRuntimeLock({
      rootDir,
      workItemId,
      owner,
      slice,
    });
  }
}

export function listRuntimeStates(rootDir = process.cwd()) {
  const runtimeDir = resolveRuntimeDirectory(rootDir);
  if (!existsSync(runtimeDir)) {
    return [];
  }

  return readdirSync(runtimeDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const runtimePath = resolve(runtimeDir, name);
      const state = normalizeRuntimeState(readJson(runtimePath), {
        rootDir,
        workItemId: name.replace(/\.json$/, ""),
      });

      return {
        runtimePath,
        state,
      };
    });
}

export function isRetryDue(retry, now) {
  if (!retry || !retry.at) {
    return false;
  }

  const retryAt = new Date(retry.at);
  const reference = new Date(
    typeof now === "string" && now.trim().length > 0 ? now : new Date().toISOString(),
  );

  if (Number.isNaN(retryAt.getTime()) || Number.isNaN(reference.getTime())) {
    return false;
  }

  return retryAt.getTime() <= reference.getTime();
}

export function listDueRuntimeStates({
  rootDir = process.cwd(),
  now,
}) {
  return listRuntimeStates(rootDir).filter(
    ({ state }) => Number.isInteger(state.blocked_stage) && isRetryDue(state.retry, now),
  );
}
