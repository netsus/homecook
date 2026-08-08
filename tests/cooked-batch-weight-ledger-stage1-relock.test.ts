import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function readPngWidth(path: string) {
  const png = readFileSync(join(root, path));
  expect(png.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return png.readUInt32BE(16);
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
  const status = workflowStatus.items.find(
    (item: { id: string }) => item.id === "cooked-batch-weight-ledger",
  );
  const roadmap = read("docs/workpacks/README.md");
  const cookModeDesign = read("ui/designs/COOK_MODE.md");
  const critic = read(
    "ui/designs/critiques/COOK_MODE-cooked-batch-weight-ledger-critique.md",
  );
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
      "docs/api문서-v1.2.36.md",
    ]);

    for (const version of ["v1.7.29", "v1.5.33", "v1.3.31", "v1.2.36"]) {
      expect(readme).toContain(version);
      expect(acceptance).toContain(version);
    }
    expect(cookModeDesign).toContain("API `v1.2.35`");
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

  it("requires fresh #8 critic and 390/320 authority approval before Stage 4", () => {
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
      "stage4-entered-before-fresh-independent-slice8-design-critic-and-390-320-product-design-authority-pass",
    );
    expect(readme).toContain("019fe02c-1b12-7d42-bcaf-0d5a02847967");
    expect(readme).toContain("019fe041-2ff4-7f62-9786-79a46aecae0c");
    expect(acceptance).toContain("- [ ] canonical COOK_MODE #8 design");
    expect(acceptance).toContain("- [ ] fresh 390px/320px screenshot/Figma");
  });

  it("provides fresh #8 design evidence at the locked mobile widths", () => {
    expect(
      readPngWidth(
        "ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-design-mobile-default-390.png",
      ),
    ).toBe(390);
    expect(
      readPngWidth(
        "ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-design-mobile-narrow-320.png",
      ),
    ).toBe(320);
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

  it("projects active Stage 2 without promoting approval or verification", () => {
    expect(status).toMatchObject({
      branch: "feature/cooked-batch-weight-ledger-stage2-current",
      lifecycle: "in_progress",
      approval_state: "not_started",
      verification_status: "pending",
    });
    expect(workItem.status).toMatchObject({
      lifecycle: "in_progress",
      approval_state: "not_started",
      verification_status: "pending",
    });
  });

  it("uses only the official joint R+2 capability names", () => {
    expect(readme).toContain("`personal_recipe_v2` and `snapshot_v2_creation`");
    expect(readme).not.toContain("cooking_session_v2");
  });

  it("keeps the preserved critic report free of trailing whitespace", () => {
    const trailingWhitespaceLines = critic
      .split("\n")
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => /[ \t]+$/.test(line));

    expect(trailingWhitespaceLines).toEqual([]);
  });

  it("retains the old repair record and projects the final Stage 1 approvals", () => {
    const dependencyRepairSha =
      "9ff5a920f063af22cd8a8dbee33a603b27c3af57";
    const currentProjections = [
      readme,
      automation.notes,
      workItem.notes,
      status.notes,
    ];

    for (const finding of ["I15-B01", "I15-B02", "I15-B03"]) {
      expect(evidence).toContain(finding);
    }
    expect(evidence).toContain("HOLD");
    expect(evidence).toContain("#1286");
    expect(evidence).toContain(dependencyRepairSha);

    for (const projection of currentProjections) {
      expect(projection).toContain("019fe0c0");
      expect(projection).toContain("019fe194-62d9-7ed2-9116-b820873bd48b");
      expect(projection).toContain("APPROVE");
      expect(projection).toContain("635763041d6420c648e2b55336e6caa9f1f9143c");
      expect(projection).not.toContain("fresh internal 1.5 re-review pending");
    }
    expect(evidence).toContain("high/critical `0`");
    expect(evidence).toContain("false pass claim");
    expect(evidence).toContain("six Markdown hard-break trailing-space pairs");
  });

  it("records PR #1285 as merged without retaining a current Draft claim", () => {
    expect(evidence).not.toMatch(
      /(?:PR\s+)?`?#1285`?[^\n]*(?:remains|still)\s+`?Draft`?/iu,
    );
    expect(evidence).toContain(
      "PR `#1285` was `Draft` at the authored/relock snapshot",
    );
    expect(evidence).toContain(
      "later `MERGED` with `isDraft=false` at merge SHA `e868fe803743454a0a8e9ea59a733d0692e0658b`",
    );
  });
});
