import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readWorkpackChecklistContract } from "../scripts/lib/omo-checklist-contract.mjs";
import { evaluateDocGate } from "../scripts/lib/omo-doc-gate.mjs";
import { validateAuthorityEvidencePresence } from "../scripts/lib/validate-authority-evidence-presence.mjs";
import { validateCloseoutSync } from "../scripts/lib/validate-closeout-sync.mjs";

const root = process.cwd();
const sliceId = "cooking-meal-log-cross-slice-release-qa";
const stage2Branch = "feature/be-cooking-meal-log-cross-slice-release-qa";
const stage2Base = "afb1b31aa6c95ba974f7484d31fa123439d5fcd6";
const stage2PrPath = "https://github.com/netsus/homecook/pull/1377";
const stage2ReviewedHead = "a23a97aa5f4032e3e4bd3fec2fadd86ce996c823";
const stage3ReviewerTask = "01a02119-a472-7433-ac9d-c3d5496bf1a4";
const stage3RequiredFix = "CML14-S3-P1-001";
const stage3RereviewerTask = "01a02129-5945-7381-8aca-ff7673d0b5f3";
const stage3RereviewRequiredFix = "CML14-S3-P1-002";
const stage3RepairSuccessorHead =
  "25802dc7242ead54a758c167c0ed86470b147957";
const stage3ApprovalReviewerTask = "01a02137-5389-7420-a31d-7e42d1bb94dc";
const stage3ApprovedContentHead =
  "c5c475477a26dde3889aec3161c37765ee084d92";
const activeBranch =
  "feature/fe-cooking-meal-log-cross-slice-release-qa-superseding-draft";
const activePrPath = "https://github.com/netsus/homecook/pull/1412";
const stage5ReviewerTask = "01a034d3-69db-70f2-b297-8f7e716b44f4";
const finalAuthorityTask = "01a034da-9a1f-76c0-bef4-47b1a1f481c7";
const stage6ReviewerTask = "01a03507-fc40-7591-8244-e08bf96efc6c";
const stage6ReviewedHead = "0fe74aa08ab94048fbdc6703217ed9f715ad8cd1";
const stage6ReviewedTree = "213b57d86251f908450444d76b1c6a729f15524e";
const stage6ResultPath =
  "docs/workpacks/cooking-meal-log-cross-slice-release-qa/evidence/2026-08-25-stage6-frontend-closeout-result.json";
const approvalProjectionSyncedAt = "2026-08-24T19:41:12Z";
const stage2AuthorEvidencePath =
  "docs/workpacks/cooking-meal-log-cross-slice-release-qa/evidence/2026-08-21-stage2-verification-author.md";
const stage2AuthorCheckedIds = [
  "accept-cooking-cross-automation-env",
  "accept-cooking-cross-automation-final-validator",
  "accept-cooking-cross-automation-git-binding",
  "accept-cooking-cross-automation-local-stack",
  "accept-cooking-cross-automation-performance",
  "accept-cooking-cross-automation-query-count",
  "accept-cooking-cross-automation-rollback",
  "accept-cooking-cross-automation-runtime",
  "accept-cooking-cross-automation-security",
  "accept-cooking-cross-automation-semantic",
  "accept-cooking-cross-happy-isolated",
  "accept-cooking-cross-happy-predecessors",
  "accept-cooking-cross-precondition-evidence",
  "accept-cooking-cross-precondition-isolation",
  "accept-cooking-cross-precondition-local-only",
  "accept-cooking-cross-state-no-invention",
  "accept-cooking-cross-state-separation",
  "accept-cooking-cross-state-stage4-carveout",
  "accept-cooking-cross-state-verification-only",
  "accept-cooking-cross-state-version-rollback",
  "delivery-cooking-cross-stage2-isolated",
  "delivery-cooking-cross-stage2-predecessors",
  "delivery-cooking-cross-stage2-repair-boundary",
];
const stage4ProjectedCheckedIds = [
  "accept-cooking-cross-browser-accessibility",
  "accept-cooking-cross-browser-authority",
  "accept-cooking-cross-browser-home-privacy",
  "accept-cooking-cross-browser-planner-separation",
  "accept-cooking-cross-browser-real-stack",
  "accept-cooking-cross-browser-responsive",
  "accept-cooking-cross-error-base-states",
  "accept-cooking-cross-error-return-action",
  "accept-cooking-cross-error-ui-states",
  "accept-cooking-cross-final-browser-bundle",
  "delivery-cooking-cross-stage4-authority",
  "delivery-cooking-cross-stage4-browser",
  "delivery-cooking-cross-stage4-closeout",
  "delivery-cooking-cross-stage4-states",
  "accept-cooking-cross-final-sha",
  "accept-cooking-cross-final-stage6-bundle",
  "accept-cooking-cross-browser-closeout",
];

function buildSyntheticStage1BaseChecklistContract() {
  const current = readWorkpackChecklistContract({
    rootDir: root,
    slice: sliceId,
  });
  const resetNonManualChecks = <T extends { checked: boolean; manualOnly: boolean }>(
    items: T[],
  ) =>
    items.map((item) =>
      item.manualOnly ? item : { ...item, checked: false },
    );

  return {
    ...current,
    deliveryItems: resetNonManualChecks(current.deliveryItems),
    acceptanceItems: resetNonManualChecks(current.acceptanceItems),
    items: resetNonManualChecks(current.items),
  };
}

function buildSyntheticStage2BaseChecklistContract() {
  const stage1 = buildSyntheticStage1BaseChecklistContract();
  const stage2Checked = new Set(stage2AuthorCheckedIds);
  const projectStage2Checks = <
    T extends {
      checked: boolean;
      manualOnly: boolean;
      metadata?: { id?: string | null } | null;
    },
  >(
    items: T[],
  ): T[] =>
    items.map((item) =>
      item.manualOnly
        ? item
        : { ...item, checked: stage2Checked.has(item.metadata?.id ?? "") },
    );

  return {
    ...stage1,
    deliveryItems: projectStage2Checks(stage1.deliveryItems),
    acceptanceItems: projectStage2Checks(stage1.acceptanceItems),
    items: projectStage2Checks(stage1.items),
  };
}
const approvedPlanPath =
  "docs/workpacks/planner-shell/evidence/cooking-meal-log-and-product-search-master-plan-20260722.md";
const approvedPlanSha =
  "d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d";
const localOnlyAuthority =
  "docs/engineering/supabase-local-only-operations.md";
const officialSources = [
  "docs/sync/CURRENT_SOURCE_OF_TRUTH.md",
  "docs/요구사항기준선-v1.7.34.md",
  "docs/화면정의서-v1.5.38.md",
  "docs/유저flow맵-v1.3.36.md",
  "docs/db설계-v1.3.36.md",
  "docs/api문서-v1.2.41.md",
];
const predecessorRuntimeMerges = [
  ["F0", "a10293e0cf17c4c19204e870024e8fe745e362e3"],
  ["#1", "19f25aae4806d2de584f4508bce88643c176705a"],
  ["#2", "5e9773f5e715e7d63132d7f6b8fadcaafd4b76a0"],
  ["#3", "8085914cb26e9b927fc973c99318c15d9dee86ce"],
  ["#4", "5413b6adc42d0e8c45dc55cafad2b076b9bd61a0"],
  ["#5", "bb870dd0cba5ac52b6d9ad223db2a2935c00bcb9"],
  ["#6", "05683e4d1cf95c4cc3b9a41eb3fa7857b58a3d2d"],
  ["#7", "2173737e8ea2eec2297e1cc0227ce4f2c27c50b9"],
  ["#8", "c16102a3072e929e45bb24a69464cd3110d03db5"],
  ["#9", "8ba3fa5a2a198eb4f9c19d59cea5f6ccc52fdd4f"],
  ["#10", "2185b59d1b460dac916aa4a4a4a5e061c8b795f0"],
  ["#11", "7c7d25a1d4deb930ddcf85611bb57f5fe14f00a0"],
  ["#12", "358450e44da691256b0eeb51d8ae131a520b6cbd"],
  ["#13", "da52e64d84eef7593bd60898018c2b65acad0f46"],
] as const;
const predecessorRegressionMap = [
  [
    "F0",
    "account-session-generation-foundation",
    "a10293e0cf17c4c19204e870024e8fe745e362e3",
    "tests/account-session-generation-foundation.test.ts",
  ],
  [
    "#1",
    "prepared-food-search-relevance",
    "19f25aae4806d2de584f4508bce88643c176705a",
    "tests/prepared-food-search-relevance.test.ts",
  ],
  [
    "#2",
    "product-ingredient-link-foundation",
    "5e9773f5e715e7d63132d7f6b8fadcaafd4b76a0",
    "tests/product-ingredient-link-foundation.test.ts",
  ],
  [
    "#3",
    "recipe-visibility-read-hardening",
    "8085914cb26e9b927fc973c99318c15d9dee86ce",
    "tests/recipe-visibility-read-hardening.test.ts",
  ],
  [
    "#4",
    "recipe-snapshot-authority-foundation",
    "5413b6adc42d0e8c45dc55cafad2b076b9bd61a0",
    "tests/recipe-snapshot-authority.test.ts",
  ],
  [
    "#5",
    "personal-recipe-editor-decoupling",
    "bb870dd0cba5ac52b6d9ad223db2a2935c00bcb9",
    "tests/personal-recipe-editor-contract.test.ts",
  ],
  [
    "#6",
    "personal-recipe-customization-write-core",
    "05683e4d1cf95c4cc3b9a41eb3fa7857b58a3d2d",
    "tests/personal-recipe-customization-write-core.test.ts",
  ],
  [
    "#7",
    "recipe-content-snapshot-future-propagation",
    "2173737e8ea2eec2297e1cc0227ce4f2c27c50b9",
    "tests/recipe-content-snapshot-future-propagation.test.ts",
  ],
  [
    "#8",
    "cooked-batch-weight-ledger",
    "c16102a3072e929e45bb24a69464cd3110d03db5",
    "tests/cooked-batch-weight-ledger.test.ts",
  ],
  [
    "#9",
    "meal-log-core",
    "8ba3fa5a2a198eb4f9c19d59cea5f6ccc52fdd4f",
    "tests/meal-log-core.test.ts",
  ],
  [
    "#10",
    "planner-shell",
    "2185b59d1b460dac916aa4a4a4a5e061c8b795f0",
    "tests/planner-shell-compatibility.test.ts",
  ],
  [
    "#11",
    "cooked-batch-weight-ui",
    "7c7d25a1d4deb930ddcf85611bb57f5fe14f00a0",
    "tests/cooked-batch-weight-ui.test.tsx",
  ],
  [
    "#12",
    "meal-log-ui",
    "358450e44da691256b0eeb51d8ae131a520b6cbd",
    "tests/meal-log-ui.test.tsx",
  ],
  [
    "#13",
    "legacy-product-compat",
    "da52e64d84eef7593bd60898018c2b65acad0f46",
    "tests/legacy-product-compat.test.ts",
  ],
] as const;
const requiredScreens = [
  "ACCOUNT_QUARANTINE",
  "HOME",
  "RECIPE_DETAIL",
  "MANUAL_RECIPE_CREATE",
  "PLANNER_WEEK",
  "COOK_MODE",
  "LEFTOVERS",
  "MEAL_LOG",
] as const;
const designReuseIndex = [
  [
    "ACCOUNT_QUARANTINE",
    "ui/designs/ACCOUNT_QUARANTINE.md",
    "ui/designs/critiques/ACCOUNT_QUARANTINE-critique.md",
    "ui/designs/authority/ACCOUNT_QUARANTINE-authority.md",
  ],
  [
    "HOME",
    "ui/designs/HOME.md",
    "ui/designs/critiques/HOME-service-about-guide-critique.md",
    "ui/designs/authority/HOME-service-brand-image-assets-authority.md",
  ],
  [
    "RECIPE_DETAIL",
    "ui/designs/RECIPE_DETAIL.md",
    "ui/designs/critiques/recipe-content-snapshot-future-propagation-design-critic.md",
    "ui/designs/authority/recipe-content-snapshot-future-propagation-authority.md",
  ],
  [
    "MANUAL_RECIPE_CREATE",
    "ui/designs/MANUAL_RECIPE_CREATE.md",
    "ui/designs/critiques/MANUAL_RECIPE_CREATE-critique.md",
    "ui/designs/authority/DESIGN_POLISH_SLICE5_MANUAL_YOUTUBE-authority.md",
  ],
  [
    "PLANNER_WEEK",
    "ui/designs/PLANNER_WEEK.md",
    "ui/designs/critiques/PLANNER_WEEK-critique.md",
    "ui/designs/authority/PLANNER_WEEK-authority.md",
  ],
  [
    "COOK_MODE",
    "ui/designs/COOK_MODE.md",
    "ui/designs/critiques/COOK_MODE-cooked-batch-weight-ui-critique.md",
    "docs/workpacks/cooked-batch-weight-ui/evidence/2026-08-10-final-authority-p2-repair-rereview.md",
  ],
  [
    "LEFTOVERS",
    "ui/designs/LEFTOVERS.md",
    "ui/designs/critiques/LEFTOVERS-cooked-batch-weight-ui-critique.md",
    "docs/workpacks/cooked-batch-weight-ui/evidence/2026-08-10-final-authority-p2-repair-rereview.md",
  ],
  [
    "MEAL_LOG",
    "ui/designs/MEAL_LOG.md",
    "ui/designs/critiques/MEAL_LOG-critique.md",
    "ui/designs/authority/MEAL_LOG-authority.md",
  ],
] as const;
const attemptEvidenceRoot =
  ".artifacts/cooking-meal-log-cross-slice-release-qa/attempts/<attempt_id>";
const manifestEvidencePath = `${attemptEvidenceRoot}/manifest.json`;
const dbEvidencePath = `${attemptEvidenceRoot}/db-security.json`;
const securityEvidencePath = `${attemptEvidenceRoot}/security.json`;
const performanceEvidencePath = `${attemptEvidenceRoot}/performance.json`;
const queryCountEvidencePath = `${attemptEvidenceRoot}/query-count.json`;
const rollbackEvidencePath = `${attemptEvidenceRoot}/rollback.json`;
const stage1ApprovalEvidencePath =
  "docs/workpacks/cooking-meal-log-cross-slice-release-qa/evidence/2026-08-21-stage1-final-independent-approvals.json";
const stage1ReviewedHead =
  "2c33b38cf9f3badb72d610ad7a47abe70bf8907f";
const stage1ReviewedTree =
  "23fab93ab372174b9f531cf3414b348b1a724894";
const readyReviewedHead =
  "a61ec360d959d4be720a94f08b8b833ae50deab6";
const readyReviewedTree =
  "ad19c9186326dad58d8023f70543f641c2d82264";
const stage1ApprovalTasks = [
  ["internal1.5", "01a01f2e-ae07-7f42-88be-87727228702a"],
  ["security/DB/operations", "01a01f2e-b2ed-7f32-bbaf-204b58613435"],
  ["five-axis", "01a01f2e-ba20-7022-8b3b-5b90d15572d0"],
  ["design-authority-plan", "01a01f2e-bf69-7f23-9c7c-7982855195bc"],
] as const;
const closedStage1FindingLineage = [
  "CML14-I15-P1-001",
  "CML14-I15-P1-002",
  "CML14-I15-P2-001",
  "CML14-I15R-P1-001",
  "CML14-I15R-P1-002",
  "CML14-I15F-P1-001",
  "CML14-I15T-P1-001",
  "CML14-FIVE-P1-001",
  "CML14-FIVE-P1-002",
  "CML14-FIVE-P1-003",
  "CML14-FIVE-P1-004",
  "CML14-FIVE-P1-005",
  "CML14-FIVE-P2-001",
  "CML14-SDO-RR-P1-001",
  "CML14-SDO-RR-P1-002",
  "CML14-SDO-FINAL-P1-001",
  "CML14-SDO-FINAL-P1-003",
  "CML14-SDO-FINAL-P2-001",
  "CML14-SDO-SYMLINK-P1-001",
  "P1-CML14-EVID-01",
  "P1-CML14-EVID-02",
  "P2-CML14-EVID-03",
  "P1-CML14-EVID-04",
  "P2-CML14-EVID-05",
  "P1-DA14-01",
  "P1-DA14-02",
  "P2-DA14-03",
  "P1-DA14-RR-01",
  "P2-DA14-RR-02",
] as const;

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

function readJson(relativePath: string) {
  return JSON.parse(read(relativePath));
}

describe("cooking meal-log cross-slice Stage 1 relock", () => {
  const readme = read(`docs/workpacks/${sliceId}/README.md`);
  const acceptance = read(`docs/workpacks/${sliceId}/acceptance.md`);
  const automation = readJson(
    `docs/workpacks/${sliceId}/automation-spec.json`,
  );
  const workItem = readJson(`.workflow-v2/work-items/${sliceId}.json`);
  const workflowStatus = readJson(".workflow-v2/status.json");
  const status = workflowStatus.items.find(
    (item: { id: string }) => item.id === sliceId,
  );
  const roadmap = read("docs/workpacks/README.md");
  const exactSix = [
    roadmap,
    readme,
    acceptance,
    JSON.stringify(automation),
    JSON.stringify(workItem),
    JSON.stringify(status),
  ].join("\n");

  it("locks the current official tuple and retained approved plan", () => {
    expect(workItem.docs_refs.source_of_truth).toEqual(officialSources);
    for (const source of officialSources) {
      expect(exactSix).toContain(source);
    }

    expect(exactSix).toContain(approvedPlanPath);
    expect(exactSix).toContain(approvedPlanSha);
    expect(exactSix).toContain("1,018 lines");
    expect(exactSix).not.toContain("1,056 lines");
    expect(exactSix).not.toContain(
      "/Users/shj/2025/2026/homecook1/.omx/plans/",
    );

    const approvedPlan = readFileSync(join(root, approvedPlanPath));
    expect(createHash("sha256").update(approvedPlan).digest("hex")).toBe(
      approvedPlanSha,
    );
    expect(approvedPlan.toString("utf8").match(/\n/gu)).toHaveLength(1_018);
  });

  it("keeps Stage 1 history while projecting the approved Stage 6 checkpoint", () => {
    expect(roadmap).toMatch(
      /\| `cooking-meal-log-cross-slice-release-qa` \| in-progress \|/u,
    );
    expect(workItem.status).toEqual({
      lifecycle: "in_progress",
      approval_state: "codex_approved",
      verification_status: "pending",
      evaluation_status: "passed",
      evaluation_round: 8,
      last_evaluator_result:
        `Stage 6 task ${stage6ReviewerTask} APPROVE P0/P1/P2 0/0/0 at ${stage6ReviewedHead}; CML14-S6-P1-001 CLOSED; Ready/internal 6.5 pending`,
      auto_merge_eligible: false,
      blocked_reason_code: null,
    });
    expect(status).toMatchObject({
      branch: activeBranch,
      pr_path: activePrPath,
      ...workItem.status,
    });
    expect(exactSix).toContain(stage2Branch);
    expect(exactSix).toContain(stage2Base);
    expect(readme).toContain("## Stage 1 Historical Gate");
    expect(readme).toContain(
      "활성 lifecycle/approval/verification/evaluation은 `in_progress / codex_approved / pending / passed`",
    );
    expect(readme).toContain(stage2PrPath);
    expect(readme).toContain(stage3ApprovedContentHead);
    expect(readme).toContain(stage3ApprovalReviewerTask);
  });

  it("projects independent Stage 6 without promoting Ready or merge", () => {
    const approvalResult =
      `Stage 6 task ${stage6ReviewerTask} APPROVE P0/P1/P2 0/0/0 at ${stage6ReviewedHead}; CML14-S6-P1-001 CLOSED; Ready/internal 6.5 pending`;

    expect(workItem.status).toEqual({
      lifecycle: "in_progress",
      approval_state: "codex_approved",
      verification_status: "pending",
      evaluation_status: "passed",
      evaluation_round: 8,
      last_evaluator_result: approvalResult,
      auto_merge_eligible: false,
      blocked_reason_code: null,
    });
    expect(status).toMatchObject({
      branch: activeBranch,
      pr_path: activePrPath,
      ...workItem.status,
    });
    expect(workItem.closeout).toMatchObject({
      merge_gate_projection: {
        current_head_sha: stage6ReviewedHead,
        approval_state: "codex_approved",
        all_checks_green: false,
      },
      repair_summary: {
        latest_reason_code: "stage6-approved-closeout-projection",
      },
      projection_state: {
        docs_synced_at: approvalProjectionSyncedAt,
        status_synced_at: approvalProjectionSyncedAt,
        pr_body_synced_at: approvalProjectionSyncedAt,
      },
    });
    expect(
      workItem.closeout.verification_projection.actual_verification_refs,
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(stage5ReviewerTask),
        expect.stringContaining(finalAuthorityTask),
        expect.stringContaining(stage6ReviewerTask),
        expect.stringContaining(stage6ReviewedHead),
        expect.stringContaining(stage6ReviewedTree),
        expect.stringContaining("734 passed"),
      ]),
    );
    expect(workItem.closeout.repair_summary.evidence_sources).toEqual(
      expect.arrayContaining([
        `Codex_task_${stage5ReviewerTask}`,
        `Codex_task_${finalAuthorityTask}`,
        `Codex_task_${stage6ReviewerTask}`,
        `GitHub_PR_1412_head_${stage6ReviewedHead}`,
      ]),
    );
    expect(readme).toContain(
      "활성 lifecycle/approval/verification/evaluation은 `in_progress / codex_approved / pending / passed`",
    );
    expect(readme).toContain(stage3ApprovedContentHead);
    expect(readme).toContain(stage3ApprovalReviewerTask);
    expect(readme).toContain("APPROVE P0/P1/P2 `0/0/0`");
    expect(readme).toContain("CML14-S3-P1-001`과 `CML14-S3-P1-002`는 CLOSED");
    expect(readme).toContain("Ready/internal 6.5/merge");
  });

  it("preserves Stage 1 to 5 history while only approved Stage 6 items advance", () => {
    expect(existsSync(join(root, stage1ApprovalEvidencePath))).toBe(true);
    if (!existsSync(join(root, stage1ApprovalEvidencePath))) {
      return;
    }
    const approvalEvidence = readJson(stage1ApprovalEvidencePath);

    expect(approvalEvidence).toMatchObject({
      artifact_type: "stage1_final_independent_approvals",
      slice: sliceId,
      pr_path: "https://github.com/netsus/homecook/pull/1373",
      reviewed_head: stage1ReviewedHead,
      reviewed_tree: stage1ReviewedTree,
      projection_boundary: {
        stage1_approved: true,
        stage2_started: false,
        runtime_complete: false,
        full_8_lane_287041_complete: false,
        manual_complete: false,
        activation_complete: false,
        auto_merge: false,
      },
    });
    expect(approvalEvidence.reviews).toHaveLength(4);
    expect(approvalEvidence.ready_confirmation).toMatchObject({
      reviewed_head: readyReviewedHead,
      reviewed_tree: readyReviewedTree,
      approval_state: "codex_approved",
      ready: "YES",
      checks: {
        unique_contexts: 14,
        success: 12,
        intended_skips: 2,
        bad: 0,
      },
    });
    expect(
      approvalEvidence.ready_confirmation.reviews.map(
        (review: { role: string; task_id: string }) => [
          review.role,
          review.task_id,
        ],
      ),
    ).toEqual(stage1ApprovalTasks);
    for (const review of approvalEvidence.ready_confirmation.reviews) {
      expect(review).toMatchObject({
        verdict: "APPROVE",
        counts: { p0: 0, p1: 0, p2: 0 },
        drift_count: 0,
        unresolved_required_findings: [],
        ready: "YES",
      });
    }
    expect(approvalEvidence.closed_finding_lineage).toEqual(
      closedStage1FindingLineage,
    );
    expect(
      approvalEvidence.reviews.map(
        (review: { role: string; task_id: string }) => [
          review.role,
          review.task_id,
        ],
      ),
    ).toEqual(stage1ApprovalTasks);
    for (const review of approvalEvidence.reviews) {
      expect(review).toMatchObject({
        verdict: "APPROVE",
        counts: { p0: 0, p1: 0, p2: 0 },
        drift_count: 0,
        unresolved_required_findings: [],
      });
    }

    expect(workItem.docs_refs.governing_docs).toContain(
      stage1ApprovalEvidencePath,
    );
    expect(workItem.status).toEqual({
      lifecycle: "in_progress",
      approval_state: "codex_approved",
      verification_status: "pending",
      evaluation_status: "passed",
      evaluation_round: 8,
      last_evaluator_result:
        `Stage 6 task ${stage6ReviewerTask} APPROVE P0/P1/P2 0/0/0 at ${stage6ReviewedHead}; CML14-S6-P1-001 CLOSED; Ready/internal 6.5 pending`,
      auto_merge_eligible: false,
      blocked_reason_code: null,
    });
    expect(status).toMatchObject(workItem.status);
    expect(workItem.closeout).toMatchObject({
      phase: "projecting",
      docs_projection: {
        roadmap_lifecycle: "in_progress",
        design_status: "confirmed",
        delivery_checklist: "pending",
        design_authority: "passed",
        acceptance: "pending",
        automation_spec_metadata: "synced",
      },
      verification_projection: {
        required_checks: "pending",
        external_smokes: "pending",
      },
      merge_gate_projection: {
        current_head_sha: stage6ReviewedHead,
        approval_state: "codex_approved",
        all_checks_green: false,
      },
    });
    expect(workItem.closeout.projection_state).toEqual({
      docs_synced_at: approvalProjectionSyncedAt,
      status_synced_at: approvalProjectionSyncedAt,
      pr_body_synced_at: approvalProjectionSyncedAt,
    });
    expect(
      workItem.closeout.verification_projection.actual_verification_refs,
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(stage2PrPath),
        expect.stringContaining(stage2ReviewedHead),
        expect.stringContaining(stage3ReviewerTask),
        expect.stringContaining(stage3RequiredFix),
        expect.stringContaining("REQUEST_CHANGES"),
        expect.stringContaining(stage3RereviewerTask),
        expect.stringContaining(stage3RereviewRequiredFix),
        expect.stringContaining(stage3RepairSuccessorHead),
        expect.stringContaining(stage3ApprovalReviewerTask),
        expect.stringContaining("APPROVE P0/P1/P2 0/0/0"),
      ]),
    );
    const actualVerificationRefs =
      workItem.closeout.verification_projection.actual_verification_refs.join(
        "\n",
      );
    expect(actualVerificationRefs).toContain(stage2AuthorEvidencePath);
    expect(actualVerificationRefs).toContain("deterministic 137/137");
    expect(actualVerificationRefs).toContain("stage2-proof-cb775ed9-20260821");
    expect(actualVerificationRefs).toContain(stage6ResultPath);
    expect(status.notes).toContain(stage6ReviewerTask);
    expect(status.notes).toContain("Ready/internal 6.5");
    expect(status.notes).toContain("closeout_phase=projecting");

    for (const value of [
      stage1ApprovalEvidencePath,
      stage1ReviewedHead,
      stage1ReviewedTree,
      ...stage1ApprovalTasks.flatMap(([role, taskId]) => [role, taskId]),
      "APPROVE 0/0/0",
      "drift 0",
      "Stage 2 verification-only",
      stage2Base,
      "v1.7.33",
      "v1.5.37",
      "v1.3.35",
      "DB v1.3.35",
      "API v1.2.40",
    ]) {
      expect(exactSix).toContain(value);
    }
    expect(roadmap).toMatch(
      /\| `cooking-meal-log-cross-slice-release-qa` \| in-progress \|[^\n]*PR #1412[^\n]*Stage 5 `APPROVE 0\/0\/2`[^\n]*final authority `PASS 0\/0\/2`[^\n]*Stage 6 `APPROVE 0\/0\/0`/u,
    );
    const checkedIds = readWorkpackChecklistContract({
      rootDir: root,
      slice: sliceId,
    }).items
      .filter((item) => !item.manualOnly && item.checked)
      .map((item) => item.metadata?.id)
      .sort();
    expect(checkedIds).toEqual(
      [...stage2AuthorCheckedIds, ...stage4ProjectedCheckedIds].sort(),
    );
    expect(exactSix).toContain(stage2AuthorEvidencePath);
    expect(acceptance).toMatch(
      /\[x\] pinned isolated local verification passes without product or production mutation/u,
    );
    expect(readme).toContain(
      "Stage 1~6과 final authority의 proven projection을 반영한다.",
    );
    expect(readme).not.toContain("approval is intentionally not started");
  });

  it("pins every predecessor automated/runtime merge without promoting Manual state", () => {
    for (const [order, merge] of predecessorRuntimeMerges) {
      expect(readme).toContain(order);
      expect(readme).toContain(merge);
    }
    for (const required of [
      "automated/runtime predecessor gate: satisfied",
      "overall lifecycle is not complete",
      "Manual/server-Mac/OAuth/device/AT/full-WCAG",
      "local-production/rehearsal/backup-restore/cutover",
      "capability/R/R+1/R+2/required-key/activation",
    ]) {
      expect(exactSix).toContain(required);
    }
  });

  it("records the approved Stage 4 isolated HTTPS issuer carve-out as docs-governance only", () => {
    for (const required of [
      "official 5 product docs CSoT impact: N/A",
      "approved disposable isolated rehearsal only",
      "fresh ownership-attested disposable project only",
      "reserved production-shaped HTTPS issuer claim",
      "loopback-only transport",
      "JWKS loopback only",
      "DNS/TLS/public request 0",
      "rehearsal_only",
      "cleanup-owned-only",
      "fail-closed",
      "canonical real transition procedures",
      "production/non-disposable mutation remains forbidden",
    ]) {
      expect(exactSix).toContain(required);
    }
    expect(readme).toContain("Approved Contract Evolution Scope");
    expect(acceptance).toContain("rehearsal_only");
    expect(roadmap).toContain("approved disposable isolated rehearsal only");
    expect(JSON.stringify(automation)).toContain(
      "stage4-disposable-isolated-rehearsal-only",
    );
    expect(JSON.stringify(automation)).toContain(
      "fresh-ownership-attested-disposable-isolated-project-only",
    );
    expect(JSON.stringify(automation)).toContain(
      "canonical-real-transition-procedures-use-cas-digest-quarantine-session-semantics",
    );
  });

  it("treats MEAL_LOG predecessor design evidence as merged, not future", () => {
    for (const artifact of [
      "ui/designs/MEAL_LOG.md",
      "ui/designs/critiques/MEAL_LOG-critique.md",
      "ui/designs/authority/MEAL_LOG-authority.md",
      "docs/workpacks/meal-log-ui/omo-report.md",
    ]) {
      expect(existsSync(join(root, artifact))).toBe(true);
      expect(workItem.docs_refs.governing_docs).toContain(artifact);
    }
    expect(exactSix).not.toContain("future #12-owned");
    expect(exactSix).not.toContain("not current evidence");
  });

  it("uses only the active local-only Supabase gate", () => {
    expect(exactSix).toContain(localOnlyAuthority);
    expect(workItem.docs_refs.governing_docs).toContain(localOnlyAuthority);

    const executableProjection = [
      ...automation.backend.verify_commands,
      ...automation.frontend.verify_commands,
      ...workItem.verification.required_checks,
      ...workItem.verification.verify_commands,
      ...status.required_checks,
    ].join("\n");
    expect(executableProjection).not.toMatch(
      /local-first|verify[^\n]*remote|--linked|supabase link|db push/iu,
    );
    expect(executableProjection).toContain(
      `BRANCH_NAME=${stage2Branch} pnpm validate:workpack`,
    );
    expect(executableProjection).not.toContain(
      "BRANCH_NAME=docs/cooking-meal-log-cross-slice-relock",
    );
    expect(exactSix).toContain("Cloud/linked/remote Supabase is forbidden/N/A");
  });

  it("references only existing focused tests and keeps runtime checks separate", () => {
    const commands = [
      ...automation.backend.verify_commands,
      ...automation.frontend.verify_commands,
      ...workItem.verification.required_checks,
      ...workItem.verification.verify_commands,
    ];
    const testRefs = commands.flatMap((command: string) =>
      command.match(/tests\/[\w./-]+\.test\.tsx?/gu) ?? [],
    );
    expect(testRefs).toContain(
      "tests/cooking-meal-log-cross-slice-release-qa.test.ts",
    );
    for (const testRef of testRefs) {
      expect(existsSync(join(root, testRef)), testRef).toBe(true);
    }
    expect(workItem.verification.required_checks).toEqual(
      workItem.verification.verify_commands,
    );
    expect(status.required_checks).toEqual(
      workItem.verification.required_checks,
    );
  });

  it("maps every predecessor merge to an owning focused regression command", () => {
    const expectedMappings = predecessorRegressionMap.map(
      ([order, id, merge, target]) =>
        `${order} ${id}@${merge} -> ${target}`,
    );
    const actualMappings = automation.backend.required_test_targets.filter(
      (target: string) => /^(?:F0|#\d+) /u.test(target),
    );
    expect(actualMappings).toEqual(expectedMappings);

    const commands = automation.backend.verify_commands.join("\n");
    for (const [, , , target] of predecessorRegressionMap) {
      expect(existsSync(join(root, target)), target).toBe(true);
      expect(commands).toContain(target);
    }
  });

  it("keeps Stage 1 bookkeeping narrative out of runtime acceptance ownership", () => {
    const checklist = readWorkpackChecklistContract({
      rootDir: root,
      slice: sliceId,
    });
    const runtimeItems = checklist.items.filter(
      (item) => !item.manualOnly,
    );
    for (const item of runtimeItems) {
      expect(item.text).not.toMatch(
        /Stage 1|internal 1\.5|five-axis|design-authority-plan|exact-six projection/iu,
      );
    }

    expect(acceptance).toContain("## Stage 1 Current Gate Evidence");
    expect(acceptance).toContain("01a01f2e-ae07-7f42-88be-87727228702a");
    expect(acceptance).toContain("01a01f2e-b2ed-7f32-bbaf-204b58613435");
    expect(acceptance).toContain("01a01f2e-ba20-7022-8b3b-5b90d15572d0");
    expect(acceptance).toContain("01a01f2e-bf69-7f23-9c7c-7982855195bc");
  });

  it("splits backend and browser evidence ownership around one final evidence SHA", () => {
    const checklist = readWorkpackChecklistContract({
      rootDir: root,
      slice: sliceId,
    });
    const byId = (id: string) =>
      checklist.items.find(
        (item) => String(item.metadata?.id ?? "") === id,
      );
    expect(byId("accept-cooking-cross-final-backend-bundle")).toMatchObject({
      metadata: { stage: 2, scope: "backend", review: [3, 6] },
    });
    expect(byId("accept-cooking-cross-final-browser-bundle")).toMatchObject({
      metadata: { stage: 4, scope: "frontend", review: [5, 6] },
    });
    expect(byId("accept-cooking-cross-final-stage6-bundle")).toMatchObject({
      metadata: { stage: 4, scope: "shared", review: [6] },
    });

    const projection = [
      readme,
      acceptance,
      JSON.stringify(automation),
      JSON.stringify(workItem),
    ].join("\n");
    for (const required of [
      "FINAL_EVIDENCE_SHA",
      manifestEvidencePath,
      "after Stage 4 artifacts",
      "complete backend/isolated/security/performance/rollback + browser/design bundle",
      "before Stage 6",
    ]) {
      expect(projection).toContain(required);
    }
  });

  it("sets a docs-only repair budget and zero inline runtime fix rounds", () => {
    expect(automation.max_fix_rounds).toEqual({ backend: 0, frontend: 0 });
    expect(automation.notes).toContain("docs repair budget max 3");
    expect(workItem.workflow.max_fix_rounds).toEqual({
      docs: 3,
      backend: 0,
      frontend: 0,
    });
    expect(exactSix).toContain("separate failing-test-first TDD repair PR");
    expect(exactSix).toContain("full rerun after its merge");
  });

  it("defines machine-checkable DB performance rollback and N+1 evidence", () => {
    const projection = [
      acceptance,
      JSON.stringify(automation),
      JSON.stringify(workItem),
    ].join("\n");
    for (const path of [
      manifestEvidencePath,
      dbEvidencePath,
      securityEvidencePath,
      rollbackEvidencePath,
      queryCountEvidencePath,
      performanceEvidencePath,
    ]) {
      expect(projection).toContain(path);
    }
    for (const threshold of [
      "DB p95 <= 300ms",
      "route p95 <= 600ms",
      "Recall@20 >= 0.90",
      "Precision@20 >= 0.75",
      "list20_query_count <= list1_query_count + 1",
      "item-level N+1 = 0",
    ]) {
      expect(projection).toContain(threshold);
    }
  });

  it("locks the eight-screen state and merged design reuse matrices", () => {
    const authority = automation.frontend.design_authority;
    expect(authority.required_screens).toEqual(requiredScreens);
    expect(authority.generator_required).toBe(false);
    expect(authority.critic_required).toBe(false);
    expect(authority.generator_artifact).toBe(
      "ui/designs/ACCOUNT_QUARANTINE.md",
    );
    expect(authority.critic_artifact).toBe(
      "ui/designs/critiques/ACCOUNT_QUARANTINE-critique.md",
    );
    expect(authority.authority_report_paths).toEqual([
      "ui/designs/authority/cooking-meal-log-cross-slice-release-qa-authority.md",
    ]);

    for (const [screen, design, critique, finalAuthority] of designReuseIndex) {
      const indexEntry =
        `design-reuse:${screen}|design=${design}|critic=${critique}|authority=${finalAuthority}`;
      expect(automation.frontend.artifact_assertions).toContain(indexEntry);
      expect(workItem.verification.artifact_assertions).toContain(indexEntry);
      expect(automation.frontend.required_states).toEqual(
        expect.arrayContaining([expect.stringMatching(new RegExp(`^${screen}=`))]),
      );
      for (const artifact of [design, critique, finalAuthority]) {
        expect(existsSync(join(root, artifact)), artifact).toBe(true);
        expect(workItem.docs_refs.governing_docs).toContain(artifact);
      }
    }

    const home = read("ui/designs/HOME.md");
    expect(home).toContain("--brand CTA");
    expect(home).toContain("overflow-x: auto");
    expect(home).toContain("document.documentElement.scrollWidth === clientWidth");
    expect(home).toContain("primary CTA");
    expect(home).toContain("scroll containment");
    expect(home).toContain(
      "새 composition, behavior, interaction 또는 authority verdict를 추가·변경하지 않는다",
    );
    expect(automation.frontend.artifact_assertions).toContain(
      "home-reuse-existing-primary-cta=ui/designs/HOME.md#Empty-Error---brand-CTA",
    );
    expect(automation.frontend.artifact_assertions).toContain(
      "home-reuse-existing-scroll-containment=ui/designs/HOME.md#rail-overflow-x-auto|page-overflow-0|document-scrollWidth-clientWidth",
    );
    expect(automation.frontend.artifact_assertions).toContain(
      "home-discoverability-addendum-semantic-no-op=no-new-composition-behavior-interaction-authority-verdict",
    );
  });

  it("uses attempt-scoped repo-owned producers and a fail-closed final validator", () => {
    const packageJson = readJson("package.json");
    expect(packageJson.scripts).toMatchObject({
      "verify:cooking-meal-log-release:produce":
        "node scripts/run-cooking-meal-log-release-evidence.mjs",
      "verify:cooking-meal-log-release:validate":
        "node scripts/validate-cooking-meal-log-release-evidence.mjs",
    });

    const commands = automation.backend.verify_commands.join("\n");
    expect(commands).toContain("verify:cooking-meal-log-release:produce");
    expect(commands).toContain("verify:cooking-meal-log-release:validate");
    expect(commands).toContain("--attempt-id");
    expect(commands).toContain("--head-sha");
    expect(commands).toContain("--expected-head");
    expect(commands).not.toContain(
      "tests/account-session-generation-postgres.integration.test.ts tests/recipe-visibility-read-hardening-postgres.integration.test.ts",
    );

    const projection = [
      readme,
      acceptance,
      JSON.stringify(automation),
      JSON.stringify(workItem),
    ].join("\n");
    for (const required of [
      attemptEvidenceRoot,
      "attempt_id",
      "head_sha",
      "generated_at",
      "passed > 0",
      "skipped = 0",
      "pending = 0",
      "failed = 0",
      "create-only",
      "stale artifact",
      "actual-route-service-boundary",
      "loop/callback",
      "pinned_isolated_local=true",
      "remote_linked_cloud_access=0",
      "mutation_inventory",
      "current_and_previous=true",
      "single shared generated_at",
      "git rev-parse HEAD",
      "clean worktree",
      "lane-specific allowlist",
    ]) {
      expect(projection).toContain(required);
    }
  });

  it("keeps non-Draft authority validation owned only by the fresh #14 report", () => {
    const authorityReportPath =
      "ui/designs/authority/cooking-meal-log-cross-slice-release-qa-authority.md";
    const results = validateAuthorityEvidencePresence({
      rootDir: root,
      env: {
        ...process.env,
        BRANCH_NAME: `feature/fe-${sliceId}`,
        PR_IS_DRAFT: "false",
      },
    });
    expect(results).toEqual([]);
    expect(
      workItem.closeout.verification_projection.authority_reports,
    ).toEqual([authorityReportPath]);
    const serialized = JSON.stringify(
      workItem.closeout.verification_projection.authority_reports,
    );
    for (const predecessorAuthority of designReuseIndex.map(
      ([, , , authority]) => authority,
    )) {
      expect(serialized).not.toContain(predecessorAuthority);
    }
  });

  it("keeps the approved Stage 6 projection valid while the PR remains Draft", () => {
    const currentChecklistContract = readWorkpackChecklistContract({
      rootDir: root,
      slice: sliceId,
    });
    const stage2BaseChecklistContract =
      buildSyntheticStage2BaseChecklistContract();
    expect(stage2BaseChecklistContract.errors).toEqual([]);
    expect(
      stage2BaseChecklistContract.items.map((item) => item.metadata?.id),
    ).toEqual(currentChecklistContract.items.map((item) => item.metadata?.id));
    expect(
      stage2BaseChecklistContract.items.filter(
        (item) => !item.manualOnly && item.checked,
      ).map((item) => item.metadata?.id).sort(),
    ).toEqual([...stage2AuthorCheckedIds].sort());

    const results = validateCloseoutSync({
      rootDir: root,
      changedFiles: [
        "docs/workpacks/cooking-meal-log-cross-slice-release-qa/README.md",
        "docs/workpacks/cooking-meal-log-cross-slice-release-qa/acceptance.md",
      ],
      env: {
        ...process.env,
        BASE_REF: "missing-shallow-base",
        BRANCH_NAME: activeBranch,
        PR_IS_DRAFT: "true",
      },
      readBaseChecklistContract: () => stage2BaseChecklistContract,
    });
    expect(results).toEqual([]);
  });

  it("keeps Stage 2 verification-only and all mutations authority-gated", () => {
    for (const required of [
      "verification-only",
      "separate failing-test-first TDD repair PR",
      "Stage 2 must not execute Manual Only or local-production mutations",
      "controlled full-local read-only",
      "pinned isolated local",
      "no endpoint, field, status, error, action, screen, migration, or dependency",
    ]) {
      expect(exactSix).toContain(required);
    }
    expect(exactSix).not.toContain(
      "node scripts/verify-cooking-meal-log-cross-slice-release-qa-local-first.mjs",
    );
  });

  it("passes the deterministic Stage 1 document gate", () => {
    const docGate = evaluateDocGate({ rootDir: root, slice: sliceId });
    expect(docGate.outcome, docGate.summary).toBe("pass");
    expect(docGate.findings).toEqual([]);
  });
});
