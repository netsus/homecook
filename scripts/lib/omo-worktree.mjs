import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

function ensureNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
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

export function resolveSupervisorWorktreePath({
  rootDir = process.cwd(),
  workItemId,
}) {
  return resolve(
    ensureNonEmptyString(rootDir, "rootDir"),
    ".worktrees",
    ensureNonEmptyString(workItemId, "workItemId"),
  );
}

export function ensureSupervisorWorktree({
  rootDir = process.cwd(),
  workItemId,
  baseRef = "master",
}) {
  const worktreePath = resolveSupervisorWorktreePath({
    rootDir,
    workItemId,
  });
  const gitMarkerPath = resolve(worktreePath, ".git");

  if (existsSync(gitMarkerPath)) {
    return {
      path: worktreePath,
      created: false,
    };
  }

  mkdirSync(resolve(rootDir, ".worktrees"), { recursive: true });
  runGit({
    cwd: rootDir,
    args: ["worktree", "add", "--detach", worktreePath, baseRef],
  });

  return {
    path: worktreePath,
    created: true,
  };
}

export function ensureWorktreeBranch({
  rootDir = process.cwd(),
  worktreePath,
  branch,
  startPoint = "master",
}) {
  const normalizedWorktreePath = ensureNonEmptyString(worktreePath, "worktreePath");
  const normalizedBranch = ensureNonEmptyString(branch, "branch");
  const normalizedStartPoint = ensureNonEmptyString(startPoint, "startPoint");

  const currentBranch = runGit({
    cwd: normalizedWorktreePath,
    args: ["branch", "--show-current"],
  });
  if (currentBranch === normalizedBranch) {
    return {
      branch: normalizedBranch,
      created: false,
    };
  }

  const hasLocalBranch = spawnSync(
    "git",
    ["show-ref", "--verify", "--quiet", `refs/heads/${normalizedBranch}`],
    {
      cwd: rootDir,
      encoding: "utf8",
    },
  ).status === 0;

  if (hasLocalBranch) {
    runGit({
      cwd: normalizedWorktreePath,
      args: ["checkout", normalizedBranch],
    });
    return {
      branch: normalizedBranch,
      created: false,
    };
  }

  runGit({
    cwd: normalizedWorktreePath,
    args: ["checkout", "-b", normalizedBranch, normalizedStartPoint],
  });

  return {
    branch: normalizedBranch,
    created: true,
  };
}

export function assertWorktreeClean({
  worktreePath,
}) {
  const status = runGit({
    cwd: ensureNonEmptyString(worktreePath, "worktreePath"),
    args: ["status", "--porcelain"],
  });

  if (status.length > 0) {
    throw new Error("Worktree is dirty.");
  }
}

export function listWorktreeChangedFiles({
  worktreePath,
}) {
  const status = runGit({
    cwd: ensureNonEmptyString(worktreePath, "worktreePath"),
    args: ["status", "--porcelain"],
  });

  if (status.length === 0) {
    return [];
  }

  return status
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .map((path) => {
      const renameMatch = path.match(/->\s+(.+)$/);
      return renameMatch ? renameMatch[1].trim() : path;
    })
    .filter(Boolean);
}

export function getWorktreeCurrentBranch({
  worktreePath,
}) {
  return runGit({
    cwd: ensureNonEmptyString(worktreePath, "worktreePath"),
    args: ["branch", "--show-current"],
  });
}

export function pushWorktreeBranch({
  worktreePath,
  branch,
}) {
  runGit({
    cwd: ensureNonEmptyString(worktreePath, "worktreePath"),
    args: ["push", "-u", "origin", ensureNonEmptyString(branch, "branch")],
  });
}

export function syncWorktreeWithBaseBranch({
  rootDir = process.cwd(),
  worktreePath,
  baseBranch = "master",
}) {
  const normalizedBaseBranch = ensureNonEmptyString(baseBranch, "baseBranch");
  runGit({
    cwd: rootDir,
    args: ["fetch", "origin", normalizedBaseBranch],
  });
  runGit({
    cwd: ensureNonEmptyString(worktreePath, "worktreePath"),
    args: ["checkout", normalizedBaseBranch],
  });
  runGit({
    cwd: ensureNonEmptyString(worktreePath, "worktreePath"),
    args: ["pull", "--ff-only", "origin", normalizedBaseBranch],
  });
}

export function getWorktreeHeadSha({
  worktreePath,
}) {
  return runGit({
    cwd: ensureNonEmptyString(worktreePath, "worktreePath"),
    args: ["rev-parse", "HEAD"],
  });
}
