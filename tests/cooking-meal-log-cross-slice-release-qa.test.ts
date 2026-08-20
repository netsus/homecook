import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { evaluateDocGate } from "../scripts/lib/omo-doc-gate.mjs";

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
      pr_path: "pending",
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
