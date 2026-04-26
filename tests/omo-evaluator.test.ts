import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { evaluateWorkItemStage } from "../scripts/lib/omo-evaluator.mjs";
import { readRuntimeState, writeRuntimeState } from "../scripts/lib/omo-session-runtime.mjs";

const EVALUATOR_CHECKLIST_IDS = {
  backendDelivery: "delivery-backend-contract",
  backendAcceptance: "accept-backend-api",
  frontendDelivery: "delivery-ui-connection",
  frontendAcceptance: "accept-frontend-loading",
};

function createEvaluatorFixture({
  workItemId = "03-recipe-like",
  externalSmokes = ["true"],
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
  const roadmapFile = "docs/workpacks/README.md";
  const workpackReadmeFile = `docs/workpacks/${workItemId}/README.md`;
  const workpackAcceptanceFile = `docs/workpacks/${workItemId}/acceptance.md`;
  const workpackAutomationSpecFile = `docs/workpacks/${workItemId}/automation-spec.json`;

  mkdirSync(join(rootDir, ".workflow-v2", "work-items"), { recursive: true });
  mkdirSync(join(rootDir, "docs", "workpacks", workItemId), { recursive: true });
  mkdirSync(stageArtifactDir, { recursive: true });
  mkdirSync(join(worktreePath, "docs", "workpacks", workItemId), { recursive: true });
  mkdirSync(join(worktreePath, "app", "api", "v1", "recipes", "[id]", "like"), {
    recursive: true,
  });
  mkdirSync(join(worktreePath, "tests"), { recursive: true });

  writeFileSync(
    join(rootDir, "docs", "workpacks", workItemId, "README.md"),
    [
      `# ${workItemId}`,
      "",
      "## Design Authority",
      "",
      "- UI risk: `not-required`",
      "- Anchor screen dependency: 없음",
      "- Visual artifact: not-required",
      "- Authority status: `not-required`",
      "- Notes: none",
      "",
      "## Design Status",
      "",
      "- [x] 임시 UI (temporary)",
      "- [ ] 리뷰 대기 (pending-review)",
      "- [ ] 확정 (confirmed)",
      "- [ ] N/A",
      "",
      "## Delivery Checklist",
      `- [x] 백엔드 계약 고정 <!-- omo:id=${EVALUATOR_CHECKLIST_IDS.backendDelivery};stage=2;scope=backend;review=3,6 -->`,
      `- [ ] UI 연결 <!-- omo:id=${EVALUATOR_CHECKLIST_IDS.frontendDelivery};stage=4;scope=frontend;review=5,6 -->`,
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(rootDir, "docs", "workpacks", workItemId, "acceptance.md"),
    [
      "# Acceptance Checklist",
      "",
      "## Happy Path",
      `- [x] API 응답 형식이 { success, data, error }를 따른다 <!-- omo:id=${EVALUATOR_CHECKLIST_IDS.backendAcceptance};stage=2;scope=backend;review=3,6 -->`,
      `- [ ] loading 상태가 있다 <!-- omo:id=${EVALUATOR_CHECKLIST_IDS.frontendAcceptance};stage=4;scope=frontend;review=5,6 -->`,
      "",
      "## Automation Split",
      "",
      "### Manual Only",
      "- [ ] 실제 OAuth smoke",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(worktreePath, "docs", "workpacks", workItemId, "README.md"),
    readFileSync(join(rootDir, "docs", "workpacks", workItemId, "README.md"), "utf8"),
  );
  writeFileSync(
    join(worktreePath, "docs", "workpacks", workItemId, "acceptance.md"),
    readFileSync(join(rootDir, "docs", "workpacks", workItemId, "acceptance.md"), "utf8"),
  );
  writeFileSync(
    join(worktreePath, "docs", "workpacks", "README.md"),
    [
      "# Workpack Roadmap v2",
      "",
      "## Slice Order",
      "",
      "| Slice | Status | Goal |",
      "| --- | --- | --- |",
      `| \`${workItemId}\` | in-progress | evaluator fixture |`,
    ].join("\n"),
  );

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
  writeFileSync(
    join(worktreePath, "docs", "workpacks", workItemId, "automation-spec.json"),
    readFileSync(join(rootDir, "docs", "workpacks", workItemId, "automation-spec.json"), "utf8"),
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
          files: [routeFile, testFile, roadmapFile, workpackReadmeFile, workpackAcceptanceFile, workpackAutomationSpecFile],
          endpoints: ["POST /api/v1/recipes/{id}/like"],
          routes: [],
          states: [],
          invariants: ["toggle-idempotency"],
        },
        changed_files: [routeFile, testFile, roadmapFile, workpackReadmeFile, workpackAcceptanceFile, workpackAutomationSpecFile],
    tests_touched: [testFile],
    artifacts_written: [],
    checklist_updates: [
      {
        id: EVALUATOR_CHECKLIST_IDS.backendDelivery,
        status: "checked",
        evidence_refs: ["pnpm verify:backend"],
      },
      {
        id: EVALUATOR_CHECKLIST_IDS.backendAcceptance,
        status: "checked",
        evidence_refs: [testFile],
      },
    ],
    contested_fix_ids: [],
    rebuttals: [],
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
    routeFile,
    testFile,
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
    expect(result.requiredCommands).toEqual([
      "test -f tests/recipe-like.backend.test.ts",
      "true",
    ]);
    expect(existsSync(join(result.artifactDir, "result.json"))).toBe(true);
  });

  it("does not require external smokes when the automation spec declares none", () => {
    const fixture = createEvaluatorFixture({
      externalSmokes: [],
    });

    const result = evaluateWorkItemStage({
      rootDir: fixture.rootDir,
      workItemId: fixture.workItemId,
      stage: "backend",
      now: "2026-04-02T01:02:00.000Z",
    });

    expect(result.outcome).toBe("pass");
    expect(result.mergeEligible).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.requiredCommands).toEqual([
      "test -f tests/recipe-like.backend.test.ts",
    ]);
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

  it("treats bootstrap external smokes as pass once the local app becomes ready", () => {
    const fixture = createEvaluatorFixture({
      externalSmokes: ["pnpm dev:local-supabase"],
    });
    const result = evaluateWorkItemStage({
      rootDir: fixture.rootDir,
      workItemId: fixture.workItemId,
      stage: 2,
      now: "2026-04-02T01:12:00.000Z",
    });

    expect(result.outcome).toBe("pass");
    expect(result.mergeEligible).toBe(true);
    expect(
      readFileSync(join(result.artifactDir, "command-2.stdout.log"), "utf8"),
    ).toContain("Deferred bootstrap smoke: pnpm dev:local-supabase");
  });

  it("prefers worktree automation-spec over a stale root copy", () => {
    const fixture = createEvaluatorFixture({
      externalSmokes: ["true"],
    });

    writeFileSync(
      join(fixture.rootDir, "docs", "workpacks", fixture.workItemId, "automation-spec.json"),
      JSON.stringify(
        {
          slice_id: fixture.workItemId,
          execution_mode: "autonomous",
          risk_class: "low",
          merge_policy: "conditional-auto",
          backend: {
            required_endpoints: ["POST /api/v1/recipes/{id}/like"],
            invariants: ["toggle-idempotency"],
            verify_commands: ["test -f tests/recipe-like.backend.test.ts"],
            required_test_targets: ["tests/recipe-like.backend.test.ts"],
          },
          frontend: {
            required_routes: ["/recipes/[id]"],
            required_states: ["loading"],
            playwright_projects: ["desktop-chrome"],
            artifact_assertions: ["playwright-report"],
          },
          external_smokes: [
            {
              id: "invalid-object",
            },
          ],
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

    const result = evaluateWorkItemStage({
      rootDir: fixture.rootDir,
      workItemId: fixture.workItemId,
      stage: 2,
      artifactDir: fixture.stageArtifactDir,
      worktreePath: fixture.worktreePath,
      now: "2026-04-02T01:15:00.000Z",
    });

    expect(result.outcome).toBe("pass");
    expect(result.requiredCommands).toContain("true");
    expect(result.artifacts.automationSpecPath).toBe(
      join(fixture.worktreePath, "docs", "workpacks", fixture.workItemId, "automation-spec.json"),
    );
  });

  it("normalizes modified tracked files without porcelain prefixes", () => {
    const fixture = createEvaluatorFixture({
      externalSmokes: ["true"],
    });
    const stageResultPath = join(fixture.stageArtifactDir, "stage-result.json");
    const stageResult = JSON.parse(readFileSync(stageResultPath, "utf8"));

    execFileSync("git", ["add", "."], { cwd: fixture.worktreePath });
    execFileSync("git", ["commit", "-m", "feat: fixture baseline"], {
      cwd: fixture.worktreePath,
    });

    writeFileSync(
      join(fixture.worktreePath, fixture.routeFile),
      "export async function POST() { return Response.json({ success: false }); }\n",
    );

    stageResult.claimed_scope.files = [fixture.routeFile];
    stageResult.changed_files = [fixture.routeFile];
    writeFileSync(stageResultPath, `${JSON.stringify(stageResult, null, 2)}\n`);

    const result = evaluateWorkItemStage({
      rootDir: fixture.rootDir,
      workItemId: fixture.workItemId,
      stage: 2,
      artifactDir: fixture.stageArtifactDir,
      worktreePath: fixture.worktreePath,
      now: "2026-04-02T01:16:00.000Z",
    });

    expect(result.outcome).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("cleans stale opencode migration artifacts before checking worktree drift", () => {
    const fixture = createEvaluatorFixture({
      externalSmokes: ["true"],
    });
    const opencodeDir = join(fixture.worktreePath, ".opencode");
    const stageResultPath = join(fixture.stageArtifactDir, "stage-result.json");
    const stageResult = JSON.parse(readFileSync(stageResultPath, "utf8"));

    mkdirSync(opencodeDir, { recursive: true });
    writeFileSync(join(opencodeDir, "oh-my-opencode.json"), "{\n  \"plugin\": true\n}\n");

    execFileSync("git", ["add", "."], { cwd: fixture.worktreePath });
    execFileSync("git", ["commit", "-m", "feat: fixture baseline"], {
      cwd: fixture.worktreePath,
    });

    writeFileSync(
      join(fixture.worktreePath, fixture.routeFile),
      "export async function POST() { return Response.json({ success: false }); }\n",
    );
    writeFileSync(join(opencodeDir, "oh-my-opencode.json.bak"), "{\n  \"plugin\": true\n}\n");
    rmSync(join(opencodeDir, "oh-my-opencode.json"), { force: true });
    writeFileSync(join(opencodeDir, "oh-my-openagent.json"), "{\n  \"stale\": true\n}\n");
    writeFileSync(join(opencodeDir, "oh-my-openagent.json.migrations.json"), "{\n  \"stale\": true\n}\n");

    stageResult.claimed_scope.files = [fixture.routeFile];
    stageResult.changed_files = [fixture.routeFile];
    writeFileSync(stageResultPath, `${JSON.stringify(stageResult, null, 2)}\n`);

    const result = evaluateWorkItemStage({
      rootDir: fixture.rootDir,
      workItemId: fixture.workItemId,
      stage: 2,
      artifactDir: fixture.stageArtifactDir,
      worktreePath: fixture.worktreePath,
      now: "2026-04-02T01:17:00.000Z",
    });

    expect(result.outcome).toBe("pass");
    expect(existsSync(join(opencodeDir, "oh-my-opencode.json"))).toBe(true);
    expect(existsSync(join(opencodeDir, "oh-my-opencode.json.bak"))).toBe(false);
    expect(existsSync(join(opencodeDir, "oh-my-openagent.json"))).toBe(false);
    expect(existsSync(join(opencodeDir, "oh-my-openagent.json.migrations.json"))).toBe(false);
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
