import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { evaluateBookkeepingInvariant } from "../scripts/lib/omo-bookkeeping.mjs";
import { reconcileWorkItemBookkeeping } from "../scripts/lib/omo-reconcile.mjs";
import { readRuntimeState, writeRuntimeState } from "../scripts/lib/omo-session-runtime.mjs";
import { validateOmoBookkeeping } from "../scripts/lib/validate-omo-bookkeeping.mjs";

function seedTrackedFiles(rootDir: string, workItemId: string) {
  mkdirSync(join(rootDir, ".workflow-v2", "work-items"), { recursive: true });
  mkdirSync(join(rootDir, "docs", "workpacks", workItemId), { recursive: true });
  mkdirSync(join(rootDir, "docs", "sync"), { recursive: true });

  writeFileSync(
    join(rootDir, "docs", "sync", "CURRENT_SOURCE_OF_TRUTH.md"),
    [
      "# Current Source of Truth",
      "",
      "## Official Files",
      "- `docs/요구사항기준선-v1.6.3.md`",
      "- `docs/화면정의서-v1.2.3.md`",
      "- `docs/유저flow맵-v1.2.3.md`",
      "- `docs/db설계-v1.3.1.md`",
      "- `docs/api문서-v1.2.2.md`",
    ].join("\n"),
  );

  writeFileSync(
    join(rootDir, "docs", "workpacks", "README.md"),
    [
      "# Workpack Roadmap v2",
      "",
      "## Slice Order",
      "",
      "| Slice | Status | Goal |",
      "| --- | --- | --- |",
      `| \`${workItemId}\` | in-progress | test slice |`,
    ].join("\n"),
  );
  writeFileSync(
    join(rootDir, "docs", "workpacks", workItemId, "README.md"),
    [
      `# ${workItemId}`,
      "",
      "## Design Status",
      "",
      "- [ ] 임시 UI (temporary)",
      "- [ ] 리뷰 대기 (pending-review)",
      "- [x] 확정 (confirmed)",
      "- [ ] N/A",
      "",
      "## Delivery Checklist",
      "",
      "- [x] merged bookkeeping closeout is aligned",
    ].join("\n"),
  );
  writeFileSync(
    join(rootDir, "docs", "workpacks", workItemId, "acceptance.md"),
    [
      "# Acceptance Checklist",
      "",
      "## Happy Path",
      "- [x] merged slice acceptance remains closed",
      "",
      "## Automation Split",
      "",
      "### Manual Only",
      "- [ ] none",
    ].join("\n"),
  );
  writeFileSync(
    join(rootDir, ".workflow-v2", "status.json"),
    JSON.stringify(
      {
        version: 1,
        project_profile: "homecook",
        updated_at: "2026-04-01T00:00:00.000Z",
        items: [
          {
            id: workItemId,
            preset: "vertical-slice-strict",
            lifecycle: "merged",
            approval_state: "dual_approved",
            verification_status: "passed",
            required_checks: ["pnpm validate:workflow-v2"],
          },
        ],
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(rootDir, ".workflow-v2", "work-items", `${workItemId}.json`),
    JSON.stringify(
      {
        id: workItemId,
        title: "Planner slice",
        project_profile: "homecook",
        change_type: "product",
        surface: "fullstack",
        risk: "high",
        preset: "vertical-slice-strict",
        goal: "Test bookkeeping drift.",
        owners: {
          claude: "review",
          codex: "implementation",
          workers: [],
        },
        docs_refs: {
          source_of_truth: ["AGENTS.md"],
          governing_docs: ["docs/engineering/workflow-v2/omo-autonomous-supervisor.md"],
        },
        workflow: {
          plan_loop: "required",
          review_loop: "skipped",
          external_smokes: [],
        },
        verification: {
          required_checks: ["pnpm validate:workflow-v2"],
          verify_commands: ["pnpm validate:workflow-v2"],
        },
        status: {
          lifecycle: "merged",
          approval_state: "dual_approved",
          verification_status: "passed",
        },
      },
      null,
      2,
    ),
  );
}

function writeAutomationSpec(rootDir: string, workItemId: string, uiRisk: string) {
  writeFileSync(
    join(rootDir, "docs", "workpacks", workItemId, "automation-spec.json"),
    JSON.stringify(
      {
        slice_id: workItemId,
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
}

function createRuntimeFixture(workItemId = "05-planner-week-core") {
  const rootDir = mkdtempSync(join(tmpdir(), "omo-bookkeeping-"));
  seedTrackedFiles(rootDir, workItemId);

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
      active_stage: 6,
      current_stage: 6,
      last_completed_stage: 6,
      phase: "done",
      next_action: "noop",
      wait: null,
    },
  });

  return rootDir;
}

function createGitWorkspace(rootDir: string) {
  execFileSync("git", ["init", "-b", "master"], { cwd: rootDir });
  execFileSync("git", ["config", "user.name", "OMO Test"], { cwd: rootDir });
  execFileSync("git", ["config", "user.email", "omo@example.com"], { cwd: rootDir });
}

function createGitOriginFixture(workItemId = "05-planner-week-core") {
  const rootDir = createRuntimeFixture(workItemId);
  createGitWorkspace(rootDir);
  execFileSync("git", ["add", "-A"], { cwd: rootDir });
  execFileSync("git", ["commit", "-m", "chore: seed bookkeeping drift fixture"], { cwd: rootDir });

  const remoteDir = mkdtempSync(join(tmpdir(), "omo-bookkeeping-remote-"));
  execFileSync("git", ["init", "--bare", "--initial-branch=master", remoteDir]);
  execFileSync("git", ["remote", "add", "origin", remoteDir], { cwd: rootDir });
  execFileSync("git", ["push", "-u", "origin", "master"], { cwd: rootDir });

  return {
    rootDir,
    remoteDir,
  };
}

function createFakeGh(rootDir: string, prNumber = 123) {
  const ghBin = join(rootDir, "fake-gh.sh");
  const ghLogPath = join(rootDir, "fake-gh.log");

  writeFileSync(
    ghBin,
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `printf '%s\\n' \"$*\" >> \"${ghLogPath}\"`,
      "if [[ \"$1\" == \"auth\" && \"$2\" == \"status\" ]]; then",
      "  exit 0",
      "fi",
      "if [[ \"$1\" == \"pr\" && \"$2\" == \"create\" ]]; then",
      `  echo \"https://github.com/netsus/homecook/pull/${prNumber}\"`,
      "  exit 0",
      "fi",
      "if [[ \"$1\" == \"pr\" && \"$2\" == \"checks\" ]]; then",
      "  echo '[{\"bucket\":\"pending\",\"name\":\"quality\",\"state\":\"PENDING\",\"workflow\":\"CI\",\"link\":null}]'",
      "  exit 0",
      "fi",
      "if [[ \"$1\" == \"pr\" && \"$2\" == \"view\" ]]; then",
      "  echo '{\"statusCheckRollup\":[]}'",
      "  exit 0",
      "fi",
      "echo \"unsupported gh args: $*\" >&2",
      "exit 1",
      "",
    ].join("\n"),
  );
  chmodSync(ghBin, 0o755);

  return {
    ghBin,
    ghLogPath,
  };
}

describe("OMO bookkeeping", () => {
  it("classifies done runtime plus stale roadmap as repairable_post_merge", () => {
    const rootDir = createRuntimeFixture();

    const invariant = evaluateBookkeepingInvariant({
      rootDir,
      workItemId: "05-planner-week-core",
      slice: "05-planner-week-core",
      runtimeState: readRuntimeState({
        rootDir,
        workItemId: "05-planner-week-core",
        slice: "05-planner-week-core",
      }).state,
    });

    expect(invariant.outcome).toBe("repairable_post_merge");
    expect(invariant.issues).toEqual([
      expect.objectContaining({
        kind: "roadmap_status",
        actual: "in-progress",
        expected: "merged",
      }),
    ]);
  });

  it("classifies missing roadmap rows as ambiguous drift", () => {
    const rootDir = createRuntimeFixture("03-recipe-like");
    writeFileSync(
      join(rootDir, "docs", "workpacks", "README.md"),
      [
        "# Workpack Roadmap v2",
        "",
        "## Slice Order",
        "",
        "| Slice | Status | Goal |",
        "| --- | --- | --- |",
        "| `04-recipe-save` | merged | test slice |",
      ].join("\n"),
    );

    const invariant = evaluateBookkeepingInvariant({
      rootDir,
      workItemId: "03-recipe-like",
      slice: "03-recipe-like",
      runtimeState: readRuntimeState({
        rootDir,
        workItemId: "03-recipe-like",
        slice: "03-recipe-like",
      }).state,
    });

    expect(invariant.outcome).toBe("ambiguous_drift");
    expect(invariant.reason).toBe("roadmap_row_missing");
  });

  it("validator fails when merged runtime/workflow state drifts from the roadmap", () => {
    const rootDir = createRuntimeFixture();

    const results = validateOmoBookkeeping({
      rootDir,
      env: { ...process.env },
    });

    expect(results).toEqual([
      expect.objectContaining({
        name: "omo-bookkeeping:05-planner-week-core",
        errors: [
          expect.objectContaining({
            message: expect.stringContaining("must be marked 'merged'"),
          }),
        ],
      }),
    ]);
  });

  it("validator rejects closeout branches that touch non-doc files", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-closeout-branch-"));
    createGitWorkspace(rootDir);
    mkdirSync(join(rootDir, "docs", "workpacks", "03-recipe-like"), { recursive: true });
    writeFileSync(join(rootDir, "README.md"), "# Repo\n");
    writeFileSync(
      join(rootDir, "docs", "workpacks", "README.md"),
      [
        "# Workpack Roadmap v2",
        "",
        "## Slice Order",
        "",
        "| Slice | Status | Goal |",
        "| --- | --- | --- |",
        "| `03-recipe-like` | in-progress | test slice |",
      ].join("\n"),
    );
    writeFileSync(
      join(rootDir, "docs", "workpacks", "03-recipe-like", "README.md"),
      [
        "# 03-recipe-like",
        "",
        "## Design Status",
        "",
        "- [ ] 임시 UI (temporary)",
        "- [ ] 리뷰 대기 (pending-review)",
        "- [x] 확정 (confirmed)",
        "- [ ] N/A",
      ].join("\n"),
    );
    execFileSync("git", ["add", "-A"], { cwd: rootDir });
    execFileSync("git", ["commit", "-m", "chore: seed closeout fixture"], { cwd: rootDir });
    const baseHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: rootDir, encoding: "utf8" }).trim();
    execFileSync("git", ["update-ref", "refs/remotes/origin/master", baseHead], { cwd: rootDir });
    execFileSync("git", ["checkout", "-b", "docs/omo-closeout-03-recipe-like"], { cwd: rootDir });

    writeFileSync(
      join(rootDir, "docs", "workpacks", "README.md"),
      [
        "# Workpack Roadmap v2",
        "",
        "## Slice Order",
        "",
        "| Slice | Status | Goal |",
        "| --- | --- | --- |",
        "| `03-recipe-like` | merged | test slice |",
      ].join("\n"),
    );
    writeFileSync(join(rootDir, "README.md"), "# Repo\n\nunexpected\n");
    execFileSync("git", ["add", "-A"], { cwd: rootDir });
    execFileSync("git", ["commit", "-m", "docs: simulate invalid closeout diff"], { cwd: rootDir });

    const results = validateOmoBookkeeping({
      rootDir,
      env: {
        ...process.env,
        BRANCH_NAME: "docs/omo-closeout-03-recipe-like",
        BASE_REF: "master",
      },
    });

    expect(results).toEqual([
      expect.objectContaining({
        name: "omo-bookkeeping:closeout-branch",
        errors: [
          expect.objectContaining({
            path: "README.md",
            message: expect.stringContaining("Closeout PR must only modify"),
          }),
        ],
      }),
    ]);
  });

  it("opens a docs-only closeout PR for repairable post-merge drift", () => {
    const workItemId = "05-planner-week-core";
    const { rootDir } = createGitOriginFixture(workItemId);
    const { ghBin, ghLogPath } = createFakeGh(rootDir, 321);

    const result = reconcileWorkItemBookkeeping({
      rootDir,
      workItemId,
      ghBin,
      now: "2026-04-01T12:00:00.000Z",
    });

    expect(result.action).toBe("open_closeout_pr");
    expect(result.pr).toEqual(
      expect.objectContaining({
        number: 321,
        url: "https://github.com/netsus/homecook/pull/321",
        draft: false,
      }),
    );
    expect(result.checks).toEqual(
      expect.objectContaining({
        bucket: "pending",
      }),
    );
    expect(result.branch).toBe("docs/omo-closeout-05-planner-week-core");
    expect(result.worktreePath).toBeTruthy();
    if (!result.worktreePath) {
      throw new Error("Expected reconcile result to include worktreePath.");
    }
    expect(existsSync(result.worktreePath)).toBe(false);

    const runtime = readRuntimeState({
      rootDir,
      workItemId,
      slice: workItemId,
    }).state;
    expect(runtime.wait).toEqual(
      expect.objectContaining({
        kind: "ci",
        pr_role: "closeout",
        stage: 6,
      }),
    );
    expect(runtime.prs.closeout).toEqual(
      expect.objectContaining({
        number: 321,
        url: "https://github.com/netsus/homecook/pull/321",
        branch: "docs/omo-closeout-05-planner-week-core",
      }),
    );

    const statusContents = JSON.parse(
      readFileSync(join(rootDir, ".workflow-v2", "status.json"), "utf8"),
    ) as {
      items: Array<{ id: string; lifecycle: string; notes: string; pr_path: string }>;
    };
    const statusItem = statusContents.items.find((item) => item.id === workItemId);
    expect(statusItem).toEqual(
      expect.objectContaining({
        lifecycle: "ready_for_review",
        pr_path: "https://github.com/netsus/homecook/pull/321",
      }),
    );
    expect(statusItem?.notes).toContain("closeout_pr=https://github.com/netsus/homecook/pull/321");

    const remoteBranch = execFileSync(
      "git",
      ["ls-remote", "--heads", "origin", "docs/omo-closeout-05-planner-week-core"],
      {
        cwd: rootDir,
        encoding: "utf8",
      },
    );
    expect(remoteBranch).toContain("refs/heads/docs/omo-closeout-05-planner-week-core");

    const ghLog = readFileSync(ghLogPath, "utf8");
    expect(ghLog).toContain("auth status");
    expect(ghLog).toContain("pr create");
    expect(ghLog).toContain("pr checks https://github.com/netsus/homecook/pull/321 --json");
    expect(ghLog).not.toContain("--required");
  });

  it("fails closeout reconcile when required exploratory evidence cannot be traced to a frontend PR", () => {
    const workItemId = "05-planner-week-core";
    const { rootDir } = createGitOriginFixture(workItemId);
    const { ghBin } = createFakeGh(rootDir, 322);
    writeAutomationSpec(rootDir, workItemId, "high-risk");

    expect(() =>
      reconcileWorkItemBookkeeping({
        rootDir,
        workItemId,
        ghBin,
        now: "2026-04-01T12:00:00.000Z",
      }),
    ).toThrow(/merged frontend PR reference/);
  });

  it("reuses merged frontend PR QA evidence when opening closeout PRs for required UI slices", () => {
    const workItemId = "05-planner-week-core";
    const { rootDir } = createGitOriginFixture(workItemId);
    const { ghBin, ghLogPath } = createFakeGh(rootDir, 323);
    writeAutomationSpec(rootDir, workItemId, "high-risk");

    writeRuntimeState({
      rootDir,
      workItemId,
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId,
          slice: workItemId,
        }).state,
        prs: {
          docs: null,
          backend: null,
          frontend: {
            number: 77,
            url: "https://github.com/netsus/homecook/pull/77",
            draft: false,
            branch: "feature/fe-05-planner-week-core",
            head_sha: "fe123",
          },
          closeout: null,
        },
      },
    });

    const result = reconcileWorkItemBookkeeping({
      rootDir,
      workItemId,
      ghBin,
      now: "2026-04-01T12:00:00.000Z",
    });

    expect(result.action).toBe("open_closeout_pr");

    const ghLog = readFileSync(ghLogPath, "utf8");
    expect(ghLog).toContain("exploratory-report.json");
    expect(ghLog).toContain("eval-result.json");
    expect(ghLog).toContain("https://github.com/netsus/homecook/pull/77");
  });
});
