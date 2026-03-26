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
  return {
    session_id:
      entry && typeof entry.session_id === "string" && entry.session_id.trim().length > 0
        ? entry.session_id.trim()
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
  agent,
  updatedAt,
}) {
  const normalizedRole = ensureNonEmptyString(role, "role");

  return {
    ...state,
    sessions: {
      ...state.sessions,
      [normalizedRole]: {
        session_id: ensureNonEmptyString(sessionId, "sessionId"),
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
  };
}

export function markSessionUnavailable({
  state,
  stage,
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
      reason: "session_unavailable",
      attempt_count: ensureInteger(attemptCount, "attemptCount"),
      max_attempts: ensureInteger(maxAttempts, "maxAttempts"),
    },
    last_artifact_dir: artifactDir ?? state.last_artifact_dir,
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
