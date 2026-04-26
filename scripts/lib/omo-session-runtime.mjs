import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { readStageResult, validateStageResult } from "./omo-stage-result.mjs";

export const DEFAULT_RETRY_DELAY_HOURS = 5;
export const DEFAULT_MAX_RETRY_ATTEMPTS = 3;
export const OMO_SESSION_ROLE_TO_AGENT = {
  claude_primary: "athena",
  codex_primary: "hephaestus",
};
const OMO_EXECUTION_SUBPHASES = new Set([
  "doc_gate_check",
  "doc_gate_repair",
  "doc_gate_review",
  "authority_precheck",
  "final_authority_gate",
  "implementation",
]);
const OMO_RUNTIME_PHASES = new Set([
  "stage_running",
  "stage_result_ready",
  "verify_pending",
  "commit_pending",
  "push_pending",
  "pr_pending",
  "wait",
  "review_pending",
  "closeout_reconcile_check",
  "closeout_reconcile_repair",
  "closeout_reconcile_recheck",
  "merge_pending",
  "escalated",
  "done",
]);
const OMO_RUNTIME_ACTIONS = new Set([
  "run_stage",
  "finalize_stage",
  "poll_ci",
  "run_review",
  "merge_pr",
  "noop",
]);

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

function normalizePhase(phase) {
  if (typeof phase !== "string" || phase.trim().length === 0) {
    return null;
  }

  const normalized = phase.trim();
  return OMO_RUNTIME_PHASES.has(normalized) ? normalized : null;
}

function normalizeNextAction(nextAction) {
  if (typeof nextAction !== "string" || nextAction.trim().length === 0) {
    return "noop";
  }

  const normalized = nextAction.trim();
  return OMO_RUNTIME_ACTIONS.has(normalized) ? normalized : "noop";
}

function normalizeExecution(execution) {
  if (!execution || typeof execution !== "object") {
    return null;
  }

  return {
    provider:
      typeof execution.provider === "string" && execution.provider.trim().length > 0
        ? execution.provider.trim()
        : null,
    session_role:
      typeof execution.session_role === "string" && execution.session_role.trim().length > 0
        ? execution.session_role.trim()
        : null,
    session_id:
      typeof execution.session_id === "string" && execution.session_id.trim().length > 0
        ? execution.session_id.trim()
        : null,
    artifact_dir:
      typeof execution.artifact_dir === "string" && execution.artifact_dir.trim().length > 0
        ? execution.artifact_dir.trim()
        : null,
    stage_result_path:
      typeof execution.stage_result_path === "string" && execution.stage_result_path.trim().length > 0
        ? execution.stage_result_path.trim()
        : null,
    prior_stage_result_path:
      typeof execution.prior_stage_result_path === "string" && execution.prior_stage_result_path.trim().length > 0
        ? execution.prior_stage_result_path.trim()
        : null,
    started_at:
      typeof execution.started_at === "string" && execution.started_at.trim().length > 0
        ? execution.started_at.trim()
        : null,
    finished_at:
      typeof execution.finished_at === "string" && execution.finished_at.trim().length > 0
        ? execution.finished_at.trim()
        : null,
    verify_commands: Array.isArray(execution.verify_commands)
      ? execution.verify_commands
          .filter((entry) => typeof entry === "string" && entry.trim().length > 0)
          .map((entry) => entry.trim())
      : [],
    verify_bucket:
      typeof execution.verify_bucket === "string" && execution.verify_bucket.trim().length > 0
        ? execution.verify_bucket.trim()
        : null,
    commit_sha:
      typeof execution.commit_sha === "string" && execution.commit_sha.trim().length > 0
        ? execution.commit_sha.trim()
        : null,
    pr_role:
      typeof execution.pr_role === "string" && execution.pr_role.trim().length > 0
        ? execution.pr_role.trim()
        : null,
    subphase:
      typeof execution.subphase === "string" && OMO_EXECUTION_SUBPHASES.has(execution.subphase.trim())
        ? execution.subphase.trim()
        : "implementation",
    loop_mode:
      typeof execution.loop_mode === "string" && execution.loop_mode.trim().length > 0
        ? execution.loop_mode.trim()
        : "single_pass",
    ralph_goal_ids: Array.isArray(execution.ralph_goal_ids)
      ? execution.ralph_goal_ids
          .filter((entry) => typeof entry === "string" && entry.trim().length > 0)
          .map((entry) => entry.trim())
      : [],
    ralph_origin:
      typeof execution.ralph_origin === "string" && execution.ralph_origin.trim().length > 0
        ? execution.ralph_origin.trim()
        : null,
  };
}

function inferActionFromWait(wait) {
  if (!wait?.kind) {
    return "noop";
  }

  if (wait.kind === "ci") {
    return "poll_ci";
  }

  if (wait.kind === "ready_for_next_stage" || wait.kind === "blocked_retry") {
    return "run_stage";
  }

  return "noop";
}

function inferPhaseFromWait(wait) {
  return wait?.kind ? "wait" : null;
}

function inferActiveStage({
  activeStage,
  wait,
  currentStage,
  blockedStage,
  lastCompletedStage,
}) {
  if (Number.isInteger(activeStage) && activeStage >= 1 && activeStage <= 6) {
    return activeStage;
  }

  if (Number.isInteger(wait?.stage) && wait.stage >= 1 && wait.stage <= 6) {
    return wait.stage;
  }

  if (Number.isInteger(currentStage) && currentStage >= 1 && currentStage <= 6) {
    return currentStage;
  }

  if (Number.isInteger(blockedStage) && blockedStage >= 1 && blockedStage <= 6) {
    return blockedStage;
  }

  if (Number.isInteger(lastCompletedStage) && lastCompletedStage >= 1 && lastCompletedStage <= 6) {
    return lastCompletedStage;
  }

  return null;
}

function resolveExpectedSessionRole(stage, subphase = "implementation") {
  if (stage === 2 && subphase === "doc_gate_repair") {
    return "claude_primary";
  }

  if (stage === 2 && subphase === "doc_gate_review") {
    return "codex_primary";
  }

  if (stage === 5 && subphase === "final_authority_gate") {
    return "claude_primary";
  }

  if ([1, 3, 4].includes(stage)) {
    return "claude_primary";
  }

  return "codex_primary";
}

function normalizeNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function normalizeNonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizeUsageSummary(usage) {
  if (!usage || typeof usage !== "object") {
    return null;
  }

  const inputTokens = normalizeNonNegativeInteger(usage.input_tokens);
  const outputTokens = normalizeNonNegativeInteger(usage.output_tokens);
  const explicitTotalTokens = normalizeNonNegativeInteger(usage.total_tokens);

  if (inputTokens === null && outputTokens === null && explicitTotalTokens === null) {
    return null;
  }

  const normalizedInputTokens = inputTokens ?? 0;
  const normalizedOutputTokens = outputTokens ?? 0;

  return {
    input_tokens: normalizedInputTokens,
    output_tokens: normalizedOutputTokens,
    total_tokens: explicitTotalTokens ?? normalizedInputTokens + normalizedOutputTokens,
  };
}

function addUsageSummaries(baseUsage, deltaUsage) {
  const normalizedBase = normalizeUsageSummary(baseUsage);
  const normalizedDelta = normalizeUsageSummary(deltaUsage);

  if (!normalizedBase) {
    return normalizedDelta;
  }

  if (!normalizedDelta) {
    return normalizedBase;
  }

  return {
    input_tokens: normalizedBase.input_tokens + normalizedDelta.input_tokens,
    output_tokens: normalizedBase.output_tokens + normalizedDelta.output_tokens,
    total_tokens: normalizedBase.total_tokens + normalizedDelta.total_tokens,
  };
}

function getWorktreeDirtyState(worktreePath) {
  if (typeof worktreePath !== "string" || worktreePath.trim().length === 0 || !existsSync(worktreePath)) {
    return {
      dirty: false,
      changedFiles: [],
    };
  }

  const result = spawnSync("git", ["status", "--porcelain"], {
    cwd: worktreePath,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    return {
      dirty: false,
      changedFiles: [],
    };
  }

  const lines = (result.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);

  return {
    dirty: lines.length > 0,
    changedFiles: lines
      .map((line) => {
        const match = line.match(/^[^\s]{1,2}\s+(.*)$/);
        const path = match?.[1]?.trim() ?? line;
        const renameMatch = path.match(/->\s+(.+)$/);
        return renameMatch ? renameMatch[1].trim() : path;
      })
      .filter(Boolean),
  };
}

function hasValidLegacyStageResult({ artifactDir, stage }) {
  if (typeof artifactDir !== "string" || artifactDir.trim().length === 0) {
    return false;
  }

  if (!artifactDir.includes(`-stage-${stage}`)) {
    return false;
  }

  try {
    const stageResult = readStageResult(artifactDir);
    if (!stageResult) {
      return false;
    }

    validateStageResult(stage, stageResult);
    return true;
  } catch {
    return false;
  }
}

function normalizeSessionEntry(role, entry) {
  const sessionId =
    entry && typeof entry.session_id === "string" && entry.session_id.trim().length > 0
      ? entry.session_id.trim()
      : null;
  const generation =
    sessionId
      ? Number.isInteger(entry?.generation) && entry.generation >= 1
        ? entry.generation
        : 1
      : 0;
  const lastUsage = normalizeUsageSummary(entry?.last_usage);
  const cumulativeUsage = normalizeUsageSummary(entry?.cumulative_usage);
  const lastCostUsd = normalizeNonNegativeNumber(entry?.last_cost_usd);
  const cumulativeCostUsd = normalizeNonNegativeNumber(entry?.cumulative_cost_usd);
  const runCount =
    sessionId
      ? Number.isInteger(entry?.run_count) && entry.run_count >= 0
        ? entry.run_count
        : 0
      : 0;

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
    model:
      entry && typeof entry.model === "string" && entry.model.trim().length > 0
        ? entry.model.trim()
        : null,
    variant:
      entry && typeof entry.variant === "string" && entry.variant.trim().length > 0
        ? entry.variant.trim()
        : null,
    effort:
      entry && typeof entry.effort === "string" && entry.effort.trim().length > 0
        ? entry.effort.trim()
        : null,
    updated_at:
      entry && typeof entry.updated_at === "string" && entry.updated_at.trim().length > 0
        ? entry.updated_at.trim()
        : null,
    generation,
    run_count: runCount,
    last_usage: lastUsage,
    cumulative_usage: cumulativeUsage,
    last_cost_usd: lastCostUsd,
    cumulative_cost_usd: cumulativeCostUsd,
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
      closeout: null,
    };
  }

  return {
    docs: normalizePullRequestEntry(prs.docs),
    backend: normalizePullRequestEntry(prs.backend),
    frontend: normalizePullRequestEntry(prs.frontend),
    closeout: normalizePullRequestEntry(prs.closeout),
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
    body_markdown:
      typeof entry.body_markdown === "string" && entry.body_markdown.trim().length > 0
        ? entry.body_markdown.trim()
        : null,
    findings: Array.isArray(entry.findings) ? entry.findings : [],
    review_scope:
      entry.review_scope && typeof entry.review_scope === "object" && !Array.isArray(entry.review_scope)
        ? {
            scope:
              typeof entry.review_scope.scope === "string" && entry.review_scope.scope.trim().length > 0
                ? entry.review_scope.scope.trim()
                : null,
            checklist_ids: Array.isArray(entry.review_scope.checklist_ids)
              ? entry.review_scope.checklist_ids
                  .filter((value) => typeof value === "string" && value.trim().length > 0)
                  .map((value) => value.trim())
              : [],
          }
        : {
            scope: null,
            checklist_ids: [],
          },
    reviewed_checklist_ids: Array.isArray(entry.reviewed_checklist_ids)
      ? entry.reviewed_checklist_ids
          .filter((value) => typeof value === "string" && value.trim().length > 0)
          .map((value) => value.trim())
      : [],
    required_fix_ids: Array.isArray(entry.required_fix_ids)
      ? entry.required_fix_ids
          .filter((value) => typeof value === "string" && value.trim().length > 0)
          .map((value) => value.trim())
      : [],
    waived_fix_ids: Array.isArray(entry.waived_fix_ids)
      ? entry.waived_fix_ids
          .filter((value) => typeof value === "string" && value.trim().length > 0)
          .map((value) => value.trim())
      : [],
    authority_verdict:
      typeof entry.authority_verdict === "string" && entry.authority_verdict.trim().length > 0
        ? entry.authority_verdict.trim()
        : null,
    reviewed_screen_ids: Array.isArray(entry.reviewed_screen_ids)
      ? entry.reviewed_screen_ids
          .filter((value) => typeof value === "string" && value.trim().length > 0)
          .map((value) => value.trim())
      : [],
    authority_report_paths: Array.isArray(entry.authority_report_paths)
      ? entry.authority_report_paths
          .filter((value) => typeof value === "string" && value.trim().length > 0)
          .map((value) => value.trim())
      : [],
    blocker_count:
      typeof entry.blocker_count === "number" && entry.blocker_count >= 0
        ? entry.blocker_count
        : null,
    major_count:
      typeof entry.major_count === "number" && entry.major_count >= 0
        ? entry.major_count
        : null,
    minor_count:
      typeof entry.minor_count === "number" && entry.minor_count >= 0
        ? entry.minor_count
        : null,
    source_review_stage: Number.isInteger(entry.source_review_stage) ? entry.source_review_stage : null,
    ping_pong_rounds:
      typeof entry.ping_pong_rounds === "number" && entry.ping_pong_rounds >= 0
        ? entry.ping_pong_rounds
        : 0,
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

function normalizeRebuttalEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  return {
    source_review_stage: Number.isInteger(entry.source_review_stage) ? entry.source_review_stage : null,
    contested_fix_ids: Array.isArray(entry.contested_fix_ids)
      ? entry.contested_fix_ids
          .filter((value) => typeof value === "string" && value.trim().length > 0)
          .map((value) => value.trim())
      : [],
    rebuttals: Array.isArray(entry.rebuttals)
      ? entry.rebuttals
          .filter((value) => value && typeof value === "object" && !Array.isArray(value))
          .map((value) => ({
            fix_id:
              typeof value.fix_id === "string" && value.fix_id.trim().length > 0
                ? value.fix_id.trim()
                : null,
            rationale_markdown:
              typeof value.rationale_markdown === "string" && value.rationale_markdown.trim().length > 0
                ? value.rationale_markdown.trim()
                : null,
            evidence_refs: Array.isArray(value.evidence_refs)
              ? value.evidence_refs
                  .filter((entry) => typeof entry === "string" && entry.trim().length > 0)
                  .map((entry) => entry.trim())
              : [],
          }))
          .filter((value) => value.fix_id && value.rationale_markdown)
      : [],
    updated_at:
      typeof entry.updated_at === "string" && entry.updated_at.trim().length > 0
        ? entry.updated_at.trim()
        : null,
  };
}

function normalizeLastRebuttal(lastRebuttal) {
  if (!lastRebuttal || typeof lastRebuttal !== "object") {
    return {
      backend: null,
      frontend: null,
    };
  }

  return {
    backend: normalizeRebuttalEntry(lastRebuttal.backend),
    frontend: normalizeRebuttalEntry(lastRebuttal.frontend),
  };
}

function normalizeDocGateFinding(entry, { fallbackId = null } = {}) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }

  const evidencePaths = Array.isArray(entry.evidence_paths)
    ? entry.evidence_paths
        .filter((value) => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim())
    : typeof entry.file === "string" && entry.file.trim().length > 0
      ? [entry.file.trim()]
      : [];
  const normalizedFinding = {
    id:
      typeof entry.id === "string" && entry.id.trim().length > 0
        ? entry.id.trim()
        : typeof entry.fix_id === "string" && entry.fix_id.trim().length > 0
          ? entry.fix_id.trim()
          : typeof fallbackId === "string" && fallbackId.trim().length > 0
            ? fallbackId.trim()
            : null,
    category:
      typeof entry.category === "string" && entry.category.trim().length > 0
        ? entry.category.trim()
        : null,
    severity:
      typeof entry.severity === "string" && entry.severity.trim().length > 0
        ? entry.severity.trim()
        : null,
    message:
      typeof entry.message === "string" && entry.message.trim().length > 0
        ? entry.message.trim()
        : typeof entry.issue === "string" && entry.issue.trim().length > 0
          ? entry.issue.trim()
          : null,
    evidence_paths: evidencePaths,
    remediation_hint:
      typeof entry.remediation_hint === "string" && entry.remediation_hint.trim().length > 0
        ? entry.remediation_hint.trim()
        : typeof entry.suggestion === "string" && entry.suggestion.trim().length > 0
          ? entry.suggestion.trim()
          : null,
    fixable: typeof entry.fixable === "boolean" ? entry.fixable : true,
  };

  if (
    normalizedFinding.id === null &&
    normalizedFinding.message === null &&
    normalizedFinding.evidence_paths.length === 0 &&
    normalizedFinding.remediation_hint === null
  ) {
    return null;
  }

  return normalizedFinding;
}

function normalizeDocGateReviewEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }

  const reviewedDocFindingIds = Array.isArray(entry.reviewed_doc_finding_ids)
    ? entry.reviewed_doc_finding_ids
        .filter((value) => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim())
    : [];
  const requiredDocFixIds = Array.isArray(entry.required_doc_fix_ids)
    ? entry.required_doc_fix_ids
        .filter((value) => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim())
    : [];
  const waivedDocFixIds = Array.isArray(entry.waived_doc_fix_ids)
    ? entry.waived_doc_fix_ids
        .filter((value) => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim())
    : [];
  const findingFallbackIds = requiredDocFixIds.length > 0 ? requiredDocFixIds : reviewedDocFindingIds;

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
    body_markdown:
      typeof entry.body_markdown === "string" && entry.body_markdown.trim().length > 0
        ? entry.body_markdown.trim()
        : null,
    findings: Array.isArray(entry.findings)
      ? entry.findings
          .map((value, index) =>
            normalizeDocGateFinding(value, {
              fallbackId:
                findingFallbackIds[index] ??
                (findingFallbackIds.length === 1 ? findingFallbackIds[0] : null),
            }),
          )
          .filter(Boolean)
      : [],
    reviewed_doc_finding_ids: reviewedDocFindingIds,
    required_doc_fix_ids: requiredDocFixIds,
    waived_doc_fix_ids: waivedDocFixIds,
    source_review_stage: Number.isInteger(entry.source_review_stage) ? entry.source_review_stage : null,
    ping_pong_rounds:
      typeof entry.ping_pong_rounds === "number" && entry.ping_pong_rounds >= 0
        ? entry.ping_pong_rounds
        : 0,
    updated_at:
      typeof entry.updated_at === "string" && entry.updated_at.trim().length > 0
        ? entry.updated_at.trim()
        : null,
  };
}

function normalizeDocGateRebuttalEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }

  return {
    source_review_stage: Number.isInteger(entry.source_review_stage) ? entry.source_review_stage : null,
    contested_doc_fix_ids: Array.isArray(entry.contested_doc_fix_ids)
      ? entry.contested_doc_fix_ids
          .filter((value) => typeof value === "string" && value.trim().length > 0)
          .map((value) => value.trim())
      : [],
    rebuttals: Array.isArray(entry.rebuttals)
      ? entry.rebuttals
          .filter((value) => value && typeof value === "object" && !Array.isArray(value))
          .map((value) => ({
            fix_id:
              typeof value.fix_id === "string" && value.fix_id.trim().length > 0
                ? value.fix_id.trim()
                : null,
            rationale_markdown:
              typeof value.rationale_markdown === "string" && value.rationale_markdown.trim().length > 0
                ? value.rationale_markdown.trim()
                : null,
            evidence_refs: Array.isArray(value.evidence_refs)
              ? value.evidence_refs
                  .filter((entry) => typeof entry === "string" && entry.trim().length > 0)
                  .map((entry) => entry.trim())
              : [],
          }))
          .filter((value) => value.fix_id && value.rationale_markdown)
      : [],
    updated_at:
      typeof entry.updated_at === "string" && entry.updated_at.trim().length > 0
        ? entry.updated_at.trim()
        : null,
  };
}

function normalizeDocGate(docGate) {
  if (!docGate || typeof docGate !== "object" || Array.isArray(docGate)) {
    return {
      status: null,
      round: 0,
      source_master_sha: null,
      artifact_dir: null,
      result_path: null,
      repair_branch: null,
      repair_pr: null,
      findings: [],
      last_review: null,
      last_rebuttal: null,
      updated_at: null,
    };
  }

  return {
    status:
      typeof docGate.status === "string" && docGate.status.trim().length > 0
        ? docGate.status.trim()
        : null,
    round:
      typeof docGate.round === "number" && docGate.round >= 0
        ? docGate.round
        : 0,
    source_master_sha:
      typeof docGate.source_master_sha === "string" && docGate.source_master_sha.trim().length > 0
        ? docGate.source_master_sha.trim()
        : null,
    artifact_dir:
      typeof docGate.artifact_dir === "string" && docGate.artifact_dir.trim().length > 0
        ? docGate.artifact_dir.trim()
        : null,
    result_path:
      typeof docGate.result_path === "string" && docGate.result_path.trim().length > 0
        ? docGate.result_path.trim()
        : null,
    repair_branch:
      typeof docGate.repair_branch === "string" && docGate.repair_branch.trim().length > 0
        ? docGate.repair_branch.trim()
        : null,
    repair_pr: normalizePullRequestEntry(docGate.repair_pr),
    findings: Array.isArray(docGate.findings)
      ? docGate.findings.map((value) => normalizeDocGateFinding(value)).filter(Boolean)
      : [],
    last_review: normalizeDocGateReviewEntry(docGate.last_review),
    last_rebuttal: normalizeDocGateRebuttalEntry(docGate.last_rebuttal),
    updated_at:
      typeof docGate.updated_at === "string" && docGate.updated_at.trim().length > 0
        ? docGate.updated_at.trim()
        : null,
  };
}

function normalizeDesignAuthority(designAuthority) {
  if (!designAuthority || typeof designAuthority !== "object" || Array.isArray(designAuthority)) {
    return {
      status: null,
      ui_risk: null,
      anchor_screens: [],
      required_screens: [],
      authority_required: false,
      authority_report_paths: [],
      evidence_artifact_refs: [],
      authority_verdict: null,
      blocker_count: null,
      major_count: null,
      minor_count: null,
      reviewed_screen_ids: [],
      source_stage: null,
      updated_at: null,
    };
  }

  return {
    status:
      typeof designAuthority.status === "string" && designAuthority.status.trim().length > 0
        ? designAuthority.status.trim()
        : null,
    ui_risk:
      typeof designAuthority.ui_risk === "string" && designAuthority.ui_risk.trim().length > 0
        ? designAuthority.ui_risk.trim()
        : null,
    anchor_screens: Array.isArray(designAuthority.anchor_screens)
      ? designAuthority.anchor_screens
          .filter((value) => typeof value === "string" && value.trim().length > 0)
          .map((value) => value.trim())
      : [],
    required_screens: Array.isArray(designAuthority.required_screens)
      ? designAuthority.required_screens
          .filter((value) => typeof value === "string" && value.trim().length > 0)
          .map((value) => value.trim())
      : [],
    authority_required: typeof designAuthority.authority_required === "boolean"
      ? designAuthority.authority_required
      : false,
    authority_report_paths: Array.isArray(designAuthority.authority_report_paths)
      ? designAuthority.authority_report_paths
          .filter((value) => typeof value === "string" && value.trim().length > 0)
          .map((value) => value.trim())
      : [],
    evidence_artifact_refs: Array.isArray(designAuthority.evidence_artifact_refs)
      ? designAuthority.evidence_artifact_refs
          .filter((value) => typeof value === "string" && value.trim().length > 0)
          .map((value) => value.trim())
      : [],
    authority_verdict:
      typeof designAuthority.authority_verdict === "string" && designAuthority.authority_verdict.trim().length > 0
        ? designAuthority.authority_verdict.trim()
        : null,
    blocker_count:
      typeof designAuthority.blocker_count === "number" && designAuthority.blocker_count >= 0
        ? designAuthority.blocker_count
        : null,
    major_count:
      typeof designAuthority.major_count === "number" && designAuthority.major_count >= 0
        ? designAuthority.major_count
        : null,
    minor_count:
      typeof designAuthority.minor_count === "number" && designAuthority.minor_count >= 0
        ? designAuthority.minor_count
        : null,
    reviewed_screen_ids: Array.isArray(designAuthority.reviewed_screen_ids)
      ? designAuthority.reviewed_screen_ids
          .filter((value) => typeof value === "string" && value.trim().length > 0)
          .map((value) => value.trim())
      : [],
    source_stage: Number.isInteger(designAuthority.source_stage) ? designAuthority.source_stage : null,
    updated_at:
      typeof designAuthority.updated_at === "string" && designAuthority.updated_at.trim().length > 0
        ? designAuthority.updated_at.trim()
        : null,
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
    version: 2,
    work_item_id: workItemId,
    slice: slice ?? null,
    repo_root: resolve(rootDir),
    active_stage: null,
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
    phase: null,
    next_action: "noop",
    execution: null,
    last_review: normalizeLastReview(null),
    last_rebuttal: normalizeLastRebuttal(null),
    doc_gate: normalizeDocGate(null),
    design_authority: normalizeDesignAuthority(null),
    recovery: null,
  };
}

function normalizeRuntimeState(rawState, { rootDir, workItemId, slice }) {
  const base = baseRuntimeState({ rootDir, workItemId, slice });
  const runtime = rawState && typeof rawState === "object" ? rawState : {};
  const wait = normalizeWait(runtime.wait);
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
  const currentStage =
    Number.isInteger(runtime.current_stage) && runtime.current_stage >= 1 && runtime.current_stage <= 6
      ? runtime.current_stage
      : base.current_stage;
  const activeStage = inferActiveStage({
    activeStage:
      Number.isInteger(runtime.active_stage) && runtime.active_stage >= 1 && runtime.active_stage <= 6
        ? runtime.active_stage
        : null,
    wait,
    currentStage,
    blockedStage,
    lastCompletedStage,
  });
  const recovery = normalizeRecovery(runtime.recovery);
  const storedPhase = normalizePhase(runtime.phase);
  let normalized = {
    ...base,
    version: Number.isInteger(runtime.version) ? runtime.version : base.version,
    slice:
      typeof runtime.slice === "string" && runtime.slice.trim().length > 0
        ? runtime.slice.trim()
        : base.slice,
    active_stage: activeStage,
    current_stage: activeStage ?? currentStage,
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
    wait,
    phase: storedPhase ?? inferPhaseFromWait(wait),
    next_action: normalizeNextAction(runtime.next_action ?? inferActionFromWait(wait)),
    execution: normalizeExecution(runtime.execution),
    last_review: normalizeLastReview(runtime.last_review),
    last_rebuttal: normalizeLastRebuttal(runtime.last_rebuttal),
    doc_gate: normalizeDocGate(runtime.doc_gate),
    design_authority: normalizeDesignAuthority(runtime.design_authority),
    recovery,
  };

  if (storedPhase === "stage_running" && normalized.wait?.kind) {
    normalized = {
      ...normalized,
      lock: null,
      phase: "wait",
      next_action: inferActionFromWait(normalized.wait),
    };
  }

  if (!normalized.phase) {
  const codeStage =
    Number.isInteger(normalized.active_stage) && [1, 2, 4].includes(normalized.active_stage)
      ? normalized.active_stage
      : null;
  const docGateReviewPending =
    normalized.active_stage === 2 &&
    normalized.doc_gate?.status === "awaiting_review" &&
    !normalized.execution;
  const dirtyState = getWorktreeDirtyState(normalized.workspace?.path);
  const hasValidStageResult =
      !docGateReviewPending &&
      codeStage !== null &&
      hasValidLegacyStageResult({
        artifactDir: normalized.last_artifact_dir,
        stage: codeStage,
      });
    const prRole =
      codeStage === 1 ? "docs" : codeStage === 2 ? "backend" : codeStage === 4 ? "frontend" : null;
    const hasActivePr = prRole ? Boolean(normalized.prs?.[prRole]?.url) : false;

    if (normalized.wait?.kind) {
      normalized = {
        ...normalized,
        phase: "wait",
        next_action: inferActionFromWait(normalized.wait),
      };
    } else if (normalized.recovery?.kind) {
      normalized = {
        ...normalized,
        phase: "escalated",
        next_action: "noop",
      };
    } else if (hasValidStageResult && !hasActivePr) {
      normalized = {
        ...normalized,
        phase: "stage_result_ready",
        next_action: "finalize_stage",
        execution: normalizeExecution({
          ...normalized.execution,
          artifact_dir: normalized.last_artifact_dir,
          stage_result_path: normalized.last_artifact_dir
            ? resolve(normalized.last_artifact_dir, "stage-result.json")
            : null,
          session_role: resolveExpectedSessionRole(
            codeStage,
            normalized.execution?.subphase ?? "implementation",
          ),
          session_id:
            resolveExpectedSessionRole(
              codeStage,
              normalized.execution?.subphase ?? "implementation",
            ) === "claude_primary"
              ? normalized.sessions.claude_primary.session_id
              : normalized.sessions.codex_primary.session_id,
          provider:
            resolveExpectedSessionRole(
              codeStage,
              normalized.execution?.subphase ?? "implementation",
            ) === "claude_primary"
              ? normalized.sessions.claude_primary.provider
              : normalized.sessions.codex_primary.provider,
          pr_role: prRole,
          subphase: "implementation",
        }),
      };
    } else if (dirtyState.dirty) {
      normalized = {
        ...normalized,
        phase: "escalated",
        next_action: "noop",
        recovery:
          normalized.recovery ??
          normalizeRecovery({
            kind: "legacy_dirty_worktree",
            stage: normalized.active_stage,
            branch: normalized.workspace?.branch_role,
            reason: hasValidStageResult ? "dirty worktree with legacy stage result" : "dirty worktree without stage result",
            artifact_dir: normalized.last_artifact_dir,
            changed_files: dirtyState.changedFiles,
            salvage_candidate: dirtyState.changedFiles.length > 0,
            updated_at: new Date().toISOString(),
          }),
      };
    } else if (normalized.last_completed_stage >= 6) {
      normalized = {
        ...normalized,
        phase: "done",
        next_action: "noop",
      };
    }
  }

  if (normalized.phase === "wait") {
    normalized = {
      ...normalized,
      next_action: inferActionFromWait(normalized.wait),
    };
  }

  return normalized;
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
  preserveActiveLock = true,
}) {
  const normalizedWorkItemId = ensureNonEmptyString(workItemId, "workItemId");
  const runtimeDir = resolveRuntimeDirectory(rootDir);
  const runtimePath = resolveRuntimePath({
    rootDir,
    workItemId: normalizedWorkItemId,
  });

  mkdirSync(runtimeDir, { recursive: true });
  let normalizedState = normalizeRuntimeState(state, {
    rootDir,
    workItemId: normalizedWorkItemId,
  });
  const currentLock = existsSync(runtimePath) ? normalizeLock(readJson(runtimePath).lock) : null;
  if (preserveActiveLock && normalizedState.phase === "stage_running" && !normalizedState.lock && currentLock) {
    normalizedState = {
      ...normalizedState,
      lock: currentLock,
    };
  }

  writeFileSync(runtimePath, `${JSON.stringify(normalizedState, null, 2)}\n`);

  return {
    runtimePath,
    state: normalizedState,
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
  model,
  variant,
  effort,
  updatedAt,
  usage = null,
  totalCostUsd = null,
  recordRun = false,
}) {
  const normalizedRole = ensureNonEmptyString(role, "role");
  const normalizedSessionId = ensureNonEmptyString(sessionId, "sessionId");
  const normalizedProvider = ensureNonEmptyString(provider, "provider");
  const previousEntry = normalizeSessionEntry(normalizedRole, state.sessions?.[normalizedRole] ?? null);
  const normalizedUsage = normalizeUsageSummary(usage);
  const normalizedTotalCostUsd = normalizeNonNegativeNumber(totalCostUsd);
  const shouldRecordRun =
    recordRun || normalizedUsage !== null || normalizedTotalCostUsd !== null;
  const sessionChanged =
    typeof previousEntry.session_id === "string" &&
    previousEntry.session_id.length > 0 &&
    previousEntry.session_id !== normalizedSessionId;
  const baseGeneration = sessionChanged
    ? previousEntry.generation + 1
    : previousEntry.generation > 0
      ? previousEntry.generation
      : 1;
  const nextRunCount =
    shouldRecordRun
      ? sessionChanged
        ? 1
        : previousEntry.run_count + 1
      : sessionChanged
        ? 0
        : previousEntry.run_count;
  const nextLastUsage = normalizedUsage ?? (sessionChanged ? null : previousEntry.last_usage);
  const nextCumulativeUsage =
    shouldRecordRun && normalizedUsage
      ? addUsageSummaries(sessionChanged ? null : previousEntry.cumulative_usage, normalizedUsage)
      : sessionChanged
        ? null
        : previousEntry.cumulative_usage;
  const nextLastCostUsd =
    normalizedTotalCostUsd ?? (sessionChanged ? null : previousEntry.last_cost_usd);
  const nextCumulativeCostUsd =
    shouldRecordRun && normalizedTotalCostUsd !== null
      ? (sessionChanged ? 0 : previousEntry.cumulative_cost_usd ?? 0) + normalizedTotalCostUsd
      : sessionChanged
        ? null
        : previousEntry.cumulative_cost_usd;

  return {
    ...state,
    sessions: {
      ...state.sessions,
      [normalizedRole]: {
        session_id: normalizedSessionId,
        provider: normalizedProvider,
        agent:
          typeof agent === "string" && agent.trim().length > 0
            ? agent.trim()
            : OMO_SESSION_ROLE_TO_AGENT[normalizedRole] ?? null,
        model:
          typeof model === "string" && model.trim().length > 0
            ? model.trim()
            : null,
        variant:
          typeof variant === "string" && variant.trim().length > 0
            ? variant.trim()
            : null,
        effort:
          typeof effort === "string" && effort.trim().length > 0
            ? effort.trim()
            : null,
        updated_at: toIsoString(updatedAt),
        generation: baseGeneration,
        run_count: nextRunCount,
        last_usage: nextLastUsage,
        cumulative_usage: nextCumulativeUsage,
        last_cost_usd: nextLastCostUsd,
        cumulative_cost_usd: nextCumulativeCostUsd,
      },
    },
  };
}

export function setExecutionState({
  state,
  activeStage,
  phase,
  nextAction,
  artifactDir,
  execution,
  clearRecovery = false,
}) {
  const normalizedActiveStage =
    Number.isInteger(Number(activeStage)) && Number(activeStage) >= 1 && Number(activeStage) <= 6
      ? Number(activeStage)
      : state.active_stage;
  const normalizedPhase = normalizePhase(phase) ?? state.phase ?? null;

  return {
    ...state,
    active_stage: normalizedActiveStage ?? null,
    current_stage: normalizedActiveStage ?? null,
    blocked_stage: null,
    retry: null,
    wait: normalizedPhase === "wait" ? state.wait ?? null : null,
    last_artifact_dir: artifactDir ?? state.last_artifact_dir,
    phase: normalizedPhase,
    next_action: normalizeNextAction(nextAction),
    execution: normalizeExecution({
      ...(state.execution ?? {}),
      ...(execution ?? {}),
      artifact_dir: artifactDir ?? execution?.artifact_dir ?? state.execution?.artifact_dir ?? state.last_artifact_dir,
    }),
    recovery: clearRecovery ? null : state.recovery,
  };
}

export function markStageRunning({
  state,
  stage,
  artifactDir,
  provider,
  sessionRole,
  sessionId,
  stageResultPath,
  verifyCommands = [],
  prRole,
  startedAt,
  subphase = "implementation",
  loopMode = "single_pass",
  ralphGoalIds = [],
  ralphOrigin = null,
}) {
  return setExecutionState({
    state,
    activeStage: stage,
    phase: "stage_running",
    nextAction: "run_stage",
    artifactDir,
    execution: {
      provider,
      session_role: sessionRole,
      session_id: sessionId,
      artifact_dir: artifactDir,
      stage_result_path: stageResultPath,
      started_at: toIsoString(startedAt),
      finished_at: null,
      verify_commands: verifyCommands,
      verify_bucket: null,
      commit_sha: null,
      pr_role: prRole,
      subphase,
      loop_mode: loopMode,
      ralph_goal_ids: ralphGoalIds,
      ralph_origin: ralphOrigin,
    },
    clearRecovery: true,
  });
}

export function markStageResultReady({
  state,
  stage,
  artifactDir,
  provider,
  sessionRole,
  sessionId,
  stageResultPath,
  verifyCommands = [],
  prRole,
  startedAt,
  finishedAt,
  subphase = "implementation",
  loopMode = "single_pass",
  ralphGoalIds = [],
  ralphOrigin = null,
}) {
  return setExecutionState({
    state,
    activeStage: stage,
    phase: "stage_result_ready",
    nextAction: "finalize_stage",
    artifactDir,
    execution: {
      provider,
      session_role: sessionRole,
      session_id: sessionId,
      artifact_dir: artifactDir,
      stage_result_path: stageResultPath,
      started_at: startedAt ? toIsoString(startedAt) : state.execution?.started_at ?? null,
      finished_at: toIsoString(finishedAt),
      verify_commands: verifyCommands,
      verify_bucket: state.execution?.verify_bucket ?? null,
      commit_sha: state.execution?.commit_sha ?? null,
      pr_role: prRole,
      subphase,
      loop_mode: loopMode,
      ralph_goal_ids: ralphGoalIds,
      ralph_origin: ralphOrigin,
    },
    clearRecovery: true,
  });
}

export function markReviewPending({
  state,
  stage,
  artifactDir,
  provider,
  sessionRole,
  sessionId,
  stageResultPath,
  prRole,
  startedAt,
  finishedAt,
  subphase = "implementation",
  loopMode = "single_pass",
  ralphGoalIds = [],
  ralphOrigin = null,
}) {
  return setExecutionState({
    state,
    activeStage: stage,
    phase: "review_pending",
    nextAction: "run_review",
    artifactDir,
    execution: {
      provider,
      session_role: sessionRole,
      session_id: sessionId,
      artifact_dir: artifactDir,
      stage_result_path: stageResultPath,
      started_at: startedAt ? toIsoString(startedAt) : state.execution?.started_at ?? null,
      finished_at: toIsoString(finishedAt),
      verify_commands: [],
      verify_bucket: null,
      commit_sha: state.execution?.commit_sha ?? null,
      pr_role: prRole,
      subphase,
      loop_mode: loopMode,
      ralph_goal_ids: ralphGoalIds,
      ralph_origin: ralphOrigin,
    },
    clearRecovery: true,
  });
}

export function markStageCompleted({
  state,
  stage,
  artifactDir,
}) {
  const normalizedStage = ensureInteger(Number(stage), "stage");

  return {
    ...state,
    active_stage: normalizedStage,
    current_stage: normalizedStage,
    last_completed_stage: normalizedStage,
    blocked_stage: null,
    retry: null,
    last_artifact_dir: artifactDir ?? state.last_artifact_dir,
    phase: normalizedStage >= 6 ? "done" : null,
    next_action: "noop",
    execution: null,
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
    active_stage: ensureInteger(Number(stage), "stage"),
    current_stage: ensureInteger(Number(stage), "stage"),
    blocked_stage: ensureInteger(Number(stage), "stage"),
    retry: {
      at: retryAt,
      reason: ensureNonEmptyString(reason, "reason"),
      attempt_count: ensureInteger(attemptCount, "attemptCount"),
      max_attempts: ensureInteger(maxAttempts, "maxAttempts"),
    },
    last_artifact_dir: artifactDir ?? state.last_artifact_dir,
    phase: "wait",
    next_action: "run_stage",
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
    active_stage: ensureInteger(Number(stage), "stage"),
    current_stage: ensureInteger(Number(stage), "stage"),
    blocked_stage: ensureInteger(Number(stage), "stage"),
    retry: {
      at: null,
      reason: ensureNonEmptyString(reason, "reason"),
      attempt_count: ensureInteger(attemptCount, "attemptCount"),
      max_attempts: ensureInteger(maxAttempts, "maxAttempts"),
    },
    last_artifact_dir: artifactDir ?? state.last_artifact_dir,
    phase: "escalated",
    next_action: "noop",
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
  phase,
  nextAction,
  updatedAt,
}) {
  if (!kind) {
    return {
      ...state,
      wait: null,
      phase:
        state.phase === "wait"
          ? null
          : state.phase,
      next_action:
        state.phase === "wait"
          ? "noop"
          : state.next_action,
    };
  }

  return {
    ...state,
    active_stage:
      Number.isInteger(Number(stage)) && Number(stage) >= 1 && Number(stage) <= 6
        ? Number(stage)
        : state.active_stage,
    current_stage:
      Number.isInteger(Number(stage)) && Number(stage) >= 1 && Number(stage) <= 6
        ? Number(stage)
        : state.current_stage,
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
    phase:
      typeof phase === "string" && phase.trim().length > 0
        ? phase.trim()
        : "wait",
    next_action:
      typeof nextAction === "string" && nextAction.trim().length > 0
        ? nextAction.trim()
        : inferActionFromWait({
            kind,
            stage: Number.isInteger(Number(stage)) ? Number(stage) : null,
          }),
  };
}

export function setLastReview({
  state,
  role,
  decision,
  routeBackStage,
  approvedHeadSha,
  bodyMarkdown,
  findings,
  reviewScope,
  reviewedChecklistIds,
  requiredFixIds,
  waivedFixIds,
  authorityVerdict,
  reviewedScreenIds,
  authorityReportPaths,
  blockerCount,
  majorCount,
  minorCount,
  sourceReviewStage,
  pingPongRounds,
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
        body_markdown:
          typeof bodyMarkdown === "string" && bodyMarkdown.trim().length > 0
            ? bodyMarkdown.trim()
            : null,
        findings: Array.isArray(findings) ? findings : [],
        review_scope:
          reviewScope && typeof reviewScope === "object" && !Array.isArray(reviewScope)
            ? {
                scope:
                  typeof reviewScope.scope === "string" && reviewScope.scope.trim().length > 0
                    ? reviewScope.scope.trim()
                    : null,
                checklist_ids: Array.isArray(reviewScope.checklist_ids)
                  ? reviewScope.checklist_ids
                      .filter((value) => typeof value === "string" && value.trim().length > 0)
                      .map((value) => value.trim())
                  : [],
              }
            : {
                scope: null,
                checklist_ids: [],
              },
        reviewed_checklist_ids: Array.isArray(reviewedChecklistIds)
          ? reviewedChecklistIds
              .filter((value) => typeof value === "string" && value.trim().length > 0)
              .map((value) => value.trim())
          : [],
        required_fix_ids: Array.isArray(requiredFixIds)
          ? requiredFixIds
              .filter((value) => typeof value === "string" && value.trim().length > 0)
              .map((value) => value.trim())
          : [],
        waived_fix_ids: Array.isArray(waivedFixIds)
          ? waivedFixIds
              .filter((value) => typeof value === "string" && value.trim().length > 0)
              .map((value) => value.trim())
          : [],
        authority_verdict:
          typeof authorityVerdict === "string" && authorityVerdict.trim().length > 0
            ? authorityVerdict.trim()
            : null,
        reviewed_screen_ids: Array.isArray(reviewedScreenIds)
          ? reviewedScreenIds
              .filter((value) => typeof value === "string" && value.trim().length > 0)
              .map((value) => value.trim())
          : [],
        authority_report_paths: Array.isArray(authorityReportPaths)
          ? authorityReportPaths
              .filter((value) => typeof value === "string" && value.trim().length > 0)
              .map((value) => value.trim())
          : [],
        blocker_count:
          typeof blockerCount === "number" && blockerCount >= 0 ? blockerCount : null,
        major_count:
          typeof majorCount === "number" && majorCount >= 0 ? majorCount : null,
        minor_count:
          typeof minorCount === "number" && minorCount >= 0 ? minorCount : null,
        source_review_stage: Number.isInteger(Number(sourceReviewStage))
          ? Number(sourceReviewStage)
          : null,
        ping_pong_rounds:
          typeof pingPongRounds === "number" && pingPongRounds >= 0 ? pingPongRounds : 0,
        updated_at: toIsoString(updatedAt),
      },
    },
  };
}

export function setDesignAuthorityState({
  state,
  status,
  uiRisk,
  anchorScreens,
  requiredScreens,
  authorityRequired,
  authorityReportPaths,
  evidenceArtifactRefs,
  authorityVerdict,
  blockerCount,
  majorCount,
  minorCount,
  reviewedScreenIds,
  sourceStage,
  updatedAt,
}) {
  return {
    ...state,
    design_authority: normalizeDesignAuthority({
      ...(state.design_authority ?? {}),
      status:
        typeof status === "string" && status.trim().length > 0
          ? status.trim()
          : state.design_authority?.status ?? null,
      ui_risk:
        typeof uiRisk === "string" && uiRisk.trim().length > 0
          ? uiRisk.trim()
          : state.design_authority?.ui_risk ?? null,
      anchor_screens: Array.isArray(anchorScreens)
        ? anchorScreens
        : state.design_authority?.anchor_screens ?? [],
      required_screens: Array.isArray(requiredScreens)
        ? requiredScreens
        : state.design_authority?.required_screens ?? [],
      authority_required:
        typeof authorityRequired === "boolean"
          ? authorityRequired
          : state.design_authority?.authority_required ?? false,
      authority_report_paths: Array.isArray(authorityReportPaths)
        ? authorityReportPaths
        : state.design_authority?.authority_report_paths ?? [],
      evidence_artifact_refs: Array.isArray(evidenceArtifactRefs)
        ? evidenceArtifactRefs
        : state.design_authority?.evidence_artifact_refs ?? [],
      authority_verdict:
        typeof authorityVerdict === "string" && authorityVerdict.trim().length > 0
          ? authorityVerdict.trim()
          : state.design_authority?.authority_verdict ?? null,
      blocker_count:
        typeof blockerCount === "number" && blockerCount >= 0
          ? blockerCount
          : state.design_authority?.blocker_count ?? null,
      major_count:
        typeof majorCount === "number" && majorCount >= 0
          ? majorCount
          : state.design_authority?.major_count ?? null,
      minor_count:
        typeof minorCount === "number" && minorCount >= 0
          ? minorCount
          : state.design_authority?.minor_count ?? null,
      reviewed_screen_ids: Array.isArray(reviewedScreenIds)
        ? reviewedScreenIds
        : state.design_authority?.reviewed_screen_ids ?? [],
      source_stage:
        Number.isInteger(Number(sourceStage))
          ? Number(sourceStage)
          : state.design_authority?.source_stage ?? null,
      updated_at: toIsoString(updatedAt),
    }),
  };
}

export function setLastRebuttal({
  state,
  role,
  sourceReviewStage,
  contestedFixIds,
  rebuttals,
  updatedAt,
}) {
  const normalizedRole = ensureNonEmptyString(role, "role");

  return {
    ...state,
    last_rebuttal: {
      ...(state.last_rebuttal ?? {
        backend: null,
        frontend: null,
      }),
      [normalizedRole]: {
        source_review_stage: Number.isInteger(Number(sourceReviewStage))
          ? Number(sourceReviewStage)
          : null,
        contested_fix_ids: Array.isArray(contestedFixIds)
          ? contestedFixIds
              .filter((value) => typeof value === "string" && value.trim().length > 0)
              .map((value) => value.trim())
          : [],
        rebuttals: Array.isArray(rebuttals)
          ? rebuttals
              .filter((value) => value && typeof value === "object" && !Array.isArray(value))
              .map((value) => ({
                fix_id:
                  typeof value.fix_id === "string" && value.fix_id.trim().length > 0
                    ? value.fix_id.trim()
                    : null,
                rationale_markdown:
                  typeof value.rationale_markdown === "string" && value.rationale_markdown.trim().length > 0
                    ? value.rationale_markdown.trim()
                    : null,
                evidence_refs: Array.isArray(value.evidence_refs)
                  ? value.evidence_refs
                      .filter((entry) => typeof entry === "string" && entry.trim().length > 0)
                      .map((entry) => entry.trim())
                  : [],
              }))
              .filter((value) => value.fix_id && value.rationale_markdown)
          : [],
        updated_at: toIsoString(updatedAt),
      },
    },
  };
}

export function setDocGateState({
  state,
  status,
  round,
  sourceMasterSha,
  artifactDir,
  resultPath,
  repairBranch,
  repairPr,
  findings,
  updatedAt,
}) {
  return {
    ...state,
    doc_gate: normalizeDocGate({
      ...(state.doc_gate ?? {}),
      status:
        typeof status === "string" && status.trim().length > 0
          ? status.trim()
          : state.doc_gate?.status ?? null,
      round:
        typeof round === "number" && round >= 0
          ? round
          : state.doc_gate?.round ?? 0,
      source_master_sha:
        typeof sourceMasterSha === "string" && sourceMasterSha.trim().length > 0
          ? sourceMasterSha.trim()
          : state.doc_gate?.source_master_sha ?? null,
      artifact_dir:
        typeof artifactDir === "string" && artifactDir.trim().length > 0
          ? artifactDir.trim()
          : state.doc_gate?.artifact_dir ?? null,
      result_path:
        typeof resultPath === "string" && resultPath.trim().length > 0
          ? resultPath.trim()
          : state.doc_gate?.result_path ?? null,
      repair_branch:
        typeof repairBranch === "string" && repairBranch.trim().length > 0
          ? repairBranch.trim()
          : state.doc_gate?.repair_branch ?? null,
      repair_pr:
        repairPr && typeof repairPr === "object"
          ? {
              ...(state.doc_gate?.repair_pr ?? {}),
              ...repairPr,
              updated_at: toIsoString(updatedAt),
            }
          : state.doc_gate?.repair_pr ?? null,
      findings: Array.isArray(findings) ? findings : state.doc_gate?.findings ?? [],
      updated_at: toIsoString(updatedAt),
    }),
  };
}

export function setDocGateReview({
  state,
  decision,
  routeBackStage,
  approvedHeadSha,
  bodyMarkdown,
  findings,
  reviewedDocFindingIds,
  requiredDocFixIds,
  waivedDocFixIds,
  sourceReviewStage,
  pingPongRounds,
  updatedAt,
}) {
  return {
    ...state,
    doc_gate: normalizeDocGate({
      ...(state.doc_gate ?? {}),
      last_review: {
        decision,
        route_back_stage: Number.isInteger(Number(routeBackStage)) ? Number(routeBackStage) : null,
        approved_head_sha:
          typeof approvedHeadSha === "string" && approvedHeadSha.trim().length > 0
            ? approvedHeadSha.trim()
            : null,
        body_markdown:
          typeof bodyMarkdown === "string" && bodyMarkdown.trim().length > 0
            ? bodyMarkdown.trim()
            : null,
        findings: Array.isArray(findings) ? findings : [],
        reviewed_doc_finding_ids: Array.isArray(reviewedDocFindingIds) ? reviewedDocFindingIds : [],
        required_doc_fix_ids: Array.isArray(requiredDocFixIds) ? requiredDocFixIds : [],
        waived_doc_fix_ids: Array.isArray(waivedDocFixIds) ? waivedDocFixIds : [],
        source_review_stage: Number.isInteger(Number(sourceReviewStage)) ? Number(sourceReviewStage) : null,
        ping_pong_rounds:
          typeof pingPongRounds === "number" && pingPongRounds >= 0 ? pingPongRounds : 0,
        updated_at: toIsoString(updatedAt),
      },
      updated_at: toIsoString(updatedAt),
    }),
  };
}

export function setDocGateRebuttal({
  state,
  sourceReviewStage,
  contestedDocFixIds,
  rebuttals,
  updatedAt,
}) {
  return {
    ...state,
    doc_gate: normalizeDocGate({
      ...(state.doc_gate ?? {}),
      last_rebuttal: {
        source_review_stage: Number.isInteger(Number(sourceReviewStage)) ? Number(sourceReviewStage) : null,
        contested_doc_fix_ids: Array.isArray(contestedDocFixIds) ? contestedDocFixIds : [],
        rebuttals: Array.isArray(rebuttals) ? rebuttals : [],
        updated_at: toIsoString(updatedAt),
      },
      updated_at: toIsoString(updatedAt),
    }),
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
    preserveActiveLock: false,
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
