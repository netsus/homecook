import { spawnSync } from "node:child_process";
import { relative, resolve } from "node:path";

import { markBranchPromptPending, readBranchPromptState, readBranchSession } from "./branch-session.mjs";
import { isAllowedWorkBranchName } from "./git-policy.mjs";
import { startWorkBranch } from "./start-work-branch.mjs";

function runGit({ rootDir, args, spawnSyncFn = spawnSync }) {
  const result = spawnSyncFn("git", args, {
    cwd: rootDir,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
    throw new Error(stderr.length > 0 ? stderr : `git ${args.join(" ")} failed.`);
  }

  return (result.stdout ?? "").trim();
}

function readCurrentBranch({ rootDir, spawnSyncFn = spawnSync }) {
  return runGit({
    rootDir,
    args: ["branch", "--show-current"],
    spawnSyncFn,
  });
}

function isWorktreeDirty({ rootDir, spawnSyncFn = spawnSync }) {
  const status = runGit({
    rootDir,
    args: ["status", "--porcelain"],
    spawnSyncFn,
  });

  return status.length > 0;
}

function isPathInsideRoot({ rootDir, filePath }) {
  const absoluteRoot = resolve(rootDir);
  const absoluteFile = resolve(filePath);
  const rel = relative(absoluteRoot, absoluteFile);
  return rel !== ".." && !rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`);
}

function resolveHookFilePath(toolInput) {
  if (!toolInput || typeof toolInput !== "object") {
    return null;
  }

  if (typeof toolInput.file_path === "string" && toolInput.file_path.trim().length > 0) {
    return toolInput.file_path.trim();
  }

  return null;
}

export function ensureEditWorkBranch({
  rootDir = process.cwd(),
  hookInput,
  spawnSyncFn = spawnSync,
}) {
  const intent = readBranchSession({ rootDir });
  const promptState = readBranchPromptState({ rootDir });
  const currentBranch = readCurrentBranch({ rootDir, spawnSyncFn });
  const filePath = resolveHookFilePath(hookInput?.tool_input);

  if (filePath && !isPathInsideRoot({ rootDir, filePath })) {
    return {
      outcome: "deny",
      reason: `Edit target is outside the repository root: ${filePath}`,
    };
  }

  if (!intent) {
    return {
      outcome: "deny",
      reason:
        "No active work branch intent is recorded for this repo. Run `pnpm branch:start -- --branch <name>` or the slice shortcut before editing files.",
    };
  }

  if (promptState.reassertRequired) {
    return {
      outcome: "deny",
      reason:
        "A new user prompt was received. Re-run `pnpm branch:start -- --branch <name>` or the slice shortcut for this work item before editing files.",
    };
  }

  if (!isAllowedWorkBranchName(intent.branch)) {
    return {
      outcome: "deny",
      reason: `Recorded work branch intent is invalid: ${intent.branch}`,
    };
  }

  if (!currentBranch) {
    return {
      outcome: "deny",
      reason: "Current git checkout is detached or unknown. Checkout a work branch before editing files.",
    };
  }

  if (currentBranch === intent.branch) {
    return {
      outcome: "allow",
      branchChanged: false,
      currentBranch,
      targetBranch: intent.branch,
    };
  }

  if (isWorktreeDirty({ rootDir, spawnSyncFn })) {
    return {
      outcome: "deny",
      reason:
        `Current checkout (${currentBranch}) does not match the recorded work branch intent (${intent.branch}), ` +
        "and the worktree is dirty. Commit or stash changes, then rerun `pnpm branch:start` for the next work item.",
    };
  }

  const switched = startWorkBranch({
    rootDir,
    branch: intent.branch,
    spawnSyncFn,
    persistSession: false,
  });

  return {
    outcome: "allow",
    branchChanged: switched.changed,
    currentBranch,
    targetBranch: intent.branch,
  };
}

export function buildUserPromptBranchContext({ rootDir = process.cwd(), prompt = "" }) {
  const intent = readBranchSession({ rootDir });
  const currentBranch = readCurrentBranch({ rootDir });
  const normalizedPrompt = typeof prompt === "string" ? prompt.trim() : "";
  markBranchPromptPending({ rootDir });

  if (!intent) {
    return {
      additionalContext:
        "No active work branch intent is recorded for this repo. Before any file edits for this prompt, run `pnpm branch:start -- --branch <name>` or the slice shortcut. The pre-edit hook will block Write/Edit calls until a work branch is declared for the current prompt.",
    };
  }

  const taskHint =
    normalizedPrompt.length > 0
      ? "Before any file edits for this prompt, rerun `pnpm branch:start` so the branch intent is reasserted for the current work item."
      : "Before any file edits after a new prompt, rerun `pnpm branch:start` so the branch intent is reasserted for the current work item.";

  if (currentBranch !== intent.branch) {
    return {
      additionalContext:
        `Recorded work branch intent is \`${intent.branch}\`, but the current checkout is \`${currentBranch || "detached"}\`. ` +
        "After you rerun `pnpm branch:start`, the pre-edit hook will auto-switch to the recorded branch on the first Write/Edit call if the worktree is clean. " +
        taskHint,
    };
  }

  return {
    additionalContext:
      `Active work branch intent: \`${intent.branch}\`. ${taskHint}`,
  };
}
