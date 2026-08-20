import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readWorkpackChecklistContract } from "../scripts/lib/omo-checklist-contract.mjs";
import { evaluateDocGate } from "../scripts/lib/omo-doc-gate.mjs";
import { validateAuthorityEvidencePresence } from "../scripts/lib/validate-authority-evidence-presence.mjs";

const root = process.cwd();
const sliceId = "cooking-meal-log-cross-slice-release-qa";
const trackedBranch = "docs/cooking-meal-log-cross-slice-relock";
const approvedPlanPath =
  "docs/workpacks/planner-shell/evidence/cooking-meal-log-and-product-search-master-plan-20260722.md";
const approvedPlanSha =
  "d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d";
const localOnlyAuthority =
  "docs/engineering/supabase-local-only-operations.md";
const officialSources = [
  "docs/sync/CURRENT_SOURCE_OF_TRUTH.md",
  "docs/요구사항기준선-v1.7.32.md",
  "docs/화면정의서-v1.5.36.md",
  "docs/유저flow맵-v1.3.34.md",
  "docs/db설계-v1.3.34.md",
  "docs/api문서-v1.2.39.md",
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

  it("keeps the Stage 1 exact-six lifecycle projection honest", () => {
    expect(roadmap).toMatch(
      /\| `cooking-meal-log-cross-slice-release-qa` \| docs \|/u,
    );
    expect(workItem.status).toEqual({
      lifecycle: "planned",
      approval_state: "not_started",
      verification_status: "pending",
      evaluation_status: "not_started",
      evaluation_round: 0,
      last_evaluator_result: null,
      auto_merge_eligible: false,
      blocked_reason_code: null,
    });
    expect(status).toMatchObject({
      branch: trackedBranch,
      pr_path: "https://github.com/netsus/homecook/pull/1373",
      ...workItem.status,
    });
    expect(readme).toContain(trackedBranch);
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
    ]) {
      expect(projection).toContain(required);
    }
  });

  it("keeps non-Draft authority validation owned only by the fresh #14 report", () => {
    const results = validateAuthorityEvidencePresence({
      rootDir: root,
      env: {
        ...process.env,
        BRANCH_NAME: `feature/fe-${sliceId}`,
        PR_IS_DRAFT: "false",
      },
    });
    const serialized = JSON.stringify(results);
    expect(serialized).toContain(
      "ui/designs/authority/cooking-meal-log-cross-slice-release-qa-authority.md",
    );
    for (const predecessorAuthority of designReuseIndex.map(
      ([, , , authority]) => authority,
    )) {
      expect(serialized).not.toContain(predecessorAuthority);
    }
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
