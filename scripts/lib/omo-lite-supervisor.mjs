import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { readAutomationSpec, resolveStageAutomationConfig } from "./omo-automation-spec.mjs";
import { readTrackedWorkItemWithRecovery } from "./omo-tracked-work-item.mjs";

const CLAUDE_BUDGET_STATES = new Set(["available", "constrained", "unavailable"]);
const LIFECYCLE_STATES = new Set([
  "planned",
  "in_progress",
  "ready_for_review",
  "blocked",
  "merged",
  "archived",
]);
const APPROVAL_STATES = new Set([
  "not_started",
  "needs_revision",
  "claude_approved",
  "codex_approved",
  "dual_approved",
  "human_escalation",
]);
const VERIFICATION_STATES = new Set(["pending", "passed", "failed", "skipped"]);
const EVALUATION_STATES = new Set([
  "not_started",
  "running",
  "fixable",
  "passed",
  "blocked",
  "stalled",
]);

export function resolveStageSessionRole(stage, subphase = null) {
  const normalizedStage = ensureStage(stage);

  if (normalizedStage === 2 && subphase === "doc_gate_repair") {
    return "claude_primary";
  }

  if (normalizedStage === 2 && subphase === "doc_gate_review") {
    return "codex_primary";
  }

  if (normalizedStage === 5 && subphase === "final_authority_gate") {
    return "claude_primary";
  }

  if (normalizedStage === 4 && subphase === "authority_precheck") {
    return "codex_primary";
  }

  if ([1, 3, 4].includes(normalizedStage)) {
    return "claude_primary";
  }

  return "codex_primary";
}

function readJson(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function ensureNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function ensureEnum(value, values, label) {
  const normalized = ensureNonEmptyString(value, label);
  if (!values.has(normalized)) {
    throw new Error(
      `${label} must be one of: ${[...values].join(", ")}`,
    );
  }

  return normalized;
}

function ensureStage(value) {
  const stage = Number(value);
  if (!Number.isInteger(stage) || stage < 1 || stage > 6) {
    throw new Error("stage must be an integer between 1 and 6.");
  }

  return stage;
}

function resolveAuthorityEvidenceCaptureScript(slice) {
  const normalizedSlice = ensureNonEmptyString(slice, "slice");
  const candidates = [
    `scripts/capture-${normalizedSlice}-evidence.mjs`,
    `scripts/capture-${normalizedSlice.split("-")[0]}-evidence.mjs`,
  ];

  for (const candidate of candidates) {
    if (existsSync(resolve(process.cwd(), candidate))) {
      return candidate;
    }
  }

  return null;
}

function buildPriorStageResultSection(priorStageResultPath) {
  const normalizedPath =
    typeof priorStageResultPath === "string" && priorStageResultPath.trim().length > 0
      ? priorStageResultPath.trim()
      : null;
  if (!normalizedPath || !existsSync(normalizedPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(normalizedPath, "utf8"));
    const compact = {
      result: parsed?.result ?? null,
      summary_markdown: parsed?.summary_markdown ?? null,
      claimed_scope: parsed?.claimed_scope ?? null,
      changed_files: Array.isArray(parsed?.changed_files) ? parsed.changed_files : [],
      checklist_updates: Array.isArray(parsed?.checklist_updates) ? parsed.checklist_updates : [],
      authority_verdict: parsed?.authority_verdict ?? null,
      reviewed_screen_ids: Array.isArray(parsed?.reviewed_screen_ids) ? parsed.reviewed_screen_ids : [],
      authority_report_paths: Array.isArray(parsed?.authority_report_paths) ? parsed.authority_report_paths : [],
      evidence_artifact_refs: Array.isArray(parsed?.evidence_artifact_refs) ? parsed.evidence_artifact_refs : [],
      blocker_count: parsed?.blocker_count ?? null,
      major_count: parsed?.major_count ?? null,
      minor_count: parsed?.minor_count ?? null,
    };

    return [
      "## Prior Stage Result Snapshot",
      "- 아래 JSON은 이전 stage result의 compact snapshot입니다. worktree 밖 artifact 경로를 다시 읽으려 하지 말고 이 내용을 기준으로 리뷰하세요.",
      "```json",
      JSON.stringify(compact, null, 2),
      "```",
    ].join("\n");
  } catch {
    return null;
  }
}

function productStageSpec(stage, slice, subphase = null) {
  if (stage === 5 && subphase === "final_authority_gate") {
    return {
      actor: "claude",
      branch: null,
      lifecycle: "ready_for_review",
      approval_state: "claude_approved",
      verification_status: "passed",
      requiredReads: [
        `docs/workpacks/${slice}/README.md`,
        `docs/workpacks/${slice}/acceptance.md`,
        "frontend PR diff",
        "docs/design/design-tokens.md",
        "docs/design/mobile-ux-rules.md",
        "docs/design/anchor-screens.md",
        "docs/engineering/product-design-authority.md",
        "authority report",
      ],
      deliverables: [
        "final authority review summary",
        "requested changes or final authority approval",
      ],
      verifyCommands: [],
      successCondition:
        "Authority-required frontend slice receives Claude final authority verdict and can proceed to Stage 6 or route fixes back to Stage 4.",
      escalationIfBlocked:
        "Escalate to human if final authority cannot be determined from the available evidence.",
    };
  }

  if (stage === 4 && subphase === "authority_precheck") {
    const captureScript = resolveAuthorityEvidenceCaptureScript(slice);
    return {
      actor: "codex",
      branch: `feature/fe-${slice}`,
      lifecycle: "in_progress",
      approval_state: "not_started",
      verification_status: "pending",
      requiredReads: [
        "AGENTS.md",
        "docs/engineering/slice-workflow.md",
        `docs/workpacks/${slice}/README.md`,
        `docs/workpacks/${slice}/acceptance.md`,
        `docs/workpacks/${slice}/automation-spec.json`,
        "docs/design/mobile-ux-rules.md",
        "docs/design/anchor-screens.md",
        "docs/engineering/product-design-authority.md",
        captureScript ? `${captureScript} (when authority evidence is missing)` : null,
      ],
      deliverables: [
        `branch feature/fe-${slice}`,
        "mobile evidence bundle",
        "authority precheck report",
        captureScript ? `repo-local evidence capture via ${captureScript}` : null,
        "valid authority_precheck stage result",
      ],
      verifyCommands: [],
      successCondition:
        "Authority precheck evidence, authority report, and structured blocker/major/minor summary are ready for supervisor handoff.",
      escalationIfBlocked:
        "Escalate to human if mobile UX evidence or design authority requirements cannot be satisfied within Stage 4 scope.",
    };
  }

  if (stage === 2 && subphase === "doc_gate_repair") {
    return {
      actor: "claude",
      branch: `docs/${slice}`,
      lifecycle: "in_progress",
      approval_state: "needs_revision",
      verification_status: "pending",
      requiredReads: [
        "AGENTS.md",
        "docs/engineering/workflow-v2/omo-autonomous-supervisor.md",
        `docs/workpacks/${slice}/README.md`,
        `docs/workpacks/${slice}/acceptance.md`,
        `docs/workpacks/${slice}/automation-spec.json`,
        `.workflow-v2/work-items/${slice}.json`,
        ".workflow-v2/status.json",
        "current unresolved doc gate findings",
        "latest doc gate rebuttal bundle",
      ],
      deliverables: [
        `branch docs/${slice}`,
        "stage-1 docs remediation or rebuttal",
        "valid doc gate repair stage result",
      ],
      verifyCommands: [],
      successCondition:
        "Claude final owner resolves or contests every required doc finding on the Stage 1 docs branch and writes a valid repair stage result.",
      escalationIfBlocked: "Escalate to human if the Stage 1 docs branch cannot be safely converged within the locked Stage 1 artifact scope.",
    };
  }

  if (stage === 2 && subphase === "doc_gate_review") {
    return {
      actor: "codex",
      branch: null,
      lifecycle: "ready_for_review",
      approval_state: "codex_approved",
      verification_status: "passed",
      requiredReads: [
        `docs/workpacks/${slice}/README.md`,
        `docs/workpacks/${slice}/acceptance.md`,
        `docs/workpacks/${slice}/automation-spec.json`,
        `.workflow-v2/work-items/${slice}.json`,
        ".workflow-v2/status.json",
        "Stage 1 docs PR diff",
        "current unresolved doc gate findings",
        "latest doc gate rebuttal bundle",
      ],
      deliverables: [
        "structured doc gate review summary",
        "requested changes or approval",
      ],
      verifyCommands: [],
      successCondition:
        "Codex reviewer records approve/request_changes over the Stage 1 docs PR and leaves a valid doc gate review stage result for supervisor routing.",
      escalationIfBlocked: "Escalate to human if Stage 1 docs ambiguity remains after the structured docs gate review loop.",
    };
  }

  const shared = {
    1: {
      actor: "claude",
      branch: null,
      lifecycle: "planned",
      approval_state: "not_started",
      verification_status: "pending",
      requiredReads: [
        "AGENTS.md",
        "docs/workpacks/README.md",
        "docs/engineering/slice-workflow.md",
        "docs/sync/CURRENT_SOURCE_OF_TRUTH.md",
        ".workflow-v2/README.md",
        "docs/engineering/workflow-v2/schemas/work-item.schema.json",
        "docs/engineering/workflow-v2/templates/work-item.example.json",
        ".workflow-v2/status.json",
        "docs/design/mobile-ux-rules.md",
        "docs/design/anchor-screens.md",
        "docs/engineering/product-design-authority.md",
      ],
      deliverables: [
        `docs/workpacks/${slice}/README.md`,
        `docs/workpacks/${slice}/acceptance.md`,
        `docs/workpacks/${slice}/automation-spec.json`,
        `.workflow-v2/work-items/${slice}.json`,
        `.workflow-v2/status.json matching item for ${slice}`,
        "README Design Authority section when authority-required",
        "design-generator / design-critic artifacts when authority-required",
        "valid stage result",
      ],
      verifyCommands: [],
      successCondition:
        "Stage 1 docs are written, local checks are complete, and a valid stage result is ready for supervisor handoff.",
      escalationIfBlocked: "Escalate to human if the workpack conflicts with official docs or dependencies are not merged.",
    },
    2: {
      actor: "codex",
      branch: `feature/be-${slice}`,
      lifecycle: "in_progress",
      approval_state: "not_started",
      verification_status: "pending",
      requiredReads: [
        "AGENTS.md",
        "docs/engineering/slice-workflow.md",
        `docs/workpacks/${slice}/README.md`,
        `docs/workpacks/${slice}/acceptance.md`,
        `docs/workpacks/${slice}/automation-spec.json`,
        "docs/api문서-v1.2.2.md",
        "docs/db설계-v1.3.1.md",
      ],
      deliverables: [
        `branch feature/be-${slice}`,
        "docs/workpacks/README.md slice status docs -> in-progress",
        "contract-first tests",
        "backend implementation",
        "valid stage result",
      ],
      verifyCommands: ["pnpm install --frozen-lockfile", "pnpm verify:backend"],
      successCondition:
        "Backend implementation and required local verification are complete, and a valid stage result is ready for supervisor handoff.",
      escalationIfBlocked: "Escalate to human if official docs conflict or contract evolution approval is required.",
    },
    3: {
      actor: "claude",
      branch: null,
      lifecycle: "ready_for_review",
      approval_state: "claude_approved",
      verification_status: "passed",
      requiredReads: [
        `docs/workpacks/${slice}/README.md`,
        `docs/workpacks/${slice}/acceptance.md`,
        "backend PR diff",
        "CI context",
      ],
      deliverables: ["review summary", "requested changes or approval"],
      verifyCommands: [],
      successCondition:
        "Backend PR receives review feedback or approval and can proceed to automatic merge or fix routing.",
      escalationIfBlocked:
        "Escalate to human if CI, autonomous merge policy, and review conclusions disagree or if scope exceeds the locked contract.",
    },
    4: {
      actor: "claude",
      branch: `feature/fe-${slice}`,
      lifecycle: "in_progress",
      approval_state: "not_started",
      verification_status: "pending",
      requiredReads: [
        "AGENTS.md",
        "docs/engineering/slice-workflow.md",
        `docs/workpacks/${slice}/README.md`,
        `docs/workpacks/${slice}/acceptance.md`,
        `docs/workpacks/${slice}/automation-spec.json`,
        "docs/design/design-tokens.md",
        "docs/design/mobile-ux-rules.md",
        "docs/design/anchor-screens.md",
        "docs/engineering/product-design-authority.md",
      ],
      deliverables: [
        `branch feature/fe-${slice}`,
        "frontend tests",
        "frontend implementation",
        "mobile UX evidence bundle when authority-required",
        "authority report draft when authority-required",
        `docs/workpacks/${slice}/README.md design status temporary -> pending-review`,
        "valid stage result",
      ],
      verifyCommands: ["pnpm install --frozen-lockfile", "pnpm verify:frontend"],
      successCondition:
        "Frontend implementation and required local verification are complete, and a valid stage result is ready for supervisor handoff.",
      escalationIfBlocked: "Escalate to human if backend contract and UI scope are no longer aligned.",
    },
    5: {
      actor: "codex",
      branch: null,
      lifecycle: "ready_for_review",
      approval_state: "codex_approved",
      verification_status: "passed",
      requiredReads: [
        `docs/workpacks/${slice}/README.md`,
        `docs/workpacks/${slice}/acceptance.md`,
        "frontend PR diff",
        "docs/design/design-tokens.md",
        "docs/design/mobile-ux-rules.md",
        "docs/design/anchor-screens.md",
        "docs/engineering/product-design-authority.md",
        "authority report",
      ],
      deliverables: [
        "design review summary",
        "requested changes or Stage 6 handoff",
      ],
      verifyCommands: [],
      successCondition: "Design review feedback is recorded and the PR can proceed to final authority gate or Stage 6, or route fixes back to implementation.",
      escalationIfBlocked: "Escalate to human if design intent conflicts with the workpack or official screen definitions.",
    },
    6: {
      actor: "codex",
      branch: null,
      lifecycle: "ready_for_review",
      approval_state: "codex_approved",
      verification_status: "passed",
      requiredReads: [
        `docs/workpacks/${slice}/README.md`,
        `docs/workpacks/${slice}/acceptance.md`,
        "frontend PR diff",
        "CI context",
      ],
      deliverables: [
        "frontend review summary",
        "requested changes or approval",
        "external smoke validation + merge handoff",
      ],
      verifyCommands: [],
      successCondition:
        "Frontend PR receives final review feedback or approval and can proceed to external smoke validation and automatic merge.",
      escalationIfBlocked:
        "Escalate to human if final closeout cannot run, autonomous merge policy is unavailable, or unresolved risks remain.",
    },
  };

  return shared[stage];
}

function buildGoal(stage, slice, subphase = null) {
  if (stage === 2 && subphase === "doc_gate_repair") {
    return `슬라이스 ${slice} internal 1.5 docs repair`;
  }

  if (stage === 2 && subphase === "doc_gate_review") {
    return `슬라이스 ${slice} internal 1.5 docs review`;
  }

  if (stage === 5 && subphase === "final_authority_gate") {
    return `슬라이스 ${slice} final authority gate`;
  }

  if (stage === 4 && subphase === "authority_precheck") {
    return `슬라이스 ${slice} authority precheck`;
  }

  return `슬라이스 ${slice} ${stage}단계 진행`;
}

/**
 * @param {{
 *   slice: string,
 *   stage: number|string,
 *   subphase?: string|null,
 *   claudeBudgetState?: "available"|"constrained"|"unavailable",
 *   sessionId?: string|null,
 *   retryAt?: string|null,
 *   attemptCount?: number,
 *   reviewContext?: {
 *     decision?: string|null,
 *     body_markdown?: string|null,
 *     pr_url?: string|null,
 *     updated_at?: string|null,
 *     findings?: Array<{file: string, line_hint?: number|null, severity: string, category: string, issue: string, suggestion: string}>,
 *     reviewed_checklist_ids?: string[],
 *     required_fix_ids?: string[],
 *   } | null,
 *   priorStageResultPath?: string|null,
 *   forceHumanEscalation?: boolean,
 *   humanEscalationReason?: string,
 * }} args
 */
export function buildStageDispatch({
  rootDir = process.cwd(),
  slice,
  stage,
  subphase = null,
  claudeBudgetState = "available",
  sessionId = null,
  retryAt = null,
  attemptCount = 0,
  reviewContext = null,
  priorStageResultPath = null,
  forceHumanEscalation = false,
  humanEscalationReason = "session_unavailable",
}) {
  const normalizedSlice = ensureNonEmptyString(slice, "slice");
  const normalizedStage = ensureStage(stage);
  const normalizedSubphase =
    typeof subphase === "string" && subphase.trim().length > 0 ? subphase.trim() : null;
  const normalizedBudgetState = ensureEnum(
    claudeBudgetState,
    CLAUDE_BUDGET_STATES,
    "claudeBudgetState",
  );
  const spec = productStageSpec(normalizedStage, normalizedSlice, normalizedSubphase);
  const { automationSpec } = readAutomationSpec({
    rootDir,
    slice: normalizedSlice,
    required: false,
  });
  const stageAutomationConfig = resolveStageAutomationConfig({
    automationSpec,
    stage: normalizedStage,
  });

  if (!spec) {
    throw new Error(`Unsupported stage: ${normalizedStage}`);
  }

  const normalizedSessionId =
    typeof sessionId === "string" && sessionId.trim().length > 0 ? sessionId.trim() : null;
  const normalizedRetryAt =
    typeof retryAt === "string" && retryAt.trim().length > 0 ? retryAt.trim() : null;
  const normalizedAttemptCount =
    Number.isInteger(attemptCount) && attemptCount >= 0 ? attemptCount : 0;
  const normalizedReviewContext =
    reviewContext && typeof reviewContext === "object"
      ? {
          decision:
            typeof reviewContext.decision === "string" && reviewContext.decision.trim().length > 0
              ? reviewContext.decision.trim()
              : null,
          body_markdown:
            typeof reviewContext.body_markdown === "string" &&
            reviewContext.body_markdown.trim().length > 0
              ? reviewContext.body_markdown.trim()
              : null,
          pr_url:
            typeof reviewContext.pr_url === "string" && reviewContext.pr_url.trim().length > 0
              ? reviewContext.pr_url.trim()
              : null,
          updated_at:
            typeof reviewContext.updated_at === "string" && reviewContext.updated_at.trim().length > 0
              ? reviewContext.updated_at.trim()
              : null,
          findings: Array.isArray(reviewContext.findings) ? reviewContext.findings : [],
          reviewed_checklist_ids: Array.isArray(reviewContext.reviewed_checklist_ids)
            ? reviewContext.reviewed_checklist_ids
            : [],
          required_fix_ids: Array.isArray(reviewContext.required_fix_ids)
            ? reviewContext.required_fix_ids
            : [],
          waived_fix_ids: Array.isArray(reviewContext.waived_fix_ids)
            ? reviewContext.waived_fix_ids
            : [],
          reviewed_doc_finding_ids: Array.isArray(reviewContext.reviewed_doc_finding_ids)
            ? reviewContext.reviewed_doc_finding_ids
            : [],
          required_doc_fix_ids: Array.isArray(reviewContext.required_doc_fix_ids)
            ? reviewContext.required_doc_fix_ids
            : [],
          waived_doc_fix_ids: Array.isArray(reviewContext.waived_doc_fix_ids)
            ? reviewContext.waived_doc_fix_ids
            : [],
        }
      : null;
  const normalizedPriorStageResultPath =
    typeof priorStageResultPath === "string" && priorStageResultPath.trim().length > 0
      ? priorStageResultPath.trim()
      : null;
  const sessionRole = resolveStageSessionRole(normalizedStage, normalizedSubphase);
  const resumeMode = normalizedRetryAt
    ? "scheduled_retry"
    : normalizedSessionId
      ? "continue"
      : "fresh";

  const reviewFeedbackRead =
    normalizedReviewContext?.body_markdown && [2, 4].includes(normalizedStage)
      ? [
          normalizedStage === 2 && normalizedSubphase === "doc_gate_repair"
            ? "previous Stage 1 doc gate review feedback (runtime.doc_gate.last_review)"
            : normalizedStage === 2
            ? "previous backend review feedback (runtime.last_review.backend)"
            : "previous frontend review feedback (runtime.last_review.frontend)",
          normalizedReviewContext.pr_url ? `active PR context: ${normalizedReviewContext.pr_url}` : null,
        ].filter(Boolean)
      : [];

  const priorStageResultRead =
    normalizedPriorStageResultPath && [3, 5].includes(normalizedStage)
      ? ["prior stage result snapshot (inlined below)"]
      : [];
  const priorStageResultSection =
    normalizedPriorStageResultPath && [3, 5].includes(normalizedStage)
      ? buildPriorStageResultSection(normalizedPriorStageResultPath)
      : null;

  const findingsSection =
    normalizedReviewContext?.findings?.length > 0 && [2, 4].includes(normalizedStage)
      ? [
          "## Structured Findings from Prior Review",
          "아래 항목을 모두 반영한 뒤 stage-result를 작성하세요.",
          ...normalizedReviewContext.findings.map(
            (f, i) =>
              `### Finding ${i + 1}: [${f.severity?.toUpperCase() ?? "?"}] ${f.file ?? "unknown"}${f.line_hint !== null && f.line_hint !== undefined ? `:${f.line_hint}` : ""}\n- **Category:** ${f.category ?? "-"}\n- **Issue:** ${f.issue ?? "-"}\n- **Suggestion:** ${f.suggestion ?? "-"}`,
          ),
        ].join("\n")
      : null;
  const requiredFixIdsSection =
    normalizedReviewContext?.required_fix_ids?.length > 0 && [2, 4].includes(normalizedStage)
      ? [
          "## Required Checklist Fix IDs",
          "아래 checklist id를 반영한 뒤 stage-result에 다시 기록하세요.",
          ...normalizedReviewContext.required_fix_ids.map((id) => `- \`${id}\``),
        ].join("\n")
      : null;
  const requiredDocFixIdsSection =
    normalizedStage === 2 &&
    normalizedSubphase === "doc_gate_repair" &&
    normalizedReviewContext?.required_doc_fix_ids?.length > 0
      ? [
          "## Required Doc Gate Fix IDs",
          "아래 doc finding id를 각각 resolve 또는 contest 상태로 처리한 뒤 stage-result에 다시 기록하세요.",
          ...normalizedReviewContext.required_doc_fix_ids.map((id) => `- \`${id}\``),
        ].join("\n")
      : null;

  const dispatch = {
    stage: normalizedStage,
    actor: spec.actor,
    goal: buildGoal(normalizedStage, normalizedSlice, normalizedSubphase),
    requiredReads: [...spec.requiredReads, ...reviewFeedbackRead, ...priorStageResultRead].filter(Boolean),
    deliverables: spec.deliverables.filter(Boolean),
    verifyCommands:
      [2, 4].includes(normalizedStage) &&
      Array.isArray(stageAutomationConfig?.verify_commands) &&
      stageAutomationConfig.verify_commands.length > 0
        ? ["pnpm install --frozen-lockfile", ...stageAutomationConfig.verify_commands]
        : spec.verifyCommands,
    statusPatch: {
      branch: spec.branch,
      lifecycle: spec.lifecycle,
      approval_state: spec.approval_state,
      verification_status: spec.verification_status,
    },
    runtimePatch: {
      blocked_stage: null,
      retry: null,
    },
    sessionBinding: {
      role: sessionRole,
      sessionId: normalizedSessionId,
      resumeMode,
    },
    retryDecision: {
      action: "none",
      reason: null,
      retryAt: normalizedRetryAt,
      attemptCount: normalizedAttemptCount,
    },
    reviewContext: normalizedReviewContext,
    subphase: normalizedSubphase,
    extraPromptSections: [
      findingsSection,
      requiredFixIdsSection,
      requiredDocFixIdsSection,
      normalizedStage === 4 && normalizedSubphase === "authority_precheck"
        ? [
            "## Authority Evidence Capture Preference",
            "- authority evidence가 비어 있으면 repo-local `scripts/capture-<slice>-evidence.mjs`를 우선 사용하세요.",
            "- shell one-liner로 스크린샷을 즉석 생성하지 말고, 가능하면 repo script를 실행해 evidence를 만드세요.",
            "- 중간 로그와 산출물은 `/tmp` 대신 `.artifacts/` 또는 `ui/designs/evidence/` 아래 repo-local 경로만 사용하세요.",
            "- dev server가 필요하면 readiness를 확인한 뒤 캡처하고, 끝나면 정리하세요.",
          ].join("\n")
        : null,
      priorStageResultSection,
    ].filter(Boolean),
    successCondition: spec.successCondition,
    escalationIfBlocked: spec.escalationIfBlocked,
    claudeBudgetState: normalizedBudgetState,
  };

  if (forceHumanEscalation) {
    return {
      ...dispatch,
      actor: "human",
      statusPatch: {
        ...dispatch.statusPatch,
        lifecycle: "blocked",
        approval_state: "human_escalation",
        verification_status: "pending",
      },
      runtimePatch: {
        blocked_stage: normalizedStage,
        retry: {
          at: null,
          reason: humanEscalationReason,
          attempt_count: normalizedAttemptCount,
        },
      },
      retryDecision: {
        action: "escalate",
        reason: humanEscalationReason,
        retryAt: null,
        attemptCount: normalizedAttemptCount,
      },
      successCondition:
        "Human escalation is recorded because the stored session cannot be resumed safely.",
      escalationIfBlocked:
        "Stored session reuse failed. Escalate to human review or recovery instead of silently creating a new session.",
    };
  }

  if (normalizedBudgetState === "unavailable" && spec.actor === "claude") {
    return {
      ...dispatch,
      statusPatch: {
        lifecycle: "blocked",
        verification_status: "pending",
      },
      runtimePatch: {
        blocked_stage: normalizedStage,
        retry: {
          at: normalizedRetryAt,
          reason: "claude_budget_unavailable",
          attempt_count: normalizedAttemptCount + 1,
        },
      },
      retryDecision: {
        action: "schedule_retry",
        reason: "claude_budget_unavailable",
        retryAt: normalizedRetryAt,
        attemptCount: normalizedAttemptCount + 1,
      },
      successCondition:
        "Claude review resumes on the same session after budget recovers or a recovery path is explicitly chosen.",
      escalationIfBlocked:
        "Claude is unavailable. Keep the stage blocked for scheduled retry and escalate only if the session is lost or retries are exhausted.",
    };
  }

  return dispatch;
}

function resolveWorkflowPaths(rootDir, workItemId) {
  const resolvedRoot = resolve(rootDir);
  return {
    statusPath: resolve(resolvedRoot, ".workflow-v2", "status.json"),
    workItemPath: resolve(
      resolvedRoot,
      ".workflow-v2",
      "work-items",
      `${workItemId}.json`,
    ),
  };
}

function readTrackedWorkItem(rootDir, workItemId) {
  const trackedWorkItemState = readTrackedWorkItemWithRecovery({
    rootDir,
    workItemId,
  });
  if (!trackedWorkItemState.tracked) {
    throw new Error(`Tracked workflow-v2 work item not found: ${trackedWorkItemState.workItemPath}`);
  }

  return trackedWorkItemState;
}

function readStatusBoard(rootDir, workItemId) {
  const { statusPath } = resolveWorkflowPaths(rootDir, workItemId);
  const statusBoard = readJson(statusPath);

  return {
    statusPath,
    statusBoard,
  };
}

function createStatusEntryFromWorkItem(workItem) {
  return {
    id: workItem.id,
    preset: workItem.preset,
    lifecycle: workItem.status.lifecycle,
    approval_state: workItem.status.approval_state,
    verification_status: workItem.status.verification_status,
    evaluation_status: workItem.status.evaluation_status,
    evaluation_round: workItem.status.evaluation_round,
    last_evaluator_result: workItem.status.last_evaluator_result,
    auto_merge_eligible: workItem.status.auto_merge_eligible,
    blocked_reason_code: workItem.status.blocked_reason_code,
    required_checks: [...workItem.verification.required_checks],
  };
}

function applyStatusPatch(statusItem, patch) {
  const next = { ...statusItem };

  if ("branch" in patch) next.branch = patch.branch ?? undefined;
  if ("pr_path" in patch) next.pr_path = patch.pr_path ?? undefined;
  if ("notes" in patch) next.notes = patch.notes ?? undefined;

  if ("lifecycle" in patch) {
    next.lifecycle = ensureEnum(patch.lifecycle, LIFECYCLE_STATES, "patch.lifecycle");
  }

  if ("approval_state" in patch) {
    next.approval_state = ensureEnum(
      patch.approval_state,
      APPROVAL_STATES,
      "patch.approval_state",
    );
  }

  if ("verification_status" in patch) {
    next.verification_status = ensureEnum(
      patch.verification_status,
      VERIFICATION_STATES,
      "patch.verification_status",
    );
  }

  if ("evaluation_status" in patch && patch.evaluation_status !== undefined) {
    next.evaluation_status = ensureEnum(
      patch.evaluation_status,
      EVALUATION_STATES,
      "patch.evaluation_status",
    );
  }

  if ("evaluation_round" in patch) {
    const round = Number(patch.evaluation_round);
    if (!Number.isInteger(round) || round < 0) {
      throw new Error("patch.evaluation_round must be a non-negative integer.");
    }
    next.evaluation_round = round;
  }

  if ("last_evaluator_result" in patch) {
    next.last_evaluator_result =
      typeof patch.last_evaluator_result === "string" && patch.last_evaluator_result.trim().length > 0
        ? patch.last_evaluator_result.trim()
        : null;
  }

  if ("auto_merge_eligible" in patch) {
    if (patch.auto_merge_eligible !== undefined && typeof patch.auto_merge_eligible !== "boolean") {
      throw new Error("patch.auto_merge_eligible must be a boolean when provided.");
    }
    next.auto_merge_eligible = patch.auto_merge_eligible;
  }

  if ("blocked_reason_code" in patch) {
    next.blocked_reason_code =
      typeof patch.blocked_reason_code === "string" && patch.blocked_reason_code.trim().length > 0
        ? patch.blocked_reason_code.trim()
        : null;
  }

  return next;
}

export function syncWorkflowV2Status({
  rootDir = process.cwd(),
  workItemId,
  patch = {},
  updatedAt,
}) {
  const normalizedWorkItemId = ensureNonEmptyString(workItemId, "workItemId");
  const { workItemPath, workItem } = readTrackedWorkItem(rootDir, normalizedWorkItemId);
  const { statusPath, statusBoard } = readStatusBoard(rootDir, normalizedWorkItemId);

  if (!Array.isArray(statusBoard.items)) {
    throw new Error(".workflow-v2/status.json.items must be an array.");
  }

  const currentStatusItem =
    statusBoard.items.find((item) => item.id === normalizedWorkItemId) ??
    createStatusEntryFromWorkItem(workItem);
  const nextStatusItem = applyStatusPatch(
    {
      ...currentStatusItem,
      preset: workItem.preset,
      required_checks: [...workItem.verification.required_checks],
    },
    patch,
  );

  const nextItems = statusBoard.items.some((item) => item.id === normalizedWorkItemId)
    ? statusBoard.items.map((item) =>
        item.id === normalizedWorkItemId ? nextStatusItem : item,
      )
    : [...statusBoard.items, nextStatusItem];

  const nextStatusBoard = {
    ...statusBoard,
    updated_at:
      typeof updatedAt === "string" && updatedAt.trim().length > 0
        ? updatedAt
        : new Date().toISOString(),
    items: nextItems,
  };

  const nextWorkItem = {
    ...workItem,
    status: {
      ...workItem.status,
      lifecycle: nextStatusItem.lifecycle,
      approval_state: nextStatusItem.approval_state,
      verification_status: nextStatusItem.verification_status,
      ...(Object.prototype.hasOwnProperty.call(nextStatusItem, "evaluation_status")
        ? { evaluation_status: nextStatusItem.evaluation_status ?? null }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(nextStatusItem, "evaluation_round")
        ? { evaluation_round: nextStatusItem.evaluation_round ?? null }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(nextStatusItem, "last_evaluator_result")
        ? { last_evaluator_result: nextStatusItem.last_evaluator_result ?? null }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(nextStatusItem, "auto_merge_eligible")
        ? { auto_merge_eligible: nextStatusItem.auto_merge_eligible ?? false }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(nextStatusItem, "blocked_reason_code")
        ? { blocked_reason_code: nextStatusItem.blocked_reason_code ?? null }
        : {}),
    },
  };

  const statusItemChanged =
    JSON.stringify(currentStatusItem) !== JSON.stringify(nextStatusItem);
  const workItemChanged =
    JSON.stringify(workItem) !== JSON.stringify(nextWorkItem);

  if (!statusItemChanged && !workItemChanged) {
    return {
      workItem,
      statusBoard,
      statusItem: currentStatusItem,
    };
  }

  writeJson(workItemPath, nextWorkItem);
  writeJson(statusPath, nextStatusBoard);

  return {
    workItem: nextWorkItem,
    statusBoard: nextStatusBoard,
    statusItem: nextStatusItem,
  };
}
