import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readWorkpackChecklistContract } from "../scripts/lib/omo-checklist-contract.mjs";
import { evaluateDocGate } from "../scripts/lib/omo-doc-gate.mjs";

const root = process.cwd();
const sliceId = "legacy-product-compat";
const trackedBranch =
  "feature/fe-legacy-product-compat";
const stage1TrackedBranch =
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
const missingKeyIntermediateState =
  "full-release no-key 0 is telemetry evidence only; missing Idempotency-Key remains compatible success until a separately approved exact required-key activation";
const postActivationMissingKeyRejection =
  "MAINTENANCE/QUARANTINED/DELETING and malformed/reused/missing-post-exact-required-key-activation-following-full-release-no-key-0/version/owner rejection";
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
      lifecycle: "in_progress",
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
      pr_path: "https://github.com/netsus/homecook/pull/1371",
      ...honestStatus,
    });

    const activeBranchProjection = [
      readme,
      JSON.stringify(workItem),
      JSON.stringify(status),
    ].join("\n");
    expect(activeBranchProjection).toContain(trackedBranch);
    expect(readme).toContain(stage1TrackedBranch);
    expect(activeBranchProjection).not.toContain(predecessorAuthorBranch);
    for (const command of workItem.verification.required_checks) {
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
      "pre-gate missing Idempotency-Key remains compatible success with the existing v1 response shape",
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

  it("P0 repair permits only the atomic legacy-v1 DB correction", () => {
    const repairedContract = [
      readme,
      acceptance,
      JSON.stringify(automation),
    ].join("\n");

    for (const required of [
      "narrow additive migration",
      "no new table or column",
      "scoped SECURITY DEFINER RPC",
      "owner + account generation + stored legacy_v1 predicate",
      "canonical payload",
      "idempotency ledger claim/finish",
      "durable no-key telemetry",
      "one transaction",
      "existing planner and standalone public endpoint/body/response",
      "strict stored-version legacy_v1 guard",
      "other-owner nondisclosure",
      "existing v2 drain/rollback",
      "concurrent same-key",
      "concurrent mismatch",
      "DB-side mutation 0",
      "isolated-local reset",
    ]) {
      expect(repairedContract).toContain(required);
    }

    for (const forbidden of [
      "generic ledger direct table access is forbidden",
      "service-role direct DML is forbidden",
      "app-memory receipt is forbidden",
      "route-level claim followed by a separate legacy RPC is forbidden",
      "RLS relaxation is forbidden",
    ]) {
      expect(repairedContract).toContain(forbidden);
    }

    expect(automation.backend.invariants).toEqual(
      expect.arrayContaining([
        "narrow-additive-migration-scoped-security-definer-rpc-only-no-new-table-column",
        "atomic-owner-account-generation-stored-legacy-v1-canonical-payload-ledger-claim-finish-no-key-telemetry-v1-mutation",
        "generic-ledger-direct-table-service-role-direct-dml-app-memory-receipt-route-split-rpc-and-rls-relaxation-forbidden",
        "strict-stored-version-guard-other-owner-nondisclosure-and-existing-v2-drain-rollback-retained",
      ]),
    );
    expect(automation.backend.required_test_targets).toEqual(
      expect.arrayContaining([
        "concurrent same-key and mismatch matrix with DB-side mutation 0",
        "no-key phase and rollback matrix with DB-side mutation 0",
        "owner A and owner B nondisclosure fixture with isolated-local reset",
      ]),
    );
  });

  it("P1 security repair locks mutation-zero ordering and phased cutover on every Stage 1 surface", () => {
    const surfaces = {
      readme,
      acceptance,
      automation: automation.backend.invariants.join("\n"),
    };

    const requiredPerSurface = [
      "public.complete_cooking_session(uuid, timestamptz, text, integer, timestamptz, uuid, uuid[], uuid, timestamptz)",
      "public.complete_standalone_cooking(uuid, timestamptz, text, integer, timestamptz, uuid, integer, uuid[], uuid, timestamptz)",
      "server-verified JWT sub/session_id/iat",
      "active expected account generation",
      "stored contract_version=legacy_v1",
      "snapshot_v2 session ID",
      "control_class=application-controlled; effect=mutation; exposure=service-internal; allowed_principals=service_role; owner=postgres",
      "auth.role() = service_role",
      "pg_catalog, public, private, pg_temp",
      "REVOKE ALL FROM PUBLIC, anon, authenticated",
      "GRANT EXECUTE only to service_role",
      "public.complete_cooking_session(uuid, uuid, uuid[])",
      "public.complete_standalone_cooking(uuid, uuid, integer, uuid[])",
      "header/body/canonical payload and server-verified session/lifecycle authority before ensurePublicUserRow, ensureUserBootstrapState, ledger, completion, progress or any writer",
      "route-level bootstrap writers are removed from planner and standalone completion paths",
      postActivationMissingKeyRejection,
      "checksum/delta 0 across users, recipe_books, meal_plan_columns, ledger, completion, progress events/summaries",
      "additive DB phase creates new scoped RPC/core while old overload remains only for existing optional-key/no-key compatibility",
      "Stage 2 non-manual owns additive scoped RPC/core + planner and standalone route implementation + isolated-local fixtures + activation-block guard",
      "rollback before old-overload revoke keeps the maintenance/write fence closed",
      "traffic resumes only after a last-known-safe route/RPC version satisfying session+lifecycle authority and mutation 0 is deployed/proven and old instances are drained",
      "rollback never returns to bootstrap-before-authority or any optional-key writer ordering",
      "after old-overload revoke, rollback never restores legacy grants or bypass",
      "required-key transition cannot activate until old overload revoke/drain evidence",
      "all remote application/fence/activation remains Manual pending and is not executed by Stage2 automation",
      "DB transaction atomicity only covers claim/bootstrap/completion/progress/finish",
      "service-role direct DML is forbidden",
      "claim -> legacy completion -> cooking_completed user_progress_events + user_progress_summary -> durable finish",
      "best-effort post-RPC progress writer is removed",
      "concurrent/replay/mismatch/rollback mutation counters include user_progress_events and user_progress_summary",
      "planner product other-owner keeps documented scope-filtered 404 RESOURCE_NOT_FOUND fields=[]",
      "legacy cooking other-owner keeps 403 FORBIDDEN fields=[]",
      "snapshot_v2 session ID -> 404 RESOURCE_NOT_FOUND fields=[] mutation 0",
      "stale session/account generation -> 409 ACCOUNT_SESSION_STALE|ACCOUNT_GENERATION_STALE fields=[] mutation 0",
      "malformed Idempotency-Key -> 400 INVALID_IDEMPOTENCY_KEY fields[]=[Idempotency-Key:invalid_uuid] mutation 0",
      "pre-gate missing Idempotency-Key remains compatible success with the existing v1 response shape",
      "only after separately approved exact required-key activation following full-release no-key 0 may missing Idempotency-Key return 428 IDEMPOTENCY_KEY_REQUIRED mutation 0",
      "reused Idempotency-Key -> 409 IDEMPOTENCY_KEY_REUSED fields=[] mutation 0",
      "POST /cooking/sessions/{id}/complete",
      "POST /cooking/standalone-complete",
      '{"success":false,"data":null,"error":{"code":"ACCOUNT_LIFECYCLE_MAINTENANCE","message":"계정 정비 작업 중이에요. 잠시 후 다시 시도해 주세요.","fields":[]}}',
      '{"success":false,"data":null,"error":{"code":"ACCOUNT_CUTOVER_QUARANTINED","message":"계정 복구가 필요해요.","fields":[]}}',
      '{"success":false,"data":null,"error":{"code":"ACCOUNT_DELETING","message":"계정 삭제가 진행 중이에요.","fields":[]}}',
      "official API v1.2.39 cross-slice contract; not a public contract change",
      "400/401/403/404/409/422/428/503 error floor",
      "all three lifecycle outcomes have mutation 0",
    ];

    for (const [surface, content] of Object.entries(surfaces)) {
      for (const required of requiredPerSurface) {
        expect(content, `${surface} must lock ${required}`).toContain(required);
      }
    }
    for (const content of Object.values(surfaces)) {
      expect(content).not.toContain(
        "same Stage 2 migration/transaction as the route cutover",
      );
      expect(content).not.toContain("same transaction as the route cutover");
    }

    expect(automation.backend.required_test_targets).toEqual(
      expect.arrayContaining([
        "planner and standalone lifecycle error wrapper matrix with mutation 0",
        `${postActivationMissingKeyRejection} checksum/delta 0 across users, recipe_books, meal_plan_columns, ledger, completion, progress events/summaries`,
        "additive scoped RPC/core implementation",
        "planner and standalone route implementation using the scoped RPC/core",
        "activation-block guard until Manual cutover evidence is complete",
      ]),
    );

    const legacyPlannerMigration = read(
      "supabase/migrations/20260512093000_leftover_card_metadata.sql",
    );
    const legacyStandaloneMigration = read(
      "supabase/migrations/20260429103000_15b_cook_standalone_complete.sql",
    );
    const plannerRoute = read(
      "app/api/v1/cooking/sessions/[session_id]/complete/route.ts",
    );
    const standaloneRoute = read("app/api/v1/cooking/standalone-complete/route.ts");
    const sessionAuthority = read(
      "supabase/migrations/20260802210000_recipe_content_snapshot_future_propagation.sql",
    );
    const authorityResponses = read("lib/api/response.ts");
    const accountAuthorityResponses = read(
      "app/api/v1/users/me/_account-generation-active.ts",
    );

    expect(legacyPlannerMigration).toContain(
      "public.complete_cooking_session(",
    );
    expect(legacyStandaloneMigration).toContain(
      "public.complete_standalone_cooking(",
    );
    expect(plannerRoute).toContain('"complete_cooking_session"');
    expect(plannerRoute).toContain("callFuturePropagationRpc(");
    expect(standaloneRoute).toContain('"complete_standalone_cooking"');
    expect(standaloneRoute).toContain("callFuturePropagationRpc(");
    for (const code of [
      "ACCOUNT_LIFECYCLE_MAINTENANCE",
      "ACCOUNT_CUTOVER_QUARANTINED",
      "ACCOUNT_DELETING",
    ]) {
      expect(sessionAuthority).toContain(`raise exception '${code}'`);
    }
    expect(authorityResponses).toContain(
      'message: "계정 정비 작업 중이에요. 잠시 후 다시 시도해 주세요.",',
    );
    expect(accountAuthorityResponses).toContain(
      '"ACCOUNT_CUTOVER_QUARANTINED",\n      "계정 복구가 필요해요.",\n      409,',
    );
    expect(accountAuthorityResponses).toContain(
      'fail("ACCOUNT_DELETING", "계정 삭제가 진행 중이에요.", 409)',
    );
  });

  it("P1 fresh review separates pre-gate missing-key success from post-activation 428", () => {
    const surfaces = [
      readme,
      acceptance,
      automation.backend.invariants.join("\n"),
      workItem.verification.artifact_assertions.join("\n"),
    ];

    for (const content of surfaces) {
      expect(content).toContain(
        "pre-gate missing Idempotency-Key remains compatible success with the existing v1 response shape",
      );
      expect(content).toContain(missingKeyIntermediateState);
      expect(content).toContain(
        "only after separately approved exact required-key activation following full-release no-key 0 may missing Idempotency-Key return 428 IDEMPOTENCY_KEY_REQUIRED mutation 0",
      );
      expect(content).toContain(postActivationMissingKeyRejection);
      expect(content).not.toContain("missing-after-full-release-no-key-0");
      expect(content).not.toContain(
        "MAINTENANCE/QUARANTINED/DELETING and malformed/reused/missing/version/owner rejection",
      );
    }

    expect(automation.backend.required_test_targets).toEqual(
      expect.arrayContaining([
        "pre-gate missing-key planner and standalone compatibility success with existing v1 response shape",
        "post-exact-activation missing-key planner and standalone 428 IDEMPOTENCY_KEY_REQUIRED with mutation 0",
      ]),
    );
    expect(automation.backend.invariants).toContain(
      "missing Idempotency-Key only after separately approved exact required-key activation following full-release no-key 0 -> 428 IDEMPOTENCY_KEY_REQUIRED fields[]=[Idempotency-Key:required] mutation 0",
    );
  });

  it("P1 fresh review keeps rollback fenced and resumes only a proven safe route/RPC", () => {
    const surfaces = [
      readme,
      acceptance,
      automation.backend.invariants.join("\n"),
    ];

    for (const content of surfaces) {
      expect(content).toContain(
        "rollback before old-overload revoke keeps the maintenance/write fence closed",
      );
      expect(content).toContain(
        "traffic resumes only after a last-known-safe route/RPC version satisfying session+lifecycle authority and mutation 0 is deployed/proven and old instances are drained",
      );
      expect(content).toContain(
        "rollback never returns to bootstrap-before-authority or any optional-key writer ordering",
      );
      expect(content).toContain(
        "after old-overload revoke, rollback never restores legacy grants or bypass",
      );
      expect(content).not.toContain(
        "rollback before revoke can return route to old optional-key flow",
      );
    }
  });

  it("P1 fresh review makes Stage 2 non-manual and classifies cutover operations as Manual Only", () => {
    const checklist = readWorkpackChecklistContract({
      rootDir: root,
      slice: sliceId,
    });
    const stage2Text = checklist.items
      .filter((item) => Number(item.metadata?.stage) === 2)
      .map((item) => item.text)
      .join("\n");
    const stage2Targets = automation.backend.required_test_targets.join("\n");
    const manualOnly = readSection(acceptance, "### Manual Only");
    const manualAutomation = automation.external_smokes.join("\n");
    const workItemStage2 = workItem.verification.artifact_assertions.join("\n");
    const workItemManual = workItem.workflow.external_smokes.join("\n");

    for (const stage2Target of [
      "additive scoped RPC/core implementation",
      "planner and standalone route implementation using the scoped RPC/core",
      "isolated-local compatibility fixtures",
      "activation-block guard until Manual cutover evidence is complete",
    ]) {
      expect(stage2Targets).toContain(stage2Target);
    }

    const manualOperations = [
      "controlled full-local/current-head deploy",
      "old-server drain",
      "maintenance/write fence",
      "old overload revoke/drop",
      "callable inventory/negative privilege evidence",
      "server-Mac/OAuth",
      "activation",
    ];
    for (const operation of manualOperations) {
      expect(manualOnly).toContain(operation);
      expect(manualAutomation).toContain(operation);
      expect(workItemManual).toContain(operation);
    }

    expect(workItemStage2).toContain(
      "Stage 2 automated owns scoped additive RPC/core + planner and standalone route implementation + isolated-local fixtures + activation-block guard",
    );
    expect(workItemStage2).not.toContain(
      "no-new-api-field-status-error-action-screen-migration-or-direct-dml",
    );
    expect(workItemStage2).not.toContain("migration RPC Out of Scope");

    for (const automatedProjection of [stage2Text, stage2Targets]) {
      expect(automatedProjection).not.toMatch(
        /execute (?:the )?maintenance\/write fence|execute (?:the )?old overload revoke\/drop|perform (?:the )?controlled full-local\/current-head deploy|perform (?:the )?old-server drain/iu,
      );
      for (const manualOperation of [
        "controlled full-local/current-head deploy",
        "old-server drain",
        "maintenance/write fence",
        "old overload revoke/drop",
        "callable inventory/negative privilege evidence",
        "server-Mac/OAuth",
      ]) {
        expect(automatedProjection).not.toContain(manualOperation);
      }
    }
  });

  it("preserves the full automation external smoke projection in the work item", () => {
    expect(automation.external_smokes).toHaveLength(13);
    expect(workItem.workflow.external_smokes).toEqual(
      automation.external_smokes,
    );
  });

  it("P1 fresh review keeps the canonical work item inside the existing schema", () => {
    const schema = readJson(
      "docs/engineering/workflow-v2/schemas/work-item.schema.json",
    );
    const allowedVerificationKeys = Object.keys(
      schema.properties.verification.properties,
    ).sort();
    const actualVerificationKeys = Object.keys(workItem.verification).sort();

    expect(actualVerificationKeys).toEqual(allowedVerificationKeys);
    expect(workItem.workflow.execution_mode).toBe("manual");
    expect(workItem.workflow.external_smokes.join("\n")).toContain(
      "controlled full-local/current-head deploy",
    );
    expect(workItem.out_of_scope.join("\n")).not.toContain(
      "New API field status error action screen migration RPC RLS or direct DML",
    );
    expect(workItem.verification.artifact_assertions.join("\n")).toContain(
      "narrow additive migration with scoped SECURITY DEFINER RPC/core and no new table/column/public contract",
    );
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
    expect(workItem.verification.required_checks).toEqual(
      workItem.verification.verify_commands,
    );
    expect(workItem.verification.required_checks).toContain(
      stage1TestCommand,
    );
    expect(status.required_checks).toEqual(
      workItem.verification.required_checks,
    );
    expect(automation.backend.verify_commands).toContain(
      "pnpm verify:local-supabase-runtime:isolated",
    );
    expect(automation.backend.verify_commands.join("\n")).toContain(
      "tests/snapshot-v2-session-attempts.test.ts",
    );
    expect(automation.backend.verify_commands.join("\n")).toContain(
      "tests/snapshot-v2-complete.test.ts",
    );
    expect(automation.backend.required_test_targets).toEqual(
      expect.arrayContaining([
        "tests/snapshot-v2-session-attempts.test.ts",
        "tests/snapshot-v2-complete.test.ts",
      ]),
    );
    const expandedRuntimeCommand = automation.backend.verify_commands[0];
    expect(workItem.verification.required_checks).toContain(expandedRuntimeCommand);
    expect(workItem.verification.verify_commands).toContain(expandedRuntimeCommand);
    expect(status.required_checks).toContain(expandedRuntimeCommand);
    expect(read("tests/legacy-cooking-complete-routes.test.ts")).toContain(
      "returns exact 428 from the actual route when the approved phase is required",
    );
    expect(automation.frontend.verify_commands).toContain(
      "pnpm verify:frontend",
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
      "v1-missing-key-428-post-exact-activation-following-full-release-zero",
      "current-and-immediate-previous-stored-version-dispatch",
    ]);
    expect(automation.frontend.required_states.join("\n")).not.toMatch(
      /telemetry|tombstone|removal|fail-closed/iu,
    );
  });

  it("projects Stage 4 pending review while retaining predecessor authorities", () => {
    const designStatus = readSection(readme, "## Design Status");
    expect(designStatus).toContain("- [x] 리뷰 대기 (pending-review)");
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
