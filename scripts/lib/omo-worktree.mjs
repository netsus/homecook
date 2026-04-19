import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_BASE_BRANCH = "master";
const DEFAULT_BASE_REF = "origin/master";
const WORKTREE_ENV_FILES = [".env.local"];

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

function parseGitStatusPath(line) {
  const normalized = typeof line === "string" ? line.trimEnd() : "";
  const porcelain = normalized.replace(/^\s+/, "");
  const match = porcelain.match(/^[^\s]{1,2}\s+(.*)$/);
  const path = match?.[1]?.trim() ?? porcelain;
  const renameMatch = path.match(/->\s+(.+)$/);
  return renameMatch ? renameMatch[1].trim() : path;
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
  baseRef = DEFAULT_BASE_REF,
  baseBranch = DEFAULT_BASE_BRANCH,
}) {
  const worktreePath = resolveSupervisorWorktreePath({
    rootDir,
    workItemId,
  });
  const gitMarkerPath = resolve(worktreePath, ".git");

  if (existsSync(gitMarkerPath)) {
    syncWorktreeEnvFiles({
      rootDir,
      worktreePath,
    });
    return {
      path: worktreePath,
      created: false,
    };
  }

  mkdirSync(resolve(rootDir, ".worktrees"), { recursive: true });
  runGit({
    cwd: rootDir,
    args: ["fetch", "origin", ensureNonEmptyString(baseBranch, "baseBranch")],
  });
  runGit({
    cwd: rootDir,
    args: ["worktree", "add", "--detach", worktreePath, ensureNonEmptyString(baseRef, "baseRef")],
  });
  syncWorktreeEnvFiles({
    rootDir,
    worktreePath,
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
  startPoint = DEFAULT_BASE_REF,
}) {
  const normalizedWorktreePath = ensureNonEmptyString(worktreePath, "worktreePath");
  const normalizedBranch = ensureNonEmptyString(branch, "branch");
  const normalizedStartPoint = ensureNonEmptyString(startPoint, "startPoint");
  const remoteStartPointMatch = normalizedStartPoint.match(/^origin\/(.+)$/);

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

  if (remoteStartPointMatch) {
    runGit({
      cwd: rootDir,
      args: ["fetch", "origin", remoteStartPointMatch[1]],
    });
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
    .map((line) => parseGitStatusPath(line))
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

export function commitWorktreeChanges({
  worktreePath,
  subject,
  body = null,
}) {
  const normalizedWorktreePath = ensureNonEmptyString(worktreePath, "worktreePath");
  const normalizedSubject = ensureNonEmptyString(subject, "subject");

  runGit({
    cwd: normalizedWorktreePath,
    args: ["add", "-A"],
  });

  const args = ["commit", "-m", normalizedSubject];
  if (typeof body === "string" && body.trim().length > 0) {
    args.push("-m", body.trim());
  }

  runGit({
    cwd: normalizedWorktreePath,
    args,
  });
}

export function syncWorktreeWithBaseBranch({
  rootDir = process.cwd(),
  worktreePath,
  baseBranch = DEFAULT_BASE_BRANCH,
}) {
  const normalizedBaseBranch = ensureNonEmptyString(baseBranch, "baseBranch");
  runGit({
    cwd: rootDir,
    args: ["fetch", "origin", normalizedBaseBranch],
  });
  runGit({
    cwd: ensureNonEmptyString(worktreePath, "worktreePath"),
    args: ["checkout", "--detach", `origin/${normalizedBaseBranch}`],
  });
  syncWorktreeEnvFiles({
    rootDir,
    worktreePath,
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

export function restoreWorktreePaths({
  worktreePath,
  paths,
}) {
  const normalizedWorktreePath = ensureNonEmptyString(worktreePath, "worktreePath");
  const normalizedPaths = Array.isArray(paths)
    ? [...new Set(
        paths
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter((value) => value.length > 0),
      )]
    : [];

  if (normalizedPaths.length === 0) {
    return;
  }

  runGit({
    cwd: normalizedWorktreePath,
    args: ["restore", "--source=HEAD", "--staged", "--worktree", "--", ...normalizedPaths],
  });
}

export function deleteWorktreePaths({
  worktreePath,
  paths,
}) {
  const normalizedWorktreePath = ensureNonEmptyString(worktreePath, "worktreePath");
  const normalizedPaths = Array.isArray(paths)
    ? [...new Set(
        paths
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter((value) => value.length > 0),
      )]
    : [];

  for (const relativePath of normalizedPaths) {
    rmSync(resolve(normalizedWorktreePath, relativePath), {
      force: true,
      recursive: true,
    });
  }
}

function syncWorktreeEnvFiles({
  rootDir,
  worktreePath,
}) {
  const normalizedRootDir = ensureNonEmptyString(rootDir, "rootDir");
  const normalizedWorktreePath = ensureNonEmptyString(worktreePath, "worktreePath");

  for (const filename of WORKTREE_ENV_FILES) {
    const sourcePath = resolve(normalizedRootDir, filename);
    if (!existsSync(sourcePath)) {
      continue;
    }

    const targetPath = resolve(normalizedWorktreePath, filename);
    copyFileSync(sourcePath, targetPath);
  }
}

export function getWorktreeBinaryDiff({
  worktreePath,
}) {
  return runGit({
    cwd: ensureNonEmptyString(worktreePath, "worktreePath"),
    args: ["diff", "--binary", "--no-ext-diff"],
  });
}
