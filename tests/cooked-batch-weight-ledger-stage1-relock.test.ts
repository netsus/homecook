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

  it("keeps fresh Stage 1 approval pending on the new docs branch", () => {
    expect(status).toMatchObject({
      branch: "docs/cooked-batch-api-contract-v1-2-36",
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

  it("records all internal 1.5 repairs while keeping fresh re-review pending", () => {
    const dependencyRepairSha =
      "9ff5a920f063af22cd8a8dbee33a603b27c3af57";
    const projections = [
      readme,
      evidence,
      automation.notes,
      workItem.notes,
      status.notes,
    ];

    for (const projection of projections) {
      for (const finding of ["I15-B01", "I15-B02", "I15-B03"]) {
        expect(projection).toContain(finding);
      }
      expect(projection).toContain("HOLD");
      expect(projection).toContain("fresh internal 1.5 re-review pending");
      expect(projection).toContain("#1286");
      expect(projection).toContain(dependencyRepairSha);
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
