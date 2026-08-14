import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readWorkpackChecklistContract } from "../scripts/lib/omo-checklist-contract.mjs";
import { evaluateDocGate } from "../scripts/lib/omo-doc-gate.mjs";

const root = process.cwd();
const sliceId = "legacy-product-compat";
const trackedBranch =
  "docs/legacy-product-compat-stage1-relock-20260815";
const predecessorAuthorBranch =
  "docs/legacy-product-compat-stage1-relock-author-20260815";
const designImpactReviewTask =
  "01a00203-3c1d-78b3-ac78-fbb63b960c60";
const approvedPlanPath =
  "docs/workpacks/planner-shell/evidence/cooking-meal-log-and-product-search-master-plan-20260722.md";
const approvedPlanSha =
  "d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d";
const historicalOverlaySha =
  "45f02013fbc1c3af1936d596605230d0cbac7839a783224aa9535844e4bda7dc";
const localOnlyAuthority =
  "docs/engineering/supabase-local-only-operations.md";
const stage1TestCommand =
  "pnpm exec vitest run tests/legacy-product-compat-stage1-relock.test.ts tests/workflow-v2-docs.test.ts tests/omo-automation-spec.test.ts tests/omo-bookkeeping.test.ts tests/omo-doc-gate.test.ts tests/source-of-truth-sync.test.ts";
const authorityRefs = [
  "ui/designs/authority/PLANNER_WEEK-authority.md",
  "ui/designs/authority/recipe-content-snapshot-future-propagation-authority.md",
  "docs/workpacks/cooked-batch-weight-ui/evidence/2026-08-10-final-authority-p2-repair-rereview.md",
];

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

function readJson(relativePath: string) {
  return JSON.parse(read(relativePath));
}

function readSection(markdown: string, heading: string) {
  const start = markdown.indexOf(heading);
  if (start < 0) return "";
  const next = markdown.indexOf("\n## ", start + heading.length);
  return markdown.slice(start, next < 0 ? undefined : next);
}

describe("legacy-product-compat fresh Stage 1 exact-six relock", () => {
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

  it("P1-1 locks the current tuple, tracked primary plan and local-only authority", () => {
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
      approvedPlanPath,
      approvedPlanSha,
      "1,018 lines",
      historicalOverlaySha,
      "1,056 lines",
      "historical local-first overlay only",
      localOnlyAuthority,
    ]) {
      expect(owningBundle).toContain(required);
    }
    expect(workItem.docs_refs.governing_docs).toContain(approvedPlanPath);
    expect(workItem.docs_refs.governing_docs).toContain(localOnlyAuthority);
    expect(workItem.docs_refs.governing_docs).not.toContain(
      "/Users/shj/2025/2026/homecook1/.omx/plans/",
    );

    const approvedPlan = readFileSync(join(root, approvedPlanPath));
    expect(createHash("sha256").update(approvedPlan).digest("hex")).toBe(
      approvedPlanSha,
    );
    expect(approvedPlan.toString("utf8").match(/\n/gu)).toHaveLength(1_018);
  });

  it("P1-2 records #10 and #12 runtime dependencies as fulfilled without broad promotion", () => {
    const projection = [
      readme,
      acceptance,
      workItem.dependencies.join("\n"),
      workItem.notes,
      status.notes,
      roadmap,
    ].join("\n");
    for (const required of [
      "#10",
      "#1331",
      "2185b59d1b460dac916aa4a4a4a5e061c8b795f0",
      "#12",
      "#1361",
      "4264fe6bd5b3429029ba895a6b79cd32a5d3fa35",
      "runtime dependency fulfilled",
      "Manual/server-Mac/OAuth",
      "R/R+1/R+2",
      "activation",
      "pending",
    ]) {
      expect(projection).toContain(required);
    }
    expect(projection).not.toMatch(
      /implementation waits for #10|slice10-or-slice12-runtime-not-green/u,
    );

    const honestStatus = {
      lifecycle: "planned",
      approval_state: "not_started",
      verification_status: "pending",
      evaluation_status: "not_started",
      evaluation_round: 0,
      last_evaluator_result: null,
      auto_merge_eligible: false,
      blocked_reason_code: null,
    };
    expect(workItem.status).toEqual(honestStatus);
    expect(status).toMatchObject({
      branch: trackedBranch,
      pr_path: "pending",
      ...honestStatus,
    });

    const activeBranchProjection = [
      readme,
      JSON.stringify(workItem),
      JSON.stringify(status),
    ].join("\n");
    expect(activeBranchProjection).toContain(trackedBranch);
    expect(activeBranchProjection).not.toContain(predecessorAuthorBranch);
    for (const command of workItem.verification.stage1_current_commands) {
      expect(command).not.toContain(predecessorAuthorBranch);
    }
  });

  it("P1-3 passes the Stage 1 doc gate and locks the required user-facing states", () => {
    const docGate = evaluateDocGate({ rootDir: root, slice: sliceId });
    const checklist = readWorkpackChecklistContract({
      rootDir: root,
      slice: sliceId,
    });

    expect(docGate.outcome, docGate.summary).toBe("pass");
    expect(docGate.findings).toEqual([]);
    expect(checklist.errors).toEqual([]);

    for (const heading of [
      "## In Scope",
      "## Dependencies",
      "## Backend First Contract",
      "## Frontend Delivery Mode",
      "## Design Status",
      "## QA / Test Data Plan",
      "## Primary User Path",
    ]) {
      expect(readme).toContain(heading);
    }
    for (const state of [
      "loading",
      "empty",
      "error",
      "read-only",
      "unauthorized",
    ]) {
      expect(readme).toContain(state);
    }
    expect(acceptance).toContain("## Data Setup / Preconditions");
    expect(acceptance).toContain("## Automation Split");
  });

  it("P1-4 locks only the existing v1 idempotency and version-dispatch contract", () => {
    const contract = [
      readme,
      acceptance,
      JSON.stringify(automation),
      JSON.stringify(workItem),
    ].join("\n");
    for (const required of [
      "400 INVALID_IDEMPOTENCY_KEY mutation 0",
      "same key + same canonical payload",
      "durable replay",
      "additional mutation 0",
      "409 IDEMPOTENCY_KEY_REUSED mutation 0",
      "pre-gate no-key v1 shape",
      "full-release no-key 0",
      "428 IDEMPOTENCY_KEY_REQUIRED mutation 0",
      "planner and standalone",
      "401/403/404/409/422/428",
      "consumed_ingredient_ids",
      "stored contract_version",
    ]) {
      expect(contract).toContain(required);
    }
    expect(contract).toContain(
      "no new API, field, status, error, action, or screen",
    );
    expect(automation.backend.required_endpoints).toEqual([
      "GET /planner existing additive legacy product projection",
      "GET /planner/nutrition existing compatibility endpoint",
      "POST /product-planner-entries existing server compatibility only",
      "PATCH /product-planner-entries/{entry_id} existing server compatibility only",
      "DELETE /product-planner-entries/{entry_id} existing owner delete",
      "POST /cooking/sessions existing legacy-v1 planner start",
      "GET /cooking/sessions/{id}/cook-mode existing legacy-v1 read",
      "POST /cooking/sessions/{id}/complete existing legacy-v1 complete",
      "POST /cooking/sessions/{id}/cancel existing legacy-v1 cancel",
      "POST /cooking/standalone-complete existing legacy-v1 standalone complete",
      "GET /cooking/session-attempts/{id}/cook-mode existing snapshot-v2 drain",
      "POST /cooking/session-attempts/{id}/cancel existing snapshot-v2 drain",
      "POST /cooking/session-attempts/{id}/complete existing snapshot-v2 drain",
      "GET /food-products existing v1 cursor dual decode",
    ]);
  });

  it("P1-5 separates deterministic fixtures, isolated-local mutation and merged-exact read-only evidence", () => {
    const fixtures = [
      readme,
      acceptance,
      JSON.stringify(automation),
      JSON.stringify(workItem),
    ].join("\n");
    for (const required of [
      "owner A",
      "owner B",
      "legacy row",
      "pinned old version",
      "v1 key/no-key/replay/mismatch",
      "current and immediate-previous clients",
      "seeded v2 read/cancel/complete and rollback",
      "v1 cursor",
      "telemetry outage",
      "isolated-local create/reset",
      "merged-exact read-only",
    ]) {
      expect(fixtures).toContain(required);
    }
    expect(workItem.verification.stage1_current_commands).toEqual(
      workItem.verification.verify_commands,
    );
    expect(workItem.verification.stage1_current_commands).toContain(
      stage1TestCommand,
    );
    expect(status.required_checks).toEqual(
      workItem.verification.stage1_current_commands,
    );
    expect(workItem.verification.stage2_future_commands).toEqual(
      automation.backend.verify_commands,
    );
    expect(workItem.verification.stage4_future_commands).toEqual(
      automation.frontend.verify_commands,
    );

    for (const required of [
      "pnpm verify:local-supabase-runtime:isolated",
      "scripts/run-isolated-local-supabase-runtime-gate.mjs",
      "pnpm test:prepared-food-planner-entry:postgres",
      "tests/fixtures/prepared-food-planner-entry-postgres-harness.ts",
      "tests/prepared-food-planner-entry-postgres.integration.test.ts",
      "lib/server/user-bootstrap.ts",
      "ensureUserBootstrapState",
      "bootstrap_legacy_auth_callback_identity",
      "supabase/migrations/20260730140000_hybrid_internal_operations_facades.sql",
      "meal_plan_columns",
      "owner match",
      "fixture absent blocks Stage 2",
    ]) {
      expect(fixtures).toContain(required);
    }
  });

  it("P1-6 splits Stage 2 server and Stage 4 client ownership with unique OMO ids", () => {
    const checklist = readWorkpackChecklistContract({
      rootDir: root,
      slice: sliceId,
    });
    const ids = checklist.items
      .filter((item) => !item.manualOnly)
      .map((item) => item.metadata?.id);
    expect(new Set(ids).size).toBe(ids.length);

    const stage2Ids = checklist.items
      .filter((item) => Number(item.metadata?.stage) === 2)
      .map((item) => item.metadata?.id);
    const stage4Ids = checklist.items
      .filter((item) => Number(item.metadata?.stage) === 4)
      .map((item) => item.metadata?.id);
    expect(stage2Ids).toEqual(
      expect.arrayContaining([
        "delivery-legacy-compat-stage2-cursor",
        "delivery-legacy-compat-stage2-idempotency",
        "delivery-legacy-compat-stage2-telemetry-barrier",
      ]),
    );
    expect(stage4Ids).toEqual(
      expect.arrayContaining([
        "delivery-legacy-compat-stage4-optional-key",
        "delivery-legacy-compat-stage4-states",
        "delivery-legacy-compat-stage4-delete",
        "delivery-legacy-compat-stage4-focus-responsive",
      ]),
    );
    expect(checklist.items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringMatching(/internal1\.5|Stage 1 review bookkeeping/u),
          metadata: expect.objectContaining({ stage: 2 }),
        }),
      ]),
    );
    const forbiddenNonRuntimeMetadata =
      /Stage 1|stage1|exact-six|semantic relock|docs authored|internal ?1\.5|review bookkeeping|evaluator handoff|design-impact review|five-axis review|security review/iu;
    for (const item of checklist.items.filter(
      (candidate) => Number(candidate.metadata?.stage) === 2
        || Number(candidate.metadata?.stage) === 4,
    )) {
      expect(item.text).not.toMatch(forbiddenNonRuntimeMetadata);
    }
    const checklistIds = checklist.items.map((item) =>
      String(item.metadata?.id ?? "")
    );
    expect(checklistIds).not.toContain("delivery-legacy-compat-stage1-docs");
  });

  it("P1-7 fails closed on incomplete telemetry and reuses the exact final authority refs", () => {
    const projection = [
      readme,
      acceptance,
      JSON.stringify(automation),
      JSON.stringify(workItem),
    ].join("\n");
    for (const failure of [
      "telemetry unavailable",
      "telemetry partial",
      "telemetry stale",
      "telemetry query-error",
    ]) {
      expect(projection).toContain(failure);
    }
    expect(projection).toContain(
      "tombstone/removal fail-closed with mutation/removal 0",
    );
    expect(projection).toContain("#11");
    expect(automation.frontend.design_authority).toMatchObject({
      generator_required: false,
      critic_required: false,
      authority_required: false,
      authority_report_paths: authorityRefs,
    });
    expect(workItem.docs_refs.governing_docs).toEqual(
      expect.arrayContaining(authorityRefs),
    );
    expect(projection).not.toContain("ui/designs/authority/COOK_MODE-authority.md");

    expect(automation.frontend.required_states).toEqual([
      "loading-empty-error-read-only-unauthorized",
      "legacy-detail-delete-pending-delete-error-row-retained",
      "v1-optional-key-and-pre-gate-no-key-decode",
      "v1-missing-key-428-post-full-release-zero",
      "current-and-immediate-previous-stored-version-dispatch",
    ]);
    expect(automation.frontend.required_states.join("\n")).not.toMatch(
      /telemetry|tombstone|removal|fail-closed/iu,
    );
  });

  it("keeps Stage 1 design status temporary while retaining predecessor authorities", () => {
    const designStatus = readSection(readme, "## Design Status");
    expect(designStatus).toContain("- [x] 임시 UI (temporary)");
    expect(designStatus).toContain("- [ ] 확정 (confirmed)");
    expect(designStatus).toContain("predecessor evidence");
    expect(automation.frontend.design_authority.authority_required).toBe(false);
    expect(automation.frontend.design_authority.authority_report_paths).toEqual(
      authorityRefs,
    );
  });

  it("requires an independent design-impact review in every active Stage 1 gate projection", () => {
    const currentGate = readSection(readme, "## Stage 1 Current Gate");
    expect(currentGate).toContain("independent design-impact review");
    expect(currentGate).toContain(designImpactReviewTask);
    expect(workItem.owners.codex).toContain("independent design-impact review");
    expect(workItem.owners.codex).toContain(designImpactReviewTask);
    expect(workItem.verification.evaluator_commands).toEqual(
      expect.arrayContaining([
        expect.stringContaining("independent design-impact review"),
        expect.stringContaining(designImpactReviewTask),
      ]),
    );
  });
});
