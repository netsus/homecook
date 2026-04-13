import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { evaluateBookkeepingInvariant } from "../scripts/lib/omo-bookkeeping.mjs";
import { reconcileWorkItemBookkeeping } from "../scripts/lib/omo-reconcile.mjs";
import { readRuntimeState, writeRuntimeState } from "../scripts/lib/omo-session-runtime.mjs";
import { validateOmoBookkeeping } from "../scripts/lib/validate-omo-bookkeeping.mjs";

function metadata(id: string, stage: 2 | 4, scope: "backend" | "frontend" | "shared", review: string) {
  return `<!-- omo:id=${id};stage=${stage};scope=${scope};review=${review} -->`;
}

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

function writeAutomationSpec(
  rootDir: string,
  workItemId: string,
  uiRisk: string,
  externalSmokes: string[] = [],
) {
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
        external_smokes: externalSmokes,
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

function setRoadmapStatus(rootDir: string, workItemId: string, status: string) {
  writeFileSync(
    join(rootDir, "docs", "workpacks", "README.md"),
    [
      "# Workpack Roadmap v2",
      "",
      "## Slice Order",
      "",
      "| Slice | Status | Goal |",
      "| --- | --- | --- |",
      `| \`${workItemId}\` | ${status} | test slice |`,
    ].join("\n"),
  );
}

function setWorkpackCloseoutState({
  rootDir,
  workItemId,
  deliveryChecked,
  acceptanceChecked,
  authorityStatus = "not-required",
}: {
  rootDir: string;
  workItemId: string;
  deliveryChecked: boolean;
  acceptanceChecked: boolean;
  authorityStatus?: string;
}) {
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
      `- Authority status: \`${authorityStatus}\``,
      "- Notes: none",
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
      `- [${deliveryChecked ? "x" : " "}] merged bookkeeping closeout is aligned`,
    ].join("\n"),
  );
  writeFileSync(
    join(rootDir, "docs", "workpacks", workItemId, "acceptance.md"),
    [
      "# Acceptance Checklist",
      "",
      "## Happy Path",
      `- [${acceptanceChecked ? "x" : " "}] merged slice acceptance remains closed`,
      "",
      "## Automation Split",
      "",
      "### Manual Only",
      "- [ ] none",
    ].join("\n"),
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

function createGitOriginFixture(
  workItemId = "05-planner-week-core",
  mutateFiles?: (rootDir: string) => void,
) {
  const rootDir = createRuntimeFixture(workItemId);
  mutateFiles?.(rootDir);
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

function createFakeGh(
  rootDir: string,
  prNumber = 123,
  {
    prBody = [
      "## Actual Verification",
      "- verifier: Codex",
      "- environment: local Supabase + seeded demo account",
      "- scope: bootstrap smoke via `pnpm dev:local-supabase`",
      "- result: pass (demo data loaded)",
      "",
      "## QA Evidence",
      "- exploratory QA: `N/A`",
      "- qa eval: `N/A`",
      "- 아티팩트 / 보고서 경로: `N/A`",
    ].join("\n"),
  }: {
    prBody?: string;
  } = {},
) {
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
      "  if [[ \"$*\" == *\"--json body\"* ]]; then",
      `    cat <<'JSON'\n{\"body\":${JSON.stringify(prBody)}}\nJSON`,
      "    exit 0",
      "  fi",
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

  it("treats final_authority_pending as a valid pre-closeout state for authority-required slices", () => {
    const workItemId = "03-recipe-like";
    const rootDir = mkdtempSync(join(tmpdir(), "omo-bookkeeping-final-authority-"));
    seedTrackedFiles(rootDir, workItemId);

    writeFileSync(
      join(rootDir, "docs", "workpacks", workItemId, "README.md"),
      [
        `# ${workItemId}`,
        "",
        "## Design Status",
        "",
        "- [ ] 임시 UI (temporary)",
        "- [x] 리뷰 대기 (pending-review)",
        "- [ ] 확정 (confirmed)",
        "- [ ] N/A",
      ].join("\n"),
    );
    writeFileSync(
      join(rootDir, ".workflow-v2", "status.json"),
      JSON.stringify(
        {
          version: 1,
          project_profile: "homecook",
          updated_at: "2026-04-11T00:00:00.000Z",
          items: [
            {
              id: workItemId,
              preset: "vertical-slice-strict",
              lifecycle: "ready_for_review",
              approval_state: "codex_approved",
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
          ...JSON.parse(readFileSync(join(rootDir, ".workflow-v2", "work-items", `${workItemId}.json`), "utf8")),
          status: {
            lifecycle: "ready_for_review",
            approval_state: "codex_approved",
            verification_status: "passed",
          },
        },
        null,
        2,
      ),
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
        active_stage: 5,
        current_stage: 5,
        last_completed_stage: 5,
        phase: "wait",
        next_action: "run_stage",
        wait: {
          kind: "ready_for_next_stage",
          stage: 5,
          pr_role: "frontend",
        },
        design_authority: {
          status: "final_authority_pending",
          authority_required: true,
          authority_verdict: "pass",
          required_screens: ["RECIPE_DETAIL"],
          reviewed_screen_ids: ["RECIPE_DETAIL"],
          authority_report_paths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
        },
      },
    });

    const invariant = evaluateBookkeepingInvariant({
      rootDir,
      workItemId,
      slice: workItemId,
      runtimeState: readRuntimeState({
        rootDir,
        workItemId,
        slice: workItemId,
      }).state,
    });

    expect(invariant.outcome).toBe("ok");
    expect(invariant.issues).toEqual([]);
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

  it("repairs merged checklist closeout drift even when roadmap and design bookkeeping are already aligned", () => {
    const workItemId = "05-planner-week-core";
    const { rootDir } = createGitOriginFixture(workItemId, (fixtureRoot) => {
      setRoadmapStatus(fixtureRoot, workItemId, "merged");
      setWorkpackCloseoutState({
        rootDir: fixtureRoot,
        workItemId,
        deliveryChecked: false,
        acceptanceChecked: false,
      });
    });
    const { ghBin } = createFakeGh(rootDir, 324);

    const result = reconcileWorkItemBookkeeping({
      rootDir,
      workItemId,
      ghBin,
      now: "2026-04-01T12:00:00.000Z",
    });

    expect(result.action).toBe("open_closeout_pr");

    const readmeOnBranch = execFileSync(
      "git",
      [
        "show",
        "origin/docs/omo-closeout-05-planner-week-core:docs/workpacks/05-planner-week-core/README.md",
      ],
      {
        cwd: rootDir,
        encoding: "utf8",
      },
    );
    const acceptanceOnBranch = execFileSync(
      "git",
      [
        "show",
        "origin/docs/omo-closeout-05-planner-week-core:docs/workpacks/05-planner-week-core/acceptance.md",
      ],
      {
        cwd: rootDir,
        encoding: "utf8",
      },
    );

    expect(readmeOnBranch).toContain("- [x] merged bookkeeping closeout is aligned");
    expect(acceptanceOnBranch).toContain("- [x] merged slice acceptance remains closed");
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

  it("reuses source PR Actual Verification smoke evidence when closeout preflight requires external smokes", () => {
    const workItemId = "05-planner-week-core";
    const { rootDir } = createGitOriginFixture(workItemId);
    const { ghBin, ghLogPath } = createFakeGh(rootDir, 326);
    writeAutomationSpec(rootDir, workItemId, "not-required", ["pnpm dev:local-supabase"]);

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
    expect(ghLog).toContain("pr view https://github.com/netsus/homecook/pull/77 --json body");
  });

  it("repairs authority closeout metadata from runtime evidence when the authority report already passes", () => {
    const workItemId = "05-planner-week-core";
    const authorityReportPath = "ui/designs/authority/PLANNER_WEEK-authority.md";
    const { rootDir } = createGitOriginFixture(workItemId, (fixtureRoot) => {
      setRoadmapStatus(fixtureRoot, workItemId, "merged");
      writeFileSync(
        join(fixtureRoot, "docs", "workpacks", workItemId, "README.md"),
        [
          `# ${workItemId}`,
          "",
          "## Design Authority",
          "",
          "- UI risk: `not-required`",
          "- Anchor screen dependency: 없음",
          "- Visual artifact: not-required",
          "- Authority status: `required`",
          "- Notes: none",
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
          `- [x] merged bookkeeping closeout is aligned ${metadata("delivery-ui", 4, "frontend", "5,6")}`,
        ].join("\n"),
      );
      writeFileSync(
        join(fixtureRoot, "docs", "workpacks", workItemId, "acceptance.md"),
        [
          "# Acceptance Checklist",
          "",
          "## Happy Path",
          `- [x] merged slice acceptance remains closed ${metadata("accept-ui", 4, "frontend", "5,6")}`,
          "",
          "## Automation Split",
          "",
          "### Manual Only",
          "- [ ] none",
        ].join("\n"),
      );
      writeAutomationSpec(fixtureRoot, workItemId, "anchor-extension");
      mkdirSync(join(fixtureRoot, "ui", "designs", "authority"), { recursive: true });
      mkdirSync(join(fixtureRoot, "ui", "designs", "evidence", "authority"), { recursive: true });
      writeFileSync(
        join(fixtureRoot, authorityReportPath),
        [
          "# PLANNER_WEEK Authority Review",
          "",
          "> evidence:",
          "> - `ui/designs/evidence/authority/PLANNER_WEEK-mobile.png`",
          "> - `ui/designs/evidence/authority/PLANNER_WEEK-mobile-narrow.png`",
          "",
          "## Verdict",
          "",
          "- verdict: `pass`",
        ].join("\n"),
      );
      writeFileSync(
        join(fixtureRoot, "ui", "designs", "evidence", "authority", "PLANNER_WEEK-mobile.png"),
        "default evidence",
      );
      writeFileSync(
        join(fixtureRoot, "ui", "designs", "evidence", "authority", "PLANNER_WEEK-mobile-narrow.png"),
        "narrow evidence",
      );
      writeRuntimeState({
        rootDir: fixtureRoot,
        workItemId,
        state: {
          ...readRuntimeState({
            rootDir: fixtureRoot,
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
          last_review: {
            backend: null,
            frontend: {
              decision: "approve",
              route_back_stage: null,
              approved_head_sha: "fe123",
              body_markdown: "approved",
              findings: [],
              review_scope: {
                scope: "closeout",
                checklist_ids: [],
              },
              reviewed_checklist_ids: [],
              required_fix_ids: [],
              waived_fix_ids: [],
              authority_verdict: "pass",
              reviewed_screen_ids: ["PLANNER_WEEK"],
              authority_report_paths: [authorityReportPath],
              blocker_count: 0,
              major_count: 0,
              minor_count: 0,
              source_review_stage: 5,
              ping_pong_rounds: 0,
              updated_at: "2026-04-01T12:00:00.000Z",
            },
          },
        },
      });
    });
    const { ghBin } = createFakeGh(rootDir, 325);

    const result = reconcileWorkItemBookkeeping({
      rootDir,
      workItemId,
      ghBin,
      now: "2026-04-01T12:00:00.000Z",
    });

    expect(result.action).toBe("open_closeout_pr");

    const readmeOnBranch = execFileSync(
      "git",
      [
        "show",
        "origin/docs/omo-closeout-05-planner-week-core:docs/workpacks/05-planner-week-core/README.md",
      ],
      {
        cwd: rootDir,
        encoding: "utf8",
      },
    );
    const automationSpecOnBranch = execFileSync(
      "git",
      [
        "show",
        "origin/docs/omo-closeout-05-planner-week-core:docs/workpacks/05-planner-week-core/automation-spec.json",
      ],
      {
        cwd: rootDir,
        encoding: "utf8",
      },
    );

    expect(readmeOnBranch).toContain("- Authority status: `reviewed`");
    expect(automationSpecOnBranch).toContain(authorityReportPath);
  });
});
