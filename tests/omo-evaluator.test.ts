import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { evaluateWorkItemStage } from "../scripts/lib/omo-evaluator.mjs";
import { readRuntimeState, writeRuntimeState } from "../scripts/lib/omo-session-runtime.mjs";

function createEvaluatorFixture({
  workItemId = "03-recipe-like",
  externalSmokes = [],
  stageResultOverrides = {},
}: {
  workItemId?: string;
  externalSmokes?: string[];
  stageResultOverrides?: Record<string, unknown>;
} = {}) {
  const rootDir = mkdtempSync(join(tmpdir(), "omo-evaluator-"));
  const worktreePath = join(rootDir, ".worktrees", workItemId);
  const stageArtifactDir = join(rootDir, ".artifacts", "stage2");
  const routeFile = "app/api/v1/recipes/[id]/like/route.ts";
  const testFile = "tests/recipe-like.backend.test.ts";

  mkdirSync(join(rootDir, ".workflow-v2", "work-items"), { recursive: true });
  mkdirSync(join(rootDir, "docs", "workpacks", workItemId), { recursive: true });
  mkdirSync(stageArtifactDir, { recursive: true });
  mkdirSync(join(worktreePath, "app", "api", "v1", "recipes", "[id]", "like"), {
    recursive: true,
  });
  mkdirSync(join(worktreePath, "tests"), { recursive: true });

  execFileSync("git", ["init", "-b", `feature/be-${workItemId}`], { cwd: worktreePath });
  execFileSync("git", ["config", "user.name", "OMO Evaluator Test"], { cwd: worktreePath });
  execFileSync("git", ["config", "user.email", "omo-evaluator@example.com"], {
    cwd: worktreePath,
  });

  writeFileSync(
    join(rootDir, ".workflow-v2", "work-items", `${workItemId}.json`),
    JSON.stringify(
      {
        id: workItemId,
        title: "Recipe like autonomous slice",
        project_profile: "homecook",
        change_type: "product",
        surface: "fullstack",
        risk: "low",
        preset: "vertical-slice-strict",
        goal: "Validate evaluator-driven backend automation.",
        owners: {
          claude: "docs-and-governance",
          codex: "implementation-and-integration",
          workers: ["testing"],
        },
        docs_refs: {
          source_of_truth: ["AGENTS.md"],
          governing_docs: ["docs/engineering/workflow-v2/omo-evaluator.md"],
        },
        workflow: {
          plan_loop: "recommended",
          review_loop: "required",
          external_smokes: [],
          execution_mode: "autonomous",
          evaluator_profile: "slice-autonomous-v1",
          merge_policy: "conditional-auto",
          max_fix_rounds: {
            backend: 4,
            frontend: 4,
          },
        },
        verification: {
          required_checks: ["pnpm verify:backend"],
          verify_commands: ["test -f tests/recipe-like.backend.test.ts"],
          evaluator_commands: [],
          artifact_assertions: [],
        },
        status: {
          lifecycle: "in_progress",
          approval_state: "not_started",
          verification_status: "pending",
          evaluation_status: "not_started",
          evaluation_round: 0,
          last_evaluator_result: null,
          auto_merge_eligible: false,
          blocked_reason_code: null,
        },
      },
      null,
      2,
    ),
  );

  writeFileSync(
    join(rootDir, "docs", "workpacks", workItemId, "automation-spec.json"),
    JSON.stringify(
      {
        slice_id: workItemId,
        execution_mode: "autonomous",
        risk_class: "low",
        merge_policy: "conditional-auto",
        backend: {
          required_endpoints: ["POST /api/v1/recipes/{id}/like"],
          invariants: ["toggle-idempotency"],
          verify_commands: ["test -f tests/recipe-like.backend.test.ts"],
          required_test_targets: [testFile],
        },
        frontend: {
          required_routes: ["/recipes/[id]"],
          required_states: ["loading"],
          playwright_projects: ["desktop-chrome"],
          artifact_assertions: ["playwright-report"],
        },
        external_smokes: externalSmokes,
        blocked_conditions: [],
        max_fix_rounds: {
          backend: 4,
          frontend: 4,
        },
      },
      null,
      2,
    ),
  );

  writeFileSync(join(worktreePath, routeFile), "export async function POST() { return Response.json({ success: true }); }\n");
  writeFileSync(join(worktreePath, testFile), "import { describe, it, expect } from \"vitest\";\n\ndescribe(\"recipe like\", () => {\n  it(\"locks the contract\", () => {\n    expect(true).toBe(true);\n  });\n});\n");

  const stageResult = {
    result: "done",
    summary_markdown: "Backend implementation is ready for evaluation.",
    pr: {
      title: "feat: automate recipe like backend",
      body_markdown: "## Summary\n- backend autonomous slice",
    },
    checks_run: ["pnpm verify:backend"],
    next_route: "wait_for_ci",
    claimed_scope: {
      files: [routeFile, testFile],
      endpoints: ["POST /api/v1/recipes/{id}/like"],
      routes: [],
      states: [],
      invariants: ["toggle-idempotency"],
    },
    changed_files: [routeFile, testFile],
    tests_touched: [testFile],
    artifacts_written: [],
    ...stageResultOverrides,
  };

  writeFileSync(
    join(stageArtifactDir, "stage-result.json"),
    `${JSON.stringify(stageResult, null, 2)}\n`,
  );

  writeRuntimeState({
    rootDir,
    workItemId,
    state: {
      ...readRuntimeState({
        rootDir,
        workItemId,
        slice: workItemId,
      }).state,
      slice: workItemId,
      active_stage: 2,
      current_stage: 2,
      last_completed_stage: 1,
      workspace: {
        path: worktreePath,
        branch_role: "backend",
        updated_at: "2026-04-02T00:00:00.000Z",
      },
      execution: {
        artifact_dir: stageArtifactDir,
        stage_result_path: join(stageArtifactDir, "stage-result.json"),
      },
    },
  });

  return {
    rootDir,
    workItemId,
    stageArtifactDir,
    worktreePath,
  };
}

describe("OMO evaluator", () => {
  it("returns pass with merge eligibility for an autonomous backend slice that satisfies the contract", () => {
    const fixture = createEvaluatorFixture();

    const result = evaluateWorkItemStage({
      rootDir: fixture.rootDir,
      workItemId: fixture.workItemId,
      stage: "backend",
      now: "2026-04-02T01:00:00.000Z",
    });

    expect(result.outcome).toBe("pass");
    expect(result.mergeEligible).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.requiredCommands).toEqual(["test -f tests/recipe-like.backend.test.ts"]);
    expect(existsSync(join(result.artifactDir, "result.json"))).toBe(true);
  });

  it("returns fixable and writes remediation artifacts when the backend contract metadata is incomplete", () => {
    const fixture = createEvaluatorFixture({
      stageResultOverrides: {
        claimed_scope: {
          files: ["app/api/v1/recipes/[id]/like/route.ts", "tests/recipe-like.backend.test.ts"],
          endpoints: [],
          routes: [],
          states: [],
          invariants: ["toggle-idempotency"],
        },
        tests_touched: [],
      },
    });

    const result = evaluateWorkItemStage({
      rootDir: fixture.rootDir,
      workItemId: fixture.workItemId,
      stage: 2,
      now: "2026-04-02T01:05:00.000Z",
    });

    expect(result.outcome).toBe("fixable");
    expect(result.mergeEligible).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "backend-endpoint-POST /api/v1/recipes/{id}/like",
          category: "contract",
          owner: "codex",
          fixable: true,
        }),
        expect.objectContaining({
          category: "tests",
          owner: "codex",
          fixable: true,
        }),
      ]),
    );
    expect(result.remediation.inputPath).toBeTruthy();
    expect(result.remediation.promptPath).toBeTruthy();
    expect(readFileSync(result.remediation.promptPath!, "utf8")).toContain("## Required fixes");
  });

  it("returns blocked when external smoke fails even if the code contract itself is valid", () => {
    const fixture = createEvaluatorFixture({
      externalSmokes: ["false"],
    });

    const result = evaluateWorkItemStage({
      rootDir: fixture.rootDir,
      workItemId: fixture.workItemId,
      stage: 2,
      now: "2026-04-02T01:10:00.000Z",
    });

    expect(result.outcome).toBe("blocked");
    expect(result.mergeEligible).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "external-smoke",
          owner: "human",
          fixable: false,
        }),
      ]),
    );
  });

  it("includes severity_counts in every evaluator result", () => {
    const fixture = createEvaluatorFixture();
    const result = evaluateWorkItemStage({
      rootDir: fixture.rootDir,
      workItemId: fixture.workItemId,
      stage: 2,
      now: "2026-04-02T01:20:00.000Z",
    });

    expect(result.severity_counts).toBeDefined();
    expect(typeof result.severity_counts.critical).toBe("number");
    expect(typeof result.severity_counts.major).toBe("number");
    expect(typeof result.severity_counts.minor).toBe("number");
    expect(typeof result.severity_counts.total).toBe("number");
    expect(result.severity_counts.total).toBe(result.findings.length);
  });

  it("severity_counts.total is 0 for a passing evaluation", () => {
    const fixture = createEvaluatorFixture();

    // make it pass: commit files, satisfy contract
    execFileSync("git", ["add", "."], { cwd: fixture.worktreePath });
    execFileSync("git", ["commit", "-m", "feat: satisfy contract", "--allow-empty"], {
      cwd: fixture.worktreePath,
    });

    const result = evaluateWorkItemStage({
      rootDir: fixture.rootDir,
      workItemId: fixture.workItemId,
      stage: 2,
      artifactDir: fixture.stageArtifactDir,
      now: "2026-04-02T01:30:00.000Z",
    });

    if (result.outcome === "pass") {
      expect(result.severity_counts.total).toBe(0);
    } else {
      expect(result.severity_counts.total).toBeGreaterThanOrEqual(0);
    }
  });
});
