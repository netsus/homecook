import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { resolveClaudeBudgetState } from "./omo-lite-claude-budget.mjs";
import {
  resolveClaudeProviderConfig,
  resolveCodexProviderConfig,
} from "./omo-provider-config.mjs";
import {
  isChecklistContractActive,
  readWorkpackChecklistContract,
  resolveChecklistIds,
  resolveOwnedChecklistItems,
} from "./omo-checklist-contract.mjs";
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

function optionalString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
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

function resolveStoredSessionSelection(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  return {
    sessionId: optionalString(entry.session_id),
    provider: optionalString(entry.provider),
    agent: optionalString(entry.agent),
    model: optionalString(entry.model),
    variant: optionalString(entry.variant),
    effort: optionalString(entry.effort),
    updatedAt: optionalString(entry.updated_at),
  };
}

function resolveEffectiveProviderSelection({
  existingSessionId,
  storedSessionSelection,
  executionBinding,
  activeProviderConfig,
  claudeProviderConfig,
  sessionBinding,
}) {
  const configuredModel = optionalString(activeProviderConfig?.model);
  const configuredVariant = optionalString(activeProviderConfig?.variant);
  const configuredEffort =
    executionBinding.provider === "claude-cli"
      ? optionalString(claudeProviderConfig?.effort)
      : optionalString(activeProviderConfig?.effort);
  const configuredAgent = optionalString(activeProviderConfig?.agent);
  const storedSelectionAvailable = Boolean(
    existingSessionId &&
      storedSessionSelection &&
      (
        storedSessionSelection.provider ||
        storedSessionSelection.agent ||
        storedSessionSelection.model ||
        storedSessionSelection.variant ||
        storedSessionSelection.effort
      ),
  );

  return {
    provider:
      storedSessionSelection?.provider ??
      executionBinding.provider ??
      optionalString(activeProviderConfig?.provider),
    agent:
      storedSessionSelection?.agent ??
      executionBinding.agent ??
      configuredAgent,
    model:
      storedSessionSelection?.model ??
      optionalString(executionBinding.model) ??
      configuredModel,
    variant:
      storedSessionSelection?.variant ??
      optionalString(executionBinding.variant) ??
      configuredVariant,
    effort:
      storedSessionSelection?.effort ??
      configuredEffort,
    sessionId: existingSessionId ?? null,
    resumeMode: optionalString(sessionBinding?.resumeMode),
    source:
      existingSessionId
        ? storedSelectionAvailable
          ? "stored_session_binding"
          : "provider_config_fallback"
        : "provider_config",
  };
}

function buildCodeStageResultTemplate(stage, subphase = null) {
  if (stage === 4 && subphase === "authority_precheck") {
    return {
      result: "done",
      summary_markdown: "짧은 authority precheck 요약",
      commit: {
        subject: "feat: 제목",
        body_markdown: "선택 사항",
      },
      pr: {
        title: "feat: 제목",
        body_markdown: "## Summary\n- 변경 요약",
      },
      checks_run: [],
      next_route: "open_pr",
      claimed_scope: {
        files: ["app/example/page.tsx", "ui/designs/authority/EXAMPLE-authority.md"],
        endpoints: [],
        routes: ["/example"],
        states: ["loading", "error"],
        invariants: [],
      },
      changed_files: ["app/example/page.tsx", "ui/designs/authority/EXAMPLE-authority.md"],
      tests_touched: ["tests/example.frontend.test.ts"],
      artifacts_written: [
        "ui/designs/authority/EXAMPLE-authority.md",
        "ui/designs/evidence/example/EXAMPLE-mobile.png",
      ],
      checklist_updates: [
        {
          id: "accept-frontend-example",
          status: "checked",
          evidence_refs: ["pnpm verify:frontend", "tests/example.frontend.test.ts"],
        },
      ],
      contested_fix_ids: [],
      rebuttals: [],
      authority_verdict: "pass",
      reviewed_screen_ids: ["EXAMPLE"],
      authority_report_paths: ["ui/designs/authority/EXAMPLE-authority.md"],
      evidence_artifact_refs: [
        "ui/designs/evidence/example/EXAMPLE-mobile.png",
        "ui/designs/evidence/example/EXAMPLE-mobile-narrow.png",
      ],
      blocker_count: 0,
      major_count: 0,
      minor_count: 0,
    };
  }

  if (stage === 2 && subphase === "doc_gate_repair") {
    return {
      result: "done",
      summary_markdown: "짧은 요약",
      commit: {
        subject: "docs: 제목",
        body_markdown: "선택 사항",
      },
      pr: {
        title: "docs: 제목",
        body_markdown: "## Summary\n- 변경 요약",
      },
      checks_run: [],
      next_route: "open_pr",
      claimed_scope: {
        files: ["docs/workpacks/example/README.md"],
        endpoints: [],
        routes: [],
        states: [],
        invariants: [],
      },
      changed_files: ["docs/workpacks/example/README.md"],
      tests_touched: [],
      artifacts_written: [".artifacts/doc-gate.log"],
      resolved_doc_finding_ids: ["doc-gate-finding-example"],
      contested_doc_fix_ids: [],
      rebuttals: [],
    };
  }

  if (stage === 2) {
    return {
      result: "done",
      summary_markdown: "짧은 요약",
      commit: {
        subject: "feat: 제목",
        body_markdown: "선택 사항",
      },
      pr: {
        title: "feat: 제목",
        body_markdown: "## Summary\n- 변경 요약",
      },
      checks_run: ["pnpm verify:backend"],
      next_route: "open_pr",
      claimed_scope: {
        files: ["app/api/v1/example/route.ts"],
        endpoints: ["POST /api/v1/example"],
        routes: [],
        states: [],
        invariants: ["documented-state-transition"],
      },
      changed_files: ["app/api/v1/example/route.ts"],
      tests_touched: ["tests/example.backend.test.ts"],
      artifacts_written: [".artifacts/example.log"],
      checklist_updates: [
        {
          id: "accept-backend-example",
          status: "checked",
          evidence_refs: ["pnpm verify:backend", "tests/example.backend.test.ts"],
        },
      ],
      contested_fix_ids: [],
      rebuttals: [],
    };
  }

  if (stage === 4) {
    return {
      result: "done",
      summary_markdown: "짧은 요약",
      commit: {
        subject: "feat: 제목",
        body_markdown: "선택 사항",
      },
      pr: {
        title: "feat: 제목",
        body_markdown: "## Summary\n- 변경 요약",
      },
      checks_run: ["pnpm verify:frontend"],
      next_route: "open_pr",
      claimed_scope: {
        files: ["app/example/page.tsx"],
        endpoints: [],
        routes: ["/example"],
        states: ["loading", "error"],
        invariants: [],
      },
      changed_files: ["app/example/page.tsx"],
      tests_touched: ["tests/example.frontend.test.ts"],
      artifacts_written: [".artifacts/example.log"],
      checklist_updates: [
        {
          id: "accept-frontend-example",
          status: "checked",
          evidence_refs: ["pnpm verify:frontend", "tests/example.frontend.test.ts"],
        },
      ],
      contested_fix_ids: [],
      rebuttals: [],
    };
  }

  return {
    result: "done",
    summary_markdown: "짧은 요약",
    commit: {
      subject: "docs: 제목",
      body_markdown: "선택 사항",
    },
    pr: {
      title: "docs: 제목",
      body_markdown: "## Summary\n- 변경 요약",
    },
    checks_run: ["pnpm lint"],
    next_route: "open_pr",
    claimed_scope: {
      files: ["docs/workpacks/example/README.md"],
      endpoints: [],
      routes: [],
      states: [],
      invariants: [],
    },
    changed_files: ["docs/workpacks/example/README.md"],
    tests_touched: [],
    artifacts_written: [".artifacts/example.log"],
    checklist_updates: [],
    contested_fix_ids: [],
    rebuttals: [],
  };
}

function buildPrompt({
  slice,
  stage,
  subphase = null,
  workItemId,
  dispatch,
  stageResultPath,
  extraPromptSections = [],
}) {
  const normalizedStage = Number(stage);
  const stageResultTemplate =
    normalizedStage === 2 && subphase === "doc_gate_review"
      ? {
          decision: "approve | request_changes",
          body_markdown: "## Review\n- 승인 또는 변경 요청 요약",
          route_back_stage: 2,
          approved_head_sha: "abc123",
          review_scope: {
            scope: "doc_gate",
            checklist_ids: [],
          },
          reviewed_doc_finding_ids: ["doc-gate-finding-example"],
          required_doc_fix_ids: [],
          waived_doc_fix_ids: [],
          findings: [
            {
              file: "docs/workpacks/example/README.md",
              line_hint: 42,
              severity: "critical | major | minor",
              category: "contract | tests | scope | logic | style",
              issue: "발견된 문제 설명",
              suggestion: "구체적인 수정 제안",
            },
          ],
        }
      : [1, 2, 4].includes(normalizedStage)
        ? buildCodeStageResultTemplate(normalizedStage, subphase)
      : {
          decision: "approve | request_changes",
          body_markdown: "## Review\n- 승인 또는 변경 요청 요약 (findings 항목도 여기 요약할 것)",
          route_back_stage: null,
          approved_head_sha: "abc123",
          review_scope: {
            scope: "backend | frontend | closeout",
            checklist_ids: ["accept-example"],
          },
          reviewed_checklist_ids: ["accept-example"],
          required_fix_ids: [],
          waived_fix_ids: [],
          authority_verdict: "pass | conditional-pass | hold",
          reviewed_screen_ids: ["EXAMPLE"],
          authority_report_paths: ["ui/designs/authority/EXAMPLE-authority.md"],
          blocker_count: 0,
          major_count: 0,
          minor_count: 0,
          findings: [
            {
              file: "path/to/file.ts",
              line_hint: 42,
              severity: "critical | major | minor",
              category: "contract | tests | scope | logic | style",
              issue: "발견된 문제 설명",
              suggestion: "구체적인 수정 제안",
            },
          ],
        };

  return [
    "# Homecook OMO-lite Stage Dispatch",
    "",
    `- slice: \`${slice}\``,
    `- stage: \`${stage}\``,
    subphase ? `- subphase: \`${subphase}\`` : null,
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
    dispatch.reviewContext?.body_markdown ? "" : null,
    dispatch.reviewContext?.body_markdown ? "## Prior Review Feedback" : null,
    dispatch.reviewContext?.pr_url ? `- active PR: \`${dispatch.reviewContext.pr_url}\`` : null,
    dispatch.reviewContext?.updated_at
      ? `- reviewed at: \`${dispatch.reviewContext.updated_at}\``
      : null,
    dispatch.reviewContext?.decision
      ? `- previous decision: \`${dispatch.reviewContext.decision}\``
      : null,
    dispatch.reviewContext?.reviewed_checklist_ids?.length
      ? `- previously reviewed checklist ids: \`${dispatch.reviewContext.reviewed_checklist_ids.join(", ")}\``
      : null,
    dispatch.reviewContext?.required_fix_ids?.length
      ? `- required fix ids: \`${dispatch.reviewContext.required_fix_ids.join(", ")}\``
      : null,
    dispatch.reviewContext?.waived_fix_ids?.length
      ? `- waived fix ids: \`${dispatch.reviewContext.waived_fix_ids.join(", ")}\``
      : null,
    dispatch.reviewContext?.body_markdown ?? null,
    "",
    "## Stage Result Output",
    `- Write a JSON file to \`${stageResultPath}\` before finishing the task.`,
    "- The JSON must follow the stage result contract locked in workflow-v2 docs.",
    "- Use this exact JSON shape for this stage:",
    "```json",
    JSON.stringify(stageResultTemplate, null, 2),
    "```",
    normalizedStage === 2 && subphase === "doc_gate_repair"
      ? "- Required keys: result, summary_markdown, commit.subject, pr.title, pr.body_markdown, checks_run, next_route, claimed_scope, changed_files, artifacts_written, resolved_doc_finding_ids, contested_doc_fix_ids, rebuttals"
      : normalizedStage === 2 && subphase === "doc_gate_review"
        ? "- Required keys: decision, body_markdown, route_back_stage, approved_head_sha, review_scope.scope=doc_gate, reviewed_doc_finding_ids, required_doc_fix_ids, waived_doc_fix_ids, findings"
        : normalizedStage === 4 && subphase === "authority_precheck"
          ? "- Required keys: result, summary_markdown, commit.subject, pr.title, pr.body_markdown, checks_run, next_route, claimed_scope, changed_files, tests_touched, artifacts_written, checklist_updates, contested_fix_ids, rebuttals, authority_verdict, reviewed_screen_ids, authority_report_paths, evidence_artifact_refs, blocker_count, major_count, minor_count"
        : [1, 2, 4].includes(normalizedStage)
          ? "- Required keys: result, summary_markdown, commit.subject, pr.title, pr.body_markdown, checks_run, next_route, claimed_scope, changed_files, tests_touched, artifacts_written, checklist_updates, contested_fix_ids, rebuttals"
          : "- Required keys: decision, body_markdown, route_back_stage, approved_head_sha, review_scope, reviewed_checklist_ids, required_fix_ids, waived_fix_ids, authority_verdict, reviewed_screen_ids, authority_report_paths, blocker_count, major_count, minor_count, findings (optional — 문제가 있으면 structured findings 배열을 반드시 포함하세요)",
    ...extraPromptSections,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildRalphPrompt({
  stage,
  goalIds,
  origin,
  reviewContext,
  rebuttalEntry,
  basePrompt,
}) {
  const normalizedGoalIds = Array.isArray(goalIds) ? goalIds.filter(Boolean) : [];

  return [
    `$ralph strict-stage-${stage}`,
    "",
    "## Ralph Loop Goal",
    `- stage: \`${stage}\``,
    `- origin: \`${origin}\``,
    normalizedGoalIds.length > 0
      ? `- target checklist ids: \`${normalizedGoalIds.join(", ")}\``
      : "- target checklist ids: `none`",
    stage === 2
      ? "- completion condition: Stage 2 owned checklist ids all checked, backend verify green, evaluator pass"
      : "- completion condition: Stage 4 owned checklist ids all checked, frontend verify green, evaluator pass",
    reviewContext?.required_fix_ids?.length
      ? `- required fix ids from review: \`${reviewContext.required_fix_ids.join(", ")}\``
      : null,
    rebuttalEntry?.contested_fix_ids?.length
      ? `- prior contested fix ids: \`${rebuttalEntry.contested_fix_ids.join(", ")}\``
      : null,
    "",
    "## Ralph Rules",
    "- Do not stop after a single edit if the stage-owned checklist is still open.",
    "- Do not mark contested fix ids as checked in checklist_updates.",
    "- If a review fix id appears invalid, record it in contested_fix_ids and rebuttals[] instead of silently ignoring it.",
    "- If all remaining review fix ids are contested with evidence, stop editing and hand back a rebuttal bundle for Claude re-review.",
    "",
    reviewContext?.body_markdown ? "## Review Context" : null,
    reviewContext?.body_markdown ?? null,
    "",
    rebuttalEntry?.rebuttals?.length ? "## Prior Rebuttal Context" : null,
    ...(Array.isArray(rebuttalEntry?.rebuttals)
      ? rebuttalEntry.rebuttals.map(
          (entry) =>
            `- \`${entry.fix_id}\`: ${entry.rationale_markdown}${entry.evidence_refs?.length ? ` (evidence: ${entry.evidence_refs.join(", ")})` : ""}`,
        )
      : []),
    "",
    basePrompt,
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
  timeoutMs,
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
      timeout: typeof timeoutMs === "number" && Number.isFinite(timeoutMs) ? timeoutMs : undefined,
      stdio: ["pipe", stdoutFd, stderrFd],
    });
  } finally {
    closeSync(stdoutFd);
    closeSync(stderrFd);
  }
}

export function runOpencode({
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
  timeoutMs,
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
    timeoutMs,
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

export function runClaudeCli({
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
  timeoutMs,
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
    timeoutMs,
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
 * @property {string|null} [subphase]
 * @property {string} [opencodeBin]
 * @property {"opencode"|"claude-cli"} [claudeProvider]
 * @property {string} [claudeBin]
 * @property {string} [claudeModel]
 * @property {"low"|"medium"|"high"} [claudeEffort]
 * @property {string} [agent]
 * @property {Record<string, string>} [environment]
 * @property {string} [homeDir]
 * @property {boolean} [syncStatus]
 * @property {boolean} [persistRuntime]
 * @property {string} [now]
 * @property {number} [retryDelayHours]
 * @property {number} [maxRetryAttempts]
 * @property {"standalone"|"supervisor"} [lifecycleMode]
 * @property {string[]} [extraPromptSections]
 */

/**
 * @param {RunStageWithArtifactsOptions} options
 */
export function runStageWithArtifacts({
  rootDir = process.cwd(),
  slice,
  stage,
  subphase = null,
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
  persistRuntime = true,
  now,
  retryDelayHours = DEFAULT_RETRY_DELAY_HOURS,
  maxRetryAttempts = DEFAULT_MAX_RETRY_ATTEMPTS,
  lifecycleMode = "standalone",
  extraPromptSections = [],
  priorStageResultPath = null,
}) {
  const normalizedSlice = ensureNonEmptyString(slice, "slice");
  const normalizedStage = Number(stage);
  const normalizedSubphase =
    typeof subphase === "string" && subphase.trim().length > 0 ? subphase.trim() : null;
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
  const sessionRole = resolveStageSessionRole(normalizedStage, normalizedSubphase);
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
  const reviewRole =
    normalizedStage === 2 && normalizedSubphase === "doc_gate_review"
      ? "doc_gate"
      : normalizedStage === 2 || normalizedStage === 3
        ? "backend"
        : normalizedStage === 4 || normalizedStage === 5 || normalizedStage === 6
          ? "frontend"
          : null;
  const reviewEntry =
    reviewRole === "doc_gate"
      ? runtimeSnapshot?.state?.doc_gate?.last_review ?? null
      : reviewRole && runtimeSnapshot?.state?.last_review?.[reviewRole]
        ? runtimeSnapshot.state.last_review[reviewRole]
        : null;
  const reviewContext =
    reviewEntry?.decision === "request_changes" && reviewEntry?.body_markdown
      ? {
          decision: reviewEntry.decision,
          body_markdown: reviewEntry.body_markdown,
          pr_url: runtimeSnapshot?.state?.prs?.[reviewRole]?.url ?? null,
          updated_at: reviewEntry.updated_at ?? null,
          findings: Array.isArray(reviewEntry.findings) ? reviewEntry.findings : [],
          reviewed_checklist_ids: Array.isArray(reviewEntry.reviewed_checklist_ids)
            ? reviewEntry.reviewed_checklist_ids
            : [],
          required_fix_ids: Array.isArray(reviewEntry.required_fix_ids)
            ? reviewEntry.required_fix_ids
            : [],
          waived_fix_ids: Array.isArray(reviewEntry.waived_fix_ids)
            ? reviewEntry.waived_fix_ids
            : [],
          reviewed_doc_finding_ids: Array.isArray(reviewEntry.reviewed_doc_finding_ids)
            ? reviewEntry.reviewed_doc_finding_ids
            : [],
          required_doc_fix_ids: Array.isArray(reviewEntry.required_doc_fix_ids)
            ? reviewEntry.required_doc_fix_ids
            : [],
          waived_doc_fix_ids: Array.isArray(reviewEntry.waived_doc_fix_ids)
            ? reviewEntry.waived_doc_fix_ids
            : [],
        }
      : null;
  const rebuttalEntry =
    reviewRole === "doc_gate"
      ? runtimeSnapshot?.state?.doc_gate?.last_rebuttal ?? null
      : reviewRole && runtimeSnapshot?.state?.last_rebuttal?.[reviewRole]
        ? runtimeSnapshot.state.last_rebuttal[reviewRole]
        : null;
  const checklistContract = normalizedStage > 1
    ? readWorkpackChecklistContract({
        rootDir,
        slice: normalizedSlice,
      })
    : null;
  const strictChecklistContractActive =
    normalizedSubphase === null || normalizedSubphase === "implementation"
      ? isChecklistContractActive(checklistContract)
      : false;
  const ownedChecklistIds = strictChecklistContractActive
    ? resolveChecklistIds(resolveOwnedChecklistItems(checklistContract, normalizedStage))
    : [];
  const requiredFixIds = Array.isArray(reviewContext?.required_fix_ids)
    ? reviewContext.required_fix_ids
    : [];
  const ralphGoalIds =
    normalizedStage === 2 && strictChecklistContractActive
      ? requiredFixIds.length > 0
        ? requiredFixIds
        : ownedChecklistIds
      : [];
  const loopMode =
    normalizedStage === 2 && strictChecklistContractActive ? "ralph" : "single_pass";
  const ralphOrigin =
    loopMode === "ralph"
      ? requiredFixIds.length > 0
        ? "review_fix"
        : "initial_stage"
      : null;
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
    subphase: normalizedSubphase,
    claudeBudgetState: resolvedBudget.state,
    sessionId: existingSessionId,
    retryAt,
    attemptCount: retryState?.attempt_count ?? 0,
    reviewContext,
    priorStageResultPath:
      typeof priorStageResultPath === "string" && priorStageResultPath.trim().length > 0
        ? priorStageResultPath.trim()
        : null,
  });
  const executionBinding = resolveExecutionBinding(dispatch, {
    agent,
    providerConfig: activeProviderConfig,
  });
  const storedSessionSelection = resolveStoredSessionSelection(existingSessionEntry);
  const effectiveProviderSelection = resolveEffectiveProviderSelection({
    existingSessionId,
    storedSessionSelection,
    executionBinding,
    activeProviderConfig,
    claudeProviderConfig,
    sessionBinding: dispatch.sessionBinding,
  });
  const basePrompt = buildPrompt({
    slice: normalizedSlice,
    stage: dispatch.stage,
    subphase: normalizedSubphase,
    workItemId,
    dispatch,
    stageResultPath,
    extraPromptSections: [
      ...(dispatch.extraPromptSections ?? []),
      ...(rebuttalEntry?.rebuttals?.length
        ? [
            [
              "## Latest Rebuttal Bundle",
              `- source review stage: \`${rebuttalEntry.source_review_stage ?? "unknown"}\``,
              ...(rebuttalEntry.contested_fix_ids?.length
                ? [`- contested fix ids: \`${rebuttalEntry.contested_fix_ids.join(", ")}\``]
                : []),
              ...rebuttalEntry.rebuttals.map(
                (entry) =>
                  `- \`${entry.fix_id}\`: ${entry.rationale_markdown}${entry.evidence_refs?.length ? ` (evidence: ${entry.evidence_refs.join(", ")})` : ""}`,
              ),
            ].join("\n"),
          ]
        : []),
      ...extraPromptSections,
    ],
  });
  const prompt =
    loopMode === "ralph"
      ? buildRalphPrompt({
          stage: dispatch.stage,
          goalIds: ralphGoalIds,
          origin: ralphOrigin,
          reviewContext,
          rebuttalEntry,
          basePrompt,
        })
      : basePrompt;
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
    storedSessionSelection,
    effectiveProviderSelection,
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
      subphase: normalizedSubphase ?? "implementation",
      loop_mode: loopMode,
      ralph_goal_ids: ralphGoalIds,
      ralph_origin: ralphOrigin,
    },
    executionDir: resolvedExecutionDir,
    stageResultPath,
  };
  let runtimeStartSync = null;

  if (
    persistRuntime &&
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
        subphase: normalizedSubphase ?? "implementation",
        loopMode,
        ralphGoalIds,
        ralphOrigin,
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
        subphase: normalizedSubphase ?? "implementation",
        loop_mode: loopMode,
        ralph_goal_ids: ralphGoalIds,
        ralph_origin: ralphOrigin,
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
        subphase: normalizedSubphase ?? "implementation",
        loop_mode: loopMode,
        ralph_goal_ids: ralphGoalIds,
        ralph_origin: ralphOrigin,
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
        subphase: normalizedSubphase ?? "implementation",
        loop_mode: loopMode,
        ralph_goal_ids: ralphGoalIds,
        ralph_origin: ralphOrigin,
      },
    };
  } else if (hasProviderMismatch) {
    result = {
      artifactDir: targetArtifactDir,
      dispatch: buildStageDispatch({
        slice: normalizedSlice,
        stage: normalizedStage,
        subphase: normalizedSubphase,
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
        subphase: normalizedSubphase ?? "implementation",
        loop_mode: loopMode,
        ralph_goal_ids: ralphGoalIds,
        ralph_origin: ralphOrigin,
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
        execution: {
          ...execution,
          subphase: normalizedSubphase ?? "implementation",
          loop_mode: loopMode,
          ralph_goal_ids: ralphGoalIds,
          ralph_origin: ralphOrigin,
        },
      };
    } catch (error) {
      if (existingSessionId && isSessionUnavailableFailure(error)) {
        result = {
          artifactDir: targetArtifactDir,
          dispatch: buildStageDispatch({
            slice: normalizedSlice,
            stage: normalizedStage,
            subphase: normalizedSubphase,
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
            subphase: normalizedSubphase ?? "implementation",
            loop_mode: loopMode,
            ralph_goal_ids: ralphGoalIds,
            ralph_origin: ralphOrigin,
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
            subphase: normalizedSubphase,
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
            subphase: normalizedSubphase ?? "implementation",
            loop_mode: loopMode,
            ralph_goal_ids: ralphGoalIds,
            ralph_origin: ralphOrigin,
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
            subphase: normalizedSubphase ?? "implementation",
            loop_mode: loopMode,
            ralph_goal_ids: ralphGoalIds,
            ralph_origin: ralphOrigin,
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
      validateStageResult(normalizedStage, stageResult, {
        strictExtendedContract: Boolean(checklistContract && isChecklistContractActive(checklistContract)),
        subphase: normalizedSubphase,
      });
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

  if (persistRuntime && workItemId && runtimeSnapshot) {
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
          model: effectiveProviderSelection.model,
          variant: effectiveProviderSelection.variant,
          effort: effectiveProviderSelection.effort,
          updatedAt: now,
        });
      }
    }

    if (validStageResult) {
      if (lifecycleMode === "supervisor") {
        const stageStateWriter =
          dispatch.stage === 2 && normalizedSubphase === "doc_gate_review"
            ? markReviewPending
            : [1, 2, 4].includes(dispatch.stage)
              ? markStageResultReady
              : markReviewPending;

        nextRuntimeState = stageStateWriter({
          state: nextRuntimeState,
          stage: dispatch.stage,
          artifactDir: targetArtifactDir,
          provider: result.execution.provider ?? executionBinding.provider ?? "opencode",
          sessionRole: dispatch.sessionBinding.role,
          sessionId: result.execution.sessionId ?? existingSessionId,
          stageResultPath,
          verifyCommands: dispatch.verifyCommands,
          prRole:
            dispatch.stage === 1
              ? "docs"
              : dispatch.stage === 2
                ? normalizedSubphase === "implementation"
                  ? "backend"
                  : "docs"
                : dispatch.stage === 4
                  ? "frontend"
                  : dispatch.stage === 3
                    ? "backend"
                    : "frontend",
          startedAt: runtimeStartSync?.state?.execution?.started_at ?? now,
          finishedAt: now,
          subphase: normalizedSubphase ?? "implementation",
          loopMode,
          ralphGoalIds,
          ralphOrigin,
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
