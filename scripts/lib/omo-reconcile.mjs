import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { applyBookkeepingRepairPlan, evaluateBookkeepingInvariant } from "./omo-bookkeeping.mjs";
import { createGithubAutomationClient } from "./omo-github.mjs";
import { syncWorkflowV2Status } from "./omo-lite-supervisor.mjs";
import { readRuntimeState, setPullRequestRef, setWaitState, writeRuntimeState } from "./omo-session-runtime.mjs";
import { commitWorktreeChanges, getWorktreeHeadSha, pushWorktreeBranch } from "./omo-worktree.mjs";

function ensureNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function formatTimestampSlug(value) {
  const source =
    typeof value === "string" && value.trim().length > 0 ? value.trim() : new Date().toISOString();
  return source.replace(/[:.]/g, "-");
}

function runGit({ cwd, args }) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
    throw new Error(stderr.length > 0 ? stderr : `git ${args.join(" ")} failed.`);
  }

  return (result.stdout ?? "").trim();
}

function bucketToVerification(bucket) {
  if (bucket === "fail") {
    return "failed";
  }

  if (bucket === "pass") {
    return "passed";
  }

  return "pending";
}

function resolveCloseoutBranch(slice) {
  return `docs/omo-closeout-${ensureNonEmptyString(slice, "slice")}`;
}

function resolveCloseoutWorktreePath({ rootDir, slice, now }) {
  return resolve(
    rootDir,
    ".artifacts",
    "tmp",
    `omo-closeout-${ensureNonEmptyString(slice, "slice")}-${formatTimestampSlug(now)}`,
  );
}

function remoteBranchExists({ rootDir, branch }) {
  const result = spawnSync("git", ["ls-remote", "--heads", "origin", branch], {
    cwd: rootDir,
    encoding: "utf8",
  });

  return result.status === 0 && typeof result.stdout === "string" && result.stdout.trim().length > 0;
}

function prepareCloseoutWorktree({
  rootDir,
  slice,
  now,
}) {
  const branch = resolveCloseoutBranch(slice);
  const worktreePath = resolveCloseoutWorktreePath({
    rootDir,
    slice,
    now,
  });
  const hasRemoteBranch = remoteBranchExists({
    rootDir,
    branch,
  });

  rmSync(worktreePath, { recursive: true, force: true });
  mkdirSync(resolve(rootDir, ".artifacts", "tmp"), { recursive: true });
  runGit({
    cwd: rootDir,
    args: ["fetch", "origin", "master"],
  });

  if (hasRemoteBranch) {
    runGit({
      cwd: rootDir,
      args: ["fetch", "origin", branch],
    });
    runGit({
      cwd: rootDir,
      args: ["worktree", "add", worktreePath, `origin/${branch}`],
    });
    runGit({
      cwd: worktreePath,
      args: ["checkout", branch],
    });
  } else {
    runGit({
      cwd: rootDir,
      args: ["worktree", "add", "--detach", worktreePath, "origin/master"],
    });
    runGit({
      cwd: worktreePath,
      args: ["checkout", "-b", branch, "origin/master"],
    });
  }

  return {
    branch,
    worktreePath,
  };
}

function cleanupCloseoutWorktree({ rootDir, worktreePath }) {
  if (typeof worktreePath !== "string" || worktreePath.trim().length === 0) {
    return;
  }

  try {
    runGit({
      cwd: rootDir,
      args: ["worktree", "remove", "--force", worktreePath],
    });
  } catch {
    rmSync(worktreePath, { recursive: true, force: true });
  }
}

function buildCloseoutPullRequestBody(workItemId, invariant) {
  const summaryLines = [
    "- OMO bookkeeping drift를 복구하기 위한 closeout PR입니다.",
    ...invariant.issues.map((issue) => `- ${issue.kind}: \`${issue.actual ?? "missing"}\` -> \`${issue.expected}\``),
  ];

  return [
    "## Summary",
    summaryLines.join("\n"),
    "",
    "## Workpack / Slice",
    `- workflow v2 work item: \`.workflow-v2/work-items/${workItemId}.json\``,
    "",
    "## Test Plan",
    "- pnpm validate:omo-bookkeeping",
  ].join("\n");
}

function assertDocsOnlyCloseoutChanges({ slice, changedFiles, worktreePath }) {
  const allowed = new Set([
    resolve(worktreePath, "docs", "workpacks", "README.md"),
    resolve(worktreePath, "docs", "workpacks", slice, "README.md"),
  ]);

  const invalid = changedFiles.filter((filePath) => !allowed.has(filePath));
  if (invalid.length > 0) {
    throw new Error(`Closeout repair must be docs-only. Invalid files: ${invalid.join(", ")}`);
  }
}

/**
 * @param {{
 *   rootDir?: string,
 *   workItemId: string,
 *   slice?: string,
 *   ghBin?: string,
 *   now?: string,
 *   environment?: Record<string, string>,
 * }} [options]
 */
export function reconcileWorkItemBookkeeping({
  rootDir = process.cwd(),
  workItemId,
  slice = undefined,
  ghBin = "gh",
  now = new Date().toISOString(),
  environment = undefined,
} = {}) {
  const normalizedWorkItemId = ensureNonEmptyString(workItemId, "workItemId");
  const runtime = readRuntimeState({
    rootDir,
    workItemId: normalizedWorkItemId,
    slice,
  }).state;
  const resolvedSlice =
    typeof slice === "string" && slice.trim().length > 0
      ? slice.trim()
      : runtime.slice ?? normalizedWorkItemId;
  const invariant = evaluateBookkeepingInvariant({
    rootDir,
    workItemId: normalizedWorkItemId,
    slice: resolvedSlice,
    runtimeState: runtime,
  });

  if (invariant.outcome === "ok") {
    return {
      workItemId: normalizedWorkItemId,
      slice: resolvedSlice,
      action: "noop",
      reason: "bookkeeping_aligned",
      invariant,
      runtime,
    };
  }

  if (invariant.outcome !== "repairable_post_merge") {
    throw new Error(`Bookkeeping drift is not safely repairable: ${invariant.reason ?? invariant.outcome}`);
  }

  const github = createGithubAutomationClient({
    rootDir,
    ghBin,
    environment,
  });
  github.assertAuth();

  const closeoutWorktree = prepareCloseoutWorktree({
    rootDir,
    slice: resolvedSlice,
    now,
  });

  try {
    const worktreeInvariant = evaluateBookkeepingInvariant({
      rootDir,
      workItemId: normalizedWorkItemId,
      slice: resolvedSlice,
      runtimeState: runtime,
      worktreePath: closeoutWorktree.worktreePath,
    });
    if (worktreeInvariant.outcome !== "repairable_post_merge" && worktreeInvariant.outcome !== "ok") {
      throw new Error(`Closeout worktree is not in a safe repair state: ${worktreeInvariant.reason ?? worktreeInvariant.outcome}`);
    }

    const repair = applyBookkeepingRepairPlan({
      worktreePath: closeoutWorktree.worktreePath,
      slice: resolvedSlice,
      repairActions: worktreeInvariant.repairActions,
    });
    assertDocsOnlyCloseoutChanges({
      slice: resolvedSlice,
      changedFiles: repair.changedFiles,
      worktreePath: closeoutWorktree.worktreePath,
    });

    if (repair.changed) {
      commitWorktreeChanges({
        worktreePath: closeoutWorktree.worktreePath,
        subject: `docs(workpacks): reconcile ${resolvedSlice} bookkeeping drift`,
        body: "OMO closeout PR이 공식 roadmap/workpack 상태를 merged 결과와 정렬합니다.",
      });
    }

    const headSha = getWorktreeHeadSha({
      worktreePath: closeoutWorktree.worktreePath,
    });
    pushWorktreeBranch({
      worktreePath: closeoutWorktree.worktreePath,
      branch: closeoutWorktree.branch,
    });

    const pr = github.createPullRequest({
      base: "master",
      head: closeoutWorktree.branch,
      title: `docs(workpacks): reconcile ${resolvedSlice} bookkeeping drift`,
      body: buildCloseoutPullRequestBody(normalizedWorkItemId, worktreeInvariant),
      draft: false,
      workItemId: normalizedWorkItemId,
    });
    const checks = github.getRequiredChecks({
      prRef: pr.url,
    });

    const nextRuntime = writeRuntimeState({
      rootDir,
      workItemId: normalizedWorkItemId,
      state: setWaitState({
        state: setPullRequestRef({
          state: runtime,
          role: "closeout",
          number: pr.number,
          url: pr.url,
          draft: pr.draft,
          branch: closeoutWorktree.branch,
          headSha,
          updatedAt: now,
        }),
        kind: "ci",
        prRole: "closeout",
        stage: 6,
        headSha,
        updatedAt: now,
      }),
    }).state;

    syncWorkflowV2Status({
      rootDir,
      workItemId: normalizedWorkItemId,
      patch: {
        pr_path: pr.url,
        lifecycle: "ready_for_review",
        approval_state: "dual_approved",
        verification_status: bucketToVerification(checks.bucket),
        notes: `wait_kind=ci pr_role=closeout stage=6 closeout_pr=${pr.url}`,
      },
      updatedAt: now,
    });

    return {
      workItemId: normalizedWorkItemId,
      slice: resolvedSlice,
      action: "open_closeout_pr",
      pr,
      checks,
      invariant: worktreeInvariant,
      runtime: nextRuntime,
      branch: closeoutWorktree.branch,
      worktreePath: closeoutWorktree.worktreePath,
    };
  } finally {
    cleanupCloseoutWorktree({
      rootDir,
      worktreePath: closeoutWorktree.worktreePath,
    });
  }
}
