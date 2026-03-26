import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

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
  "awaiting_claude_or_human",
  "dual_approved",
  "human_escalation",
]);
const VERIFICATION_STATES = new Set(["pending", "passed", "failed", "skipped"]);

export function resolveStageSessionRole(stage) {
  const normalizedStage = ensureStage(stage);

  if ([1, 3, 5, 6].includes(normalizedStage)) {
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

function productStageSpec(stage, slice) {
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
      ],
      deliverables: [
        `docs/workpacks/${slice}/README.md`,
        `docs/workpacks/${slice}/acceptance.md`,
        "docs PR",
      ],
      verifyCommands: [],
      successCondition: "Stage 1 docs are merged on main and slice status moves to docs.",
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
        "docs/api문서-v1.2.1.md",
        "docs/db설계-v1.3.md",
      ],
      deliverables: [
        `branch feature/be-${slice}`,
        "contract-first tests",
        "backend implementation",
        "Draft PR",
      ],
      verifyCommands: ["pnpm install --frozen-lockfile", "pnpm test:all"],
      successCondition: "Backend Draft PR is open, CI is green, and the PR is ready for review.",
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
      successCondition: "Backend PR receives review feedback or approval and can proceed to merge or fix routing.",
      escalationIfBlocked: "Escalate to human if CI and review conclusions disagree or if scope exceeds the locked contract.",
    },
    4: {
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
        "docs/design/design-tokens.md",
      ],
      deliverables: [
        `branch feature/fe-${slice}`,
        "frontend tests",
        "frontend implementation",
        "Draft PR",
      ],
      verifyCommands: ["pnpm install --frozen-lockfile", "pnpm test:all"],
      successCondition: "Frontend Draft PR is open, CI is green, and the PR is ready for design/code review.",
      escalationIfBlocked: "Escalate to human if backend contract and UI scope are no longer aligned.",
    },
    5: {
      actor: "claude",
      branch: null,
      lifecycle: "ready_for_review",
      approval_state: "claude_approved",
      verification_status: "passed",
      requiredReads: [
        `docs/workpacks/${slice}/README.md`,
        "frontend PR diff",
        "docs/design/design-tokens.md",
      ],
      deliverables: ["design review summary", "requested changes or confirmed status"],
      verifyCommands: [],
      successCondition: "Design review feedback is recorded and the PR can proceed or route fixes back to Codex.",
      escalationIfBlocked: "Escalate to human if design intent conflicts with the workpack or official screen definitions.",
    },
    6: {
      actor: "claude",
      branch: null,
      lifecycle: "ready_for_review",
      approval_state: "claude_approved",
      verification_status: "passed",
      requiredReads: [
        `docs/workpacks/${slice}/README.md`,
        `docs/workpacks/${slice}/acceptance.md`,
        "frontend PR diff",
        "CI context",
      ],
      deliverables: ["frontend review summary", "requested changes or approval"],
      verifyCommands: [],
      successCondition: "Frontend PR receives final review feedback or approval and can proceed to merge.",
      escalationIfBlocked: "Escalate to Claude or human if final review cannot run or if unresolved risks remain.",
    },
  };

  return shared[stage];
}

function buildGoal(stage, slice) {
  return `슬라이스 ${slice} ${stage}단계 진행`;
}

export function buildStageDispatch({
  slice,
  stage,
  claudeBudgetState = "available",
  sessionId = null,
  retryAt = null,
  attemptCount = 0,
  forceHumanEscalation = false,
}) {
  const normalizedSlice = ensureNonEmptyString(slice, "slice");
  const normalizedStage = ensureStage(stage);
  const normalizedBudgetState = ensureEnum(
    claudeBudgetState,
    CLAUDE_BUDGET_STATES,
    "claudeBudgetState",
  );
  const spec = productStageSpec(normalizedStage, normalizedSlice);

  if (!spec) {
    throw new Error(`Unsupported stage: ${normalizedStage}`);
  }

  const normalizedSessionId =
    typeof sessionId === "string" && sessionId.trim().length > 0 ? sessionId.trim() : null;
  const normalizedRetryAt =
    typeof retryAt === "string" && retryAt.trim().length > 0 ? retryAt.trim() : null;
  const normalizedAttemptCount =
    Number.isInteger(attemptCount) && attemptCount >= 0 ? attemptCount : 0;
  const sessionRole = resolveStageSessionRole(normalizedStage);
  const resumeMode = normalizedRetryAt
    ? "scheduled_retry"
    : normalizedSessionId
      ? "continue"
      : "fresh";

  const dispatch = {
    stage: normalizedStage,
    actor: spec.actor,
    goal: buildGoal(normalizedStage, normalizedSlice),
    requiredReads: spec.requiredReads,
    deliverables: spec.deliverables,
    verifyCommands: spec.verifyCommands,
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
          reason: "session_unavailable",
          attempt_count: normalizedAttemptCount,
        },
      },
      retryDecision: {
        action: "escalate",
        reason: "session_unavailable",
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
        ...dispatch.statusPatch,
        lifecycle: "blocked",
        approval_state: "awaiting_claude_or_human",
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
        "Claude review resumes on the same session after budget recovers or a human recovery path is explicitly chosen.",
      escalationIfBlocked:
        "Claude is unavailable. Keep the stage blocked for scheduled retry and escalate to human only if the session is lost or retries are exhausted.",
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
  const { workItemPath } = resolveWorkflowPaths(rootDir, workItemId);
  const workItem = readJson(workItemPath);

  return {
    workItemPath,
    workItem,
  };
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
      lifecycle: nextStatusItem.lifecycle,
      approval_state: nextStatusItem.approval_state,
      verification_status: nextStatusItem.verification_status,
    },
  };

  writeJson(workItemPath, nextWorkItem);
  writeJson(statusPath, nextStatusBoard);

  return {
    workItem: nextWorkItem,
    statusBoard: nextStatusBoard,
    statusItem: nextStatusItem,
  };
}
