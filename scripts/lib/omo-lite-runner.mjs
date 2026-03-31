import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { resolveClaudeBudgetState } from "./omo-lite-claude-budget.mjs";
import {
  resolveClaudeProviderConfig,
  resolveCodexProviderConfig,
} from "./omo-provider-config.mjs";
import {
  buildStageDispatch,
  resolveStageSessionRole,
  syncWorkflowV2Status,
} from "./omo-lite-supervisor.mjs";
import {
  readStageResult,
  resolveStageResultPath,
  validateStageResult,
} from "./omo-stage-result.mjs";
import {
  DEFAULT_MAX_RETRY_ATTEMPTS,
  DEFAULT_RETRY_DELAY_HOURS,
  OMO_SESSION_ROLE_TO_AGENT,
  markReviewPending,
  markSessionUnavailable,
  markStageCompleted,
  markStageResultReady,
  markStageRunning,
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

function resolveDefaultOpencodeBin(environment, homeDir) {
  const candidateHomeDir =
    environment?.HOME ??
    homeDir ??
    process.env.HOME ??
    null;
  const fromEnvironment =
    environment?.OPENCODE_BIN ??
    process.env.OPENCODE_BIN ??
    (typeof candidateHomeDir === "string" && candidateHomeDir.trim().length > 0
      ? resolve(candidateHomeDir, ".opencode", "bin", "opencode")
      : null);

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

function resolveExecutionBinding(dispatch, { agent, providerConfig }) {
  if (dispatch.actor === "human") {
    return {
      executable: false,
      provider: null,
      agent: null,
      model: null,
      variant: null,
      reason: "actor requires human escalation",
    };
  }

  if (providerConfig.provider === "claude-cli") {
    return {
      executable: true,
      provider: "claude-cli",
      agent: null,
      model: null,
      variant: null,
      reason: null,
    };
  }

  const fallbackAgent = providerConfig.agent ?? OMO_SESSION_ROLE_TO_AGENT[dispatch.sessionBinding.role];
  const resolvedModel =
    typeof providerConfig.model === "string" && providerConfig.model.trim().length > 0
      ? providerConfig.model.trim()
      : null;
  const resolvedVariant =
    typeof providerConfig.variant === "string" && providerConfig.variant.trim().length > 0
      ? providerConfig.variant.trim()
      : null;

  return {
    executable: true,
    provider: "opencode",
    agent: resolvedModel ? null : agent ?? fallbackAgent,
    model: resolvedModel,
    variant: resolvedVariant,
    reason: null,
  };
}

function buildPrompt({ slice, stage, workItemId, dispatch, stageResultPath }) {
  const normalizedStage = Number(stage);
  const stageResultTemplate =
    [1, 2, 4].includes(normalizedStage)
      ? {
          result: "done",
          summary_markdown: "짧은 요약",
          commit: {
            subject: "docs: 제목 또는 feat: 제목",
            body_markdown: "선택 사항",
          },
          pr: {
            title: "docs: 제목 또는 feat: 제목",
            body_markdown: "## Summary\n- 변경 요약",
          },
          checks_run: ["pnpm test:all"],
          next_route: "open_pr",
        }
      : {
          decision: "approve",
          body_markdown: "## Review\n- 승인",
          route_back_stage: null,
          approved_head_sha: "abc123",
        };

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
    "- Limit changes to files directly required by the locked slice scope. Avoid unrelated refactors, opportunistic cleanup, or out-of-scope file edits.",
    "- Your responsibility is scoped code/doc updates, local verification, and valid stage-result writing. Do not create, update, ready, review, or merge GitHub pull requests yourself; supervisor handles GitHub automation.",
    "- PR 제목/본문, summary_markdown, review body_markdown은 특별한 이유가 없으면 한국어로 작성하세요.",
    "",
    "## Stage Result Output",
    `- Write a JSON file to \`${stageResultPath}\` before finishing the task.`,
    "- The JSON must follow the stage result contract locked in workflow-v2 docs.",
    "- Use this exact JSON shape for this stage:",
    "```json",
    JSON.stringify(stageResultTemplate, null, 2),
    "```",
    [1, 2, 4].includes(normalizedStage)
      ? "- Required keys: result, summary_markdown, commit.subject, pr.title, pr.body_markdown, checks_run, next_route"
      : "- Required keys: decision, body_markdown, route_back_stage, approved_head_sha",
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

function parseJsonObject(stdout) {
  const text = typeof stdout === "string" ? stdout.trim() : "";
  if (text.length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Ignore full-buffer parse failures and fall back to line-based parsing.
  }

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || !trimmed.startsWith("{")) {
      continue;
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function extractSessionId(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (typeof value.sessionID === "string" && value.sessionID.trim().length > 0) {
    return value.sessionID.trim();
  }

  if (typeof value.session_id === "string" && value.session_id.trim().length > 0) {
    return value.session_id.trim();
  }

  return null;
}

function parseSessionId(stdout, fallbackSessionId) {
  const lines = typeof stdout === "string" ? stdout.split(/\r?\n/) : [];

  const fullObject = parseJsonObject(stdout);
  const fullObjectSessionId = extractSessionId(fullObject);
  if (fullObjectSessionId) {
    return fullObjectSessionId;
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || !trimmed.startsWith("{")) {
      continue;
    }

    try {
      const event = JSON.parse(trimmed);
      const sessionId = extractSessionId(event);
      if (sessionId) {
        return sessionId;
      }
    } catch {
      continue;
    }
  }

  return fallbackSessionId ?? null;
}

function parseClaudeJsonOutput(stdout) {
  const parsed = parseJsonObject(stdout);
  return parsed && typeof parsed === "object" ? parsed : null;
}

function extractClaudePermissionDeniedTools(parsedOutput) {
  if (!parsedOutput || typeof parsedOutput !== "object" || !Array.isArray(parsedOutput.permission_denials)) {
    return [];
  }

  return [...new Set(
    parsedOutput.permission_denials
      .map((entry) =>
        entry && typeof entry === "object" && typeof entry.tool_name === "string"
          ? entry.tool_name.trim()
          : null,
      )
      .filter((entry) => typeof entry === "string" && entry.length > 0),
  )];
}

function buildStageResultContractViolationReason({ artifactDir, execution }) {
  const stageResultPath = resolveStageResultPath(artifactDir);
  const genericMessage = `stage-result missing: ${stageResultPath} was not written before the stage finished.`;

  if (!execution || typeof execution !== "object") {
    return genericMessage;
  }

  if (
    execution.provider === "claude-cli" &&
    typeof execution.stdoutPath === "string" &&
    existsSync(execution.stdoutPath)
  ) {
    const parsedOutput = parseClaudeJsonOutput(readFileSync(execution.stdoutPath, "utf8"));
    const deniedTools = extractClaudePermissionDeniedTools(parsedOutput);
    const details = [];

    if (deniedTools.length > 0) {
      details.push(`permission denied for ${deniedTools.join(", ")}`);
    }

    if (parsedOutput?.result && typeof parsedOutput.result === "string") {
      details.push(parsedOutput.result.trim());
    }

    if (details.length > 0) {
      return `${genericMessage} ${details.join(" ")}`.trim();
    }
  }

  return genericMessage;
}

function extractClaudeTranscriptFileSessionId(filename) {
  if (typeof filename !== "string" || !filename.endsWith(".jsonl")) {
    return null;
  }

  const sessionId = filename.slice(0, -".jsonl".length).trim();
  return sessionId.length > 0 ? sessionId : null;
}

function collectClaudeTranscriptIds(dirPath, ids) {
  if (!existsSync(dirPath)) {
    return;
  }

  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      collectClaudeTranscriptIds(join(dirPath, entry.name), ids);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const sessionId = extractClaudeTranscriptFileSessionId(entry.name);
    if (sessionId) {
      ids.add(sessionId);
    }
  }
}

function listClaudeTranscriptIds(homeDir) {
  const transcriptDir = resolve(homeDir ?? process.env.HOME ?? "", ".claude", "transcripts");
  const projectTranscriptDir = resolve(homeDir ?? process.env.HOME ?? "", ".claude", "projects");
  const ids = new Set();

  collectClaudeTranscriptIds(projectTranscriptDir, ids);
  collectClaudeTranscriptIds(transcriptDir, ids);

  return {
    transcriptDir,
    projectTranscriptDir,
    ids,
  };
}

function detectNewClaudeTranscriptSessionId({ beforeIds, homeDir }) {
  const { ids } = listClaudeTranscriptIds(homeDir);
  const createdIds = [...ids].filter((entry) => !beforeIds.has(entry));

  if (createdIds.length === 1) {
    return createdIds[0];
  }

  return null;
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

function resolveProcessFailureKind(error) {
  if (!error || typeof error !== "object") {
    return "nonzero_exit";
  }

  const directCode =
    typeof error.code === "string"
      ? error.code
      : typeof error.cause?.code === "string"
        ? error.cause.code
        : null;

  if (directCode === "ENOBUFS") {
    return "buffer_overflow";
  }

  if (directCode === "SIGTERM" || directCode === "SIGKILL") {
    return "signal_terminated";
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

  if (/non-JSON output/i.test(fragments.join("\n"))) {
    return "malformed_output";
  }

  return /ENOBUFS|maxBuffer/i.test(fragments.join("\n"))
    ? "buffer_overflow"
    : "nonzero_exit";
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

function runCommandToArtifactLogs({
  bin,
  args,
  cwd,
  environment,
  stdoutPath,
  stderrPath,
  input,
}) {
  const stdoutFd = openSync(stdoutPath, "w");
  const stderrFd = openSync(stderrPath, "w");

  try {
    return spawnSync(bin, args, {
      cwd,
      env: {
        ...process.env,
        ...(environment ?? {}),
      },
      input,
      encoding: "utf8",
      stdio: ["pipe", stdoutFd, stderrFd],
    });
  } finally {
    closeSync(stdoutFd);
    closeSync(stderrFd);
  }
}

function runOpencode({
  executionDir,
  artifactDir,
  prompt,
  agent,
  model,
  variant,
  sessionId,
  opencodeBin,
  environment,
  stageResultPath,
}) {
  const commandArgs = ["run", "--dir", executionDir, "--format", "json"];
  const stdoutPath = resolve(artifactDir, "opencode.stdout.log");
  const stderrPath = resolve(artifactDir, "opencode.stderr.log");

  if (sessionId) {
    commandArgs.push("--session", sessionId);
  } else {
    if (typeof model === "string" && model.trim().length > 0) {
      commandArgs.push("--model", model.trim());
      if (typeof variant === "string" && variant.trim().length > 0) {
        commandArgs.push("--variant", variant.trim());
      }
    } else {
      commandArgs.push("--agent", agent);
    }
  }

  commandArgs.push(prompt);

  const result = runCommandToArtifactLogs({
    bin: opencodeBin,
    args: commandArgs,
    cwd: executionDir,
    environment: {
      ...(environment ?? {}),
      OMO_STAGE_RESULT_PATH: stageResultPath,
      OMO_STAGE_ARTIFACT_DIR: artifactDir,
    },
    stdoutPath,
    stderrPath,
  });
  const stdout = existsSync(stdoutPath) ? readFileSync(stdoutPath, "utf8") : "";

  if (result.error) {
    throw createProcessFailure(
      result.error.message,
      {
        cause: result.error,
        exitCode: result.status ?? null,
        stdoutPath,
        stderrPath,
        sessionId: parseSessionId(stdout, sessionId),
        code: result.error?.code ?? null,
        failureKind: "process_failure",
      },
    );
  }

  const capturedSessionId = parseSessionId(stdout, sessionId);
  const errorEvent = parseErrorEvent(stdout);

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
    provider: "opencode",
    agent,
    reason: null,
    exitCode: result.status ?? 0,
    sessionId: capturedSessionId,
    commandArgs,
    stdoutPath,
    stderrPath,
  };
}

function runClaudeCli({
  executionDir,
  artifactDir,
  prompt,
  sessionId,
  claudeBin,
  claudeModel,
  claudeEffort,
  permissionMode,
  environment,
  homeDir,
  stageResultPath,
}) {
  const beforeTranscripts = listClaudeTranscriptIds(homeDir);
  const stdoutPath = resolve(artifactDir, "claude.stdout.log");
  const stderrPath = resolve(artifactDir, "claude.stderr.log");
  const commandArgs = [
    "-p",
    "--output-format",
    "json",
    "--input-format",
    "text",
    "--permission-mode",
    permissionMode,
    "--add-dir",
    artifactDir,
  ];

  if (claudeEffort) {
    commandArgs.push("--effort", claudeEffort);
  }

  if (claudeModel) {
    commandArgs.push("--model", claudeModel);
  }

  if (sessionId) {
    commandArgs.push("--resume", sessionId);
  }

  const result = runCommandToArtifactLogs({
    bin: claudeBin,
    args: commandArgs,
    cwd: executionDir,
    environment: {
      ...(environment ?? {}),
      HOME: homeDir ?? process.env.HOME,
      OMO_STAGE_RESULT_PATH: stageResultPath,
      OMO_STAGE_ARTIFACT_DIR: artifactDir,
    },
    input: prompt,
    stdoutPath,
    stderrPath,
  });
  const stdout = existsSync(stdoutPath) ? readFileSync(stdoutPath, "utf8") : "";
  const parsedOutput = parseClaudeJsonOutput(stdout);
  const capturedSessionId =
    extractSessionId(parsedOutput) ??
    detectNewClaudeTranscriptSessionId({
      beforeIds: beforeTranscripts.ids,
      homeDir,
    }) ??
    sessionId ??
    null;

  if (result.error) {
    throw createProcessFailure(result.error.message, {
      cause: result.error,
      exitCode: result.status ?? null,
      stdoutPath,
      stderrPath,
      sessionId: capturedSessionId,
      parsedOutput,
    });
  }

  if (result.status !== 0) {
    throw createProcessFailure(
      `claude CLI failed with exit code ${result.status}. See ${stderrPath}`,
      {
        exitCode: result.status ?? null,
        stdoutPath,
        stderrPath,
        sessionId: capturedSessionId,
        parsedOutput,
      },
    );
  }

  if (!parsedOutput) {
    throw createProcessFailure(
      "claude CLI emitted non-JSON output.",
      {
        exitCode: result.status ?? 0,
        stdoutPath,
        stderrPath,
        sessionId: capturedSessionId,
        contractViolation: true,
      },
    );
  }

  if (!capturedSessionId) {
    throw createProcessFailure(
      "claude CLI did not expose a session_id or transcript fallback.",
      {
        exitCode: result.status ?? 0,
        stdoutPath,
        stderrPath,
        sessionId: null,
        contractViolation: true,
      },
    );
  }

  if (parsedOutput.is_error === true) {
    throw createProcessFailure(
      `claude CLI emitted an error result: ${parsedOutput.result ?? "Unknown Claude CLI error."}`,
      {
        exitCode: result.status ?? 0,
        stdoutPath,
        stderrPath,
        sessionId: capturedSessionId,
        parsedOutput,
      },
    );
  }

  return {
    mode: "execute",
    executed: true,
    executable: true,
    provider: "claude-cli",
    agent: null,
    reason: null,
    exitCode: result.status ?? 0,
    sessionId: capturedSessionId,
    commandArgs,
    stdoutPath,
    stderrPath,
    usage: parsedOutput.usage ?? null,
    modelUsage: parsedOutput.modelUsage ?? null,
    totalCostUsd:
      typeof parsedOutput.total_cost_usd === "number" ? parsedOutput.total_cost_usd : null,
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

function isClaudeRetryableFailure(error) {
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

  const parsedOutput =
    error.parsedOutput && typeof error.parsedOutput === "object" ? error.parsedOutput : null;
  if (parsedOutput?.result) {
    fragments.push(String(parsedOutput.result));
  }

  const haystack = fragments.join("\n");

  return /(credit balance is too low|insufficient credits|quota|billing|budget exhausted|rate limit|temporarily unavailable|try again|overloaded|service unavailable|server error|timed out|timeout|login required|authentication required|auth required)/i.test(
    haystack,
  );
}

function resolveStoredSessionProvider(role, entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  if (typeof entry.provider === "string" && entry.provider.trim().length > 0) {
    return entry.provider.trim();
  }

  if (typeof entry.session_id === "string" && entry.session_id.trim().length > 0) {
    return role === "codex_primary" ? "opencode" : "opencode";
  }

  return null;
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

  if (execution?.provider) {
    notes.push(`session_provider=${execution.provider}`);
  }

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

  if (execution?.failureKind) {
    notes.push(`failure_kind=${execution.failureKind}`);
  }

  return notes.join(" ");
}

function resolveStatusPatch({ dispatch, execution }) {
  if (
    execution?.mode === "session-missing" ||
    execution?.mode === "provider-mismatch" ||
    execution?.mode === "contract-violation" ||
    execution?.mode === "process-failure"
  ) {
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
 * @property {"opencode"|"claude-cli"} [claudeProvider]
 * @property {string} [claudeBin]
 * @property {string} [claudeModel]
 * @property {"low"|"medium"|"high"} [claudeEffort]
 * @property {string} [agent]
 * @property {Record<string, string>} [environment]
 * @property {string} [homeDir]
 * @property {boolean} [syncStatus]
 * @property {string} [now]
 * @property {number} [retryDelayHours]
 * @property {number} [maxRetryAttempts]
 * @property {"standalone"|"supervisor"} [lifecycleMode]
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
  claudeProvider,
  claudeBin,
  claudeModel,
  claudeEffort,
  agent,
  environment,
  homeDir,
  syncStatus = false,
  now,
  retryDelayHours = DEFAULT_RETRY_DELAY_HOURS,
  maxRetryAttempts = DEFAULT_MAX_RETRY_ATTEMPTS,
  lifecycleMode = "standalone",
}) {
  const normalizedSlice = ensureNonEmptyString(slice, "slice");
  const normalizedStage = Number(stage);
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
  const existingSessionEntry = runtimeSnapshot?.state?.sessions?.[sessionRole] ?? null;
  const existingSessionId = existingSessionEntry?.session_id ?? null;
  const existingSessionProvider = resolveStoredSessionProvider(sessionRole, existingSessionEntry);
  const explicitClaudeProvider =
    typeof claudeProvider === "string" && claudeProvider.trim().length > 0
      ? claudeProvider.trim()
      : null;
  const claudeProviderConfig = resolveClaudeProviderConfig({
    rootDir,
    provider: explicitClaudeProvider ?? undefined,
    bin: claudeBin,
    model: claudeModel,
    effort: claudeEffort,
  });
  const codexProviderConfig = resolveCodexProviderConfig({
    rootDir,
    bin: opencodeBin,
    agent,
    environment,
    homeDir,
  });
  const desiredProviderConfig =
    sessionRole === "claude_primary"
      ? claudeProviderConfig.provider === "opencode"
        ? {
            provider: "opencode",
            bin: codexProviderConfig.bin,
            agent: OMO_SESSION_ROLE_TO_AGENT.claude_primary,
          }
        : claudeProviderConfig
      : codexProviderConfig;
  const activeProviderConfig =
    sessionRole === "claude_primary" &&
    existingSessionId &&
    existingSessionProvider &&
    !explicitClaudeProvider
      ? {
          ...claudeProviderConfig,
          provider: existingSessionProvider,
          bin:
            existingSessionProvider === "opencode"
              ? codexProviderConfig.bin
              : claudeProviderConfig.bin,
          agent:
            existingSessionProvider === "opencode"
              ? OMO_SESSION_ROLE_TO_AGENT.claude_primary
              : null,
        }
      : desiredProviderConfig;
  const hasProviderMismatch =
    sessionRole === "claude_primary" &&
    Boolean(existingSessionId && existingSessionProvider) &&
    activeProviderConfig.provider !== existingSessionProvider;
  const resolvedBudget = resolveClaudeBudgetState({
    rootDir,
    homeDir,
    provider:
      sessionRole === "claude_primary" ? activeProviderConfig.provider : claudeProviderConfig.provider,
    explicitState: claudeBudgetState,
    claudeBin: claudeProviderConfig.bin,
    environment,
  });
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
  const executionBinding = resolveExecutionBinding(dispatch, {
    agent,
    providerConfig: activeProviderConfig,
  });
  const prompt = buildPrompt({
    slice: normalizedSlice,
    stage: dispatch.stage,
    workItemId,
    dispatch,
    stageResultPath,
  });
  const resolvedOpencodeBin =
    activeProviderConfig.provider === "opencode"
      ? !activeProviderConfig.bin || activeProviderConfig.bin === "opencode"
        ? resolveDefaultOpencodeBin(environment, homeDir)
        : activeProviderConfig.bin
      : resolveDefaultOpencodeBin(environment, homeDir);

  mkdirSync(targetArtifactDir, { recursive: true });

  const metadata = {
    slice: normalizedSlice,
    stage: dispatch.stage,
    actor: dispatch.actor,
    workItemId: workItemId ?? null,
    claudeBudget: resolvedBudget,
    sessionBinding: dispatch.sessionBinding,
    retryDecision: dispatch.retryDecision,
    providerConfig: activeProviderConfig,
    runtimePath: workItemId
      ? resolveRuntimePath({
          rootDir,
          workItemId,
        })
      : null,
    execution: {
      mode,
      executable: executionBinding.executable,
      provider: executionBinding.provider,
      agent: executionBinding.agent,
      reason: executionBinding.reason,
    },
    executionDir: resolvedExecutionDir,
    stageResultPath,
  };
  let runtimeStartSync = null;

  if (
    workItemId &&
    runtimeSnapshot &&
    mode === "execute" &&
    executionBinding.executable &&
    dispatch.retryDecision.action !== "schedule_retry" &&
    !hasProviderMismatch
  ) {
    runtimeStartSync = writeRuntimeState({
      rootDir,
      workItemId,
      state: markStageRunning({
        state: runtimeSnapshot.state,
        stage: dispatch.stage,
        artifactDir: targetArtifactDir,
        provider: executionBinding.provider,
        sessionRole: dispatch.sessionBinding.role,
        sessionId: existingSessionId,
        stageResultPath,
        verifyCommands: dispatch.verifyCommands,
        prRole: [1, 2, 4].includes(dispatch.stage)
          ? dispatch.stage === 1
            ? "docs"
            : dispatch.stage === 2
              ? "backend"
              : "frontend"
          : dispatch.stage === 3
            ? "backend"
            : "frontend",
        startedAt: now,
      }),
    });
  }

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
        provider: executionBinding.provider,
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
        provider: executionBinding.provider,
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
        provider: executionBinding.provider,
        agent: null,
        reason: executionBinding.reason,
        exitCode: null,
        sessionId: existingSessionId,
      },
    };
  } else if (hasProviderMismatch) {
    result = {
      artifactDir: targetArtifactDir,
      dispatch: buildStageDispatch({
        slice: normalizedSlice,
        stage: normalizedStage,
        claudeBudgetState: resolvedBudget.state,
        sessionId: existingSessionId,
        attemptCount: (retryState?.attempt_count ?? 0) + 1,
        forceHumanEscalation: true,
        humanEscalationReason: "session_provider_mismatch",
      }),
      prompt,
      execution: {
        mode: "provider-mismatch",
        executed: false,
        executable: false,
        provider: executionBinding.provider,
        agent: executionBinding.agent,
        reason: "stored session provider does not match the requested provider",
        exitCode: null,
        sessionId: existingSessionId,
      },
    };
  } else {
    try {
      const execution =
        executionBinding.provider === "claude-cli"
          ? runClaudeCli({
              executionDir: resolvedExecutionDir,
              artifactDir: targetArtifactDir,
              prompt,
              sessionId: existingSessionId,
              claudeBin: claudeProviderConfig.bin,
              claudeModel: claudeProviderConfig.model,
              claudeEffort: claudeProviderConfig.effort,
              permissionMode: claudeProviderConfig.permissionMode,
              environment,
              homeDir,
              stageResultPath,
            })
          : runOpencode({
              executionDir: resolvedExecutionDir,
              artifactDir: targetArtifactDir,
              prompt,
              agent: executionBinding.agent,
              model: executionBinding.model,
              variant: executionBinding.variant,
              sessionId: existingSessionId,
              opencodeBin: resolvedOpencodeBin,
              environment,
              stageResultPath,
            });

      result = {
        artifactDir: targetArtifactDir,
        dispatch,
        prompt,
        execution,
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
            humanEscalationReason: "session_unavailable",
          }),
          prompt,
          execution: {
            mode: "session-missing",
            executed: false,
            executable: false,
            provider: executionBinding.provider,
            agent: executionBinding.agent,
            reason: "stored session could not be continued",
            exitCode: error.exitCode ?? null,
            sessionId: existingSessionId,
            stdoutPath: error.stdoutPath ?? null,
            stderrPath: error.stderrPath ?? null,
          },
        };
      } else if (
        sessionRole === "claude_primary" &&
        (isClaudeBudgetRuntimeFailure(error) || isClaudeRetryableFailure(error))
      ) {
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
            provider: executionBinding.provider,
            agent: executionBinding.agent,
            reason: "claude_budget_unavailable",
            exitCode: error.exitCode ?? null,
            sessionId: error.sessionId ?? existingSessionId,
            stdoutPath: error.stdoutPath ?? null,
            stderrPath: error.stderrPath ?? null,
          },
        };
      } else if (
        error &&
        typeof error === "object" &&
        (typeof error.stdoutPath === "string" || typeof error.stderrPath === "string")
      ) {
        result = {
          artifactDir: targetArtifactDir,
          dispatch,
          prompt,
          execution: {
            mode: "process-failure",
            executed: false,
            executable: false,
            provider: executionBinding.provider,
            agent: executionBinding.agent,
            reason: error.message ?? "stage execution process failed",
            failureKind: resolveProcessFailureKind(error),
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

  let runtimeSync = runtimeStartSync;
  let stageResult = readStageResult(targetArtifactDir);
  let validStageResult = false;

  if (result.execution.mode === "execute" && result.execution.executed && !stageResult) {
    result = {
      ...result,
      execution: {
        ...result.execution,
        mode: "contract-violation",
        reason: buildStageResultContractViolationReason({
          artifactDir: targetArtifactDir,
          execution: result.execution,
        }),
      },
    };
  } else if (stageResult) {
    try {
      validateStageResult(normalizedStage, stageResult);
      validStageResult = true;
    } catch (error) {
      result = {
        ...result,
        execution: {
          ...result.execution,
          mode: "contract-violation",
          reason: error instanceof Error ? error.message : "stageResult contract violation",
        },
      };
    }
  }

  if (workItemId && runtimeSnapshot) {
    let nextRuntimeState = runtimeStartSync?.state ?? runtimeSnapshot.state;
    const scheduledRetryAt =
      result.dispatch.retryDecision.action === "schedule_retry"
        ? result.dispatch.retryDecision.retryAt ?? retryAt ?? null
        : null;

    if (
      (result.execution.mode === "execute" && result.execution.executed) ||
      (result.execution.mode === "scheduled-retry" && result.execution.sessionId) ||
      (result.execution.mode === "contract-violation" && result.execution.sessionId) ||
      (result.execution.mode === "process-failure" && result.execution.sessionId)
    ) {
      if (result.execution.sessionId) {
        nextRuntimeState = setSessionBinding({
          state: nextRuntimeState,
          role: dispatch.sessionBinding.role,
          sessionId: result.execution.sessionId,
          provider: result.execution.provider ?? executionBinding.provider ?? "opencode",
          agent: executionBinding.agent,
          updatedAt: now,
        });
      }
    }

    if (validStageResult) {
      if (lifecycleMode === "supervisor") {
        const stageStateWriter =
          [1, 2, 4].includes(dispatch.stage) ? markStageResultReady : markReviewPending;

        nextRuntimeState = stageStateWriter({
          state: nextRuntimeState,
          stage: dispatch.stage,
          artifactDir: targetArtifactDir,
          provider: result.execution.provider ?? executionBinding.provider ?? "opencode",
          sessionRole: dispatch.sessionBinding.role,
          sessionId: result.execution.sessionId ?? existingSessionId,
          stageResultPath,
          verifyCommands: dispatch.verifyCommands,
          prRole: [1, 2, 4].includes(dispatch.stage)
            ? dispatch.stage === 1
              ? "docs"
              : dispatch.stage === 2
                ? "backend"
                : "frontend"
            : dispatch.stage === 3
              ? "backend"
              : "frontend",
          startedAt: runtimeStartSync?.state?.execution?.started_at ?? now,
          finishedAt: now,
        });
      } else if (result.execution.mode === "execute" && result.execution.executed) {
        nextRuntimeState = markStageCompleted({
          state: nextRuntimeState,
          stage: dispatch.stage,
          artifactDir: targetArtifactDir,
        });
      }
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
    } else if (result.execution.mode === "session-missing" || result.execution.mode === "provider-mismatch") {
      nextRuntimeState = markSessionUnavailable({
        state: nextRuntimeState,
        stage: dispatch.stage,
        reason:
          result.execution.mode === "provider-mismatch"
            ? "session_provider_mismatch"
            : "session_unavailable",
        attemptCount: (retryState?.attempt_count ?? 0) + 1,
        maxAttempts: maxRetryAttempts,
        artifactDir: targetArtifactDir,
      });
    } else if (result.execution.mode === "contract-violation") {
      nextRuntimeState = markSessionUnavailable({
        state: nextRuntimeState,
        stage: dispatch.stage,
        reason: "contract_violation",
        attemptCount: (retryState?.attempt_count ?? 0) + 1,
        maxAttempts: maxRetryAttempts,
        artifactDir: targetArtifactDir,
      });
    } else if (result.execution.mode === "process-failure") {
      nextRuntimeState = markSessionUnavailable({
        state: nextRuntimeState,
        stage: dispatch.stage,
        reason: result.execution.failureKind ?? "process_failure",
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
        provider: result.execution.provider ?? activeProviderConfig.provider,
      },
      execution: result.execution,
      runtimeSync: runtimeSync
        ? {
          runtimePath: runtimeSync.runtimePath,
          active_stage: runtimeSync.state.active_stage,
          current_stage: runtimeSync.state.current_stage,
          last_completed_stage: runtimeSync.state.last_completed_stage,
          blocked_stage: runtimeSync.state.blocked_stage,
          phase: runtimeSync.state.phase,
          next_action: runtimeSync.state.next_action,
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
      stageResult,
    },
  });

  return {
    ...result,
    runtimeSync,
    statusSync,
    stageResult,
  };
}
