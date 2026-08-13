import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readWorkpackChecklistContract } from "../scripts/lib/omo-checklist-contract.mjs";
import { evaluateDocGate } from "../scripts/lib/omo-doc-gate.mjs";

const root = process.cwd();
const sliceId = "meal-log-ui";
const initialRelockBase = "16cfce44d32d5b618742a0e20460df4772a19142";
const finalRelockBase = "c12afbccd15f4935a1a52b9f2c2c23882a5033ff";
const latestMasterBase = "c4045705ef72c76f7e7258d10c460f56b6847dd7";
const latestMasterContent = "a625aefa7baab63f183a9d46e6f12d607d4e017f";
const latestMasterMerge = "0e7fe07a5719dd3f4e9833d163c25c47e8d8e375";
const securityReviewedHead = "3708cd9fe3e86a85db17946b165ee6456c596af6";
const securityMasterBase = "fb1119baae72862efefdb1cad13cc811bbd91a1c";
const securityMasterMerge = "f79cc89895e19e388422c4799f23cca5c095d6c0";
const securityMasterMergeTree = "b1bc3500da9ef9cbd0fb0b75359cac1d4abdd2f9";
const mealLogCoreMerge = "8ba3fa5a2a198eb4f9c19d59cea5f6ccc52fdd4f";
const mealLogCheckpointMerge = "4597ca835ba81307d0bdf9e1b1c41806b17e7a68";
const plannerShellMerge = "2185b59d1b460dac916aa4a4a4a5e061c8b795f0";
const approvedPlanSha =
  "d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d";
const approvedPlanPath =
  "docs/workpacks/planner-shell/evidence/cooking-meal-log-and-product-search-master-plan-20260722.md";
const stage1TestCommand =
  "pnpm exec vitest run tests/meal-log-ui-stage1-relock.test.ts tests/workflow-v2-docs.test.ts tests/omo-automation-spec.test.ts tests/omo-bookkeeping.test.ts tests/omo-doc-gate.test.ts tests/source-of-truth-sync.test.ts";
const localOnlySmokeEvidenceCommand =
  "pnpm validate:real-smoke-presence -- --slice meal-log-ui";
const designGeneratorTask = "019ffb5f-b4be-7153-84b8-e4f341bd5ae5";
const designGeneratorHead = "1b44bb7238cc6d0381805585f371fe12e0cb90f0";
const designGeneratorTree = "851ceaa34835b7f5288590a3f0b74f7666e50eb7";
const designRepairTask = "019ffb73-1f48-7832-8d18-b043209f208a";
const designRepairHead = "910d14e99e71c9a05aa623cbf0a9c3b6f1f9456b";
const designRepairTree = "a578bf1d8da21a3bce230051399c6be1fd9da78c";
const designRereviewTask = "019ffb81-4bad-7353-b92b-add4924a4a40";
const designRereviewHead = "1da1a186b99044d12fc9a940321a9bbefe44ae07";
const designRereviewTree = "c09dd364c8523ffc975836ab5df2c9db9388e3fe";
const latestDesignRepairTask = "019ffbbc-d4f1-7730-be56-0d8d6d28ce8c";
const latestDesignHead = "e2959ef523e57770a4cb2b490f7b00a972ab8845";
const latestDesignTree = "7932fc6d026d9f2c0aa963041efcf315be12c9e9";
const latestDesignBlob = "9bade6235acd9c6f60d128216260d9c0408718c2";
const latestDesignReviewTask = "019ffbc5-0c4a-7b11-afd9-6346a76b762c";
const latestCritiqueCommit = "4e1bdaae2335fd41bb46db1ede5d835a2f164faa";
const latestCritiqueTree = "467f698b61775eea81487aaddf2aeac91bea1e00";

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

function readJson(relativePath: string) {
  return JSON.parse(read(relativePath));
}

describe("meal-log-ui fresh Stage 1 relock", () => {
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
  const design = read("ui/designs/MEAL_LOG.md");
  const critique = read("ui/designs/critiques/MEAL_LOG-critique.md");

  it("passes the actual Stage 1 doc gate and checklist contract", () => {
    const docGate = evaluateDocGate({ rootDir: root, slice: sliceId });
    const checklist = readWorkpackChecklistContract({
      rootDir: root,
      slice: sliceId,
    });

    expect(docGate.outcome, docGate.summary).toBe("pass");
    expect(docGate.findings).toEqual([]);
    expect(checklist.errors).toEqual([]);
  });

  it("locks the latest official tuple and repository-owned plan bytes", () => {
    expect(workItem.docs_refs.source_of_truth).toEqual([
      "docs/sync/CURRENT_SOURCE_OF_TRUTH.md",
      "docs/요구사항기준선-v1.7.32.md",
      "docs/화면정의서-v1.5.36.md",
      "docs/유저flow맵-v1.3.34.md",
      "docs/db설계-v1.3.34.md",
      "docs/api문서-v1.2.39.md",
    ]);

    const owningBundle = [
      readme,
      acceptance,
      JSON.stringify(automation),
      JSON.stringify(workItem),
    ].join("\n");

    for (const required of [
      "요구사항기준선-v1.7.32.md",
      "화면정의서-v1.5.36.md",
      "유저flow맵-v1.3.34.md",
      "db설계-v1.3.34.md",
      "api문서-v1.2.39.md",
      approvedPlanSha,
      approvedPlanPath,
    ]) {
      expect(owningBundle).toContain(required);
    }
    expect(owningBundle).toMatch(/1,018\s*(?:lines|행)/u);

    for (const stale of [
      "요구사항기준선-v1.7.25.md",
      "화면정의서-v1.5.29.md",
      "유저flow맵-v1.3.27.md",
      "db설계-v1.3.26.md",
      "api문서-v1.2.29.md",
      "요구사항기준선-v1.7.31.md",
      "화면정의서-v1.5.35.md",
      "유저flow맵-v1.3.33.md",
      "db설계-v1.3.33.md",
      "api문서-v1.2.38.md",
      "45f02013fbc1c3af",
      "1,056 lines",
    ]) {
      expect(owningBundle).not.toContain(stale);
    }

    const approvedPlan = readFileSync(join(root, approvedPlanPath));
    expect(createHash("sha256").update(approvedPlan).digest("hex")).toBe(
      approvedPlanSha,
    );
    expect(approvedPlan.toString("utf8").match(/\n/gu)).toHaveLength(1_018);
    expect(workItem.docs_refs.governing_docs).toContain(approvedPlanPath);
  });

  it("records merged runtime predecessors without promoting broader gates", () => {
    const dependencyProjection = [
      readme,
      acceptance,
      workItem.dependencies.join("\n"),
      workItem.notes,
      status.notes,
      roadmap,
    ].join("\n");

    for (const required of [
      "#1319",
      mealLogCoreMerge,
      mealLogCheckpointMerge,
      "post-merge raw 14/14 success",
      "#1331",
      plannerShellMerge,
      "Stage 4~6 merged-green",
      "docs/workpacks/planner-shell/omo-report.md",
      "Manual/server-Mac/OAuth",
      "capability",
      "R/R+1/R+2",
      "activation",
    ]) {
      expect(dependencyProjection).toContain(required);
    }

    expect(dependencyProjection).toContain(
      "Stage 2 implementation dependency is available",
    );
    expect(dependencyProjection).toContain(
      "independent internal1.5, security/API, five-axis",
    );
    expect(dependencyProjection).not.toMatch(
      /#10[^\n]*(?:open Draft|dependency pending)|implementation waits until #9|#10 frontend runtime[^\n]*pending/u,
    );
  });

  it("moves #12 to Stage 2 in progress without promoting later evidence", () => {
    expect(workItem.status).toMatchObject({
      lifecycle: "in_progress",
      approval_state: "not_started",
      verification_status: "pending",
      evaluation_status: "not_started",
      evaluation_round: 0,
      last_evaluator_result: null,
      auto_merge_eligible: false,
    });
    expect(status).toMatchObject({
      branch: "feature/be-meal-log-ui",
      pr_path: "https://github.com/netsus/homecook/pull/1354",
      lifecycle: "in_progress",
      approval_state: "not_started",
      verification_status: "pending",
      evaluation_status: "not_started",
      evaluation_round: 0,
      last_evaluator_result: null,
      auto_merge_eligible: false,
    });
    expect(roadmap).toMatch(/\| 12 \| E \| `meal-log-ui` \| in-progress \|/u);

    expect(workItem.verification.stage1_current_commands).toEqual(
      workItem.verification.verify_commands,
    );
    expect(workItem.verification.stage1_current_commands).toContain(
      stage1TestCommand,
    );
    expect(automation.backend.verify_commands).toContain(stage1TestCommand);
    expect(status.required_checks).toContain(stage1TestCommand);
    expect(workItem.verification.stage4_future_commands).toEqual(
      automation.frontend.verify_commands,
    );
    expect(workItem.verification.required_checks).toContain(
      localOnlySmokeEvidenceCommand,
    );
    expect(workItem.verification.stage4_future_commands).toContain(
      localOnlySmokeEvidenceCommand,
    );
    expect(status.required_checks).toContain(localOnlySmokeEvidenceCommand);
    const currentCommands = workItem.verification.stage1_current_commands.join(
      "\n",
    );
    expect(currentCommands).not.toMatch(
      /meal-log-ui\.test\.tsx|test:e2e|qa:explore|verify:frontend|real-smoke/u,
    );
  });

  it("keeps automation external smokes exact and non-empty", () => {
    expect(automation.external_smokes).toEqual(
      workItem.workflow.external_smokes,
    );
    expect(automation.external_smokes.length).toBeGreaterThan(0);
  });

  it("uses the canonical local-only verification authority without stale commands", () => {
    const localOnlyProjection = [
      readme,
      acceptance,
      JSON.stringify(automation),
      JSON.stringify(workItem),
      status.notes,
      status.required_checks.join("\n"),
    ].join("\n");

    for (const required of [
      "local-only",
      "isolated-local",
      "controlled full-local",
      "read-only",
    ]) {
      expect(localOnlyProjection).toContain(required);
    }

    expect(
      workItem.verification.required_checks.filter(
        (command: string) => command === localOnlySmokeEvidenceCommand,
      ),
    ).toHaveLength(1);
  });

  it("records the current approved P1-ML-05 design provenance without fabricating later authority", () => {
    expect(automation.frontend.design_authority).toMatchObject({
      generator_required: true,
      generator_artifact: "ui/designs/MEAL_LOG.md",
      critic_required: true,
      critic_artifact: "ui/designs/critiques/MEAL_LOG-critique.md",
      authority_required: true,
    });

    const reviewProjection = [
      readme,
      acceptance,
      JSON.stringify(automation),
      JSON.stringify(workItem),
      status.notes,
      roadmap,
      design,
      critique,
    ].join("\n");
    for (const required of [
      initialRelockBase,
      finalRelockBase,
      latestMasterBase,
      latestMasterContent,
      latestMasterMerge,
      securityReviewedHead,
      securityMasterBase,
      securityMasterMerge,
      securityMasterMergeTree,
      "#1352",
      "postcss>nanoid",
      "3.3.18",
      "13/13 success",
      "high/critical audit 0",
      "base drift",
      "normal two-parent merge",
      "YouTube async isolated-local tooling",
      "Contract Evolution is N/A",
      "Design Status",
      "temporary",
      "fresh independent internal1.5",
      "author does not approve its own changes",
      designGeneratorTask,
      designGeneratorHead,
      designGeneratorTree,
      designRepairTask,
      designRepairHead,
      designRepairTree,
      designRereviewTask,
      designRereviewHead,
      designRereviewTree,
      latestDesignRepairTask,
      latestDesignHead,
      latestDesignTree,
      latestDesignBlob,
      latestDesignReviewTask,
      latestCritiqueCommit,
      latestCritiqueTree,
      "APPROVE 0/0/0",
      "superseded",
    ]) {
      expect(reviewProjection).toContain(required);
    }

    expect(workItem.verification.evaluator_commands).toEqual(
      expect.arrayContaining([
        expect.stringContaining("fresh independent Codex internal 1.5"),
        expect.stringContaining("security authorization and API boundary"),
        expect.stringContaining("five-axis"),
      ]),
    );
    expect(workItem.verification.evaluator_commands.join("\n")).not.toMatch(
      /design-delta critic refresh|fresh independent Codex design critic refresh/u,
    );
    expect(acceptance).toMatch(
      /- \[x\] canonical MEAL_LOG design and independent critique pass before Stage 2/u,
    );
    const checkedAcceptanceIds = [...acceptance.matchAll(
      /^- \[x\].*<!-- omo:id=([^;]+);/gmu,
    )].map((match) => match[1]);
    expect(checkedAcceptanceIds).toEqual(expect.arrayContaining([
      "accept-meal-log-ui-deleted-entry-absence",
      "accept-meal-log-ui-search-union",
      "accept-meal-log-ui-no-invention",
      "accept-meal-log-ui-runtime-predecessors",
      "accept-meal-log-ui-design",
      "accept-meal-log-ui-doc-gate-regression",
      "accept-meal-log-ui-stage1-honesty",
    ]));
    for (const pendingId of [
      "accept-meal-log-ui-authority",
      "accept-meal-log-ui-local-only-boundary",
      "accept-meal-log-ui-reviews",
      "accept-meal-log-ui-ci",
    ]) expect(checkedAcceptanceIds).not.toContain(pendingId);
    expect(acceptance).toMatch(
      /- \[ \] implementation records failing component\/history tests before code.*omo:id=accept-meal-log-ui-tdd-red/u,
    );
    expect(acceptance).toMatch(
      /- \[ \] independent internal1\.5\/security\/five-axis\/design\/Stage3\/5\/6 findings are zero/u,
    );
    for (const staleParts of [
      ["fresh design-", "generator task and fresh independent design critic", " remain pending"],
      ["A fresh design-", "generator task and fresh independent design critic", " remain prerequisites"],
      ["design-generator/critic", " 미완료"],
    ]) {
      expect(reviewProjection).not.toContain(staleParts.join(""));
    }
  });

  it("uses the server day total across every visible non-deleted section", () => {
    const totalProjection = [
      readme,
      acceptance,
      JSON.stringify(automation),
      JSON.stringify(workItem),
      status.notes,
      roadmap,
      design,
    ].join("\n");

    expect(totalProjection).toContain(
      "day-total-equals-all-visible-non-deleted-section-subtotals-with-incomplete-count",
    );
    expect(totalProjection).toContain(
      "server projection of all visible non-deleted entries and section subtotals",
    );
    expect(totalProjection).toContain(
      "deleted-column snapshot sections",
    );
    expect(totalProjection).toContain("partial/unavailable counts included");
    expect(totalProjection).toContain("server is authority");
    expect(totalProjection).not.toContain(
      ["day-total-equals-active", "-subtotals-with-incomplete-count"].join(""),
    );
    expect(totalProjection).not.toContain(
      ["day total은 non-deleted entry의 active", " column subtotal 합"].join(""),
    );
  });

  it("requires an explicit active owner column for every deleted/null-origin edit save", () => {
    const owningProjections = [
      readme,
      acceptance,
      JSON.stringify(automation),
      JSON.stringify(workItem),
      roadmap,
      status.notes,
    ];

    for (const projection of owningProjections) {
      for (const required of [
        "every edit save from a deleted/null origin",
        "regardless of quantity/source/date/timezone fields",
        "explicit current active owner meal column selection",
        "save fail-closed until selection",
        "server replaces meal_plan_column_id + slot_name_snapshot",
        "DELETE remains no relocation",
      ]) {
        expect(projection).toContain(required);
      }
    }

    const deletedColumnProjection = [...owningProjections, design].join("\n");
    expect(deletedColumnProjection).toContain(
      "deleted-column-no-new-target-existing-entry-edit-delete-preserved",
    );
    expect(deletedColumnProjection).toContain(
      "DELETE soft-deletes and reverses the entry's own active batch event",
    );
    expect(deletedColumnProjection).not.toContain(
      "select and validate an active meal column when changing slot",
    );
    expect(deletedColumnProjection).not.toContain(
      "quantity/source/date edits follow the existing PATCH contract",
    );

    expect(deletedColumnProjection).not.toContain(
      ["deleted-column-history-read-only", "-no-new-entry"].join(""),
    );
    expect(deletedColumnProjection).not.toContain(
      ["deleted-column-snapshot-read-only", "-history"].join(""),
    );
  });

  it("preserves #12 as UI-only and defers future Manual and activation evidence", () => {
    const boundaryProjection = [
      readme,
      acceptance,
      JSON.stringify(automation),
      JSON.stringify(workItem),
    ].join("\n");

    expect(boundaryProjection).toContain("#12 owns UI only");
    expect(workItem.verification.manual_only_evidence).toEqual(
      expect.arrayContaining([
        expect.stringContaining("390px and 320px"),
        expect.stringContaining("server-Mac and OAuth"),
        expect.stringContaining("R/R+1/R+2"),
        expect.stringContaining("activation"),
      ]),
    );
    expect(automation.backend.required_test_targets).toContain(
      "tests/meal-log-ui-stage1-relock.test.ts",
    );
  });
});
