import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { validateExploratoryQaEvidence } from "../scripts/lib/validate-exploratory-qa-evidence.mjs";

function writeFixtureFile(rootDir: string, relativePath: string, contents: string) {
  const filePath = join(rootDir, relativePath);
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(filePath, contents);
}

function createFixture({
  uiRisk,
  artifactBundle = false,
}: {
  uiRisk: "not-required" | "low-risk" | "new-screen" | "high-risk" | "anchor-extension";
  artifactBundle?: boolean;
}) {
  const rootDir = mkdtempSync(join(tmpdir(), "exploratory-qa-evidence-"));

  writeFixtureFile(
    rootDir,
    "docs/workpacks/06-recipe-to-planner/automation-spec.json",
    JSON.stringify(
      {
        slice_id: "06-recipe-to-planner",
        execution_mode: "autonomous",
        risk_class: "medium",
        merge_policy: "conditional-auto",
        backend: {
          required_endpoints: [],
          invariants: [],
          verify_commands: [],
          required_test_targets: [],
        },
        frontend: {
          required_routes: ["/planner"],
          required_states: ["loading", "empty", "error"],
          playwright_projects: ["desktop-chrome", "mobile-chrome", "mobile-ios-small"],
          artifact_assertions: ["playwright-report"],
          design_authority: {
            ui_risk: uiRisk,
            anchor_screens: uiRisk === "anchor-extension" ? ["PLANNER_WEEK"] : [],
            required_screens: uiRisk === "anchor-extension" ? ["PLANNER_WEEK"] : [],
            generator_required: false,
            critic_required: false,
            authority_required: uiRisk === "anchor-extension",
            stage4_evidence_requirements: [],
            authority_report_paths: [],
          },
        },
        external_smokes: [],
        blocked_conditions: [],
        max_fix_rounds: {
          backend: 2,
          frontend: 2,
        },
      },
      null,
      2,
    ),
  );

  if (artifactBundle) {
    writeFixtureFile(
      rootDir,
      ".artifacts/qa/06-recipe-to-planner/manual/exploratory-checklist.json",
      "{}",
    );
    writeFixtureFile(
      rootDir,
      ".artifacts/qa/06-recipe-to-planner/manual/exploratory-report.json",
      "{}",
    );
    writeFixtureFile(
      rootDir,
      ".artifacts/qa/06-recipe-to-planner/manual/eval-result.json",
      "{}",
    );
  }

  return rootDir;
}

function buildQaEvidenceSection({
  exploratoryQa,
  qaEval,
  artifactPaths,
}: {
  exploratoryQa: string;
  qaEval: string;
  artifactPaths: string;
}) {
  return [
    "## Summary",
    "- validator test",
    "## Workpack / Slice",
    "- 관련 workpack: docs/workpacks/06-recipe-to-planner/",
    "## Test Plan",
    "- 실행한 검증: `pnpm validate:exploratory-qa-evidence`",
    "## QA Evidence",
    `- deterministic gates: \`pnpm verify:frontend\``,
    `- exploratory QA: ${exploratoryQa}`,
    `- qa eval: ${qaEval}`,
    `- 아티팩트 / 보고서 경로: ${artifactPaths}`,
  ].join("\n");
}

describe("exploratory QA evidence validator", () => {
  it("skips branches outside frontend ready-for-review or closeout", () => {
    const rootDir = createFixture({ uiRisk: "new-screen" });

    const results = validateExploratoryQaEvidence({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "feature/be-06-recipe-to-planner",
        PR_IS_DRAFT: "false",
      },
    });

    expect(results).toEqual([]);
  });

  it("fails required UI risk when QA Evidence section omits exploratory evidence", () => {
    const rootDir = createFixture({ uiRisk: "new-screen" });

    const results = validateExploratoryQaEvidence({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "feature/fe-06-recipe-to-planner",
        PR_IS_DRAFT: "false",
        PR_BODY: buildQaEvidenceSection({
          exploratoryQa: "`N/A`",
          qaEval: "`N/A`",
          artifactPaths: "`N/A`",
        }),
      },
    });

    expect(results[0]?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("cannot be omitted"),
        }),
        expect.objectContaining({
          message: expect.stringContaining("qa eval evidence is required"),
        }),
        expect.objectContaining({
          message: expect.stringContaining("Artifact/report paths are required"),
        }),
      ]),
    );
  });

  it("passes required UI risk when PR body contains exploratory report and eval references", () => {
    const rootDir = createFixture({ uiRisk: "high-risk" });

    const results = validateExploratoryQaEvidence({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "feature/fe-06-recipe-to-planner",
        PR_IS_DRAFT: "false",
        PR_BODY: buildQaEvidenceSection({
          exploratoryQa: "실행 완료 (mobile + desktop)",
          qaEval: "pass (92점)",
          artifactPaths:
            ".artifacts/qa/06-recipe-to-planner/2026-04-13/exploratory-report.json, .artifacts/qa/06-recipe-to-planner/2026-04-13/eval-result.json",
        }),
      },
    });

    expect(results).toEqual([]);
  });

  it("fails low-risk UI change when skip rationale is missing", () => {
    const rootDir = createFixture({ uiRisk: "low-risk" });

    const results = validateExploratoryQaEvidence({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "feature/fe-06-recipe-to-planner",
        PR_IS_DRAFT: "false",
        PR_BODY: buildQaEvidenceSection({
          exploratoryQa: "생략",
          qaEval: "`N/A`",
          artifactPaths: "`N/A`",
        }),
      },
    });

    expect(results[0]?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("skip rationale"),
        }),
      ]),
    );
  });

  it("passes low-risk UI change when skip rationale is recorded", () => {
    const rootDir = createFixture({ uiRisk: "low-risk" });

    const results = validateExploratoryQaEvidence({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "feature/fe-06-recipe-to-planner",
        PR_IS_DRAFT: "false",
        PR_BODY: buildQaEvidenceSection({
          exploratoryQa: "N/A (low-risk spacing/token swap only)",
          qaEval: "N/A (exploratory QA skipped with same rationale)",
          artifactPaths: "N/A (no exploratory bundle created for low-risk spacing/token swap)",
        }),
      },
    });

    expect(results).toEqual([]);
  });

  it("falls back to local artifacts when PR body is unavailable", () => {
    const rootDir = createFixture({
      uiRisk: "anchor-extension",
      artifactBundle: true,
    });

    const results = validateExploratoryQaEvidence({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "docs/omo-closeout-06-recipe-to-planner",
      },
    });

    expect(results).toEqual([]);
  });

  it("fails required UI risk without PR body or local artifact bundle", () => {
    const rootDir = createFixture({ uiRisk: "anchor-extension" });

    const results = validateExploratoryQaEvidence({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "docs/omo-closeout-06-recipe-to-planner",
      },
    });

    expect(results[0]?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("Provide PR_BODY/PR_BODY_FILE or keep a local .artifacts/qa bundle"),
        }),
      ]),
    );
  });
});
