import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  superviseWorkItem,
  tickSupervisorWorkItems,
} from "../scripts/lib/omo-autonomous-supervisor.mjs";
import { readRuntimeState, writeRuntimeState } from "../scripts/lib/omo-session-runtime.mjs";

function seedProductWorkItem(rootDir: string, workItemId: string) {
  mkdirSync(join(rootDir, ".artifacts"), { recursive: true });
  mkdirSync(join(rootDir, ".workflow-v2", "work-items"), { recursive: true });
  mkdirSync(join(rootDir, "docs", "workpacks", workItemId), { recursive: true });

  writeFileSync(join(rootDir, "docs", "workpacks", workItemId, "README.md"), `# ${workItemId}\n`);
  writeFileSync(
    join(rootDir, "docs", "workpacks", workItemId, "acceptance.md"),
    `# ${workItemId} acceptance\n`,
  );
  writeFileSync(
    join(rootDir, ".workflow-v2", "status.json"),
    JSON.stringify(
      {
        version: 1,
        project_profile: "homecook",
        updated_at: "2026-03-27T00:00:00+09:00",
        items: [],
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
        title: "Recipe like slice",
        project_profile: "homecook",
        change_type: "product",
        surface: "fullstack",
        risk: "medium",
        preset: "vertical-slice-strict",
        goal: "Pilot the autonomous supervisor.",
        owners: {
          claude: "sparse-review-and-approval",
          codex: "implementation-and-integration",
          workers: ["testing"],
        },
        docs_refs: {
          source_of_truth: ["AGENTS.md"],
          governing_docs: ["docs/engineering/workflow-v2/omo-autonomous-supervisor.md"],
        },
        workflow: {
          plan_loop: "recommended",
          review_loop: "required",
          external_smokes: [],
        },
        verification: {
          required_checks: ["pnpm validate:workflow-v2"],
          verify_commands: ["pnpm validate:workflow-v2"],
        },
        status: {
          lifecycle: "planned",
          approval_state: "not_started",
          verification_status: "pending",
        },
      },
      null,
      2,
    ),
  );
}

function createFixture() {
  const rootDir = mkdtempSync(join(tmpdir(), "omo-autonomous-supervisor-"));
  seedProductWorkItem(rootDir, "03-recipe-like");
  return rootDir;
}

describe("OMO autonomous supervisor", () => {
  it("tick on a specific work item is a no-op when runtime is missing", () => {
    const rootDir = createFixture();

    const results = tickSupervisorWorkItems({
      rootDir,
      workItemId: "99-missing-runtime",
      now: "2026-03-27T01:00:00.000Z",
    });

    expect(results).toEqual([
      expect.objectContaining({
        workItemId: "99-missing-runtime",
        action: "noop",
        reason: "missing_runtime",
      }),
    ]);
  });

  it("tick on a specific work item is a no-op when runtime has no active wait", () => {
    const rootDir = createFixture();

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        current_stage: 6,
        last_completed_stage: 6,
        wait: null,
      },
    });

    const results = tickSupervisorWorkItems({
      rootDir,
      workItemId: "03-recipe-like",
      now: "2026-03-27T01:00:00.000Z",
    });

    expect(results).toEqual([
      expect.objectContaining({
        workItemId: "03-recipe-like",
        action: "noop",
        reason: "no_wait_state",
      }),
    ]);
  });

  it("runs Stage 1, merges docs, then opens a backend Draft PR in a dedicated worktree", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    const gitLog: string[] = [];
    const ghLog: string[] = [];

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T00:30:00+09:00",
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            mkdirSync(workspacePath, { recursive: true });
            return { path: workspacePath, created: true };
          },
          assertClean() {},
          checkoutBranch({ branch }: { branch: string }) {
            gitLog.push(`checkout:${branch}`);
            return { branch };
          },
          pushBranch({ branch }: { branch: string }) {
            gitLog.push(`push:${branch}`);
          },
          syncBaseBranch() {
            gitLog.push("sync:master");
          },
          getHeadSha() {
            return "abc123";
          },
        },
        stageRunner({ stage }: { stage: number }) {
          if (stage === 1) {
            return {
              artifactDir: join(rootDir, ".artifacts", "stage1"),
              dispatch: { actor: "claude", stage: 1 },
              execution: { mode: "execute", executed: true, sessionId: "ses_claude" },
              stageResult: {
                result: "done",
                summary_markdown: "Stage 1 docs complete",
                pr: {
                  title: "docs: lock slice docs",
                  body_markdown: "## Summary\n- docs",
                },
                checks_run: [],
                next_route: "open_pr",
              },
            };
          }

          return {
            artifactDir: join(rootDir, ".artifacts", "stage2"),
            dispatch: { actor: "codex", stage: 2 },
            execution: { mode: "execute", executed: true, sessionId: "ses_codex" },
            stageResult: {
              result: "done",
              summary_markdown: "Stage 2 backend complete",
              pr: {
                title: "feat: backend slice",
                body_markdown: "## Summary\n- backend",
              },
              checks_run: ["pnpm test:all"],
              next_route: "wait_for_ci",
            },
          };
        },
        github: {
          createPullRequest({
            head,
            draft,
          }: {
            head: string;
            draft: boolean;
          }) {
            ghLog.push(`create:${head}:${draft ? "draft" : "ready"}`);
            if (head.startsWith("docs/")) {
              return { number: 34, url: "https://github.com/netsus/homecook/pull/34", draft };
            }

            return { number: 35, url: "https://github.com/netsus/homecook/pull/35", draft };
          },
          getRequiredChecks({ prRef }: { prRef: string }) {
            ghLog.push(`checks:${prRef}`);
            return {
              bucket: prRef.endsWith("/34") ? "pass" : "pending",
              checks: [],
            };
          },
          markReady({ prRef }: { prRef: string }) {
            ghLog.push(`ready:${prRef}`);
          },
          reviewPullRequest() {
            throw new Error("not expected");
          },
          commentPullRequest() {
            throw new Error("not expected");
          },
          mergePullRequest({ prRef }: { prRef: string }) {
            ghLog.push(`merge:${prRef}`);
            return { merged: true };
          },
          updateBranch() {
            throw new Error("not expected");
          },
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      slice: "03-recipe-like",
    }).state as {
      workspace: { path: string; branch_role: string };
      prs: {
        docs: { url: string };
        backend: { url: string; draft: boolean };
      };
      wait: { kind: string; pr_role: string; stage: number };
    };

    expect(result.wait?.kind).toBe("ci");
    expect(runtime.workspace).toMatchObject({
      path: workspacePath,
      branch_role: "backend",
    });
    expect(runtime.prs.docs.url).toBe("https://github.com/netsus/homecook/pull/34");
    expect(runtime.prs.backend).toMatchObject({
      url: "https://github.com/netsus/homecook/pull/35",
      draft: true,
    });
    expect(runtime.wait).toMatchObject({
      kind: "ci",
      pr_role: "backend",
      stage: 2,
    });
    expect(gitLog).toEqual([
      "checkout:docs/03-recipe-like",
      "push:docs/03-recipe-like",
      "sync:master",
      "checkout:feature/be-03-recipe-like",
      "push:feature/be-03-recipe-like",
    ]);
    expect(ghLog).toEqual([
      "create:docs/03-recipe-like:ready",
      "checks:https://github.com/netsus/homecook/pull/34",
      "merge:https://github.com/netsus/homecook/pull/34",
      "create:feature/be-03-recipe-like:draft",
      "checks:https://github.com/netsus/homecook/pull/35",
    ]);
  });

  it("routes Stage 3 request-changes back to Stage 2 on the same backend PR", () => {
    const rootDir = createFixture();

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        current_stage: 2,
        last_completed_stage: 2,
        workspace: {
          path: join(rootDir, ".worktrees", "03-recipe-like"),
          branch_role: "backend",
        },
        prs: {
          docs: null,
          backend: {
            number: 35,
            url: "https://github.com/netsus/homecook/pull/35",
            draft: false,
            branch: "feature/be-03-recipe-like",
            head_sha: "be123",
          },
          frontend: null,
        },
        wait: {
          kind: "ready_for_next_stage",
          pr_role: "backend",
          stage: 3,
          head_sha: "be123",
        },
        last_review: {
          backend: null,
          frontend: null,
        },
      },
    });

    superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T00:40:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: join(rootDir, ".worktrees", "03-recipe-like"), created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "feature/be-03-recipe-like" };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return "be123";
          },
        },
        stageRunner() {
          return {
            artifactDir: join(rootDir, ".artifacts", "stage3"),
            dispatch: { actor: "claude", stage: 3 },
            execution: { mode: "execute", executed: true, sessionId: "ses_claude" },
            stageResult: {
              decision: "request_changes",
              body_markdown: "Please tighten the contract tests.",
              route_back_stage: 2,
              approved_head_sha: null,
            },
          };
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            return { bucket: "pass", checks: [] };
          },
          markReady() {},
          reviewPullRequest() {},
          commentPullRequest() {
            throw new Error("not expected");
          },
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {
            throw new Error("not expected");
          },
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      slice: "03-recipe-like",
    }).state as {
      prs: {
        backend: { url: string };
      };
      wait: { kind: string; stage: number; pr_role: string };
      last_review: {
        backend: { decision: string; route_back_stage: number };
      };
    };

    expect(runtime.prs.backend.url).toBe("https://github.com/netsus/homecook/pull/35");
    expect(runtime.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 2,
      pr_role: "backend",
    });
    expect(runtime.last_review.backend).toMatchObject({
      decision: "request_changes",
      route_back_stage: 2,
    });
  });

  it("falls back to a PR comment when Stage 3 cannot approve its own backend pull request", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");
    const gitLog: string[] = [];
    const ghLog: string[] = [];
    const activeHeadSha = "be1234567890abcdef1234567890abcdef123456";
    const approvedHeadSha = "be12345";

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        current_stage: 2,
        last_completed_stage: 2,
        workspace: {
          path: workspacePath,
          branch_role: "backend",
        },
        prs: {
          docs: null,
          backend: {
            number: 35,
            url: "https://github.com/netsus/homecook/pull/35",
            draft: false,
            branch: "feature/be-03-recipe-like",
            head_sha: activeHeadSha,
          },
          frontend: null,
        },
        wait: {
          kind: "ready_for_next_stage",
          pr_role: "backend",
          stage: 3,
          head_sha: activeHeadSha,
        },
        last_review: {
          backend: null,
          frontend: null,
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T00:45:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            mkdirSync(workspacePath, { recursive: true });
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "feature/be-03-recipe-like" };
          },
          pushBranch() {
            throw new Error("not expected");
          },
          syncBaseBranch() {
            gitLog.push("sync:master");
          },
          getHeadSha() {
            return activeHeadSha;
          },
        },
        stageRunner() {
          return {
            artifactDir: join(rootDir, ".artifacts", "stage3"),
            dispatch: { actor: "claude", stage: 3 },
            execution: { mode: "execute", executed: true, sessionId: "ses_claude" },
            stageResult: {
              decision: "approve",
              body_markdown: "Backend review approved.",
              route_back_stage: null,
              approved_head_sha: approvedHeadSha,
            },
          };
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            return { bucket: "pass", checks: [] };
          },
          markReady() {
            throw new Error("not expected");
          },
          reviewPullRequest({ prRef }: { prRef: string }) {
            ghLog.push(`review:${prRef}`);
            throw new Error("GraphQL: Review Can not approve your own pull request (addPullRequestReview)");
          },
          commentPullRequest({ prRef, body }: { prRef: string; body: string }) {
            ghLog.push(`comment:${prRef}:${body}`);
          },
          mergePullRequest({ prRef, headSha }: { prRef: string; headSha: string }) {
            ghLog.push(`merge:${prRef}:${headSha}`);
            return { merged: true };
          },
          updateBranch() {
            throw new Error("not expected");
          },
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      slice: "03-recipe-like",
    }).state as {
      wait: { kind: string; stage: number | null; pr_role: string | null };
      last_review: {
        backend: { decision: string; approved_head_sha: string };
      };
    };

    expect(result.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 4,
    });
    expect(runtime.wait).toMatchObject({
      kind: "ready_for_next_stage",
      stage: 4,
    });
    expect(runtime.last_review.backend).toMatchObject({
      decision: "approve",
      approved_head_sha: approvedHeadSha,
    });
    expect(gitLog).toEqual(["sync:master"]);
    expect(ghLog).toEqual([
      "review:https://github.com/netsus/homecook/pull/35",
      "comment:https://github.com/netsus/homecook/pull/35:Backend review approved.",
      `merge:https://github.com/netsus/homecook/pull/35:${activeHeadSha}`,
    ]);
  });

  it("tick resumes due work items, skips future retries, and reports locked items without failing", () => {
    const rootDir = createFixture();
    seedProductWorkItem(rootDir, "04-shopping-list");
    seedProductWorkItem(rootDir, "05-locked-slice");

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        blocked_stage: 3,
        retry: {
          at: "2026-03-27T00:00:00.000Z",
          reason: "claude_budget_unavailable",
          attempt_count: 1,
          max_attempts: 3,
        },
        wait: {
          kind: "blocked_retry",
          stage: 3,
          pr_role: "backend",
          head_sha: "be123",
        },
      },
    });
    writeRuntimeState({
      rootDir,
      workItemId: "04-shopping-list",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "04-shopping-list",
          slice: "04-shopping-list",
        }).state,
        slice: "04-shopping-list",
        blocked_stage: 3,
        retry: {
          at: "2026-03-27T05:00:00.000Z",
          reason: "claude_budget_unavailable",
          attempt_count: 1,
          max_attempts: 3,
        },
        wait: {
          kind: "blocked_retry",
          stage: 3,
          pr_role: "backend",
          head_sha: "be999",
        },
      },
    });
    writeRuntimeState({
      rootDir,
      workItemId: "05-locked-slice",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "05-locked-slice",
          slice: "05-locked-slice",
        }).state,
        slice: "05-locked-slice",
        blocked_stage: 3,
        retry: {
          at: "2026-03-27T00:00:00.000Z",
          reason: "claude_budget_unavailable",
          attempt_count: 1,
          max_attempts: 3,
        },
        wait: {
          kind: "blocked_retry",
          stage: 3,
          pr_role: "backend",
          head_sha: "be555",
        },
        lock: {
          owner: "manual-lock",
          acquired_at: "2026-03-27T00:30:00.000Z",
        },
      },
    });

    const seen: string[] = [];
    const results = tickSupervisorWorkItems(
      {
        rootDir,
        all: true,
        now: "2026-03-27T01:00:00.000Z",
      },
      {
        supervise(args: { workItemId: string }) {
          seen.push(args.workItemId);
          return {
            workItemId: args.workItemId,
            wait: {
              kind: "ci",
            },
          };
        },
      },
    );

    expect(seen).toEqual(["03-recipe-like"]);
    expect(results).toEqual([
      expect.objectContaining({
        workItemId: "03-recipe-like",
      }),
      expect.objectContaining({
        workItemId: "04-shopping-list",
        action: "noop",
        reason: "retry_not_due",
      }),
      expect.objectContaining({
        workItemId: "05-locked-slice",
        action: "skip_locked",
        reason: "locked_by=manual-lock",
      }),
    ]);
  });

  it("records blocked_retry when Stage 1 schedules a Claude retry", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T00:50:00+09:00",
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            mkdirSync(workspacePath, { recursive: true });
            return { path: workspacePath, created: true };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "docs/03-recipe-like" };
          },
          pushBranch() {
            throw new Error("not expected");
          },
          syncBaseBranch() {
            throw new Error("not expected");
          },
          getHeadSha() {
            return "docs123";
          },
        },
        stageRunner() {
          const runtimeSync = writeRuntimeState({
            rootDir,
            workItemId: "03-recipe-like",
            state: {
              ...readRuntimeState({
                rootDir,
                workItemId: "03-recipe-like",
                slice: "03-recipe-like",
              }).state,
              slice: "03-recipe-like",
              current_stage: 1,
              last_completed_stage: 0,
              blocked_stage: 1,
              retry: {
                at: "2026-03-27T01:10:00.000Z",
                reason: "claude_budget_unavailable",
                attempt_count: 1,
                max_attempts: 3,
              },
              sessions: {
                claude_primary: {
                  session_id: "ses_claude_docs",
                  agent: "athena",
                  updated_at: "2026-03-26T15:50:00.000Z",
                },
                codex_primary: {
                  session_id: null,
                  agent: "hephaestus",
                  updated_at: null,
                },
              },
              workspace: {
                path: workspacePath,
                branch_role: "docs",
                updated_at: "2026-03-26T15:50:00.000Z",
              },
            },
          });

          return {
            artifactDir: join(rootDir, ".artifacts", "stage1"),
            dispatch: { actor: "claude", stage: 1 },
            execution: {
              mode: "scheduled-retry",
              executed: false,
              sessionId: "ses_claude_docs",
              reason: "claude_budget_unavailable",
            },
            runtimeSync,
            stageResult: null,
          };
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            throw new Error("not expected");
          },
          markReady() {
            throw new Error("not expected");
          },
          reviewPullRequest() {
            throw new Error("not expected");
          },
          commentPullRequest() {
            throw new Error("not expected");
          },
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {
            throw new Error("not expected");
          },
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      slice: "03-recipe-like",
    }).state as {
      retry: { at: string | null };
      wait: {
        kind: string;
        pr_role: string | null;
        stage: number | null;
        reason: string | null;
        until: string | null;
      };
    };

    expect(result.wait?.kind).toBe("blocked_retry");
    expect(runtime.retry.at).toBe("2026-03-27T01:10:00.000Z");
    expect(runtime.wait).toMatchObject({
      kind: "blocked_retry",
      pr_role: "docs",
      stage: 1,
      reason: "claude_budget_unavailable",
      until: "2026-03-27T01:10:00.000Z",
    });
  });

  it("does not require OpenCode auth before a Claude Stage 1 run", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T00:30:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {
            throw new Error("should not be called");
          },
          assertClaudeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            mkdirSync(workspacePath, { recursive: true });
            return { path: workspacePath, created: true };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "docs/03-recipe-like" };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return "docs123";
          },
          getCurrentBranch() {
            return "docs/03-recipe-like";
          },
          listChangedFiles() {
            return [];
          },
        },
        stageRunner() {
          return {
            artifactDir: join(rootDir, ".artifacts", "stage1"),
            dispatch: { actor: "claude", stage: 1 },
            execution: { mode: "execute", executed: true, sessionId: "ses_claude" },
            stageResult: {
              result: "done",
              summary_markdown: "Stage 1 docs complete",
              pr: {
                title: "docs: lock slice docs",
                body_markdown: "## Summary\n- docs",
              },
              checks_run: [],
              next_route: "open_pr",
            },
          };
        },
        github: {
          createPullRequest() {
            return { number: 34, url: "https://github.com/netsus/homecook/pull/34", draft: false };
          },
          getRequiredChecks() {
            return { bucket: "pending", checks: [] };
          },
          markReady() {},
          reviewPullRequest() {},
          commentPullRequest() {},
          mergePullRequest() {
            return { merged: true };
          },
          updateBranch() {},
        },
      },
    );

    expect(result.wait?.kind).toBe("ci");
  });

  it("fails closed before Stage 2 when OpenCode auth is unavailable", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        current_stage: 1,
        last_completed_stage: 1,
        wait: {
          kind: "ready_for_next_stage",
          stage: 2,
          pr_role: "docs",
          head_sha: "docs123",
        },
        workspace: {
          path: workspacePath,
          branch_role: "docs",
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T00:35:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {
            throw new Error("OpenCode auth is not configured for this machine.");
          },
          assertClaudeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            mkdirSync(workspacePath, { recursive: true });
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch() {
            throw new Error("not expected");
          },
          pushBranch() {
            throw new Error("not expected");
          },
          syncBaseBranch() {
            throw new Error("not expected");
          },
          getHeadSha() {
            return "be123";
          },
          getCurrentBranch() {
            return "master";
          },
          listChangedFiles() {
            return [];
          },
        },
      },
    );

    expect(result.wait).toMatchObject({
      kind: "human_escalation",
      reason: "OpenCode auth is not configured for this machine.",
    });
  });

  it("fails closed before a Claude stage when Claude CLI preflight fails", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T00:40:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
          assertClaudeAuth() {
            throw new Error("Claude CLI is unavailable: login required");
          },
        },
        worktree: {
          ensureWorktree() {
            mkdirSync(workspacePath, { recursive: true });
            return { path: workspacePath, created: true };
          },
          assertClean() {},
          checkoutBranch() {
            throw new Error("not expected");
          },
          pushBranch() {
            throw new Error("not expected");
          },
          syncBaseBranch() {
            throw new Error("not expected");
          },
          getHeadSha() {
            return "docs123";
          },
          getCurrentBranch() {
            return "master";
          },
          listChangedFiles() {
            return [];
          },
        },
      },
    );

    expect(result.wait).toMatchObject({
      kind: "human_escalation",
      reason: "Claude CLI is unavailable: login required",
    });
  });

  it("records blocked_retry when a Claude review stage schedules a retry", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");

    writeRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "03-recipe-like",
          slice: "03-recipe-like",
        }).state,
        slice: "03-recipe-like",
        current_stage: 2,
        last_completed_stage: 2,
        workspace: {
          path: workspacePath,
          branch_role: "backend",
          updated_at: "2026-03-26T15:55:00.000Z",
        },
        prs: {
          docs: null,
          backend: {
            number: 35,
            url: "https://github.com/netsus/homecook/pull/35",
            draft: false,
            branch: "feature/be-03-recipe-like",
            head_sha: "be123",
            updated_at: "2026-03-26T15:55:00.000Z",
          },
          frontend: null,
        },
        wait: {
          kind: "ready_for_next_stage",
          pr_role: "backend",
          stage: 3,
          head_sha: "be123",
          reason: null,
          until: null,
          updated_at: "2026-03-26T15:55:00.000Z",
        },
      },
    });

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T01:00:00+09:00",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            mkdirSync(workspacePath, { recursive: true });
            return { path: workspacePath, created: false };
          },
          assertClean() {},
          checkoutBranch() {
            return { branch: "feature/be-03-recipe-like" };
          },
          pushBranch() {
            throw new Error("not expected");
          },
          syncBaseBranch() {
            throw new Error("not expected");
          },
          getHeadSha() {
            return "be123";
          },
        },
        stageRunner() {
          const runtimeSync = writeRuntimeState({
            rootDir,
            workItemId: "03-recipe-like",
            state: {
              ...readRuntimeState({
                rootDir,
                workItemId: "03-recipe-like",
                slice: "03-recipe-like",
              }).state,
              slice: "03-recipe-like",
              current_stage: 3,
              last_completed_stage: 2,
              blocked_stage: 3,
              retry: {
                at: "2026-03-27T02:00:00.000Z",
                reason: "claude_budget_unavailable",
                attempt_count: 1,
                max_attempts: 3,
              },
              sessions: {
                claude_primary: {
                  session_id: "ses_claude_review",
                  agent: "athena",
                  updated_at: "2026-03-26T16:00:00.000Z",
                },
                codex_primary: {
                  session_id: "ses_codex_backend",
                  agent: "hephaestus",
                  updated_at: "2026-03-26T15:40:00.000Z",
                },
              },
            },
          });

          return {
            artifactDir: join(rootDir, ".artifacts", "stage3"),
            dispatch: { actor: "claude", stage: 3 },
            execution: {
              mode: "scheduled-retry",
              executed: false,
              sessionId: "ses_claude_review",
              reason: "claude_budget_unavailable",
            },
            runtimeSync,
            stageResult: null,
          };
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            throw new Error("not expected");
          },
          markReady() {
            throw new Error("not expected");
          },
          reviewPullRequest() {
            throw new Error("not expected");
          },
          commentPullRequest() {
            throw new Error("not expected");
          },
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {
            throw new Error("not expected");
          },
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      slice: "03-recipe-like",
    }).state as {
      wait: {
        kind: string;
        pr_role: string | null;
        stage: number | null;
        head_sha: string | null;
        until: string | null;
      };
      last_review: {
        backend: { decision: string | null } | null;
      };
    };

    expect(result.wait?.kind).toBe("blocked_retry");
    expect(runtime.wait).toMatchObject({
      kind: "blocked_retry",
      pr_role: "backend",
      stage: 3,
      head_sha: "be123",
      until: "2026-03-27T02:00:00.000Z",
    });
    expect(runtime.last_review.backend).toBeNull();
  });

  it("fails closed when a stage finishes without a structured stage result", () => {
    const rootDir = createFixture();
    const workspacePath = join(rootDir, ".worktrees", "03-recipe-like");

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T01:05:00+09:00",
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            mkdirSync(workspacePath, { recursive: true });
            return { path: workspacePath, created: true };
          },
          assertClean() {},
          checkoutBranch({ branch }: { branch: string }) {
            return { branch };
          },
          pushBranch() {
            throw new Error("not expected");
          },
          syncBaseBranch() {
            throw new Error("not expected");
          },
          getHeadSha() {
            return "docs123";
          },
          getCurrentBranch() {
            return "docs/03-recipe-like";
          },
          listChangedFiles() {
            return ["docs/workpacks/03-recipe-like/README.md"];
          },
          getBinaryDiff() {
            return "diff --git a/docs/workpacks/03-recipe-like/README.md b/docs/workpacks/03-recipe-like/README.md\n";
          },
        },
        stageRunner() {
          const runtimeSync = writeRuntimeState({
            rootDir,
            workItemId: "03-recipe-like",
            state: {
              ...readRuntimeState({
                rootDir,
                workItemId: "03-recipe-like",
                slice: "03-recipe-like",
              }).state,
              slice: "03-recipe-like",
              current_stage: 1,
              last_completed_stage: 0,
              blocked_stage: 1,
              retry: {
                at: null,
                reason: "contract_violation",
                attempt_count: 1,
                max_attempts: 3,
              },
              sessions: {
                claude_primary: {
                  session_id: "ses_claude_docs",
                  provider: "claude-cli",
                  agent: "athena",
                  updated_at: "2026-03-27T01:05:00.000Z",
                },
                codex_primary: {
                  session_id: null,
                  provider: null,
                  agent: "hephaestus",
                  updated_at: null,
                },
              },
              workspace: {
                path: workspacePath,
                branch_role: "docs",
                updated_at: "2026-03-27T01:05:00.000Z",
              },
            },
          });

          return {
            artifactDir: join(rootDir, ".artifacts", "stage1-contract-violation"),
            dispatch: { actor: "claude", stage: 1 },
            execution: {
              mode: "contract-violation",
              executed: true,
              provider: "claude-cli",
              sessionId: "ses_claude_docs",
              reason: "claude CLI did not write stage-result.json; permission denied for Bash, Write.",
            },
            runtimeSync,
            stageResult: null,
          };
        },
        github: {
          createPullRequest() {
            throw new Error("not expected");
          },
          getRequiredChecks() {
            throw new Error("not expected");
          },
          markReady() {
            throw new Error("not expected");
          },
          reviewPullRequest() {
            throw new Error("not expected");
          },
          commentPullRequest() {
            throw new Error("not expected");
          },
          mergePullRequest() {
            throw new Error("not expected");
          },
          updateBranch() {
            throw new Error("not expected");
          },
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      slice: "03-recipe-like",
    }).state as {
      wait: { kind: string; reason: string; stage: number | null };
      retry: { reason: string | null };
      recovery: {
        kind: string;
        changed_files: string[];
        salvage_candidate: boolean;
        branch: string | null;
      } | null;
    };

    expect(result.wait?.kind).toBe("human_escalation");
    expect(runtime.wait).toMatchObject({
      kind: "human_escalation",
      stage: 1,
    });
    expect(runtime.wait.reason).toContain("stage-result.json");
    expect(runtime.retry?.reason).toBe("contract_violation");
    expect(runtime.recovery).toMatchObject({
      kind: "partial_stage_failure",
      branch: "docs/03-recipe-like",
      changed_files: ["docs/workpacks/03-recipe-like/README.md"],
      salvage_candidate: true,
    });
    expect(existsSync(join(result.artifactDir, "recovery.json"))).toBe(true);
    expect(existsSync(join(result.artifactDir, "recovery.changed-files.txt"))).toBe(true);
    expect(readFileSync(join(result.artifactDir, "recovery.patch"), "utf8")).toContain(
      "diff --git a/docs/workpacks/03-recipe-like/README.md",
    );
  });

  it("fails closed when the dedicated worktree is dirty", () => {
    const rootDir = createFixture();

    const result = superviseWorkItem(
      {
        rootDir,
        workItemId: "03-recipe-like",
        now: "2026-03-27T00:50:00+09:00",
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: join(rootDir, ".worktrees", "03-recipe-like"), created: false };
          },
          assertClean() {
            throw new Error("Worktree is dirty.");
          },
          checkoutBranch() {
            throw new Error("not expected");
          },
          pushBranch() {
            throw new Error("not expected");
          },
          syncBaseBranch() {
            throw new Error("not expected");
          },
          getHeadSha() {
            return "abc123";
          },
          getCurrentBranch() {
            return "feature/fe-03-recipe-like";
          },
          listChangedFiles() {
            return ["components/recipe/save-modal.tsx"];
          },
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      slice: "03-recipe-like",
    }).state as {
      wait: { kind: string; reason: string };
      recovery: { kind: string; changed_files: string[]; salvage_candidate: boolean } | null;
    };

    expect(result.wait?.kind).toBe("human_escalation");
    expect(runtime.wait).toMatchObject({
      kind: "human_escalation",
      reason: "Worktree is dirty.",
    });
    expect(runtime.recovery).toMatchObject({
      kind: "dirty_worktree",
      changed_files: ["components/recipe/save-modal.tsx"],
      salvage_candidate: true,
    });
  });
});
