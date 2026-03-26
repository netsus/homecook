import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
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

  it("tick resumes only due work items", () => {
    const rootDir = createFixture();
    seedProductWorkItem(rootDir, "04-shopping-list");

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
    expect(results).toHaveLength(1);
    expect(results[0].workItemId).toBe("03-recipe-like");
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
        },
      },
    );

    const runtime = readRuntimeState({
      rootDir,
      workItemId: "03-recipe-like",
      slice: "03-recipe-like",
    }).state as {
      wait: { kind: string; reason: string };
    };

    expect(result.wait?.kind).toBe("human_escalation");
    expect(runtime.wait).toMatchObject({
      kind: "human_escalation",
      reason: "Worktree is dirty.",
    });
  });
});
