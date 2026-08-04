import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("cooked-batch-weight-ledger fresh Stage 1 re-lock", () => {
  const readme = read("docs/workpacks/cooked-batch-weight-ledger/README.md");
  const acceptance = read("docs/workpacks/cooked-batch-weight-ledger/acceptance.md");
  const automation = JSON.parse(
    read("docs/workpacks/cooked-batch-weight-ledger/automation-spec.json"),
  );
  const workItem = JSON.parse(
    read(".workflow-v2/work-items/cooked-batch-weight-ledger.json"),
  );
  const workflowStatus = JSON.parse(read(".workflow-v2/status.json"));
  const roadmap = read("docs/workpacks/README.md");
  const cookModeDesign = read("ui/designs/COOK_MODE.md");
  const evidence = read(
    "docs/workpacks/cooked-batch-weight-ledger/evidence/2026-08-04-stage1-relock.md",
  );

  it("locks every #8 source reference to the current official tuple", () => {
    expect(workItem.docs_refs.source_of_truth).toEqual([
      "docs/sync/CURRENT_SOURCE_OF_TRUTH.md",
      "docs/요구사항기준선-v1.7.29.md",
      "docs/화면정의서-v1.5.33.md",
      "docs/유저flow맵-v1.3.31.md",
      "docs/db설계-v1.3.31.md",
      "docs/api문서-v1.2.35.md",
    ]);

    for (const version of ["v1.7.29", "v1.5.33", "v1.3.31", "v1.2.35"]) {
      expect(readme).toContain(version);
      expect(acceptance).toContain(version);
      expect(cookModeDesign).toContain(version);
    }
  });

  it("projects merged runtime predecessors without closing the broader #7 lifecycle", () => {
    const dependencyText = workItem.dependencies.join("\n");

    expect(dependencyText).toContain("PR #1281");
    expect(dependencyText).toContain(
      "aab9a65e6123e3134478842971765ad3aa737d6a",
    );
    expect(dependencyText).toContain(
      "2173737e8ea2eec2297e1cc0227ce4f2c27c50b9",
    );
    expect(dependencyText).toContain("overall lifecycle remains in_progress");
    expect(dependencyText).toContain("PR #711");
    expect(dependencyText).toContain(
      "2f8569cb56a53e9508d8d9571b94b260ec0bce73",
    );
    expect(readme).toContain("Manual/server-Mac");
    expect(roadmap).toContain("PR #1281 exact head `aab9a65e`");
    expect(roadmap).toContain("merge `2173737e`");
  });

  it("requires fresh #8 critic and 390/320 authority approval before Stage 2", () => {
    const authority = automation.frontend.design_authority;

    expect(authority.generator_artifact).toBe("ui/designs/COOK_MODE.md");
    expect(authority.critic_artifact).toBe(
      "ui/designs/critiques/COOK_MODE-cooked-batch-weight-ledger-critique.md",
    );
    expect(authority.authority_report_paths).toEqual([
      "ui/designs/authority/COOK_MODE-cooked-batch-weight-ledger-authority.md",
    ]);
    expect(authority.stage4_evidence_requirements).toEqual(
      expect.arrayContaining([
        "ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-design-mobile-default-390.png",
        "ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-design-mobile-narrow-320.png",
      ]),
    );
    expect(automation.blocked_conditions).toContain(
      "stage2-entered-before-fresh-independent-slice8-design-critic-and-390-320-product-design-authority-pass",
    );
    expect(readme).toContain("Stage 2 진입 전");
    expect(acceptance).toContain("Stage 2 진입 전");
  });

  it("locks exact pantry rows, weight choices, recovery states and dark creation drain", () => {
    for (const expected of [
      "pantry_item_id",
      "제품명",
      "브랜드",
      "자동 선택하지 않는다",
      "완성 직후 음식 전체 중량",
      "나중에 입력",
      "Loading",
      "Empty",
      "Error",
      "stored replay",
      "creation-off",
    ]) {
      expect(cookModeDesign).toContain(expected);
    }
  });

  it("keeps fresh Stage 1 approval pending on the new docs branch", () => {
    const status = workflowStatus.items.find(
      (item: { id: string }) => item.id === "cooked-batch-weight-ledger",
    );

    expect(status).toMatchObject({
      branch: "docs/cooked-batch-weight-ledger-stage1-relock",
      lifecycle: "planned",
      approval_state: "not_started",
      verification_status: "pending",
    });
    expect(workItem.status).toMatchObject({
      lifecycle: "planned",
      approval_state: "not_started",
      verification_status: "pending",
    });
  });

  it("records the merged #1284 baseline repair and the current audit floor truthfully", () => {
    const mergedSha = "c982d97085ebcbe50da8a1b3c3de68bcd9f638a3";

    expect(evidence).toContain(`#1284`);
    expect(evidence).toContain(mergedSha);
    expect(evidence).toContain("high/critical `0`");
    expect(evidence).not.toContain("Dependency audit repair PR `#1284` is still pending");
    expect(evidence).not.toContain("pre-existing high advisories `3`");

    expect(readme).toContain(`#1284`);
    expect(readme).toContain(mergedSha);
    expect(readme).not.toContain("pending dependency audit repair PR `#1284`");
  });
});
