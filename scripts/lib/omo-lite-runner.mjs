import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { buildStageDispatch } from "./omo-lite-supervisor.mjs";

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

function resolveExecutionBinding(dispatch, { agent }) {
  if (dispatch.actor !== "codex") {
    return {
      executable: false,
      agent: null,
      reason: "actor is not executable by the Codex supervisor",
    };
  }

  return {
    executable: true,
    agent: agent ?? "hephaestus",
    reason: null,
  };
}

function buildPrompt({ slice, stage, workItemId, dispatch }) {
  return [
    "# Homecook OMO-lite Stage Dispatch",
    "",
    `- slice: \`${slice}\``,
    `- stage: \`${stage}\``,
    `- actor: \`${dispatch.actor}\``,
    workItemId ? `- workflow v2 work item: \`${workItemId}\`` : null,
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

function runOpencode({
  rootDir,
  artifactDir,
  prompt,
  agent,
  opencodeBin,
  environment,
}) {
  const commandArgs = [
    "run",
    "--agent",
    agent,
    "--dir",
    rootDir,
    "--format",
    "default",
    prompt,
  ];

  const result = spawnSync(opencodeBin, commandArgs, {
    cwd: rootDir,
    env: {
      ...process.env,
      ...(environment ?? {}),
    },
    encoding: "utf8",
  });

  const stdoutPath = resolve(artifactDir, "opencode.stdout.log");
  const stderrPath = resolve(artifactDir, "opencode.stderr.log");

  writeFileSync(stdoutPath, result.stdout ?? "");
  writeFileSync(stderrPath, result.stderr ?? "");

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `opencode run failed with exit code ${result.status}. See ${stderrPath}`,
    );
  }

  return {
    mode: "execute",
    executed: true,
    executable: true,
    agent,
    reason: null,
    exitCode: result.status ?? 0,
    commandArgs,
    stdoutPath,
    stderrPath,
  };
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
 * @property {string} [opencodeBin]
 * @property {string} [agent]
 * @property {Record<string, string>} [environment]
 * @property {string} [now]
 */

/**
 * @param {RunStageWithArtifactsOptions} options
 */
export function runStageWithArtifacts({
  rootDir = process.cwd(),
  slice,
  stage,
  workItemId,
  claudeBudgetState = "available",
  mode = "artifact-only",
  artifactDir,
  opencodeBin = "opencode",
  agent,
  environment,
  now,
}) {
  const normalizedSlice = ensureNonEmptyString(slice, "slice");
  const dispatch = buildStageDispatch({
    slice: normalizedSlice,
    stage,
    claudeBudgetState,
  });
  const targetArtifactDir =
    artifactDir ??
    defaultArtifactDir(rootDir, normalizedSlice, dispatch.stage, now);
  const executionBinding = resolveExecutionBinding(dispatch, { agent });
  const prompt = buildPrompt({
    slice: normalizedSlice,
    stage: dispatch.stage,
    workItemId,
    dispatch,
  });

  const metadata = {
    slice: normalizedSlice,
    stage: dispatch.stage,
    actor: dispatch.actor,
    workItemId: workItemId ?? null,
    claudeBudgetState,
    execution: {
      mode,
      executable: executionBinding.executable,
      agent: executionBinding.agent,
      reason: executionBinding.reason,
    },
  };

  mkdirSync(targetArtifactDir, { recursive: true });

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
      },
    };

  } else {
    result = {
      artifactDir: targetArtifactDir,
      dispatch,
      prompt,
      execution: runOpencode({
        rootDir,
        artifactDir: targetArtifactDir,
        prompt,
        agent: executionBinding.agent,
        opencodeBin,
        environment,
      }),
    };
  }

  writeArtifacts({
    artifactDir: targetArtifactDir,
    dispatch,
    prompt,
    metadata: {
      ...metadata,
      execution: result.execution,
    },
  });

  return result;
}
