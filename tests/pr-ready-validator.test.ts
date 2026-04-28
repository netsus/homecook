import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const SCRIPT_PATH = join(process.cwd(), "scripts", "validate-pr-ready.mjs");

function writeFixtureFile(rootDir: string, relativePath: string, contents: string) {
  const filePath = join(rootDir, relativePath);
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(filePath, contents);
}

function writeAutomationSpec(rootDir: string, slice: string) {
  writeFixtureFile(
    rootDir,
    `docs/workpacks/${slice}/automation-spec.json`,
    `${JSON.stringify(
      {
        slice_id: slice,
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
          required_routes: ["/pantry"],
          required_states: ["loading", "empty", "error"],
          playwright_projects: ["desktop-chrome"],
          artifact_assertions: ["playwright-report"],
          design_authority: {
            ui_risk: "new-screen",
            anchor_screens: [],
            required_screens: ["PANTRY"],
            generator_required: true,
            critic_required: true,
            authority_required: false,
            stage4_evidence_requirements: [],
            authority_report_paths: [],
          },
        },
        external_smokes: ["pnpm dev:local-supabase"],
        blocked_conditions: [],
        max_fix_rounds: {
          backend: 2,
          frontend: 2,
        },
      },
      null,
      2,
    )}\n`,
  );
}

function buildPrBody({
  actualResult,
}: {
  actualResult: string;
}) {
  return [
    "## Summary",
    "- pantry PR-ready fixture",
    "",
    "## Workpack / Slice",
    "- workflow v2 work item: `.workflow-v2/work-items/99-pr-ready-fixture.json`",
    "",
    "## Test Plan",
    "- pnpm test:harness",
    "",
    "## QA Evidence",
    "- exploratory QA: executed — `.artifacts/qa/99-pr-ready-fixture/stage4/exploratory-report.json`",
    "- qa eval: pass — `.artifacts/qa/99-pr-ready-fixture/stage4/eval-result.json`",
    "- 아티팩트 / 보고서 경로: `.artifacts/qa/99-pr-ready-fixture/stage4/exploratory-checklist.json`, `.artifacts/qa/99-pr-ready-fixture/stage4/exploratory-report.json`, `.artifacts/qa/99-pr-ready-fixture/stage4/eval-result.json`",
    "",
    "## Actual Verification",
    "- verifier: Codex",
    "- environment: local Supabase + `pnpm dev:local-supabase`",
    "- scope: source PR smoke evidence via `pnpm dev:local-supabase`",
    `- result: ${actualResult}`,
    "",
    "## Closeout Sync",
    "- source PR closeout sync will be revalidated before merge",
    "",
    "## Merge Gate",
    "- current head SHA: local preflight",
    "- started PR checks: local preflight",
    "- all checks completed green: 아니오 (PR 생성 전)",
    "- pending / failed / rerun checks: PR 생성 전",
    "",
    "## Docs Impact",
    "- automation validator docs and scripts only",
    "",
    "## Security Review",
    "- no runtime security surface changed",
    "",
    "## Performance",
    "- no app runtime performance impact",
    "",
    "## Design / Accessibility",
    "- no product UI changed",
    "",
    "## Breaking Changes",
    "- none",
    "",
  ].join("\n");
}

function createFixture(actualResult: string) {
  const rootDir = mkdtempSync(join(tmpdir(), "pr-ready-validator-"));
  const slice = "99-pr-ready-fixture";
  writeAutomationSpec(rootDir, slice);
  const bodyPath = join(rootDir, "pr-body.md");
  writeFileSync(bodyPath, buildPrBody({ actualResult }));

  return {
    rootDir,
    slice,
    bodyPath,
  };
}

function runValidator({
  rootDir,
  slice,
  bodyPath,
}: {
  rootDir: string;
  slice: string;
  bodyPath: string;
}) {
  return spawnSync(
    "node",
    [SCRIPT_PATH, "--slice", slice, "--pr-body", bodyPath, "--mode", "frontend"],
    {
      cwd: rootDir,
      encoding: "utf8",
    },
  );
}

describe("PR-ready validator", () => {
  it("fails pending Actual Verification placeholders before ready-for-review", () => {
    const fixture = createFixture("pending manual confirmation for `pnpm dev:local-supabase`");

    const result = runValidator(fixture);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("pending manual confirmation");
  });

  it("passes when PR body sections, QA evidence, and real smoke evidence are ready", () => {
    const fixture = createFixture("pass — local Supabase bootstrap + seed smoke passed for `pnpm dev:local-supabase`");

    const result = runValidator(fixture);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PR ready validation passed");
  });
});
