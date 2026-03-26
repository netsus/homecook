import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { resolveClaudeBudgetState } from "./omo-lite-claude-budget.mjs";
import {
  buildStageDispatch,
  resolveStageSessionRole,
  syncWorkflowV2Status,
} from "./omo-lite-supervisor.mjs";
import {
  readStageResult,
  resolveStageResultPath,
} from "./omo-stage-result.mjs";
import {
  DEFAULT_MAX_RETRY_ATTEMPTS,
  DEFAULT_RETRY_DELAY_HOURS,
  OMO_SESSION_ROLE_TO_AGENT,
  markSessionUnavailable,
  markStageCompleted,
  readRuntimeState,
  resolveRetryAt,
  resolveRuntimePath,
  scheduleStageRetry,
  setSessionBinding,
  writeRuntimeState,
} from "./omo-session-runtime.mjs";

function ensureNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function formatTimestampSlug(value) {
  const source = typeof value === "string" && value.trim().length > 0 ? value : new Date().toISOString();

  return source.replace(/[:.]/g, "-");
}

function defaultArtifactDir(rootDir, slice, stage, now) {
  return resolve(
    rootDir,
    ".artifacts",
    "omo-lite-dispatch",
    `${formatTimestampSlug(now)}-${slice}-stage-${stage}`,
  );
}

function resolveDefaultOpencodeBin(environment) {
  const fromEnvironment =
    environment?.OPENCODE_BIN ??
    process.env.OPENCODE_BIN ??
    (process.env.HOME ? resolve(process.env.HOME, ".opencode", "bin", "opencode") : null);

  if (typeof fromEnvironment === "string" && fromEnvironment.trim().length > 0) {
    if (fromEnvironment.includes("/") && existsSync(fromEnvironment)) {
      return fromEnvironment;
    }

    if (!fromEnvironment.includes("/")) {
      return fromEnvironment;
    }
  }

  return "opencode";
}

function resolveExecutionBinding(dispatch, { agent }) {
  if (dispatch.actor === "human") {
    return {
      executable: false,
      agent: null,
      reason: "actor requires human escalation",
    };
  }

  const fallbackAgent = OMO_SESSION_ROLE_TO_AGENT[dispatch.sessionBinding.role];

  return {
    executable: true,
    agent: agent ?? fallbackAgent,
    reason: null,
  };
}

function buildPrompt({ slice, stage, workItemId, dispatch, stageResultPath }) {
  return [
    "# Homecook OMO-lite Stage Dispatch",
    "",
    `- slice: \`${slice}\``,
    `- stage: \`${stage}\``,
    `- actor: \`${dispatch.actor}\``,
    workItemId ? `- workflow v2 work item: \`${workItemId}\`` : null,
    `- session role: \`${dispatch.sessionBinding.role}\``,
    `- resume mode: \`${dispatch.sessionBinding.resumeMode}\``,
    dispatch.sessionBinding.sessionId
      ? `- session id: \`${dispatch.sessionBinding.sessionId}\``
      : "- session id: `missing`",
    "",
    `## Goal`,
    dispatch.goal,
    "",
    `## Required Reads`,
    ...dispatch.requiredReads.map((entry) => `- ${entry}`),
    "",
    `## Deliverables`,
    ...dispatch.deliverables.map((entry) => `- ${entry}`),
    "",
    `## Verify Commands`,
    ...(dispatch.verifyCommands.length > 0
      ? dispatch.verifyCommands.map((entry) => `- ${entry}`)
      : ["- none"]),
    "",
    "## Status Patch",
    "```json",
    JSON.stringify(dispatch.statusPatch, null, 2),
    "```",
    "",
    "## Runtime Patch",
    "```json",
    JSON.stringify(dispatch.runtimePatch, null, 2),
    "```",
    "",
    "## Retry Decision",
    "```json",
    JSON.stringify(dispatch.retryDecision, null, 2),
    "```",
    "",
    "## Success Condition",
    dispatch.successCondition,
    "",
    "## Escalation If Blocked",
    dispatch.escalationIfBlocked,
    "",
    "## Guardrails",
    "- Follow AGENTS.md and official docs before implementation.",
    "- Do not invent undocumented API fields, status values, or endpoints.",
    "- Keep branch, verification, and review behavior aligned with slice workflow and workflow-v2 rules.",
    "",
    "## Stage Result Output",
    `- Write a JSON file to \`${stageResultPath}\` before finishing the task.`,
    "- The JSON must follow the stage result contract locked in workflow-v2 docs.",
  ]
    .filter(Boolean)
    .join("\n");
}

function writeArtifacts({ artifactDir, dispatch, prompt, metadata }) {
  mkdirSync(artifactDir, { recursive: true });

  writeFileSync(resolve(artifactDir, "dispatch.json"), `${JSON.stringify(dispatch, null, 2)}\n`);
  writeFileSync(resolve(artifactDir, "prompt.md"), `${prompt}\n`);
  if (metadata) {
    writeFileSync(resolve(artifactDir, "run-metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  }
}

function parseSessionId(stdout, fallbackSessionId) {
  const lines = typeof stdout === "string" ? stdout.split(/\r?\n/) : [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || !trimmed.startsWith("{")) {
      continue;
    }

    try {
      const event = JSON.parse(trimmed);
      if (typeof event.sessionID === "string" && event.sessionID.trim().length > 0) {
        return event.sessionID.trim();
      }
    } catch {
      continue;
    }
  }

  return fallbackSessionId ?? null;
}

function parseErrorEvent(stdout) {
  const lines = typeof stdout === "string" ? stdout.split(/\r?\n/) : [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || !trimmed.startsWith("{")) {
      continue;
    }

    try {
      const event = JSON.parse(trimmed);
      if (event?.type === "error" && event.error && typeof event.error === "object") {
        return event;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function createProcessFailure(message, details) {
  const error = new Error(message);
  Object.assign(error, details);
  return error;
}

function isClaudeBudgetRuntimeFailure(error) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const fragments = [];

  if (typeof error.message === "string") {
    fragments.push(error.message);
  }

  if (typeof error.stderrPath === "string" && existsSync(error.stderrPath)) {
    fragments.push(readFileSync(error.stderrPath, "utf8"));
  }

  if (typeof error.stdoutPath === "string" && existsSync(error.stdoutPath)) {
    fragments.push(readFileSync(error.stdoutPath, "utf8"));
  }

  if (error.errorEvent?.error?.data?.message) {
    fragments.push(String(error.errorEvent.error.data.message));
  }

  if (error.errorEvent?.error?.data?.responseBody) {
    fragments.push(String(error.errorEvent.error.data.responseBody));
  }

  const haystack = fragments.join("\n");

  return /(credit balance is too low|insufficient credits|quota|billing|budget exhausted|rate limit)/i.test(
    haystack,
  );
}

function runOpencode({
  executionDir,
  artifactDir,
  prompt,
  agent,
  sessionId,
  opencodeBin,
  environment,
  stageResultPath,
}) {
  const commandArgs = ["run", "--dir", executionDir, "--format", "json"];

  if (sessionId) {
    commandArgs.push("--session", sessionId);
  } else {
    commandArgs.push("--agent", agent);
  }

  commandArgs.push(prompt);

  const result = spawnSync(opencodeBin, commandArgs, {
    cwd: executionDir,
    env: {
      ...process.env,
      ...(environment ?? {}),
      OMO_STAGE_RESULT_PATH: stageResultPath,
      OMO_STAGE_ARTIFACT_DIR: artifactDir,
    },
    encoding: "utf8",
  });

  const stdoutPath = resolve(artifactDir, "opencode.stdout.log");
  const stderrPath = resolve(artifactDir, "opencode.stderr.log");

  writeFileSync(stdoutPath, result.stdout ?? "");
  writeFileSync(stderrPath, result.stderr ?? "");

  if (result.error) {
    throw createProcessFailure(result.error.message, {
      cause: result.error,
      exitCode: result.status ?? null,
      stdoutPath,
      stderrPath,
      sessionId: parseSessionId(result.stdout, sessionId),
    });
  }

  const capturedSessionId = parseSessionId(result.stdout, sessionId);
  const errorEvent = parseErrorEvent(result.stdout);

  if (result.status !== 0) {
    throw createProcessFailure(
      `opencode run failed with exit code ${result.status}. See ${stderrPath}`,
      {
        exitCode: result.status ?? null,
        stdoutPath,
        stderrPath,
        sessionId: capturedSessionId,
      },
    );
  }

  if (errorEvent) {
    const eventMessage =
      errorEvent.error?.data?.message ??
      errorEvent.error?.message ??
      "Unknown opencode runtime error.";

    throw createProcessFailure(
      `opencode run emitted an error event: ${eventMessage}`,
      {
        exitCode: result.status ?? 0,
        stdoutPath,
        stderrPath,
        sessionId: capturedSessionId,
        errorEvent,
      },
    );
  }

  return {
    mode: "execute",
    executed: true,
    executable: true,
    agent,
    reason: null,
    exitCode: result.status ?? 0,
    sessionId: capturedSessionId,
    commandArgs,
    stdoutPath,
    stderrPath,
  };
}

function isSessionUnavailableFailure(error) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const message = typeof error.message === "string" ? error.message : "";
  const stderrPath = typeof error.stderrPath === "string" ? error.stderrPath : null;
  let stderr = "";

  if (stderrPath && existsSync(stderrPath)) {
    stderr = readFileSync(stderrPath, "utf8");
  }

  return /session/i.test(`${message}\n${stderr}`) && /(not found|missing|invalid|unknown)/i.test(`${message}\n${stderr}`);
}

function buildStatusNotes({
  artifactDir,
  resolvedBudget,
  dispatch,
  retryAt,
  execution,
}) {
  const notes = [
    `artifact_dir=${artifactDir}`,
    `claude_budget=${resolvedBudget.state}`,
    `source=${resolvedBudget.source}`,
    `session_role=${dispatch.sessionBinding.role}`,
    `resume_mode=${dispatch.sessionBinding.resumeMode}`,
  ];

  if (dispatch.sessionBinding.sessionId) {
    notes.push(`session_id=${dispatch.sessionBinding.sessionId}`);
  }

  if (execution?.sessionId) {
    notes.push(`execution_session_id=${execution.sessionId}`);
  }

  if (retryAt) {
    notes.push(`retry_at=${retryAt}`);
  }

  if (execution?.mode) {
    notes.push(`execution_mode=${execution.mode}`);
  }

  return notes.join(" ");
}

function resolveStatusPatch({ dispatch, execution }) {
  if (execution?.mode === "session-missing") {
    return {
      ...dispatch.statusPatch,
      lifecycle: "blocked",
      approval_state: "human_escalation",
      verification_status: "pending",
    };
  }

  return dispatch.statusPatch;
}

/**
 * @typedef {object} RunStageWithArtifactsOptions
 * @property {string} [rootDir]
 * @property {string} slice
 * @property {number|string} stage
 * @property {string} [workItemId]
 * @property {"available"|"constrained"|"unavailable"} [claudeBudgetState]
 * @property {"artifact-only"|"execute"} [mode]
 * @property {string} [artifactDir]
 * @property {string} [executionDir]
 * @property {string} [opencodeBin]
 * @property {string} [agent]
 * @property {Record<string, string>} [environment]
 * @property {string} [homeDir]
 * @property {boolean} [syncStatus]
 * @property {string} [now]
 * @property {number} [retryDelayHours]
 * @property {number} [maxRetryAttempts]
 */

/**
 * @param {RunStageWithArtifactsOptions} options
 */
export function runStageWithArtifacts({
  rootDir = process.cwd(),
  slice,
  stage,
  workItemId,
  claudeBudgetState,
  mode = "artifact-only",
  artifactDir,
  executionDir,
  opencodeBin,
  agent,
  environment,
  homeDir,
  syncStatus = false,
  now,
  retryDelayHours = DEFAULT_RETRY_DELAY_HOURS,
  maxRetryAttempts = DEFAULT_MAX_RETRY_ATTEMPTS,
}) {
  const normalizedSlice = ensureNonEmptyString(slice, "slice");
  const normalizedStage = Number(stage);
  const resolvedBudget = resolveClaudeBudgetState({
    rootDir,
    homeDir,
    explicitState: claudeBudgetState,
    environment,
  });
  const targetArtifactDir =
    artifactDir ??
    defaultArtifactDir(rootDir, normalizedSlice, normalizedStage, now);
  const resolvedExecutionDir =
    typeof executionDir === "string" && executionDir.trim().length > 0
      ? executionDir.trim()
      : rootDir;
  const stageResultPath = resolveStageResultPath(targetArtifactDir);
  const runtimeSnapshot = workItemId
    ? readRuntimeState({
        rootDir,
        workItemId,
        slice: normalizedSlice,
      })
    : null;
  const sessionRole = resolveStageSessionRole(normalizedStage);
  const existingSessionId = runtimeSnapshot?.state?.sessions?.[sessionRole]?.session_id ?? null;
  const retryState =
    runtimeSnapshot?.state?.blocked_stage === normalizedStage ? runtimeSnapshot.state.retry : null;
  const retryAt =
    resolvedBudget.state === "unavailable" && sessionRole === "claude_primary"
      ? resolveRetryAt({
          now,
          delayHours: retryDelayHours,
        })
      : retryState?.at ?? null;
  const dispatch = buildStageDispatch({
    slice: normalizedSlice,
    stage: normalizedStage,
    claudeBudgetState: resolvedBudget.state,
    sessionId: existingSessionId,
    retryAt,
    attemptCount: retryState?.attempt_count ?? 0,
  });
  const executionBinding = resolveExecutionBinding(dispatch, { agent });
  const prompt = buildPrompt({
    slice: normalizedSlice,
    stage: dispatch.stage,
    workItemId,
    dispatch,
    stageResultPath,
  });
  const resolvedOpencodeBin = opencodeBin ?? resolveDefaultOpencodeBin(environment);

  mkdirSync(targetArtifactDir, { recursive: true });

  const metadata = {
    slice: normalizedSlice,
    stage: dispatch.stage,
    actor: dispatch.actor,
    workItemId: workItemId ?? null,
    claudeBudget: resolvedBudget,
    sessionBinding: dispatch.sessionBinding,
    retryDecision: dispatch.retryDecision,
    runtimePath: workItemId
      ? resolveRuntimePath({
          rootDir,
          workItemId,
        })
      : null,
    execution: {
      mode,
      executable: executionBinding.executable,
      agent: executionBinding.agent,
      reason: executionBinding.reason,
    },
    executionDir: resolvedExecutionDir,
    stageResultPath,
  };

  let result;

  if (mode !== "execute") {
    result = {
      artifactDir: targetArtifactDir,
      dispatch,
      prompt,
      execution: {
        mode: "artifact-only",
        executed: false,
        executable: executionBinding.executable,
        agent: executionBinding.agent,
        reason: executionBinding.reason,
        exitCode: null,
        sessionId: existingSessionId,
      },
    };
  } else if (dispatch.retryDecision.action === "schedule_retry") {
    result = {
      artifactDir: targetArtifactDir,
      dispatch,
      prompt,
      execution: {
        mode: "scheduled-retry",
        executed: false,
        executable: false,
        agent: executionBinding.agent,
        reason: "claude_budget_unavailable",
        exitCode: null,
        sessionId: existingSessionId,
      },
    };
  } else if (!executionBinding.executable) {
    result = {
      artifactDir: targetArtifactDir,
      dispatch,
      prompt,
      execution: {
        mode: "manual-handoff",
        executed: false,
        executable: false,
        agent: null,
        reason: executionBinding.reason,
        exitCode: null,
        sessionId: existingSessionId,
      },
    };
  } else {
    try {
      result = {
        artifactDir: targetArtifactDir,
        dispatch,
        prompt,
        execution: runOpencode({
          executionDir: resolvedExecutionDir,
          artifactDir: targetArtifactDir,
          prompt,
          agent: executionBinding.agent,
          sessionId: existingSessionId,
          opencodeBin: resolvedOpencodeBin,
          environment,
          stageResultPath,
        }),
      };
    } catch (error) {
      if (existingSessionId && isSessionUnavailableFailure(error)) {
        result = {
          artifactDir: targetArtifactDir,
          dispatch: buildStageDispatch({
            slice: normalizedSlice,
            stage: normalizedStage,
            claudeBudgetState: resolvedBudget.state,
            sessionId: existingSessionId,
            attemptCount: (retryState?.attempt_count ?? 0) + 1,
            forceHumanEscalation: true,
          }),
          prompt,
          execution: {
            mode: "session-missing",
            executed: false,
            executable: false,
            agent: executionBinding.agent,
            reason: "stored session could not be continued",
            exitCode: error.exitCode ?? null,
            sessionId: existingSessionId,
            stdoutPath: error.stdoutPath ?? null,
            stderrPath: error.stderrPath ?? null,
          },
        };
      } else if (sessionRole === "claude_primary" && isClaudeBudgetRuntimeFailure(error)) {
        result = {
          artifactDir: targetArtifactDir,
          dispatch: buildStageDispatch({
            slice: normalizedSlice,
            stage: normalizedStage,
            claudeBudgetState: "unavailable",
            sessionId: error.sessionId ?? existingSessionId,
            retryAt: resolveRetryAt({
              now,
              delayHours: retryDelayHours,
            }),
            attemptCount: (retryState?.attempt_count ?? 0) + 1,
          }),
          prompt,
          execution: {
            mode: "scheduled-retry",
            executed: false,
            executable: false,
            agent: executionBinding.agent,
            reason: "claude_budget_unavailable",
            exitCode: error.exitCode ?? null,
            sessionId: error.sessionId ?? existingSessionId,
            stdoutPath: error.stdoutPath ?? null,
            stderrPath: error.stderrPath ?? null,
          },
        };
      } else {
        throw error;
      }
    }
  }

  let runtimeSync = null;
  if (workItemId && runtimeSnapshot) {
    let nextRuntimeState = runtimeSnapshot.state;
    const scheduledRetryAt =
      result.dispatch.retryDecision.action === "schedule_retry"
        ? result.dispatch.retryDecision.retryAt ?? retryAt ?? null
        : null;

    if (
      (result.execution.mode === "execute" && result.execution.executed) ||
      (result.execution.mode === "scheduled-retry" && result.execution.sessionId)
    ) {
      if (result.execution.sessionId) {
        nextRuntimeState = setSessionBinding({
          state: nextRuntimeState,
          role: dispatch.sessionBinding.role,
          sessionId: result.execution.sessionId,
          agent: executionBinding.agent,
          updatedAt: now,
        });
      }
    }

    if (result.execution.mode === "execute" && result.execution.executed) {
      nextRuntimeState = markStageCompleted({
        state: nextRuntimeState,
        stage: dispatch.stage,
        artifactDir: targetArtifactDir,
      });
    } else if (
      result.execution.mode === "scheduled-retry" ||
      dispatch.retryDecision.action === "schedule_retry"
    ) {
      nextRuntimeState = scheduleStageRetry({
        state: nextRuntimeState,
        stage: dispatch.stage,
        retryAt: scheduledRetryAt,
        reason: "claude_budget_unavailable",
        attemptCount: (retryState?.attempt_count ?? 0) + 1,
        maxAttempts: maxRetryAttempts,
        artifactDir: targetArtifactDir,
      });
    } else if (result.execution.mode === "session-missing") {
      nextRuntimeState = markSessionUnavailable({
        state: nextRuntimeState,
        stage: dispatch.stage,
        attemptCount: (retryState?.attempt_count ?? 0) + 1,
        maxAttempts: maxRetryAttempts,
        artifactDir: targetArtifactDir,
      });
    }

    runtimeSync = writeRuntimeState({
      rootDir,
      workItemId,
      state: nextRuntimeState,
    });
  }

  let statusSync = null;
  if (syncStatus && workItemId) {
    const appliedRetryAt =
      result.dispatch.retryDecision.action === "schedule_retry"
        ? result.dispatch.retryDecision.retryAt ?? retryAt ?? null
        : null;
    statusSync = syncWorkflowV2Status({
      rootDir,
      workItemId,
      patch: {
        ...resolveStatusPatch({
          dispatch: result.dispatch,
          execution: result.execution,
        }),
        notes: buildStatusNotes({
          artifactDir: targetArtifactDir,
          resolvedBudget,
          dispatch: result.dispatch,
          retryAt: appliedRetryAt,
          execution: result.execution,
        }),
      },
      updatedAt: now,
    });
  }

  writeArtifacts({
    artifactDir: targetArtifactDir,
    dispatch: result.dispatch,
    prompt,
    metadata: {
      ...metadata,
      sessionBinding: {
        ...result.dispatch.sessionBinding,
        sessionId: result.dispatch.sessionBinding.sessionId ?? result.execution.sessionId ?? null,
      },
      execution: result.execution,
      runtimeSync: runtimeSync
        ? {
            runtimePath: runtimeSync.runtimePath,
            current_stage: runtimeSync.state.current_stage,
            last_completed_stage: runtimeSync.state.last_completed_stage,
            blocked_stage: runtimeSync.state.blocked_stage,
          }
        : null,
      statusSync: statusSync
        ? {
            workItemId,
            lifecycle: statusSync.statusItem.lifecycle,
            approval_state: statusSync.statusItem.approval_state,
            verification_status: statusSync.statusItem.verification_status,
          }
        : null,
      stageResultPath,
      stageResult: readStageResult(targetArtifactDir),
    },
  });

  const stageResult = readStageResult(targetArtifactDir);

  return {
    ...result,
    runtimeSync,
    statusSync,
    stageResult,
  };
}
