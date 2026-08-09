import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function section(markdown: string, start: string, end: string) {
  const startIndex = markdown.indexOf(start);
  const endIndex = markdown.indexOf(end, startIndex + start.length);

  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);

  return markdown.slice(startIndex, endIndex);
}

describe("cooked-batch-weight-ui Stage 1 docs and automation repair", () => {
  const readme = read("docs/workpacks/cooked-batch-weight-ui/README.md");
  const acceptance = read("docs/workpacks/cooked-batch-weight-ui/acceptance.md");
  const automation = JSON.parse(
    read("docs/workpacks/cooked-batch-weight-ui/automation-spec.json"),
  );
  const workItem = JSON.parse(
    read(".workflow-v2/work-items/cooked-batch-weight-ui.json"),
  );
  const workflowStatus = JSON.parse(read(".workflow-v2/status.json"));
  const status = workflowStatus.items.find(
    (item: { id: string }) => item.id === "cooked-batch-weight-ui",
  );

  const officialTuple = [
    "docs/요구사항기준선-v1.7.30.md",
    "docs/화면정의서-v1.5.34.md",
    "docs/유저flow맵-v1.3.32.md",
    "docs/db설계-v1.3.32.md",
    "docs/api문서-v1.2.37.md",
  ];
  const designArtifactIndex = [
    "stage1-design:ui/designs/COOK_MODE.md",
    "stage1-design:ui/designs/LEFTOVERS.md",
    "stage1-critic:ui/designs/critiques/COOK_MODE-cooked-batch-weight-ui-critique.md",
    "stage1-critic:ui/designs/critiques/LEFTOVERS-cooked-batch-weight-ui-critique.md",
  ];

  it("locks the current official tuple, master lineage and approved plan", () => {
    expect(workItem.docs_refs.source_of_truth).toEqual([
      "docs/sync/CURRENT_SOURCE_OF_TRUTH.md",
      ...officialTuple,
    ]);

    for (const path of officialTuple) {
      expect(readme).toContain(path);
      expect(acceptance).toContain(path);
    }

    for (const projection of [readme, acceptance, JSON.stringify(workItem)]) {
      expect(projection).toContain(
        "c16102a3072e929e45bb24a69464cd3110d03db5",
      );
      expect(projection).toContain(
        "674bc7bb5979f06759c3653ff4b5bf23fbe1cb1a",
      );
      expect(projection).toContain(
        "d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d",
      );
      expect(projection).toMatch(/1,018\s*(?:lines|행)/u);
    }

    expect(readme).toContain("API v1.2.37");
    expect(readme).toContain("API v1.2.36");
    expect(readme).toContain("0-CBW");
  });

  it("separates merged #8 delivery from its still-pending broader lifecycle", () => {
    const dependencies = workItem.dependencies.join("\n");
    const projections = [readme, dependencies, workItem.notes, status.notes];

    for (const projection of projections) {
      expect(projection).toContain("PR #1311");
      expect(projection).toContain(
        "2a2cd6fb81265ffa1f49e1c34ee68a26e1ddc49d",
      );
      expect(projection).toContain(
        "c16102a3072e929e45bb24a69464cd3110d03db5",
      );
      expect(projection).toContain("Stage 2/3/4");
      expect(projection).toContain("merged/green");
      expect(projection).toContain("Manual/server-Mac/OAuth");
      expect(projection).toContain("R/R+1/R+2");
      expect(projection).toContain("activation");
      expect(projection).toContain("pending");
    }

    expect(readme).toContain("PR #711");
    expect(readme).toContain(
      "2f8569cb56a53e9508d8d9571b94b260ec0bce73",
    );
    expect(readme).not.toContain("current roadmap state does not satisfy");
    expect(dependencies).not.toContain("must be merged and green before implementation");
  });

  it("locks #11 to the UI-only Stage 4 consumer lane", () => {
    expect(workItem).toMatchObject({
      change_type: "product",
      surface: "frontend",
    });
    expect(automation.backend).toEqual({
      required_endpoints: [],
      invariants: [],
      verify_commands: [],
      required_test_targets: [],
    });
    expect(automation.max_fix_rounds.backend).toBe(0);

    for (const projection of [readme, acceptance, workItem.notes]) {
      expect(projection).toContain("Stage 2/3");
      expect(projection).toContain("N/A");
      expect(projection).toContain("Stage 4");
      expect(projection).toContain("#9");
      expect(projection).toContain("#12");
    }

    expect(acceptance).not.toContain("stage=2");
    expect(acceptance).not.toContain("review=3");
    expect(JSON.stringify(automation)).not.toContain("pnpm verify:backend");
    expect(JSON.stringify(workItem.verification)).not.toContain(
      "pnpm verify:backend",
    );
    expect(readme).toContain("migration");
    expect(readme).toContain("Route Handler");
    expect(readme).toContain("RPC");
    expect(readme).toContain("public contract");
  });

  it("machine-locks both designs and both exact current critic reports", () => {
    expect(
      automation.frontend.artifact_assertions.filter((entry: string) =>
        entry.startsWith("stage1-"),
      ),
    ).toEqual(designArtifactIndex);

    expect(automation.frontend.design_authority).toMatchObject({
      required_screens: ["COOK_MODE", "LEFTOVERS"],
      generator_artifact: "ui/designs/COOK_MODE.md",
      critic_artifact:
        "ui/designs/critiques/COOK_MODE-cooked-batch-weight-ui-critique.md",
    });

    for (const path of designArtifactIndex.map((entry) => entry.split(":")[1])) {
      expect(readme).toContain(path);
      expect(acceptance).toContain(path);
    }

    for (const legacyPath of [
      "ui/designs/critiques/COOK_MODE-critique.md",
      "ui/designs/critiques/LEFTOVERS-critique.md",
    ]) {
      expect(readme).not.toContain(legacyPath);
      expect(acceptance).not.toContain(legacyPath);
      expect(JSON.stringify(automation)).not.toContain(legacyPath);
    }
  });

  it("separates Stage 1 commands, future Stage 4 proof and Manual Only evidence", () => {
    expect(workItem.verification.stage1_current_commands).toEqual(
      workItem.verification.verify_commands,
    );
    expect(status.required_checks).toEqual(
      workItem.verification.stage1_current_commands,
    );
    expect(workItem.verification.stage4_future_commands).toEqual(
      automation.frontend.verify_commands,
    );
    expect(workItem.verification.manual_only_evidence).toEqual([
      "physical keyboard focus order trap restore and Escape",
      "VoiceOver or TalkBack equivalent screen-reader announcements",
      "real 390px and 320px device safe-area and virtual-keyboard occlusion",
      "server-Mac and OAuth environment evidence",
      "R/R+1/R+2 and capability activation remain pending and are not performed by #11",
    ]);

    expect(status).toMatchObject({
      lifecycle: "planned",
      approval_state: "not_started",
      verification_status: "pending",
      evaluation_status: "not_started",
      auto_merge_eligible: false,
    });
  });

  it("locks required Stage 1 structure and mobile/accessibility proof boundaries", () => {
    for (const heading of [
      "## Dependencies",
      "## Schema Change",
      "## Backend First Contract",
      "## Frontend Delivery Mode",
      "## QA / Test Data Plan",
      "## Primary User Path",
    ]) {
      expect(readme).toContain(heading);
    }
    expect(acceptance).toContain("## Data Setup / Preconditions");

    const mobileContract = [readme, acceptance, JSON.stringify(automation)].join(
      "\n",
    );
    for (const expected of [
      "390px",
      "320px",
      "bottom sheet",
      "44px",
      "16px",
      "focus trap",
      "focus restore",
      "Escape",
      "virtual keyboard",
      "overflow",
      "screen reader",
      "WCAG",
      "legacy-null",
      "depleted",
      "Stage 4",
      "pending",
    ]) {
      expect(mobileContract).toContain(expected);
    }
  });

  it("allows only exact projected current-closure cancel on depleted cards", () => {
    const depletedRule =
      "모든 depleted card에서 weight/discard/adjust/close/consume CTA를 제거";
    const exactCancelRule =
      "`current_unweighed_closure_event_id != null`인 exact current `closed_unweighed` projection에서만 secondary `[방금 종료 취소]`를 허용";
    const noReopenRule =
      "generic reopen, non-current closure cancel, unrecoverable reversal은 금지";
    const readmeContracts = [
      section(readme, "### LEFTOVERS weight and lifecycle UI", "## Schema Change"),
      section(readme, "## Frontend Delivery Mode", "## State / Error Matrix"),
      section(readme, "## State / Error Matrix", "## Primary User Path"),
    ];

    for (const contract of readmeContracts) {
      expect(contract).toContain(depletedRule);
      expect(contract).toContain(exactCancelRule);
      expect(contract).toContain(noReopenRule);
    }

    const acceptanceRule = acceptance
      .split("\n")
      .find((line) => line.includes("accept-batch-weight-ui-empty-depleted"));
    expect(acceptanceRule).toContain(depletedRule);
    expect(acceptanceRule).toContain(exactCancelRule);
    expect(acceptanceRule).toContain(noReopenRule);
    expect(acceptance).not.toContain("every depleted state removes mutation CTAs");
    expect(readme).not.toContain("generic reopen action");
  });
});
