import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const sliceId = "planner-shell";
const baseSha = "8ba3fa5a2a198eb4f9c19d59cea5f6ccc52fdd4f";
const planSha =
  "d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d";
const planArtifact =
  "docs/workpacks/planner-shell/evidence/cooking-meal-log-and-product-search-master-plan-20260722.md";

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

function readJson(relativePath: string) {
  return JSON.parse(read(relativePath));
}

describe("planner-shell fresh Stage 1 relock", () => {
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
  const design = read("ui/designs/PLANNER_WEEK.md");

  it("locks the current five-source tuple and approved plan lineage", () => {
    expect(workItem.docs_refs.source_of_truth).toEqual([
      "docs/sync/CURRENT_SOURCE_OF_TRUTH.md",
      "docs/요구사항기준선-v1.7.30.md",
      "docs/화면정의서-v1.5.34.md",
      "docs/유저flow맵-v1.3.32.md",
      "docs/db설계-v1.3.32.md",
      "docs/api문서-v1.2.37.md",
    ]);

    for (const projection of [readme, acceptance, design, JSON.stringify(workItem)]) {
      expect(projection).toContain(planSha);
      expect(projection).toMatch(/1,018\s*(?:lines|행)/u);
    }

    const owningBundle = [readme, acceptance, JSON.stringify(workItem)].join("\n");
    expect(owningBundle).not.toContain("45f02013fbc1c3af");
    expect(owningBundle).not.toContain("1,056 lines");
    expect(owningBundle).not.toContain("1056-line");

    expect(existsSync(join(root, planArtifact))).toBe(true);
    if (!existsSync(join(root, planArtifact))) return;

    const approvedPlan = readFileSync(join(root, planArtifact));
    expect(createHash("sha256").update(approvedPlan).digest("hex")).toBe(planSha);
    expect(approvedPlan.toString("utf8").match(/\n/gu)).toHaveLength(1_018);
    expect(workItem.docs_refs.governing_docs).toContain(planArtifact);
    expect(JSON.stringify(workItem)).not.toContain(
      "/Users/shj/2025/2026/homecook1/.omx/plans/",
    );
  });

  it("keeps the active Stage 4 projection without promoting the broader lifecycle", () => {
    const projections = [
      readme,
      acceptance,
      workItem.dependencies.join("\n"),
      workItem.notes,
      status.notes,
      roadmap,
    ];

    for (const projection of projections) {
      expect(projection).toContain("#1319");
      expect(projection).toContain(baseSha);
      expect(projection).toContain("Manual/server-Mac/OAuth");
      expect(projection).toContain("R/R+1/R+2");
      expect(projection).toContain("activation");
      expect(projection).toContain("pending");
    }

    expect(workItem.status).toMatchObject({
      lifecycle: "in_progress",
      approval_state: "not_started",
      verification_status: "pending",
    });
    expect(status).toMatchObject({
      lifecycle: "in_progress",
      approval_state: "not_started",
      verification_status: "pending",
      evaluation_status: "not_started",
      auto_merge_eligible: false,
    });
    expect(roadmap).toMatch(
      /\| 9 \| D \| `meal-log-core` \| in-progress \|/u,
    );
    expect(roadmap).toMatch(
      /\| 10 \| E \| `planner-shell` \| in-progress \|/u,
    );
  });

  it("preserves the exact release chain and adjacent ownership", () => {
    const contract = [readme, acceptance, workItem.notes].join("\n");

    expect(contract).toContain("#8 -> #9 -> (#10, #11) -> #12 -> #13 -> #14");
    expect(contract).toContain("#11");
    expect(contract).toContain("COOK_MODE/LEFTOVERS");
    expect(contract).toContain("#12");
    expect(contract).toContain("MEAL_LOG");
    expect(contract).toContain("#13");
    expect(contract).toContain("tombstone");
    expect(contract).toContain("Stage 2 backend implementation is N/A");
    expect(contract).toContain("no schema");
  });

  it("separates Stage 1 commands, future UI proof and Manual Only evidence", () => {
    expect(workItem.verification.stage1_current_commands).toEqual(
      workItem.verification.verify_commands,
    );
    expect(status.required_checks).toEqual(
      workItem.verification.stage1_current_commands,
    );
    expect(workItem.verification.stage4_future_commands).toEqual(
      automation.frontend.verify_commands,
    );
    expect(automation.external_smokes).toEqual(
      workItem.workflow.external_smokes,
    );
    expect(automation.external_smokes).toHaveLength(7);
    expect(workItem.verification.manual_only_evidence).toEqual(
      expect.arrayContaining([
        expect.stringContaining("390px and 320px"),
        expect.stringContaining("server-Mac and OAuth"),
        expect.stringContaining("R/R+1/R+2"),
      ]),
    );
  });

  it("locks mobile accessibility and design-authority boundaries without self approval", () => {
    const contract = [readme, acceptance, design, JSON.stringify(automation)].join(
      "\n",
    );

    for (const expected of [
      "390px",
      "320px",
      "16px",
      "44px",
      "keyboard",
      "focus",
      "Escape",
      "virtual keyboard",
      "overflow",
      "temporary",
    ]) {
      expect(contract).toContain(expected);
    }

    expect(design).toContain("#10 Stage 1 Active Contract");
    expect(design).toContain("historical content is not #10 approval");
    expect(workItem.notes).toContain("author does not approve its own changes");
    expect(workItem.verification.evaluator_commands).toContain(
      "separate Codex design critic review before implementation",
    );
  });

  it("locks responsive seven-day containment and meal-column stress cases", () => {
    const contract = [readme, acceptance, design, JSON.stringify(automation)].join(
      "\n",
    );

    for (const expected of [
      "7-day containment",
      "at least 2-day overview",
      "1/3/5 meal columns",
      "long custom meal names",
      "200% text scaling",
      "localization expansion",
      "bottom-tab safe-area",
    ]) {
      expect(contract).toContain(expected);
    }
  });

  it("keeps empty slots contract-neutral and locks roving-tab focus behavior", () => {
    const contract = [readme, acceptance, design].join("\n");

    expect(contract).toContain("`비어 있음`");
    expect(contract).toContain("Contract Evolution Candidate");
    expect(contract).not.toContain("plan-only add affordance");
    expect(contract).not.toContain("plan empty CTA");

    for (const expected of [
      "roving tabindex",
      "Arrow Left/Right",
      "Home/End",
      "Tab enters the selected panel",
      "deep-link/auth-return/invoker-loss fallback",
    ]) {
      expect(contract).toContain(expected);
    }
  });

  it("separates static PNG, Playwright interaction, and Manual Only proof", () => {
    const evidenceContract = [
      readme,
      acceptance,
      JSON.stringify(automation),
      JSON.stringify(workItem),
    ].join("\n");

    for (const expected of [
      "PNG static-layout proof",
      "Playwright history/focus/Escape proof",
      "Manual physical keyboard/screen reader/device keyboard proof",
    ]) {
      expect(evidenceContract).toContain(expected);
    }
  });
});
