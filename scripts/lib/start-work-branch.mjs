import { spawnSync } from "node:child_process";

import { clearBranchPromptPending, writeBranchSession } from "./branch-session.mjs";
import { checkWorkpackDocs, resolveSliceFromBranch } from "./check-workpack-docs.mjs";
import { isAllowedWorkBranchName } from "./git-policy.mjs";

function ensureNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

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

function branchExists({ rootDir, ref, spawnSyncFn = spawnSync }) {
  return (
    spawnSyncFn("git", ["show-ref", "--verify", "--quiet", ref], {
      cwd: rootDir,
      encoding: "utf8",
    }).status === 0
  );
}

export function resolveTargetWorkBranch({ branch = null, slice = null, role = null }) {
  const normalizedBranch = typeof branch === "string" ? branch.trim() : "";
  const normalizedSlice = typeof slice === "string" ? slice.trim() : "";
  const normalizedRole = typeof role === "string" ? role.trim() : "";
  const hasBranch = normalizedBranch.length > 0;
  const hasSliceOrRole = normalizedSlice.length > 0 || normalizedRole.length > 0;

  if (hasBranch && hasSliceOrRole) {
    throw new Error("Use either --branch or --slice with --role, not both.");
  }

  if (hasBranch) {
    return normalizedBranch;
  }

  if (normalizedSlice.length === 0 || normalizedRole.length === 0) {
    throw new Error("Provide --branch, or provide both --slice and --role.");
  }

  switch (normalizedRole) {
    case "docs":
      return `docs/${normalizedSlice}`;
    case "be":
      return `feature/be-${normalizedSlice}`;
    case "fe":
      return `feature/fe-${normalizedSlice}`;
    default:
      throw new Error("role must be one of: docs, be, fe.");
  }
}

export function startWorkBranch({
  rootDir = process.cwd(),
  branch = null,
  slice = null,
  role = null,
  baseRef = "origin/master",
  persistSession = true,
  spawnSyncFn = spawnSync,
}) {
  const normalizedRootDir = ensureNonEmptyString(rootDir, "rootDir");
  const normalizedBaseRef = ensureNonEmptyString(baseRef, "baseRef");
  const targetBranch = resolveTargetWorkBranch({ branch, slice, role });

  if (!isAllowedWorkBranchName(targetBranch)) {
    throw new Error(
      [
        `Invalid work branch: ${targetBranch}`,
        "Expected one of:",
        "  feature/<slug>",
        "  fix/<slug>",
        "  chore/<slug>",
        "  docs/<slug>",
        "  refactor/<slug>",
        "  test/<slug>",
        "  release/<slug>",
        "  hotfix/<slug>",
      ].join("\n"),
    );
  }

  const currentBranch = runGit({
    rootDir: normalizedRootDir,
    args: ["branch", "--show-current"],
    spawnSyncFn,
  });

  if (currentBranch === targetBranch) {
    if (persistSession) {
      writeBranchSession({
        rootDir: normalizedRootDir,
        branch: targetBranch,
        source: slice && role ? "slice-role" : "branch",
        slice,
        role,
      });
      clearBranchPromptPending({ rootDir: normalizedRootDir });
    }

    return {
      branch: targetBranch,
      created: false,
      changed: false,
      source: "current",
    };
  }

  const status = runGit({
    rootDir: normalizedRootDir,
    args: ["status", "--porcelain"],
    spawnSyncFn,
  });

  if (status.length > 0) {
    throw new Error("Worktree is dirty. Commit or stash changes before switching branches.");
  }

  runGit({
    rootDir: normalizedRootDir,
    args: ["fetch", "origin"],
    spawnSyncFn,
  });

  const workpackSlice = resolveSliceFromBranch(targetBranch);
  if (workpackSlice) {
    const spawnSyncInRoot = (command, args, options = {}) =>
      spawnSyncFn(command, args, {
        cwd: normalizedRootDir,
        encoding: "utf8",
        ...options,
      });
    const missing = checkWorkpackDocs({
      slice: workpackSlice,
      baseRef: normalizedBaseRef.replace(/^origin\//, ""),
      spawnSyncFn: spawnSyncInRoot,
    });

    if (missing.length > 0) {
      throw new Error(
        `Stage 1 docs must be merged before starting ${targetBranch}.\n` +
          missing.map((path) => `- ${path}`).join("\n"),
      );
    }
  }

  if (
    branchExists({
      rootDir: normalizedRootDir,
      ref: `refs/heads/${targetBranch}`,
      spawnSyncFn,
    })
  ) {
    runGit({
      rootDir: normalizedRootDir,
      args: ["checkout", targetBranch],
      spawnSyncFn,
    });

    if (persistSession) {
      writeBranchSession({
        rootDir: normalizedRootDir,
        branch: targetBranch,
        source: slice && role ? "slice-role" : "branch",
        slice,
        role,
      });
      clearBranchPromptPending({ rootDir: normalizedRootDir });
    }

    return {
      branch: targetBranch,
      created: false,
      changed: true,
      source: "local",
    };
  }

  runGit({
    rootDir: normalizedRootDir,
    args: ["checkout", "-b", targetBranch, normalizedBaseRef],
    spawnSyncFn,
  });

  if (persistSession) {
    writeBranchSession({
      rootDir: normalizedRootDir,
      branch: targetBranch,
      source: slice && role ? "slice-role" : "branch",
      slice,
      role,
    });
    clearBranchPromptPending({ rootDir: normalizedRootDir });
  }

  return {
    branch: targetBranch,
    created: true,
    changed: true,
    source: "base",
  };
}
