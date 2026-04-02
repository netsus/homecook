import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { isAllowedWorkBranchName } from "./git-policy.mjs";

export const BRANCH_SESSION_RELATIVE_PATH = ".opencode/branch-session.json";
export const BRANCH_PROMPT_STATE_RELATIVE_PATH = ".opencode/branch-prompt-state.json";

function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSource(value) {
  return value === "slice-role" ? "slice-role" : "branch";
}

export function resolveBranchSessionPath(rootDir = process.cwd()) {
  return resolve(rootDir, BRANCH_SESSION_RELATIVE_PATH);
}

export function resolveBranchPromptStatePath(rootDir = process.cwd()) {
  return resolve(rootDir, BRANCH_PROMPT_STATE_RELATIVE_PATH);
}

export function readBranchSession({ rootDir = process.cwd() } = {}) {
  const filePath = resolveBranchSessionPath(rootDir);

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    const branch = normalizeOptionalString(parsed?.branch);

    if (!branch || !isAllowedWorkBranchName(branch)) {
      return null;
    }

    return {
      version: parsed?.version === 1 ? 1 : 1,
      branch,
      source: normalizeSource(parsed?.source),
      slice: normalizeOptionalString(parsed?.slice),
      role: normalizeOptionalString(parsed?.role),
      updatedAt:
        normalizeOptionalString(parsed?.updatedAt) ?? new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export function writeBranchSession({
  rootDir = process.cwd(),
  branch,
  source = "branch",
  slice = null,
  role = null,
  updatedAt = new Date().toISOString(),
}) {
  const normalizedBranch = normalizeOptionalString(branch);

  if (!normalizedBranch || !isAllowedWorkBranchName(normalizedBranch)) {
    throw new Error(`Cannot persist invalid work branch intent: ${branch ?? "<empty>"}`);
  }

  const payload = {
    version: 1,
    branch: normalizedBranch,
    source: normalizeSource(source),
    slice: normalizeOptionalString(slice),
    role: normalizeOptionalString(role),
    updatedAt,
  };

  const filePath = resolveBranchSessionPath(rootDir);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  return {
    filePath,
    session: payload,
  };
}

export function clearBranchSession({ rootDir = process.cwd() } = {}) {
  const filePath = resolveBranchSessionPath(rootDir);

  if (!existsSync(filePath)) {
    return {
      cleared: false,
      filePath,
    };
  }

  rmSync(filePath);

  return {
    cleared: true,
    filePath,
  };
}

export function readBranchPromptState({ rootDir = process.cwd() } = {}) {
  const filePath = resolveBranchPromptStatePath(rootDir);

  if (!existsSync(filePath)) {
    return {
      reassertRequired: false,
      updatedAt: null,
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    return {
      reassertRequired: parsed?.reassertRequired === true,
      updatedAt: normalizeOptionalString(parsed?.updatedAt),
    };
  } catch {
    return {
      reassertRequired: false,
      updatedAt: null,
    };
  }
}

export function markBranchPromptPending({
  rootDir = process.cwd(),
  updatedAt = new Date().toISOString(),
} = {}) {
  const filePath = resolveBranchPromptStatePath(rootDir);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    `${JSON.stringify(
      {
        version: 1,
        reassertRequired: true,
        updatedAt,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return {
    filePath,
    updatedAt,
  };
}

export function clearBranchPromptPending({ rootDir = process.cwd() } = {}) {
  const filePath = resolveBranchPromptStatePath(rootDir);

  if (!existsSync(filePath)) {
    return {
      cleared: false,
      filePath,
    };
  }

  rmSync(filePath);

  return {
    cleared: true,
    filePath,
  };
}
