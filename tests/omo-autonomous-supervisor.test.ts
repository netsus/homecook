import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  superviseWorkItem,
  tickSupervisorWorkItems,
} from "../scripts/lib/omo-autonomous-supervisor.mjs";
import { evaluateDocGate } from "../scripts/lib/omo-doc-gate.mjs";
import { mergePullRequestBodyWithExisting } from "../scripts/lib/omo-github.mjs";
import { readRuntimeState, writeRuntimeState } from "../scripts/lib/omo-session-runtime.mjs";

const CHECKLIST_IDS = {
  backendDelivery: "delivery-backend-contract",
  backendAcceptance: "accept-backend-api",
  frontendDelivery: "delivery-ui-connection",
  frontendAcceptance: "accept-frontend-loading",
};

function buildWorkpackReadme({
  workItemId,
  designStatus = "temporary",
  backendChecked = false,
  frontendChecked = false,
  authorityStatus = "not-required",
  uiRisk = "not-required",
  visualArtifact = "not-required",
}: {
  workItemId: string;
  designStatus?: "temporary" | "pending-review" | "confirmed" | "N/A";
  backendChecked?: boolean;
  frontendChecked?: boolean;
  authorityStatus?: string;
  uiRisk?: string;
  visualArtifact?: string;
}) {
  return [
    `# ${workItemId}`,
    "",
    "## Design Authority",
    "",
    `- UI risk: \`${uiRisk}\``,
    "- Anchor screen dependency: 없음",
    `- Visual artifact: ${visualArtifact}`,
    `- Authority status: \`${authorityStatus}\``,
    "- Notes: none",
    "",
    "## Design Status",
    "",
    `- [${designStatus === "temporary" ? "x" : " "}] 임시 UI (temporary)`,
    `- [${designStatus === "pending-review" ? "x" : " "}] 리뷰 대기 (pending-review)`,
    `- [${designStatus === "confirmed" ? "x" : " "}] 확정 (confirmed)`,
    `- [${designStatus === "N/A" ? "x" : " "}] N/A`,
    "",
    "## Delivery Checklist",
    `- [${backendChecked ? "x" : " "}] 백엔드 계약 고정 <!-- omo:id=${CHECKLIST_IDS.backendDelivery};stage=2;scope=backend;review=3,6 -->`,
    `- [${frontendChecked ? "x" : " "}] UI 연결 <!-- omo:id=${CHECKLIST_IDS.frontendDelivery};stage=4;scope=frontend;review=5,6 -->`,
  ].join("\n");
}

function buildAcceptance({
  workItemId,
  backendChecked = false,
  frontendChecked = false,
}: {
  workItemId: string;
  backendChecked?: boolean;
  frontendChecked?: boolean;
}) {
  return [
    `# ${workItemId} acceptance`,
    "",
    "## Happy Path",
    `- [${backendChecked ? "x" : " "}] API 응답 형식이 { success, data, error }를 따른다 <!-- omo:id=${CHECKLIST_IDS.backendAcceptance};stage=2;scope=backend;review=3,6 -->`,
    `- [${frontendChecked ? "x" : " "}] loading 상태가 있다 <!-- omo:id=${CHECKLIST_IDS.frontendAcceptance};stage=4;scope=frontend;review=5,6 -->`,
    "",
    "## Automation Split",
    "",
    "### Manual Only",
    "- [ ] 실제 OAuth smoke",
  ].join("\n");
}

function buildReviewStageResult({
  decision,
  stage,
  reviewedChecklistIds,
  requiredFixIds = [],
  waivedFixIds = [],
  findings,
  bodyMarkdown,
  routeBackStage = null,
  approvedHeadSha = null,
}: {
  decision: "approve" | "approved" | "request_changes";
  stage: 3 | 5 | 6;
  reviewedChecklistIds: string[];
  requiredFixIds?: string[];
  waivedFixIds?: string[];
  findings?: Array<Record<string, unknown>>;
  bodyMarkdown: string;
  routeBackStage?: number | null;
  approvedHeadSha?: string | null;
}) {
  return {
    decision,
    body_markdown: bodyMarkdown,
    route_back_stage: routeBackStage,
    approved_head_sha: approvedHeadSha,
    review_scope: {
      scope: stage === 3 ? "backend" : stage === 5 ? "frontend" : "closeout",
      checklist_ids: reviewedChecklistIds,
    },
    reviewed_checklist_ids: reviewedChecklistIds,
    required_fix_ids: requiredFixIds,
    waived_fix_ids: waivedFixIds,
    findings:
      findings ??
      (decision === "request_changes"
        ? [
            {
              file: stage === 3 ? "app/api/v1/example/route.ts" : "app/example/page.tsx",
              line_hint: 1,
              severity: "major",
              category: stage === 3 ? "contract" : "logic",
              issue: "Follow-up fix is required before approval.",
              suggestion: "Apply the requested fix and rerun validation.",
            },
          ]
        : []),
  };
}

function buildCodeStageResult({
  summary,
  subject,
  title,
  checklistUpdates,
  changedFiles = [],
  contestedFixIds = [],
  rebuttals = [],
}: {
  summary: string;
  subject: string;
  title: string;
  checklistUpdates: string[];
  changedFiles?: string[];
  contestedFixIds?: string[];
  rebuttals?: Array<{ fix_id: string; rationale_markdown: string; evidence_refs: string[] }>;
}) {
  return {
    result: "done",
    summary_markdown: summary,
    pr: { title, body_markdown: "fixed" },
    commit: { subject },
    checks_run: [],
    next_route: "open_pr",
    claimed_scope: {
      files: changedFiles,
      endpoints: [],
      routes: [],
      states: [],
      invariants: [],
    },
    changed_files: changedFiles,
    tests_touched: [],
    artifacts_written: [],
    checklist_updates: checklistUpdates.map((id) => ({
      id,
      status: "checked",
      evidence_refs: [],
    })),
    contested_fix_ids: contestedFixIds,
    rebuttals,
  };
}

function buildAuthorityPrecheckStageResult({
  verdict,
  blockerCount,
  majorCount,
  minorCount,
  reviewedScreenIds = ["RECIPE_DETAIL"],
  authorityReportPaths = ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
  evidenceArtifactRefs = [
    "ui/designs/evidence/06/RECIPE_DETAIL-mobile.png",
    "ui/designs/evidence/06/RECIPE_DETAIL-mobile-narrow.png",
  ],
}: {
  verdict: "pass" | "conditional-pass" | "hold";
  blockerCount: number;
  majorCount: number;
  minorCount: number;
  reviewedScreenIds?: string[];
  authorityReportPaths?: string[];
  evidenceArtifactRefs?: string[];
}) {
  return {
    result: "done",
    summary_markdown: "Authority precheck completed.",
    pr: { title: "feat: authority precheck", body_markdown: "body" },
    commit: { subject: "feat: authority precheck" },
    checks_run: [],
    next_route: "open_pr",
    claimed_scope: {
      files: ["app/example/page.tsx", ...authorityReportPaths, ...evidenceArtifactRefs],
      endpoints: [],
      routes: ["/example"],
      states: ["loading"],
      invariants: [],
    },
    changed_files: ["app/example/page.tsx", ...authorityReportPaths, ...evidenceArtifactRefs],
    tests_touched: ["tests/example.frontend.test.ts"],
    artifacts_written: [...authorityReportPaths, ...evidenceArtifactRefs],
    checklist_updates: [
      {
        id: CHECKLIST_IDS.frontendDelivery,
        status: "checked",
        evidence_refs: ["pnpm verify:frontend"],
      },
      {
        id: CHECKLIST_IDS.frontendAcceptance,
        status: "checked",
        evidence_refs: ["tests/example.frontend.test.ts"],
      },
    ],
    contested_fix_ids: [],
    rebuttals: [],
    authority_verdict: verdict,
    reviewed_screen_ids: reviewedScreenIds,
    authority_report_paths: authorityReportPaths,
    evidence_artifact_refs: evidenceArtifactRefs,
    blocker_count: blockerCount,
    major_count: majorCount,
    minor_count: minorCount,
  };
}

function buildDocGateFinding(id: string) {
  return {
    id,
    category: "checklist_contract",
    severity: "major",
    message: `Doc gate finding: ${id}`,
    evidence_paths: ["docs/workpacks/03-recipe-like/README.md"],
    remediation_hint: "Fix the workpack lock.",
    fixable: true,
  };
}

function buildDocGateRepairStageResult({
  summary,
  subject,
  title,
  resolvedDocFindingIds,
  changedFiles = ["docs/workpacks/03-recipe-like/README.md"],
  contestedDocFixIds = [],
  rebuttals = [],
}: {
  summary: string;
  subject: string;
  title: string;
  resolvedDocFindingIds: string[];
  changedFiles?: string[];
  contestedDocFixIds?: string[];
  rebuttals?: Array<{ fix_id: string; rationale_markdown: string; evidence_refs: string[] }>;
}) {
  return {
    result: "done",
    summary_markdown: summary,
    pr: { title, body_markdown: "doc gate fixed" },
    commit: { subject },
    checks_run: [],
    next_route: "open_pr",
    claimed_scope: {
      files: changedFiles,
      endpoints: [],
      routes: [],
      states: [],
      invariants: [],
    },
    changed_files: changedFiles,
    tests_touched: [],
    artifacts_written: [".artifacts/doc-gate.log"],
    resolved_doc_finding_ids: resolvedDocFindingIds,
    contested_doc_fix_ids: contestedDocFixIds,
    rebuttals,
  };
}

function buildDocGateReviewStageResult({
  decision,
  reviewedDocFindingIds,
  requiredDocFixIds = [],
  waivedDocFixIds = [],
  findings,
  bodyMarkdown,
  routeBackStage = 2,
  approvedHeadSha = null,
}: {
  decision: "approve" | "request_changes";
  reviewedDocFindingIds: string[];
  requiredDocFixIds?: string[];
  waivedDocFixIds?: string[];
  findings?: Array<Record<string, unknown>>;
  bodyMarkdown: string;
  routeBackStage?: number | null;
  approvedHeadSha?: string | null;
}) {
  return {
    decision,
    body_markdown: bodyMarkdown,
    route_back_stage: routeBackStage,
    approved_head_sha: approvedHeadSha,
    review_scope: {
      scope: "doc_gate",
      checklist_ids: [],
    },
    reviewed_doc_finding_ids: reviewedDocFindingIds,
    required_doc_fix_ids: requiredDocFixIds,
    waived_doc_fix_ids: waivedDocFixIds,
    findings:
      findings ??
      (decision === "request_changes"
        ? [
            {
              file: "docs/workpacks/03-recipe-like/README.md",
              line_hint: 1,
              severity: "major",
              category: "contract",
              issue: "Doc gate follow-up is required.",
              suggestion: "Tighten the workpack wording and metadata.",
            },
          ]
        : []),
  };
}

function seedProductWorkItem(rootDir: string, workItemId: string) {
  mkdirSync(join(rootDir, ".artifacts"), { recursive: true });
  mkdirSync(join(rootDir, ".workflow-v2", "work-items"), { recursive: true });
  mkdirSync(join(rootDir, ".worktrees", workItemId, ".workflow-v2", "work-items"), {
    recursive: true,
  });
  mkdirSync(join(rootDir, "docs", "sync"), { recursive: true });
  mkdirSync(join(rootDir, ".worktrees", workItemId, "docs", "sync"), { recursive: true });
  mkdirSync(join(rootDir, "docs", "workpacks", workItemId), { recursive: true });
  mkdirSync(join(rootDir, ".worktrees", workItemId, "docs", "workpacks", workItemId), {
    recursive: true,
  });

  const roadmapContents = [
    "# Workpack Roadmap v2",
    "",
    "## Slice Order",
    "",
    "| Slice | Status | Goal |",
    "| --- | --- | --- |",
    `| \`${workItemId}\` | planned | test slice |`,
  ].join("\n");
  const workpackContents = [
    buildWorkpackReadme({
      workItemId,
      designStatus: "temporary",
      backendChecked: false,
      frontendChecked: false,
    }),
  ].join("\n");

  writeFileSync(join(rootDir, "docs", "workpacks", "README.md"), roadmapContents);
  writeFileSync(
    join(rootDir, "docs", "sync", "CURRENT_SOURCE_OF_TRUTH.md"),
    [
      "# Current Source of Truth",
      "",
      "## Official Files",
      "- `docs/요구사항기준선-v1.6.3.md`",
      "- `docs/화면정의서-v1.2.3.md`",
      "- `docs/유저flow맵-v1.2.3.md`",
      "- `docs/db설계-v1.3.1.md`",
      "- `docs/api문서-v1.2.2.md`",
    ].join("\n"),
  );
  writeFileSync(
    join(rootDir, ".worktrees", workItemId, "docs", "sync", "CURRENT_SOURCE_OF_TRUTH.md"),
    readFileSync(join(rootDir, "docs", "sync", "CURRENT_SOURCE_OF_TRUTH.md"), "utf8"),
  );
  writeFileSync(join(rootDir, ".worktrees", workItemId, "docs", "workpacks", "README.md"), roadmapContents);
  writeFileSync(join(rootDir, "docs", "workpacks", workItemId, "README.md"), workpackContents);
  writeFileSync(
    join(rootDir, ".worktrees", workItemId, "docs", "workpacks", workItemId, "README.md"),
    workpackContents,
  );
  writeFileSync(
    join(rootDir, "docs", "workpacks", workItemId, "acceptance.md"),
    `${buildAcceptance({ workItemId, backendChecked: false, frontendChecked: false })}\n`,
  );
  writeFileSync(
    join(rootDir, ".workflow-v2", "status.json"),
    JSON.stringify(
      {
        version: 1,
        project_profile: "homecook",
        updated_at: "2026-03-27T00:00:00+09:00",
        items: [],
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(rootDir, ".worktrees", workItemId, ".workflow-v2", "status.json"),
    readFileSync(join(rootDir, ".workflow-v2", "status.json"), "utf8"),
  );
  writeFileSync(
    join(rootDir, ".workflow-v2", "work-items", `${workItemId}.json`),
    JSON.stringify(
      {
        id: workItemId,
        title: "Recipe like slice",
        project_profile: "homecook",
        change_type: "product",
        surface: "fullstack",
        risk: "medium",
        preset: "vertical-slice-strict",
        goal: "Pilot the autonomous supervisor.",
        owners: {
          claude: "sparse-review-and-approval",
          codex: "implementation-and-integration",
          workers: ["testing"],
        },
        docs_refs: {
          source_of_truth: ["AGENTS.md"],
          governing_docs: ["docs/engineering/workflow-v2/omo-autonomous-supervisor.md"],
        },
        workflow: {
          plan_loop: "recommended",
          review_loop: "required",
          external_smokes: [],
        },
        verification: {
          required_checks: ["pnpm validate:workflow-v2"],
          verify_commands: ["pnpm validate:workflow-v2"],
        },
        status: {
          lifecycle: "planned",
          approval_state: "not_started",
          verification_status: "pending",
        },
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(rootDir, ".worktrees", workItemId, ".workflow-v2", "work-items", `${workItemId}.json`),
    readFileSync(join(rootDir, ".workflow-v2", "work-items", `${workItemId}.json`), "utf8"),
  );
}

function createFixture() {
  const rootDir = mkdtempSync(join(tmpdir(), "omo-autonomous-supervisor-"));
  seedProductWorkItem(rootDir, "03-recipe-like");
  return rootDir;
}

function upsertWorktreeStatusItem(
  workspacePath: string,
  workItemId: string,
  overrides: Record<string, unknown> = {},
) {
  const statusPath = join(workspacePath, ".workflow-v2", "status.json");
  const status = JSON.parse(readFileSync(statusPath, "utf8")) as {
    version: number;
    project_profile: string;
    updated_at: string;
    items: Array<Record<string, unknown>>;
  };
  const nextItem = {
    id: workItemId,
    preset: "vertical-slice-strict",
    lifecycle: "planned",
    approval_state: "not_started",
    verification_status: "pending",
    required_checks: ["pnpm validate:workflow-v2"],
    ...(status.items.find((item) => item.id === workItemId) ?? {}),
    ...overrides,
  };
  const nextItems = status.items.some((item) => item.id === workItemId)
    ? status.items.map((item) => (item.id === workItemId ? nextItem : item))
    : [...status.items, nextItem];

  writeFileSync(
    statusPath,
    `${JSON.stringify(
      {
        ...status,
        items: nextItems,
      },
      null,
      2,
    )}\n`,
  );
}

function readTrackedStatusItem(rootDir: string, workItemId: string) {
  const status = JSON.parse(
    readFileSync(join(rootDir, ".workflow-v2", "status.json"), "utf8"),
  ) as {
    items?: Array<Record<string, unknown>>;
  };

  return status.items?.find((item) => item.id === workItemId) ?? null;
}

function seedAutonomousPolicy(
  rootDir: string,
  workItemId: string,
  {
    externalSmokes = ["true"],
    risk = "medium",
    uiRisk = "not-required",
    authorityRequired = false,
    requiredScreens = [],
    authorityReportPaths = [],
    anchorScreens = [],
  }: {
    externalSmokes?: string[];
    risk?: "low" | "medium" | "high" | "critical";
    uiRisk?: "not-required" | "low-risk" | "new-screen" | "high-risk" | "anchor-extension";
    authorityRequired?: boolean;
    requiredScreens?: string[];
    authorityReportPaths?: string[];
    anchorScreens?: string[];
  } = {},
) {
  const workItemPath = join(rootDir, ".workflow-v2", "work-items", `${workItemId}.json`);
  const workItem = JSON.parse(readFileSync(workItemPath, "utf8")) as Record<string, unknown>;
  writeFileSync(
    workItemPath,
    JSON.stringify(
      {
        ...workItem,
        risk,
        workflow: {
          ...(workItem.workflow as Record<string, unknown>),
          execution_mode: "autonomous",
          evaluator_profile: "slice-autonomous-v1",
          merge_policy: "conditional-auto",
          max_fix_rounds: {
            backend: 2,
            frontend: 2,
          },
        },
        verification: {
          ...(workItem.verification as Record<string, unknown>),
          evaluator_commands: [],
          artifact_assertions: [],
        },
        status: {
          ...(workItem.status as Record<string, unknown>),
          evaluation_status: "not_started",
          evaluation_round: 0,
          last_evaluator_result: null,
          auto_merge_eligible: false,
          blocked_reason_code: null,
        },
      },
      null,
      2,
    ),
  );

  writeFileSync(
    join(rootDir, "docs", "workpacks", workItemId, "automation-spec.json"),
    JSON.stringify(
      {
        slice_id: workItemId,
        execution_mode: "autonomous",
        risk_class: risk,
        merge_policy: "conditional-auto",
        backend: {
          required_endpoints: [],
          invariants: [],
          verify_commands: [],
          required_test_targets: [],
        },
        frontend: {
          required_routes: [],
          required_states: [],
          playwright_projects: [],
          artifact_assertions: [],
          design_authority: {
            ui_risk: uiRisk,
            anchor_screens: anchorScreens,
            required_screens: requiredScreens,
            generator_required: authorityRequired,
            critic_required: authorityRequired,
            authority_required: authorityRequired,
            stage4_evidence_requirements: authorityRequired ? ["mobile-default", "mobile-narrow"] : [],
            authority_report_paths: authorityReportPaths,
          },
        },
        external_smokes: externalSmokes,
        blocked_conditions: [],
        max_fix_rounds: {
          backend: 2,
          frontend: 2,
        },
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(rootDir, ".worktrees", workItemId, "docs", "workpacks", workItemId, "automation-spec.json"),
    readFileSync(join(rootDir, "docs", "workpacks", workItemId, "automation-spec.json"), "utf8"),
  );
}

function createGitWorkspace(workspacePath: string, branch: string) {
  mkdirSync(workspacePath, { recursive: true });
  execFileSync("git", ["init", "-b", branch], { cwd: workspacePath });
  execFileSync("git", ["config", "user.name", "OMO Test"], { cwd: workspacePath });
  execFileSync("git", ["config", "user.email", "omo@example.com"], { cwd: workspacePath });
}

function seedWorktreeBookkeeping(
  workspacePath: string,
  workItemId: string,
  {
    roadmapStatus = "docs",
    designStatus = "temporary",
    authorityStatus = "not-required",
    uiRisk = "not-required",
    visualArtifact = "not-required",
  }: {
    roadmapStatus?: "planned" | "docs" | "in-progress" | "merged";
    designStatus?: "temporary" | "pending-review" | "confirmed" | "N/A";
    authorityStatus?: string;
    uiRisk?: string;
    visualArtifact?: string;
  } = {},
) {
  mkdirSync(join(workspacePath, "docs", "workpacks", workItemId), { recursive: true });
  writeFileSync(
    join(workspacePath, "docs", "workpacks", "README.md"),
    [
      "# Workpack Roadmap v2",
      "",
      "## Slice Order",
      "",
      "| Slice | Status | Goal |",
      "| --- | --- | --- |",
      `| \`${workItemId}\` | ${roadmapStatus} | test slice |`,
    ].join("\n"),
  );
  writeFileSync(
    join(workspacePath, "docs", "workpacks", workItemId, "README.md"),
    buildWorkpackReadme({
      workItemId,
      designStatus,
      backendChecked: ["pending-review", "confirmed", "N/A"].includes(designStatus),
      frontendChecked: ["pending-review", "confirmed", "N/A"].includes(designStatus),
      authorityStatus,
      uiRisk,
      visualArtifact,
    }),
  );
  writeFileSync(
    join(workspacePath, "docs", "workpacks", workItemId, "acceptance.md"),
    buildAcceptance({
      workItemId,
      backendChecked: ["pending-review", "confirmed", "N/A"].includes(designStatus),
      frontendChecked: ["pending-review", "confirmed", "N/A"].includes(designStatus),
      }),
  );
}

function seedQaArtifactBundle(
  rootDir: string,
  workItemId: string,
  bundleName = "stage4-ready-for-review",
) {
  const bundleDir = join(rootDir, ".artifacts", "qa", workItemId, bundleName);
  mkdirSync(bundleDir, { recursive: true });
  writeFileSync(
    join(bundleDir, "exploratory-checklist.json"),
    `${JSON.stringify({ checklist: true }, null, 2)}\n`,
  );
  writeFileSync(
    join(bundleDir, "exploratory-report.json"),
    `${JSON.stringify({ verdict: "pass" }, null, 2)}\n`,
  );
  writeFileSync(
    join(bundleDir, "eval-result.json"),
    `${JSON.stringify({ verdict: "pass" }, null, 2)}\n`,
  );
}

function seedAuthorityDocGateFixture(workspacePath: string, workItemId: string) {
  seedWorktreeBookkeeping(workspacePath, workItemId, {
    roadmapStatus: "docs",
    designStatus: "temporary",
    authorityStatus: "required",
    uiRisk: "anchor-extension",
    visualArtifact: "figma://frame/recipe-to-planner",
  });

  writeFileSync(
    join(workspacePath, "docs", "workpacks", workItemId, "automation-spec.json"),
    JSON.stringify(
      {
        slice_id: workItemId,
        execution_mode: "autonomous",
        risk_class: "medium",
        merge_policy: "conditional-auto",
        backend: {
          required_endpoints: ["POST /planner/meals"],
          invariants: [],
          verify_commands: [],
          required_test_targets: ["tests/backend.test.ts"],
        },
        frontend: {
          required_routes: ["/recipes/[id]"],
          required_states: ["loading"],
          playwright_projects: [],
          artifact_assertions: ["playwright-report"],
          design_authority: {
            ui_risk: "anchor-extension",
            anchor_screens: ["RECIPE_DETAIL", "PLANNER_WEEK"],
            required_screens: ["RECIPE_DETAIL"],
            generator_required: true,
            critic_required: true,
            authority_required: true,
            stage4_evidence_requirements: ["mobile-default", "mobile-narrow"],
            authority_report_paths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
          },
        },
        external_smokes: ["true"],
        blocked_conditions: [],
        max_fix_rounds: {
          backend: 2,
          frontend: 2,
        },
      },
      null,
      2,
    ),
  );

  mkdirSync(join(workspacePath, "ui", "designs", "critiques"), { recursive: true });
  writeFileSync(
    join(workspacePath, "ui", "designs", "RECIPE_DETAIL.md"),
    "# RECIPE_DETAIL\nbasic layout only\n",
  );
  writeFileSync(
    join(workspacePath, "ui", "designs", "critiques", "RECIPE_DETAIL-critique.md"),
    "# critique\nmissing mobile keywords\n",
  );
}

function seedPassingDocGateFixture(workspacePath: string, workItemId: string) {
  mkdirSync(join(workspacePath, "docs", "workpacks", workItemId), { recursive: true });
  writeFileSync(
    join(workspacePath, "docs", "workpacks", "README.md"),
    [
      "# Workpack Roadmap v2",
      "",
      "## Slice Order",
      "",
      "| Slice | Status | Goal |",
      "| --- | --- | --- |",
      `| \`${workItemId}\` | docs | test slice |`,
    ].join("\n"),
  );
  writeFileSync(
    join(workspacePath, "docs", "workpacks", workItemId, "README.md"),
    [
      `# ${workItemId}`,
      "",
      "## Goal",
      "- goal",
      "",
      "## Branches",
      "- docs",
      "- backend",
      "- frontend",
      "",
      "## In Scope",
      "- scope",
      "",
      "## Out of Scope",
      "- out",
      "",
      "## Dependencies",
      "- dep",
      "",
      "## Backend First Contract",
      "- contract",
      "",
      "## Frontend Delivery Mode",
      "- loading / empty / error / read-only / unauthorized",
      "",
      "## Design Authority",
      "- UI risk: `low-risk`",
      "- Anchor screen dependency: 없음",
      "- Visual artifact: not-required",
      "- Authority status: `not-required`",
      "- Notes: none",
      "",
      "## Design Status",
      "- [x] 임시 UI (temporary)",
      "- [ ] 리뷰 대기 (pending-review)",
      "- [ ] 확정 (confirmed)",
      "- [ ] N/A",
      "",
      "## Source Links",
      "- source",
      "",
      "## QA / Test Data Plan",
      "- qa",
      "",
      "## Key Rules",
      "- rule",
      "",
      "## Primary User Path",
      "1. step",
      "2. step",
      "3. step",
      "",
      "## Delivery Checklist",
      `- [ ] 백엔드 계약 고정 <!-- omo:id=${CHECKLIST_IDS.backendDelivery};stage=2;scope=backend;review=3,6 -->`,
      `- [ ] UI 연결 <!-- omo:id=${CHECKLIST_IDS.frontendDelivery};stage=4;scope=frontend;review=5,6 -->`,
    ].join("\n"),
  );
  writeFileSync(
    join(workspacePath, "docs", "workpacks", workItemId, "acceptance.md"),
    [
      `# ${workItemId} acceptance`,
      "",
      "## Happy Path",
      `- [ ] API 응답 형식이 { success, data, error }를 따른다 <!-- omo:id=${CHECKLIST_IDS.backendAcceptance};stage=2;scope=backend;review=3,6 -->`,
      `- [ ] loading 상태가 있다 <!-- omo:id=${CHECKLIST_IDS.frontendAcceptance};stage=4;scope=frontend;review=5,6 -->`,
      "",
      "## State / Policy",
      "- state",
      "",
      "## Error / Permission",
      "- error",
      "",
      "## Data Integrity",
      "- integrity",
      "",
      "## Data Setup / Preconditions",
      "- setup",
      "",
      "## Manual QA",
      "- manual",
      "",
      "## Automation Split",
      "### Manual Only",
      "- [ ] live smoke",
    ].join("\n"),
  );
  writeFileSync(
    join(workspacePath, "docs", "workpacks", workItemId, "automation-spec.json"),
    JSON.stringify(
      {
        slice_id: workItemId,
        execution_mode: "autonomous",
        risk_class: "medium",
        merge_policy: "conditional-auto",
        backend: {
          required_endpoints: ["POST /api/v1/example"],
          invariants: [],
          verify_commands: [],
          required_test_targets: ["tests/example.backend.test.ts"],
        },
        frontend: {
          required_routes: ["/example"],
          required_states: ["loading"],
          playwright_projects: [],
          artifact_assertions: ["playwright-report"],
          design_authority: {
            ui_risk: "low-risk",
            anchor_screens: [],
            required_screens: [],
            generator_required: false,
            critic_required: false,
            authority_required: false,
            stage4_evidence_requirements: [],
            authority_report_paths: [],
          },
        },
        external_smokes: [],
        blocked_conditions: [],
        max_fix_rounds: {
          backend: 2,
          frontend: 2,
        },
      },
      null,
      2,
    ),
  );
}

describe("OMO autonomous supervisor", () => {
  it("tick on a specific work item is a no-op when runtime is missing", () => {
    const rootDir = createFixture();

    const results = tickSupervisorWorkItems({
      rootDir,
      workItemId: "99-missing-runtime",
      now: "2026-03-27T01:00:00.000Z",
    });

    expect(results).toEqual([
      expect.objectContaining({
        workItemId: "99-missing-runtime",
        action: "noop",
        reason: "missing_runtime",
      }),
    ]);
  });

  it("tick on a specific work item is a no-op when runtime has no active wait", () => {
    const rootDir = createFixture();

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        current_stage: 6,
        last_completed_stage: 6,
        wait: null,
      },
    });

    const results = tickSupervisorWorkItems({
      rootDir,
      workItemId: "03-recipe-like",
      now: "2026-03-27T01:00:00.000Z",
    });

    expect(results).toEqual([
      expect.objectContaining({
        workItemId: "03-recipe-like",
        action: "noop",
        reason: "no_wait_state",
      }),
    ]);
  });

  it("runs Stage 1, merges docs, then opens a backend Draft PR in a dedicated worktree", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    const gitLog: string[] = [];
    const ghLog: string[] = [];

    const first = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T00:30:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            mkdirSync(workspacePath, { recursive: true });
            mkdirSync(join(workspacePath, "docs", "workpacks", "03-recipe-like"), { recursive: true });
            writeFileSync(
              join(workspacePath, "docs", "workpacks", "README.md"),
              [
                "# Workpack Roadmap v2",
                "",
                "## Slice Order",
                "",
                "| Slice | Status | Goal |",
                "| --- | --- | --- |",
                "| `03-recipe-like` | planned | test slice |",
              ].join("\n"),
            );
            return { path: workspacePath, created: true };
          },
          assertClean() {},
          checkoutBranch({ branch }: { branch: string }) {
            gitLog.push(`checkout:${branch}`);
            return { branch };
          },
          pushBranch({ branch }: { branch: string }) {
            gitLog.push(`push:${branch}`);
          },
          syncBaseBranch() {
            gitLog.push("sync:master");
          },
          getHeadSha() {
            return "abc123";
          },
        },
        stageRunner() {
          mkdirSync(join(workspacePath, "docs", "workpacks", "03-recipe-like"), { recursive: true });
          writeFileSync(
            join(workspacePath, "docs", "workpacks", "README.md"),
            [
              "# Workpack Roadmap v2",
              "",
              "## Slice Order",
              "",
              "| Slice | Status | Goal |",
              "| --- | --- | --- |",
              "| `03-recipe-like` | docs | test slice |",
            ].join("\n"),
          );
          writeFileSync(
            join(workspacePath, "docs", "workpacks", "03-recipe-like", "README.md"),
            buildWorkpackReadme({
              workItemId: "03-recipe-like",
              designStatus: "temporary",
            }),
          );
          writeFileSync(
            join(workspacePath, "docs", "workpacks", "03-recipe-like", "acceptance.md"),
            buildAcceptance({
              workItemId: "03-recipe-like",
            }),
          );
          writeFileSync(
            join(workspacePath, "docs", "workpacks", "03-recipe-like", "automation-spec.json"),
            JSON.stringify(
              {
                slice_id: "03-recipe-like",
                execution_mode: "autonomous",
              },
              null,
              2,
            ),
          );
          upsertWorktreeStatusItem(workspacePath, "03-recipe-like", {
            lifecycle: "ready_for_review",
            approval_state: "claude_approved",
            verification_status: "passed",
          });
          return {
            artifactDir: join(rootDir, ".artifacts", "stage1"),
            dispatch: { actor: "claude", stage: 1 },
            execution: { mode: "execute", executed: true, sessionId: "ses_claude" },
            stageResult: {
              result: "done",
              summary_markdown: "Stage 1 docs complete",
              commit: {
                subject: "docs: lock slice docs",
              },
              pr: {
                title: "docs: lock slice docs",
                body_markdown: "## Summary\n- docs",
              },
              checks_run: [],
              next_route: "open_pr",
              claimed_scope: {
                files: [
                  "docs/workpacks/README.md",
                  "docs/workpacks/03-recipe-like/README.md",
                  "docs/workpacks/03-recipe-like/acceptance.md",
                  "docs/workpacks/03-recipe-like/automation-spec.json",
                ],
                endpoints: [],
                routes: [],
                states: [],
                invariants: [],
              },
              changed_files: [
                "docs/workpacks/README.md",
                "docs/workpacks/03-recipe-like/README.md",
                "docs/workpacks/03-recipe-like/acceptance.md",
                "docs/workpacks/03-recipe-like/automation-spec.json",
              ],
              tests_touched: [],
              artifacts_written: [],
              checklist_updates: [],
            },
          };
        },
        github: {
          createPullRequest({
            head,
            draft,
          }: {
            head: string;
            draft: boolean;
          }) {
            ghLog.push(`create:${head}:${draft ? "draft" : "ready"}`);
            if (head.startsWith("docs/")) {
              return { number: 34, url: "https://github.com/netsus/homecook/pull/34", draft };
            }

            return { number: 35, url: "https://github.com/netsus/homecook/pull/35", draft };
          },
          getRequiredChecks({ prRef }: { prRef: string }) {
            ghLog.push(`checks:${prRef}`);
            return {
              bucket: prRef.endsWith("/34") ? "pass" : "pending",
              checks: [],
            };
          },
          markReady({ prRef }: { prRef: string }) {
            ghLog.push(`ready:${prRef}`);
          },
          reviewPullRequest() {
            throw new Error("not expected");
          },
          commentPullRequest() {
            throw new Error("not expected");
          },
          mergePullRequest({ prRef }: { prRef: string }) {
            ghLog.push(`merge:${prRef}`);
            return { merged: true };
          },
          updateBranch() {
            throw new Error("not expected");
          },
        },
      },
    );

    expect(first.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 2,
    });

    writeFileSync(
      join(workspacePath, "docs", "workpacks", "03-recipe-like", "README.md"),
      buildWorkpackReadme({
        workItemId: "03-recipe-like",
        designStatus: "temporary",
        backendChecked: true,
        frontendChecked: false,
      }),
    );
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "03-recipe-like", "acceptance.md"),
      buildAcceptance({
        workItemId: "03-recipe-like",
        backendChecked: true,
        frontendChecked: false,
      }),
    );
    const artifactDir = join(rootDir, ".artifacts", "stage2");
    mkdirSync(artifactDir, { recursive: true });
    const stageResultPath = join(artifactDir, "stage-result.json");
    writeFileSync(
      stageResultPath,
      `${JSON.stringify(
        buildCodeStageResult({
          summary: "Stage 2 backend complete",
          subject: "feat: backend slice",
          title: "feat: backend slice",
          checklistUpdates: [
            CHECKLIST_IDS.backendDelivery,
            CHECKLIST_IDS.backendAcceptance,
          ],
          changedFiles: ["app/api/v1/example/route.ts"],
        }),
        null,
        2,
      )}\n`,
    );
    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        current_stage: 2,
        active_stage: 2,
        phase: "stage_result_ready",
        next_action: "finalize_stage",
        last_artifact_dir: artifactDir,
        execution: {
          provider: "opencode",
          session_role: "codex_primary",
          session_id: "ses_codex",
          artifact_dir: artifactDir,
          stage_result_path: stageResultPath,
          started_at: "2026-03-27T00:31:00+09:00",
          finished_at: "2026-03-27T00:31:00+09:00",
          verify_commands: [],
          verify_bucket: null,
          commit_sha: null,
          pr_role: "backend",
        },
        wait: null,
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T00:31:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch({ branch }: { branch: string }) {
            gitLog.push(`checkout:${branch}`);
            return { branch };
          },
          pushBranch({ branch }: { branch: string }) {
            gitLog.push(`push:${branch}`);
          },
          syncBaseBranch() {
            gitLog.push("sync:master");
          },
          getHeadSha() {
            return "abc123";
          },
        },
        stageRunner() {
          throw new Error("not expected");
        },
        github: {
          createPullRequest({
            head,
            draft,
          }: {
            head: string;
            draft: boolean;
          }) {
            ghLog.push(`create:${head}:${draft ? "draft" : "ready"}`);
            return { number: 35, url: "https://github.com/netsus/homecook/pull/35", draft };
          },
          getRequiredChecks({ prRef }: { prRef: string }) {
            ghLog.push(`checks:${prRef}`);
            return {
              bucket: "pending",
              checks: [],
            };
          },
          markReady({ prRef }: { prRef: string }) {
            ghLog.push(`ready:${prRef}`);
          },
          reviewPullRequest() {
            throw new Error("not expected");
          },
          commentPullRequest() {
            throw new Error("not expected");
          },
          mergePullRequest({ prRef }: { prRef: string }) {
            ghLog.push(`merge:${prRef}`);
            return { merged: true };
          },
          updateBranch() {
            throw new Error("not expected");
          },
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      slice: "03-recipe-like",
    }).state as {
      workspace: { path: string; branch_role: string };
      prs: {
        docs: { url: string };
        backend: { url: string; draft: boolean };
      };
      wait: { kind: string; pr_role: string; stage: number };
    };
    const roadmap = readFileSync(join(workspacePath, "docs", "workpacks", "README.md"), "utf8");

    expect(result.wait?.kind).toBe("ci");
    expect(runtime.workspace).toMatchObject({
      path: workspacePath,
      branch_role: "backend",
    });
    expect(runtime.prs.docs.url).toBe("https://github.com/netsus/homecook/pull/34");
    expect(runtime.prs.backend).toMatchObject({
      url: "https://github.com/netsus/homecook/pull/35",
      draft: true,
    });
    expect(runtime.wait).toMatchObject({
      kind: "ci",
      pr_role: "backend",
      stage: 2,
    });
    expect(roadmap).toContain("| `03-recipe-like` | in-progress|");
    expect(gitLog).toEqual([
      "checkout:docs/03-recipe-like",
      "push:docs/03-recipe-like",
      "checkout:feature/be-03-recipe-like",
      "push:feature/be-03-recipe-like",
    ]);
    expect(ghLog).toEqual([
      "create:docs/03-recipe-like:ready",
      "checks:https://github.com/netsus/homecook/pull/34",
      "create:feature/be-03-recipe-like:draft",
      "checks:https://github.com/netsus/homecook/pull/35",
    ]);
  });

  it("enters Stage 1 bootstrap when tracked work item and workpack docs are missing", () => {
    const rootDir = createFixture();
    const workItemId = "03-recipe-like";
    const workspacePath = join(rootDir, ".worktrees", workItemId);
    let stage1Ran = false;

    rmSync(join(rootDir, ".workflow-v2", "work-items", `${workItemId}.json`), { force: true });
    rmSync(join(workspacePath, ".workflow-v2", "work-items", `${workItemId}.json`), { force: true });
    rmSync(join(rootDir, "docs", "workpacks", workItemId), { recursive: true, force: true });
    rmSync(join(workspacePath, "docs", "workpacks", workItemId), { recursive: true, force: true });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId,
        now: "2026-04-18T16:20:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            mkdirSync(join(workspacePath, "docs", "workpacks"), { recursive: true });
            writeFileSync(
              join(workspacePath, "docs", "workpacks", "README.md"),
              [
                "# Workpack Roadmap v2",
                "",
                "## Slice Order",
                "",
                "| Slice | Status | Goal |",
                "| --- | --- | --- |",
                `| \`${workItemId}\` | planned | test slice |`,
              ].join("\n"),
            );
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: `docs/${workItemId}` };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return "docsbootstrap123";
          },
          getCurrentBranch() {
            return `docs/${workItemId}`;
          },
          listChangedFiles() {
            return [];
          },
        },
        stageRunner() {
          stage1Ran = true;
          mkdirSync(join(workspacePath, ".workflow-v2", "work-items"), { recursive: true });
          mkdirSync(join(workspacePath, "docs", "workpacks", workItemId), { recursive: true });
          writeFileSync(
            join(workspacePath, "docs", "workpacks", "README.md"),
            [
              "# Workpack Roadmap v2",
              "",
              "## Slice Order",
              "",
              "| Slice | Status | Goal |",
              "| --- | --- | --- |",
              `| \`${workItemId}\` | docs | test slice |`,
            ].join("\n"),
          );
          writeFileSync(
            join(workspacePath, "docs", "workpacks", workItemId, "README.md"),
            buildWorkpackReadme({
              workItemId,
            }),
          );
          writeFileSync(
            join(workspacePath, "docs", "workpacks", workItemId, "acceptance.md"),
            buildAcceptance({
              workItemId,
            }),
          );
          writeFileSync(
            join(workspacePath, "docs", "workpacks", workItemId, "automation-spec.json"),
            JSON.stringify(
              {
                slice_id: workItemId,
                execution_mode: "autonomous",
              },
              null,
              2,
            ),
          );
          writeFileSync(
            join(workspacePath, ".workflow-v2", "work-items", `${workItemId}.json`),
            JSON.stringify(
              {
                id: workItemId,
                title: "Bootstrap slice",
                project_profile: "homecook",
                change_type: "product",
                surface: "fullstack",
                risk: "medium",
                preset: "vertical-slice-strict",
                goal: "Bootstrap Stage 1 docs through OMO supervise.",
                owners: {
                  claude: "stage-1-author-and-doc-gate-repair",
                  codex: "doc-gate-review-and-implementation",
                  workers: [],
                },
                docs_refs: {
                  source_of_truth: ["AGENTS.md", "docs/sync/CURRENT_SOURCE_OF_TRUTH.md"],
                  governing_docs: ["docs/engineering/workflow-v2/omo-autonomous-supervisor.md"],
                },
                workflow: {
                  plan_loop: "required",
                  review_loop: "skipped",
                  external_smokes: [],
                  execution_mode: "autonomous",
                  merge_policy: "conditional-auto",
                },
                verification: {
                  required_checks: ["pnpm validate:workflow-v2"],
                  verify_commands: ["pnpm validate:workflow-v2"],
                },
                status: {
                  lifecycle: "planned",
                  approval_state: "not_started",
                  verification_status: "pending",
                },
              },
              null,
              2,
            ),
          );
          upsertWorktreeStatusItem(workspacePath, workItemId, {
            lifecycle: "ready_for_review",
            approval_state: "claude_approved",
            verification_status: "passed",
          });
          return {
            artifactDir: join(rootDir, ".artifacts", "stage1-bootstrap"),
            dispatch: { actor: "claude", stage: 1 },
            execution: { mode: "execute", executed: true, sessionId: "ses_claude_bootstrap" },
            stageResult: {
              result: "done",
              summary_markdown: "Stage 1 bootstrap complete",
              commit: {
                subject: "docs: bootstrap slice docs",
              },
              pr: {
                title: "docs: bootstrap slice docs",
                body_markdown: "## Summary\n- docs bootstrap",
              },
              checks_run: [],
              next_route: "open_pr",
            },
          };
        },
        github: {
          createPullRequest() {
            return { number: 134, url: "https://github.com/netsus/homecook/pull/134", draft: false };
          },
          getRequiredChecks() {
            return { bucket: "pass", checks: [] };
          },
          markReady() {},
          reviewPullRequest() {},
          commentPullRequest() {},
          mergePullRequest() {
            return { merged: true };
          },
          updateBranch() {},
        },
      },
    );

    expect(stage1Ran).toBe(true);
    expect(result.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 2,
    });
    expect(result.runtime?.doc_gate?.status).toBe("pending_check");
    expect(existsSync(join(workspacePath, ".workflow-v2", "work-items", `${workItemId}.json`))).toBe(true);
    expect(
      JSON.parse(readFileSync(join(workspacePath, ".workflow-v2", "status.json"), "utf8")).items.some(
        (item: { id: string }) => item.id === workItemId,
      ),
    ).toBe(true);
  });

  it("does not enter Stage 2 implementation before docs PR merge and doc_gate pass", () => {
    const rootDir = createFixture();
    const workItemId = "03-recipe-like";
    const workspacePath = join(rootDir, ".worktrees", workItemId);
    let stageRunnerCalled = false;

    createGitWorkspace(workspacePath, `docs/${workItemId}`);
    seedPassingDocGateFixture(workspacePath, workItemId);

    writeRuntimeState({
      rootDir,
      workItemId,
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId,
          slice: workItemId,
        }).state,
        slice: workItemId,
        active_stage: 2,
        current_stage: 2,
        last_completed_stage: 1,
        workspace: {
          path: workspacePath,
          branch_role: "docs",
        },
        phase: "wait",
        next_action: "run_stage",
        wait: {
          kind: "ready_for_next_stage",
          pr_role: "docs",
          stage: 2,
          head_sha: "docs123",
        },
        prs: {
          docs: {
            number: 55,
            url: "https://github.com/netsus/homecook/pull/55",
            draft: false,
            branch: `docs/${workItemId}`,
            head_sha: "docs123",
            updated_at: "2026-04-18T16:30:00+09:00",
          },
          backend: null,
          frontend: null,
          closeout: null,
        },
        execution: null,
        doc_gate: {
          status: "pending_check",
          round: 0,
          repair_branch: `docs/${workItemId}`,
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId,
        now: "2026-04-18T16:31:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch({ branch }: { branch: string }) {
            return { branch };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return "docs123";
          },
          getCurrentBranch() {
            return `docs/${workItemId}`;
          },
          listChangedFiles() {
            return [];
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner() {
          stageRunnerCalled = true;
          throw new Error("not expected");
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            return { bucket: "pass", checks: [] };
          },
          markReady() {},
          reviewPullRequest() {},
          commentPullRequest() {},
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {},
        },
      },
    );

    expect(stageRunnerCalled).toBe(false);
    expect(result.wait).toMatchObject({
      kind: "ready_for_next_stage",
      pr_role: "docs",
      stage: 2,
    });
    expect(result.runtime?.doc_gate?.status).toBe("awaiting_review");
    expect(result.runtime?.prs?.backend).toBeNull();
  });

  it("resumes Stage 1 finalize from pr_pending without rerunning Stage 1 entry validation", () => {
    const rootDir = createFixture();
    const workItemId = "03-recipe-like";
    const workspacePath = join(rootDir, ".worktrees", workItemId);
    const artifactDir = join(rootDir, ".artifacts", "stage1-docs-finalize");
    const stageResultPath = join(artifactDir, "stage-result.json");

    createGitWorkspace(workspacePath, `docs/${workItemId}`);
    seedWorktreeBookkeeping(workspacePath, workItemId, {
      roadmapStatus: "docs",
      designStatus: "temporary",
      authorityStatus: "not-required",
      uiRisk: "low-risk",
      visualArtifact: "not-required",
    });
    writeFileSync(
      join(workspacePath, "docs", "workpacks", workItemId, "automation-spec.json"),
      JSON.stringify(
        {
          slice_id: workItemId,
          execution_mode: "autonomous",
          risk_class: "low",
          merge_policy: "conditional-auto",
          backend: {
            required_endpoints: [],
            invariants: [],
            verify_commands: [],
            required_test_targets: [],
          },
          frontend: {
            required_routes: [],
            required_states: [],
            playwright_projects: [],
            artifact_assertions: [],
          },
          external_smokes: [],
          blocked_conditions: [],
          max_fix_rounds: {
            backend: 2,
            frontend: 2,
          },
        },
        null,
        2,
      ),
    );
    upsertWorktreeStatusItem(workspacePath, workItemId, {
      lifecycle: "ready_for_review",
      approval_state: "claude_approved",
      verification_status: "passed",
    });
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      stageResultPath,
      `${JSON.stringify(
        buildCodeStageResult({
          summary: "Stage 1 docs locked",
          subject: "docs: lock recipe like stage 1",
          title: "docs: lock recipe like stage 1",
          checklistUpdates: [],
          changedFiles: [
            "docs/workpacks/README.md",
            `docs/workpacks/${workItemId}/README.md`,
            `docs/workpacks/${workItemId}/acceptance.md`,
            `docs/workpacks/${workItemId}/automation-spec.json`,
          ],
        }),
        null,
        2,
      )}\n`,
    );
    writeRuntimeState({
      rootDir,
      workItemId,
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId,
          slice: workItemId,
        }).state,
        slice: workItemId,
        current_stage: 1,
        active_stage: 1,
        phase: "pr_pending",
        next_action: "finalize_stage",
        last_artifact_dir: artifactDir,
        execution: {
          provider: "opencode",
          session_role: "claude_primary",
          session_id: "ses_docs_finalize",
          artifact_dir: artifactDir,
          stage_result_path: stageResultPath,
          started_at: "2026-03-27T00:20:00+09:00",
          finished_at: "2026-03-27T00:21:00+09:00",
          verify_commands: [],
          verify_bucket: "pass",
          commit_sha: "docs123",
          pr_role: "docs",
        },
        prs: {
          docs: {
            number: 34,
            url: "https://github.com/netsus/homecook/pull/34",
            draft: false,
            branch: `docs/${workItemId}`,
            head_sha: "docs123",
            updated_at: "2026-03-27T00:21:00+09:00",
          },
          backend: null,
          frontend: null,
          closeout: null,
        },
        wait: null,
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId,
        now: "2026-03-27T00:22:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: `docs/${workItemId}` };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return "docs123";
          },
          getCurrentBranch() {
            return `docs/${workItemId}`;
          },
          listChangedFiles() {
            return [];
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner() {
          throw new Error("stageRunner should not be called during Stage 1 finalize resume");
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          editPullRequest() {},
          getRequiredChecks() {
            return { bucket: "pass", checks: [] };
          },
          mergePullRequest() {
            return { merged: true };
          },
          updateBranch() {
            throw new Error("not expected");
          },
        },
      },
    );

    expect(result.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 2,
    });

    const runtime = readRuntimeState({
      rootDir,
      workItemId,
      slice: workItemId,
    }).state;

    expect(runtime.last_completed_stage).toBe(1);
    expect(runtime.phase).toBe("wait");
    expect(runtime.wait?.kind).toBe("ready_for_next_stage");
  });

  it("routes Stage 2 through doc_gate_repair when doc gate findings are fixable", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    const docFindingId = "doc-gate-missing-goal";
    let observedSubphase: string | null = null;

    createGitWorkspace(workspacePath, "docs/03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "docs",
    });
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "docs: seed doc gate repair"], { cwd: workspacePath });

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        active_stage: 2,
        current_stage: 2,
        last_completed_stage: 1,
        workspace: {
          path: workspacePath,
          branch_role: "docs",
        },
        phase: null,
        next_action: "noop",
        wait: null,
        execution: null,
        doc_gate: {
          status: "fixable",
          round: 0,
          repair_branch: "docs/03-recipe-like",
          findings: [buildDocGateFinding(docFindingId)],
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-04-09T20:40:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean({ worktreePath }: { worktreePath: string }) {
            const output = execFileSync("git", ["status", "--porcelain"], {
              cwd: worktreePath,
              encoding: "utf8",
            }).trim();
            if (output.length > 0) {
              throw new Error(`dirty_worktree\n${output}`);
            }
          },
          checkoutBranch({ branch }: { branch: string }) {
            execFileSync("git", ["checkout", "-B", branch], {
              cwd: workspacePath,
              stdio: "ignore",
            });
            return { branch };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return execFileSync("git", ["rev-parse", "HEAD"], {
              cwd: workspacePath,
              encoding: "utf8",
            }).trim();
          },
          getCurrentBranch({ worktreePath }: { worktreePath: string }) {
            return execFileSync("git", ["branch", "--show-current"], {
              cwd: worktreePath,
              encoding: "utf8",
            }).trim();
          },
          listChangedFiles({ worktreePath }: { worktreePath: string }) {
            return execFileSync("git", ["diff", "--name-only"], {
              cwd: worktreePath,
              encoding: "utf8",
            })
              .trim()
              .split("\n")
              .filter(Boolean);
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner({ subphase }: { subphase?: string | null }) {
          observedSubphase = subphase ?? null;
          const readmePath = join(workspacePath, "docs", "workpacks", "03-recipe-like", "README.md");
          writeFileSync(readmePath, `${readFileSync(readmePath, "utf8")}\n## Goal\n- locked during doc gate repair\n`);
          return {
            artifactDir: join(rootDir, ".artifacts", "doc-gate-repair"),
            dispatch: {
              actor: "codex",
              stage: 2,
              subphase: "doc_gate_repair",
              sessionBinding: {
                role: "codex_primary",
              },
            },
            execution: { mode: "execute", executed: true, sessionId: "ses_codex_doc_gate" },
            stageResult: buildDocGateRepairStageResult({
              summary: "Doc gate repaired the workpack.",
              subject: "docs: repair workpack lock",
              title: "docs: repair workpack lock",
              resolvedDocFindingIds: [docFindingId],
            }),
          };
        },
        github: {
          createPullRequest({
            head,
            draft,
          }: {
            head: string;
            draft: boolean;
          }) {
            return {
              number: 77,
              url: "https://github.com/netsus/homecook/pull/77",
              draft,
              branch: head,
            };
          },
          editPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            return { bucket: "pending", checks: [] };
          },
          markReady() {
            throw new Error("not expected");
          },
          reviewPullRequest() {},
          commentPullRequest() {},
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {},
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      slice: "03-recipe-like",
    }).state as {
      wait: { kind: string; pr_role: string; stage: number };
      prs: { docs: { branch: string; url: string } };
      doc_gate: { status: string };
    };

    expect(observedSubphase).toBe("doc_gate_repair");
    expect(result.wait).toMatchObject({
      kind: "ci",
      pr_role: "docs",
      stage: 2,
    });
    expect(runtime.prs.docs).toMatchObject({
      branch: "docs/03-recipe-like",
      url: "https://github.com/netsus/homecook/pull/77",
    });
    expect(runtime.doc_gate.status).toBe("awaiting_review");
  });

  it("fails closed when doc_gate_repair touches non-doc files", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    const docFindingId = "doc-gate-missing-goal";
    const artifactDir = join(rootDir, ".artifacts", "doc-gate-invalid-repair");
    const stageResultPath = join(artifactDir, "stage-result.json");

    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "docs",
    });
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      stageResultPath,
      `${JSON.stringify(
        buildDocGateRepairStageResult({
          summary: "Invalid doc gate repair",
          subject: "docs: invalid repair",
          title: "docs: invalid repair",
          resolvedDocFindingIds: [docFindingId],
          changedFiles: ["app/api/v1/example/route.ts"],
        }),
        null,
        2,
      )}\n`,
    );

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        active_stage: 2,
        current_stage: 2,
        workspace: {
          path: workspacePath,
          branch_role: "docs",
        },
        phase: "stage_result_ready",
        next_action: "finalize_stage",
        last_artifact_dir: artifactDir,
        execution: {
          provider: "opencode",
          session_role: "codex_primary",
          session_id: "ses_codex_doc_gate",
          artifact_dir: artifactDir,
          stage_result_path: stageResultPath,
          started_at: "2026-04-09T20:41:00+09:00",
          finished_at: "2026-04-09T20:41:00+09:00",
          verify_commands: [],
          verify_bucket: null,
          commit_sha: null,
          pr_role: "docs",
          subphase: "doc_gate_repair",
        },
        doc_gate: {
          status: "fixable",
          round: 0,
          repair_branch: "docs/03-recipe-like",
          findings: [buildDocGateFinding(docFindingId)],
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-04-09T20:41:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch({ branch }: { branch: string }) {
            return { branch };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return "docgate123";
          },
          getCurrentBranch() {
            return "docs/03-recipe-like";
          },
          listChangedFiles() {
            return [];
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner() {
          throw new Error("not expected");
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            return { bucket: "pass", checks: [] };
          },
          markReady() {},
          reviewPullRequest() {},
          commentPullRequest() {},
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {},
        },
      },
    );

    expect(result.wait).toMatchObject({
      kind: "human_escalation",
    });
    expect(result.wait?.reason ?? "").toContain("Doc gate repair may only change Stage 1 docs artifacts");
  });

  it("routes doc_gate_review request_changes back to Stage 2 doc repair", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    const docFindingId = "doc-gate-missing-goal";
    const artifactDir = join(rootDir, ".artifacts", "doc-gate-review-request-changes");
    const stageResultPath = join(artifactDir, "stage-result.json");

    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "docs",
    });
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      stageResultPath,
      `${JSON.stringify(
        buildDocGateReviewStageResult({
          decision: "request_changes",
          reviewedDocFindingIds: [docFindingId],
          requiredDocFixIds: [docFindingId],
          bodyMarkdown: "Workpack wording needs another pass.",
        }),
        null,
        2,
      )}\n`,
    );

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        active_stage: 2,
        current_stage: 2,
        workspace: {
          path: workspacePath,
          branch_role: "docs",
        },
        phase: "review_pending",
        next_action: "run_review",
        last_artifact_dir: artifactDir,
        execution: {
          provider: "claude-cli",
          session_role: "claude_primary",
          session_id: "ses_claude_doc_gate",
          artifact_dir: artifactDir,
          stage_result_path: stageResultPath,
          started_at: "2026-04-09T20:42:00+09:00",
          finished_at: "2026-04-09T20:42:00+09:00",
          verify_commands: [],
          verify_bucket: null,
          commit_sha: null,
          pr_role: "docs",
          subphase: "doc_gate_review",
        },
        prs: {
          docs: {
            number: 77,
            url: "https://github.com/netsus/homecook/pull/77",
            draft: false,
            branch: "docs/03-recipe-like",
            head_sha: "docs123",
          },
          backend: null,
          frontend: null,
        },
        doc_gate: {
          status: "awaiting_review",
          round: 1,
          repair_branch: "docs/03-recipe-like",
          findings: [buildDocGateFinding(docFindingId)],
        },
      },
    });

    const reviewLog: string[] = [];
    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-04-09T20:42:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch({ branch }: { branch: string }) {
            return { branch };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return "docs123";
          },
          getCurrentBranch() {
            return "docs/03-recipe-like";
          },
          listChangedFiles() {
            return [];
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner() {
          throw new Error("not expected");
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            return { bucket: "pass", checks: [] };
          },
          markReady() {},
          reviewPullRequest() {},
          commentPullRequest({ body }: { body: string }) {
            reviewLog.push(body);
          },
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {},
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      slice: "03-recipe-like",
    }).state as {
      wait: { kind: string; pr_role: string; stage: number };
      doc_gate: {
        status: string;
        round: number;
        last_review: { decision: string; required_doc_fix_ids: string[] };
      };
    };

    expect(result.wait).toMatchObject({
      kind: "ready_for_next_stage",
      pr_role: "docs",
      stage: 2,
    });
    expect(runtime.doc_gate.status).toBe("fixable");
    expect(runtime.doc_gate.round).toBe(2);
    expect(runtime.doc_gate.last_review).toMatchObject({
      decision: "request_changes",
      required_doc_fix_ids: [docFindingId],
    });
    expect(reviewLog).toEqual(["Workpack wording needs another pass."]);
  });

  it("skips waived doc gate findings on pending_recheck and enters backend implementation", () => {
    const rootDir = createFixture();
    const workItemId = "03-recipe-like";
    const workspacePath = join(rootDir, ".worktrees", workItemId);
    let observedSubphase: string | null = null;

    createGitWorkspace(workspacePath, "docs/03-recipe-like");
    seedAuthorityDocGateFixture(workspacePath, workItemId);
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "docs: seed authority doc gate"], { cwd: workspacePath });

    const pendingRecheckResult = evaluateDocGate({
      rootDir,
      worktreePath: workspacePath,
      slice: workItemId,
    });
    const waivedIds = pendingRecheckResult.findings.map((finding) => finding.id);

    writeRuntimeState({
      rootDir,
      workItemId,
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId,
          slice: workItemId,
        }).state,
        slice: workItemId,
        active_stage: 2,
        current_stage: 2,
        last_completed_stage: 1,
        workspace: {
          path: workspacePath,
          branch_role: "docs",
        },
        phase: "wait",
        next_action: "run_stage",
        wait: {
          kind: "ready_for_next_stage",
          pr_role: "docs",
          stage: 2,
          head_sha: "docs123",
        },
        execution: null,
        doc_gate: {
          status: "pending_recheck",
          round: 0,
          repair_branch: "docs/03-recipe-like",
          last_review: {
            decision: "approve",
            reviewed_doc_finding_ids: waivedIds,
            required_doc_fix_ids: [],
            waived_doc_fix_ids: waivedIds,
            source_review_stage: 2,
          },
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId,
        now: "2026-04-10T09:00:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch({ branch }: { branch: string }) {
            return { branch };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return "backend123";
          },
          getCurrentBranch() {
            return "feature/be-03-recipe-like";
          },
          listChangedFiles() {
            return [];
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner({ subphase }: { subphase?: string | null }) {
          observedSubphase = subphase ?? null;
          return {
            artifactDir: join(rootDir, ".artifacts", "backend-implementation"),
            dispatch: {
              actor: "codex",
              stage: 2,
              sessionBinding: {
                role: "codex_primary",
              },
            },
            execution: { mode: "execute", executed: true, sessionId: "ses_backend_impl" },
            stageResult: buildCodeStageResult({
              summary: "Backend implementation ready",
              subject: "feat: backend implementation",
              title: "feat: backend implementation",
              checklistUpdates: [CHECKLIST_IDS.backendDelivery, CHECKLIST_IDS.backendAcceptance],
              changedFiles: ["app/api/v1/example/route.ts"],
            }),
          };
        },
        github: {
          createPullRequest({ head, draft }: { head: string; draft: boolean }) {
            return {
              number: 88,
              url: "https://github.com/netsus/homecook/pull/88",
              draft,
              branch: head,
            };
          },
          editPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            return { bucket: "pending", checks: [] };
          },
          markReady() {},
          reviewPullRequest() {},
          commentPullRequest() {},
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {},
        },
      },
    );

    expect(observedSubphase).toBe("implementation");
    expect(result.wait?.kind).not.toBe("ready_for_next_stage");
  });

  it("escalates when merged Stage 1 docs fail pending_recheck", () => {
    const rootDir = createFixture();
    const workItemId = "03-recipe-like";
    const workspacePath = join(rootDir, ".worktrees", workItemId);
    createGitWorkspace(workspacePath, "docs/03-recipe-like");
    seedAuthorityDocGateFixture(workspacePath, workItemId);
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "docs: seed authority doc gate"], { cwd: workspacePath });

    const pendingRecheckResult = evaluateDocGate({
      rootDir,
      worktreePath: workspacePath,
      slice: workItemId,
    });
    const allFindingIds = pendingRecheckResult.findings.map((finding) => finding.id);
    const waivedIds = allFindingIds.slice(0, allFindingIds.length - 1);

    writeRuntimeState({
      rootDir,
      workItemId,
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId,
          slice: workItemId,
        }).state,
        slice: workItemId,
        active_stage: 2,
        current_stage: 2,
        last_completed_stage: 1,
        workspace: {
          path: workspacePath,
          branch_role: "docs",
        },
        phase: "wait",
        next_action: "run_stage",
        wait: {
          kind: "ready_for_next_stage",
          pr_role: "docs",
          stage: 2,
          head_sha: "docs123",
        },
        execution: null,
        doc_gate: {
          status: "pending_recheck",
          round: 0,
          repair_branch: "docs/03-recipe-like",
          last_review: {
            decision: "approve",
            reviewed_doc_finding_ids: [
              ...waivedIds,
              "doc-gate-design-keyword-anchor-recipe_detail",
            ],
            required_doc_fix_ids: [],
            waived_doc_fix_ids: waivedIds,
            source_review_stage: 1,
          },
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId,
        now: "2026-04-10T09:10:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch({ branch }: { branch: string }) {
            return { branch };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return "docgate123";
          },
          getCurrentBranch() {
            return "docs/03-recipe-like";
          },
          listChangedFiles() {
            return [];
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner() {
          throw new Error("not expected");
        },
        github: {
          createPullRequest({ head, draft }: { head: string; draft: boolean }) {
            return {
              number: 89,
              url: "https://github.com/netsus/homecook/pull/89",
              draft,
              branch: head,
            };
          },
          editPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            return { bucket: "pending", checks: [] };
          },
          markReady() {},
          reviewPullRequest() {},
          commentPullRequest() {},
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {},
        },
      },
    );

    expect(result.wait).toMatchObject({
      kind: "human_escalation",
    });
    expect(result.wait?.reason ?? "").toContain("Merged Stage 1 docs failed doc gate recheck");
  });

  it("escalates when doc_gate_review exceeds max ping-pong rounds", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    const docFindingId = "doc-gate-missing-goal";
    const artifactDir = join(rootDir, ".artifacts", "doc-gate-review-stalled");
    const stageResultPath = join(artifactDir, "stage-result.json");

    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "docs",
    });
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      stageResultPath,
      `${JSON.stringify(
        buildDocGateReviewStageResult({
          decision: "request_changes",
          reviewedDocFindingIds: [docFindingId],
          requiredDocFixIds: [docFindingId],
          bodyMarkdown: "Still not locked enough.",
        }),
        null,
        2,
      )}\n`,
    );

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        active_stage: 2,
        current_stage: 2,
        workspace: {
          path: workspacePath,
          branch_role: "docs",
        },
        phase: "review_pending",
        next_action: "run_review",
        last_artifact_dir: artifactDir,
        execution: {
          provider: "claude-cli",
          session_role: "claude_primary",
          session_id: "ses_claude_doc_gate",
          artifact_dir: artifactDir,
          stage_result_path: stageResultPath,
          started_at: "2026-04-09T20:43:00+09:00",
          finished_at: "2026-04-09T20:43:00+09:00",
          verify_commands: [],
          verify_bucket: null,
          commit_sha: null,
          pr_role: "docs",
          subphase: "doc_gate_review",
        },
        prs: {
          docs: {
            number: 77,
            url: "https://github.com/netsus/homecook/pull/77",
            draft: false,
            branch: "docs/03-recipe-like",
            head_sha: "docs123",
          },
          backend: null,
          frontend: null,
        },
        doc_gate: {
          status: "awaiting_review",
          round: 3,
          repair_branch: "docs/03-recipe-like",
          findings: [buildDocGateFinding(docFindingId)],
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-04-09T20:43:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch({ branch }: { branch: string }) {
            return { branch };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return "docs123";
          },
          getCurrentBranch() {
            return "docs/03-recipe-like";
          },
          listChangedFiles() {
            return [];
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner() {
          throw new Error("not expected");
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            return { bucket: "pass", checks: [] };
          },
          markReady() {},
          reviewPullRequest() {},
          commentPullRequest() {},
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {},
        },
      },
    );

    expect(result.wait).toMatchObject({
      kind: "human_escalation",
    });
    expect(result.wait?.reason ?? "").toContain("Doc gate review ping-pong stalled");
  });

  it("blocks Stage 1 when a dependency slice is not merged or bootstrap", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    const workItemPath = join(rootDir, ".workflow-v2", "work-items", "03-recipe-like.json");
    const workItem = JSON.parse(readFileSync(workItemPath, "utf8")) as Record<string, unknown>;

    writeFileSync(
      workItemPath,
      JSON.stringify(
        {
          ...workItem,
          dependencies: ["02-discovery-filter"],
        },
        null,
        2,
      ),
    );

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T00:31:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            mkdirSync(join(workspacePath, "docs", "workpacks", "03-recipe-like"), { recursive: true });
            writeFileSync(
              join(workspacePath, "docs", "workpacks", "README.md"),
              [
                "# Workpack Roadmap v2",
                "",
                "## Slice Order",
                "",
                "| Slice | Status | Goal |",
                "| --- | --- | --- |",
                "| `02-discovery-filter` | planned | dependency |",
                "| `03-recipe-like` | planned | test slice |",
              ].join("\n"),
            );
            return { path: workspacePath, created: true };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "docs/03-recipe-like" };
          },
          pushBranch() {
            throw new Error("not expected");
          },
          syncBaseBranch() {
            throw new Error("not expected");
          },
          getHeadSha() {
            return "docs123";
          },
          getCurrentBranch() {
            return "docs/03-recipe-like";
          },
          listChangedFiles() {
            return [];
          },
        },
        stageRunner() {
          throw new Error("not expected");
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            throw new Error("not expected");
          },
          markReady() {
            throw new Error("not expected");
          },
          reviewPullRequest() {
            throw new Error("not expected");
          },
          commentPullRequest() {
            throw new Error("not expected");
          },
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {
            throw new Error("not expected");
          },
        },
      },
    );

    expect(result.wait).toMatchObject({
      kind: "human_escalation",
    });
    expect(result.runtime?.wait?.reason ?? "").toContain("Dependency slice '02-discovery-filter'");
  });

  it("blocks Stage 1 when required workpack outputs are missing after execution", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T00:32:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            mkdirSync(join(workspacePath, "docs", "workpacks", "03-recipe-like"), { recursive: true });
            writeFileSync(
              join(workspacePath, "docs", "workpacks", "README.md"),
              [
                "# Workpack Roadmap v2",
                "",
                "## Slice Order",
                "",
                "| Slice | Status | Goal |",
                "| --- | --- | --- |",
                "| `03-recipe-like` | planned | test slice |",
              ].join("\n"),
            );
            return { path: workspacePath, created: true };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "docs/03-recipe-like" };
          },
          pushBranch() {
            throw new Error("not expected");
          },
          syncBaseBranch() {
            throw new Error("not expected");
          },
          getHeadSha() {
            return "docs123";
          },
          getCurrentBranch() {
            return "docs/03-recipe-like";
          },
          listChangedFiles() {
            return [];
          },
        },
        stageRunner() {
          mkdirSync(join(workspacePath, "docs", "workpacks", "03-recipe-like"), { recursive: true });
          writeFileSync(
            join(workspacePath, "docs", "workpacks", "README.md"),
            [
              "# Workpack Roadmap v2",
              "",
              "## Slice Order",
              "",
              "| Slice | Status | Goal |",
              "| --- | --- | --- |",
              "| `03-recipe-like` | docs | test slice |",
            ].join("\n"),
          );
          writeFileSync(
            join(workspacePath, "docs", "workpacks", "03-recipe-like", "README.md"),
            buildWorkpackReadme({
              workItemId: "03-recipe-like",
            }),
          );
          return {
            artifactDir: join(rootDir, ".artifacts", "stage1-missing-outputs"),
            dispatch: { actor: "claude", stage: 1 },
            execution: { mode: "execute", executed: true, sessionId: "ses_claude" },
            stageResult: {
              result: "done",
              summary_markdown: "Stage 1 docs incomplete",
              pr: {
                title: "docs: incomplete slice docs",
                body_markdown: "## Summary\n- docs",
              },
              checks_run: [],
              next_route: "open_pr",
            },
          };
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            throw new Error("not expected");
          },
          markReady() {
            throw new Error("not expected");
          },
          reviewPullRequest() {
            throw new Error("not expected");
          },
          commentPullRequest() {
            throw new Error("not expected");
          },
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {
            throw new Error("not expected");
          },
        },
      },
    );

    expect(result.wait).toMatchObject({
      kind: "human_escalation",
    });
    expect(result.runtime?.wait?.reason ?? "").toContain("Stage 1 output is missing");
  });

  it("routes Stage 3 request-changes back to Stage 2 on the same backend PR", () => {
    const rootDir = createFixture();
    seedWorktreeBookkeeping(join(rootDir, ".worktrees", "03-recipe-like"), "03-recipe-like", {
      roadmapStatus: "in-progress",
    });

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        current_stage: 2,
        last_completed_stage: 2,
        workspace: {
          path: join(rootDir, ".worktrees", "03-recipe-like"),
          branch_role: "backend",
        },
        prs: {
          docs: null,
          backend: {
            number: 35,
            url: "https://github.com/netsus/homecook/pull/35",
            draft: false,
            branch: "feature/be-03-recipe-like",
            head_sha: "be123",
          },
          frontend: null,
        },
        wait: {
          kind: "ready_for_next_stage",
          pr_role: "backend",
          stage: 3,
          head_sha: "be123",
        },
        last_review: {
          backend: null,
          frontend: null,
        },
      },
    });

    superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T00:40:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: join(rootDir, ".worktrees", "03-recipe-like"), created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "feature/be-03-recipe-like" };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return "be123";
          },
        },
        stageRunner() {
          return {
            artifactDir: join(rootDir, ".artifacts", "stage3"),
            dispatch: { actor: "claude", stage: 3 },
            execution: { mode: "execute", executed: true, sessionId: "ses_claude" },
            stageResult: buildReviewStageResult({
              decision: "request_changes",
              stage: 3,
              reviewedChecklistIds: [
                CHECKLIST_IDS.backendDelivery,
                CHECKLIST_IDS.backendAcceptance,
              ],
              requiredFixIds: [CHECKLIST_IDS.backendAcceptance],
              bodyMarkdown: "Please tighten the contract tests.",
              routeBackStage: 2,
            }),
          };
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            return { bucket: "pass", checks: [] };
          },
          markReady() {},
          reviewPullRequest() {},
          commentPullRequest() {},
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {
            throw new Error("not expected");
          },
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      slice: "03-recipe-like",
    }).state as {
      prs: {
        backend: { url: string };
      };
      wait: { kind: string; stage: number; pr_role: string };
      last_review: {
        backend: { decision: string; route_back_stage: number };
      };
    };

    expect(runtime.prs.backend.url).toBe("https://github.com/netsus/homecook/pull/35");
    expect(runtime.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 2,
      pr_role: "backend",
    });
    expect(runtime.last_review.backend).toMatchObject({
      decision: "request_changes",
      route_back_stage: 2,
      body_markdown: "Please tighten the contract tests.",
    });
  });

  it("hands Stage 2 contested-only rebuttals back to Stage 3 without forcing further fixes", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    seedAutonomousPolicy(rootDir, "03-recipe-like");

    createGitWorkspace(workspacePath, "feature/be-03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "in-progress",
    });
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "feat: seed backend branch"], { cwd: workspacePath });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: workspacePath,
      encoding: "utf8",
    }).trim();

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({ rootDir, workItemId: "03-recipe-like", slice: "03-recipe-like" }).state,
        slice: "03-recipe-like",
        current_stage: 3,
        last_completed_stage: 3,
        workspace: {
          path: workspacePath,
          branch_role: "backend",
        },
        prs: {
          docs: null,
          backend: {
            number: 35,
            url: "https://github.com/netsus/homecook/pull/35",
            draft: false,
            branch: "feature/be-03-recipe-like",
            head_sha: headSha,
          },
          frontend: null,
        },
        wait: {
          kind: "ready_for_next_stage",
          pr_role: "backend",
          stage: 2,
          head_sha: headSha,
        },
        last_review: {
          backend: {
            decision: "request_changes",
            route_back_stage: 2,
            approved_head_sha: null,
            body_markdown: "The API envelope concern is not actually a bug.",
            findings: [],
            review_scope: {
              scope: "backend",
              checklist_ids: [
                CHECKLIST_IDS.backendDelivery,
                CHECKLIST_IDS.backendAcceptance,
              ],
            },
            reviewed_checklist_ids: [
              CHECKLIST_IDS.backendDelivery,
              CHECKLIST_IDS.backendAcceptance,
            ],
            required_fix_ids: [CHECKLIST_IDS.backendAcceptance],
            waived_fix_ids: [],
            source_review_stage: 3,
            ping_pong_rounds: 1,
            updated_at: "2026-03-27T00:30:00+09:00",
          },
          frontend: null,
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T00:35:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "feature/be-03-recipe-like" };
          },
          pushBranch() {
            throw new Error("not expected");
          },
          syncBaseBranch() {
            throw new Error("not expected");
          },
          getHeadSha() {
            return headSha;
          },
        },
        stageRunner() {
          return {
            artifactDir: join(rootDir, ".artifacts", "stage2-rebuttal"),
            dispatch: { actor: "codex", stage: 2 },
            execution: { mode: "execute", executed: true, sessionId: "ses_codex" },
            stageResult: buildCodeStageResult({
              summary: "Contested backend finding only.",
              subject: "feat: contest backend fix",
              title: "feat: contest backend fix",
              checklistUpdates: [CHECKLIST_IDS.backendDelivery],
              contestedFixIds: [CHECKLIST_IDS.backendAcceptance],
              rebuttals: [
                {
                  fix_id: CHECKLIST_IDS.backendAcceptance,
                  rationale_markdown: "The response envelope already matches the documented contract.",
                  evidence_refs: ["docs/workpacks/03-recipe-like/README.md"],
                },
              ],
            }),
          };
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          editPullRequest() {},
          getRequiredChecks() {
            return { bucket: "pass", checks: [] };
          },
          markReady() {},
          commentPullRequest() {},
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {},
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      slice: "03-recipe-like",
    }).state as {
      wait: { kind: string; stage: number; pr_role: string };
      last_rebuttal: {
        backend: { contested_fix_ids: string[]; source_review_stage: number };
      };
    };

    expect(result.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 3,
      pr_role: "backend",
    });
    expect(runtime.last_rebuttal.backend).toMatchObject({
      contested_fix_ids: [CHECKLIST_IDS.backendAcceptance],
      source_review_stage: 3,
    });
  });

  it("records waived checklist metadata when Claude accepts a rebuttal and requests only the remaining fix ids", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    seedAutonomousPolicy(rootDir, "03-recipe-like");

    createGitWorkspace(workspacePath, "feature/be-03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "in-progress",
    });
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "feat: seed backend branch"], { cwd: workspacePath });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: workspacePath,
      encoding: "utf8",
    }).trim();

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({ rootDir, workItemId: "03-recipe-like", slice: "03-recipe-like" }).state,
        slice: "03-recipe-like",
        current_stage: 2,
        last_completed_stage: 2,
        workspace: {
          path: workspacePath,
          branch_role: "backend",
        },
        prs: {
          docs: null,
          backend: {
            number: 35,
            url: "https://github.com/netsus/homecook/pull/35",
            draft: false,
            branch: "feature/be-03-recipe-like",
            head_sha: headSha,
          },
          frontend: null,
        },
        wait: {
          kind: "ready_for_next_stage",
          pr_role: "backend",
          stage: 3,
          head_sha: headSha,
        },
        last_rebuttal: {
          backend: {
            source_review_stage: 3,
            contested_fix_ids: [CHECKLIST_IDS.backendAcceptance],
            rebuttals: [
              {
                fix_id: CHECKLIST_IDS.backendAcceptance,
                rationale_markdown: "The response envelope already matches the documented contract.",
                evidence_refs: ["docs/workpacks/03-recipe-like/README.md"],
              },
            ],
            updated_at: "2026-03-27T00:34:00+09:00",
          },
          frontend: null,
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T00:40:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "feature/be-03-recipe-like" };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return execFileSync("git", ["rev-parse", "HEAD"], {
              cwd: workspacePath,
              encoding: "utf8",
            }).trim();
          },
          getCurrentBranch() {
            return "feature/be-03-recipe-like";
          },
          listChangedFiles() {
            return ["docs/workpacks/03-recipe-like/acceptance.md"];
          },
        },
        stageRunner() {
          return {
            artifactDir: join(rootDir, ".artifacts", "stage3-waiver"),
            dispatch: { actor: "claude", stage: 3 },
            execution: { mode: "execute", executed: true, sessionId: "ses_claude" },
            stageResult: buildReviewStageResult({
              decision: "request_changes",
              stage: 3,
              reviewedChecklistIds: [
                CHECKLIST_IDS.backendDelivery,
                CHECKLIST_IDS.backendAcceptance,
              ],
              requiredFixIds: [CHECKLIST_IDS.backendDelivery],
              waivedFixIds: [CHECKLIST_IDS.backendAcceptance],
              bodyMarkdown: "Backend contract note accepted; only the delivery checklist item remains.",
              routeBackStage: 2,
            }),
          };
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            return { bucket: "pass", checks: [] };
          },
          markReady() {},
          commentPullRequest() {},
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {},
        },
      },
    );

    const acceptance = readFileSync(
      join(workspacePath, "docs", "workpacks", "03-recipe-like", "acceptance.md"),
      "utf8",
    );

    expect(result.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 2,
      pr_role: "backend",
    });
    expect(acceptance).toContain("waived=true");
    expect(acceptance).toContain("waived_by=claude");
    expect(acceptance).toContain("waived_stage=3");
    expect(acceptance).toContain("waived_reason=rebuttal_accepted");
  });

  it("auto merges the backend PR after a Stage 3 approval for an autonomous slice", () => {
    const rootDir = createFixture();
    seedAutonomousPolicy(rootDir, "03-recipe-like");
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    const gitLog: string[] = [];
    const ghLog: string[] = [];
    const activeHeadSha = "be1234567890abcdef1234567890abcdef123456";
    const approvedHeadSha = "be12345";
    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "in-progress",
    });

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        current_stage: 2,
        last_completed_stage: 2,
        workspace: {
          path: workspacePath,
          branch_role: "backend",
        },
        prs: {
          docs: null,
          backend: {
            number: 35,
            url: "https://github.com/netsus/homecook/pull/35",
            draft: false,
            branch: "feature/be-03-recipe-like",
            head_sha: activeHeadSha,
          },
          frontend: null,
        },
        wait: {
          kind: "ready_for_next_stage",
          pr_role: "backend",
          stage: 3,
          head_sha: activeHeadSha,
        },
        last_review: {
          backend: null,
          frontend: null,
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T00:45:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            mkdirSync(workspacePath, { recursive: true });
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "feature/be-03-recipe-like" };
          },
          pushBranch() {
            throw new Error("not expected");
          },
          syncBaseBranch() {
            gitLog.push("sync:master");
          },
          getHeadSha() {
            return activeHeadSha;
          },
        },
        stageRunner() {
          return {
            artifactDir: join(rootDir, ".artifacts", "stage3"),
            dispatch: { actor: "claude", stage: 3 },
            execution: { mode: "execute", executed: true, sessionId: "ses_claude" },
            stageResult: buildReviewStageResult({
              decision: "approve",
              stage: 3,
              reviewedChecklistIds: [
                CHECKLIST_IDS.backendDelivery,
                CHECKLIST_IDS.backendAcceptance,
              ],
              bodyMarkdown: "Backend review approved.",
              approvedHeadSha: approvedHeadSha,
            }),
          };
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            return { bucket: "pass", checks: [] };
          },
          markReady() {
            throw new Error("not expected");
          },
          commentPullRequest({ prRef, body }: { prRef: string; body: string }) {
            ghLog.push(`comment:${prRef}:${body}`);
          },
          mergePullRequest({ prRef, headSha }: { prRef: string; headSha: string }) {
            ghLog.push(`merge:${prRef}:${headSha}`);
            return { merged: true };
          },
          getApprovalRequirement() {
            return {
              required: false,
              requiredApprovingReviewCount: 0,
              source: "branch-protection",
            };
          },
          getPullRequestSummary() {
            return {
              state: "OPEN",
              mergedAt: null,
              mergeStateStatus: "CLEAN",
              reviewDecision: null,
            };
          },
          updateBranch() {
            throw new Error("not expected");
          },
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      slice: "03-recipe-like",
    }).state as {
      wait: { kind: string; stage: number | null; pr_role: string | null };
      last_review: {
        backend: { decision: string; approved_head_sha: string };
      };
    };

    expect(result.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 4,
    });
    expect(runtime.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 4,
    });
    expect(runtime.last_review.backend).toMatchObject({
      decision: "approve",
      approved_head_sha: activeHeadSha,
      body_markdown: "Backend review approved.",
    });
    expect(gitLog).toEqual(["sync:master"]);
    expect(ghLog).toEqual([
      "comment:https://github.com/netsus/homecook/pull/35:Backend review approved.",
      "merge:https://github.com/netsus/homecook/pull/35:be1234567890abcdef1234567890abcdef123456",
    ]);
  });

  it("treats approved Stage 3 review decisions as approve and advances to Stage 4", () => {
    const rootDir = createFixture();
    seedAutonomousPolicy(rootDir, "03-recipe-like");
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    const activeHeadSha = "be1234567890abcdef1234567890abcdef123456";
    const ghLog: string[] = [];
    const gitLog: string[] = [];

    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "in-progress",
    });

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        current_stage: 3,
        active_stage: 3,
        workspace: { path: workspacePath, branch_role: "backend" },
        prs: {
          docs: null,
          backend: {
            number: 35,
            url: "https://github.com/netsus/homecook/pull/35",
            draft: false,
            branch: "feature/be-03-recipe-like",
            head_sha: activeHeadSha,
          },
        },
        wait: {
          kind: "ready_for_next_stage",
          pr_role: "backend",
          stage: 3,
          head_sha: activeHeadSha,
        },
        last_review: {
          backend: null,
          frontend: null,
        },
      },
    });

    const result = superviseWorkItem(
      { rootDir, workItemId: "03-recipe-like", now: "2026-04-11T09:00:00+09:00", maxTransitions: 1 },
      {
        auth: { assertGhAuth() {}, assertClaudeAuth() {} },
        worktree: {
          ensureWorktree() {
            mkdirSync(workspacePath, { recursive: true });
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "feature/be-03-recipe-like" };
          },
          pushBranch() {},
          syncBaseBranch() {
            gitLog.push("sync:master");
          },
          getHeadSha() {
            return activeHeadSha;
          },
        },
        stageRunner() {
          return {
            artifactDir: join(rootDir, ".artifacts", "stage3-approved-alias"),
            dispatch: { actor: "claude", stage: 3 },
            execution: { mode: "execute", executed: true, sessionId: "ses_claude" },
            stageResult: buildReviewStageResult({
              decision: "approved",
              stage: 3,
              reviewedChecklistIds: [
                CHECKLIST_IDS.backendDelivery,
                CHECKLIST_IDS.backendAcceptance,
              ],
              bodyMarkdown: "Backend review approved.",
              approvedHeadSha: activeHeadSha,
            }),
          };
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            return { bucket: "pass", checks: [] };
          },
          markReady() {},
          commentPullRequest({ prRef, body }: { prRef: string; body: string }) {
            ghLog.push(`comment:${prRef}:${body}`);
          },
          mergePullRequest({ prRef, headSha }: { prRef: string; headSha?: string }) {
            ghLog.push(`merge:${prRef}:${headSha}`);
            return { merged: true };
          },
          getApprovalRequirement() {
            return {
              required: false,
              requiredApprovingReviewCount: 0,
              source: "branch-protection",
            };
          },
          getPullRequestSummary() {
            return {
              state: "OPEN",
              mergedAt: null,
              mergeStateStatus: "CLEAN",
              reviewDecision: null,
            };
          },
          updateBranch() {
            throw new Error("not expected");
          },
        },
      },
    );

    expect(result.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 4,
    });
    expect(gitLog).toEqual(["sync:master"]);
    expect(ghLog).toEqual([
      "comment:https://github.com/netsus/homecook/pull/35:Backend review approved.",
      `merge:https://github.com/netsus/homecook/pull/35:${activeHeadSha}`,
    ]);
  });

  it("uses the worktree automation-spec during Stage 3 review even when the root copy is malformed", () => {
    const rootDir = createFixture();
    seedAutonomousPolicy(rootDir, "03-recipe-like");
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    const activeHeadSha = "be1234567890abcdef1234567890abcdef123456";
    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "in-progress",
    });

    writeFileSync(
      join(rootDir, "docs", "workpacks", "03-recipe-like", "automation-spec.json"),
      JSON.stringify(
        {
          slice_id: "03-recipe-like",
          execution_mode: "autonomous",
          risk_class: "low",
          merge_policy: "conditional-auto",
          backend: {
            required_endpoints: ["POST /api/v1/recipes/{id}/like"],
            invariants: ["toggle-idempotency"],
            verify_commands: ["test -f tests/recipe-like.backend.test.ts"],
            required_test_targets: ["tests/recipe-like.backend.test.ts"],
          },
          frontend: {
            required_routes: ["/recipes/[id]"],
            required_states: ["loading"],
            playwright_projects: ["desktop-chrome"],
            artifact_assertions: ["playwright-report"],
          },
          external_smokes: [
            {
              id: "invalid-object",
            },
          ],
          blocked_conditions: [],
          max_fix_rounds: {
            backend: 4,
            frontend: 4,
          },
        },
        null,
        2,
      ),
    );

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        current_stage: 2,
        last_completed_stage: 2,
        workspace: {
          path: workspacePath,
          branch_role: "backend",
        },
        prs: {
          docs: null,
          backend: {
            number: 35,
            url: "https://github.com/netsus/homecook/pull/35",
            draft: false,
            branch: "feature/be-03-recipe-like",
            head_sha: activeHeadSha,
          },
          frontend: null,
        },
        wait: {
          kind: "ready_for_next_stage",
          pr_role: "backend",
          stage: 3,
          head_sha: activeHeadSha,
        },
        last_review: {
          backend: null,
          frontend: null,
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T00:45:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            mkdirSync(workspacePath, { recursive: true });
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "feature/be-03-recipe-like" };
          },
          pushBranch() {
            throw new Error("not expected");
          },
          syncBaseBranch() {},
          getHeadSha() {
            return activeHeadSha;
          },
        },
        stageRunner() {
          return {
            artifactDir: join(rootDir, ".artifacts", "stage3"),
            dispatch: { actor: "claude", stage: 3 },
            execution: { mode: "execute", executed: true, sessionId: "ses_claude" },
            stageResult: buildReviewStageResult({
              decision: "approve",
              stage: 3,
              reviewedChecklistIds: [
                CHECKLIST_IDS.backendDelivery,
                CHECKLIST_IDS.backendAcceptance,
              ],
              bodyMarkdown: "Backend review approved.",
              approvedHeadSha: activeHeadSha,
            }),
          };
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            return { bucket: "pass", checks: [] };
          },
          markReady() {
            throw new Error("not expected");
          },
          commentPullRequest() {},
          mergePullRequest() {
            return { merged: true };
          },
          getApprovalRequirement() {
            return {
              required: false,
              requiredApprovingReviewCount: 0,
              source: "branch-protection",
            };
          },
          getPullRequestSummary() {
            return {
              state: "OPEN",
              mergedAt: null,
              mergeStateStatus: "CLEAN",
              reviewDecision: null,
            };
          },
          updateBranch() {
            throw new Error("not expected");
          },
        },
      },
    );

    expect(result.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 4,
    });
  });

  it("keeps backend Stage 2 handoff approval_state as codex_approved", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    let observedStage: number | null = null;

    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "in-progress",
    });

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        current_stage: 2,
        last_completed_stage: 2,
        workspace: {
          path: workspacePath,
          branch_role: "backend",
          updated_at: "2026-03-26T15:55:00.000Z",
        },
        prs: {
          docs: null,
          backend: {
            number: 35,
            url: "https://github.com/netsus/homecook/pull/35",
            draft: false,
            branch: "feature/be-03-recipe-like",
            head_sha: "be123",
            updated_at: "2026-03-26T15:55:00.000Z",
          },
          frontend: null,
        },
        wait: {
          kind: "ci",
          pr_role: "backend",
          stage: 2,
          head_sha: "be123",
          reason: null,
          until: null,
          updated_at: "2026-03-26T15:55:00.000Z",
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T01:00:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
          assertClaudeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            mkdirSync(workspacePath, { recursive: true });
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "feature/be-03-recipe-like" };
          },
          pushBranch() {
            throw new Error("not expected");
          },
          syncBaseBranch() {
            throw new Error("not expected");
          },
          getHeadSha() {
            return "be123";
          },
          getCurrentBranch() {
            return "feature/be-03-recipe-like";
          },
          listChangedFiles() {
            return [];
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner({ stage }: { stage: number }) {
          observedStage = stage;
          const runtimeSync = writeRuntimeState({
            rootDir,
            workItemId: "03-recipe-like",
            state: {
              ...readRuntimeState({
                rootDir,
                workItemId: "03-recipe-like",
                slice: "03-recipe-like",
              }).state,
              slice: "03-recipe-like",
              current_stage: 3,
              last_completed_stage: 2,
              blocked_stage: 3,
              retry: {
                at: "2026-03-27T02:00:00.000Z",
                reason: "claude_budget_unavailable",
                attempt_count: 1,
                max_attempts: 3,
              },
              sessions: {
                claude_primary: {
                  session_id: "ses_claude_review",
                  agent: "athena",
                  updated_at: "2026-03-26T16:00:00.000Z",
                },
                codex_primary: {
                  session_id: "ses_codex_backend",
                  agent: "hephaestus",
                  updated_at: "2026-03-26T15:40:00.000Z",
                },
              },
            },
          });

          return {
            artifactDir: join(rootDir, ".artifacts", "stage3-backend-retry"),
            dispatch: { actor: "claude", stage: 3 },
            execution: {
              mode: "scheduled-retry",
              executed: false,
              sessionId: "ses_claude_review",
              reason: "claude_budget_unavailable",
            },
            runtimeSync,
            stageResult: null,
          };
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            return { bucket: "pass", checks: [] };
          },
          markReady() {
            throw new Error("not expected");
          },
          reviewPullRequest() {
            throw new Error("not expected");
          },
          commentPullRequest() {
            throw new Error("not expected");
          },
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {
            throw new Error("not expected");
          },
        },
      },
    );

    expect(observedStage).toBe(3);
    expect(result.wait).toMatchObject({
      kind: "blocked_retry",
      pr_role: "backend",
      stage: 3,
    });
    expect(readTrackedStatusItem(rootDir, "03-recipe-like")).toMatchObject({
      approval_state: "codex_approved",
    });
  });

  it("blocks Stage 4 ready-for-review when exploratory QA bundle is missing for a new-screen slice", () => {
    const rootDir = createFixture();
    seedAutonomousPolicy(rootDir, "03-recipe-like", {
      authorityRequired: true,
      uiRisk: "new-screen",
      requiredScreens: ["RECIPE_DETAIL"],
      authorityReportPaths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
      anchorScreens: ["RECIPE_DETAIL"],
    });
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "in-progress",
      designStatus: "pending-review",
      authorityStatus: "required",
      uiRisk: "new-screen",
      visualArtifact: "figma://recipe-detail",
    });
    mkdirSync(join(workspacePath, "ui", "designs", "authority"), { recursive: true });
    mkdirSync(join(workspacePath, "ui", "designs", "evidence", "06"), { recursive: true });
    writeFileSync(join(workspacePath, "ui", "designs", "authority", "RECIPE_DETAIL-authority.md"), "# Authority\n- verdict: pass\n");
    writeFileSync(join(workspacePath, "ui", "designs", "evidence", "06", "RECIPE_DETAIL-mobile.png"), "evidence\n");
    writeFileSync(join(workspacePath, "ui", "designs", "evidence", "06", "RECIPE_DETAIL-mobile-narrow.png"), "evidence\n");
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "feat: seed stage4 frontend"], { cwd: workspacePath });

    const artifactDir = join(rootDir, ".artifacts", "stage4-ready-no-qa");
    const stageResultPath = join(artifactDir, "stage-result.json");
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      stageResultPath,
      JSON.stringify(
        buildCodeStageResult({
          summary: "Frontend implementation completed.",
          subject: "feat: frontend implementation",
          title: "feat: frontend implementation",
          checklistUpdates: [CHECKLIST_IDS.frontendDelivery, CHECKLIST_IDS.frontendAcceptance],
          changedFiles: ["app/example/page.tsx"],
        }),
        null,
        2,
      ),
    );

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({ rootDir, workItemId: "03-recipe-like", slice: "03-recipe-like" }).state,
        slice: "03-recipe-like",
        current_stage: 4,
        active_stage: 4,
        phase: "stage_result_ready",
        next_action: "finalize_stage",
        last_artifact_dir: artifactDir,
        workspace: { path: workspacePath, branch_role: "frontend" },
        execution: {
          provider: "claude-cli",
          session_role: "claude_primary",
          session_id: "ses_claude_stage4_no_qa",
          artifact_dir: artifactDir,
          stage_result_path: stageResultPath,
          started_at: "2026-04-20T15:00:00+09:00",
          finished_at: "2026-04-20T15:02:00+09:00",
          verify_commands: [],
          verify_bucket: "pass",
          commit_sha: execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspacePath, encoding: "utf8" }).trim(),
          pr_role: "frontend",
        },
      },
    });

    const result = superviseWorkItem(
      { rootDir, workItemId: "03-recipe-like", now: "2026-04-20T15:05:00+09:00", maxTransitions: 1 },
      {
        auth: { assertGhAuth() {}, assertClaudeAuth() {}, assertOpencodeAuth() {} },
        worktree: {
          ensureWorktree() { return { path: workspacePath, created: false }; },
          assertClean() {},
          checkoutBranch() { return { branch: "feature/fe-03-recipe-like" }; },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspacePath, encoding: "utf8" }).trim();
          },
          getCurrentBranch() { return "feature/fe-03-recipe-like"; },
          listChangedFiles() { return []; },
          getBinaryDiff() { return ""; },
        },
        stageRunner() { throw new Error("not expected"); },
        github: {
          createPullRequest() {
            return {
              number: 41,
              url: "https://github.com/netsus/homecook/pull/41",
              draft: true,
            };
          },
          editPullRequest() {},
          getRequiredChecks() { return { bucket: "pass", checks: [] }; },
          markReady() { throw new Error("not expected"); },
          commentPullRequest() {},
          mergePullRequest() { throw new Error("not expected"); },
          getPullRequestSummary() {
            return {
              state: "OPEN",
              mergedAt: null,
              mergeStateStatus: "CLEAN",
              reviewDecision: null,
            };
          },
          updateBranch() {},
        },
      },
    );

    expect(result.wait).toMatchObject({
      kind: "human_escalation",
      stage: 4,
      pr_role: "frontend",
    });
    expect(result.runtime?.wait?.reason ?? "").toContain("Exploratory QA bundle is missing");
  });

  it("blocks Stage 3 autonomous merge when branch protection still requires formal approval", () => {
    const rootDir = createFixture();
    seedAutonomousPolicy(rootDir, "03-recipe-like");
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "in-progress",
    });

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        current_stage: 2,
        last_completed_stage: 2,
        workspace: {
          path: workspacePath,
          branch_role: "backend",
        },
        prs: {
          docs: null,
          backend: {
            number: 35,
            url: "https://github.com/netsus/homecook/pull/35",
            draft: false,
            branch: "feature/be-03-recipe-like",
            head_sha: "be123",
          },
          frontend: null,
        },
        wait: {
          kind: "ready_for_next_stage",
          pr_role: "backend",
          stage: 3,
          head_sha: "be123",
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T00:46:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            mkdirSync(workspacePath, { recursive: true });
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "feature/be-03-recipe-like" };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return "be123";
          },
        },
        stageRunner() {
          return {
            artifactDir: join(rootDir, ".artifacts", "stage3-approve"),
            dispatch: { actor: "claude", stage: 3 },
            execution: { mode: "execute", executed: true, sessionId: "ses_claude" },
            stageResult: buildReviewStageResult({
              decision: "approve",
              stage: 3,
              reviewedChecklistIds: [
                CHECKLIST_IDS.backendDelivery,
                CHECKLIST_IDS.backendAcceptance,
              ],
              bodyMarkdown: "Backend review approved.",
              approvedHeadSha: "be123",
            }),
          };
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            return { bucket: "pass", checks: [] };
          },
          markReady() {},
          commentPullRequest() {},
          getApprovalRequirement() {
            return {
              required: true,
              requiredApprovingReviewCount: 1,
              source: "branch-protection",
            };
          },
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {},
        },
      },
    );

    expect(result.wait).toMatchObject({
      kind: "human_escalation",
    });
    const runtime = readRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      slice: "03-recipe-like",
    }).state as {
      wait: { kind: string; stage: number | null; pr_role: string | null; reason: string };
    };
    expect(runtime.wait.kind).toBe("human_escalation");
    expect(runtime.wait.reason).toContain("requires 1 approving review");
  });

  it("commits Design Status confirmed after Stage 5 approval and waits for CI", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    const workpackReadme = join(workspacePath, "docs", "workpacks", "03-recipe-like", "README.md");

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "in-progress",
      designStatus: "pending-review",
    });
    mkdirSync(join(workspacePath, "docs", "workpacks", "03-recipe-like"), { recursive: true });
    writeFileSync(
      workpackReadme,
      [
        "# 03-recipe-like",
        "",
        "## Design Status",
        "",
        "- [ ] 임시 UI (temporary)",
        "- [x] 리뷰 대기 (pending-review)",
        "- [ ] 확정 (confirmed)",
        "- [ ] N/A",
      ].join("\n"),
    );
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "feat: seed frontend branch"], { cwd: workspacePath });

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        current_stage: 4,
        last_completed_stage: 4,
        workspace: {
          path: workspacePath,
          branch_role: "frontend",
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: false,
            branch: "feature/fe-03-recipe-like",
            head_sha: execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspacePath, encoding: "utf8" }).trim(),
          },
        },
        wait: {
          kind: "ready_for_next_stage",
          pr_role: "frontend",
          stage: 5,
          head_sha: execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspacePath, encoding: "utf8" }).trim(),
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T00:48:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "feature/fe-03-recipe-like" };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return execFileSync("git", ["rev-parse", "HEAD"], {
              cwd: workspacePath,
              encoding: "utf8",
            }).trim();
          },
        },
        stageRunner() {
          return {
            artifactDir: join(rootDir, ".artifacts", "stage5"),
            dispatch: { actor: "claude", stage: 5 },
            execution: { mode: "execute", executed: true, sessionId: "ses_claude" },
            stageResult: {
              decision: "approve",
              body_markdown: "디자인 리뷰 승인",
              route_back_stage: null,
              approved_head_sha: null,
            },
          };
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            return { bucket: "pass", checks: [] };
          },
          markReady() {},
          reviewPullRequest() {
            throw new Error("not expected");
          },
          commentPullRequest() {},
          mergePullRequest() {
            throw new Error("not expected");
          },
          getPullRequestSummary() {
            return {
              state: "OPEN",
              mergedAt: null,
              mergeStateStatus: "CLEAN",
              reviewDecision: "APPROVED",
            };
          },
          updateBranch() {},
        },
      },
    );

    const updatedReadme = readFileSync(workpackReadme, "utf8");

    expect(result.wait).toMatchObject({
      kind: "ci",
      stage: 5,
      pr_role: "frontend",
    });
    expect(updatedReadme).toContain("- [ ] 리뷰 대기 (pending-review)");
    expect(updatedReadme).toContain("- [x] 확정 (confirmed)");
  });

  it("keeps roadmap status unchanged when Stage 6 requests frontend changes", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    const roadmapPath = join(workspacePath, "docs", "workpacks", "README.md");
    const workpackReadme = join(workspacePath, "docs", "workpacks", "03-recipe-like", "README.md");

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    mkdirSync(join(workspacePath, "docs", "workpacks", "03-recipe-like"), { recursive: true });
    writeFileSync(
      roadmapPath,
      [
        "# Workpack Roadmap v2",
        "",
        "## Slice Order",
        "",
        "| Slice | Status | Goal |",
        "| --- | --- | --- |",
        "| `03-recipe-like` | in-progress | test slice |",
      ].join("\n"),
    );
    writeFileSync(
      workpackReadme,
      [
        "# 03-recipe-like",
        "",
        "## Design Status",
        "",
        "- [ ] 임시 UI (temporary)",
        "- [ ] 리뷰 대기 (pending-review)",
        "- [x] 확정 (confirmed)",
        "- [ ] N/A",
      ].join("\n"),
    );
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "feat: seed frontend branch"], { cwd: workspacePath });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: workspacePath,
      encoding: "utf8",
    }).trim();

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        current_stage: 5,
        last_completed_stage: 5,
        workspace: {
          path: workspacePath,
          branch_role: "frontend",
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: false,
            branch: "feature/fe-03-recipe-like",
            head_sha: headSha,
          },
        },
        wait: {
          kind: "ready_for_next_stage",
          pr_role: "frontend",
          stage: 6,
          head_sha: headSha,
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T00:49:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "feature/fe-03-recipe-like" };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return execFileSync("git", ["rev-parse", "HEAD"], {
              cwd: workspacePath,
              encoding: "utf8",
            }).trim();
          },
        },
        stageRunner() {
          return {
            artifactDir: join(rootDir, ".artifacts", "stage6-request-changes"),
            dispatch: { actor: "claude", stage: 6 },
            execution: { mode: "execute", executed: true, sessionId: "ses_claude" },
            stageResult: {
              decision: "request_changes",
              body_markdown: "Planner CTA state를 다시 다듬어 주세요.",
              route_back_stage: 4,
              approved_head_sha: null,
            },
          };
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            return { bucket: "pass", checks: [] };
          },
          markReady() {},
          reviewPullRequest() {},
          commentPullRequest() {},
          mergePullRequest() {
            throw new Error("not expected");
          },
          getPullRequestSummary() {
            return {
              state: "OPEN",
              mergedAt: null,
              mergeStateStatus: "CLEAN",
              reviewDecision: "CHANGES_REQUESTED",
            };
          },
          updateBranch() {},
        },
      },
    );

    const updatedRoadmap = readFileSync(roadmapPath, "utf8");

    expect(result.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 4,
      pr_role: "frontend",
    });
    expect(updatedRoadmap).toContain("| `03-recipe-like` | in-progress");
    expect(updatedRoadmap).not.toContain("| `03-recipe-like` | merged");
  });

  it("routes Stage 5 request-changes back to Stage 4", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "in-progress",
      designStatus: "pending-review",
    });
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "feat: seed stage5 review"], { cwd: workspacePath });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: workspacePath,
      encoding: "utf8",
    }).trim();

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        current_stage: 4,
        last_completed_stage: 4,
        workspace: {
          path: workspacePath,
          branch_role: "frontend",
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: false,
            branch: "feature/fe-03-recipe-like",
            head_sha: headSha,
          },
        },
        wait: {
          kind: "ready_for_next_stage",
          pr_role: "frontend",
          stage: 5,
          head_sha: headSha,
        },
      },
    });

    const reviewResult = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T00:49:30+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "feature/fe-03-recipe-like" };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return execFileSync("git", ["rev-parse", "HEAD"], {
              cwd: workspacePath,
              encoding: "utf8",
            }).trim();
          },
        },
        stageRunner() {
          return {
            artifactDir: join(rootDir, ".artifacts", "stage5-request-changes"),
            dispatch: { actor: "claude", stage: 5 },
            execution: { mode: "execute", executed: true, sessionId: "ses_claude" },
            stageResult: buildReviewStageResult({
              decision: "request_changes",
              stage: 5,
              reviewedChecklistIds: [
                CHECKLIST_IDS.frontendDelivery,
                CHECKLIST_IDS.frontendAcceptance,
              ],
              requiredFixIds: [CHECKLIST_IDS.frontendDelivery],
              bodyMarkdown: "UI spacing and CTA treatment need another pass.",
              routeBackStage: 4,
            }),
          };
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            return { bucket: "pass", checks: [] };
          },
          markReady() {},
          reviewPullRequest() {},
          commentPullRequest() {},
          mergePullRequest() {
            throw new Error("not expected");
          },
          getPullRequestSummary() {
            return {
              state: "OPEN",
              mergedAt: null,
              mergeStateStatus: "CLEAN",
              reviewDecision: "CHANGES_REQUESTED",
            };
          },
          updateBranch() {},
        },
      },
    );

    expect(reviewResult.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 4,
      pr_role: "frontend",
    });
  });

  it("routes Stage 4 back to Stage 5 when the last review came from Stage 5", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    mkdirSync(join(workspacePath, "docs", "workpacks", "03-recipe-like"), { recursive: true });
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "README.md"),
      [
        "# Workpack Roadmap v2",
        "",
        "## Slice Order",
        "",
        "| Slice | Status | Goal |",
        "| --- | --- | --- |",
        "| `03-recipe-like` | in-progress | test slice |",
      ].join("\n"),
    );
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "03-recipe-like", "README.md"),
      buildWorkpackReadme({
        workItemId: "03-recipe-like",
        designStatus: "confirmed",
        backendChecked: true,
        frontendChecked: true,
      }),
    );
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "03-recipe-like", "acceptance.md"),
      buildAcceptance({
        workItemId: "03-recipe-like",
        backendChecked: true,
        frontendChecked: true,
      }),
    );
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "feat: seed stage4 branch from stage5"], { cwd: workspacePath });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: workspacePath,
      encoding: "utf8",
    }).trim();

    const artifactDir = join(rootDir, ".artifacts", "stage4-rerun-from-stage5");
    mkdirSync(artifactDir, { recursive: true });
    const stageResultPath = join(artifactDir, "stage-result.json");
    writeFileSync(
      stageResultPath,
      JSON.stringify(
        buildCodeStageResult({
          summary: "Refined spacing and CTA treatment.",
          subject: "feat(fe): refine planner visuals",
          title: "feat(fe): refine planner visuals",
          checklistUpdates: [
            CHECKLIST_IDS.frontendDelivery,
            CHECKLIST_IDS.frontendAcceptance,
          ],
          changedFiles: ["app/planner/page.tsx"],
        }),
      ),
    );

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        current_stage: 4,
        active_stage: 4,
        phase: "stage_result_ready",
        next_action: "finalize_stage",
        last_artifact_dir: artifactDir,
        workspace: { path: workspacePath, branch_role: "frontend" },
        execution: {
          provider: "claude-cli",
          session_role: "claude_primary",
          session_id: "ses_claude_rerun_from_stage5",
          artifact_dir: artifactDir,
          stage_result_path: stageResultPath,
          started_at: "2026-03-27T01:00:00+09:00",
          finished_at: "2026-03-27T01:05:00+09:00",
          verify_commands: [],
          verify_bucket: null,
          commit_sha: null,
          pr_role: "frontend",
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: false,
            branch: "feature/fe-03-recipe-like",
            head_sha: headSha,
          },
        },
        last_review: {
          frontend: {
            decision: "request_changes",
            route_back_stage: 4,
            source_review_stage: 5,
            ping_pong_rounds: 1,
            body_markdown: "UI spacing and CTA treatment need another pass.",
            findings: [
              {
                file: "app/planner/page.tsx",
                line_hint: 1,
                severity: "major",
                category: "logic",
                issue: "Spacing hierarchy is inconsistent.",
                suggestion: "Align CTA and card spacing with the design review feedback.",
              },
            ],
            review_scope: {
              scope: "frontend",
              checklist_ids: [
                CHECKLIST_IDS.frontendDelivery,
                CHECKLIST_IDS.frontendAcceptance,
              ],
            },
            reviewed_checklist_ids: [
              CHECKLIST_IDS.frontendDelivery,
              CHECKLIST_IDS.frontendAcceptance,
            ],
            required_fix_ids: [CHECKLIST_IDS.frontendDelivery],
            updated_at: "2026-03-27T00:55:00+09:00",
          },
        },
        wait: null,
      },
    });

    const rerunResult = superviseWorkItem(
      { rootDir, workItemId: "03-recipe-like", now: "2026-03-27T01:10:00+09:00", maxTransitions: 1 },
      {
        auth: { assertGhAuth() {}, assertOpencodeAuth() {} },
        worktree: {
          ensureWorktree() { return { path: workspacePath, created: false }; },
          assertClean() {},
          checkoutBranch() { return { branch: "feature/fe-03-recipe-like" }; },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspacePath, encoding: "utf8" }).trim();
          },
          getCurrentBranch() { return "feature/fe-03-recipe-like"; },
          listChangedFiles() { return []; },
        },
        stageRunner() { throw new Error("not expected in finalize path"); },
        github: {
          createPullRequest() { throw new Error("not expected"); },
          editPullRequest() {},
          getRequiredChecks() { return { bucket: "pass", checks: [] }; },
          markReady() {},
          commentPullRequest() {},
          mergePullRequest() { throw new Error("not expected"); },
          getPullRequestSummary() {
            return { state: "OPEN", mergedAt: null, mergeStateStatus: "CLEAN", reviewDecision: null };
          },
          updateBranch() {},
        },
      },
    );

    expect(rerunResult.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 5,
      pr_role: "frontend",
    });
    expect(readTrackedStatusItem(rootDir, "03-recipe-like")).toMatchObject({
      approval_state: "claude_approved",
    });
  });

  it("hands Stage 4 contested-only rebuttals back to Stage 5 with claude_approved status", () => {
    const rootDir = createFixture();
    seedAutonomousPolicy(rootDir, "03-recipe-like");
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "in-progress",
      designStatus: "confirmed",
    });
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "feat: seed stage4 rebuttal branch"], { cwd: workspacePath });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: workspacePath,
      encoding: "utf8",
    }).trim();

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({ rootDir, workItemId: "03-recipe-like", slice: "03-recipe-like" }).state,
        slice: "03-recipe-like",
        current_stage: 5,
        last_completed_stage: 5,
        workspace: {
          path: workspacePath,
          branch_role: "frontend",
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: false,
            branch: "feature/fe-03-recipe-like",
            head_sha: headSha,
          },
        },
        wait: {
          kind: "ready_for_next_stage",
          pr_role: "frontend",
          stage: 4,
          head_sha: headSha,
        },
        last_review: {
          frontend: {
            decision: "request_changes",
            route_back_stage: 4,
            approved_head_sha: null,
            body_markdown: "The requested visual tweak is not needed.",
            findings: [],
            review_scope: {
              scope: "frontend",
              checklist_ids: [
                CHECKLIST_IDS.frontendDelivery,
                CHECKLIST_IDS.frontendAcceptance,
              ],
            },
            reviewed_checklist_ids: [
              CHECKLIST_IDS.frontendDelivery,
              CHECKLIST_IDS.frontendAcceptance,
            ],
            required_fix_ids: [CHECKLIST_IDS.frontendDelivery],
            waived_fix_ids: [],
            source_review_stage: 5,
            ping_pong_rounds: 1,
            updated_at: "2026-04-12T00:00:00+09:00",
          },
          backend: null,
        },
      },
    });

    const result = superviseWorkItem(
      { rootDir, workItemId: "03-recipe-like", now: "2026-04-12T00:15:00+09:00", maxTransitions: 1 },
      {
        auth: { assertGhAuth() {}, assertOpencodeAuth() {} },
        worktree: {
          ensureWorktree() { return { path: workspacePath, created: false }; },
          assertClean() {},
          checkoutBranch() { return { branch: "feature/fe-03-recipe-like" }; },
          pushBranch() { throw new Error("not expected"); },
          syncBaseBranch() { throw new Error("not expected"); },
          getHeadSha() { return headSha; },
        },
        stageRunner() {
          return {
            artifactDir: join(rootDir, ".artifacts", "stage4-rebuttal"),
            dispatch: { actor: "claude", stage: 4 },
            execution: { mode: "execute", executed: true, sessionId: "ses_claude_stage4_rebuttal" },
            stageResult: buildCodeStageResult({
              summary: "Contested frontend finding only.",
              subject: "feat(fe): contest frontend fix",
              title: "feat(fe): contest frontend fix",
              checklistUpdates: [CHECKLIST_IDS.frontendAcceptance],
              contestedFixIds: [CHECKLIST_IDS.frontendDelivery],
              rebuttals: [
                {
                  fix_id: CHECKLIST_IDS.frontendDelivery,
                  rationale_markdown: "The current CTA treatment already matches the approved pattern.",
                  evidence_refs: ["docs/workpacks/03-recipe-like/README.md"],
                },
              ],
            }),
          };
        },
        github: {
          createPullRequest() { throw new Error("not expected"); },
          editPullRequest() {},
          getRequiredChecks() { return { bucket: "pass", checks: [] }; },
          markReady() {},
          commentPullRequest() {},
          mergePullRequest() { throw new Error("not expected"); },
          updateBranch() {},
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      slice: "03-recipe-like",
    }).state as {
      wait: { kind: string; stage: number; pr_role: string };
      last_rebuttal: {
        frontend: { contested_fix_ids: string[]; source_review_stage: number };
      };
    };

    expect(result.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 5,
      pr_role: "frontend",
    });
    expect(runtime.last_rebuttal.frontend).toMatchObject({
      contested_fix_ids: [CHECKLIST_IDS.frontendDelivery],
      source_review_stage: 5,
    });
    expect(readTrackedStatusItem(rootDir, "03-recipe-like")).toMatchObject({
      approval_state: "claude_approved",
      verification_status: "pending",
    });
  });

  it("routes Stage 5 approve to final_authority_gate for authority-required slices", () => {
    const rootDir = createFixture();
    seedAutonomousPolicy(rootDir, "03-recipe-like", {
      authorityRequired: true,
      uiRisk: "new-screen",
      requiredScreens: ["RECIPE_DETAIL"],
      authorityReportPaths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
      anchorScreens: ["RECIPE_DETAIL"],
    });
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "in-progress",
      designStatus: "pending-review",
      authorityStatus: "required",
      uiRisk: "new-screen",
      visualArtifact: "ui/designs/evidence/06/RECIPE_DETAIL-mobile.png",
    });
    mkdirSync(join(workspacePath, "ui", "designs", "authority"), { recursive: true });
    writeFileSync(join(workspacePath, "ui", "designs", "authority", "RECIPE_DETAIL-authority.md"), "# Authority\n- verdict: pass\n");
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "feat: seed stage5 authority"], { cwd: workspacePath });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspacePath, encoding: "utf8" }).trim();

    const artifactDir = join(rootDir, ".artifacts", "stage5-public-approve");
    const stageResultPath = join(artifactDir, "stage-result.json");
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      stageResultPath,
      JSON.stringify(
        {
          ...buildReviewStageResult({
            decision: "approve",
            stage: 5,
            reviewedChecklistIds: [CHECKLIST_IDS.frontendDelivery, CHECKLIST_IDS.frontendAcceptance],
            bodyMarkdown: "Codex public review approved.",
          }),
          authority_verdict: "pass",
          reviewed_screen_ids: ["RECIPE_DETAIL"],
          authority_report_paths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
          blocker_count: 0,
          major_count: 0,
          minor_count: 0,
        },
        null,
        2,
      ),
    );

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({ rootDir, workItemId: "03-recipe-like", slice: "03-recipe-like" }).state,
        slice: "03-recipe-like",
        active_stage: 5,
        current_stage: 5,
        workspace: { path: workspacePath, branch_role: "frontend" },
        phase: "review_pending",
        next_action: "run_review",
        last_artifact_dir: artifactDir,
        execution: {
          provider: "opencode",
          session_role: "codex_primary",
          session_id: "ses_codex_stage5",
          artifact_dir: artifactDir,
          stage_result_path: stageResultPath,
          started_at: "2026-04-10T10:00:00+09:00",
          finished_at: "2026-04-10T10:00:00+09:00",
          verify_commands: [],
          verify_bucket: null,
          commit_sha: null,
          pr_role: "frontend",
          subphase: "implementation",
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: false,
            branch: "feature/fe-03-recipe-like",
            head_sha: headSha,
          },
        },
      },
    });

    const result = superviseWorkItem(
      { rootDir, workItemId: "03-recipe-like", now: "2026-04-10T10:00:00+09:00", maxTransitions: 1 },
      {
        auth: { assertGhAuth() {}, assertOpencodeAuth() {} },
        worktree: {
          ensureWorktree() { return { path: workspacePath, created: false }; },
          assertClean() {},
          checkoutBranch({ branch }: { branch: string }) { return { branch }; },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() { return headSha; },
          getCurrentBranch() { return "feature/fe-03-recipe-like"; },
          listChangedFiles() { return []; },
          getBinaryDiff() { return ""; },
        },
        stageRunner() { throw new Error("not expected"); },
        github: {
          createPullRequest() { throw new Error("not expected"); },
          editPullRequest() {},
          getRequiredChecks() { return { bucket: "pass", checks: [] }; },
          markReady() {},
          commentPullRequest() {},
          mergePullRequest() { throw new Error("not expected"); },
          getPullRequestSummary() { return { state: "OPEN", mergedAt: null, mergeStateStatus: "CLEAN", reviewDecision: null }; },
          updateBranch() {},
        },
      },
    );

    expect(result.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 5,
      pr_role: "frontend",
    });
    expect(
      readRuntimeState({ rootDir, workItemId: "03-recipe-like", slice: "03-recipe-like" }).state.design_authority,
    ).toMatchObject({
      status: "final_authority_pending",
      authority_verdict: "pass",
    });
    expect(readTrackedStatusItem(rootDir, "03-recipe-like")).toMatchObject({
      approval_state: "codex_approved",
    });
  });

  it("re-enters Stage 5 through final_authority_gate after authority-required public approval", () => {
    const rootDir = createFixture();
    seedAutonomousPolicy(rootDir, "03-recipe-like", {
      authorityRequired: true,
      uiRisk: "new-screen",
      requiredScreens: ["RECIPE_DETAIL"],
      authorityReportPaths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
      anchorScreens: ["RECIPE_DETAIL"],
    });
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    let observedSubphase: string | null = null;

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "in-progress",
      designStatus: "pending-review",
      authorityStatus: "required",
      uiRisk: "new-screen",
      visualArtifact: "ui/designs/evidence/06/RECIPE_DETAIL-mobile.png",
    });
    mkdirSync(join(workspacePath, "ui", "designs", "authority"), { recursive: true });
    writeFileSync(join(workspacePath, "ui", "designs", "authority", "RECIPE_DETAIL-authority.md"), "# Authority\n- verdict: pass\n");
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "feat: seed stage5 authority reroute"], { cwd: workspacePath });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspacePath, encoding: "utf8" }).trim();

    const publicArtifactDir = join(rootDir, ".artifacts", "stage5-public-approve-reroute");
    const publicStageResultPath = join(publicArtifactDir, "stage-result.json");
    mkdirSync(publicArtifactDir, { recursive: true });
    writeFileSync(
      publicStageResultPath,
      JSON.stringify(
        {
          ...buildReviewStageResult({
            decision: "approve",
            stage: 5,
            reviewedChecklistIds: [CHECKLIST_IDS.frontendDelivery, CHECKLIST_IDS.frontendAcceptance],
            bodyMarkdown: "Codex public review approved.",
          }),
          authority_verdict: "pass",
          reviewed_screen_ids: ["RECIPE_DETAIL"],
          authority_report_paths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
          blocker_count: 0,
          major_count: 0,
          minor_count: 0,
        },
        null,
        2,
      ),
    );

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({ rootDir, workItemId: "03-recipe-like", slice: "03-recipe-like" }).state,
        slice: "03-recipe-like",
        active_stage: 5,
        current_stage: 5,
        workspace: { path: workspacePath, branch_role: "frontend" },
        phase: "review_pending",
        next_action: "run_review",
        last_artifact_dir: publicArtifactDir,
        execution: {
          provider: "opencode",
          session_role: "codex_primary",
          session_id: "ses_codex_stage5",
          artifact_dir: publicArtifactDir,
          stage_result_path: publicStageResultPath,
          started_at: "2026-04-10T10:00:00+09:00",
          finished_at: "2026-04-10T10:00:00+09:00",
          verify_commands: [],
          verify_bucket: null,
          commit_sha: null,
          pr_role: "frontend",
          subphase: "implementation",
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: false,
            branch: "feature/fe-03-recipe-like",
            head_sha: headSha,
          },
        },
      },
    });
    seedQaArtifactBundle(rootDir, "03-recipe-like", "2026-03-27-stage4-rerun");

    const first = superviseWorkItem(
      { rootDir, workItemId: "03-recipe-like", now: "2026-04-10T10:00:00+09:00", maxTransitions: 1 },
      {
        auth: { assertGhAuth() {}, assertOpencodeAuth() {} },
        worktree: {
          ensureWorktree() { return { path: workspacePath, created: false }; },
          assertClean() {},
          checkoutBranch({ branch }: { branch: string }) { return { branch }; },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() { return headSha; },
          getCurrentBranch() { return "feature/fe-03-recipe-like"; },
          listChangedFiles() { return []; },
          getBinaryDiff() { return ""; },
        },
        stageRunner() { throw new Error("not expected"); },
        github: {
          createPullRequest() { throw new Error("not expected"); },
          editPullRequest() {},
          getRequiredChecks() { return { bucket: "pass", checks: [] }; },
          markReady() {},
          commentPullRequest() {},
          mergePullRequest() { throw new Error("not expected"); },
          getPullRequestSummary() { return { state: "OPEN", mergedAt: null, mergeStateStatus: "CLEAN", reviewDecision: null }; },
          updateBranch() {},
        },
      },
    );

    expect(first.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 5,
      pr_role: "frontend",
    });
    expect(readTrackedStatusItem(rootDir, "03-recipe-like")).toMatchObject({
      approval_state: "codex_approved",
    });

    const second = superviseWorkItem(
      { rootDir, workItemId: "03-recipe-like", now: "2026-04-10T10:05:00+09:00", maxTransitions: 1 },
      {
        auth: { assertGhAuth() {}, assertOpencodeAuth() {}, assertClaudeAuth() {} },
        worktree: {
          ensureWorktree() { return { path: workspacePath, created: false }; },
          assertClean() {},
          checkoutBranch({ branch }: { branch: string }) { return { branch }; },
          pushBranch() { throw new Error("not expected"); },
          syncBaseBranch() { throw new Error("not expected"); },
          getHeadSha() { return headSha; },
          getCurrentBranch() { return "feature/fe-03-recipe-like"; },
          listChangedFiles() { return []; },
          getBinaryDiff() { return ""; },
        },
        stageRunner({ subphase }: { subphase?: string | null }) {
          observedSubphase = subphase ?? null;
          const runtimeSync = writeRuntimeState({
            rootDir,
            workItemId: "03-recipe-like",
            state: {
              ...readRuntimeState({ rootDir, workItemId: "03-recipe-like", slice: "03-recipe-like" }).state,
              slice: "03-recipe-like",
              current_stage: 5,
              blocked_stage: 5,
              retry: {
                at: "2026-04-10T11:00:00.000Z",
                reason: "claude_budget_unavailable",
                attempt_count: 1,
                max_attempts: 3,
              },
              sessions: {
                claude_primary: {
                  session_id: "ses_claude_authority",
                  agent: "athena",
                  updated_at: "2026-04-10T10:05:00.000Z",
                },
                codex_primary: {
                  session_id: "ses_codex_stage5",
                  agent: "hephaestus",
                  updated_at: "2026-04-10T10:00:00.000Z",
                },
              },
            },
          });

          return {
            artifactDir: join(rootDir, ".artifacts", "stage5-final-authority-retry"),
            dispatch: { actor: "claude", stage: 5, subphase: "final_authority_gate" },
            execution: {
              mode: "scheduled-retry",
              executed: false,
              sessionId: "ses_claude_authority",
              reason: "claude_budget_unavailable",
            },
            runtimeSync,
            stageResult: null,
          };
        },
        github: {
          createPullRequest() { throw new Error("not expected"); },
          editPullRequest() {},
          getRequiredChecks() { throw new Error("not expected"); },
          markReady() { throw new Error("not expected"); },
          commentPullRequest() { throw new Error("not expected"); },
          mergePullRequest() { throw new Error("not expected"); },
          getPullRequestSummary() { throw new Error("not expected"); },
          updateBranch() { throw new Error("not expected"); },
        },
      },
    );

    expect(observedSubphase).toBe("final_authority_gate");
    expect(second.wait).toMatchObject({
      kind: "blocked_retry",
      stage: 5,
      pr_role: "frontend",
    });
    expect(readTrackedStatusItem(rootDir, "03-recipe-like")).toMatchObject({
      approval_state: "codex_approved",
    });
  });

  it("routes final_authority_gate pass to Stage 6", () => {
    const rootDir = createFixture();
    seedAutonomousPolicy(rootDir, "03-recipe-like", {
      authorityRequired: true,
      uiRisk: "new-screen",
      requiredScreens: ["RECIPE_DETAIL"],
      authorityReportPaths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
      anchorScreens: ["RECIPE_DETAIL"],
    });
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "in-progress",
      designStatus: "pending-review",
      authorityStatus: "required",
      uiRisk: "new-screen",
      visualArtifact: "ui/designs/evidence/06/RECIPE_DETAIL-mobile.png",
    });
    mkdirSync(join(workspacePath, "ui", "designs", "authority"), { recursive: true });
    writeFileSync(join(workspacePath, "ui", "designs", "authority", "RECIPE_DETAIL-authority.md"), "# Authority\n- verdict: pass\n");
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "feat: seed final authority gate"], { cwd: workspacePath });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspacePath, encoding: "utf8" }).trim();

    const artifactDir = join(rootDir, ".artifacts", "stage5-final-authority");
    const stageResultPath = join(artifactDir, "stage-result.json");
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      stageResultPath,
      JSON.stringify(
        {
          ...buildReviewStageResult({
            decision: "approve",
            stage: 5,
            reviewedChecklistIds: [CHECKLIST_IDS.frontendDelivery, CHECKLIST_IDS.frontendAcceptance],
            bodyMarkdown: "Claude final authority approved.",
          }),
          authority_verdict: "pass",
          reviewed_screen_ids: ["RECIPE_DETAIL"],
          authority_report_paths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
          blocker_count: 0,
          major_count: 0,
          minor_count: 0,
        },
        null,
        2,
      ),
    );

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({ rootDir, workItemId: "03-recipe-like", slice: "03-recipe-like" }).state,
        slice: "03-recipe-like",
        active_stage: 5,
        current_stage: 5,
        workspace: { path: workspacePath, branch_role: "frontend" },
        phase: "review_pending",
        next_action: "run_review",
        last_artifact_dir: artifactDir,
        execution: {
          provider: "claude-cli",
          session_role: "claude_primary",
          session_id: "ses_claude_authority",
          artifact_dir: artifactDir,
          stage_result_path: stageResultPath,
          started_at: "2026-04-10T10:05:00+09:00",
          finished_at: "2026-04-10T10:05:00+09:00",
          verify_commands: [],
          verify_bucket: null,
          commit_sha: null,
          pr_role: "frontend",
          subphase: "final_authority_gate",
        },
        design_authority: {
          status: "final_authority_pending",
          ui_risk: "new-screen",
          anchor_screens: ["RECIPE_DETAIL"],
          required_screens: ["RECIPE_DETAIL"],
          authority_required: true,
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: false,
            branch: "feature/fe-03-recipe-like",
            head_sha: headSha,
          },
        },
      },
    });

    const result = superviseWorkItem(
      { rootDir, workItemId: "03-recipe-like", now: "2026-04-10T10:05:00+09:00", maxTransitions: 1 },
      {
        auth: { assertGhAuth() {}, assertOpencodeAuth() {}, assertClaudeAuth() {} },
        worktree: {
          ensureWorktree() { return { path: workspacePath, created: false }; },
          assertClean() {},
          checkoutBranch({ branch }: { branch: string }) { return { branch }; },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() { return headSha; },
          getCurrentBranch() { return "feature/fe-03-recipe-like"; },
          listChangedFiles() { return []; },
          getBinaryDiff() { return ""; },
        },
        stageRunner() { throw new Error("not expected"); },
        github: {
          createPullRequest() { throw new Error("not expected"); },
          editPullRequest() {},
          getRequiredChecks() { return { bucket: "pass", checks: [] }; },
          markReady() {},
          commentPullRequest() {},
          mergePullRequest() { throw new Error("not expected"); },
          getPullRequestSummary() { return { state: "OPEN", mergedAt: null, mergeStateStatus: "CLEAN", reviewDecision: null }; },
          updateBranch() {},
        },
      },
    );

    expect(result.wait).toMatchObject({
      kind: "ci",
      stage: 5,
      pr_role: "frontend",
    });
  });

  it("syncs authority report verdicts to pass when final_authority_gate approves", () => {
    const rootDir = createFixture();
    seedAutonomousPolicy(rootDir, "03-recipe-like", {
      authorityRequired: true,
      uiRisk: "new-screen",
      requiredScreens: ["RECIPE_DETAIL"],
      authorityReportPaths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
      anchorScreens: ["RECIPE_DETAIL"],
    });
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "in-progress",
      designStatus: "pending-review",
      authorityStatus: "required",
      uiRisk: "new-screen",
      visualArtifact: "ui/designs/evidence/06/RECIPE_DETAIL-mobile.png",
    });
    mkdirSync(join(workspacePath, "ui", "designs", "authority"), { recursive: true });
    writeFileSync(
      join(workspacePath, "ui", "designs", "authority", "RECIPE_DETAIL-authority.md"),
      "# Authority\n- verdict: conditional-pass\n",
    );
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "feat: seed conditional pass authority report"], { cwd: workspacePath });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspacePath, encoding: "utf8" }).trim();

    const artifactDir = join(rootDir, ".artifacts", "stage5-final-authority-report-sync");
    const stageResultPath = join(artifactDir, "stage-result.json");
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      stageResultPath,
      JSON.stringify(
        {
          ...buildReviewStageResult({
            decision: "approve",
            stage: 5,
            reviewedChecklistIds: [CHECKLIST_IDS.frontendDelivery, CHECKLIST_IDS.frontendAcceptance],
            bodyMarkdown: "Claude final authority approved.",
          }),
          authority_verdict: "pass",
          reviewed_screen_ids: ["RECIPE_DETAIL"],
          authority_report_paths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
          blocker_count: 0,
          major_count: 1,
          minor_count: 0,
        },
        null,
        2,
      ),
    );

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({ rootDir, workItemId: "03-recipe-like", slice: "03-recipe-like" }).state,
        slice: "03-recipe-like",
        active_stage: 5,
        current_stage: 5,
        workspace: { path: workspacePath, branch_role: "frontend" },
        phase: "review_pending",
        next_action: "run_review",
        last_artifact_dir: artifactDir,
        execution: {
          provider: "claude-cli",
          session_role: "claude_primary",
          session_id: "ses_claude_authority_sync",
          artifact_dir: artifactDir,
          stage_result_path: stageResultPath,
          started_at: "2026-04-10T10:05:00+09:00",
          finished_at: "2026-04-10T10:05:00+09:00",
          verify_commands: [],
          verify_bucket: null,
          commit_sha: null,
          pr_role: "frontend",
          subphase: "final_authority_gate",
        },
        design_authority: {
          status: "final_authority_pending",
          ui_risk: "new-screen",
          anchor_screens: ["RECIPE_DETAIL"],
          required_screens: ["RECIPE_DETAIL"],
          authority_required: true,
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: false,
            branch: "feature/fe-03-recipe-like",
            head_sha: headSha,
          },
        },
      },
    });

    superviseWorkItem(
      { rootDir, workItemId: "03-recipe-like", now: "2026-04-10T10:05:00+09:00", maxTransitions: 1 },
      {
        auth: { assertGhAuth() {}, assertOpencodeAuth() {}, assertClaudeAuth() {} },
        worktree: {
          ensureWorktree() { return { path: workspacePath, created: false }; },
          assertClean() {},
          checkoutBranch({ branch }: { branch: string }) { return { branch }; },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() { return headSha; },
          getCurrentBranch() { return "feature/fe-03-recipe-like"; },
          listChangedFiles() { return []; },
          getBinaryDiff() { return ""; },
        },
        stageRunner() { throw new Error("not expected"); },
        github: {
          createPullRequest() { throw new Error("not expected"); },
          editPullRequest() {},
          getRequiredChecks() { return { bucket: "pass", checks: [] }; },
          markReady() {},
          commentPullRequest() {},
          mergePullRequest() { throw new Error("not expected"); },
          getPullRequestSummary() { return { state: "OPEN", mergedAt: null, mergeStateStatus: "CLEAN", reviewDecision: null }; },
          updateBranch() {},
        },
      },
    );

    const report = readFileSync(
      join(workspacePath, "ui", "designs", "authority", "RECIPE_DETAIL-authority.md"),
      "utf8",
    );
    expect(report).toContain("verdict: pass");
  });

  it("blocks Stage 6 review when authority-required slice has not passed final_authority_gate", () => {
    const rootDir = createFixture();
    seedAutonomousPolicy(rootDir, "03-recipe-like", {
      authorityRequired: true,
      uiRisk: "new-screen",
      requiredScreens: ["RECIPE_DETAIL"],
      authorityReportPaths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
      anchorScreens: ["RECIPE_DETAIL"],
    });
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "in-progress",
      designStatus: "pending-review",
      authorityStatus: "required",
      uiRisk: "new-screen",
      visualArtifact: "ui/designs/evidence/06/RECIPE_DETAIL-mobile.png",
    });
    mkdirSync(join(workspacePath, "ui", "designs", "authority"), { recursive: true });
    writeFileSync(
      join(workspacePath, "ui", "designs", "authority", "RECIPE_DETAIL-authority.md"),
      "# Authority\n- verdict: pass\n",
    );
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "feat: seed missing final authority review"], { cwd: workspacePath });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspacePath, encoding: "utf8" }).trim();

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        active_stage: 6,
        current_stage: 6,
        workspace: {
          path: workspacePath,
          branch_role: "frontend",
        },
        design_authority: {
          status: "final_authority_pending",
          ui_risk: "new-screen",
          anchor_screens: ["RECIPE_DETAIL"],
          required_screens: ["RECIPE_DETAIL"],
          authority_required: true,
          authority_verdict: "pass",
          authority_report_paths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
          reviewed_screen_ids: ["RECIPE_DETAIL"],
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: false,
            branch: "feature/fe-03-recipe-like",
            head_sha: headSha,
          },
        },
      },
    });

    const result = superviseWorkItem(
      { rootDir, workItemId: "03-recipe-like", now: "2026-04-11T13:25:00+09:00", maxTransitions: 2 },
      {
        auth: { assertGhAuth() {}, assertOpencodeAuth() {} },
        worktree: {
          ensureWorktree() { return { path: workspacePath, created: false }; },
          assertClean() {},
          checkoutBranch({ branch }: { branch: string }) { return { branch }; },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() { return headSha; },
          getCurrentBranch() { return "feature/fe-03-recipe-like"; },
          listChangedFiles() { return []; },
          getBinaryDiff() { return ""; },
        },
        stageRunner() { throw new Error("not expected"); },
        github: {
          createPullRequest() { throw new Error("not expected"); },
          editPullRequest() {},
          getRequiredChecks() { return { bucket: "pass", checks: [] }; },
          markReady() {},
          commentPullRequest() {},
          mergePullRequest() { throw new Error("not expected"); },
          getPullRequestSummary() {
            return { state: "OPEN", mergedAt: null, mergeStateStatus: "CLEAN", reviewDecision: null };
          },
          updateBranch() {},
        },
      },
    );

    expect(result.wait).toMatchObject({
      kind: "human_escalation",
    });
    expect(result.runtime?.wait?.reason ?? "").toContain("final_authority_gate");
  });

  it("blocks Stage 6 merge_pending when authority-required slice lacks reviewed final authority", () => {
    const rootDir = createFixture();
    seedAutonomousPolicy(rootDir, "03-recipe-like", {
      authorityRequired: true,
      uiRisk: "new-screen",
      requiredScreens: ["RECIPE_DETAIL"],
      authorityReportPaths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
      anchorScreens: ["RECIPE_DETAIL"],
    });
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    const roadmapPath = join(workspacePath, "docs", "workpacks", "README.md");
    const workpackReadme = join(workspacePath, "docs", "workpacks", "03-recipe-like", "README.md");

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    mkdirSync(join(workspacePath, "docs", "workpacks", "03-recipe-like"), { recursive: true });
    writeFileSync(
      roadmapPath,
      [
        "# Workpack Roadmap v2",
        "",
        "## Slice Order",
        "",
        "| Slice | Status | Goal |",
        "| --- | --- | --- |",
        "| `03-recipe-like` | in-progress | test slice |",
      ].join("\n"),
    );
    writeFileSync(
      workpackReadme,
      buildWorkpackReadme({
        workItemId: "03-recipe-like",
        designStatus: "confirmed",
        authorityStatus: "required",
        backendChecked: true,
        frontendChecked: true,
        uiRisk: "new-screen",
        visualArtifact: "ui/designs/evidence/06/RECIPE_DETAIL-mobile.png",
      }),
    );
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "03-recipe-like", "acceptance.md"),
      buildAcceptance({
        workItemId: "03-recipe-like",
        backendChecked: true,
        frontendChecked: true,
      }),
    );
    mkdirSync(join(workspacePath, "ui", "designs", "authority"), { recursive: true });
    writeFileSync(
      join(workspacePath, "ui", "designs", "authority", "RECIPE_DETAIL-authority.md"),
      "# Authority\n- verdict: pass\n",
    );
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "feat: seed stale merge-pending authority runtime"], { cwd: workspacePath });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: workspacePath,
      encoding: "utf8",
    }).trim();

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        active_stage: 6,
        current_stage: 6,
        last_completed_stage: 5,
        phase: "merge_pending",
        next_action: "poll_ci",
        workspace: {
          path: workspacePath,
          branch_role: "frontend",
        },
        design_authority: {
          status: "final_authority_pending",
          ui_risk: "new-screen",
          anchor_screens: ["RECIPE_DETAIL"],
          required_screens: ["RECIPE_DETAIL"],
          authority_required: true,
          authority_verdict: "pass",
          authority_report_paths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
          reviewed_screen_ids: ["RECIPE_DETAIL"],
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: false,
            branch: "feature/fe-03-recipe-like",
            head_sha: headSha,
          },
          closeout: null,
        },
        wait: {
          kind: "ci",
          pr_role: "frontend",
          stage: 6,
          head_sha: headSha,
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-04-11T13:40:00+09:00",
        maxTransitions: 2,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "feature/fe-03-recipe-like" };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return headSha;
          },
          getCurrentBranch() {
            return "feature/fe-03-recipe-like";
          },
          listChangedFiles() {
            return [];
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner() { throw new Error("not expected"); },
        github: {
          createPullRequest() { throw new Error("not expected"); },
          editPullRequest() {},
          getRequiredChecks() {
            return { bucket: "pass", checks: [] };
          },
          markReady() {},
          commentPullRequest() {},
          mergePullRequest() { throw new Error("not expected"); },
          getPullRequestSummary() {
            return {
              state: "OPEN",
              mergedAt: null,
              mergeStateStatus: "CLEAN",
              reviewDecision: null,
            };
          },
          updateBranch() {},
        },
      },
    );

    expect(result.wait).toMatchObject({
      kind: "human_escalation",
    });
    expect(result.runtime?.wait?.reason ?? "").toContain("design_authority.status=reviewed");
  });

  it("routes Stage 4 directly to Stage 6 when last review came from Stage 6 (not Stage 5)", () => {
    const rootDir = createFixture();
    // No seedAutonomousPolicy: keeps autonomous evaluation loop inactive so finalize proceeds without stageRunner
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    mkdirSync(join(workspacePath, "docs", "workpacks", "03-recipe-like"), { recursive: true });
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "README.md"),
      [
        "# Workpack Roadmap v2",
        "",
        "## Slice Order",
        "",
        "| Slice | Status | Goal |",
        "| --- | --- | --- |",
        "| `03-recipe-like` | in-progress | test slice |",
      ].join("\n"),
    );
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "03-recipe-like", "README.md"),
      buildWorkpackReadme({
        workItemId: "03-recipe-like",
        designStatus: "confirmed",
        backendChecked: true,
        frontendChecked: true,
      }),
    );
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "03-recipe-like", "acceptance.md"),
      buildAcceptance({
        workItemId: "03-recipe-like",
        backendChecked: true,
        frontendChecked: true,
      }),
    );
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "feat: seed stage4 branch"], { cwd: workspacePath });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: workspacePath,
      encoding: "utf8",
    }).trim();

    const artifactDir = join(rootDir, ".artifacts", "stage4-rerun");
    mkdirSync(artifactDir, { recursive: true });
    const stageResultPath = join(artifactDir, "stage-result.json");
    writeFileSync(
      stageResultPath,
      JSON.stringify({
        result: "done",
        summary_markdown: "Fixed CTA state.",
        pr: { title: "feat(fe): fix CTA state", body_markdown: "fixed" },
        commit: { subject: "feat(fe): fix CTA state" },
        checks_run: [],
        next_route: "open_pr",
      }),
    );

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({ rootDir, workItemId: "03-recipe-like", slice: "03-recipe-like" }).state,
        slice: "03-recipe-like",
        current_stage: 4,
        active_stage: 4,
        phase: "stage_result_ready",
        next_action: "finalize_stage",
        last_artifact_dir: artifactDir,
        workspace: { path: workspacePath, branch_role: "frontend" },
        execution: {
          provider: "claude-cli",
          session_role: "claude_primary",
          session_id: "ses_claude_rerun",
          artifact_dir: artifactDir,
          stage_result_path: stageResultPath,
          started_at: "2026-03-27T01:00:00+09:00",
          finished_at: "2026-03-27T01:05:00+09:00",
          verify_commands: [],
          verify_bucket: null,
          commit_sha: null,
          pr_role: "frontend",
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: false,
            branch: "feature/fe-03-recipe-like",
            head_sha: headSha,
          },
        },
        // Stage 6 previously requested changes — source_review_stage=6 signals direct re-route to 6
        last_review: {
          frontend: {
            decision: "request_changes",
            route_back_stage: 4,
            source_review_stage: 6,
            ping_pong_rounds: 1,
            body_markdown: "CTA state needs fixing.",
            findings: [],
            updated_at: "2026-03-27T00:49:00+09:00",
          },
        },
      },
    });

    const result = superviseWorkItem(
      { rootDir, workItemId: "03-recipe-like", now: "2026-03-27T01:10:00+09:00", maxTransitions: 1 },
      {
        auth: { assertGhAuth() {}, assertOpencodeAuth() {} },
        worktree: {
          ensureWorktree() { return { path: workspacePath, created: false }; },
          assertClean() {},
          checkoutBranch() { return { branch: "feature/fe-03-recipe-like" }; },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspacePath, encoding: "utf8" }).trim();
          },
          getCurrentBranch() { return "feature/fe-03-recipe-like"; },
          listChangedFiles() { return []; },
        },
        stageRunner() { throw new Error("not expected in finalize path"); },
        github: {
          createPullRequest() { throw new Error("not expected"); },
          editPullRequest() {},
          getRequiredChecks() { return { bucket: "pass", checks: [] }; },
          markReady() {},
          commentPullRequest() {},
          mergePullRequest() { throw new Error("not expected"); },
          getPullRequestSummary() {
            return { state: "OPEN", mergedAt: null, mergeStateStatus: "CLEAN", reviewDecision: null };
          },
          updateBranch() {},
        },
      },
    );

    // After Stage 4 finalizes, should route to Stage 6 (not Stage 5) because source_review_stage=6
    expect(result.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 6,
      pr_role: "frontend",
    });
  });

  it("routes authority-required Stage 4 reruns back through authority_precheck even after Stage 6 feedback", () => {
    const rootDir = createFixture();
    seedAutonomousPolicy(rootDir, "03-recipe-like", {
      authorityRequired: true,
      uiRisk: "new-screen",
      requiredScreens: ["RECIPE_DETAIL"],
      authorityReportPaths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
      anchorScreens: ["RECIPE_DETAIL"],
    });
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    let observedSubphase: string | null = null;

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    mkdirSync(join(workspacePath, "docs", "workpacks", "03-recipe-like"), { recursive: true });
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "README.md"),
      [
        "# Workpack Roadmap v2",
        "",
        "## Slice Order",
        "",
        "| Slice | Status | Goal |",
        "| --- | --- | --- |",
        "| `03-recipe-like` | in-progress | test slice |",
      ].join("\n"),
    );
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "03-recipe-like", "README.md"),
      buildWorkpackReadme({
        workItemId: "03-recipe-like",
        designStatus: "confirmed",
        authorityStatus: "reviewed",
        backendChecked: true,
        frontendChecked: true,
        uiRisk: "new-screen",
        visualArtifact: "ui/designs/evidence/06/RECIPE_DETAIL-mobile.png",
      }),
    );
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "03-recipe-like", "acceptance.md"),
      buildAcceptance({
        workItemId: "03-recipe-like",
        backendChecked: true,
        frontendChecked: true,
      }),
    );
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "feat: seed authority rerun"], { cwd: workspacePath });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: workspacePath,
      encoding: "utf8",
    }).trim();

    const artifactDir = join(rootDir, ".artifacts", "stage4-authority-rerun");
    mkdirSync(artifactDir, { recursive: true });
    const stageResultPath = join(artifactDir, "stage-result.json");
    writeFileSync(
      stageResultPath,
      JSON.stringify({
        result: "done",
        summary_markdown: "Fixed authority feedback.",
        pr: { title: "feat(fe): fix authority feedback", body_markdown: "fixed" },
        commit: { subject: "feat(fe): fix authority feedback" },
        checks_run: [],
        next_route: "open_pr",
        claimed_scope: {
          files: ["components/recipe-detail.tsx"],
          endpoints: [],
          routes: ["/recipe/[id]"],
          states: ["ready"],
          invariants: [],
        },
        changed_files: ["components/recipe-detail.tsx"],
        tests_touched: ["tests/recipe-detail-screen.test.tsx"],
        artifacts_written: [],
        checklist_updates: [
          {
            id: CHECKLIST_IDS.frontendDelivery,
            status: "checked",
            evidence_refs: ["pnpm verify:frontend"],
          },
          {
            id: CHECKLIST_IDS.frontendAcceptance,
            status: "checked",
            evidence_refs: ["pnpm test"],
          },
        ],
        contested_fix_ids: [],
        rebuttals: [],
      }),
    );

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({ rootDir, workItemId: "03-recipe-like", slice: "03-recipe-like" }).state,
        slice: "03-recipe-like",
        current_stage: 4,
        active_stage: 4,
        phase: "stage_result_ready",
        next_action: "finalize_stage",
        last_artifact_dir: artifactDir,
        workspace: { path: workspacePath, branch_role: "frontend" },
        execution: {
          provider: "claude-cli",
          session_role: "claude_primary",
          session_id: "ses_claude_rerun_authority",
          artifact_dir: artifactDir,
          stage_result_path: stageResultPath,
          started_at: "2026-03-27T01:00:00+09:00",
          finished_at: "2026-03-27T01:05:00+09:00",
          verify_commands: [],
          verify_bucket: null,
          commit_sha: null,
          pr_role: "frontend",
        },
        design_authority: {
          status: "reviewed",
          ui_risk: "new-screen",
          anchor_screens: ["RECIPE_DETAIL"],
          required_screens: ["RECIPE_DETAIL"],
          authority_required: true,
          authority_verdict: "pass",
          authority_report_paths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
          reviewed_screen_ids: ["RECIPE_DETAIL"],
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: false,
            branch: "feature/fe-03-recipe-like",
            head_sha: headSha,
          },
        },
        last_review: {
          frontend: {
            decision: "request_changes",
            route_back_stage: 4,
            source_review_stage: 6,
            ping_pong_rounds: 1,
            body_markdown: "Authority-required UI feedback needs a rerun.",
            findings: [],
            updated_at: "2026-03-27T00:49:00+09:00",
          },
        },
      },
    });
    seedQaArtifactBundle(rootDir, "03-recipe-like", "2026-04-15-stage4-review-fix");

    const first = superviseWorkItem(
      { rootDir, workItemId: "03-recipe-like", now: "2026-03-27T01:10:00+09:00", maxTransitions: 1 },
      {
        auth: { assertGhAuth() {}, assertOpencodeAuth() {} },
        worktree: {
          ensureWorktree() { return { path: workspacePath, created: false }; },
          assertClean() {},
          checkoutBranch() { return { branch: "feature/fe-03-recipe-like" }; },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspacePath, encoding: "utf8" }).trim();
          },
          getCurrentBranch() { return "feature/fe-03-recipe-like"; },
          listChangedFiles() { return []; },
        },
        stageRunner() { throw new Error("not expected in finalize path"); },
        github: {
          createPullRequest() { throw new Error("not expected"); },
          editPullRequest() {},
          getRequiredChecks() { return { bucket: "pass", checks: [] }; },
          markReady() {},
          commentPullRequest() {},
          mergePullRequest() { throw new Error("not expected"); },
          getPullRequestSummary() {
            return { state: "OPEN", mergedAt: null, mergeStateStatus: "CLEAN", reviewDecision: null };
          },
          updateBranch() {},
        },
      },
    );

    expect(first.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 4,
      pr_role: "frontend",
    });

    superviseWorkItem(
      { rootDir, workItemId: "03-recipe-like", now: "2026-03-27T01:12:00+09:00", maxTransitions: 1 },
      {
        auth: { assertGhAuth() {}, assertOpencodeAuth() {} },
        worktree: {
          ensureWorktree() { return { path: workspacePath, created: false }; },
          assertClean() {},
          checkoutBranch({ branch }: { branch: string }) { return { branch }; },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspacePath, encoding: "utf8" }).trim();
          },
          getCurrentBranch() { return "feature/fe-03-recipe-like"; },
          listChangedFiles() { return []; },
          getBinaryDiff() { return ""; },
        },
        stageRunner({ subphase }: { subphase?: string | null }) {
          observedSubphase = subphase ?? null;
          mkdirSync(join(workspacePath, "ui", "designs", "authority"), { recursive: true });
          mkdirSync(join(workspacePath, "ui", "designs", "evidence", "06"), { recursive: true });
          writeFileSync(join(workspacePath, "ui", "designs", "authority", "RECIPE_DETAIL-authority.md"), "# Authority\n- verdict: conditional-pass\n");
          writeFileSync(join(workspacePath, "ui", "designs", "evidence", "06", "RECIPE_DETAIL-mobile.png"), "evidence\n");
          writeFileSync(join(workspacePath, "ui", "designs", "evidence", "06", "RECIPE_DETAIL-mobile-narrow.png"), "evidence\n");
          writeFileSync(join(workspacePath, "ui", "designs", "evidence", "06", "RECIPE_DETAIL-mobile-narrow.png"), "evidence\n");
          return {
            artifactDir: join(rootDir, ".artifacts", "authority-rerun-precheck"),
            dispatch: { actor: "codex", stage: 4, subphase: "authority_precheck", sessionBinding: { role: "codex_primary" } },
            execution: { mode: "execute", executed: true, sessionId: "ses_codex_authority_rerun" },
            stageResult: buildAuthorityPrecheckStageResult({
              verdict: "conditional-pass",
              blockerCount: 0,
              majorCount: 1,
              minorCount: 0,
            }),
          };
        },
        github: {
          createPullRequest() { throw new Error("not expected"); },
          editPullRequest() {},
          getRequiredChecks() { return { bucket: "pass", checks: [] }; },
          markReady() {},
          commentPullRequest() {},
          mergePullRequest() { throw new Error("not expected"); },
          getPullRequestSummary() {
            return { state: "OPEN", mergedAt: null, mergeStateStatus: "CLEAN", reviewDecision: null };
          },
          updateBranch() {},
        },
      },
    );

    expect(observedSubphase).toBe("authority_precheck");
  });

  it("routes authority-required Stage 4 through authority_precheck before Stage 5", () => {
    const rootDir = createFixture();
    seedAutonomousPolicy(rootDir, "03-recipe-like", {
      authorityRequired: true,
      uiRisk: "new-screen",
      requiredScreens: ["RECIPE_DETAIL"],
      authorityReportPaths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
      anchorScreens: ["RECIPE_DETAIL"],
    });
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    let observedSubphase: string | null = null;
    let observedPriorStageResultPath: string | null = null;
    const priorArtifactDir = join(rootDir, ".artifacts", "prior-stage4-implementation");
    const priorStageResultPath = join(priorArtifactDir, "stage-result.json");

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "in-progress",
      designStatus: "pending-review",
      authorityStatus: "required",
      uiRisk: "new-screen",
      visualArtifact: "figma://recipe-detail",
    });
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "feat: seed authority precheck"], { cwd: workspacePath });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: workspacePath,
      encoding: "utf8",
    }).trim();
    mkdirSync(priorArtifactDir, { recursive: true });
    writeFileSync(
      priorStageResultPath,
      `${JSON.stringify(
        buildCodeStageResult({
          summary: "frontend implementation complete",
          subject: "feat: frontend implementation",
          title: "feat: frontend implementation",
          checklistUpdates: [CHECKLIST_IDS.frontendDelivery, CHECKLIST_IDS.frontendAcceptance],
          changedFiles: ["app/example/page.tsx"],
        }),
        null,
        2,
      )}\n`,
    );

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({ rootDir, workItemId: "03-recipe-like", slice: "03-recipe-like" }).state,
        slice: "03-recipe-like",
        current_stage: 4,
        last_completed_stage: 4,
        workspace: {
          path: workspacePath,
          branch_role: "frontend",
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: true,
            branch: "feature/fe-03-recipe-like",
            head_sha: headSha,
          },
        },
        wait: {
          kind: "ci",
          pr_role: "frontend",
          stage: 4,
          head_sha: headSha,
        },
        last_artifact_dir: priorArtifactDir,
      },
    });

    const result = superviseWorkItem(
      { rootDir, workItemId: "03-recipe-like", now: "2026-04-09T23:10:00+09:00", maxTransitions: 1 },
      {
        auth: { assertGhAuth() {}, assertOpencodeAuth() {} },
        worktree: {
          ensureWorktree() { return { path: workspacePath, created: false }; },
          assertClean() {},
          checkoutBranch({ branch }: { branch: string }) { return { branch }; },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspacePath, encoding: "utf8" }).trim();
          },
          getCurrentBranch() { return "feature/fe-03-recipe-like"; },
          listChangedFiles() {
            return execFileSync("git", ["diff", "--name-only"], { cwd: workspacePath, encoding: "utf8" })
              .trim()
              .split("\n")
              .filter(Boolean);
          },
          getBinaryDiff() { return ""; },
        },
        stageRunner({ subphase, priorStageResultPath }: { subphase?: string | null; priorStageResultPath?: string | null }) {
          observedSubphase = subphase ?? null;
          observedPriorStageResultPath = priorStageResultPath ?? null;
          mkdirSync(join(workspacePath, "ui", "designs", "authority"), { recursive: true });
          mkdirSync(join(workspacePath, "ui", "designs", "evidence", "06"), { recursive: true });
          writeFileSync(join(workspacePath, "ui", "designs", "authority", "RECIPE_DETAIL-authority.md"), "# Authority\n- verdict: conditional-pass\n");
          writeFileSync(join(workspacePath, "ui", "designs", "evidence", "06", "RECIPE_DETAIL-mobile.png"), "evidence\n");
          writeFileSync(join(workspacePath, "ui", "designs", "evidence", "06", "RECIPE_DETAIL-mobile-narrow.png"), "evidence\n");
          return {
            artifactDir: join(rootDir, ".artifacts", "authority-precheck"),
            dispatch: { actor: "codex", stage: 4, subphase: "authority_precheck", sessionBinding: { role: "codex_primary" } },
            execution: { mode: "execute", executed: true, sessionId: "ses_codex_authority" },
            stageResult: buildAuthorityPrecheckStageResult({
              verdict: "conditional-pass",
              blockerCount: 0,
              majorCount: 1,
              minorCount: 0,
            }),
          };
        },
        github: {
          createPullRequest() { throw new Error("not expected"); },
          editPullRequest() {},
          getRequiredChecks() { return { bucket: "pass", checks: [] }; },
          markReady() {},
          commentPullRequest() {},
          mergePullRequest() { throw new Error("not expected"); },
          getPullRequestSummary() {
            return { state: "OPEN", mergedAt: null, mergeStateStatus: "CLEAN", reviewDecision: null };
          },
          updateBranch() {},
        },
      },
    );

    expect(observedSubphase).toBe("authority_precheck");
    expect(observedPriorStageResultPath).toBe(priorStageResultPath);
    expect(result.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 5,
      pr_role: "frontend",
    });
    expect(
      readRuntimeState({ rootDir, workItemId: "03-recipe-like", slice: "03-recipe-like" }).state.design_authority,
    ).toMatchObject({
      status: "prechecked",
      authority_verdict: "conditional-pass",
    });
    expect(readTrackedStatusItem(rootDir, "03-recipe-like")).toMatchObject({
      approval_state: "claude_approved",
    });
  });

  it("inherits the prior Stage 4 checklist snapshot when authority_precheck returns delta-only checklist updates", () => {
    const rootDir = createFixture();
    seedAutonomousPolicy(rootDir, "03-recipe-like", {
      authorityRequired: true,
      uiRisk: "new-screen",
      requiredScreens: ["RECIPE_DETAIL"],
      authorityReportPaths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
      anchorScreens: ["RECIPE_DETAIL"],
    });
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    const priorArtifactDir = join(rootDir, ".artifacts", "prior-stage4-implementation-delta");
    const priorStageResultPath = join(priorArtifactDir, "stage-result.json");

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "in-progress",
      designStatus: "pending-review",
      authorityStatus: "required",
      uiRisk: "new-screen",
      visualArtifact: "figma://recipe-detail",
    });
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "feat: seed authority precheck delta"], { cwd: workspacePath });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: workspacePath,
      encoding: "utf8",
    }).trim();
    mkdirSync(priorArtifactDir, { recursive: true });
    writeFileSync(
      priorStageResultPath,
      `${JSON.stringify(
        buildCodeStageResult({
          summary: "frontend implementation complete",
          subject: "feat: frontend implementation",
          title: "feat: frontend implementation",
          checklistUpdates: [CHECKLIST_IDS.frontendDelivery, CHECKLIST_IDS.frontendAcceptance],
          changedFiles: ["app/example/page.tsx"],
        }),
        null,
        2,
      )}\n`,
    );

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({ rootDir, workItemId: "03-recipe-like", slice: "03-recipe-like" }).state,
        slice: "03-recipe-like",
        current_stage: 4,
        last_completed_stage: 4,
        workspace: {
          path: workspacePath,
          branch_role: "frontend",
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: true,
            branch: "feature/fe-03-recipe-like",
            head_sha: headSha,
          },
        },
        wait: {
          kind: "ci",
          pr_role: "frontend",
          stage: 4,
          head_sha: headSha,
        },
        last_artifact_dir: priorArtifactDir,
      },
    });

    const result = superviseWorkItem(
      { rootDir, workItemId: "03-recipe-like", now: "2026-04-09T23:20:00+09:00", maxTransitions: 1 },
      {
        auth: { assertGhAuth() {}, assertOpencodeAuth() {} },
        worktree: {
          ensureWorktree() { return { path: workspacePath, created: false }; },
          assertClean() {},
          checkoutBranch({ branch }: { branch: string }) { return { branch }; },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspacePath, encoding: "utf8" }).trim();
          },
          getCurrentBranch() { return "feature/fe-03-recipe-like"; },
          listChangedFiles() { return []; },
          getBinaryDiff() { return ""; },
        },
        stageRunner() {
          mkdirSync(join(workspacePath, "ui", "designs", "authority"), { recursive: true });
          mkdirSync(join(workspacePath, "ui", "designs", "evidence", "06"), { recursive: true });
          writeFileSync(join(workspacePath, "ui", "designs", "authority", "RECIPE_DETAIL-authority.md"), "# Authority\n- verdict: pass\n");
          writeFileSync(join(workspacePath, "ui", "designs", "evidence", "06", "RECIPE_DETAIL-mobile.png"), "evidence\n");
          return {
            artifactDir: join(rootDir, ".artifacts", "authority-precheck-delta"),
            dispatch: { actor: "codex", stage: 4, subphase: "authority_precheck", sessionBinding: { role: "codex_primary" } },
            execution: { mode: "execute", executed: true, sessionId: "ses_codex_authority_delta" },
            stageResult: {
              ...buildAuthorityPrecheckStageResult({
                verdict: "pass",
                blockerCount: 0,
                majorCount: 0,
                minorCount: 0,
              }),
              checklist_updates: [],
            },
          };
        },
        github: {
          createPullRequest() { throw new Error("not expected"); },
          editPullRequest() {},
          getRequiredChecks() { return { bucket: "pass", checks: [] }; },
          markReady() {},
          commentPullRequest() {},
          mergePullRequest() { throw new Error("not expected"); },
          getPullRequestSummary() {
            return { state: "OPEN", mergedAt: null, mergeStateStatus: "CLEAN", reviewDecision: null };
          },
          updateBranch() {},
        },
      },
    );

    expect(result.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 5,
      pr_role: "frontend",
    });
  });

  it("routes Stage 4 review-fix completions back through authority_precheck before another Stage 5", () => {
    const rootDir = createFixture();
    seedAutonomousPolicy(rootDir, "03-recipe-like", {
      authorityRequired: true,
      uiRisk: "new-screen",
      requiredScreens: ["RECIPE_DETAIL"],
      authorityReportPaths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
      anchorScreens: ["RECIPE_DETAIL"],
    });
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    let observedSubphase: string | null = null;

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "in-progress",
      designStatus: "pending-review",
      authorityStatus: "required",
      uiRisk: "new-screen",
      visualArtifact: "figma://recipe-detail",
    });
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "feat: seed stage4 review-fix rerun"], { cwd: workspacePath });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: workspacePath,
      encoding: "utf8",
    }).trim();

    const artifactDir = join(rootDir, ".artifacts", "stage4-review-fix-rerun");
    const stageResultPath = join(artifactDir, "stage-result.json");
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      stageResultPath,
      JSON.stringify(
        {
          result: "done",
          summary_markdown: "Fixed Stage 5 feedback.",
          pr: { title: "feat(fe): fix Stage 5 feedback", body_markdown: "fixed" },
          commit: { subject: "feat(fe): fix Stage 5 feedback" },
          checks_run: [],
          next_route: "open_pr",
          claimed_scope: {
            files: ["components/recipe-detail.tsx"],
            endpoints: [],
            routes: ["/recipe/[id]"],
            states: ["ready"],
            invariants: [],
          },
          changed_files: ["components/recipe-detail.tsx"],
          tests_touched: ["tests/recipe-detail-screen.test.tsx"],
          artifacts_written: [],
          checklist_updates: [
            {
              id: CHECKLIST_IDS.frontendDelivery,
              status: "checked",
              evidence_refs: ["pnpm verify:frontend"],
            },
            {
              id: CHECKLIST_IDS.frontendAcceptance,
              status: "checked",
              evidence_refs: ["pnpm test"],
            },
          ],
          contested_fix_ids: [],
          rebuttals: [],
        },
        null,
        2,
      ),
    );

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({ rootDir, workItemId: "03-recipe-like", slice: "03-recipe-like" }).state,
        slice: "03-recipe-like",
        current_stage: 4,
        active_stage: 4,
        phase: "stage_result_ready",
        next_action: "finalize_stage",
        last_artifact_dir: artifactDir,
        workspace: { path: workspacePath, branch_role: "frontend" },
        execution: {
          provider: "claude-cli",
          session_role: "claude_primary",
          session_id: "ses_claude_stage4_review_fix",
          artifact_dir: artifactDir,
          stage_result_path: stageResultPath,
          started_at: "2026-04-15T09:00:00+09:00",
          finished_at: "2026-04-15T09:01:00+09:00",
          verify_commands: [],
          verify_bucket: null,
          commit_sha: null,
          pr_role: "frontend",
        },
        design_authority: {
          status: "needs_revision",
          ui_risk: "new-screen",
          anchor_screens: ["RECIPE_DETAIL"],
          required_screens: ["RECIPE_DETAIL"],
          authority_required: true,
          authority_verdict: "conditional-pass",
          authority_report_paths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
          reviewed_screen_ids: ["RECIPE_DETAIL"],
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: false,
            branch: "feature/fe-03-recipe-like",
            head_sha: headSha,
          },
        },
        last_review: {
          frontend: {
            decision: "request_changes",
            route_back_stage: 4,
            source_review_stage: 5,
            ping_pong_rounds: 1,
            body_markdown: "Need a frontend fix round before authority precheck.",
            findings: [],
            updated_at: "2026-04-15T08:59:00+09:00",
          },
        },
      },
    });
    seedQaArtifactBundle(rootDir, "03-recipe-like", "2026-04-15-stage4-review-fix-rerun");

    const first = superviseWorkItem(
      { rootDir, workItemId: "03-recipe-like", now: "2026-04-15T09:02:00+09:00", maxTransitions: 1 },
      {
        auth: { assertGhAuth() {}, assertOpencodeAuth() {} },
        worktree: {
          ensureWorktree() { return { path: workspacePath, created: false }; },
          assertClean() {
            const status = execFileSync("git", ["status", "--porcelain"], {
              cwd: workspacePath,
              encoding: "utf8",
            }).trim();
            if (status.length > 0) {
              throw new Error("Worktree is dirty.");
            }
          },
          checkoutBranch() { return { branch: "feature/fe-03-recipe-like" }; },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspacePath, encoding: "utf8" }).trim();
          },
          getCurrentBranch() { return "feature/fe-03-recipe-like"; },
          listChangedFiles() {
            return execFileSync("git", ["diff", "--name-only"], { cwd: workspacePath, encoding: "utf8" })
              .trim()
              .split("\n")
              .filter(Boolean);
          },
          getBinaryDiff() { return ""; },
        },
        stageRunner() { throw new Error("not expected"); },
        github: {
          createPullRequest() { throw new Error("not expected"); },
          editPullRequest() {},
          getRequiredChecks() { return { bucket: "pass", checks: [] }; },
          markReady() {},
          commentPullRequest() {},
          mergePullRequest() { throw new Error("not expected"); },
          getPullRequestSummary() {
            return { state: "OPEN", mergedAt: null, mergeStateStatus: "CLEAN", reviewDecision: null };
          },
          updateBranch() {},
        },
      },
    );

    expect(first.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 4,
      pr_role: "frontend",
    });
    expect(
      readRuntimeState({ rootDir, workItemId: "03-recipe-like", slice: "03-recipe-like" }).state.design_authority,
    ).toMatchObject({
      status: "pending_precheck",
    });

    const second = superviseWorkItem(
      { rootDir, workItemId: "03-recipe-like", now: "2026-04-15T09:03:00+09:00", maxTransitions: 1 },
      {
        auth: { assertGhAuth() {}, assertOpencodeAuth() {} },
        worktree: {
          ensureWorktree() { return { path: workspacePath, created: false }; },
          assertClean() {},
          checkoutBranch() { return { branch: "feature/fe-03-recipe-like" }; },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspacePath, encoding: "utf8" }).trim();
          },
          getCurrentBranch() { return "feature/fe-03-recipe-like"; },
          listChangedFiles() { return []; },
          getBinaryDiff() { return ""; },
        },
        stageRunner({ subphase }: { subphase?: string | null }) {
          observedSubphase = subphase ?? null;
          const authorityChangedFiles = [
            ".workflow-v2/status.json",
            ".workflow-v2/work-items/03-recipe-like.json",
            "docs/workpacks/03-recipe-like/README.md",
            "docs/workpacks/03-recipe-like/acceptance.md",
            "ui/designs/authority/RECIPE_DETAIL-authority.md",
            "ui/designs/evidence/06/RECIPE_DETAIL-mobile.png",
            "ui/designs/evidence/06/RECIPE_DETAIL-mobile-narrow.png",
          ];
          mkdirSync(join(workspacePath, "ui", "designs", "authority"), { recursive: true });
          mkdirSync(join(workspacePath, "ui", "designs", "evidence", "06"), { recursive: true });
          writeFileSync(
            join(workspacePath, "docs", "workpacks", "03-recipe-like", "README.md"),
            buildWorkpackReadme({
              workItemId: "03-recipe-like",
              designStatus: "pending-review",
              backendChecked: false,
              frontendChecked: true,
              authorityStatus: "required",
              uiRisk: "new-screen",
              visualArtifact: "figma://recipe-detail",
            }),
          );
          writeFileSync(
            join(workspacePath, "docs", "workpacks", "03-recipe-like", "acceptance.md"),
            buildAcceptance({
              workItemId: "03-recipe-like",
              backendChecked: false,
              frontendChecked: true,
            }),
          );
          writeFileSync(join(workspacePath, "ui", "designs", "authority", "RECIPE_DETAIL-authority.md"), "# Authority\n- verdict: conditional-pass\n");
          writeFileSync(join(workspacePath, "ui", "designs", "evidence", "06", "RECIPE_DETAIL-mobile.png"), "evidence\n");
          writeFileSync(join(workspacePath, "ui", "designs", "evidence", "06", "RECIPE_DETAIL-mobile-narrow.png"), "evidence\n");
          return {
            artifactDir: join(rootDir, ".artifacts", "stage4-review-fix-authority-precheck"),
            dispatch: { actor: "codex", stage: 4, subphase: "authority_precheck", sessionBinding: { role: "codex_primary" } },
            execution: { mode: "execute", executed: true, sessionId: "ses_codex_authority_after_fix" },
            stageResult: {
              ...buildAuthorityPrecheckStageResult({
                verdict: "conditional-pass",
                blockerCount: 0,
                majorCount: 1,
                minorCount: 0,
              }),
              claimed_scope: {
                files: authorityChangedFiles,
                endpoints: [],
                routes: ["/example"],
                states: ["loading"],
                invariants: [],
              },
              changed_files: authorityChangedFiles,
            },
          };
        },
        github: {
          createPullRequest() { throw new Error("not expected"); },
          editPullRequest() {},
          getRequiredChecks() { return { bucket: "pass", checks: [] }; },
          markReady() {},
          commentPullRequest() {},
          mergePullRequest() { throw new Error("not expected"); },
          getPullRequestSummary() {
            return { state: "OPEN", mergedAt: null, mergeStateStatus: "CLEAN", reviewDecision: null };
          },
          updateBranch() {},
        },
      },
    );

    expect(observedSubphase).toBe("authority_precheck");
    expect(second.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 5,
      pr_role: "frontend",
    });
  });

  it("uses the worktree automation-spec during Stage 4 authority precheck even when the root copy is malformed", () => {
    const rootDir = createFixture();
    seedAutonomousPolicy(rootDir, "03-recipe-like", {
      authorityRequired: true,
      uiRisk: "new-screen",
      requiredScreens: ["RECIPE_DETAIL"],
      authorityReportPaths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
      anchorScreens: ["RECIPE_DETAIL"],
    });
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    let observedSubphase: string | null = null;

    writeFileSync(
      join(rootDir, "docs", "workpacks", "03-recipe-like", "automation-spec.json"),
      JSON.stringify(
        {
          slice_id: "03-recipe-like",
          execution_mode: "autonomous",
          risk_class: "medium",
          merge_policy: "conditional-auto",
          backend: {
            required_endpoints: [],
            invariants: [],
            verify_commands: [],
            required_test_targets: [],
          },
          frontend: {
            required_routes: [],
            required_states: [],
            playwright_projects: [],
            artifact_assertions: [],
            design_authority: {
              ui_risk: "new-screen",
              anchor_screens: ["RECIPE_DETAIL"],
              required_screens: ["RECIPE_DETAIL"],
              generator_required: true,
              critic_required: true,
              authority_required: true,
              stage4_evidence_requirements: ["mobile-default", "mobile-narrow"],
              authority_report_paths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
            },
          },
          external_smokes: [
            {
              id: "invalid-object",
            },
          ],
          blocked_conditions: [],
          max_fix_rounds: {
            backend: 2,
            frontend: 2,
          },
        },
        null,
        2,
      ),
    );

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "in-progress",
      designStatus: "pending-review",
      authorityStatus: "required",
      uiRisk: "new-screen",
      visualArtifact: "figma://recipe-detail",
    });
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "feat: seed authority precheck malformed root"], { cwd: workspacePath });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: workspacePath,
      encoding: "utf8",
    }).trim();

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({ rootDir, workItemId: "03-recipe-like", slice: "03-recipe-like" }).state,
        slice: "03-recipe-like",
        current_stage: 4,
        last_completed_stage: 4,
        workspace: {
          path: workspacePath,
          branch_role: "frontend",
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: true,
            branch: "feature/fe-03-recipe-like",
            head_sha: headSha,
          },
        },
        wait: {
          kind: "ci",
          pr_role: "frontend",
          stage: 4,
          head_sha: headSha,
        },
      },
    });

    const result = superviseWorkItem(
      { rootDir, workItemId: "03-recipe-like", now: "2026-04-09T23:10:00+09:00", maxTransitions: 1 },
      {
        auth: { assertGhAuth() {}, assertOpencodeAuth() {} },
        worktree: {
          ensureWorktree() { return { path: workspacePath, created: false }; },
          assertClean() {},
          checkoutBranch({ branch }: { branch: string }) { return { branch }; },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspacePath, encoding: "utf8" }).trim();
          },
          getCurrentBranch() { return "feature/fe-03-recipe-like"; },
          listChangedFiles() {
            return execFileSync("git", ["diff", "--name-only"], { cwd: workspacePath, encoding: "utf8" })
              .trim()
              .split("\n")
              .filter(Boolean);
          },
          getBinaryDiff() { return ""; },
        },
        stageRunner({ subphase }: { subphase?: string | null }) {
          observedSubphase = subphase ?? null;
          mkdirSync(join(workspacePath, "ui", "designs", "authority"), { recursive: true });
          mkdirSync(join(workspacePath, "ui", "designs", "evidence", "06"), { recursive: true });
          writeFileSync(join(workspacePath, "ui", "designs", "authority", "RECIPE_DETAIL-authority.md"), "# Authority\n- verdict: conditional-pass\n");
          writeFileSync(join(workspacePath, "ui", "designs", "evidence", "06", "RECIPE_DETAIL-mobile.png"), "evidence\n");
          writeFileSync(join(workspacePath, "ui", "designs", "evidence", "06", "RECIPE_DETAIL-mobile-narrow.png"), "evidence\n");
          return {
            artifactDir: join(rootDir, ".artifacts", "authority-precheck-malformed-root"),
            dispatch: { actor: "codex", stage: 4, subphase: "authority_precheck", sessionBinding: { role: "codex_primary" } },
            execution: { mode: "execute", executed: true, sessionId: "ses_codex_authority" },
            stageResult: buildAuthorityPrecheckStageResult({
              verdict: "conditional-pass",
              blockerCount: 0,
              majorCount: 1,
              minorCount: 0,
            }),
          };
        },
        github: {
          createPullRequest() { throw new Error("not expected"); },
          editPullRequest() {},
          getRequiredChecks() { return { bucket: "pass", checks: [] }; },
          markReady() {},
          commentPullRequest() {},
          mergePullRequest() { throw new Error("not expected"); },
          getPullRequestSummary() {
            return { state: "OPEN", mergedAt: null, mergeStateStatus: "CLEAN", reviewDecision: null };
          },
          updateBranch() {},
        },
      },
    );

    expect(observedSubphase).toBe("authority_precheck");
    expect(result.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 5,
      pr_role: "frontend",
    });
  });

  it("routes authority_precheck hold results back to Stage 4", () => {
    const rootDir = createFixture();
    seedAutonomousPolicy(rootDir, "03-recipe-like", {
      authorityRequired: true,
      uiRisk: "new-screen",
      requiredScreens: ["RECIPE_DETAIL"],
      authorityReportPaths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
      anchorScreens: ["RECIPE_DETAIL"],
    });
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    const artifactDir = join(rootDir, ".artifacts", "authority-precheck-hold");
    const stageResultPath = join(artifactDir, "stage-result.json");

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "in-progress",
      designStatus: "pending-review",
      authorityStatus: "required",
      uiRisk: "new-screen",
      visualArtifact: "figma://recipe-detail",
    });
    mkdirSync(join(workspacePath, "ui", "designs", "authority"), { recursive: true });
    mkdirSync(join(workspacePath, "ui", "designs", "evidence", "06"), { recursive: true });
    writeFileSync(join(workspacePath, "ui", "designs", "authority", "RECIPE_DETAIL-authority.md"), "# Authority\n- verdict: hold\n");
    writeFileSync(join(workspacePath, "ui", "designs", "evidence", "06", "RECIPE_DETAIL-mobile.png"), "evidence\n");
    writeFileSync(join(workspacePath, "ui", "designs", "evidence", "06", "RECIPE_DETAIL-mobile-narrow.png"), "evidence\n");
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "feat: seed authority hold"], { cwd: workspacePath });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspacePath, encoding: "utf8" }).trim();

    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      stageResultPath,
      `${JSON.stringify(buildAuthorityPrecheckStageResult({
        verdict: "hold",
        blockerCount: 1,
        majorCount: 0,
        minorCount: 0,
      }), null, 2)}\n`,
    );

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({ rootDir, workItemId: "03-recipe-like", slice: "03-recipe-like" }).state,
        slice: "03-recipe-like",
        active_stage: 4,
        current_stage: 4,
        workspace: { path: workspacePath, branch_role: "frontend" },
        phase: "stage_result_ready",
        next_action: "finalize_stage",
        last_artifact_dir: artifactDir,
        execution: {
          provider: "opencode",
          session_role: "codex_primary",
          session_id: "ses_codex_authority",
          artifact_dir: artifactDir,
          stage_result_path: stageResultPath,
          started_at: "2026-04-09T23:12:00+09:00",
          finished_at: "2026-04-09T23:12:00+09:00",
          verify_commands: [],
          verify_bucket: null,
          commit_sha: headSha,
          pr_role: "frontend",
          subphase: "authority_precheck",
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: true,
            branch: "feature/fe-03-recipe-like",
            head_sha: headSha,
          },
        },
      },
    });

    const result = superviseWorkItem(
      { rootDir, workItemId: "03-recipe-like", now: "2026-04-09T23:12:00+09:00", maxTransitions: 1 },
      {
        auth: { assertGhAuth() {}, assertOpencodeAuth() {} },
        worktree: {
          ensureWorktree() { return { path: workspacePath, created: false }; },
          assertClean() {},
          checkoutBranch({ branch }: { branch: string }) { return { branch }; },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() { return headSha; },
          getCurrentBranch() { return "feature/fe-03-recipe-like"; },
          listChangedFiles() { return []; },
          getBinaryDiff() { return ""; },
        },
        stageRunner() { throw new Error("not expected"); },
        github: {
          createPullRequest() { throw new Error("not expected"); },
          editPullRequest() {},
          getRequiredChecks() { return { bucket: "pass", checks: [] }; },
          markReady() {},
          commentPullRequest() {},
          mergePullRequest() { throw new Error("not expected"); },
          getPullRequestSummary() { return { state: "OPEN", mergedAt: null, mergeStateStatus: "CLEAN", reviewDecision: null }; },
          updateBranch() {},
        },
      },
    );

    expect(result.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 4,
      pr_role: "frontend",
    });
  });

  it("requires manual merge handoff for anchor-extension slices after final review approval", () => {
    const rootDir = createFixture();
    seedAutonomousPolicy(rootDir, "03-recipe-like", {
      authorityRequired: true,
      uiRisk: "anchor-extension",
      requiredScreens: ["RECIPE_DETAIL"],
      authorityReportPaths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
      anchorScreens: ["RECIPE_DETAIL", "PLANNER_WEEK"],
    });
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    const artifactDir = join(rootDir, ".artifacts", "stage6-manual-handoff");
    const stageResultPath = join(artifactDir, "stage-result.json");

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "in-progress",
      designStatus: "confirmed",
      authorityStatus: "reviewed",
      uiRisk: "anchor-extension",
      visualArtifact: "ui/designs/evidence/06/RECIPE_DETAIL-mobile.png",
    });
    mkdirSync(join(workspacePath, "ui", "designs", "authority"), { recursive: true });
    writeFileSync(join(workspacePath, "ui", "designs", "authority", "RECIPE_DETAIL-authority.md"), "# Authority\n- verdict: pass\n");
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "feat: seed manual handoff"], { cwd: workspacePath });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspacePath, encoding: "utf8" }).trim();

    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      stageResultPath,
      `${JSON.stringify(buildReviewStageResult({
        decision: "approve",
        stage: 6,
        reviewedChecklistIds: [
          CHECKLIST_IDS.backendDelivery,
          CHECKLIST_IDS.backendAcceptance,
          CHECKLIST_IDS.frontendDelivery,
          CHECKLIST_IDS.frontendAcceptance,
        ],
        bodyMarkdown: "Approved with manual merge handoff.",
      }), null, 2)}\n`,
    );

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({ rootDir, workItemId: "03-recipe-like", slice: "03-recipe-like" }).state,
        slice: "03-recipe-like",
        active_stage: 6,
        current_stage: 6,
        workspace: { path: workspacePath, branch_role: "frontend" },
        phase: "review_pending",
        next_action: "run_review",
        last_artifact_dir: artifactDir,
        execution: {
          provider: "opencode",
          session_role: "codex_primary",
          session_id: "ses_codex_stage6",
          artifact_dir: artifactDir,
          stage_result_path: stageResultPath,
          started_at: "2026-04-09T23:15:00+09:00",
          finished_at: "2026-04-09T23:15:00+09:00",
          verify_commands: [],
          verify_bucket: null,
          commit_sha: null,
          pr_role: "frontend",
        },
        design_authority: {
          status: "reviewed",
          ui_risk: "anchor-extension",
          anchor_screens: ["RECIPE_DETAIL", "PLANNER_WEEK"],
          required_screens: ["RECIPE_DETAIL"],
          authority_required: true,
          authority_verdict: "pass",
          authority_report_paths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
          reviewed_screen_ids: ["RECIPE_DETAIL"],
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: false,
            branch: "feature/fe-03-recipe-like",
            head_sha: headSha,
          },
        },
      },
    });

    const result = superviseWorkItem(
      { rootDir, workItemId: "03-recipe-like", now: "2026-04-09T23:15:00+09:00", maxTransitions: 1 },
      {
        auth: { assertGhAuth() {}, assertOpencodeAuth() {}, assertClaudeAuth() {} },
        worktree: {
          ensureWorktree() { return { path: workspacePath, created: false }; },
          assertClean() {},
          checkoutBranch({ branch }: { branch: string }) { return { branch }; },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() { return headSha; },
          getCurrentBranch() { return "feature/fe-03-recipe-like"; },
          listChangedFiles() { return []; },
          getBinaryDiff() { return ""; },
        },
        stageRunner() { throw new Error("not expected"); },
        github: {
          createPullRequest() { throw new Error("not expected"); },
          getRequiredChecks() { return { bucket: "pass", checks: [] }; },
          markReady() {},
          commentPullRequest() {},
          mergePullRequest() { throw new Error("not expected"); },
          getPullRequestSummary() { return { state: "OPEN", mergedAt: null, mergeStateStatus: "CLEAN", reviewDecision: null }; },
          updateBranch() {},
          getApprovalRequirement() { return { required: false, requiredApprovingReviewCount: 0, source: "test" }; },
        },
      },
    );

    expect(result.wait).toMatchObject({
      kind: "human_escalation",
    });
    expect(result.wait?.reason ?? "").toContain("manual merge handoff");
  });

  it("resolves stale Stage 6 manual merge handoff after the frontend PR is merged", () => {
    const rootDir = createFixture();
    seedAutonomousPolicy(rootDir, "03-recipe-like", {
      authorityRequired: true,
      uiRisk: "anchor-extension",
      requiredScreens: ["RECIPE_DETAIL"],
      authorityReportPaths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
      anchorScreens: ["RECIPE_DETAIL", "PLANNER_WEEK"],
    });
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    const artifactDir = join(rootDir, ".artifacts", "stage6-manual-handoff-merged");

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "in-progress",
      designStatus: "confirmed",
      authorityStatus: "reviewed",
      uiRisk: "anchor-extension",
      visualArtifact: "ui/designs/evidence/06/RECIPE_DETAIL-mobile.png",
    });
    mkdirSync(join(workspacePath, "ui", "designs", "authority"), { recursive: true });
    writeFileSync(join(workspacePath, "ui", "designs", "authority", "RECIPE_DETAIL-authority.md"), "# Authority\n- verdict: pass\n");
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "feat: seed merged manual handoff"], { cwd: workspacePath });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspacePath, encoding: "utf8" }).trim();

    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      join(artifactDir, "stage-result.json"),
      `${JSON.stringify(buildReviewStageResult({
        decision: "approve",
        stage: 6,
        reviewedChecklistIds: [
          CHECKLIST_IDS.backendDelivery,
          CHECKLIST_IDS.backendAcceptance,
          CHECKLIST_IDS.frontendDelivery,
          CHECKLIST_IDS.frontendAcceptance,
        ],
        bodyMarkdown: "Approved with manual merge handoff.",
      }), null, 2)}\n`,
    );

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({ rootDir, workItemId: "03-recipe-like", slice: "03-recipe-like" }).state,
        slice: "03-recipe-like",
        active_stage: 6,
        current_stage: 6,
        last_completed_stage: 5,
        workspace: { path: workspacePath, branch_role: "frontend" },
        phase: "wait",
        next_action: "noop",
        last_artifact_dir: artifactDir,
        wait: {
          kind: "human_escalation",
          pr_role: null,
          stage: null,
          head_sha: null,
          reason: "Slice requires manual merge handoff for Stage 6.",
          until: null,
          updated_at: "2026-04-10T00:00:00+09:00",
        },
        execution: {
          provider: "opencode",
          session_role: "codex_primary",
          session_id: "ses_codex_stage6",
          artifact_dir: artifactDir,
          stage_result_path: join(artifactDir, "stage-result.json"),
          started_at: "2026-04-09T23:15:00+09:00",
          finished_at: "2026-04-09T23:15:00+09:00",
          verify_commands: [],
          verify_bucket: null,
          commit_sha: null,
          pr_role: "frontend",
        },
        design_authority: {
          status: "reviewed",
          ui_risk: "anchor-extension",
          anchor_screens: ["RECIPE_DETAIL", "PLANNER_WEEK"],
          required_screens: ["RECIPE_DETAIL"],
          authority_required: true,
          authority_verdict: "pass",
          authority_report_paths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
          reviewed_screen_ids: ["RECIPE_DETAIL"],
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: false,
            branch: "feature/fe-03-recipe-like",
            head_sha: headSha,
          },
        },
        recovery: {
          kind: "partial_stage_failure",
          stage: 6,
          branch: "feature/fe-03-recipe-like",
          reason: "Slice requires manual merge handoff for Stage 6.",
          artifact_dir: artifactDir,
          changed_files: [],
          existing_pr: {
            role: "frontend",
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: false,
            branch: "feature/fe-03-recipe-like",
            head_sha: headSha,
          },
          salvage_candidate: false,
          session_role: "codex_primary",
          session_provider: "opencode",
          session_id: "ses_codex_stage6",
        },
      },
    });

    const result = superviseWorkItem(
      { rootDir, workItemId: "03-recipe-like", now: "2026-04-10T00:10:00+09:00", maxTransitions: 1 },
      {
        auth: { assertGhAuth() {}, assertOpencodeAuth() {}, assertClaudeAuth() {} },
        worktree: {
          ensureWorktree() { return { path: workspacePath, created: false }; },
          assertClean() {},
          checkoutBranch({ branch }: { branch: string }) { return { branch }; },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() { return headSha; },
          getCurrentBranch() { return "feature/fe-03-recipe-like"; },
          listChangedFiles() { return []; },
          getBinaryDiff() { return ""; },
        },
        stageRunner() { throw new Error("not expected"); },
        github: {
          createPullRequest() { throw new Error("not expected"); },
          getRequiredChecks() { throw new Error("not expected"); },
          markReady() {},
          commentPullRequest() {},
          mergePullRequest() { throw new Error("not expected"); },
          getPullRequestSummary() {
            return { state: "MERGED", mergedAt: "2026-04-10T00:05:00Z", mergeStateStatus: "UNKNOWN", reviewDecision: null };
          },
          updateBranch() {},
          getApprovalRequirement() { return { required: false, requiredApprovingReviewCount: 0, source: "test" }; },
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      slice: "03-recipe-like",
    }).state as {
      phase: string | null;
      wait: unknown;
      last_completed_stage: number | null;
      recovery: unknown;
    };

    expect(result.wait).toBeNull();
    expect(runtime.phase).toBe("done");
    expect(runtime.last_completed_stage).toBe(6);
    expect(runtime.wait).toBeNull();
    expect(runtime.recovery).toBeNull();
  });

  it("escalates to human_escalation when review ping-pong exceeds max rounds", () => {
    const rootDir = createFixture();
    seedAutonomousPolicy(rootDir, "03-recipe-like");
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    mkdirSync(join(workspacePath, "docs", "workpacks", "03-recipe-like"), { recursive: true });
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "README.md"),
      [
        "# Workpack Roadmap v2",
        "",
        "## Slice Order",
        "",
        "| Slice | Status | Goal |",
        "| --- | --- | --- |",
        "| `03-recipe-like` | in-progress | test slice |",
      ].join("\n"),
    );
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "03-recipe-like", "README.md"),
      [
        "# 03-recipe-like",
        "",
        "## Design Status",
        "",
        "- [ ] 임시 UI (temporary)",
        "- [ ] 리뷰 대기 (pending-review)",
        "- [x] 확정 (confirmed)",
        "- [ ] N/A",
      ].join("\n"),
    );
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "feat: seed stage6 ping-pong"], { cwd: workspacePath });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: workspacePath,
      encoding: "utf8",
    }).trim();

    const artifactDir = join(rootDir, ".artifacts", "stage6-stalled");
    mkdirSync(artifactDir, { recursive: true });
    const stageResultPath = join(artifactDir, "stage-result.json");
    writeFileSync(
      stageResultPath,
      JSON.stringify(
        buildReviewStageResult({
          decision: "request_changes",
          stage: 6,
          reviewedChecklistIds: [
            CHECKLIST_IDS.backendDelivery,
            CHECKLIST_IDS.backendAcceptance,
            CHECKLIST_IDS.frontendDelivery,
            CHECKLIST_IDS.frontendAcceptance,
          ],
          requiredFixIds: [CHECKLIST_IDS.frontendDelivery],
          bodyMarkdown: "Still not right.",
          routeBackStage: 4,
        }),
      ),
    );

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({ rootDir, workItemId: "03-recipe-like", slice: "03-recipe-like" }).state,
        slice: "03-recipe-like",
        current_stage: 6,
        active_stage: 6,
        phase: "review_pending",
        next_action: "run_review",
        last_artifact_dir: artifactDir,
        workspace: { path: workspacePath, branch_role: "frontend" },
        execution: {
          provider: "opencode",
          session_role: "codex_primary",
          session_id: "ses_codex_s6",
          artifact_dir: artifactDir,
          stage_result_path: stageResultPath,
          started_at: "2026-03-27T02:00:00+09:00",
          finished_at: "2026-03-27T02:05:00+09:00",
          verify_commands: [],
          verify_bucket: null,
          commit_sha: null,
          pr_role: "frontend",
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: false,
            branch: "feature/fe-03-recipe-like",
            head_sha: headSha,
          },
        },
        // Already been through 3 rounds — next request_changes should escalate
        last_review: {
          frontend: {
            decision: "request_changes",
            route_back_stage: 4,
            source_review_stage: 6,
            ping_pong_rounds: 3,
            body_markdown: "Previous feedback.",
            findings: [],
            review_scope: {
              scope: "closeout",
              checklist_ids: [
                CHECKLIST_IDS.backendDelivery,
                CHECKLIST_IDS.backendAcceptance,
                CHECKLIST_IDS.frontendDelivery,
                CHECKLIST_IDS.frontendAcceptance,
              ],
            },
            reviewed_checklist_ids: [
              CHECKLIST_IDS.backendDelivery,
              CHECKLIST_IDS.backendAcceptance,
              CHECKLIST_IDS.frontendDelivery,
              CHECKLIST_IDS.frontendAcceptance,
            ],
            required_fix_ids: [CHECKLIST_IDS.frontendDelivery],
            updated_at: "2026-03-27T01:50:00+09:00",
          },
        },
      },
    });

    const result = superviseWorkItem(
      { rootDir, workItemId: "03-recipe-like", now: "2026-03-27T02:10:00+09:00", maxTransitions: 1 },
      {
        auth: { assertGhAuth() {}, assertOpencodeAuth() {} },
        worktree: {
          ensureWorktree() { return { path: workspacePath, created: false }; },
          assertClean() {},
          checkoutBranch() { return { branch: "feature/fe-03-recipe-like" }; },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspacePath, encoding: "utf8" }).trim();
          },
          getCurrentBranch() { return "feature/fe-03-recipe-like"; },
          listChangedFiles() { return []; },
        },
        stageRunner() { throw new Error("not expected in review_pending path"); },
        github: {
          createPullRequest() { throw new Error("not expected"); },
          getRequiredChecks() { return { bucket: "pass", checks: [] }; },
          markReady() {},
          commentPullRequest() {},
          mergePullRequest() { throw new Error("not expected"); },
          getPullRequestSummary() {
            return { state: "OPEN", mergedAt: null, mergeStateStatus: "CLEAN", reviewDecision: "CHANGES_REQUESTED" };
          },
          updateBranch() {},
        },
      },
    );

    // Should escalate because ping_pong_rounds(3) + 1 = 4 > MAX_PING_PONG_ROUNDS(3)
    expect(result.wait).toMatchObject({
      kind: "human_escalation",
    });
  });

  it("adds merged slice bookkeeping after Stage 6 approval and waits for CI on the updated frontend PR", () => {
    const rootDir = createFixture();
    seedAutonomousPolicy(rootDir, "03-recipe-like");
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    const roadmapPath = join(workspacePath, "docs", "workpacks", "README.md");
    const workpackReadme = join(workspacePath, "docs", "workpacks", "03-recipe-like", "README.md");
    let observedMergeHeadSha: string | null = null;

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    mkdirSync(join(workspacePath, "docs", "workpacks", "03-recipe-like"), { recursive: true });
    writeFileSync(
      roadmapPath,
      [
        "# Workpack Roadmap v2",
        "",
        "## Slice Order",
        "",
        "| Slice | Status | Goal |",
        "| --- | --- | --- |",
        "| `03-recipe-like` | in-progress | test slice |",
      ].join("\n"),
    );
    writeFileSync(
      workpackReadme,
      buildWorkpackReadme({
        workItemId: "03-recipe-like",
        designStatus: "confirmed",
        backendChecked: true,
        frontendChecked: true,
      }),
    );
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "03-recipe-like", "acceptance.md"),
      buildAcceptance({
        workItemId: "03-recipe-like",
        backendChecked: true,
        frontendChecked: true,
      }),
    );
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "feat: seed frontend branch"], { cwd: workspacePath });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: workspacePath,
      encoding: "utf8",
    }).trim();

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        current_stage: 5,
        last_completed_stage: 5,
        workspace: {
          path: workspacePath,
          branch_role: "frontend",
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: false,
            branch: "feature/fe-03-recipe-like",
            head_sha: headSha,
          },
        },
        wait: {
          kind: "ready_for_next_stage",
          pr_role: "frontend",
          stage: 6,
          head_sha: headSha,
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T00:49:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "feature/fe-03-recipe-like" };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return execFileSync("git", ["rev-parse", "HEAD"], {
              cwd: workspacePath,
              encoding: "utf8",
            }).trim();
          },
        },
        stageRunner() {
          return {
            artifactDir: join(rootDir, ".artifacts", "stage6-approve"),
            dispatch: { actor: "claude", stage: 6 },
            execution: { mode: "execute", executed: true, sessionId: "ses_claude" },
            stageResult: {
              ...buildReviewStageResult({
                decision: "approve",
                stage: 6,
                reviewedChecklistIds: [
                  CHECKLIST_IDS.backendDelivery,
                  CHECKLIST_IDS.backendAcceptance,
                  CHECKLIST_IDS.frontendDelivery,
                  CHECKLIST_IDS.frontendAcceptance,
                ],
                bodyMarkdown: "Frontend review approved.",
                approvedHeadSha: headSha,
              }),
            },
          };
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            return { bucket: "pass", checks: [] };
          },
          markReady() {},
          getApprovalRequirement() {
            return {
              required: false,
              requiredApprovingReviewCount: 0,
              source: "branch-protection",
            };
          },
          commentPullRequest() {},
          getPullRequestBody() {
            return [
              "## Actual Verification",
              "- verifier: Codex",
              "- environment: local Supabase + seeded demo account",
              "- scope: frontend bootstrap smoke via `pnpm dev:local-supabase`",
              "- result: pass (planner bootstrap data loaded)",
              "",
              "## QA Evidence",
              "- exploratory QA: `N/A`",
              "- qa eval: `N/A`",
              "- 아티팩트 / 보고서 경로: `N/A`",
            ].join("\n");
          },
          mergePullRequest() {
            throw new Error("not expected");
          },
          getPullRequestSummary() {
            return {
              state: "OPEN",
              mergedAt: null,
              mergeStateStatus: "CLEAN",
              reviewDecision: "REVIEW_REQUIRED",
            };
          },
          updateBranch() {},
        },
      },
    );

    const updatedRoadmap = readFileSync(roadmapPath, "utf8");

    expect(result.wait).toMatchObject({
      kind: "ci",
      stage: 6,
      pr_role: "frontend",
    });
    expect(updatedRoadmap).toContain("| `03-recipe-like` | merged");
    const firstRuntime = readRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      slice: "03-recipe-like",
    }).state as {
      phase: string;
      last_review: { frontend: { approved_head_sha: string | null } | null };
    };
    expect(firstRuntime.phase).toBe("merge_pending");
    const bookkeepingHeadSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: workspacePath,
      encoding: "utf8",
    }).trim();
    expect(firstRuntime.last_review.frontend?.approved_head_sha).toBe(bookkeepingHeadSha);

    const second = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T00:50:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "feature/fe-03-recipe-like" };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return execFileSync("git", ["rev-parse", "HEAD"], {
              cwd: workspacePath,
              encoding: "utf8",
            }).trim();
          },
        },
        stageRunner() {
          throw new Error("not expected");
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            return { bucket: "pass", checks: [] };
          },
          markReady() {},
          getApprovalRequirement() {
            return {
              required: false,
              requiredApprovingReviewCount: 0,
              source: "branch-protection",
            };
          },
          commentPullRequest() {},
          mergePullRequest({ headSha }: { headSha: string }) {
            observedMergeHeadSha = headSha;
            return { merged: true };
          },
          getPullRequestSummary() {
            return {
              state: "OPEN",
              mergedAt: null,
              mergeStateStatus: "CLEAN",
              reviewDecision: null,
            };
          },
          updateBranch() {},
        },
      },
    );

    expect(second.wait).toBeNull();
    expect(observedMergeHeadSha).toBe(bookkeepingHeadSha);
  });

  it("repairs missing merged roadmap bookkeeping before autonomous Stage 6 merge", () => {
    const rootDir = createFixture();
    seedAutonomousPolicy(rootDir, "03-recipe-like");
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    const roadmapPath = join(workspacePath, "docs", "workpacks", "README.md");
    const workpackReadme = join(workspacePath, "docs", "workpacks", "03-recipe-like", "README.md");

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    mkdirSync(join(workspacePath, "docs", "workpacks", "03-recipe-like"), { recursive: true });
    writeFileSync(
      roadmapPath,
      [
        "# Workpack Roadmap v2",
        "",
        "## Slice Order",
        "",
        "| Slice | Status | Goal |",
        "| --- | --- | --- |",
        "| `03-recipe-like` | in-progress | test slice |",
      ].join("\n"),
    );
    writeFileSync(
      workpackReadme,
      buildWorkpackReadme({
        workItemId: "03-recipe-like",
        designStatus: "confirmed",
        backendChecked: true,
        frontendChecked: true,
      }),
    );
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "03-recipe-like", "acceptance.md"),
      buildAcceptance({
        workItemId: "03-recipe-like",
        backendChecked: true,
        frontendChecked: true,
      }),
    );
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "feat: seed frontend branch"], { cwd: workspacePath });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: workspacePath,
      encoding: "utf8",
    }).trim();

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        active_stage: 6,
        current_stage: 6,
        last_completed_stage: 5,
        phase: "merge_pending",
        next_action: "poll_ci",
        workspace: {
          path: workspacePath,
          branch_role: "frontend",
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: false,
            branch: "feature/fe-03-recipe-like",
            head_sha: headSha,
          },
          closeout: null,
        },
        wait: {
          kind: "ci",
          pr_role: "frontend",
          stage: 6,
          head_sha: headSha,
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-04-01T02:30:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "feature/fe-03-recipe-like" };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return execFileSync("git", ["rev-parse", "HEAD"], {
              cwd: workspacePath,
              encoding: "utf8",
            }).trim();
          },
          getCurrentBranch() {
            return "feature/fe-03-recipe-like";
          },
          listChangedFiles() {
            return [];
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner() {
          throw new Error("not expected");
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            return { bucket: "pending", checks: [] };
          },
          markReady() {
            throw new Error("not expected");
          },
          commentPullRequest() {
            throw new Error("not expected");
          },
          mergePullRequest() {
            throw new Error("not expected");
          },
          getPullRequestSummary() {
            return {
              state: "OPEN",
              mergedAt: null,
              mergeStateStatus: "CLEAN",
              reviewDecision: "APPROVED",
            };
          },
          updateBranch() {
            throw new Error("not expected");
          },
        },
      },
    );

    const updatedRoadmap = readFileSync(roadmapPath, "utf8");
    const runtime = readRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      slice: "03-recipe-like",
    }).state as {
      phase: string;
      wait: { kind: string; stage: number; pr_role: string };
      last_review: { frontend: { approved_head_sha: string | null } | null };
    };

    expect(result.wait).toMatchObject({
      kind: "ci",
      stage: 6,
      pr_role: "frontend",
    });
    expect(runtime.phase).toBe("merge_pending");
    expect(updatedRoadmap).toContain("| `03-recipe-like` | merged");
  });

  it("refreshes CI wait PR head metadata from the live GitHub summary before evaluating checks", () => {
    const rootDir = createFixture();
    seedAutonomousPolicy(rootDir, "03-recipe-like");
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "in-progress",
      designStatus: "confirmed",
    });
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "feat: seed stale ci wait"], { cwd: workspacePath });

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        active_stage: 4,
        current_stage: 4,
        last_completed_stage: 4,
        phase: "wait",
        next_action: "poll_ci",
        workspace: {
          path: workspacePath,
          branch_role: "frontend",
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: true,
            branch: "feature/fe-03-recipe-like",
            head_sha: "old-head",
          },
          closeout: null,
        },
        wait: {
          kind: "ci",
          pr_role: "frontend",
          stage: 4,
          head_sha: "old-head",
          reason: null,
          until: null,
          updated_at: "2026-04-20T11:50:00+09:00",
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-04-20T12:00:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "feature/fe-03-recipe-like" };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return "worktree-head";
          },
          getCurrentBranch() {
            return "feature/fe-03-recipe-like";
          },
          listChangedFiles() {
            return [];
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner() {
          throw new Error("not expected");
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            return { bucket: "pending", checks: [{ name: "quality", bucket: "pending", state: "PENDING" }] };
          },
          markReady() {
            throw new Error("not expected");
          },
          commentPullRequest() {
            throw new Error("not expected");
          },
          mergePullRequest() {
            throw new Error("not expected");
          },
          getPullRequestSummary() {
            return {
              state: "OPEN",
              mergedAt: null,
              mergeStateStatus: "CLEAN",
              reviewDecision: null,
              headRefOid: "new-head",
              headRefName: "feature/fe-03-recipe-like",
              isDraft: false,
            };
          },
          updateBranch() {
            throw new Error("not expected");
          },
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      slice: "03-recipe-like",
    }).state as {
      wait: { kind: string; stage: number | null; pr_role: string | null; head_sha: string | null };
      prs: { frontend: { head_sha: string | null; draft: boolean; branch: string | null } | null };
    };

    expect(result.wait).toMatchObject({
      kind: "ci",
      stage: 4,
      pr_role: "frontend",
      head_sha: "new-head",
    });
    expect(runtime.wait).toMatchObject({
      kind: "ci",
      stage: 4,
      pr_role: "frontend",
      head_sha: "new-head",
    });
    expect(runtime.prs.frontend).toMatchObject({
      head_sha: "new-head",
      draft: false,
      branch: "feature/fe-03-recipe-like",
    });
  });

  it("repairs fixable slice-local closeout drift during internal 6.5 before merge", () => {
    const rootDir = createFixture();
    seedAutonomousPolicy(rootDir, "03-recipe-like");
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    const roadmapPath = join(workspacePath, "docs", "workpacks", "README.md");
    const workpackReadmePath = join(workspacePath, "docs", "workpacks", "03-recipe-like", "README.md");
    const acceptancePath = join(workspacePath, "docs", "workpacks", "03-recipe-like", "acceptance.md");

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    mkdirSync(join(workspacePath, "docs", "workpacks", "03-recipe-like"), { recursive: true });
    writeFileSync(
      roadmapPath,
      [
        "# Workpack Roadmap v2",
        "",
        "## Slice Order",
        "",
        "| Slice | Status | Goal |",
        "| --- | --- | --- |",
        "| `03-recipe-like` | in-progress | test slice |",
      ].join("\n"),
    );
    writeFileSync(
      workpackReadmePath,
      buildWorkpackReadme({
        workItemId: "03-recipe-like",
        designStatus: "confirmed",
        backendChecked: true,
        frontendChecked: false,
      }),
    );
    writeFileSync(
      acceptancePath,
      buildAcceptance({
        workItemId: "03-recipe-like",
        backendChecked: true,
        frontendChecked: false,
      }),
    );
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "feat: seed frontend branch"], { cwd: workspacePath });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: workspacePath,
      encoding: "utf8",
    }).trim();

    const pushedBranches: string[] = [];

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        current_stage: 5,
        last_completed_stage: 5,
        workspace: {
          path: workspacePath,
          branch_role: "frontend",
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: false,
            branch: "feature/fe-03-recipe-like",
            head_sha: headSha,
          },
        },
        wait: {
          kind: "ready_for_next_stage",
          pr_role: "frontend",
          stage: 6,
          head_sha: headSha,
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-04-13T11:00:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "feature/fe-03-recipe-like" };
          },
          pushBranch({ branch }: { branch: string }) {
            pushedBranches.push(branch);
          },
          syncBaseBranch() {},
          getHeadSha() {
            return execFileSync("git", ["rev-parse", "HEAD"], {
              cwd: workspacePath,
              encoding: "utf8",
            }).trim();
          },
          getCurrentBranch() {
            return "feature/fe-03-recipe-like";
          },
          listChangedFiles() {
            return [];
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner() {
          return {
            artifactDir: join(rootDir, ".artifacts", "stage6-closeout-repair"),
            dispatch: { actor: "claude", stage: 6 },
            execution: { mode: "execute", executed: true, sessionId: "ses_claude" },
            stageResult: buildReviewStageResult({
              decision: "approve",
              stage: 6,
              reviewedChecklistIds: [
                CHECKLIST_IDS.backendDelivery,
                CHECKLIST_IDS.backendAcceptance,
                CHECKLIST_IDS.frontendDelivery,
                CHECKLIST_IDS.frontendAcceptance,
              ],
              bodyMarkdown: "Frontend review approved.",
              approvedHeadSha: headSha,
            }),
          };
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            return { bucket: "pass", checks: [] };
          },
          markReady() {},
          getApprovalRequirement() {
            return {
              required: false,
              requiredApprovingReviewCount: 0,
              source: "branch-protection",
            };
          },
          commentPullRequest() {},
          getPullRequestBody() {
            return [
              "## Actual Verification",
              "- verifier: Codex",
              "- environment: local Supabase + seeded demo account",
              "- scope: frontend bootstrap smoke via `pnpm dev:local-supabase`",
              "- result: pass (planner bootstrap data loaded)",
              "",
              "## QA Evidence",
              "- exploratory QA: `N/A`",
              "- qa eval: `N/A`",
              "- 아티팩트 / 보고서 경로: `N/A`",
            ].join("\n");
          },
          mergePullRequest() {
            throw new Error("not expected");
          },
          getPullRequestSummary() {
            return {
              state: "OPEN",
              mergedAt: null,
              mergeStateStatus: "CLEAN",
              reviewDecision: "REVIEW_REQUIRED",
            };
          },
          updateBranch() {},
        },
      },
    );

    const updatedRoadmap = readFileSync(roadmapPath, "utf8");
    const updatedWorkpack = readFileSync(workpackReadmePath, "utf8");
    const updatedAcceptance = readFileSync(acceptancePath, "utf8");
    const runtime = readRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      slice: "03-recipe-like",
    }).state as {
      phase: string;
      wait: { kind: string; stage: number; pr_role: string };
      last_review: { frontend: { approved_head_sha: string | null } | null };
    };

    expect(result.wait).toMatchObject({
      kind: "ci",
      stage: 6,
      pr_role: "frontend",
    });
    expect(runtime.phase).toBe("merge_pending");
    expect(updatedRoadmap).toContain("| `03-recipe-like` | merged");
    expect(updatedWorkpack).toContain(`- [x] UI 연결 <!-- omo:id=${CHECKLIST_IDS.frontendDelivery};stage=4;scope=frontend;review=5,6 -->`);
    expect(updatedAcceptance).toContain(`- [x] loading 상태가 있다 <!-- omo:id=${CHECKLIST_IDS.frontendAcceptance};stage=4;scope=frontend;review=5,6 -->`);
    expect(runtime.last_review.frontend?.approved_head_sha).toBe(
      execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspacePath, encoding: "utf8" }).trim(),
    );
    expect(pushedBranches).toEqual(["feature/fe-03-recipe-like"]);
  });

  it("blocks Stage 6 merge when internal 6.5 finds non-fixable closeout drift", () => {
    const rootDir = createFixture();
    seedAutonomousPolicy(rootDir, "03-recipe-like", {
      authorityRequired: true,
      authorityReportPaths: [],
    });
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "in-progress",
      designStatus: "confirmed",
      authorityStatus: "pending",
    });
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "feat: seed frontend branch"], { cwd: workspacePath });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: workspacePath,
      encoding: "utf8",
    }).trim();

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        current_stage: 5,
        last_completed_stage: 5,
        workspace: {
          path: workspacePath,
          branch_role: "frontend",
        },
        design_authority: {
          status: "reviewed",
          authority_required: true,
          authority_verdict: "pass",
          authority_report_paths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
          reviewed_screen_ids: ["RECIPE_DETAIL"],
          required_screens: ["RECIPE_DETAIL"],
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: false,
            branch: "feature/fe-03-recipe-like",
            head_sha: headSha,
          },
        },
        wait: {
          kind: "ready_for_next_stage",
          pr_role: "frontend",
          stage: 6,
          head_sha: headSha,
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-04-13T11:05:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "feature/fe-03-recipe-like" };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return execFileSync("git", ["rev-parse", "HEAD"], {
              cwd: workspacePath,
              encoding: "utf8",
            }).trim();
          },
          getCurrentBranch() {
            return "feature/fe-03-recipe-like";
          },
          listChangedFiles() {
            return [];
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner() {
          return {
            artifactDir: join(rootDir, ".artifacts", "stage6-closeout-blocked"),
            dispatch: { actor: "claude", stage: 6 },
            execution: { mode: "execute", executed: true, sessionId: "ses_claude" },
            stageResult: buildReviewStageResult({
              decision: "approve",
              stage: 6,
              reviewedChecklistIds: [
                CHECKLIST_IDS.backendDelivery,
                CHECKLIST_IDS.backendAcceptance,
                CHECKLIST_IDS.frontendDelivery,
                CHECKLIST_IDS.frontendAcceptance,
              ],
              bodyMarkdown: "Frontend review approved.",
              approvedHeadSha: headSha,
            }),
          };
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            return { bucket: "pass", checks: [] };
          },
          markReady() {},
          getApprovalRequirement() {
            return {
              required: false,
              requiredApprovingReviewCount: 0,
              source: "branch-protection",
            };
          },
          commentPullRequest() {},
          getPullRequestBody() {
            return [
              "## Actual Verification",
              "- verifier: Codex",
              "- environment: local Supabase + seeded demo account",
              "- scope: frontend bootstrap smoke via `pnpm dev:local-supabase`",
              "- result: pass (planner bootstrap data loaded)",
              "",
              "## QA Evidence",
              "- exploratory QA: `N/A`",
              "- qa eval: `N/A`",
              "- 아티팩트 / 보고서 경로: `N/A`",
            ].join("\n");
          },
          mergePullRequest() {
            throw new Error("not expected");
          },
          getPullRequestSummary() {
            return {
              state: "OPEN",
              mergedAt: null,
              mergeStateStatus: "CLEAN",
              reviewDecision: "REVIEW_REQUIRED",
            };
          },
          updateBranch() {},
        },
      },
    );

    expect(result.wait).toMatchObject({
      kind: "human_escalation",
    });
    expect(result.runtime?.recovery?.reason ?? "").toContain("missing authority reports");
  });

  it("finalizes merged closeout PRs while keeping slice state done", () => {
    const rootDir = createFixture();
    seedWorktreeBookkeeping(join(rootDir, ".worktrees", "03-recipe-like"), "03-recipe-like", {
      roadmapStatus: "merged",
      designStatus: "confirmed",
    });

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        active_stage: 6,
        current_stage: 6,
        last_completed_stage: 6,
        phase: "wait",
        next_action: "poll_ci",
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: false,
            branch: "feature/fe-03-recipe-like",
            head_sha: "fe123",
          },
          closeout: {
            number: 99,
            url: "https://github.com/netsus/homecook/pull/99",
            draft: false,
            branch: "docs/omo-closeout-03-recipe-like",
            head_sha: "close123",
          },
        },
        wait: {
          kind: "ci",
          pr_role: "closeout",
          stage: 6,
          head_sha: "close123",
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-04-01T02:40:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: join(rootDir, ".worktrees", "03-recipe-like"), created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "docs/omo-closeout-03-recipe-like" };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return "close123";
          },
          getCurrentBranch() {
            return "docs/omo-closeout-03-recipe-like";
          },
          listChangedFiles() {
            return [];
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner() {
          throw new Error("not expected");
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            throw new Error("not expected");
          },
          markReady() {
            throw new Error("not expected");
          },
          reviewPullRequest() {
            throw new Error("not expected");
          },
          commentPullRequest() {
            throw new Error("not expected");
          },
          mergePullRequest() {
            throw new Error("not expected");
          },
          getPullRequestSummary() {
            return {
              state: "MERGED",
              mergedAt: "2026-04-01T02:39:00.000Z",
              mergeStateStatus: "UNKNOWN",
              reviewDecision: null,
            };
          },
          updateBranch() {
            throw new Error("not expected");
          },
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      slice: "03-recipe-like",
    }).state as {
      phase: string;
      wait: null;
    };

    expect(result.wait).toBeNull();
    expect(runtime.phase).toBe("done");
    expect(runtime.wait).toBeNull();
  });

  it("tick resumes stale Stage 6 manual merge handoff escalations after the PR is merged", () => {
    const rootDir = createFixture();
    seedAutonomousPolicy(rootDir, "03-recipe-like", {
      authorityRequired: true,
      uiRisk: "anchor-extension",
      requiredScreens: ["RECIPE_DETAIL"],
      authorityReportPaths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
      anchorScreens: ["RECIPE_DETAIL", "PLANNER_WEEK"],
    });
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    const artifactDir = join(rootDir, ".artifacts", "stage6-manual-handoff-tick");

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "in-progress",
      designStatus: "confirmed",
      authorityStatus: "reviewed",
      uiRisk: "anchor-extension",
      visualArtifact: "ui/designs/evidence/06/RECIPE_DETAIL-mobile.png",
    });
    mkdirSync(join(workspacePath, "ui", "designs", "authority"), { recursive: true });
    writeFileSync(join(workspacePath, "ui", "designs", "authority", "RECIPE_DETAIL-authority.md"), "# Authority\n- verdict: pass\n");
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "feat: seed merged handoff tick"], { cwd: workspacePath });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspacePath, encoding: "utf8" }).trim();

    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      join(artifactDir, "stage-result.json"),
      `${JSON.stringify(buildReviewStageResult({
        decision: "approve",
        stage: 6,
        reviewedChecklistIds: [
          CHECKLIST_IDS.backendDelivery,
          CHECKLIST_IDS.backendAcceptance,
          CHECKLIST_IDS.frontendDelivery,
          CHECKLIST_IDS.frontendAcceptance,
        ],
        bodyMarkdown: "Approved with manual merge handoff.",
      }), null, 2)}\n`,
    );

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({ rootDir, workItemId: "03-recipe-like", slice: "03-recipe-like" }).state,
        slice: "03-recipe-like",
        active_stage: 6,
        current_stage: 6,
        last_completed_stage: 5,
        workspace: { path: workspacePath, branch_role: "frontend" },
        phase: "wait",
        next_action: "noop",
        last_artifact_dir: artifactDir,
        wait: {
          kind: "human_escalation",
          pr_role: null,
          stage: null,
          head_sha: null,
          reason: "Slice requires manual merge handoff for Stage 6.",
          until: null,
          updated_at: "2026-04-10T00:00:00+09:00",
        },
        execution: {
          provider: "opencode",
          session_role: "codex_primary",
          session_id: "ses_codex_stage6",
          artifact_dir: artifactDir,
          stage_result_path: join(artifactDir, "stage-result.json"),
          started_at: "2026-04-09T23:15:00+09:00",
          finished_at: "2026-04-09T23:15:00+09:00",
          verify_commands: [],
          verify_bucket: null,
          commit_sha: null,
          pr_role: "frontend",
        },
        design_authority: {
          status: "reviewed",
          ui_risk: "anchor-extension",
          anchor_screens: ["RECIPE_DETAIL", "PLANNER_WEEK"],
          required_screens: ["RECIPE_DETAIL"],
          authority_required: true,
          authority_verdict: "pass",
          authority_report_paths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
          reviewed_screen_ids: ["RECIPE_DETAIL"],
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: false,
            branch: "feature/fe-03-recipe-like",
            head_sha: headSha,
          },
        },
        recovery: {
          kind: "partial_stage_failure",
          stage: 6,
          branch: "feature/fe-03-recipe-like",
          reason: "Slice requires manual merge handoff for Stage 6.",
          artifact_dir: artifactDir,
          changed_files: [],
          existing_pr: {
            role: "frontend",
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: false,
            branch: "feature/fe-03-recipe-like",
            head_sha: headSha,
          },
          salvage_candidate: false,
          session_role: "codex_primary",
          session_provider: "opencode",
          session_id: "ses_codex_stage6",
        },
      },
    });

    const tickDependencies = {
      auth: { assertGhAuth() {}, assertOpencodeAuth() {}, assertClaudeAuth() {} },
      worktree: {
        ensureWorktree() { return { path: workspacePath, created: false }; },
        assertClean() {},
        checkoutBranch({ branch }: { branch: string }) { return { branch }; },
        pushBranch() {},
        syncBaseBranch() {},
        getHeadSha() { return headSha; },
        getCurrentBranch() { return "feature/fe-03-recipe-like"; },
        listChangedFiles() { return []; },
        getBinaryDiff() { return ""; },
      },
      stageRunner() { throw new Error("not expected"); },
      github: {
        createPullRequest() { throw new Error("not expected"); },
        getRequiredChecks() { throw new Error("not expected"); },
        markReady() {},
        commentPullRequest() {},
        mergePullRequest() { throw new Error("not expected"); },
        getPullRequestSummary() {
          return { state: "MERGED", mergedAt: "2026-04-10T00:05:00Z", mergeStateStatus: "UNKNOWN", reviewDecision: null };
        },
        updateBranch() {},
        getApprovalRequirement() { return { required: false, requiredApprovingReviewCount: 0, source: "test" }; },
      },
    };

    const [result] = tickSupervisorWorkItems(
      { rootDir, workItemId: "03-recipe-like", now: "2026-04-10T00:10:00+09:00" },
      {
        ...tickDependencies,
        supervise(options: { rootDir?: string; workItemId: string; now?: string; maxTransitions?: number }) {
          return superviseWorkItem(options, tickDependencies);
        },
      },
    );

    expect(result.wait).toBeNull();
    expect(result.runtime?.phase).toBe("done");
    expect(result.runtime?.last_completed_stage).toBe(6);
  });

  it("tick resumes due work items, skips future retries, and reports locked items without failing", () => {
    const rootDir = createFixture();
    seedProductWorkItem(rootDir, "04-shopping-list");
    seedProductWorkItem(rootDir, "05-locked-slice");

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        blocked_stage: 3,
        retry: {
          at: "2026-03-27T00:00:00.000Z",
          reason: "claude_budget_unavailable",
          attempt_count: 1,
          max_attempts: 3,
        },
        wait: {
          kind: "blocked_retry",
          stage: 3,
          pr_role: "backend",
          head_sha: "be123",
        },
      },
    });
    writeRuntimeState({
      rootDir,
      workItemId: "04-shopping-list",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "04-shopping-list",
          slice: "04-shopping-list",
        }).state,
        slice: "04-shopping-list",
        blocked_stage: 3,
        retry: {
          at: "2026-03-27T05:00:00.000Z",
          reason: "claude_budget_unavailable",
          attempt_count: 1,
          max_attempts: 3,
        },
        wait: {
          kind: "blocked_retry",
          stage: 3,
          pr_role: "backend",
          head_sha: "be999",
        },
      },
    });
    writeRuntimeState({
      rootDir,
      workItemId: "05-locked-slice",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "05-locked-slice",
          slice: "05-locked-slice",
        }).state,
        slice: "05-locked-slice",
        blocked_stage: 3,
        retry: {
          at: "2026-03-27T00:00:00.000Z",
          reason: "claude_budget_unavailable",
          attempt_count: 1,
          max_attempts: 3,
        },
        wait: {
          kind: "blocked_retry",
          stage: 3,
          pr_role: "backend",
          head_sha: "be555",
        },
        lock: {
          owner: "manual-lock",
          acquired_at: "2026-03-27T00:30:00.000Z",
        },
      },
    });

    const seen: string[] = [];
    const results = tickSupervisorWorkItems(
      {
        rootDir,
        all: true,
        now: "2026-03-27T01:00:00.000Z",
      },
      {
        supervise(args: { workItemId: string }) {
          seen.push(args.workItemId);
          return {
            workItemId: args.workItemId,
            wait: {
              kind: "ci",
            },
          };
        },
      },
    );

    expect(seen).toEqual(["03-recipe-like"]);
    expect(results).toEqual([
      expect.objectContaining({
        workItemId: "03-recipe-like",
      }),
      expect.objectContaining({
        workItemId: "04-shopping-list",
        action: "noop",
        reason: "retry_not_due",
      }),
      expect.objectContaining({
        workItemId: "05-locked-slice",
        action: "skip_locked",
        reason: "locked_by=manual-lock",
      }),
    ]);
  });

  it("tick treats legacy human_review waits as unsupported", () => {
    const rootDir = createFixture();

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        wait: {
          kind: "human_review",
          stage: 3,
          pr_role: "backend",
        },
      },
    });

    const results = tickSupervisorWorkItems({
      rootDir,
      workItemId: "03-recipe-like",
      now: "2026-03-27T01:00:00.000Z",
    });

    expect(results).toEqual([
      expect.objectContaining({
        workItemId: "03-recipe-like",
        action: "noop",
        reason: "unsupported_wait_kind=human_review",
      }),
    ]);
  });

  it("tick treats legacy human_verification waits as unsupported", () => {
    const rootDir = createFixture();

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        wait: {
          kind: "human_verification",
          stage: 6,
          pr_role: "frontend",
        },
      },
    });

    const results = tickSupervisorWorkItems({
      rootDir,
      workItemId: "03-recipe-like",
      now: "2026-03-27T01:10:00.000Z",
    });

    expect(results).toEqual([
      expect.objectContaining({
        workItemId: "03-recipe-like",
        action: "noop",
        reason: "unsupported_wait_kind=human_verification",
      }),
    ]);
  });

  it("tick reclaims a stale wait-state lock residue before resuming", () => {
    const rootDir = createFixture();
    const workItemId = "03-recipe-like";
    const seen: string[] = [];

    writeRuntimeState({
      rootDir,
      workItemId,
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId,
          slice: workItemId,
        }).state,
        slice: workItemId,
        active_stage: 3,
        current_stage: 3,
        phase: "stage_running",
        next_action: "run_stage",
        wait: {
          kind: "ready_for_next_stage",
          stage: 3,
          pr_role: "backend",
          updated_at: "2026-04-23T17:22:25.467Z",
        },
        lock: {
          owner: "omo-supervisor-1012",
          acquired_at: "2026-04-23T17:22:22.441Z",
        },
      },
    });

    const results = tickSupervisorWorkItems(
      {
        rootDir,
        workItemId,
        now: "2026-04-24T05:00:00.000Z",
      },
      {
        supervise(args: { workItemId: string }) {
          seen.push(args.workItemId);
          const runtime = readRuntimeState({ rootDir, workItemId, slice: workItemId }).state;
          return {
            workItemId: args.workItemId,
            slice: workItemId,
            wait: runtime.wait,
            runtime,
            transitions: [],
          };
        },
      },
    );

    expect(seen).toEqual([workItemId]);
    expect(results[0]).toEqual(
      expect.objectContaining({
        workItemId,
        wait: expect.objectContaining({
          kind: "ready_for_next_stage",
        }),
      }),
    );
    const runtime = readRuntimeState({ rootDir, workItemId, slice: workItemId }).state as {
      lock: null | { owner: string };
      phase: string | null;
    };
    expect(runtime.lock).toBeNull();
    expect(runtime.phase).toBe("wait");
  });

  it("tick --all surfaces unsupported wait kinds instead of silently skipping them", () => {
    const rootDir = createFixture();

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        wait: {
          kind: "human_review",
          stage: 3,
          pr_role: "backend",
        },
      },
    });

    const results = tickSupervisorWorkItems({
      rootDir,
      all: true,
      now: "2026-03-27T01:00:00.000Z",
    });

    expect(results).toEqual([
      expect.objectContaining({
        workItemId: "03-recipe-like",
        action: "noop",
        reason: "unsupported_wait_kind=human_review",
      }),
    ]);
  });

  it("tick --all surfaces stage_running residue even when no wait kind is present", () => {
    const rootDir = createFixture();

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        active_stage: 4,
        current_stage: 4,
        phase: "stage_running",
        next_action: "run_stage",
        wait: null,
      },
    });

    const results = tickSupervisorWorkItems({
      rootDir,
      all: true,
      now: "2026-03-27T01:00:00.000Z",
    });

    expect(results).toEqual([
      expect.objectContaining({
        workItemId: "03-recipe-like",
        action: "noop",
        reason: "no_wait_state",
      }),
    ]);
  });

  it("tick resumes merge_pending residue without an explicit wait by restoring CI wait", () => {
    const rootDir = createFixture();
    const workItemId = "03-recipe-like";
    const workspacePath = join(rootDir, ".worktrees", workItemId);
    const artifactDir = join(rootDir, ".artifacts", "stage6-merge-pending-recovery");
    const stageResultPath = join(artifactDir, "stage-result.json");

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, workItemId, {
      roadmapStatus: "merged",
      designStatus: "confirmed",
      authorityStatus: "not-required",
      uiRisk: "not-required",
      visualArtifact: "not-required",
    });

    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      stageResultPath,
      `${JSON.stringify(
        buildReviewStageResult({
          decision: "approve",
          stage: 6,
          reviewedChecklistIds: [CHECKLIST_IDS.frontendDelivery, CHECKLIST_IDS.frontendAcceptance],
          bodyMarkdown: "Stage 6 approved",
          approvedHeadSha: "old-head",
        }),
        null,
        2,
      )}\n`,
    );

    writeRuntimeState({
      rootDir,
      workItemId,
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId,
          slice: workItemId,
        }).state,
        slice: workItemId,
        active_stage: 6,
        current_stage: 6,
        last_completed_stage: 5,
        phase: "merge_pending",
        next_action: "poll_ci",
        workspace: {
          path: workspacePath,
          branch_role: "frontend",
        },
        wait: null,
        execution: {
          provider: "opencode",
          session_role: "codex_primary",
          session_id: "ses_stage6_merge_pending",
          artifact_dir: artifactDir,
          stage_result_path: stageResultPath,
          started_at: "2026-04-24T18:20:00+09:00",
          finished_at: "2026-04-24T18:21:00+09:00",
          verify_commands: [],
          verify_bucket: null,
          commit_sha: null,
          pr_role: "frontend",
          subphase: "implementation",
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 41,
            url: "https://github.com/netsus/homecook/pull/41",
            draft: false,
            branch: "feature/fe-03-recipe-like",
            head_sha: "old-head",
          },
          closeout: null,
        },
        last_review: {
          frontend: {
            decision: "approve",
            approved_head_sha: "old-head",
            body_markdown: "Stage 6 approved",
            findings: [],
            updated_at: "2026-04-24T18:21:00+09:00",
          },
        },
      },
    });

    const results = tickSupervisorWorkItems(
      {
        rootDir,
        all: true,
        now: "2026-04-24T18:25:00+09:00",
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
          assertClaudeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "feature/fe-03-recipe-like", created: false };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return "new-head";
          },
          getCurrentBranch() {
            return "feature/fe-03-recipe-like";
          },
          listChangedFiles() {
            return [];
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner() {
          throw new Error("not expected");
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            throw new Error("not expected");
          },
          getPullRequestSummary() {
            return {
              state: "OPEN",
              mergedAt: null,
              mergeStateStatus: "CLEAN",
              reviewDecision: "APPROVED",
              headRefOid: "new-head",
              headRefName: "feature/fe-03-recipe-like",
              isDraft: false,
            };
          },
          markReady() {},
          reviewPullRequest() {},
          commentPullRequest() {},
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {},
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId,
      slice: workItemId,
    }).state as {
      phase: string;
      wait: { kind: string; stage: number; pr_role: string; head_sha: string | null };
      prs: { frontend: { head_sha: string | null } | null };
    };

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      workItemId,
      wait: {
        kind: "ci",
        stage: 6,
        pr_role: "frontend",
        head_sha: "new-head",
      },
    });
    expect(runtime.phase).toBe("merge_pending");
    expect(runtime.wait).toMatchObject({
      kind: "ci",
      stage: 6,
      pr_role: "frontend",
      head_sha: "new-head",
    });
    expect(runtime.prs.frontend?.head_sha).toBe("new-head");
  });

  it("tick converts a stale Claude stage_running lock with aborted streaming logs into a retry", () => {
    const rootDir = createFixture();
    const workItemId = "03-recipe-like";
    const artifactDir = join(rootDir, ".artifacts", "stage3-stale-abort");
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      join(artifactDir, "claude.stdout.log"),
      `${JSON.stringify({
        type: "result",
        subtype: "error_during_execution",
        terminal_reason: "aborted_streaming",
        errors: [
          "Error: Request was aborted.",
          "Error: Compaction interrupted · This may be due to network issues — please try again.",
        ],
      })}\n`,
    );
    writeFileSync(join(artifactDir, "claude.stderr.log"), "");

    writeRuntimeState({
      rootDir,
      workItemId,
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId,
          slice: workItemId,
        }).state,
        slice: workItemId,
        active_stage: 3,
        current_stage: 3,
        workspace: {
          path: join(rootDir, ".worktrees", workItemId),
          branch_role: "backend",
        },
        phase: "stage_running",
        next_action: "run_stage",
        lock: {
          owner: "omo-supervisor-1012",
          acquired_at: "2026-04-18T13:55:16.228Z",
        },
        execution: {
          provider: "claude-cli",
          session_role: "claude_primary",
          session_id: "ses_claude_stage3",
          artifact_dir: artifactDir,
          stage_result_path: join(artifactDir, "stage-result.json"),
          started_at: "2026-04-18T13:55:17.010Z",
          finished_at: null,
          verify_commands: [],
          verify_bucket: null,
          commit_sha: null,
          pr_role: "backend",
          subphase: "implementation",
        },
      },
    });

    const results = tickSupervisorWorkItems(
      {
        rootDir,
        workItemId,
        now: "2026-04-19T00:10:00.000Z",
      },
      {
        supervise(args: { workItemId: string }) {
          const runtime = readRuntimeState({ rootDir, workItemId, slice: workItemId }).state;
          return {
            workItemId: args.workItemId,
            slice: workItemId,
            wait: runtime.wait,
            runtime,
            artifactDir,
            transitions: [],
          };
        },
      },
    );

    expect(results[0]).toEqual(
      expect.objectContaining({
        workItemId,
      }),
    );
    const runtime = readRuntimeState({ rootDir, workItemId, slice: workItemId }).state as {
      lock: null;
      wait: { kind: string; stage: number };
      retry: { reason: string; at: string | null };
      recovery: { kind: string; reason: string } | null;
    };
    expect(runtime.lock).toBeNull();
    expect(runtime.wait).toMatchObject({
      kind: "blocked_retry",
      stage: 3,
    });
    expect(runtime.retry?.reason).toBe("claude_budget_unavailable");
    expect(runtime.recovery?.kind).toBe("partial_stage_failure");
  });

  it("tick resumes a github auth escalation after auth is restored", () => {
    const rootDir = createFixture();
    const workItemId = "03-recipe-like";
    let resumed = false;

    writeRuntimeState({
      rootDir,
      workItemId,
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId,
          slice: workItemId,
        }).state,
        slice: workItemId,
        active_stage: 3,
        current_stage: 3,
        last_completed_stage: 2,
        wait: {
          kind: "human_escalation",
          reason:
            "github.com\n  X Failed to log in to github.com account netsus (default)\n  - Active account: true\n  - The token in default is invalid.\n  - To re-authenticate, run: gh auth login -h github.com",
        },
      },
    });

    const results = tickSupervisorWorkItems(
      {
        rootDir,
        workItemId,
        now: "2026-04-19T01:20:00.000Z",
      },
      {
        supervise(args: { workItemId: string }) {
          resumed = true;
          return {
            workItemId: args.workItemId,
            slice: workItemId,
            wait: { kind: "blocked_retry", stage: 3, pr_role: "backend" },
            runtime: readRuntimeState({ rootDir, workItemId, slice: workItemId }).state,
            artifactDir: join(rootDir, ".artifacts", "tick-gh-auth-resume"),
            transitions: [],
          };
        },
      },
    );

    expect(resumed).toBe(true);
    expect(results[0]).toEqual(
      expect.objectContaining({
        workItemId,
      }),
    );
  });

  it("tick resumes a recoverable pr-check failure escalation when persisted stage results still exist", () => {
    const rootDir = createFixture();
    const workItemId = "03-recipe-like";
    const workspacePath = join(rootDir, ".worktrees", workItemId);
    const artifactDir = join(rootDir, ".artifacts", "tick-pr-check-failure-resume");
    const stageResultPath = join(artifactDir, "stage-result.json");
    let resumed = false;

    createGitWorkspace(workspacePath, `docs/${workItemId}`);
    seedWorktreeBookkeeping(workspacePath, workItemId, {
      roadmapStatus: "docs",
      designStatus: "temporary",
    });
    writeFileSync(
      join(workspacePath, "docs", "workpacks", workItemId, "automation-spec.json"),
      JSON.stringify(
        {
          slice_id: workItemId,
          execution_mode: "autonomous",
        },
        null,
        2,
      ),
    );
    upsertWorktreeStatusItem(workspacePath, workItemId, {
      lifecycle: "ready_for_review",
      approval_state: "claude_approved",
      verification_status: "pending",
    });
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      stageResultPath,
      `${JSON.stringify(
        buildCodeStageResult({
          summary: "Stage 1 docs complete",
          subject: "docs: complete stage1 workpack",
          title: "docs: complete stage1 workpack",
          checklistUpdates: [],
          changedFiles: [
            `docs/workpacks/${workItemId}/README.md`,
            `docs/workpacks/${workItemId}/acceptance.md`,
          ],
        }),
        null,
        2,
      )}\n`,
    );

    writeRuntimeState({
      rootDir,
      workItemId,
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId,
          slice: workItemId,
        }).state,
        slice: workItemId,
        active_stage: 1,
        current_stage: 1,
        phase: "escalated",
        next_action: "noop",
        workspace: {
          path: workspacePath,
          branch_role: "docs",
        },
        last_artifact_dir: artifactDir,
        execution: {
          provider: "claude-cli",
          session_role: "claude_primary",
          session_id: "ses_docs_recovery",
          artifact_dir: artifactDir,
          stage_result_path: stageResultPath,
          started_at: "2026-04-20T13:00:00+09:00",
          finished_at: "2026-04-20T13:01:00+09:00",
          verify_commands: [],
          verify_bucket: null,
          commit_sha: "docs123",
          pr_role: "docs",
        },
        prs: {
          docs: {
            number: 41,
            url: "https://github.com/netsus/homecook/pull/41",
            draft: false,
            branch: `docs/${workItemId}`,
            head_sha: "docs123",
          },
          backend: null,
          frontend: null,
          closeout: null,
        },
        wait: {
          kind: "human_escalation",
          reason: "PR checks failed.",
          updated_at: "2026-04-20T13:02:00+09:00",
        },
        recovery: {
          kind: "partial_stage_failure",
          stage: 1,
          reason: "PR checks failed.",
          artifact_dir: artifactDir,
          existing_pr: {
            role: "docs",
            number: 41,
            url: "https://github.com/netsus/homecook/pull/41",
            draft: false,
            branch: `docs/${workItemId}`,
            head_sha: "docs123",
          },
          session_role: "claude_primary",
          session_id: "ses_docs_recovery",
        },
      },
    });

    const results = tickSupervisorWorkItems(
      {
        rootDir,
        workItemId,
        now: "2026-04-20T13:05:00.000Z",
      },
      {
        supervise(args: { workItemId: string }) {
          resumed = true;
          return {
            workItemId: args.workItemId,
            slice: workItemId,
            wait: { kind: "ci", stage: 1, pr_role: "docs" },
            runtime: readRuntimeState({ rootDir, workItemId, slice: workItemId }).state,
            artifactDir: join(rootDir, ".artifacts", "tick-pr-check-failure-supervise"),
            transitions: [],
          };
        },
      },
    );

    expect(resumed).toBe(true);
    expect(results[0]).toEqual(
      expect.objectContaining({
        workItemId,
      }),
    );
  });

  it("tick resumes a pending_recheck doc gate escalation after parser-compatible docs changes", () => {
    const rootDir = createFixture();
    let resumed = false;

    writeRuntimeState({
      rootDir,
      workItemId: "07-meal-manage",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "07-meal-manage",
          slice: "07-meal-manage",
        }).state,
        slice: "07-meal-manage",
        active_stage: 2,
        current_stage: 2,
        workspace: {
          path: join(rootDir, ".worktrees", "07-meal-manage"),
          branch_role: "docs",
        },
        wait: {
          kind: "human_escalation",
          reason: "Merged Stage 1 docs failed doc gate recheck: README Design Authority visual artifact plan is missing.",
        },
        recovery: {
          kind: "partial_stage_failure",
          stage: 2,
          reason: "Merged Stage 1 docs failed doc gate recheck: README Design Authority visual artifact plan is missing.",
          existing_pr: {
            role: "docs",
            url: "https://github.com/netsus/homecook/pull/150",
            branch: "docs/07-meal-manage",
            head_sha: "docs123",
          },
        },
        prs: {
          docs: {
            number: 150,
            url: "https://github.com/netsus/homecook/pull/150",
            draft: false,
            branch: "docs/07-meal-manage",
            head_sha: "docs123",
          },
          backend: null,
          frontend: null,
          closeout: null,
        },
        doc_gate: {
          status: "pending_recheck",
          round: 1,
        },
      },
    });

    const results = tickSupervisorWorkItems(
      {
        rootDir,
        workItemId: "07-meal-manage",
        now: "2026-04-18T11:10:00.000Z",
      },
      {
        supervise() {
          resumed = true;
          return {
            workItemId: "07-meal-manage",
            slice: "07-meal-manage",
            wait: { kind: "ready_for_next_stage", stage: 2, pr_role: "docs" },
            runtime: readRuntimeState({ rootDir, workItemId: "07-meal-manage", slice: "07-meal-manage" }).state,
            artifactDir: join(rootDir, ".artifacts", "tick-recheck-resume"),
            transitions: [],
          };
        },
      },
    );

    expect(resumed).toBe(true);
    expect(results[0]).toEqual(
      expect.objectContaining({
        workItemId: "07-meal-manage",
      }),
    );
  });

  it("tick resumes an escalated post-doc-gate bookkeeping residue without an explicit wait kind", () => {
    const rootDir = createFixture();
    let resumed = false;

    writeRuntimeState({
      rootDir,
      workItemId: "07-meal-manage",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "07-meal-manage",
          slice: "07-meal-manage",
        }).state,
        slice: "07-meal-manage",
        active_stage: 2,
        current_stage: 2,
        blocked_stage: 2,
        phase: "escalated",
        next_action: "noop",
        wait: null,
        recovery: {
          kind: "dirty_worktree",
          stage: 2,
          reason: "Docs gate bookkeeping drift is limited to tracked workflow-v2 files. Resume continues on the existing docs PR.",
          changed_files: [".workflow-v2/status.json"],
          existing_pr: {
            role: "docs",
            url: "https://github.com/netsus/homecook/pull/150",
            branch: "docs/07-meal-manage",
            head_sha: "docs123",
          },
        },
        doc_gate: {
          status: "passed",
          round: 1,
        },
      },
    });

    const results = tickSupervisorWorkItems(
      {
        rootDir,
        workItemId: "07-meal-manage",
        now: "2026-04-18T12:00:00.000Z",
      },
      {
        supervise() {
          resumed = true;
          return {
            workItemId: "07-meal-manage",
            slice: "07-meal-manage",
            wait: { kind: "blocked_retry", stage: 2, pr_role: "backend" },
            runtime: readRuntimeState({ rootDir, workItemId: "07-meal-manage", slice: "07-meal-manage" }).state,
            artifactDir: join(rootDir, ".artifacts", "tick-escalated-doc-gate-residue"),
            transitions: [],
          };
        },
      },
    );

    expect(resumed).toBe(true);
    expect(results[0]).toEqual(
      expect.objectContaining({
        workItemId: "07-meal-manage",
      }),
    );
  });

  it("records blocked_retry when Stage 1 schedules a Claude retry", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T00:50:00+09:00",
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            mkdirSync(workspacePath, { recursive: true });
            return { path: workspacePath, created: true };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "docs/03-recipe-like" };
          },
          pushBranch() {
            throw new Error("not expected");
          },
          syncBaseBranch() {
            throw new Error("not expected");
          },
          getHeadSha() {
            return "docs123";
          },
        },
        stageRunner() {
          const runtimeSync = writeRuntimeState({
            rootDir,
            workItemId: "03-recipe-like",
            state: {
              ...readRuntimeState({
                rootDir,
                workItemId: "03-recipe-like",
                slice: "03-recipe-like",
              }).state,
              slice: "03-recipe-like",
              current_stage: 1,
              last_completed_stage: 0,
              blocked_stage: 1,
              retry: {
                at: "2026-03-27T01:10:00.000Z",
                reason: "claude_budget_unavailable",
                attempt_count: 1,
                max_attempts: 3,
              },
              sessions: {
                claude_primary: {
                  session_id: "ses_claude_docs",
                  agent: "athena",
                  updated_at: "2026-03-26T15:50:00.000Z",
                },
                codex_primary: {
                  session_id: null,
                  agent: "hephaestus",
                  updated_at: null,
                },
              },
              workspace: {
                path: workspacePath,
                branch_role: "docs",
                updated_at: "2026-03-26T15:50:00.000Z",
              },
            },
          });

          return {
            artifactDir: join(rootDir, ".artifacts", "stage1"),
            dispatch: { actor: "claude", stage: 1 },
            execution: {
              mode: "scheduled-retry",
              executed: false,
              sessionId: "ses_claude_docs",
              reason: "claude_budget_unavailable",
            },
            runtimeSync,
            stageResult: null,
          };
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            throw new Error("not expected");
          },
          markReady() {
            throw new Error("not expected");
          },
          reviewPullRequest() {
            throw new Error("not expected");
          },
          commentPullRequest() {
            throw new Error("not expected");
          },
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {
            throw new Error("not expected");
          },
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      slice: "03-recipe-like",
    }).state as {
      retry: { at: string | null };
      wait: {
        kind: string;
        pr_role: string | null;
        stage: number | null;
        reason: string | null;
        until: string | null;
      };
    };

    expect(result.wait?.kind).toBe("blocked_retry");
    expect(runtime.retry.at).toBe("2026-03-27T01:10:00.000Z");
    expect(runtime.wait).toMatchObject({
      kind: "blocked_retry",
      pr_role: "docs",
      stage: 1,
      reason: "claude_budget_unavailable",
      until: "2026-03-27T01:10:00.000Z",
    });
  });

  it("does not require OpenCode auth before a Claude Stage 1 run", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T00:30:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {
            throw new Error("should not be called");
          },
          assertClaudeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            mkdirSync(workspacePath, { recursive: true });
            return { path: workspacePath, created: true };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "docs/03-recipe-like" };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return "docs123";
          },
          getCurrentBranch() {
            return "docs/03-recipe-like";
          },
          listChangedFiles() {
            return [];
          },
        },
        stageRunner() {
          mkdirSync(join(workspacePath, "docs", "workpacks", "03-recipe-like"), { recursive: true });
          writeFileSync(
            join(workspacePath, "docs", "workpacks", "README.md"),
            [
              "# Workpack Roadmap v2",
              "",
              "## Slice Order",
              "",
              "| Slice | Status | Goal |",
              "| --- | --- | --- |",
              "| `03-recipe-like` | docs | test slice |",
            ].join("\n"),
          );
          writeFileSync(
            join(workspacePath, "docs", "workpacks", "03-recipe-like", "README.md"),
            buildWorkpackReadme({
              workItemId: "03-recipe-like",
            }),
          );
          writeFileSync(
            join(workspacePath, "docs", "workpacks", "03-recipe-like", "acceptance.md"),
            buildAcceptance({
              workItemId: "03-recipe-like",
            }),
          );
          writeFileSync(
            join(workspacePath, "docs", "workpacks", "03-recipe-like", "automation-spec.json"),
            JSON.stringify(
              {
                slice_id: "03-recipe-like",
                execution_mode: "autonomous",
              },
              null,
              2,
            ),
          );
          upsertWorktreeStatusItem(workspacePath, "03-recipe-like", {
            lifecycle: "ready_for_review",
            approval_state: "claude_approved",
            verification_status: "pending",
          });
          return {
            artifactDir: join(rootDir, ".artifacts", "stage1"),
            dispatch: { actor: "claude", stage: 1 },
            execution: { mode: "execute", executed: true, sessionId: "ses_claude" },
            stageResult: {
              result: "done",
              summary_markdown: "Stage 1 docs complete",
              commit: {
                subject: "docs: lock slice docs",
              },
              pr: {
                title: "docs: lock slice docs",
                body_markdown: "## Summary\n- docs",
              },
              checks_run: [],
              next_route: "open_pr",
              claimed_scope: {
                files: [
                  "docs/workpacks/README.md",
                  "docs/workpacks/03-recipe-like/README.md",
                  "docs/workpacks/03-recipe-like/acceptance.md",
                  "docs/workpacks/03-recipe-like/automation-spec.json",
                ],
                endpoints: [],
                routes: [],
                states: [],
                invariants: [],
              },
              changed_files: [
                "docs/workpacks/README.md",
                "docs/workpacks/03-recipe-like/README.md",
                "docs/workpacks/03-recipe-like/acceptance.md",
                "docs/workpacks/03-recipe-like/automation-spec.json",
              ],
              tests_touched: [],
              artifacts_written: [],
              checklist_updates: [],
            },
          };
        },
        github: {
          createPullRequest() {
            return { number: 34, url: "https://github.com/netsus/homecook/pull/34", draft: false };
          },
          getRequiredChecks() {
            return { bucket: "pending", checks: [] };
          },
          markReady() {},
          reviewPullRequest() {},
          commentPullRequest() {},
          mergePullRequest() {
            return { merged: true };
          },
          updateBranch() {},
        },
      },
    );

    expect(result.wait?.kind).toBe("ci");
  });

  it("fails closed before Stage 2 when OpenCode auth is unavailable", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        current_stage: 1,
        last_completed_stage: 1,
        wait: {
          kind: "ready_for_next_stage",
          stage: 2,
          pr_role: "docs",
          head_sha: "docs123",
        },
        workspace: {
          path: workspacePath,
          branch_role: "docs",
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T00:35:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {
            throw new Error("OpenCode auth is not configured for this machine.");
          },
          assertClaudeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            mkdirSync(workspacePath, { recursive: true });
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "feature/fe-06-recipe-to-planner", created: false };
          },
          pushBranch() {
            throw new Error("not expected");
          },
          syncBaseBranch() {
            throw new Error("not expected");
          },
          getHeadSha() {
            return "be123";
          },
          getCurrentBranch() {
            return "master";
          },
          listChangedFiles() {
            return [];
          },
        },
      },
    );

    expect(result.wait).toMatchObject({
      kind: "human_escalation",
      reason: "OpenCode auth is not configured for this machine.",
    });
  });

  it("fails closed before a Claude stage when Claude CLI preflight fails", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T00:40:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
          assertClaudeAuth() {
            throw new Error("Claude CLI is unavailable: login required");
          },
        },
        worktree: {
          ensureWorktree() {
            mkdirSync(workspacePath, { recursive: true });
            return { path: workspacePath, created: true };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "feature/fe-06-recipe-to-planner", created: false };
          },
          pushBranch() {
            throw new Error("not expected");
          },
          syncBaseBranch() {
            throw new Error("not expected");
          },
          getHeadSha() {
            return "docs123";
          },
          getCurrentBranch() {
            return "master";
          },
          listChangedFiles() {
            return [];
          },
        },
      },
    );

    expect(result.wait).toMatchObject({
      kind: "human_escalation",
      reason: "Claude CLI is unavailable: login required",
    });
  });

  it("records blocked_retry when a Claude review stage schedules a retry", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "in-progress",
    });

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        current_stage: 2,
        last_completed_stage: 2,
        workspace: {
          path: workspacePath,
          branch_role: "backend",
          updated_at: "2026-03-26T15:55:00.000Z",
        },
        prs: {
          docs: null,
          backend: {
            number: 35,
            url: "https://github.com/netsus/homecook/pull/35",
            draft: false,
            branch: "feature/be-03-recipe-like",
            head_sha: "be123",
            updated_at: "2026-03-26T15:55:00.000Z",
          },
          frontend: null,
        },
        wait: {
          kind: "ready_for_next_stage",
          pr_role: "backend",
          stage: 3,
          head_sha: "be123",
          reason: null,
          until: null,
          updated_at: "2026-03-26T15:55:00.000Z",
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T01:00:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            mkdirSync(workspacePath, { recursive: true });
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "feature/be-03-recipe-like" };
          },
          pushBranch() {
            throw new Error("not expected");
          },
          syncBaseBranch() {
            throw new Error("not expected");
          },
          getHeadSha() {
            return "be123";
          },
        },
        stageRunner() {
          const runtimeSync = writeRuntimeState({
            rootDir,
            workItemId: "03-recipe-like",
            state: {
              ...readRuntimeState({
                rootDir,
                workItemId: "03-recipe-like",
                slice: "03-recipe-like",
              }).state,
              slice: "03-recipe-like",
              current_stage: 3,
              last_completed_stage: 2,
              blocked_stage: 3,
              retry: {
                at: "2026-03-27T02:00:00.000Z",
                reason: "claude_budget_unavailable",
                attempt_count: 1,
                max_attempts: 3,
              },
              sessions: {
                claude_primary: {
                  session_id: "ses_claude_review",
                  agent: "athena",
                  updated_at: "2026-03-26T16:00:00.000Z",
                },
                codex_primary: {
                  session_id: "ses_codex_backend",
                  agent: "hephaestus",
                  updated_at: "2026-03-26T15:40:00.000Z",
                },
              },
            },
          });

          return {
            artifactDir: join(rootDir, ".artifacts", "stage3"),
            dispatch: { actor: "claude", stage: 3 },
            execution: {
              mode: "scheduled-retry",
              executed: false,
              sessionId: "ses_claude_review",
              reason: "claude_budget_unavailable",
            },
            runtimeSync,
            stageResult: null,
          };
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            throw new Error("not expected");
          },
          markReady() {
            throw new Error("not expected");
          },
          reviewPullRequest() {
            throw new Error("not expected");
          },
          commentPullRequest() {
            throw new Error("not expected");
          },
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {
            throw new Error("not expected");
          },
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      slice: "03-recipe-like",
    }).state as {
      wait: {
        kind: string;
        pr_role: string | null;
        stage: number | null;
        head_sha: string | null;
        until: string | null;
      };
      last_review: {
        backend: { decision: string | null } | null;
      };
    };

    expect(result.wait?.kind).toBe("blocked_retry");
    expect(runtime.wait).toMatchObject({
      kind: "blocked_retry",
      pr_role: "backend",
      stage: 3,
      head_sha: "be123",
      until: "2026-03-27T02:00:00.000Z",
    });
    expect(runtime.last_review.backend).toBeNull();
  });

  it("fails closed when a stage finishes without a structured stage result", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T01:05:00+09:00",
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            mkdirSync(workspacePath, { recursive: true });
            return { path: workspacePath, created: true };
          },
          assertClean() {},
          checkoutBranch({ branch }: { branch: string }) {
            return { branch };
          },
          pushBranch() {
            throw new Error("not expected");
          },
          syncBaseBranch() {
            throw new Error("not expected");
          },
          getHeadSha() {
            return "docs123";
          },
          getCurrentBranch() {
            return "docs/03-recipe-like";
          },
          listChangedFiles() {
            return ["docs/workpacks/03-recipe-like/README.md"];
          },
          getBinaryDiff() {
            return "diff --git a/docs/workpacks/03-recipe-like/README.md b/docs/workpacks/03-recipe-like/README.md\n";
          },
        },
        stageRunner() {
          const runtimeSync = writeRuntimeState({
            rootDir,
            workItemId: "03-recipe-like",
            state: {
              ...readRuntimeState({
                rootDir,
                workItemId: "03-recipe-like",
                slice: "03-recipe-like",
              }).state,
              slice: "03-recipe-like",
              current_stage: 1,
              last_completed_stage: 0,
              blocked_stage: 1,
              retry: {
                at: null,
                reason: "contract_violation",
                attempt_count: 1,
                max_attempts: 3,
              },
              sessions: {
                claude_primary: {
                  session_id: "ses_claude_docs",
                  provider: "claude-cli",
                  agent: "athena",
                  updated_at: "2026-03-27T01:05:00.000Z",
                },
                codex_primary: {
                  session_id: null,
                  provider: null,
                  agent: "hephaestus",
                  updated_at: null,
                },
              },
              workspace: {
                path: workspacePath,
                branch_role: "docs",
                updated_at: "2026-03-27T01:05:00.000Z",
              },
            },
          });

          return {
            artifactDir: join(rootDir, ".artifacts", "stage1-contract-violation"),
            dispatch: { actor: "claude", stage: 1 },
            execution: {
              mode: "contract-violation",
              executed: true,
              provider: "claude-cli",
              sessionId: "ses_claude_docs",
              reason: "claude CLI did not write stage-result.json; permission denied for Bash, Write.",
            },
            runtimeSync,
            stageResult: null,
          };
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            throw new Error("not expected");
          },
          markReady() {
            throw new Error("not expected");
          },
          reviewPullRequest() {
            throw new Error("not expected");
          },
          commentPullRequest() {
            throw new Error("not expected");
          },
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {
            throw new Error("not expected");
          },
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      slice: "03-recipe-like",
    }).state as {
      wait: { kind: string; reason: string; stage: number | null };
      retry: { reason: string | null };
      recovery: {
        kind: string;
        changed_files: string[];
        salvage_candidate: boolean;
        branch: string | null;
      } | null;
    };

    expect(result.wait?.kind).toBe("human_escalation");
    expect(runtime.wait).toMatchObject({
      kind: "human_escalation",
      stage: 1,
    });
    expect(runtime.wait.reason).toContain("stage-result.json");
    expect(runtime.retry?.reason).toBe("contract_violation");
    expect(runtime.recovery).toMatchObject({
      kind: "partial_stage_failure",
      branch: "docs/03-recipe-like",
      changed_files: ["docs/workpacks/03-recipe-like/README.md"],
      salvage_candidate: true,
    });
    expect(existsSync(join(result.artifactDir, "recovery.json"))).toBe(true);
    expect(existsSync(join(result.artifactDir, "recovery.changed-files.txt"))).toBe(true);
    expect(readFileSync(join(result.artifactDir, "recovery.patch"), "utf8")).toContain(
      "diff --git a/docs/workpacks/03-recipe-like/README.md",
    );
  });

  it("uses claude_primary as the recovery fallback for Stage 4 implementation drift", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "in-progress",
      designStatus: "temporary",
    });
    writeFileSync(join(workspacePath, "app-stage4-note.txt"), "stage4 drift updated\n");

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({ rootDir, workItemId: "03-recipe-like", slice: "03-recipe-like" }).state,
        slice: "03-recipe-like",
        active_stage: 4,
        current_stage: 4,
        workspace: { path: workspacePath, branch_role: "frontend" },
        phase: "executing",
        next_action: "run_stage",
        execution: {
          provider: "claude-cli",
          session_role: null,
          session_id: "ses_claude_stage4_recovery",
          artifact_dir: null,
          stage_result_path: null,
          started_at: "2026-04-11T13:10:00+09:00",
          finished_at: null,
          verify_commands: [],
          verify_bucket: null,
          commit_sha: null,
          pr_role: "frontend",
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: true,
            branch: "feature/fe-03-recipe-like",
            head_sha: "abc123",
          },
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-04-11T13:12:00+09:00",
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
          assertClaudeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {
            throw new Error("Stage 4 worktree is dirty.");
          },
          checkoutBranch() {
            return { branch: "feature/fe-03-recipe-like" };
          },
          pushBranch() {
            throw new Error("not expected");
          },
          syncBaseBranch() {},
          getHeadSha() {
            return "abc123";
          },
          getCurrentBranch() {
            return "feature/fe-03-recipe-like";
          },
          listChangedFiles() {
            return ["app-stage4-note.txt"];
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner() {
          throw new Error("not expected");
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            return { bucket: "pass", checks: [] };
          },
          markReady() {},
          reviewPullRequest() {},
          commentPullRequest() {},
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {},
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      slice: "03-recipe-like",
    }).state as {
      recovery: { kind: string; session_role: string | null; session_id: string | null } | null;
      wait: { kind: string; stage: number | null; pr_role: string | null; head_sha: string | null; reason: string };
    };

    expect(result.wait?.kind).toBe("human_escalation");
    expect(runtime.wait.stage).toBe(4);
    expect(runtime.wait.pr_role).toBe("frontend");
    expect(runtime.wait.head_sha).toBe("abc123");
    expect(runtime.wait.reason).toContain("Stage 4 worktree is dirty.");
    expect(runtime.recovery).toMatchObject({
      kind: "dirty_worktree",
      session_role: "claude_primary",
      session_id: "ses_claude_stage4_recovery",
    });
  });

  it("fails closed when the dedicated worktree is dirty", () => {
    const rootDir = createFixture();

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T00:50:00+09:00",
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: join(rootDir, ".worktrees", "03-recipe-like"), created: false };
          },
          assertClean() {
            throw new Error("Worktree is dirty.");
          },
          checkoutBranch() {
            throw new Error("not expected");
          },
          pushBranch() {
            throw new Error("not expected");
          },
          syncBaseBranch() {
            throw new Error("not expected");
          },
          getHeadSha() {
            return "abc123";
          },
          getCurrentBranch() {
            return "feature/fe-03-recipe-like";
          },
          listChangedFiles() {
            return ["components/recipe/save-modal.tsx"];
          },
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      slice: "03-recipe-like",
    }).state as {
      wait: { kind: string; reason: string };
      recovery: { kind: string; changed_files: string[]; salvage_candidate: boolean } | null;
    };

    expect(result.wait?.kind).toBe("human_escalation");
    expect(runtime.wait).toMatchObject({
      kind: "human_escalation",
      reason: "Worktree is dirty.",
    });
    expect(runtime.recovery).toMatchObject({
      kind: "dirty_worktree",
      changed_files: ["components/recipe/save-modal.tsx"],
      salvage_candidate: true,
    });
  });

  it("resumes a Claude Stage 1 retry when dirty files are stage-owned docs outputs", () => {
    const rootDir = createFixture();
    const workItemId = "03-recipe-like";
    const workspacePath = join(rootDir, ".worktrees", workItemId);
    let stageRunnerCalled = false;

    createGitWorkspace(workspacePath, `docs/${workItemId}`);
    seedWorktreeBookkeeping(workspacePath, workItemId, {
      roadmapStatus: "planned",
    });

    writeRuntimeState({
      rootDir,
      workItemId,
      state: {
        ...readRuntimeState({ rootDir, workItemId, slice: workItemId }).state,
        slice: workItemId,
        active_stage: 1,
        current_stage: 1,
        blocked_stage: 1,
        workspace: {
          path: workspacePath,
          branch_role: "docs",
        },
        retry: {
          at: "2026-04-18T00:00:00.000Z",
          reason: "claude_budget_unavailable",
          attempt_count: 1,
          max_attempts: 3,
        },
        wait: {
          kind: "blocked_retry",
          pr_role: "docs",
          stage: 1,
          reason: "claude_budget_unavailable",
          until: "2026-04-18T00:00:00.000Z",
        },
        sessions: {
          claude_primary: {
            session_id: "ses_claude_docs",
            provider: "claude-cli",
            agent: "athena",
            updated_at: "2026-04-18T00:00:00.000Z",
          },
          codex_primary: {
            session_id: null,
            provider: null,
            agent: "hephaestus",
            updated_at: null,
          },
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId,
        now: "2026-04-18T00:10:00.000Z",
        maxTransitions: 2,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {
            throw new Error("Worktree is dirty.");
          },
          checkoutBranch({ branch }: { branch: string }) {
            return { branch };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return "docs123";
          },
          getCurrentBranch() {
            return `docs/${workItemId}`;
          },
          listChangedFiles() {
            return [
              "docs/workpacks/README.md",
              `docs/workpacks/${workItemId}/README.md`,
              `docs/workpacks/${workItemId}/acceptance.md`,
              `docs/workpacks/${workItemId}/automation-spec.json`,
            ];
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner() {
          stageRunnerCalled = true;
          const runtimeSync = writeRuntimeState({
            rootDir,
            workItemId,
            state: {
              ...readRuntimeState({ rootDir, workItemId, slice: workItemId }).state,
              slice: workItemId,
              current_stage: 1,
              blocked_stage: 1,
              retry: {
                at: "2026-04-18T01:10:00.000Z",
                reason: "claude_budget_unavailable",
                attempt_count: 2,
                max_attempts: 3,
              },
            },
          });
          return {
            artifactDir: join(rootDir, ".artifacts", "stage1-retry-dirty"),
            dispatch: { actor: "claude", stage: 1 },
            execution: {
              mode: "scheduled-retry",
              executed: false,
              sessionId: "ses_claude_docs",
              reason: "claude_budget_unavailable",
            },
            runtimeSync,
            stageResult: null,
          };
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            throw new Error("not expected");
          },
          markReady() {},
          reviewPullRequest() {},
          commentPullRequest() {},
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {},
        },
      },
    );

    expect(stageRunnerCalled).toBe(true);
    expect(result.wait?.kind).toBe("blocked_retry");
  });

  it("tick resumes a Claude dirty-worktree escalation when the retry is due", () => {
    const rootDir = createFixture();
    const workItemId = "03-recipe-like";
    const workspacePath = join(rootDir, ".worktrees", workItemId);
    let resumed = false;

    writeRuntimeState({
      rootDir,
      workItemId,
      state: {
        ...readRuntimeState({ rootDir, workItemId, slice: workItemId }).state,
        slice: workItemId,
        active_stage: 1,
        current_stage: 1,
        blocked_stage: 1,
        workspace: {
          path: workspacePath,
          branch_role: "docs",
        },
        retry: {
          at: "2026-04-18T00:00:00.000Z",
          reason: "claude_budget_unavailable",
          attempt_count: 1,
          max_attempts: 3,
        },
        wait: {
          kind: "human_escalation",
          stage: 1,
          pr_role: "docs",
          reason: "Worktree is dirty.",
        },
        recovery: {
          kind: "dirty_worktree",
          stage: 1,
          branch: `docs/${workItemId}`,
          reason: "Worktree is dirty.",
          artifact_dir: join(rootDir, ".artifacts", "stage1-dirty"),
          changed_files: [
            "docs/workpacks/README.md",
            `docs/workpacks/${workItemId}/README.md`,
            `docs/workpacks/${workItemId}/acceptance.md`,
            `docs/workpacks/${workItemId}/automation-spec.json`,
          ],
          existing_pr: null,
          salvage_candidate: true,
          session_role: "claude_primary",
          session_provider: "claude-cli",
          session_id: "ses_claude_docs",
        },
        sessions: {
          claude_primary: {
            session_id: "ses_claude_docs",
            provider: "claude-cli",
            agent: "athena",
            updated_at: "2026-04-18T00:00:00.000Z",
          },
          codex_primary: {
            session_id: null,
            provider: null,
            agent: "hephaestus",
            updated_at: null,
          },
        },
      },
    });

    const results = tickSupervisorWorkItems(
      {
        rootDir,
        workItemId,
        now: "2026-04-18T00:10:00.000Z",
      },
      {
        supervise() {
          resumed = true;
          return {
            workItemId,
            slice: workItemId,
            wait: { kind: "blocked_retry" },
            runtime: readRuntimeState({ rootDir, workItemId, slice: workItemId }).state,
            artifactDir: join(rootDir, ".artifacts", "tick-resume"),
            transitions: [],
          };
        },
      },
    );

    expect(resumed).toBe(true);
    expect(results[0]?.workItemId).toBe(workItemId);
  });

  it("resumes Stage 2 docs gate when only workflow bookkeeping files are dirty", () => {
    const rootDir = createFixture();
    const workItemId = "03-recipe-like";
    const workspacePath = join(rootDir, ".worktrees", workItemId);
    const docFindingId = "doc-gate-missing-goal";
    const artifactDir = join(rootDir, ".artifacts", "doc-gate-dirty-resume");
    let observedSubphase: string | null = null;

    createGitWorkspace(workspacePath, `docs/${workItemId}`);
    seedWorktreeBookkeeping(workspacePath, workItemId, {
      roadmapStatus: "docs",
    });
    writeRuntimeState({
      rootDir,
      workItemId,
      state: {
        ...readRuntimeState({ rootDir, workItemId, slice: workItemId }).state,
        slice: workItemId,
        active_stage: 2,
        current_stage: 2,
        blocked_stage: 2,
        workspace: {
          path: workspacePath,
          branch_role: "docs",
        },
        wait: {
          kind: "human_escalation",
          stage: 2,
          pr_role: "docs",
          reason: "Worktree is dirty.",
        },
        recovery: {
          kind: "dirty_worktree",
          stage: 2,
          branch: `docs/${workItemId}`,
          reason: "Worktree is dirty.",
          artifact_dir: artifactDir,
          changed_files: [
            ".workflow-v2/status.json",
            `.workflow-v2/work-items/${workItemId}.json`,
          ],
          existing_pr: {
            role: "docs",
            number: 77,
            url: "https://github.com/netsus/homecook/pull/77",
            draft: false,
            branch: `docs/${workItemId}`,
            head_sha: "docs123",
          },
          salvage_candidate: true,
          session_role: "codex_primary",
          session_provider: null,
          session_id: null,
        },
        prs: {
          docs: {
            number: 77,
            url: "https://github.com/netsus/homecook/pull/77",
            draft: false,
            branch: `docs/${workItemId}`,
            head_sha: "docs123",
          },
          backend: null,
          frontend: null,
          closeout: null,
        },
        doc_gate: {
          status: "awaiting_review",
          round: 0,
          repair_branch: `docs/${workItemId}`,
          findings: [buildDocGateFinding(docFindingId)],
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId,
        now: "2026-04-18T10:00:00.000Z",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {
            throw new Error("assertClean should be skipped for docs-gate bookkeeping drift");
          },
          checkoutBranch({ branch }: { branch: string }) {
            return { branch };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return "docs123";
          },
          getCurrentBranch() {
            return `docs/${workItemId}`;
          },
          listChangedFiles() {
            return [
              ".workflow-v2/status.json",
              `.workflow-v2/work-items/${workItemId}.json`,
            ];
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner({ subphase }: { subphase?: string | null }) {
          observedSubphase = subphase ?? null;
          mkdirSync(artifactDir, { recursive: true });
          writeFileSync(
            join(artifactDir, "stage-result.json"),
            `${JSON.stringify(
              buildDocGateReviewStageResult({
                decision: "request_changes",
                reviewedDocFindingIds: [docFindingId],
                requiredDocFixIds: [docFindingId],
                bodyMarkdown: "Tighten the Stage 1 docs before approval.",
              }),
              null,
              2,
            )}\n`,
          );
          const runtimeSync = writeRuntimeState({
            rootDir,
            workItemId,
            state: {
              ...readRuntimeState({ rootDir, workItemId, slice: workItemId }).state,
              slice: workItemId,
              active_stage: 2,
              current_stage: 2,
              blocked_stage: 2,
              workspace: {
                path: workspacePath,
                branch_role: "docs",
              },
              phase: "review_pending",
              next_action: "run_review",
              last_artifact_dir: artifactDir,
              sessions: {
                claude_primary: {
                  session_id: "ses_claude_docs",
                  provider: "claude-cli",
                  agent: "athena",
                  updated_at: "2026-04-18T09:55:00.000Z",
                },
                codex_primary: {
                  session_id: "ses_codex_docs",
                  provider: "opencode",
                  agent: "hephaestus",
                  updated_at: "2026-04-18T10:00:00.000Z",
                },
              },
              execution: {
                provider: "opencode",
                session_role: "codex_primary",
                session_id: "ses_codex_docs",
                artifact_dir: artifactDir,
                stage_result_path: join(artifactDir, "stage-result.json"),
                started_at: "2026-04-18T10:00:00.000Z",
                finished_at: "2026-04-18T10:00:00.000Z",
                verify_commands: [],
                verify_bucket: null,
                commit_sha: null,
                pr_role: "docs",
                subphase: "doc_gate_review",
              },
              prs: {
                docs: {
                  number: 77,
                  url: "https://github.com/netsus/homecook/pull/77",
                  draft: false,
                  branch: `docs/${workItemId}`,
                  head_sha: "docs123",
                },
                backend: null,
                frontend: null,
                closeout: null,
              },
              doc_gate: {
                status: "awaiting_review",
                round: 0,
                repair_branch: `docs/${workItemId}`,
                findings: [buildDocGateFinding(docFindingId)],
              },
            },
          });

          return {
            artifactDir,
            dispatch: { actor: "codex", stage: 2, subphase: "doc_gate_review" },
            execution: {
              mode: "execute",
              executed: true,
              sessionId: "ses_codex_docs",
            },
            runtimeSync,
            stageResult: buildDocGateReviewStageResult({
              decision: "request_changes",
              reviewedDocFindingIds: [docFindingId],
              requiredDocFixIds: [docFindingId],
              bodyMarkdown: "Tighten the Stage 1 docs before approval.",
            }),
          };
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            throw new Error("not expected");
          },
          markReady() {},
          reviewPullRequest() {},
          commentPullRequest() {},
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {},
        },
      },
    );

    expect(observedSubphase).toBe("doc_gate_review");
    expect(result.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 2,
      pr_role: "docs",
    });
    expect(result.runtime?.doc_gate?.status).toBe("fixable");
  });

  it("uses the worktree-local tracked work item when Stage 2 implementation resumes without a root copy", () => {
    const rootDir = createFixture();
    const workItemId = "03-recipe-like";
    const workspacePath = join(rootDir, ".worktrees", workItemId);
    let stageRunnerCalled = false;

    createGitWorkspace(workspacePath, `feature/be-${workItemId}`);
    seedWorktreeBookkeeping(workspacePath, workItemId, {
      roadmapStatus: "docs",
    });
    rmSync(join(rootDir, ".workflow-v2", "work-items", `${workItemId}.json`), { force: true });

    writeRuntimeState({
      rootDir,
      workItemId,
      state: {
        ...readRuntimeState({ rootDir, workItemId, slice: workItemId }).state,
        slice: workItemId,
        active_stage: 2,
        current_stage: 2,
        blocked_stage: 2,
        workspace: {
          path: workspacePath,
          branch_role: "backend",
        },
        doc_gate: {
          status: "passed",
          round: 1,
        },
        wait: {
          kind: "ready_for_next_stage",
          stage: 2,
          pr_role: "backend",
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId,
        now: "2026-04-18T11:20:00.000Z",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
          assertClaudeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch({ branch }: { branch: string }) {
            return { branch };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return "backend123";
          },
          getCurrentBranch() {
            return `feature/be-${workItemId}`;
          },
          listChangedFiles() {
            return [];
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner() {
          stageRunnerCalled = true;
          const runtimeSync = writeRuntimeState({
            rootDir,
            workItemId,
            state: {
              ...readRuntimeState({ rootDir, workItemId, slice: workItemId }).state,
              slice: workItemId,
              current_stage: 2,
              blocked_stage: 2,
              retry: {
                at: "2026-04-18T12:20:00.000Z",
                reason: "claude_budget_unavailable",
                attempt_count: 1,
                max_attempts: 3,
              },
            },
          });
          return {
            artifactDir: join(rootDir, ".artifacts", "stage2-worktree-local-item"),
            dispatch: { actor: "codex", stage: 2, subphase: "implementation" },
            execution: {
              mode: "scheduled-retry",
              executed: false,
              sessionId: "ses_codex_stage2",
              reason: "claude_budget_unavailable",
            },
            runtimeSync,
            stageResult: null,
          };
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            throw new Error("not expected");
          },
          markReady() {},
          reviewPullRequest() {},
          commentPullRequest() {},
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {},
        },
      },
    );

    expect(stageRunnerCalled).toBe(true);
    expect(result.wait).toMatchObject({
      kind: "blocked_retry",
      stage: 2,
    });
  });

  it("keeps Stage 2 as the next stage when doc_gate is already passed but no explicit wait remains", () => {
    const rootDir = createFixture();
    const workItemId = "03-recipe-like";
    const workspacePath = join(rootDir, ".worktrees", workItemId);
    let observedStage: number | null = null;

    createGitWorkspace(workspacePath, `feature/be-${workItemId}`);
    seedWorktreeBookkeeping(workspacePath, workItemId, {
      roadmapStatus: "docs",
    });
    writeRuntimeState({
      rootDir,
      workItemId,
      state: {
        ...readRuntimeState({ rootDir, workItemId, slice: workItemId }).state,
        slice: workItemId,
        active_stage: 2,
        current_stage: 2,
        last_completed_stage: 0,
        blocked_stage: 2,
        phase: "escalated",
        next_action: "noop",
        workspace: {
          path: workspacePath,
          branch_role: "backend",
        },
        wait: null,
        recovery: {
          kind: "dirty_worktree",
          stage: 2,
          reason: "Docs gate bookkeeping drift is limited to tracked workflow-v2 files. Resume continues on the existing docs PR.",
          changed_files: [".workflow-v2/status.json"],
          existing_pr: {
            role: "docs",
            url: "https://github.com/netsus/homecook/pull/77",
            branch: `docs/${workItemId}`,
            head_sha: "docs123",
          },
        },
        doc_gate: {
          status: "passed",
          round: 1,
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId,
        now: "2026-04-18T11:30:00.000Z",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
          assertClaudeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch({ branch }: { branch: string }) {
            return { branch };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return "backend123";
          },
          getCurrentBranch() {
            return `feature/be-${workItemId}`;
          },
          listChangedFiles() {
            return [];
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner({ stage }: { stage: number }) {
          observedStage = stage;
          const runtimeSync = writeRuntimeState({
            rootDir,
            workItemId,
            state: {
              ...readRuntimeState({ rootDir, workItemId, slice: workItemId }).state,
              slice: workItemId,
              current_stage: 2,
              blocked_stage: 2,
              retry: {
                at: "2026-04-18T12:30:00.000Z",
                reason: "claude_budget_unavailable",
                attempt_count: 1,
                max_attempts: 3,
              },
            },
          });
          return {
            artifactDir: join(rootDir, ".artifacts", "stage2-post-doc-gate"),
            dispatch: { actor: "codex", stage: 2, subphase: "implementation" },
            execution: {
              mode: "scheduled-retry",
              executed: false,
              sessionId: "ses_codex_stage2",
              reason: "claude_budget_unavailable",
            },
            runtimeSync,
            stageResult: null,
          };
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            throw new Error("not expected");
          },
          markReady() {},
          reviewPullRequest() {},
          commentPullRequest() {},
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {},
        },
      },
    );

    expect(observedStage).toBe(2);
    expect(result.wait).toMatchObject({
      kind: "blocked_retry",
      stage: 2,
    });
  });

  it("fast-forwards a stale Stage 2 backend branch to origin/master before implementation entry validation", () => {
    const rootDir = createFixture();
    const workItemId = "03-recipe-like";
    const workspacePath = join(rootDir, ".worktrees", workItemId);
    let fastForwarded = false;
    let stageRunnerCalled = false;

    createGitWorkspace(workspacePath, `feature/be-${workItemId}`);
    seedWorktreeBookkeeping(workspacePath, workItemId, {
      roadmapStatus: "docs",
      designStatus: "temporary",
    });
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "docs: seed stale backend branch"], { cwd: workspacePath });
    rmSync(join(workspacePath, "docs", "workpacks", workItemId), { recursive: true, force: true });

    writeRuntimeState({
      rootDir,
      workItemId,
      state: {
        ...readRuntimeState({ rootDir, workItemId, slice: workItemId }).state,
        slice: workItemId,
        active_stage: 2,
        current_stage: 2,
        last_completed_stage: 1,
        phase: null,
        next_action: "noop",
        workspace: {
          path: workspacePath,
          branch_role: "backend",
        },
        prs: {
          docs: {
            number: 41,
            url: "https://github.com/netsus/homecook/pull/41",
            draft: false,
            branch: `docs/${workItemId}`,
            head_sha: "docs123",
          },
          backend: null,
          frontend: null,
          closeout: null,
        },
        doc_gate: {
          status: "passed",
          round: 0,
          findings: [],
        },
        wait: null,
        execution: null,
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId,
        now: "2026-04-24T00:30:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
          assertClaudeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch({ branch }: { branch: string }) {
            return { branch };
          },
          fastForwardBaseBranch() {
            fastForwarded = true;
            mkdirSync(join(workspacePath, "docs", "workpacks", workItemId), { recursive: true });
            writeFileSync(
              join(workspacePath, "docs", "workpacks", workItemId, "README.md"),
              buildWorkpackReadme({
                workItemId,
                designStatus: "temporary",
              }),
            );
            writeFileSync(
              join(workspacePath, "docs", "workpacks", workItemId, "acceptance.md"),
              buildAcceptance({
                workItemId,
              }),
            );
            writeFileSync(
              join(workspacePath, "docs", "workpacks", workItemId, "automation-spec.json"),
              JSON.stringify(
                {
                  slice_id: workItemId,
                  execution_mode: "autonomous",
                },
                null,
                2,
              ),
            );
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return "base-synced-head";
          },
          getCurrentBranch() {
            return `feature/be-${workItemId}`;
          },
          listChangedFiles() {
            return [];
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner() {
          stageRunnerCalled = true;
          const runtimeSync = writeRuntimeState({
            rootDir,
            workItemId,
            state: {
              ...readRuntimeState({ rootDir, workItemId, slice: workItemId }).state,
              slice: workItemId,
              current_stage: 2,
              blocked_stage: 2,
              retry: {
                at: "2026-04-24T01:30:00.000Z",
                reason: "claude_budget_unavailable",
                attempt_count: 1,
                max_attempts: 3,
              },
            },
          });
          return {
            artifactDir: join(rootDir, ".artifacts", "stage2-base-sync"),
            dispatch: { actor: "codex", stage: 2, subphase: "implementation" },
            execution: {
              mode: "scheduled-retry",
              executed: false,
              sessionId: "ses_codex_stage2",
              reason: "claude_budget_unavailable",
            },
            runtimeSync,
            stageResult: null,
          };
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            throw new Error("not expected");
          },
          markReady() {},
          reviewPullRequest() {},
          commentPullRequest() {},
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {},
        },
      },
    );

    expect(fastForwarded).toBe(true);
    expect(stageRunnerCalled).toBe(true);
    expect(result.wait).toMatchObject({
      kind: "blocked_retry",
      stage: 2,
    });
  });

  it("resumes a Stage 2 doc gate repair after rebuttal aliases are normalized", () => {
    const rootDir = createFixture();
    const workItemId = "07-meal-manage";
    const workspacePath = join(rootDir, ".worktrees", workItemId);
    const artifactDir = join(rootDir, ".artifacts", "doc-gate-repair-contract-resume");
    const stageResultPath = join(artifactDir, "stage-result.json");

    createGitWorkspace(workspacePath, `docs/${workItemId}`);
    seedWorktreeBookkeeping(workspacePath, workItemId, {
      roadmapStatus: "docs",
    });
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      stageResultPath,
      `${JSON.stringify(
        {
          result: "done",
          summary_markdown: "primary CTA finding is a false positive",
          commit: {
            subject: "docs: preserve existing CTA wording",
          },
          pr: {
            title: "docs: preserve existing CTA wording",
            body_markdown: "## Summary\n- rebuttal only",
          },
          checks_run: [],
          next_route: "open_pr",
          claimed_scope: {
            files: [],
            endpoints: [],
            routes: [],
            states: [],
            invariants: [],
          },
          changed_files: [],
          tests_touched: [],
          artifacts_written: [stageResultPath],
          resolved_doc_finding_ids: [],
          contested_doc_fix_ids: ["doc-gate-primary-cta"],
          rebuttals: [
            {
              fix_id: "doc-gate-primary-cta",
              rationale: "The current MEAL_SCREEN copy already establishes the primary CTA.",
              evidenceRefs: ["ui/designs/MEAL_SCREEN.md"],
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    writeRuntimeState({
      rootDir,
      workItemId,
      state: {
        ...readRuntimeState({ rootDir, workItemId, slice: workItemId }).state,
        slice: workItemId,
        active_stage: 2,
        current_stage: 2,
        blocked_stage: 2,
        retry: {
          at: null,
          reason: "contract_violation",
          attempt_count: 1,
          max_attempts: 3,
        },
        workspace: {
          path: workspacePath,
          branch_role: "docs",
        },
        wait: {
          kind: "human_escalation",
          stage: 2,
          pr_role: "docs",
          reason: "stageResult.rebuttals[0].rationale_markdown must be a non-empty string.",
        },
        recovery: {
          kind: "partial_stage_failure",
          stage: 2,
          branch: `docs/${workItemId}`,
          reason: "stageResult.rebuttals[0].rationale_markdown must be a non-empty string.",
          artifact_dir: artifactDir,
          changed_files: ["ui/designs/MEAL_SCREEN.md"],
          existing_pr: {
            role: "docs",
            number: 150,
            url: "https://github.com/netsus/homecook/pull/150",
            draft: false,
            branch: `docs/${workItemId}`,
            head_sha: "docs123",
          },
          salvage_candidate: true,
          session_role: "claude_primary",
          session_provider: "claude-cli",
          session_id: "ses_claude_docs",
        },
        sessions: {
          claude_primary: {
            session_id: "ses_claude_docs",
            provider: "claude-cli",
            agent: "athena",
            updated_at: "2026-04-18T10:00:00.000Z",
          },
          codex_primary: {
            session_id: "ses_codex_docs",
            provider: "opencode",
            agent: "hephaestus",
            updated_at: "2026-04-18T09:59:00.000Z",
          },
        },
        execution: {
          provider: "claude-cli",
          session_role: "claude_primary",
          session_id: "ses_claude_docs",
          artifact_dir: artifactDir,
          stage_result_path: stageResultPath,
          started_at: "2026-04-18T10:00:00.000Z",
          finished_at: "2026-04-18T10:00:00.000Z",
          verify_commands: [],
          verify_bucket: null,
          commit_sha: null,
          pr_role: "docs",
          subphase: "doc_gate_repair",
        },
        prs: {
          docs: {
            number: 150,
            url: "https://github.com/netsus/homecook/pull/150",
            draft: false,
            branch: `docs/${workItemId}`,
            head_sha: "docs123",
          },
          backend: null,
          frontend: null,
          closeout: null,
        },
        doc_gate: {
          status: "fixable",
          round: 1,
          repair_branch: `docs/${workItemId}`,
          findings: [
            {
              id: "doc-gate-primary-cta",
              category: "design_authority",
              severity: "major",
              message: "Primary CTA keyword is missing.",
              evidence_paths: ["ui/designs/MEAL_SCREEN.md"],
              remediation_hint: "Name the primary CTA explicitly.",
              fixable: true,
            },
          ],
          last_review: {
            decision: "request_changes",
            route_back_stage: 2,
            approved_head_sha: null,
            body_markdown: "## Review\n- add CTA wording",
            reviewed_doc_finding_ids: ["doc-gate-primary-cta"],
            required_doc_fix_ids: ["doc-gate-primary-cta"],
            waived_doc_fix_ids: [],
            findings: [],
            source_review_stage: 1,
            ping_pong_rounds: 1,
            updated_at: "2026-04-18T09:59:00.000Z",
          },
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId,
        now: "2026-04-18T10:10:00.000Z",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
          assertClaudeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch({ branch }: { branch: string }) {
            return { branch };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return "docs123";
          },
          getCurrentBranch() {
            return `docs/${workItemId}`;
          },
          listChangedFiles() {
            return [];
          },
          getBinaryDiff() {
            return "";
          },
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            throw new Error("not expected");
          },
          markReady() {},
          reviewPullRequest() {},
          commentPullRequest() {},
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {},
        },
        stageRunner() {
          throw new Error("not expected");
        },
      },
    );

    expect(result.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 2,
      pr_role: "docs",
    });
    expect(result.runtime?.doc_gate?.status).toBe("awaiting_review");
    expect(result.runtime?.doc_gate?.last_rebuttal).toMatchObject({
      contested_doc_fix_ids: ["doc-gate-primary-cta"],
      rebuttals: [
        {
          fix_id: "doc-gate-primary-cta",
          rationale_markdown: "The current MEAL_SCREEN copy already establishes the primary CTA.",
          evidence_refs: ["ui/designs/MEAL_SCREEN.md"],
        },
      ],
    });
  });

  it("auto-salvages promotion ledger dirtiness and resumes CI wait", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    const committed: Array<{ subject: string; body: string | null }> = [];
    const pushed: string[] = [];
    let dirty = true;

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "in-progress",
      designStatus: "pending-review",
    });

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({ rootDir, workItemId: "03-recipe-like", slice: "03-recipe-like" }).state,
        slice: "03-recipe-like",
        active_stage: 4,
        current_stage: 4,
        last_completed_stage: 4,
        workspace: { path: workspacePath, branch_role: "frontend" },
        phase: "wait",
        next_action: "poll_ci",
        wait: {
          kind: "ci",
          pr_role: "frontend",
          stage: 4,
          head_sha: "old-head",
          reason: null,
          until: null,
          updated_at: "2026-04-15T03:30:00+09:00",
        },
        execution: null,
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 36,
            url: "https://github.com/netsus/homecook/pull/36",
            draft: true,
            branch: "feature/fe-03-recipe-like",
            head_sha: "old-head",
          },
          closeout: null,
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-04-15T03:40:00+09:00",
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
          assertClaudeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {
            if (dirty) {
              throw new Error("Worktree is dirty.");
            }
          },
          checkoutBranch() {
            return { branch: "feature/fe-06-recipe-to-planner", created: false };
          },
          commitChanges({ subject, body }: { subject: string; body: string | null }) {
            committed.push({ subject, body });
            dirty = false;
          },
          pushBranch({ branch }: { branch: string }) {
            pushed.push(branch);
          },
          syncBaseBranch() {
            throw new Error("not expected");
          },
          getHeadSha() {
            return "new-head";
          },
          getCurrentBranch() {
            return "feature/fe-03-recipe-like";
          },
          listChangedFiles() {
            return dirty ? [".workflow-v2/promotion-evidence.json"] : [];
          },
          getBinaryDiff() {
            return "";
          },
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            return { bucket: "pending", checks: [{ name: "build", status: "pending" }] };
          },
          getPullRequestSummary() {
            return { mergedAt: null };
          },
          markReady() {},
          reviewPullRequest() {},
          commentPullRequest() {},
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {},
        },
        stageRunner() {
          throw new Error("not expected");
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      slice: "03-recipe-like",
    }).state as {
      wait: { kind: string; pr_role: string | null; stage: number | null; head_sha: string | null };
      recovery: unknown;
      prs: { frontend: { head_sha: string | null } | null };
    };
    const statusBoard = JSON.parse(
      readFileSync(join(rootDir, ".workflow-v2", "status.json"), "utf8"),
    ) as {
      items: Array<{ id: string; approval_state: string; notes?: string; lifecycle: string }>;
    };
    const statusItem = statusBoard.items.find((item) => item.id === "03-recipe-like");

    expect(committed).toHaveLength(1);
    expect(committed[0]?.subject).toBe("chore: record 03-recipe-like stage 4 pilot evidence");
    expect(committed[0]?.body).toContain("Directive: If promotion evidence is updated mid-stage");
    expect(pushed).toEqual(["feature/fe-03-recipe-like"]);
    expect(result.wait?.kind).toBe("ci");
    expect(runtime.wait).toMatchObject({
      kind: "ci",
      pr_role: "frontend",
      stage: 4,
      head_sha: "new-head",
    });
    expect(runtime.recovery).toBeNull();
    expect(runtime.prs.frontend?.head_sha).toBe("new-head");
    expect(statusItem).toMatchObject({
      approval_state: "not_started",
      lifecycle: "in_progress",
    });
    expect(statusItem?.notes).toContain("wait_kind=ci");
  });

  it("resumes a pr-check failure escalation into CI wait when current-head checks are no longer failing", () => {
    const rootDir = createFixture();
    const workItemId = "03-recipe-like";
    const workspacePath = join(rootDir, ".worktrees", workItemId);
    const artifactDir = join(rootDir, ".artifacts", "stage1-pr-check-failure-recovery");
    const stageResultPath = join(artifactDir, "stage-result.json");
    createGitWorkspace(workspacePath, `docs/${workItemId}`);
    seedWorktreeBookkeeping(workspacePath, workItemId, {
      roadmapStatus: "docs",
      designStatus: "temporary",
    });
    writeFileSync(
      join(workspacePath, "docs", "workpacks", workItemId, "automation-spec.json"),
      JSON.stringify(
        {
          slice_id: workItemId,
          execution_mode: "autonomous",
        },
        null,
        2,
      ),
    );
    upsertWorktreeStatusItem(workspacePath, workItemId, {
      lifecycle: "ready_for_review",
      approval_state: "claude_approved",
      verification_status: "pending",
    });
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "docs: seed stale pr-check failure"], { cwd: workspacePath });
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      stageResultPath,
      `${JSON.stringify(
        buildCodeStageResult({
          summary: "Stage 1 docs complete",
          subject: "docs: complete stage1 workpack",
          title: "docs: complete stage1 workpack",
          checklistUpdates: [],
          changedFiles: [
            `docs/workpacks/${workItemId}/README.md`,
            `docs/workpacks/${workItemId}/acceptance.md`,
          ],
        }),
        null,
        2,
      )}\n`,
    );

    writeRuntimeState({
      rootDir,
      workItemId,
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId,
          slice: workItemId,
        }).state,
        slice: workItemId,
        active_stage: 1,
        current_stage: 1,
        phase: "escalated",
        next_action: "noop",
        workspace: {
          path: workspacePath,
          branch_role: "docs",
        },
        last_artifact_dir: artifactDir,
        execution: {
          provider: "claude-cli",
          session_role: "claude_primary",
          session_id: "ses_docs_recovery",
          artifact_dir: artifactDir,
          stage_result_path: stageResultPath,
          started_at: "2026-04-20T13:00:00+09:00",
          finished_at: "2026-04-20T13:01:00+09:00",
          verify_commands: [],
          verify_bucket: null,
          commit_sha: "old-head",
          pr_role: "docs",
        },
        prs: {
          docs: {
            number: 41,
            url: "https://github.com/netsus/homecook/pull/41",
            draft: false,
            branch: `docs/${workItemId}`,
            head_sha: "old-head",
          },
          backend: null,
          frontend: null,
          closeout: null,
        },
        wait: {
          kind: "human_escalation",
          reason: "PR checks failed.",
          updated_at: "2026-04-20T13:02:00+09:00",
        },
        recovery: {
          kind: "partial_stage_failure",
          stage: 1,
          reason: "PR checks failed.",
          artifact_dir: artifactDir,
          existing_pr: {
            role: "docs",
            number: 41,
            url: "https://github.com/netsus/homecook/pull/41",
            draft: false,
            branch: `docs/${workItemId}`,
            head_sha: "old-head",
          },
          session_role: "claude_primary",
          session_id: "ses_docs_recovery",
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId,
        now: "2026-04-20T13:05:00+09:00",
        maxTransitions: 2,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
          assertClaudeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch({ branch }: { branch: string }) {
            return { branch };
          },
          pushBranch() {},
          syncBaseBranch() {
            throw new Error("not expected");
          },
          getHeadSha() {
            return "new-head";
          },
          getCurrentBranch() {
            return `docs/${workItemId}`;
          },
          listChangedFiles() {
            return [];
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner() {
          throw new Error("not expected");
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          editPullRequest() {},
          getRequiredChecks() {
            return { bucket: "pending", checks: [{ name: "quality", bucket: "pending", state: "PENDING" }] };
          },
          getPullRequestSummary() {
            return {
              state: "OPEN",
              mergedAt: null,
              mergeStateStatus: "CLEAN",
              reviewDecision: null,
              headRefOid: "new-head",
              headRefName: `docs/${workItemId}`,
              isDraft: false,
            };
          },
          markReady() {
            throw new Error("not expected");
          },
          reviewPullRequest() {
            throw new Error("not expected");
          },
          commentPullRequest() {
            throw new Error("not expected");
          },
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {
            throw new Error("not expected");
          },
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId,
      slice: workItemId,
    }).state as {
      wait: { kind: string; stage: number | null; pr_role: string | null; head_sha: string | null };
      recovery: unknown;
      prs: { docs: { head_sha: string | null } | null };
    };

    expect(result.wait).toMatchObject({
      kind: "ci",
      stage: 1,
      pr_role: "docs",
      head_sha: "new-head",
    });
    expect(runtime.wait).toMatchObject({
      kind: "ci",
      stage: 1,
      pr_role: "docs",
      head_sha: "new-head",
    });
    expect(runtime.recovery).toBeNull();
    expect(runtime.prs.docs?.head_sha).toBe("new-head");
  });

  it("resumes a pr-check failure escalation into CI wait even when recovery metadata is missing", () => {
    const rootDir = createFixture();
    const workItemId = "03-recipe-like";
    const workspacePath = join(rootDir, ".worktrees", workItemId);
    const artifactDir = join(rootDir, ".artifacts", "stage4-pr-check-failure-no-recovery");
    const stageResultPath = join(artifactDir, "stage-result.json");

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, workItemId, {
      roadmapStatus: "in-progress",
      designStatus: "pending-review",
    });
    writeFileSync(
      join(workspacePath, "docs", "workpacks", workItemId, "automation-spec.json"),
      JSON.stringify(
        {
          slice_id: workItemId,
          execution_mode: "autonomous",
        },
        null,
        2,
      ),
    );
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      stageResultPath,
      `${JSON.stringify(
        buildCodeStageResult({
          summary: "Stage 4 frontend complete",
          subject: "feat: complete stage4 frontend",
          title: "feat: complete stage4 frontend",
          checklistUpdates: [CHECKLIST_IDS.frontendDelivery, CHECKLIST_IDS.frontendAcceptance],
          changedFiles: [
            "app/example/page.tsx",
            `docs/workpacks/${workItemId}/README.md`,
            `docs/workpacks/${workItemId}/acceptance.md`,
          ],
        }),
        null,
        2,
      )}\n`,
    );

    writeRuntimeState({
      rootDir,
      workItemId,
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId,
          slice: workItemId,
        }).state,
        slice: workItemId,
        active_stage: 4,
        current_stage: 4,
        phase: "wait",
        next_action: "noop",
        workspace: {
          path: workspacePath,
          branch_role: "frontend",
        },
        last_artifact_dir: artifactDir,
        execution: {
          provider: "opencode",
          session_role: "codex_primary",
          session_id: "ses_frontend_no_recovery",
          artifact_dir: artifactDir,
          stage_result_path: stageResultPath,
          started_at: "2026-04-24T19:30:00+09:00",
          finished_at: "2026-04-24T19:31:00+09:00",
          verify_commands: [],
          verify_bucket: null,
          commit_sha: "old-head",
          pr_role: "frontend",
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 41,
            url: "https://github.com/netsus/homecook/pull/41",
            draft: false,
            branch: "feature/fe-03-recipe-like",
            head_sha: "old-head",
          },
          closeout: null,
        },
        wait: {
          kind: "human_escalation",
          reason: "PR checks failed.",
          pr_role: "frontend",
          stage: 4,
          head_sha: "old-head",
          updated_at: "2026-04-24T19:32:00+09:00",
        },
        recovery: null,
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId,
        now: "2026-04-24T19:35:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
          assertClaudeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch({ branch }: { branch: string }) {
            return { branch };
          },
          pushBranch() {},
          syncBaseBranch() {
            throw new Error("not expected");
          },
          getHeadSha() {
            return "new-head";
          },
          getCurrentBranch() {
            return "feature/fe-03-recipe-like";
          },
          listChangedFiles() {
            return [];
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner() {
          throw new Error("not expected");
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          editPullRequest() {},
          getRequiredChecks() {
            return { bucket: "pending", checks: [{ name: "quality", bucket: "pending", state: "PENDING" }] };
          },
          getPullRequestSummary() {
            return {
              state: "OPEN",
              mergedAt: null,
              mergeStateStatus: "CLEAN",
              reviewDecision: null,
              headRefOid: "new-head",
              headRefName: "feature/fe-03-recipe-like",
              isDraft: false,
            };
          },
          getPullRequestBody() {
            return "## Summary\n- frontend";
          },
          markReady() {
            throw new Error("not expected");
          },
          reviewPullRequest() {
            throw new Error("not expected");
          },
          commentPullRequest() {
            throw new Error("not expected");
          },
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {
            throw new Error("not expected");
          },
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId,
      slice: workItemId,
    }).state as {
      wait: { kind: string; stage: number | null; pr_role: string | null; head_sha: string | null };
      prs: { frontend: { head_sha: string | null } | null };
      recovery: unknown;
    };

    expect(result.wait).toMatchObject({
      kind: "ci",
      stage: 4,
      pr_role: "frontend",
      head_sha: "new-head",
    });
    expect(runtime.wait).toMatchObject({
      kind: "ci",
      stage: 4,
      pr_role: "frontend",
      head_sha: "new-head",
    });
    expect(runtime.prs.frontend?.head_sha).toBe("new-head");
    expect(runtime.recovery).toBeNull();
  });

  it("canonicalizes tracked status required checks before committing a Stage 1 docs branch", () => {
    const rootDir = createFixture();
    const workItemId = "03-recipe-like";
    const workspacePath = join(rootDir, ".worktrees", workItemId);
    const artifactDir = join(rootDir, ".artifacts", "stage1-status-canonicalization");
    const stageResultPath = join(artifactDir, "stage-result.json");
    const expectedChecks = [
      "pnpm verify:backend",
      "pnpm verify:frontend",
      "pnpm lint",
      "pnpm typecheck",
    ];
    const staleChecks = [
      "pnpm install --frozen-lockfile && pnpm verify:backend",
      "pnpm install --frozen-lockfile && pnpm verify:frontend",
      "pnpm lint",
      "pnpm typecheck",
    ];

    createGitWorkspace(workspacePath, `docs/${workItemId}`);
    seedWorktreeBookkeeping(workspacePath, workItemId, {
      roadmapStatus: "docs",
      designStatus: "temporary",
    });
    writeFileSync(
      join(workspacePath, "docs", "workpacks", workItemId, "automation-spec.json"),
      JSON.stringify(
        {
          slice_id: workItemId,
          execution_mode: "autonomous",
        },
        null,
        2,
      ),
    );
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "docs: seed stage1 baseline"], { cwd: workspacePath });

    const workItemPath = join(workspacePath, ".workflow-v2", "work-items", `${workItemId}.json`);
    const workItem = JSON.parse(readFileSync(workItemPath, "utf8")) as {
      verification: { required_checks: string[]; verify_commands: string[] };
    };
    writeFileSync(
      workItemPath,
      `${JSON.stringify(
        {
          ...workItem,
          verification: {
            ...workItem.verification,
            required_checks: expectedChecks,
            verify_commands: expectedChecks.slice(0, 2),
          },
        },
        null,
        2,
      )}\n`,
    );
    upsertWorktreeStatusItem(workspacePath, workItemId, {
      lifecycle: "planned",
      approval_state: "not_started",
      verification_status: "pending",
      required_checks: staleChecks,
      notes: "Stage 1 docs in progress",
    });

    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      stageResultPath,
      `${JSON.stringify(
        buildCodeStageResult({
          summary: "Stage 1 docs complete",
          subject: "docs: complete stage1 workpack",
          title: "docs: complete stage1 workpack",
          checklistUpdates: [],
          changedFiles: [
            `docs/workpacks/${workItemId}/README.md`,
            `docs/workpacks/${workItemId}/acceptance.md`,
            ".workflow-v2/status.json",
            `.workflow-v2/work-items/${workItemId}.json`,
          ],
        }),
        null,
        2,
      )}\n`,
    );

    writeRuntimeState({
      rootDir,
      workItemId,
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId,
          slice: workItemId,
        }).state,
        slice: workItemId,
        active_stage: 1,
        current_stage: 1,
        phase: "stage_result_ready",
        next_action: "finalize_stage",
        workspace: {
          path: workspacePath,
          branch_role: "docs",
        },
        last_artifact_dir: artifactDir,
        execution: {
          provider: "claude-cli",
          session_role: "claude_primary",
          session_id: "ses_docs_stage1",
          artifact_dir: artifactDir,
          stage_result_path: stageResultPath,
          started_at: "2026-04-23T14:17:41.808Z",
          finished_at: "2026-04-23T14:17:41.808Z",
          verify_commands: [],
          verify_bucket: null,
          commit_sha: null,
          pr_role: "docs",
        },
        wait: null,
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId,
        now: "2026-04-23T14:26:18.218Z",
        maxTransitions: 4,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
          assertClaudeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {
            const status = execFileSync("git", ["status", "--porcelain"], {
              cwd: workspacePath,
              encoding: "utf8",
            }).trim();
            if (status.length > 0) {
              throw new Error("Worktree is dirty.");
            }
          },
          checkoutBranch({ branch }: { branch: string }) {
            return { branch };
          },
          commitChanges({ subject, body }: { subject: string; body: string | null }) {
            execFileSync("git", ["add", "-A"], { cwd: workspacePath });
            const message = body && body.trim().length > 0 ? `${subject}\n\n${body}` : subject;
            execFileSync("git", ["commit", "-m", message], { cwd: workspacePath });
          },
          pushBranch() {},
          syncBaseBranch() {
            throw new Error("not expected");
          },
          getHeadSha() {
            return execFileSync("git", ["rev-parse", "HEAD"], {
              cwd: workspacePath,
              encoding: "utf8",
            }).trim();
          },
          getCurrentBranch() {
            return execFileSync("git", ["branch", "--show-current"], {
              cwd: workspacePath,
              encoding: "utf8",
            }).trim();
          },
          listChangedFiles() {
            return execFileSync("git", ["status", "--porcelain"], {
              cwd: workspacePath,
              encoding: "utf8",
            })
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line) => line.slice(3));
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner() {
          throw new Error("not expected");
        },
        github: {
          createPullRequest() {
            return {
              number: 41,
              url: `https://github.com/netsus/homecook/pull/41`,
              draft: false,
            };
          },
          getRequiredChecks() {
            return { bucket: "pending", checks: [{ name: "policy", bucket: "pending", state: "PENDING" }] };
          },
          getPullRequestSummary() {
            return {
              state: "OPEN",
              mergedAt: null,
              mergeStateStatus: "CLEAN",
              reviewDecision: null,
            };
          },
          markReady() {
            throw new Error("not expected");
          },
          reviewPullRequest() {
            throw new Error("not expected");
          },
          commentPullRequest() {
            throw new Error("not expected");
          },
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {
            throw new Error("not expected");
          },
        },
      },
    );

    const committedStatus = JSON.parse(
      execFileSync("git", ["show", "HEAD:.workflow-v2/status.json"], {
        cwd: workspacePath,
        encoding: "utf8",
      }),
    ) as {
      items: Array<{ id: string; required_checks: string[] }>;
    };
    const committedStatusItem = committedStatus.items.find((item) => item.id === workItemId);

    expect(result.wait).toMatchObject({
      kind: "ci",
      stage: 1,
      pr_role: "docs",
    });
    expect(committedStatusItem?.required_checks).toEqual(expectedChecks);
  });

  it("replays PR body projection on failed checks and returns to ci wait without a no-op commit", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    const artifactDir = join(rootDir, ".artifacts", "stage4-policy-repair");
    const stageResultPath = join(artifactDir, "stage-result.json");
    const editedPullRequests: Array<{ prRef: string; title: string; body: string; workItemId?: string }> = [];

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, "03-recipe-like", {
      roadmapStatus: "in-progress",
      designStatus: "pending-review",
    });
    seedQaArtifactBundle(rootDir, "03-recipe-like");
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      stageResultPath,
      `${JSON.stringify(
        buildCodeStageResult({
          summary: "Frontend implementation completed.",
          subject: "feat: frontend implementation",
          title: "feat: frontend implementation",
          checklistUpdates: [CHECKLIST_IDS.frontendDelivery, CHECKLIST_IDS.frontendAcceptance],
          changedFiles: ["app/example/page.tsx"],
        }),
        null,
        2,
      )}\n`,
    );

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        active_stage: 4,
        current_stage: 4,
        phase: "escalated",
        next_action: "noop",
        workspace: {
          path: workspacePath,
          branch_role: "frontend",
        },
        last_artifact_dir: artifactDir,
        execution: {
          provider: "opencode",
          session_role: "codex_primary",
          session_id: "ses_frontend_recovery",
          artifact_dir: artifactDir,
          stage_result_path: stageResultPath,
          started_at: "2026-04-20T15:00:00+09:00",
          finished_at: "2026-04-20T15:02:00+09:00",
          verify_commands: [],
          verify_bucket: null,
          commit_sha: "same-head",
          pr_role: "frontend",
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 41,
            url: "https://github.com/netsus/homecook/pull/41",
            draft: true,
            branch: "feature/fe-03-recipe-like",
            head_sha: "same-head",
          },
          closeout: null,
        },
        wait: {
          kind: "human_escalation",
          reason: "PR checks failed.",
          pr_role: "frontend",
          stage: 4,
          head_sha: "same-head",
          updated_at: "2026-04-20T15:03:00+09:00",
        },
        recovery: {
          kind: "partial_stage_failure",
          stage: 4,
          reason: "PR checks failed.",
          artifact_dir: artifactDir,
          existing_pr: {
            role: "frontend",
            number: 41,
            url: "https://github.com/netsus/homecook/pull/41",
            draft: true,
            branch: "feature/fe-03-recipe-like",
            head_sha: "same-head",
          },
          session_role: "codex_primary",
          session_id: "ses_frontend_recovery",
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-04-20T15:05:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "feature/fe-03-recipe-like" };
          },
          pushBranch() {
            throw new Error("not expected");
          },
          syncBaseBranch() {
            throw new Error("not expected");
          },
          getHeadSha() {
            return "same-head";
          },
          getCurrentBranch() {
            return "feature/fe-03-recipe-like";
          },
          listChangedFiles() {
            return [];
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner() {
          throw new Error("not expected");
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          editPullRequest(args: { prRef: string; title: string; body: string; workItemId?: string }) {
            editedPullRequests.push(args);
          },
          getRequiredChecks() {
            return { bucket: "fail", checks: [{ name: "policy", bucket: "fail", state: "FAILURE" }] };
          },
          getPullRequestSummary() {
            return {
              state: "OPEN",
              mergedAt: null,
              mergeStateStatus: "CLEAN",
              reviewDecision: null,
              headRefOid: "same-head",
              headRefName: "feature/fe-03-recipe-like",
              isDraft: true,
            };
          },
          getPullRequestBody() {
            return [
              "## Summary",
              "- stale handwritten summary",
              "",
              "## Workpack / Slice",
              "- workflow v2 work item: `.workflow-v2/work-items/03-recipe-like.json`",
            ].join("\n");
          },
          markReady() {
            throw new Error("not expected");
          },
          reviewPullRequest() {
            throw new Error("not expected");
          },
          commentPullRequest() {
            throw new Error("not expected");
          },
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {
            throw new Error("not expected");
          },
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      slice: "03-recipe-like",
    }).state as {
      wait: { kind: string; stage: number | null; pr_role: string | null; head_sha: string | null };
      recovery: unknown;
    };
    const trackedStatus = readTrackedStatusItem(rootDir, "03-recipe-like") as {
      verification_status?: string;
      notes?: string;
    } | null;

    expect(editedPullRequests).toHaveLength(1);
    expect(editedPullRequests[0]).toMatchObject({
      prRef: "https://github.com/netsus/homecook/pull/41",
      title: "feat: frontend implementation",
      body: "fixed",
      workItemId: "03-recipe-like",
    });
    expect(result.wait).toMatchObject({
      kind: "ci",
      stage: 4,
      pr_role: "frontend",
      head_sha: "same-head",
    });
    expect(runtime.wait).toMatchObject({
      kind: "ci",
      stage: 4,
      pr_role: "frontend",
      head_sha: "same-head",
    });
    expect(runtime.recovery).toBeNull();
    expect(trackedStatus?.verification_status).toBe("pending");
    expect(trackedStatus?.notes ?? "").toContain("pr_body_projection=replayed");
    expect(trackedStatus?.notes ?? "").toContain("policy_rerun=edited_event");
  });

  it("refreshes the stored wait head_sha even when PR checks are still failing", () => {
    const rootDir = createFixture();
    const workItemId = "03-recipe-like";
    const workspacePath = join(rootDir, ".worktrees", workItemId);
    const artifactDir = join(rootDir, ".artifacts", "stage4-pr-check-failure-head-refresh");
    const stageResultPath = join(artifactDir, "stage-result.json");

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, workItemId, {
      roadmapStatus: "in-progress",
      designStatus: "pending-review",
    });
    seedQaArtifactBundle(rootDir, workItemId);
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      stageResultPath,
      `${JSON.stringify(
        buildCodeStageResult({
          summary: "Frontend implementation completed.",
          subject: "feat: frontend implementation",
          title: "feat: frontend implementation",
          checklistUpdates: [CHECKLIST_IDS.frontendDelivery, CHECKLIST_IDS.frontendAcceptance],
          changedFiles: ["app/example/page.tsx"],
        }),
        null,
        2,
      )}\n`,
    );

    writeRuntimeState({
      rootDir,
      workItemId,
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId,
          slice: workItemId,
        }).state,
        slice: workItemId,
        active_stage: 4,
        current_stage: 4,
        phase: "escalated",
        next_action: "noop",
        workspace: {
          path: workspacePath,
          branch_role: "frontend",
        },
        last_artifact_dir: artifactDir,
        execution: {
          provider: "opencode",
          session_role: "codex_primary",
          session_id: "ses_frontend_recovery",
          artifact_dir: artifactDir,
          stage_result_path: stageResultPath,
          started_at: "2026-04-20T15:00:00+09:00",
          finished_at: "2026-04-20T15:02:00+09:00",
          verify_commands: [],
          verify_bucket: null,
          commit_sha: "old-head",
          pr_role: "frontend",
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 41,
            url: "https://github.com/netsus/homecook/pull/41",
            draft: true,
            branch: "feature/fe-03-recipe-like",
            head_sha: "old-head",
          },
          closeout: null,
        },
        wait: {
          kind: "human_escalation",
          reason: "PR checks failed.",
          pr_role: "frontend",
          stage: 4,
          head_sha: "old-head",
          updated_at: "2026-04-20T15:03:00+09:00",
        },
        recovery: {
          kind: "partial_stage_failure",
          stage: 4,
          reason: "PR checks failed.",
          artifact_dir: artifactDir,
          existing_pr: {
            role: "frontend",
            number: 41,
            url: "https://github.com/netsus/homecook/pull/41",
            draft: true,
            branch: "feature/fe-03-recipe-like",
            head_sha: "old-head",
          },
          session_role: "codex_primary",
          session_id: "ses_frontend_recovery",
        },
      },
    });

    const normalizedBody = mergePullRequestBodyWithExisting(
      "fixed",
      "fixed",
      workItemId,
      rootDir,
    );

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId,
        now: "2026-04-20T15:05:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "feature/fe-03-recipe-like" };
          },
          pushBranch() {
            throw new Error("not expected");
          },
          syncBaseBranch() {
            throw new Error("not expected");
          },
          getHeadSha() {
            return "new-head";
          },
          getCurrentBranch() {
            return "feature/fe-03-recipe-like";
          },
          listChangedFiles() {
            return [];
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner() {
          throw new Error("not expected");
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          editPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            return { bucket: "fail", checks: [{ name: "quality", bucket: "fail", state: "FAILURE" }] };
          },
          getPullRequestSummary() {
            return {
              state: "OPEN",
              mergedAt: null,
              mergeStateStatus: "CLEAN",
              reviewDecision: null,
              headRefOid: "new-head",
              headRefName: "feature/fe-03-recipe-like",
              isDraft: true,
            };
          },
          getPullRequestBody() {
            return normalizedBody;
          },
          markReady() {
            throw new Error("not expected");
          },
          reviewPullRequest() {
            throw new Error("not expected");
          },
          commentPullRequest() {
            throw new Error("not expected");
          },
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {
            throw new Error("not expected");
          },
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId,
      slice: workItemId,
    }).state as {
      wait: { kind: string; stage: number | null; pr_role: string | null; head_sha: string | null };
      prs: { frontend: { head_sha: string | null } | null };
    };

    expect(result.wait).toMatchObject({
      kind: "human_escalation",
      stage: 4,
      pr_role: "frontend",
      head_sha: "new-head",
    });
    expect(runtime.wait).toMatchObject({
      kind: "human_escalation",
      stage: 4,
      pr_role: "frontend",
      head_sha: "new-head",
    });
    expect(runtime.prs.frontend?.head_sha).toBe("new-head");
  });

  it("re-arms Stage 6 review when CI passes on a newer head than the approved review SHA", () => {
    const rootDir = createFixture();
    const workItemId = "03-recipe-like";
    const workspacePath = join(rootDir, ".worktrees", workItemId);
    const artifactDir = join(rootDir, ".artifacts", "stage6-rerun-after-head-drift");
    const stageResultPath = join(artifactDir, "stage-result.json");

    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, workItemId, {
      roadmapStatus: "merged",
      designStatus: "confirmed",
      authorityStatus: "not-required",
      uiRisk: "not-required",
      visualArtifact: "not-required",
    });
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      stageResultPath,
      `${JSON.stringify(
        buildReviewStageResult({
          decision: "approve",
          stage: 6,
          reviewedChecklistIds: [CHECKLIST_IDS.frontendDelivery, CHECKLIST_IDS.frontendAcceptance],
          bodyMarkdown: "Stage 6 approved on prior head",
          approvedHeadSha: "approved-head",
        }),
        null,
        2,
      )}\n`,
    );

    writeRuntimeState({
      rootDir,
      workItemId,
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId,
          slice: workItemId,
        }).state,
        slice: workItemId,
        active_stage: 6,
        current_stage: 6,
        last_completed_stage: 5,
        phase: "merge_pending",
        next_action: "poll_ci",
        workspace: {
          path: workspacePath,
          branch_role: "frontend",
        },
        execution: {
          provider: "opencode",
          session_role: "codex_primary",
          session_id: "ses_stage6_rerun",
          artifact_dir: artifactDir,
          stage_result_path: stageResultPath,
          started_at: "2026-04-24T18:18:00+09:00",
          finished_at: "2026-04-24T18:20:00+09:00",
          verify_commands: [],
          verify_bucket: null,
          commit_sha: "approved-head",
          pr_role: "frontend",
          subphase: "implementation",
        },
        wait: {
          kind: "ci",
          pr_role: "frontend",
          stage: 6,
          head_sha: "old-head",
          reason: null,
          until: null,
          updated_at: "2026-04-24T18:25:00+09:00",
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 41,
            url: "https://github.com/netsus/homecook/pull/41",
            draft: false,
            branch: "feature/fe-03-recipe-like",
            head_sha: "old-head",
          },
          closeout: null,
        },
        last_review: {
          frontend: {
            decision: "approve",
            approved_head_sha: "approved-head",
            body_markdown: "Stage 6 approved on prior head",
            findings: [],
            updated_at: "2026-04-24T18:20:00+09:00",
          },
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId,
        now: "2026-04-24T18:30:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
          assertClaudeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "feature/fe-03-recipe-like", created: false };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return "new-head";
          },
          getCurrentBranch() {
            return "feature/fe-03-recipe-like";
          },
          listChangedFiles() {
            return [];
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner() {
          throw new Error("not expected");
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            return { bucket: "pass", checks: [{ name: "quality", bucket: "pass", state: "SUCCESS" }] };
          },
          getPullRequestSummary() {
            return {
              state: "OPEN",
              mergedAt: null,
              mergeStateStatus: "CLEAN",
              reviewDecision: "APPROVED",
              headRefOid: "new-head",
              headRefName: "feature/fe-03-recipe-like",
              isDraft: false,
            };
          },
          markReady() {
            throw new Error("not expected");
          },
          reviewPullRequest() {
            throw new Error("not expected");
          },
          commentPullRequest() {
            throw new Error("not expected");
          },
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {
            throw new Error("not expected");
          },
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId,
      slice: workItemId,
    }).state as {
      wait: { kind: string; stage: number; pr_role: string; head_sha: string | null };
      prs: { frontend: { head_sha: string | null } | null };
    };

    expect(result.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 6,
      pr_role: "frontend",
      head_sha: "new-head",
    });
    expect(runtime.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 6,
      pr_role: "frontend",
      head_sha: "new-head",
    });
    expect(runtime.prs.frontend?.head_sha).toBe("new-head");
  });

  it("refreshes the PR head before rerunning a Stage 6 ready_for_next_stage review", () => {
    const rootDir = createFixture();
    const workItemId = "03-recipe-like";
    const workspacePath = join(rootDir, ".worktrees", workItemId);
    createGitWorkspace(workspacePath, "feature/fe-03-recipe-like");
    seedWorktreeBookkeeping(workspacePath, workItemId, {
      roadmapStatus: "merged",
      designStatus: "confirmed",
      authorityStatus: "not-required",
      uiRisk: "not-required",
      visualArtifact: "not-required",
    });

    writeRuntimeState({
      rootDir,
      workItemId,
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId,
          slice: workItemId,
        }).state,
        slice: workItemId,
        active_stage: 6,
        current_stage: 6,
        last_completed_stage: 5,
        phase: "wait",
        next_action: "run_stage",
        workspace: {
          path: workspacePath,
          branch_role: "frontend",
        },
        wait: {
          kind: "ready_for_next_stage",
          pr_role: "frontend",
          stage: 6,
          head_sha: "old-head",
          updated_at: "2026-04-24T20:10:00+09:00",
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 41,
            url: "https://github.com/netsus/homecook/pull/41",
            draft: false,
            branch: "feature/fe-03-recipe-like",
            head_sha: "old-head",
          },
          closeout: null,
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId,
        now: "2026-04-24T20:12:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
          assertClaudeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "feature/fe-03-recipe-like", created: false };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return "new-head";
          },
          getCurrentBranch() {
            return "feature/fe-03-recipe-like";
          },
          listChangedFiles() {
            return [];
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner() {
          return {
            artifactDir: join(rootDir, ".artifacts", "stage6-ready-rerun-head-refresh"),
            dispatch: { actor: "claude", stage: 6 },
            execution: { mode: "execute", executed: true, sessionId: "ses_stage6_ready_rerun" },
            stageResult: buildReviewStageResult({
              decision: "approve",
              stage: 6,
              reviewedChecklistIds: [CHECKLIST_IDS.frontendDelivery, CHECKLIST_IDS.frontendAcceptance],
              bodyMarkdown: "Stage 6 approved on refreshed head",
              approvedHeadSha: "stale-reviewed-head",
            }),
          };
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            throw new Error("not expected");
          },
          getPullRequestSummary() {
            return {
              state: "OPEN",
              mergedAt: null,
              mergeStateStatus: "CLEAN",
              reviewDecision: null,
              headRefOid: "new-head",
              headRefName: "feature/fe-03-recipe-like",
              isDraft: false,
            };
          },
          markReady() {},
          reviewPullRequest() {
            throw new Error("not expected");
          },
          commentPullRequest() {},
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {},
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId,
      slice: workItemId,
    }).state as {
      prs: { frontend: { head_sha: string | null } | null };
    };

    expect(result.wait).toMatchObject({
      stage: 6,
      pr_role: "frontend",
      head_sha: "new-head",
    });
    expect(runtime.prs.frontend?.head_sha).toBe("new-head");
  });

  it("auto-cleans opencode migration dirtiness without human escalation", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "06-recipe-to-planner");
    const restored: string[][] = [];
    const deleted: string[][] = [];
    let dirty = true;

    createGitWorkspace(workspacePath, "feature/fe-06-recipe-to-planner");
    seedWorktreeBookkeeping(workspacePath, "06-recipe-to-planner", {
      roadmapStatus: "in-progress",
      designStatus: "confirmed",
      authorityStatus: "confirmed",
      uiRisk: "anchor-extension",
      visualArtifact: "required",
    });

    mkdirSync(join(workspacePath, ".opencode"), { recursive: true });
    writeFileSync(
      join(workspacePath, ".opencode", "oh-my-opencode.json"),
      JSON.stringify({ legacy: true }, null, 2),
    );
    writeRuntimeState({
      rootDir,
      workItemId: "06-recipe-to-planner",
      state: {
        ...readRuntimeState({ rootDir, workItemId: "06-recipe-to-planner", slice: "06-recipe-to-planner" }).state,
        slice: "06-recipe-to-planner",
        active_stage: 5,
        current_stage: 5,
        last_completed_stage: 5,
        blocked_stage: 5,
        workspace: { path: workspacePath, branch_role: "frontend" },
        phase: "wait",
        next_action: "run_stage",
        retry: {
          at: "2026-04-15T21:00:00.000Z",
          reason: "claude_budget_unavailable",
          attempt_count: 1,
          max_attempts: 3,
        },
        wait: {
          kind: "blocked_retry",
          pr_role: "frontend",
          stage: 5,
          head_sha: "front-head",
          reason: "claude_budget_unavailable",
          until: "2026-04-15T21:00:00.000Z",
          updated_at: "2026-04-15T20:30:00+09:00",
        },
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 120,
            url: "https://github.com/netsus/homecook/pull/120",
            draft: false,
            branch: "feature/fe-06-recipe-to-planner",
            head_sha: "front-head",
          },
          closeout: null,
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "06-recipe-to-planner",
        now: "2026-04-15T20:40:00+09:00",
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
          assertClaudeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean() {
            if (dirty) {
              throw new Error("Worktree is dirty.");
            }
          },
          checkoutBranch() {
            return { branch: "feature/fe-06-recipe-to-planner", created: false };
          },
          pushBranch() {
            return undefined;
          },
          commitChanges() {
            throw new Error("not expected");
          },
          syncBaseBranch() {
            throw new Error("not expected");
          },
          getHeadSha() {
            return "front-head";
          },
          getCurrentBranch() {
            return "feature/fe-06-recipe-to-planner";
          },
          listChangedFiles() {
            return dirty
              ? [
                  ".opencode/oh-my-opencode.json",
                  ".opencode/oh-my-openagent.json",
                  ".opencode/oh-my-openagent.json.bak.2026-04-15T11-24-02-875Z",
                  ".opencode/oh-my-openagent.json.migrations.json",
                  ".opencode/oh-my-opencode.json.bak",
                ]
              : [];
          },
          restorePaths({ paths }: { paths: string[] }) {
            restored.push(paths);
          },
          deletePaths({ paths }: { paths: string[] }) {
            deleted.push(paths);
            dirty = false;
          },
          getBinaryDiff() {
            return "";
          },
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            return { bucket: "pending", checks: [] };
          },
          getPullRequestSummary() {
            return { mergedAt: null };
          },
          markReady() {},
          reviewPullRequest() {},
          commentPullRequest() {},
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {},
        },
        stageRunner() {
          throw new Error("not expected");
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId: "06-recipe-to-planner",
      slice: "06-recipe-to-planner",
    }).state as {
      wait: { kind: string; reason: string | null };
      recovery: unknown;
    };

    expect(restored).toEqual([[".opencode/oh-my-opencode.json"]]);
    expect(deleted).toEqual([[
      ".opencode/oh-my-openagent.json",
      ".opencode/oh-my-openagent.json.bak.2026-04-15T11-24-02-875Z",
      ".opencode/oh-my-openagent.json.migrations.json",
      ".opencode/oh-my-opencode.json.bak",
    ]]);
    expect(result.wait?.kind).not.toBe("human_escalation");
    expect(runtime.wait?.kind).not.toBe("human_escalation");
    expect(runtime.recovery).toBeNull();
  });
});
