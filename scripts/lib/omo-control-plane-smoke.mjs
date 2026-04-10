import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { runClaudeCli, runOpencode } from "./omo-lite-runner.mjs";
import {
  resolveClaudeProviderConfig,
  resolveCodexProviderConfig,
} from "./omo-provider-config.mjs";
import {
  resolveStageResultPath,
  validateStageResult,
} from "./omo-stage-result.mjs";
import {
  readRuntimeState,
  writeRuntimeState,
} from "./omo-session-runtime.mjs";

const LIVE_BACKEND_FIX_TOKENS = ["backend-request-1", "backend-request-2"];
const SMOKE_CHECKLIST_IDS = {
  backendDelivery: "delivery-backend-contract",
  backendAcceptance: "accept-backend-api",
  frontendDelivery: "delivery-ui",
  frontendAcceptance: "accept-loading",
};
const LIVE_PROVIDER_STAGE_TIMEOUT_MS = 90_000;

/**
 * @typedef {object} SmokeReviewLoopState
 * @property {number} requested_changes
 * @property {number} code_retries
 * @property {number} approvals
 * @property {boolean} feedback_seen_by_codex
 * @property {string|null} [last_feedback]
 */

/**
 * @typedef {object} SmokeLiveProviderBackendState
 * @property {string[]} requested_tokens
 * @property {string[]} applied_tokens
 * @property {string[]} prompt_feedback_tokens
 */

/**
 * @typedef {object} ControlPlaneSmokeState
 * @property {number} version
 * @property {string} work_item_id
 * @property {Record<string, number>} attempts
 * @property {{ backend: SmokeReviewLoopState, frontend: SmokeReviewLoopState }} review_loops
 * @property {{ backend: SmokeLiveProviderBackendState }} live_provider
 * @property {unknown[]} events
 */

/**
 * @typedef {object} ControlPlaneSmokeStatePathOptions
 * @property {string} [rootDir]
 * @property {string} [workItemId]
 */

/**
 * @typedef {object} SeedControlPlaneSmokeWorkspaceOptions
 * @property {string} [rootDir]
 * @property {string} [workItemId]
 * @property {string} [sandboxRepo]
 */

/**
 * @typedef {object} ControlPlaneStageRunnerArgs
 * @property {string} [rootDir]
 * @property {string} [workItemId]
 * @property {string} [slice]
 * @property {number} stage
 * @property {string} executionDir
 */

/**
 * @typedef {object} ControlPlaneStageRunResult
 * @property {string} artifactDir
 * @property {string} [prompt]
 * @property {unknown} [dispatch]
 * @property {unknown} execution
 * @property {any} stageResult
 */

/**
 * @typedef {object} CreateControlPlaneSmokeStageRunnerOptions
 * @property {string} [rootDir]
 * @property {string} [artifactBaseDir]
 * @property {string} [workItemId]
 * @property {string} [now]
 */

/**
 * @typedef {object} LiveProviderExecuteStageArgs
 * @property {string} rootDir
 * @property {string} executionDir
 * @property {string} workItemId
 * @property {string} [slice]
 * @property {number} stage
 * @property {string} artifactDir
 * @property {string} [provider]
 * @property {string} prompt
 * @property {"opencode"|"claude-cli"} [claudeProvider]
 * @property {string} [claudeBin]
 * @property {string} [claudeModel]
 * @property {"low"|"medium"|"high"} [claudeEffort]
 * @property {string} [opencodeBin]
 * @property {string} [homeDir]
 * @property {Record<string, string>} [environment]
 * @property {string[]} [extraPromptSections]
 * @property {string} [now]
 */

/**
 * @typedef {object} CreateLiveProviderControlPlaneSmokeStageRunnerOptions
 * @property {string} [rootDir]
 * @property {string} [artifactBaseDir]
 * @property {string} [workItemId]
 * @property {string} [now]
 * @property {"opencode"|"claude-cli"} [claudeProvider]
 * @property {string} [claudeBin]
 * @property {string} [claudeModel]
 * @property {"low"|"medium"|"high"} [claudeEffort]
 * @property {string} [opencodeBin]
 * @property {string} [homeDir]
 * @property {Record<string, string>} [environment]
 * @property {(args: LiveProviderExecuteStageArgs) => ControlPlaneStageRunResult} [executeStage]
 * @property {(args: { rootDir: string, workItemId: string, role: string }) => any} [reviewContextReader]
 */

/**
 * @typedef {object} CollectControlPlaneSmokeCheckpointsOptions
 * @property {any} [runtime]
 * @property {Partial<ControlPlaneSmokeState>|null} [smokeState]
 */

function ensureNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }

  return JSON.parse(readFileSync(filePath, "utf8"));
}

function appendUniqueLine(text, line) {
  if (text.includes(line)) {
    return text;
  }

  return `${text.replace(/\s*$/, "")}\n${line}\n`;
}

function uniqueStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(
    values
      .filter((value) => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  )];
}

function pushUniqueValue(values, value) {
  const normalizedValue =
    typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  if (!normalizedValue) {
    return values;
  }

  if (!values.includes(normalizedValue)) {
    values.push(normalizedValue);
  }

  return values;
}

function backendLoopTemplate(workItemId) {
  return [
    "# Backend Review Loop",
    "",
    `- work item: \`${workItemId}\``,
    "",
    "## Tokens",
    "",
    "- [ ] backend-request-1",
    "- [ ] backend-request-2",
    "",
    "## Contract",
    "",
    "- Stage 3 attempt 1 must return `request_changes` with `SMOKE_BACKEND_FIX_TOKEN: backend-request-1`.",
    "- Stage 3 attempt 2 must return `request_changes` with `SMOKE_BACKEND_FIX_TOKEN: backend-request-2` after token 1 is applied.",
    "- Stage 2 retries must only mark a token as applied when the exact token appears in Prior Review Feedback.",
    "- Stage 3 attempt 3 may approve only after both tokens are marked as applied.",
    "",
    "## Applied Notes",
    "",
    "- initial: seeded for live provider smoke",
    "",
  ].join("\n");
}

function resolveBackendReviewLoopPath({
  rootDir,
  workItemId = "99-omo-control-plane-smoke",
} = {}) {
  return join(
    ensureNonEmptyString(rootDir, "rootDir"),
    "smoke",
    "omo-control-plane",
    ensureNonEmptyString(workItemId, "workItemId"),
    "backend-review-loop.md",
  );
}

function extractBackendFixToken(bodyMarkdown) {
  if (typeof bodyMarkdown !== "string" || bodyMarkdown.trim().length === 0) {
    return null;
  }

  const match = bodyMarkdown.match(/SMOKE_BACKEND_FIX_TOKEN:\s*([A-Za-z0-9_-]+)/);
  return match?.[1] ?? null;
}

function readBackendLoopContents({ rootDir, workItemId }) {
  const loopPath = resolveBackendReviewLoopPath({
    rootDir,
    workItemId,
  });

  if (!existsSync(loopPath)) {
    return "";
  }

  return readFileSync(loopPath, "utf8");
}

function isBackendTokenApplied({ rootDir, workItemId, token }) {
  const normalizedToken = ensureNonEmptyString(token, "token");
  return readBackendLoopContents({
    rootDir,
    workItemId,
  }).includes(`- [x] ${normalizedToken}`);
}

function createInitialLiveProviderState() {
  return {
    backend: {
      requested_tokens: [],
      applied_tokens: [],
      prompt_feedback_tokens: [],
    },
  };
}

function createInitialReviewLoopState() {
  return {
    requested_changes: 0,
    code_retries: 0,
    approvals: 0,
    feedback_seen_by_codex: false,
    last_feedback: null,
  };
}

function ensureStatusShape(rootDir) {
  const statusPath = join(rootDir, ".workflow-v2", "status.json");
  const existing = readJsonIfExists(statusPath);
  if (existing) {
    return existing;
  }

  return {
    version: 1,
    project_profile: "homecook",
    updated_at: new Date().toISOString(),
    items: [],
  };
}

function ensureRoadmapContents(rootDir, workItemId) {
  const roadmapPath = join(rootDir, "docs", "workpacks", "README.md");
  const row = `| \`${workItemId}\` | planned | OMO control-plane smoke |`;

  if (!existsSync(roadmapPath)) {
    return [
      "# Workpack Roadmap v2",
      "",
      "## Slice Order",
      "",
      "| Slice | Status | Goal |",
      "| --- | --- | --- |",
      row,
      "",
    ].join("\n");
  }

  return appendUniqueLine(readFileSync(roadmapPath, "utf8"), row);
}

function ensureWorkpackReadme(workItemId) {
  return [
    `# ${workItemId}`,
    "",
    "## Goal",
    "",
    "- OMO control-plane live smoke sandbox slice",
    "",
    "## Branches",
    "",
    `- 백엔드: \`feature/be-${workItemId}\``,
    `- 프론트엔드: \`feature/fe-${workItemId}\``,
    "",
    "## In Scope",
    "",
    "- 화면: control-plane smoke fixtures",
    "- API: supervisor runtime transitions",
    "- 상태 전이: Stage 1~6 autonomous loop",
    "- DB 영향: 없음",
    "- Schema Change:",
    "  - [x] 없음 (읽기 전용)",
    "  - [ ] 있음 → `supabase/migrations/<파일명>.sql` 생성 필요",
    "",
    "## Out of Scope",
    "",
    "- product feature delivery",
    "",
    "## Dependencies",
    "",
    "| 선행 슬라이스 | 상태 | 확인 |",
    "| --- | --- | --- |",
    "| `01-discovery-detail-auth` | bootstrap | [x] |",
    "",
    "## Backend First Contract",
    "",
    "- request: 없음",
    "- response: runtime / stage-result contract",
    "- 권한 / 소유자 검증 / 상태 전이 / 멱등성: workflow-v2 문서 기준",
    "",
    "## Frontend Delivery Mode",
    "",
    "- 디자인 확정 전: 기능 가능한 임시 UI",
    "- 필수 상태: `loading / empty / error / read-only / unauthorized`",
    "- 로그인 보호 액션 없음",
    "",
    "## Design Authority",
    "",
    "- UI risk: `not-required`",
    "- Anchor screen dependency: 없음",
    "- Visual artifact: not-required",
    "- Authority status: `not-required`",
    "- Notes: sandbox smoke fixture only",
    "",
    "## Live Smoke Contract",
    "",
    "- Stage 3 backend review attempt 1 must return `request_changes` and include `SMOKE_BACKEND_FIX_TOKEN: backend-request-1`.",
    "- Stage 3 backend review attempt 2 must return `request_changes` and include `SMOKE_BACKEND_FIX_TOKEN: backend-request-2` after token 1 is applied.",
    `- Stage 2 retries must update \`smoke/omo-control-plane/${workItemId}/backend-review-loop.md\` and mark the requested token as applied.`,
    "- Stage 3 backend review attempt 3 may approve only after both backend tokens are applied.",
    "",
    "## Design Status",
    "",
    "- [x] 임시 UI (temporary)",
    "- [ ] 리뷰 대기 (pending-review)",
    "- [ ] 확정 (confirmed)",
    "- [ ] N/A",
    "",
    "## Source Links",
    "",
    "- `docs/engineering/workflow-v2/README.md`",
    "- `docs/engineering/workflow-v2/omo-autonomous-supervisor.md`",
    "",
    "## QA / Test Data Plan",
    "",
    "- smoke fixture baseline",
    "- sandbox repo only",
    "- seed/reset 없음",
    "- blocker: sandbox repo unavailable",
    "",
    "## Key Rules",
    "",
    "- Stage 2 implementation before doc gate pass is forbidden",
    "- review ping-pong is capped",
    "",
    "## Primary User Path",
    "",
    "1. supervisor starts a sandbox slice",
    "2. stage runner produces deterministic artifacts",
    "3. review loop converges and records checkpoints",
    "",
    "## Delivery Checklist",
    `- [x] 백엔드 계약 고정 <!-- omo:id=${SMOKE_CHECKLIST_IDS.backendDelivery};stage=2;scope=backend;review=3,6 -->`,
    `- [ ] UI 연결 <!-- omo:id=${SMOKE_CHECKLIST_IDS.frontendDelivery};stage=4;scope=frontend;review=5,6 -->`,
    "",
  ].join("\n");
}

function createInitialSmokeState(workItemId) {
  return {
    version: 1,
    work_item_id: workItemId,
    attempts: {},
    review_loops: {
      backend: createInitialReviewLoopState(),
      frontend: createInitialReviewLoopState(),
    },
    live_provider: createInitialLiveProviderState(),
    events: [],
  };
}

function ensureSmokeStateShape(state, workItemId) {
  const base =
    state && typeof state === "object" ? state : createInitialSmokeState(workItemId);

  return {
    version: Number(base.version ?? 1),
    work_item_id:
      typeof base.work_item_id === "string" && base.work_item_id.trim().length > 0
        ? base.work_item_id.trim()
        : workItemId,
    attempts:
      base.attempts && typeof base.attempts === "object" ? { ...base.attempts } : {},
    review_loops: {
      backend: {
        ...createInitialReviewLoopState(),
        ...(base.review_loops?.backend ?? {}),
      },
      frontend: {
        ...createInitialReviewLoopState(),
        ...(base.review_loops?.frontend ?? {}),
      },
    },
    live_provider: {
      backend: {
        requested_tokens: uniqueStringArray(base.live_provider?.backend?.requested_tokens),
        applied_tokens: uniqueStringArray(base.live_provider?.backend?.applied_tokens),
        prompt_feedback_tokens: uniqueStringArray(base.live_provider?.backend?.prompt_feedback_tokens),
      },
    },
    events: Array.isArray(base.events) ? [...base.events] : [],
  };
}

/**
 * @param {ControlPlaneSmokeStatePathOptions} [options]
 */
export function resolveControlPlaneSmokeStatePath({
  rootDir,
  workItemId = "99-omo-control-plane-smoke",
} = {}) {
  return join(
    ensureNonEmptyString(rootDir, "rootDir"),
    "smoke",
    "omo-control-plane",
    ensureNonEmptyString(workItemId, "workItemId"),
    "state.json",
  );
}

/**
 * @param {ControlPlaneSmokeStatePathOptions} [options]
 * @returns {ControlPlaneSmokeState}
 */
export function readControlPlaneSmokeState({
  rootDir,
  workItemId = "99-omo-control-plane-smoke",
} = {}) {
  const statePath = resolveControlPlaneSmokeStatePath({
    rootDir,
    workItemId,
  });

  return ensureSmokeStateShape(
    readJsonIfExists(statePath) ?? createInitialSmokeState(workItemId),
    workItemId,
  );
}

function writeControlPlaneSmokeState({
  rootDir,
  workItemId = "99-omo-control-plane-smoke",
  state,
}) {
  const statePath = resolveControlPlaneSmokeStatePath({
    rootDir,
    workItemId,
  });
  mkdirSync(resolve(statePath, ".."), { recursive: true });
  const normalizedState = ensureSmokeStateShape(state, workItemId);
  writeFileSync(statePath, `${JSON.stringify(normalizedState, null, 2)}\n`);
  return normalizedState;
}

export function assertSafeSandboxRepoRef(repoRef) {
  const normalizedRepoRef = ensureNonEmptyString(repoRef, "sandboxRepo");
  if (/^homecook$/i.test(normalizedRepoRef) || /(^|\/)homecook$/i.test(normalizedRepoRef)) {
    throw new Error("Control-plane smoke must run against a dedicated sandbox repo, not homecook.");
  }

  return normalizedRepoRef;
}

/**
 * @param {SeedControlPlaneSmokeWorkspaceOptions} [options]
 */
export function seedControlPlaneSmokeWorkspace({
  rootDir,
  workItemId = "99-omo-control-plane-smoke",
  sandboxRepo,
} = {}) {
  const normalizedRootDir = ensureNonEmptyString(rootDir, "rootDir");
  const normalizedWorkItemId = ensureNonEmptyString(workItemId, "workItemId");
  const normalizedSandboxRepo = ensureNonEmptyString(sandboxRepo, "sandboxRepo");
  const workItemsDir = join(normalizedRootDir, ".workflow-v2", "work-items");
  const workItemPath = join(workItemsDir, `${normalizedWorkItemId}.json`);
  const statusPath = join(normalizedRootDir, ".workflow-v2", "status.json");
  const workpackDir = join(normalizedRootDir, "docs", "workpacks", normalizedWorkItemId);
  const acceptancePath = join(workpackDir, "acceptance.md");
  const workpackReadmePath = join(workpackDir, "README.md");
  const automationSpecPath = join(workpackDir, "automation-spec.json");
  const roadmapPath = join(normalizedRootDir, "docs", "workpacks", "README.md");
  const smokeNotesPath = join(normalizedRootDir, "smoke", "omo-control-plane", normalizedWorkItemId, "README.md");
  const backendLoopPath = resolveBackendReviewLoopPath({
    rootDir: normalizedRootDir,
    workItemId: normalizedWorkItemId,
  });
  const smokeStatePath = resolveControlPlaneSmokeStatePath({
    rootDir: normalizedRootDir,
    workItemId: normalizedWorkItemId,
  });

  mkdirSync(workItemsDir, { recursive: true });
  mkdirSync(workpackDir, { recursive: true });
  mkdirSync(join(normalizedRootDir, "smoke", "omo-control-plane", normalizedWorkItemId), { recursive: true });

  const workItem = {
    id: normalizedWorkItemId,
    title: "OMO control-plane smoke",
    project_profile: "homecook",
    change_type: "product",
    surface: "fullstack",
    risk: "medium",
    preset: "vertical-slice-strict",
    goal: "Verify the workflow-v2 supervisor control plane in a dedicated sandbox repository.",
    owners: {
      claude: "sparse-review-and-approval",
      codex: "implementation-and-integration",
      workers: ["testing"],
    },
    docs_refs: {
      source_of_truth: ["AGENTS.md"],
      governing_docs: [
        "docs/engineering/workflow-v2/README.md",
        "docs/engineering/workflow-v2/omo-autonomous-supervisor.md",
      ],
    },
    workflow: {
      plan_loop: "recommended",
      review_loop: "required",
      external_smokes: ["pnpm omo:smoke:control-plane"],
      execution_mode: "autonomous",
      merge_policy: "conditional-auto",
      max_fix_rounds: {
        backend: 0,
        frontend: 0,
      },
    },
    verification: {
      required_checks: ["pnpm validate:workflow-v2"],
      verify_commands: ["pnpm validate:workflow-v2"],
      evaluator_commands: [],
      artifact_assertions: [],
    },
    status: {
      lifecycle: "planned",
      approval_state: "not_started",
      verification_status: "pending",
      evaluation_status: "not_started",
      evaluation_round: 0,
      last_evaluator_result: null,
      auto_merge_eligible: false,
      blocked_reason_code: null,
    },
    notes: {
      sandbox_repo: normalizedSandboxRepo,
    },
  };

  const statusData = ensureStatusShape(normalizedRootDir);
  const items = Array.isArray(statusData.items) ? [...statusData.items] : [];
  const existingIndex = items.findIndex((item) => item?.id === normalizedWorkItemId);
  const nextStatusItem = {
    id: normalizedWorkItemId,
    preset: workItem.preset,
    branch: `ops/omo-${normalizedWorkItemId}-runtime-anchor`,
    lifecycle: "planned",
    approval_state: "not_started",
    verification_status: "pending",
    required_checks: workItem.verification.required_checks,
    pr_path: null,
    notes: `sandbox_repo=${normalizedSandboxRepo}`,
  };

  if (existingIndex >= 0) {
    items[existingIndex] = nextStatusItem;
  } else {
    items.push(nextStatusItem);
  }

  statusData.items = items;
  statusData.updated_at = new Date().toISOString();

  const previousWorkItem = readJsonIfExists(workItemPath);
  const previousStatus = readJsonIfExists(statusPath);
  const previousRoadmap = existsSync(roadmapPath) ? readFileSync(roadmapPath, "utf8") : null;
  const previousWorkpack = existsSync(workpackReadmePath) ? readFileSync(workpackReadmePath, "utf8") : null;
  const previousAcceptance = existsSync(acceptancePath) ? readFileSync(acceptancePath, "utf8") : null;
  const previousSmokeNotes = existsSync(smokeNotesPath) ? readFileSync(smokeNotesPath, "utf8") : null;
  const previousBackendLoop = existsSync(backendLoopPath) ? readFileSync(backendLoopPath, "utf8") : null;
  const previousSmokeState = readJsonIfExists(smokeStatePath);
  const previousAutomationSpec = existsSync(automationSpecPath)
    ? readFileSync(automationSpecPath, "utf8")
    : null;

  writeFileSync(workItemPath, `${JSON.stringify(workItem, null, 2)}\n`);
  writeFileSync(statusPath, `${JSON.stringify(statusData, null, 2)}\n`);
  writeFileSync(roadmapPath, ensureRoadmapContents(normalizedRootDir, normalizedWorkItemId));
  writeFileSync(workpackReadmePath, ensureWorkpackReadme(normalizedWorkItemId));
  writeFileSync(
    automationSpecPath,
    `${JSON.stringify(
      {
        slice_id: normalizedWorkItemId,
        execution_mode: "autonomous",
        risk_class: "medium",
        merge_policy: "conditional-auto",
        backend: {
          required_endpoints: ["POST /internal/omo/control-plane-smoke"],
          invariants: ["deterministic-review-loop"],
          verify_commands: [],
          required_test_targets: ["tests/omo-control-plane-smoke.test.ts"],
        },
        frontend: {
          required_routes: ["/omo/control-plane-smoke"],
          required_states: ["loading"],
          playwright_projects: [],
          artifact_assertions: ["smoke/omo-control-plane"],
        },
        external_smokes: ["true"],
        blocked_conditions: [],
        max_fix_rounds: {
          backend: 0,
          frontend: 0,
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    acceptancePath,
    [
      "# Acceptance Checklist",
      "",
      "## Happy Path",
      `- [x] API 응답 형식이 { success, data, error }를 따른다 <!-- omo:id=${SMOKE_CHECKLIST_IDS.backendAcceptance};stage=2;scope=backend;review=3,6 -->`,
      `- [ ] loading 상태가 있다 <!-- omo:id=${SMOKE_CHECKLIST_IDS.frontendAcceptance};stage=4;scope=frontend;review=5,6 -->`,
      "",
      "## State / Policy",
      "- smoke state transition contract is documented in workflow-v2 fixtures",
      "",
      "## Error / Permission",
      "- smoke error handling is exercised through deterministic request-changes loops",
      "",
      "## Data Integrity",
      "- smoke artifacts must stay deterministic across retries",
      "",
      "## Data Setup / Preconditions",
      "- sandbox repo and smoke fixture baseline are prepared before execution",
      "",
      "## Manual QA",
      "- verifier: smoke harness",
      "- environment: sandbox repo",
      "- scenarios: backend iterative review loop",
      "",
      "## Automation Split",
      "",
      "### Vitest",
      "- deterministic smoke validations run through dedicated Vitest coverage",
      "",
      "### Playwright",
      "- no browser automation is required for this sandbox smoke",
      "",
      "### Manual Only",
      "- [ ] live OAuth smoke",
      "",
    ].join("\n"),
  );
  writeFileSync(
    smokeNotesPath,
    [
      `# ${normalizedWorkItemId}`,
      "",
      "- dedicated sandbox repo smoke workspace",
      "- live provider smoke verifies the backend request-changes loop with machine-readable token markers",
      "",
    ].join("\n"),
  );
  writeFileSync(backendLoopPath, backendLoopTemplate(normalizedWorkItemId));
  writeControlPlaneSmokeState({
    rootDir: normalizedRootDir,
    workItemId: normalizedWorkItemId,
    state: previousSmokeState ?? createInitialSmokeState(normalizedWorkItemId),
  });

  const changed =
    JSON.stringify(previousWorkItem) !== JSON.stringify(workItem) ||
    JSON.stringify(previousStatus) !== JSON.stringify(statusData) ||
    previousRoadmap !== ensureRoadmapContents(normalizedRootDir, normalizedWorkItemId) ||
    previousWorkpack !== ensureWorkpackReadme(normalizedWorkItemId) ||
    previousAutomationSpec === null ||
    previousAcceptance === null ||
    previousSmokeNotes === null ||
    previousBackendLoop === null ||
    previousSmokeState === null;

  return {
    changed,
    workItemPath,
    statusPath,
    roadmapPath,
    workpackReadmePath,
    acceptancePath,
    smokeNotesPath,
    backendLoopPath,
    smokeStatePath,
  };
}

function stageArtifactDir(artifactBaseDir, stage, attempt) {
  return resolve(artifactBaseDir, `stage-${stage}-attempt-${attempt}`);
}

function resolveLiveProviderSmokeDir({
  rootDir,
  workItemId = "99-omo-control-plane-smoke",
} = {}) {
  return resolve(
    ensureNonEmptyString(rootDir, "rootDir"),
    "smoke",
    "omo-control-plane",
    ensureNonEmptyString(workItemId, "workItemId"),
  );
}

function resolveCanonicalPath(targetPath) {
  const normalizedPath = ensureNonEmptyString(targetPath, "targetPath");

  try {
    return realpathSync(normalizedPath);
  } catch {
    return normalizedPath;
  }
}

function formatJsonCodeBlock(value) {
  return ["```json", JSON.stringify(value, null, 2), "```"].join("\n");
}

function writeSmokeFile(executionDir, relativePath, contents) {
  const targetPath = resolve(executionDir, relativePath);
  mkdirSync(resolve(targetPath, ".."), { recursive: true });
  writeFileSync(targetPath, contents);
}

function readRuntimeReviewContext({ rootDir, workItemId, role }) {
  const runtimePath = join(rootDir, ".opencode", "omo-runtime", `${workItemId}.json`);
  const runtime = readJsonIfExists(runtimePath);
  const reviewEntry = runtime?.last_review?.[role];

  if (!reviewEntry || typeof reviewEntry !== "object") {
    return null;
  }

  return reviewEntry;
}

function createSmokeEvent({
  stage,
  attempt,
  actor,
  outcome,
  artifactDir,
  reviewFeedbackSeen = false,
}) {
  return {
    stage,
    attempt,
    actor,
    outcome,
    artifact_dir: artifactDir,
    review_feedback_seen: reviewFeedbackSeen,
    updated_at: new Date().toISOString(),
  };
}

function buildCodeStageResult({ stage, workItemId, attempt }) {
  const prefix = stage === 1 ? "docs" : "feat";
  const summary = stage === 1 ? "docs smoke" : stage === 2 ? "backend smoke" : "frontend smoke";
  const changedFile =
    stage === 2
      ? `smoke/omo-control-plane/${workItemId}/backend.txt`
      : stage === 4
        ? `smoke/omo-control-plane/${workItemId}/frontend.txt`
        : `docs/workpacks/${workItemId}/README.md`;

  return {
    result: "done",
    summary_markdown: `${summary} complete (attempt ${attempt})`,
    commit: {
      subject: `${prefix}: ${workItemId} smoke stage ${stage} attempt ${attempt}`,
      body_markdown: `OMO control-plane smoke stage ${stage} attempt ${attempt} generated a deterministic artifact.`,
    },
    pr: {
      title: `${prefix}: ${workItemId} smoke stage ${stage} attempt ${attempt}`,
      body_markdown: "## Summary\n- OMO control-plane smoke",
    },
    checks_run: ["pnpm validate:workflow-v2"],
    next_route: stage === 1 ? "open_pr" : "wait_for_ci",
    claimed_scope: {
      files: [changedFile],
      endpoints: [],
      routes: [],
      states: [],
      invariants: [],
    },
    changed_files: [changedFile],
    tests_touched: [],
    artifacts_written: [],
    checklist_updates:
      stage === 2
        ? [
            {
              id: SMOKE_CHECKLIST_IDS.backendDelivery,
              status: "checked",
              evidence_refs: ["pnpm validate:workflow-v2"],
            },
            {
              id: SMOKE_CHECKLIST_IDS.backendAcceptance,
              status: "checked",
              evidence_refs: ["pnpm validate:workflow-v2"],
            },
          ]
        : stage === 4
          ? [
              {
                id: SMOKE_CHECKLIST_IDS.frontendDelivery,
                status: "checked",
                evidence_refs: ["pnpm validate:workflow-v2"],
              },
              {
                id: SMOKE_CHECKLIST_IDS.frontendAcceptance,
                status: "checked",
                evidence_refs: ["pnpm validate:workflow-v2"],
            },
          ]
          : [],
    contested_fix_ids: [],
    rebuttals: [],
  };
}

function buildReviewStageResult({ stage, attempt }) {
  const reviewedChecklistIds =
    stage === 3
      ? [SMOKE_CHECKLIST_IDS.backendDelivery, SMOKE_CHECKLIST_IDS.backendAcceptance]
      : stage === 5
        ? [SMOKE_CHECKLIST_IDS.frontendDelivery, SMOKE_CHECKLIST_IDS.frontendAcceptance]
        : [
            SMOKE_CHECKLIST_IDS.backendDelivery,
            SMOKE_CHECKLIST_IDS.backendAcceptance,
            SMOKE_CHECKLIST_IDS.frontendDelivery,
            SMOKE_CHECKLIST_IDS.frontendAcceptance,
          ];
  if (stage === 3 && attempt <= 2) {
    return {
      decision: "request_changes",
      body_markdown: `Backend smoke review loop request ${attempt}: tighten the API contract and rerun the backend stage.`,
      route_back_stage: 2,
      approved_head_sha: null,
      review_scope: {
        scope: "backend",
        checklist_ids: reviewedChecklistIds,
      },
      reviewed_checklist_ids: reviewedChecklistIds,
      required_fix_ids: [SMOKE_CHECKLIST_IDS.backendAcceptance],
      waived_fix_ids: [],
      findings: [
        {
          file: "app/api/v1/smoke-backend/route.ts",
          line_hint: 1,
          severity: "major",
          category: "contract",
          issue: `Backend smoke request ${attempt} still needs a tighter API contract.`,
          suggestion: "Apply the requested backend smoke fix and rerun Stage 2.",
        },
      ],
    };
  }

  if (stage === 5 && attempt === 1) {
    return {
      decision: "request_changes",
      body_markdown: "Frontend smoke review loop request: adjust the UI state copy and rerun the frontend stage.",
      route_back_stage: 4,
      approved_head_sha: null,
      review_scope: {
        scope: "frontend",
        checklist_ids: reviewedChecklistIds,
      },
      reviewed_checklist_ids: reviewedChecklistIds,
      required_fix_ids: [SMOKE_CHECKLIST_IDS.frontendDelivery],
      waived_fix_ids: [],
      findings: [
        {
          file: "app/smoke/frontend/page.tsx",
          line_hint: 1,
          severity: "major",
          category: "logic",
          issue: "Frontend smoke UI state copy still needs adjustment.",
          suggestion: "Update the requested UI copy and rerun Stage 4.",
        },
      ],
    };
  }

  if (stage === 6 && attempt === 1) {
    return {
      decision: "request_changes",
      body_markdown: "Frontend smoke review loop request: closeout checklist and CTA polish still need another frontend pass.",
      route_back_stage: 4,
      approved_head_sha: null,
      review_scope: {
        scope: "closeout",
        checklist_ids: reviewedChecklistIds,
      },
      reviewed_checklist_ids: reviewedChecklistIds,
      required_fix_ids: [SMOKE_CHECKLIST_IDS.frontendAcceptance],
      waived_fix_ids: [],
      findings: [
        {
          file: "app/smoke/frontend/page.tsx",
          line_hint: 1,
          severity: "major",
          category: "logic",
          issue: "Closeout CTA polish is incomplete in the smoke frontend pass.",
          suggestion: "Apply the closeout polish feedback and rerun Stage 4.",
        },
      ],
    };
  }

  return {
    decision: "approve",
    body_markdown: `## Review\n- OMO smoke stage ${stage} approve (attempt ${attempt})`,
    route_back_stage: null,
    approved_head_sha: null,
    review_scope: {
      scope: stage === 3 ? "backend" : stage === 5 ? "frontend" : "closeout",
      checklist_ids: reviewedChecklistIds,
    },
    reviewed_checklist_ids: reviewedChecklistIds,
    required_fix_ids: [],
    waived_fix_ids: [],
  };
}

/**
 * @param {CreateControlPlaneSmokeStageRunnerOptions} [options]
 * @returns {(args: ControlPlaneStageRunnerArgs) => ControlPlaneStageRunResult}
 */
export function createControlPlaneSmokeStageRunner({
  rootDir = process.cwd(),
  artifactBaseDir = resolve(rootDir, ".artifacts", "omo-control-plane-smoke"),
  workItemId = "99-omo-control-plane-smoke",
  now = new Date().toISOString(),
} = {}) {
  return ({ stage, executionDir }) => {
    const smokeState = readControlPlaneSmokeState({
      rootDir,
      workItemId,
    });
    const attempt = Number(smokeState.attempts?.[String(stage)] ?? 0) + 1;
    const artifactDir = stageArtifactDir(artifactBaseDir, stage, attempt);
    const normalizedExecutionDir = ensureNonEmptyString(executionDir, "executionDir");
    let reviewFeedbackSeen = false;
    let outcome = "approve";

    smokeState.attempts[String(stage)] = attempt;

    if (stage === 1) {
      const roadmapPath = resolve(normalizedExecutionDir, "docs", "workpacks", "README.md");
      const workpackReadmePath = resolve(normalizedExecutionDir, "docs", "workpacks", workItemId, "README.md");
      if (existsSync(roadmapPath)) {
        writeFileSync(
          roadmapPath,
          readFileSync(roadmapPath, "utf8").replace(
            `| \`${workItemId}\` | planned | OMO control-plane smoke |`,
            `| \`${workItemId}\` | docs | OMO control-plane smoke |`,
          ),
        );
      }
      if (existsSync(workpackReadmePath)) {
        writeFileSync(
          workpackReadmePath,
          appendUniqueLine(
            readFileSync(workpackReadmePath, "utf8"),
            `- Stage 1 docs smoke touched this workpack at ${now}`,
          ),
        );
      }
    }

    if (stage === 2) {
      if (attempt > 1) {
        const reviewContext = readRuntimeReviewContext({
          rootDir,
          workItemId,
          role: "backend",
        });

        if (
          typeof reviewContext?.body_markdown === "string" &&
          reviewContext.body_markdown.includes("Backend smoke review loop request")
        ) {
          smokeState.review_loops.backend.code_retries += 1;
          smokeState.review_loops.backend.feedback_seen_by_codex = true;
          smokeState.review_loops.backend.last_feedback = reviewContext.body_markdown;
          reviewFeedbackSeen = true;
        }
      }

      writeSmokeFile(
        normalizedExecutionDir,
        `smoke/omo-control-plane/${workItemId}/backend.txt`,
        `backend smoke stage completed at ${now} (attempt ${attempt})\n`,
      );
    }

    if (stage === 4) {
      if (attempt > 1) {
        const reviewContext = readRuntimeReviewContext({
          rootDir,
          workItemId,
          role: "frontend",
        });

        if (
          typeof reviewContext?.body_markdown === "string" &&
          reviewContext.body_markdown.includes("Frontend smoke review loop request")
        ) {
          smokeState.review_loops.frontend.code_retries += 1;
          smokeState.review_loops.frontend.feedback_seen_by_codex = true;
          smokeState.review_loops.frontend.last_feedback = reviewContext.body_markdown;
          reviewFeedbackSeen = true;
        }
      }

      writeSmokeFile(
        normalizedExecutionDir,
        `smoke/omo-control-plane/${workItemId}/frontend.txt`,
        `frontend smoke stage completed at ${now} (attempt ${attempt})\n`,
      );
      const workpackReadmePath = resolve(normalizedExecutionDir, "docs", "workpacks", workItemId, "README.md");
      const acceptancePath = resolve(normalizedExecutionDir, "docs", "workpacks", workItemId, "acceptance.md");
      if (existsSync(workpackReadmePath)) {
        const readmeContents = readFileSync(workpackReadmePath, "utf8");
        writeFileSync(
          workpackReadmePath,
          readmeContents.replace(
            new RegExp(`- \\[ \\] UI 연결 <!-- omo:id=${SMOKE_CHECKLIST_IDS.frontendDelivery};stage=4;scope=frontend;review=5,6 -->`),
            `- [x] UI 연결 <!-- omo:id=${SMOKE_CHECKLIST_IDS.frontendDelivery};stage=4;scope=frontend;review=5,6 -->`,
          ),
        );
      }
      if (existsSync(acceptancePath)) {
        const acceptanceContents = readFileSync(acceptancePath, "utf8");
        writeFileSync(
          acceptancePath,
          acceptanceContents.replace(
            new RegExp(`- \\[ \\] loading 상태가 있다 <!-- omo:id=${SMOKE_CHECKLIST_IDS.frontendAcceptance};stage=4;scope=frontend;review=5,6 -->`),
            `- [x] loading 상태가 있다 <!-- omo:id=${SMOKE_CHECKLIST_IDS.frontendAcceptance};stage=4;scope=frontend;review=5,6 -->`,
          ),
        );
      }
    }

    if (stage === 3) {
      outcome = attempt <= 2 ? "request_changes" : "approve";
      if (attempt <= 2) {
        smokeState.review_loops.backend.requested_changes += 1;
      } else {
        smokeState.review_loops.backend.approvals += 1;
      }
    }

    if (stage === 5) {
      outcome = attempt === 1 ? "request_changes" : "approve";
      if (attempt === 1) {
        smokeState.review_loops.frontend.requested_changes += 1;
      } else {
        smokeState.review_loops.frontend.approvals += 1;
      }
    }

    if (stage === 6) {
      outcome = attempt === 1 ? "request_changes" : "approve";
      if (attempt === 1) {
        smokeState.review_loops.frontend.requested_changes += 1;
      } else {
        smokeState.review_loops.frontend.approvals += 1;
      }
    }

    const stageResult =
      [1, 2, 4].includes(stage)
        ? buildCodeStageResult({ stage, workItemId, attempt })
        : buildReviewStageResult({ stage, attempt });

    smokeState.events.push(
      createSmokeEvent({
        stage,
        attempt,
        actor: [1, 3, 5, 6].includes(stage) ? "claude" : "codex",
        outcome,
        artifactDir,
        reviewFeedbackSeen,
      }),
    );
    writeControlPlaneSmokeState({
      rootDir,
      workItemId,
      state: smokeState,
    });

    let runtimeSync = null;
    if ([2, 4].includes(stage)) {
      mkdirSync(artifactDir, { recursive: true });
      const stageResultPath = resolveStageResultPath(artifactDir);
      writeFileSync(stageResultPath, `${JSON.stringify(stageResult, null, 2)}\n`);
      runtimeSync = {
        state: writeRuntimeState({
          rootDir,
          workItemId,
          state: {
            ...readRuntimeState({
              rootDir,
              workItemId,
              slice: workItemId,
            }).state,
            slice: workItemId,
            current_stage: stage,
            active_stage: stage,
            phase: "stage_result_ready",
            next_action: "finalize_stage",
            last_artifact_dir: artifactDir,
            execution: {
              provider: stage === 2 ? "opencode" : "opencode",
              session_role: "codex_primary",
              session_id: "ses_omo_codex_smoke",
              artifact_dir: artifactDir,
              stage_result_path: stageResultPath,
              started_at: now,
              finished_at: now,
              verify_commands: [],
              verify_bucket: null,
              commit_sha: null,
              pr_role: stage === 2 ? "backend" : "frontend",
            },
          },
        }).state,
      };
    }

    return {
      artifactDir,
      dispatch: {
        actor: [1, 3, 5, 6].includes(stage) ? "claude" : "codex",
        stage,
      },
      execution: {
        mode: "execute",
        executed: true,
        provider: [1, 3, 5, 6].includes(stage) ? "claude-cli" : "opencode",
        sessionId: [1, 3, 5, 6].includes(stage) ? "ses_omo_claude_smoke" : "ses_omo_codex_smoke",
      },
      runtimeSync,
      stageResult,
    };
  };
}

function buildLiveProviderStageResultTemplate({ stage, attempt, workItemId }) {
  if (stage === 2) {
    return {
      result: "done",
      summary_markdown:
        attempt > 1
          ? `backend live smoke token applied (${workItemId})`
          : `backend live smoke baseline preserved (${workItemId})`,
      commit: {
        subject: `feat: ${workItemId} backend live smoke`,
        body_markdown: "apply requested smoke token only",
      },
      pr: {
        title: `feat: ${workItemId} backend live smoke`,
        body_markdown: "## Summary\n- backend live smoke token reflection only",
      },
      checks_run: ["pnpm validate:workflow-v2"],
      next_route: "wait_for_ci",
    };
  }

  if (attempt <= LIVE_BACKEND_FIX_TOKENS.length) {
    return {
      decision: "request_changes",
      body_markdown: [
        `SMOKE_BACKEND_FIX_TOKEN: ${LIVE_BACKEND_FIX_TOKENS[attempt - 1]}`,
        `SMOKE_BACKEND_LOOP_FILE: smoke/omo-control-plane/${workItemId}/backend-review-loop.md`,
        `Mark \`- [x] ${LIVE_BACKEND_FIX_TOKENS[attempt - 1]}\` in the loop file and rerun Stage 2.`,
      ].join("\n"),
      route_back_stage: 2,
      approved_head_sha: null,
      findings: [
        {
          file: `smoke/omo-control-plane/${workItemId}/backend-review-loop.md`,
          line_hint: 1,
          severity: "major",
          category: "tests",
          issue: `Live smoke token ${LIVE_BACKEND_FIX_TOKENS[attempt - 1]} has not been reflected yet.`,
          suggestion: "Reflect the requested live smoke token and rerun Stage 2.",
        },
      ],
    };
  }

  return {
    decision: "approve",
    body_markdown: "## Review\n- backend live smoke approve",
    route_back_stage: null,
    approved_head_sha: null,
  };
}

function buildMinimalLiveProviderPrompt({
  stage,
  attempt,
  workItemId,
  stageResultPath,
  smokeExecutionDir,
  extraPromptSections = [],
  reviewContext = null,
}) {
  const backendLoopFile = `smoke/omo-control-plane/${workItemId}/backend-review-loop.md`;
  const localLoopFile = "backend-review-loop.md";
  const stageResultTemplate = buildLiveProviderStageResultTemplate({
    stage,
    attempt,
    workItemId,
  });
  const stageSpecificInstructions =
    stage === 2
      ? [
          "## Task",
          "- This smoke validates only whether Codex reflects Claude review feedback in the loop file.",
          "- Only read and update the files listed below.",
          "- Read `backend-review-loop.md` in the current working directory.",
          attempt > 1
            ? "- Read Prior Review Feedback, extract the exact `SMOKE_BACKEND_FIX_TOKEN`, and flip only that checklist item from `[ ]` to `[x]`."
            : "- Preserve the loop file exactly as seeded. Do not mark any token during the first backend implementation pass.",
          "- Do not inspect other repo files. Do not run tests. Do not run git. Do not browse the repository.",
          "- Write the stage-result JSON before finishing.",
          "- Keep the change tiny and focused on the loop file only.",
        ]
      : [
          "## Task",
          "- This smoke validates only whether Claude emits deterministic review feedback for Codex to reflect.",
          "- Only read and update the files listed below.",
          "- Read `backend-review-loop.md` in the current working directory.",
          attempt <= LIVE_BACKEND_FIX_TOKENS.length
            ? "- Return `decision: request_changes` with the exact token and loop-file lines required by the smoke contract."
            : "- Approve only when both backend tokens are marked as applied in the loop file.",
          "- Do not inspect other repo files. Do not run tests. Do not run git. Do not browse the repository.",
          "- Write the stage-result JSON before finishing.",
          "- Keep `body_markdown` short and contract-focused.",
        ];

  return [
    "# OMO Control-Plane Live Provider Smoke",
    "",
    "- mode: minimal confirmation-only provider run",
    `- actor: \`${stage === 2 ? "codex" : "claude"}\``,
    `- stage: \`${stage}\``,
    `- attempt: \`${attempt}\``,
    `- work item: \`${workItemId}\``,
    "",
    "## Scope",
    "- This run exists only to prove the review token loop, not product correctness.",
    "- Only read and update the files listed below.",
    "- Treat everything outside these files as out of scope.",
    "",
    "## Files",
    `- current working directory: \`${smokeExecutionDir}\``,
    `- loop file in cwd: \`${localLoopFile}\``,
    `- canonical repo path: \`${backendLoopFile}\``,
    `- stage result output: \`${stageResultPath}\``,
    "",
    ...stageSpecificInstructions,
    "",
    "## Exact Contract",
    ...(extraPromptSections.length > 0 ? extraPromptSections : ["- Follow the minimal smoke contract only."]),
    "",
    reviewContext?.body_markdown ? "## Prior Review Feedback" : null,
    reviewContext?.body_markdown ?? null,
    "",
    "## Stage Result JSON",
    `- Write JSON to \`${stageResultPath}\`.`,
    formatJsonCodeBlock(stageResultTemplate),
    stage === 2
      ? "- Required keys: result, summary_markdown, commit.subject, pr.title, pr.body_markdown, checks_run, next_route"
      : "- Required keys: decision, body_markdown, route_back_stage, approved_head_sha",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * @param {LiveProviderExecuteStageArgs & { timeoutMs?: number }} options
 * @returns {ControlPlaneStageRunResult}
 */
function executeMinimalLiveProviderStage({
  rootDir,
  artifactDir,
  stage,
  prompt,
  executionDir,
  claudeProvider,
  claudeBin,
  claudeModel,
  claudeEffort,
  opencodeBin,
  homeDir,
  environment,
  timeoutMs = LIVE_PROVIDER_STAGE_TIMEOUT_MS,
}) {
  mkdirSync(artifactDir, { recursive: true });
  const stageResultPath = resolveStageResultPath(artifactDir);
  const canonicalExecutionDir = resolveCanonicalPath(executionDir);
  const localStageResultPath = resolve(canonicalExecutionDir, ".omo-live-stage-result.json");
  rmSync(localStageResultPath, { force: true });
  writeFileSync(resolve(artifactDir, "prompt.md"), `${prompt}\n`);

  let execution;
  let provider;

  if (stage === 2) {
    const codexConfig = resolveCodexProviderConfig({
      rootDir,
      bin: opencodeBin,
      environment,
      homeDir,
    });
    provider = "opencode";
    execution = runOpencode({
      executionDir: canonicalExecutionDir,
      artifactDir,
      prompt,
      agent: codexConfig.agent,
      model: codexConfig.model,
      variant: codexConfig.variant,
      sessionId: null,
      opencodeBin: codexConfig.bin,
      environment: {
        ...(environment ?? {}),
        OMO_LIVE_PROVIDER_SMOKE: "1",
      },
      stageResultPath: localStageResultPath,
      timeoutMs,
    });
  } else if (stage === 3) {
    const claudeConfig = resolveClaudeProviderConfig({
      rootDir,
      provider: claudeProvider,
      bin: claudeBin,
      model: claudeModel,
      effort: claudeEffort,
    });
    if (claudeConfig.provider !== "claude-cli") {
      throw new Error("Live provider smoke review loop requires Claude CLI for Stage 3.");
    }
    provider = "claude-cli";
    execution = runClaudeCli({
      executionDir: canonicalExecutionDir,
      artifactDir,
      prompt,
      sessionId: null,
      claudeBin: claudeConfig.bin,
      claudeModel: claudeConfig.model,
      claudeEffort: claudeConfig.effort ?? "low",
      permissionMode: claudeConfig.permissionMode,
      environment: {
        ...(environment ?? {}),
        OMO_LIVE_PROVIDER_SMOKE: "1",
      },
      homeDir,
      stageResultPath: localStageResultPath,
      timeoutMs,
    });
  } else {
    throw new Error(`Minimal live provider smoke only supports stages 2 and 3. Received stage ${stage}.`);
  }

  writeFileSync(
    resolve(artifactDir, "run-metadata.json"),
    `${JSON.stringify(
      {
        stage,
        provider,
        executionDir: canonicalExecutionDir,
        timeoutMs,
        stageResultPath,
        localStageResultPath,
      },
      null,
      2,
    )}\n`,
  );

  const rawStageResult = existsSync(localStageResultPath)
    ? JSON.parse(readFileSync(localStageResultPath, "utf8"))
    : null;
  if (!rawStageResult) {
    throw new Error(
      `Live provider smoke expected ${localStageResultPath} to be written before copying it to ${stageResultPath}.`,
    );
  }

  writeFileSync(stageResultPath, `${JSON.stringify(rawStageResult, null, 2)}\n`);
  rmSync(localStageResultPath, { force: true });

  return {
    artifactDir,
    prompt,
    execution,
    stageResult: validateStageResult(stage, rawStageResult),
  };
}

function buildLiveProviderPromptSections({
  stage,
  attempt,
  workItemId,
  expectedToken = null,
}) {
  const backendLoopFile = `smoke/omo-control-plane/${workItemId}/backend-review-loop.md`;

  if (stage === 2) {
    return [
      [
        "## Live Provider Smoke Contract",
        "- This is a live smoke validation run for the backend review loop.",
        `- Maintain \`${backendLoopFile}\` as the canonical marker file for backend review feedback.`,
        "- Never mark a backend token as applied unless the exact token appears in Prior Review Feedback.",
        expectedToken
          ? `- Prior Review Feedback includes \`SMOKE_BACKEND_FIX_TOKEN: ${expectedToken}\`. You must change the loop file so it contains \`- [x] ${expectedToken}\`.`
          : "- On the first backend implementation pass, leave all backend tokens unchecked.",
        expectedToken
          ? `- Mention \`${expectedToken}\` in summary_markdown after you apply it.`
          : "- Create or preserve the loop file without inventing fake approvals.",
      ].join("\n"),
    ];
  }

  if (stage === 3 && attempt <= LIVE_BACKEND_FIX_TOKENS.length) {
    const token = expectedToken ?? LIVE_BACKEND_FIX_TOKENS[attempt - 1];
    return [
      [
        "## Live Provider Smoke Contract",
        `- This is backend review attempt ${attempt} for the live smoke contract.`,
        "- You MUST return `decision: request_changes` on this attempt.",
        `- Include the exact line \`SMOKE_BACKEND_FIX_TOKEN: ${token}\` in body_markdown.`,
        `- Include the exact line \`SMOKE_BACKEND_LOOP_FILE: ${backendLoopFile}\` in body_markdown.`,
        `- Tell Codex to mark \`- [x] ${token}\` in \`${backendLoopFile}\` before rerunning Stage 2.`,
        "- Do not approve on this attempt even if the diff looks otherwise acceptable.",
      ].join("\n"),
    ];
  }

  if (stage === 3 && attempt > LIVE_BACKEND_FIX_TOKENS.length) {
    return [
      [
        "## Live Provider Smoke Contract",
        `- Inspect \`${backendLoopFile}\` before deciding.`,
        `- If both \`${LIVE_BACKEND_FIX_TOKENS[0]}\` and \`${LIVE_BACKEND_FIX_TOKENS[1]}\` are marked as applied, return \`decision: approve\`.`,
        "- If any required token is still missing, return `request_changes` for the first missing token instead of approving.",
      ].join("\n"),
    ];
  }

  return [];
}

function recordSmokeEvent({
  rootDir,
  workItemId,
  smokeState,
  stage,
  attempt,
  artifactDir,
  reviewFeedbackSeen,
  outcome,
}) {
  smokeState.events.push(
    createSmokeEvent({
      stage,
      attempt,
      actor: [1, 3, 5, 6].includes(stage) ? "claude" : "codex",
      outcome,
      artifactDir,
      reviewFeedbackSeen,
    }),
  );
  writeControlPlaneSmokeState({
    rootDir,
    workItemId,
    state: smokeState,
  });
}

function assertLiveReviewStageResult({ stageResult, attempt, workItemId }) {
  if (!stageResult || typeof stageResult !== "object") {
    throw new Error("Live provider smoke review stage did not return a structured stage result.");
  }

  if (attempt <= LIVE_BACKEND_FIX_TOKENS.length) {
    const expectedToken = LIVE_BACKEND_FIX_TOKENS[attempt - 1];
    if (stageResult.decision !== "request_changes") {
      throw new Error(
        `Live provider smoke expected Stage 3 attempt ${attempt} to request changes with ${expectedToken}.`,
      );
    }

    const actualToken = extractBackendFixToken(stageResult.body_markdown);
    if (actualToken !== expectedToken) {
      throw new Error(
        `Live provider smoke expected Stage 3 attempt ${attempt} to emit ${expectedToken}, received ${actualToken ?? "none"}.`,
      );
    }

    const expectedLoopFile = `SMOKE_BACKEND_LOOP_FILE: smoke/omo-control-plane/${workItemId}/backend-review-loop.md`;
    if (!String(stageResult.body_markdown ?? "").includes(expectedLoopFile)) {
      throw new Error(`Live provider smoke expected review body to include ${expectedLoopFile}.`);
    }

    return {
      outcome: "request_changes",
      requestedToken: expectedToken,
    };
  }

  if (stageResult.decision !== "approve") {
    throw new Error("Live provider smoke expected the backend review loop to approve after both tokens were applied.");
  }

  return {
    outcome: "approve",
    requestedToken: null,
  };
}

function assertLiveCodeStageRetry({
  runResult,
  promptFeedbackToken,
  rootDir,
  workItemId,
}) {
  const expectedToken = ensureNonEmptyString(promptFeedbackToken, "promptFeedbackToken");
  if (typeof runResult?.prompt !== "string" || !runResult.prompt.includes(`SMOKE_BACKEND_FIX_TOKEN: ${expectedToken}`)) {
    throw new Error(`Live provider smoke expected Codex prompt to include ${expectedToken}.`);
  }

  if (!isBackendTokenApplied({ rootDir, workItemId, token: expectedToken })) {
    throw new Error(`Live provider smoke expected Codex to mark ${expectedToken} as applied in the backend loop file.`);
  }
}

/**
 * @param {CreateLiveProviderControlPlaneSmokeStageRunnerOptions} [options]
 * @returns {(args: ControlPlaneStageRunnerArgs) => ControlPlaneStageRunResult}
 */
export function createLiveProviderControlPlaneSmokeStageRunner({
  rootDir = process.cwd(),
  artifactBaseDir = resolve(rootDir, ".artifacts", "omo-control-plane-smoke"),
  workItemId = "99-omo-control-plane-smoke",
  now = new Date().toISOString(),
  claudeProvider,
  claudeBin,
  claudeModel,
  claudeEffort,
  opencodeBin,
  homeDir,
  environment,
  executeStage = executeMinimalLiveProviderStage,
  reviewContextReader = readRuntimeReviewContext,
} = {}) {
  const deterministicStageRunner = createControlPlaneSmokeStageRunner({
    rootDir,
    artifactBaseDir,
    workItemId,
    now,
  });

  return ({ stage, executionDir, slice = workItemId }) => {
    if (![2, 3].includes(Number(stage))) {
      return deterministicStageRunner({
        stage,
        executionDir,
        slice,
      });
    }

    const smokeState = readControlPlaneSmokeState({
      rootDir,
      workItemId,
    });
    const attempt = Number(smokeState.attempts?.[String(stage)] ?? 0) + 1;
    const artifactDir = stageArtifactDir(artifactBaseDir, stage, attempt);
    ensureNonEmptyString(executionDir, "executionDir");
    const smokeExecutionDir = resolveCanonicalPath(
      resolveLiveProviderSmokeDir({
        rootDir,
        workItemId,
      }),
    );
    let reviewFeedbackSeen = false;
    let outcome = "approve";
    let promptFeedbackToken = null;
    let reviewContext = null;

    smokeState.attempts[String(stage)] = attempt;

    if (stage === 2 && attempt > 1) {
      reviewContext = reviewContextReader({
        rootDir,
        workItemId,
        role: "backend",
      });
      if (typeof reviewContext?.body_markdown !== "string") {
        throw new Error("Live provider smoke expected backend review feedback before Stage 2 retry.");
      }

      promptFeedbackToken = extractBackendFixToken(reviewContext.body_markdown);
      if (!promptFeedbackToken) {
        throw new Error("Live provider smoke expected Prior Review Feedback to include SMOKE_BACKEND_FIX_TOKEN.");
      }

      smokeState.review_loops.backend.last_feedback = reviewContext.body_markdown;
      reviewFeedbackSeen = true;
    }

    const extraPromptSections = buildLiveProviderPromptSections({
      stage,
      attempt,
      workItemId,
      expectedToken:
        stage === 2
          ? promptFeedbackToken
          : stage === 3 && attempt <= LIVE_BACKEND_FIX_TOKENS.length
            ? LIVE_BACKEND_FIX_TOKENS[attempt - 1]
            : null,
    });
    const prompt = buildMinimalLiveProviderPrompt({
      stage,
      attempt,
      workItemId,
      stageResultPath: resolveCanonicalPath(resolve(smokeExecutionDir, ".omo-live-stage-result.json")),
      smokeExecutionDir,
      extraPromptSections,
      reviewContext,
    });
    const runResult = executeStage({
      rootDir,
      executionDir: smokeExecutionDir,
      workItemId,
      slice,
      stage: Number(stage),
      artifactDir,
      provider: stage === 2 ? "opencode" : "claude-cli",
      prompt,
      claudeProvider,
      claudeBin,
      claudeModel,
      claudeEffort,
      opencodeBin,
      homeDir,
      environment,
      extraPromptSections,
      now,
    });

    if (stage === 2 && promptFeedbackToken) {
      assertLiveCodeStageRetry({
        runResult,
        promptFeedbackToken,
        rootDir,
        workItemId,
      });
      smokeState.review_loops.backend.code_retries += 1;
      smokeState.review_loops.backend.feedback_seen_by_codex = true;
      smokeState.review_loops.backend.last_feedback =
        smokeState.review_loops.backend.last_feedback ?? null;
      pushUniqueValue(smokeState.live_provider.backend.prompt_feedback_tokens, promptFeedbackToken);
      pushUniqueValue(smokeState.live_provider.backend.applied_tokens, promptFeedbackToken);
      outcome = "done";
    }

    if (stage === 3) {
      const validation = assertLiveReviewStageResult({
        stageResult: runResult.stageResult,
        attempt,
        workItemId,
      });
      outcome = validation.outcome;

      if (validation.outcome === "request_changes" && validation.requestedToken) {
        smokeState.review_loops.backend.requested_changes += 1;
        smokeState.review_loops.backend.last_feedback = runResult.stageResult.body_markdown;
        pushUniqueValue(smokeState.live_provider.backend.requested_tokens, validation.requestedToken);
      }

      if (validation.outcome === "approve") {
        if (!LIVE_BACKEND_FIX_TOKENS.every((token) => isBackendTokenApplied({ rootDir, workItemId, token }))) {
          throw new Error("Live provider smoke expected both backend fix tokens to be applied before approval.");
        }
        smokeState.review_loops.backend.approvals += 1;
      }
    }

    recordSmokeEvent({
      rootDir,
      workItemId,
      smokeState,
      stage,
      attempt,
      artifactDir: runResult.artifactDir ?? artifactDir,
      reviewFeedbackSeen,
      outcome,
    });

    return runResult;
  };
}

/**
 * @param {CollectControlPlaneSmokeCheckpointsOptions} [options]
 */
export function collectControlPlaneSmokeCheckpoints({ runtime, smokeState = null } = {}) {
  const lastCompletedStage = Number(runtime?.last_completed_stage ?? 0);
  const waitKind = runtime?.wait?.kind ?? null;
  const backendLoop = smokeState?.review_loops?.backend ?? {};
  const frontendLoop = smokeState?.review_loops?.frontend ?? {};
  const liveBackend = smokeState?.live_provider?.backend ?? {};
  const backendLiveProviderLoopValidated =
    LIVE_BACKEND_FIX_TOKENS.every((token) => uniqueStringArray(liveBackend.requested_tokens).includes(token)) &&
    LIVE_BACKEND_FIX_TOKENS.every((token) => uniqueStringArray(liveBackend.applied_tokens).includes(token)) &&
    LIVE_BACKEND_FIX_TOKENS.every((token) => uniqueStringArray(liveBackend.prompt_feedback_tokens).includes(token)) &&
    Number(backendLoop.approvals ?? 0) > 0;
  const backendIterativeReviewLoopValidated =
    Number(backendLoop.requested_changes ?? 0) >= 2 &&
    Number(smokeState?.attempts?.["2"] ?? 0) >= 2 &&
    Number(backendLoop.approvals ?? 0) > 0 &&
    backendLoop.feedback_seen_by_codex === true &&
    Number(smokeState?.attempts?.["3"] ?? 0) >= 3 &&
    (
      (typeof backendLoop.last_feedback === "string" &&
        (backendLoop.last_feedback.includes("request 2") || backendLoop.last_feedback.includes("backend-request-2"))) ||
      backendLiveProviderLoopValidated
    );

  return {
    docsPrCreated: Boolean(runtime?.prs?.docs?.url),
    docsMerged: lastCompletedStage >= 1 || Boolean(runtime?.prs?.backend?.url),
    backendPrCreated: Boolean(runtime?.prs?.backend?.url),
    backendReviewRequested: Number(backendLoop.requested_changes ?? 0) > 0,
    backendFixApplied: Number(backendLoop.code_retries ?? 0) > 0 && backendLoop.feedback_seen_by_codex === true,
    backendAdditionalReviewCompleted:
      Number(smokeState?.attempts?.["3"] ?? 0) >= 2 && Number(backendLoop.approvals ?? 0) > 0,
    backendIterativeReviewLoopValidated,
    backendReviewLoopValidated:
      Number(backendLoop.requested_changes ?? 0) > 0 &&
      Number(backendLoop.code_retries ?? 0) > 0 &&
      Number(backendLoop.approvals ?? 0) > 0 &&
      backendLoop.feedback_seen_by_codex === true,
    backendLiveProviderLoopValidated,
    frontendReviewRequested: Number(frontendLoop.requested_changes ?? 0) > 0,
    frontendFixApplied:
      Number(frontendLoop.code_retries ?? 0) > 0 && frontendLoop.feedback_seen_by_codex === true,
    frontendAdditionalReviewCompleted:
      Number(smokeState?.attempts?.["5"] ?? 0) >= 2 &&
      Number(smokeState?.attempts?.["6"] ?? 0) >= 2 &&
      Number(frontendLoop.approvals ?? 0) > 1,
    frontendReviewLoopValidated:
      Number(frontendLoop.requested_changes ?? 0) > 0 &&
      Number(frontendLoop.code_retries ?? 0) > 1 &&
      Number(frontendLoop.approvals ?? 0) > 1 &&
      frontendLoop.feedback_seen_by_codex === true,
    reviewLoopsValidated:
      Number(backendLoop.requested_changes ?? 0) > 0 &&
      Number(backendLoop.code_retries ?? 0) > 0 &&
      Number(backendLoop.approvals ?? 0) > 0 &&
      backendLoop.feedback_seen_by_codex === true &&
      Number(frontendLoop.requested_changes ?? 0) > 0 &&
      Number(frontendLoop.code_retries ?? 0) > 1 &&
      Number(frontendLoop.approvals ?? 0) > 1 &&
      frontendLoop.feedback_seen_by_codex === true,
    backendMergeGateReached:
      (waitKind === "ci" && (runtime?.wait?.stage ?? null) === 3) || lastCompletedStage >= 3,
    finalAutonomousMergeReached:
      (waitKind === "ci" && (runtime?.wait?.stage ?? null) === 6) || lastCompletedStage >= 6,
    closeoutPrCreated: Boolean(runtime?.prs?.closeout?.url),
    closeoutFinalized:
      runtime?.phase === "done" ||
      runtime?.wait?.kind === "ready_for_next_stage" ||
      Boolean(runtime?.status?.lifecycle === "merged"),
  };
}

export function describeControlPlaneNextStep(wait) {
  if (!wait?.kind) {
    return "Run the smoke command again if you need to continue the next automatic transition.";
  }

  switch (wait.kind) {
    case "ci":
      return "Wait for required checks to turn green, then rerun the control-plane smoke.";
    case "ready_for_next_stage":
      return "Rerun the control-plane smoke to continue into the next stage.";
    default:
      return `Investigate wait.kind=${wait.kind} before rerunning the control-plane smoke.`;
  }
}
