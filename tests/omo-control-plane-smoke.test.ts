import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  assertSafeSandboxRepoRef,
  collectControlPlaneSmokeCheckpoints,
  createControlPlaneSmokeStageRunner,
  createLiveProviderControlPlaneSmokeStageRunner,
  readControlPlaneSmokeState,
  seedControlPlaneSmokeWorkspace,
} from "../scripts/lib/omo-control-plane-smoke.mjs";
import { superviseWorkItem } from "../scripts/lib/omo-autonomous-supervisor.mjs";
import { readRuntimeState, writeRuntimeState } from "../scripts/lib/omo-session-runtime.mjs";

function createGitWorkspace(workspacePath: string) {
  mkdirSync(workspacePath, { recursive: true });
  execFileSync("git", ["init", "-b", "master"], { cwd: workspacePath });
  execFileSync("git", ["config", "user.name", "OMO Smoke"], { cwd: workspacePath });
  execFileSync("git", ["config", "user.email", "omo-smoke@example.com"], { cwd: workspacePath });
  execFileSync("git", ["add", "-A"], { cwd: workspacePath });
  execFileSync("git", ["commit", "--allow-empty", "-m", "chore: seed smoke workspace"], {
    cwd: workspacePath,
    stdio: "ignore",
  });
}

describe("OMO control-plane smoke", () => {
  it("refuses to run against the main homecook repository", () => {
    expect(() => assertSafeSandboxRepoRef("netsus/homecook")).toThrow(/sandbox/i);
  });

  it("seeds a smoke work item and status entry into a sandbox workspace", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-control-plane-smoke-"));

    const seed = seedControlPlaneSmokeWorkspace({
      rootDir,
      workItemId: "99-omo-control-plane-smoke",
      sandboxRepo: "example/homecook-sandbox",
    });

    expect(seed.changed).toBe(true);
    expect(
      readFileSync(join(rootDir, ".workflow-v2", "work-items", "99-omo-control-plane-smoke.json"), "utf8"),
    ).toContain("\"id\": \"99-omo-control-plane-smoke\"");
    expect(
      readFileSync(join(rootDir, ".workflow-v2", "status.json"), "utf8"),
    ).toContain("\"id\": \"99-omo-control-plane-smoke\"");
  });

  it("creates deterministic stage artifacts and reports progress checkpoints", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-control-plane-smoke-"));
    const executionDir = join(rootDir, "repo");
    seedControlPlaneSmokeWorkspace({
      rootDir: executionDir,
      workItemId: "99-omo-control-plane-smoke",
      sandboxRepo: "example/homecook-sandbox",
    });

    const stageRunner = createControlPlaneSmokeStageRunner({
      rootDir: executionDir,
      artifactBaseDir: join(rootDir, ".artifacts", "omo-control-plane-smoke"),
      workItemId: "99-omo-control-plane-smoke",
      now: "2026-04-02T10:00:00.000Z",
    });

    const runResult = stageRunner({
      stage: 2,
      executionDir,
    });
    const checkpoints = collectControlPlaneSmokeCheckpoints({
      runtime: {
        prs: {
          docs: { url: "https://github.com/example/homecook-sandbox/pull/1" },
          backend: { url: "https://github.com/example/homecook-sandbox/pull/2" },
          closeout: { url: "https://github.com/example/homecook-sandbox/pull/3" },
        },
        wait: {
          kind: "ci",
          stage: 6,
        },
        last_completed_stage: 6,
        phase: "done",
      },
      smokeState: {
        review_loops: {
          backend: {
            requested_changes: 2,
            code_retries: 2,
            approvals: 1,
            feedback_seen_by_codex: true,
            last_feedback: "Backend smoke review loop request 2: tighten the API contract and rerun the backend stage.",
          },
          frontend: {
            requested_changes: 2,
            code_retries: 2,
            approvals: 2,
            feedback_seen_by_codex: true,
          },
        },
        live_provider: {
          backend: {
            requested_tokens: ["backend-request-1", "backend-request-2"],
            applied_tokens: ["backend-request-1", "backend-request-2"],
            prompt_feedback_tokens: ["backend-request-1", "backend-request-2"],
          },
        },
        attempts: {
          "2": 2,
          "3": 3,
          "5": 2,
          "6": 2,
        },
      },
    });

    expect("summary_markdown" in runResult.stageResult && runResult.stageResult.summary_markdown).toContain("smoke");
    expect(runResult.artifactDir).toContain(".artifacts/omo-control-plane-smoke");
    expect(checkpoints.docsPrCreated).toBe(true);
    expect(checkpoints.backendPrCreated).toBe(true);
    expect(checkpoints.backendIterativeReviewLoopValidated).toBe(true);
    expect(checkpoints.backendReviewLoopValidated).toBe(true);
    expect(checkpoints.backendLiveProviderLoopValidated).toBe(true);
    expect(checkpoints.frontendReviewLoopValidated).toBe(true);
    expect(checkpoints.reviewLoopsValidated).toBe(true);
    expect(checkpoints.finalAutonomousMergeReached).toBe(true);
    expect(checkpoints.closeoutPrCreated).toBe(true);
    expect(checkpoints.closeoutFinalized).toBe(true);
  });

  it("enforces a live-provider backend review loop where Claude requests changes twice and Codex applies both tokens", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "omo-control-plane-smoke-live-"));
    const rootDir = join(tempDir, "repo");
    const workItemId = "99-omo-control-plane-smoke";
    const executionDir = rootDir;
    const backendLoopPath = join(rootDir, "smoke", "omo-control-plane", workItemId, "backend-review-loop.md");
    const observedCalls: Array<{
      stage: number;
      provider?: string;
      prompt: string | null;
      extraPromptSections: string[];
    }> = [];
    let backendReviewBody: string | null = null;

    seedControlPlaneSmokeWorkspace({
      rootDir,
      workItemId,
      sandboxRepo: "example/homecook-sandbox",
    });

    const stageRunner = createLiveProviderControlPlaneSmokeStageRunner({
      rootDir,
      artifactBaseDir: join(tempDir, ".artifacts", "omo-control-plane-live"),
      workItemId,
      executeStage({
        stage,
        artifactDir,
        extraPromptSections,
        prompt,
        provider,
      }: {
        stage: number;
        artifactDir: string;
        extraPromptSections?: string[];
        prompt?: string;
        provider?: string;
      }) {
        mkdirSync(artifactDir, { recursive: true });
        const promptSections = extraPromptSections ?? [];
        observedCalls.push({
          stage,
          provider,
          prompt: typeof prompt === "string" ? prompt : null,
          extraPromptSections: promptSections,
        });

        if (stage === 2) {
          const backendLoop = readFileSync(backendLoopPath, "utf8");
          let nextLoop = backendLoop;
          if (backendReviewBody?.includes("backend-request-1")) {
            nextLoop = nextLoop.replace("- [ ] backend-request-1", "- [x] backend-request-1");
          }
          if (backendReviewBody?.includes("backend-request-2")) {
            nextLoop = nextLoop.replace("- [ ] backend-request-2", "- [x] backend-request-2");
          }
          writeFileSync(backendLoopPath, nextLoop);

          return {
            artifactDir,
            prompt: ["# fake prompt", ...promptSections].join("\n"),
            execution: {
              mode: "execute",
              executed: true,
              provider: "opencode",
              sessionId: "ses_codex_live_smoke",
            },
            stageResult: {
              result: "done",
              summary_markdown: "backend live smoke complete",
              commit: {
                subject: "feat: backend live smoke",
                body_markdown: "apply backend live smoke token",
              },
              pr: {
                title: "feat: backend live smoke",
                body_markdown: "## Summary\n- backend live smoke",
              },
              checks_run: ["pnpm validate:workflow-v2"],
              next_route: "wait_for_ci",
            },
          };
        }

        if (stage === 3) {
          const requestNumber =
            observedCalls.filter((entry) => entry.stage === 3).length;
          if (requestNumber <= 2) {
            const token = `backend-request-${requestNumber}`;
            const body = [
              `Backend live smoke review request ${requestNumber}`,
              `SMOKE_BACKEND_FIX_TOKEN: ${token}`,
              `SMOKE_BACKEND_LOOP_FILE: smoke/omo-control-plane/${workItemId}/backend-review-loop.md`,
              `Mark \`- [x] ${token}\` in the loop file before rerunning Stage 2.`,
            ].join("\n");
            backendReviewBody = body;
            return {
              artifactDir,
              prompt: ["# fake prompt", ...promptSections].join("\n"),
              execution: {
                mode: "execute",
                executed: true,
                provider: "claude-cli",
                sessionId: "ses_claude_live_smoke",
              },
              stageResult: {
                decision: "request_changes",
                body_markdown: body,
                route_back_stage: 2,
                approved_head_sha: null,
              },
            };
          }

          backendReviewBody = "approved";
          return {
            artifactDir,
            prompt: ["# fake prompt", ...promptSections].join("\n"),
            execution: {
              mode: "execute",
              executed: true,
              provider: "claude-cli",
              sessionId: "ses_claude_live_smoke",
            },
            stageResult: {
              decision: "approve",
              body_markdown: "## Review\n- backend live smoke approve",
              route_back_stage: null,
              approved_head_sha: null,
            },
          };
        }

        throw new Error(`Unexpected stage ${stage}`);
      },
      reviewContextReader() {
        return backendReviewBody
          ? {
              decision: "request_changes",
              body_markdown: backendReviewBody,
            }
          : null;
      },
    });

    stageRunner({
      rootDir,
      workItemId,
      slice: workItemId,
      stage: 2,
      executionDir,
    });
    stageRunner({
      rootDir,
      workItemId,
      slice: workItemId,
      stage: 3,
      executionDir,
    });
    stageRunner({
      rootDir,
      workItemId,
      slice: workItemId,
      stage: 2,
      executionDir,
    });
    stageRunner({
      rootDir,
      workItemId,
      slice: workItemId,
      stage: 3,
      executionDir,
    });
    stageRunner({
      rootDir,
      workItemId,
      slice: workItemId,
      stage: 2,
      executionDir,
    });
    stageRunner({
      rootDir,
      workItemId,
      slice: workItemId,
      stage: 3,
      executionDir,
    });

    const smokeState = readControlPlaneSmokeState({
      rootDir,
      workItemId,
    });
    const checkpoints = collectControlPlaneSmokeCheckpoints({
      runtime: {
        prs: {
          backend: { url: "https://github.com/example/homecook-sandbox/pull/2" },
        },
        wait: {
          kind: "ci",
          stage: 3,
        },
        last_completed_stage: 3,
      },
      smokeState,
    });

    expect(observedCalls[0]?.provider).toBe("opencode");
    expect(observedCalls[0]?.prompt).toContain("OMO Control-Plane Live Provider Smoke");
    expect(observedCalls[0]?.prompt).toContain("Only read and update the files listed below");
    expect(observedCalls[0]?.prompt).not.toContain("## Required Reads");
    expect(observedCalls[0]?.prompt).not.toContain("## Verify Commands");
    expect(observedCalls[1]?.provider).toBe("claude-cli");
    expect(observedCalls[1]?.extraPromptSections.join("\n")).toContain("SMOKE_BACKEND_FIX_TOKEN: backend-request-1");
    expect(observedCalls[1]?.prompt).toContain("SMOKE_BACKEND_FIX_TOKEN: backend-request-1");
    expect(observedCalls[1]?.prompt).not.toContain("## Required Reads");
    expect(observedCalls[2]?.extraPromptSections.join("\n")).toContain("SMOKE_BACKEND_FIX_TOKEN: backend-request-1");
    expect(observedCalls[2]?.prompt).toContain("Only read and update the files listed below");
    expect(observedCalls[3]?.extraPromptSections.join("\n")).toContain("SMOKE_BACKEND_FIX_TOKEN: backend-request-2");
    expect(observedCalls[3]?.prompt).toContain("SMOKE_BACKEND_FIX_TOKEN: backend-request-2");
    expect(observedCalls[4]?.extraPromptSections.join("\n")).toContain("SMOKE_BACKEND_FIX_TOKEN: backend-request-2");
    expect(observedCalls[4]?.prompt).not.toContain("## Verify Commands");
    expect(readFileSync(backendLoopPath, "utf8")).toContain("- [x] backend-request-1");
    expect(readFileSync(backendLoopPath, "utf8")).toContain("- [x] backend-request-2");
    expect(smokeState.review_loops.backend.requested_changes).toBe(2);
    expect(smokeState.review_loops.backend.code_retries).toBe(2);
    expect(smokeState.review_loops.backend.approvals).toBe(1);
    expect(smokeState.live_provider.backend.requested_tokens).toEqual([
      "backend-request-1",
      "backend-request-2",
    ]);
    expect(smokeState.live_provider.backend.applied_tokens).toEqual([
      "backend-request-1",
      "backend-request-2",
    ]);
    expect(smokeState.live_provider.backend.prompt_feedback_tokens).toEqual([
      "backend-request-1",
      "backend-request-2",
    ]);
    expect(checkpoints.backendIterativeReviewLoopValidated).toBe(true);
    expect(checkpoints.backendLiveProviderLoopValidated).toBe(true);
  });

  it("exercises request-changes review loops so Codex retries see Claude feedback before approval", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "omo-control-plane-smoke-"));
    const rootDir = join(tempDir, "repo");
    const workspacePath = join(rootDir, ".worktrees", "99-omo-control-plane-smoke");
    seedControlPlaneSmokeWorkspace({
      rootDir,
      workItemId: "99-omo-control-plane-smoke",
      sandboxRepo: "example/homecook-sandbox",
    });
    createGitWorkspace(workspacePath);
    mkdirSync(join(workspacePath, "docs", "workpacks"), { recursive: true });
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "README.md"),
      readFileSync(join(rootDir, "docs", "workpacks", "README.md"), "utf8"),
    );
    mkdirSync(join(workspacePath, "docs", "workpacks", "99-omo-control-plane-smoke"), {
      recursive: true,
    });
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "99-omo-control-plane-smoke", "README.md"),
      readFileSync(join(rootDir, "docs", "workpacks", "99-omo-control-plane-smoke", "README.md"), "utf8"),
    );
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "99-omo-control-plane-smoke", "acceptance.md"),
      readFileSync(join(rootDir, "docs", "workpacks", "99-omo-control-plane-smoke", "acceptance.md"), "utf8"),
    );
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "99-omo-control-plane-smoke", "automation-spec.json"),
      readFileSync(join(rootDir, "docs", "workpacks", "99-omo-control-plane-smoke", "automation-spec.json"), "utf8"),
    );
    mkdirSync(join(workspacePath, ".workflow-v2", "work-items"), { recursive: true });
    writeFileSync(
      join(workspacePath, ".workflow-v2", "status.json"),
      readFileSync(join(rootDir, ".workflow-v2", "status.json"), "utf8"),
    );
    writeFileSync(
      join(workspacePath, ".workflow-v2", "work-items", "99-omo-control-plane-smoke.json"),
      readFileSync(join(rootDir, ".workflow-v2", "work-items", "99-omo-control-plane-smoke.json"), "utf8"),
    );
    execFileSync("git", ["add", "-A"], { cwd: workspacePath });
    execFileSync("git", ["commit", "-m", "docs: seed smoke workspace"], { cwd: workspacePath });

    const stageRunner = createControlPlaneSmokeStageRunner({
      rootDir,
      artifactBaseDir: join(tempDir, ".artifacts", "omo-control-plane-smoke"),
      workItemId: "99-omo-control-plane-smoke",
      now: "2026-04-02T10:00:00.000Z",
    });

    let prCounter = 0;
    const pullRequests = new Map<
      string,
      { number: number; url: string; draft: boolean; branch: string; headSha: string | null }
    >();

    superviseWorkItem(
      {
        rootDir,
        workItemId: "99-omo-control-plane-smoke",
        now: "2026-04-02T10:00:00.000Z",
        maxTransitions: 1,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
          assertClaudeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean({ worktreePath }: { worktreePath: string }) {
            const output = execFileSync("git", ["status", "--porcelain"], {
              cwd: worktreePath,
              encoding: "utf8",
            })
              .trim()
              .split("\n")
              .filter(Boolean)
              .filter((line) => !line.includes(".opencode/"))
              .filter((line) => !line.includes(".workflow-v2/"))
              .filter((line) => !line.includes(".artifacts/"))
              .filter((line) => line.trim() !== "?? smoke/")
              .filter((line) => !line.includes("smoke/omo-control-plane/") || !line.includes("/state.json"))
              .join("\n");
            if (output.length > 0) {
              throw new Error(`dirty_worktree\n${output}`);
            }
          },
          checkoutBranch({ branch }: { branch: string }) {
            execFileSync("git", ["checkout", "-B", branch], {
              cwd: workspacePath,
              stdio: "ignore",
            });
            return { branch };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return execFileSync("git", ["rev-parse", "HEAD"], {
              cwd: workspacePath,
              encoding: "utf8",
            }).trim();
          },
          getCurrentBranch({ worktreePath }: { worktreePath: string }) {
            return execFileSync("git", ["branch", "--show-current"], {
              cwd: worktreePath,
              encoding: "utf8",
            }).trim();
          },
          listChangedFiles({ worktreePath }: { worktreePath: string }) {
            return execFileSync("git", ["diff", "--name-only"], {
              cwd: worktreePath,
              encoding: "utf8",
            })
              .trim()
              .split("\n")
              .filter(Boolean)
              .map((relativePath) => join(worktreePath, relativePath));
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner,
        github: {
          createPullRequest({
            head,
            draft,
          }: {
            head: string;
            draft: boolean;
          }) {
            prCounter += 1;
            const pr = {
              number: prCounter,
              url: `https://github.com/example/homecook-sandbox/pull/${prCounter}`,
              draft,
              branch: head,
              headSha: null,
            };
            pullRequests.set(pr.url, pr);
            return pr;
          },
          editPullRequest({ prRef }: { prRef: string }) {
            return pullRequests.get(prRef) ?? null;
          },
          getRequiredChecks() {
            return { bucket: "pass", checks: [] };
          },
          markReady({ prRef }: { prRef: string }) {
            const existing = pullRequests.get(prRef);
            if (existing) {
              existing.draft = false;
            }
          },
          reviewPullRequest() {},
          commentPullRequest() {},
          mergePullRequest() {
            return { merged: true };
          },
          getPullRequestSummary() {
            return {
              state: "OPEN",
              mergedAt: null,
              mergeStateStatus: "CLEAN",
              reviewDecision: "REVIEW_REQUIRED",
            };
          },
          updateBranch() {},
        },
      },
    );

    writeFileSync(
      join(rootDir, "docs", "workpacks", "README.md"),
      readFileSync(join(rootDir, "docs", "workpacks", "README.md"), "utf8").replace(
        "| `99-omo-control-plane-smoke` | planned",
        "| `99-omo-control-plane-smoke` | docs",
      ),
    );
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "README.md"),
      readFileSync(join(workspacePath, "docs", "workpacks", "README.md"), "utf8").replace(
        "| `99-omo-control-plane-smoke` | planned",
        "| `99-omo-control-plane-smoke` | docs",
      ),
    );

    writeRuntimeState({
      rootDir,
      workItemId: "99-omo-control-plane-smoke",
      state: {
        ...readRuntimeState({
          rootDir,
          workItemId: "99-omo-control-plane-smoke",
          slice: "99-omo-control-plane-smoke",
        }).state,
        slice: "99-omo-control-plane-smoke",
        active_stage: 1,
        current_stage: 1,
        last_completed_stage: 1,
        wait: null,
        phase: null,
        next_action: "noop",
        execution: null,
        recovery: null,
      },
    });

    const first = superviseWorkItem(
      {
        rootDir,
        workItemId: "99-omo-control-plane-smoke",
        now: "2026-04-02T10:00:00.000Z",
        maxTransitions: 16,
      },
      {
        auth: {
          assertGhAuth() {},
          assertOpencodeAuth() {},
          assertClaudeAuth() {},
        },
        worktree: {
          ensureWorktree() {
            return { path: workspacePath, created: false };
          },
          assertClean({ worktreePath }: { worktreePath: string }) {
            const output = execFileSync("git", ["status", "--porcelain"], {
              cwd: worktreePath,
              encoding: "utf8",
            })
              .trim()
              .split("\n")
              .filter(Boolean)
              .filter((line) => !line.includes(".opencode/"))
              .filter((line) => !line.includes(".workflow-v2/"))
              .filter((line) => !line.includes(".artifacts/"))
              .filter((line) => line.trim() !== "?? smoke/")
              .filter((line) => !line.includes("smoke/omo-control-plane/") || !line.includes("/state.json"))
              .join("\n");
            if (output.length > 0) {
              throw new Error(`dirty_worktree\n${output}`);
            }
          },
          checkoutBranch({ branch }: { branch: string }) {
            execFileSync("git", ["checkout", "-B", branch], {
              cwd: workspacePath,
              stdio: "ignore",
            });
            return { branch };
          },
          pushBranch() {},
          syncBaseBranch() {},
          getHeadSha() {
            return execFileSync("git", ["rev-parse", "HEAD"], {
              cwd: workspacePath,
              encoding: "utf8",
            }).trim();
          },
          getCurrentBranch({ worktreePath }: { worktreePath: string }) {
            return execFileSync("git", ["branch", "--show-current"], {
              cwd: worktreePath,
              encoding: "utf8",
            }).trim();
          },
          listChangedFiles({ worktreePath }: { worktreePath: string }) {
            return execFileSync("git", ["diff", "--name-only"], {
              cwd: worktreePath,
              encoding: "utf8",
            })
              .trim()
              .split("\n")
              .filter(Boolean)
              .map((relativePath) => join(worktreePath, relativePath));
          },
          getBinaryDiff() {
            return "";
          },
        },
        stageRunner,
        github: {
          createPullRequest({
            head,
            draft,
          }: {
            head: string;
            draft: boolean;
          }) {
            prCounter += 1;
            const pr = {
              number: prCounter,
              url: `https://github.com/example/homecook-sandbox/pull/${prCounter}`,
              draft,
              branch: head,
              headSha: null,
            };
            pullRequests.set(pr.url, pr);
            return pr;
          },
          editPullRequest({ prRef }: { prRef: string }) {
            return pullRequests.get(prRef) ?? null;
          },
          getRequiredChecks() {
            return { bucket: "pass", checks: [] };
          },
          markReady({ prRef }: { prRef: string }) {
            const existing = pullRequests.get(prRef);
            if (existing) {
              existing.draft = false;
            }
          },
          reviewPullRequest() {},
          commentPullRequest() {},
          mergePullRequest() {
            return { merged: true };
          },
          getPullRequestSummary() {
            return {
              state: "OPEN",
              mergedAt: null,
              mergeStateStatus: "CLEAN",
              reviewDecision: "REVIEW_REQUIRED",
            };
          },
          updateBranch() {},
        },
      },
    );

    const smokeState = readControlPlaneSmokeState({
      rootDir,
      workItemId: "99-omo-control-plane-smoke",
    });
    const checkpoints = collectControlPlaneSmokeCheckpoints({
      runtime: first.runtime,
      smokeState,
    });

    expect(first.wait).toMatchObject({
      kind: "ci",
      stage: 5,
    });
    expect(smokeState.attempts["2"]).toBe(4);
    expect(smokeState.attempts["3"]).toBe(3);
    expect(smokeState.review_loops.backend.requested_changes).toBe(2);
    expect(smokeState.review_loops.backend.code_retries).toBe(2);
    expect(smokeState.review_loops.backend.approvals).toBe(1);
    expect(smokeState.review_loops.backend.feedback_seen_by_codex).toBe(true);
    expect(smokeState.review_loops.backend.last_feedback).toContain("request 2");
    expect(checkpoints.backendIterativeReviewLoopValidated).toBe(true);
    expect(checkpoints.backendReviewLoopValidated).toBe(true);
  });
});
