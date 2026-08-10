import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { isValidBranchSlug } from "./git-policy.mjs";
import { parseProductBranchContext } from "./product-branch-context.mjs";

const CLOSEOUT_BRANCH_PREFIX = "docs/omo-closeout-";

export function resolveBranchName({
  rootDir = process.cwd(),
  env = process.env,
} = {}) {
  const branchName = env.BRANCH_NAME ?? env.GITHUB_HEAD_REF;
  if (typeof branchName === "string" && branchName.trim().length > 0) {
    return branchName.trim();
  }

  const result = spawnSync("git", ["branch", "--show-current"], {
    cwd: rootDir,
    encoding: "utf8",
  });

  return result.status === 0 ? (result.stdout ?? "").trim() : "";
}

export function parseDraftState(value) {
  if (value === true || value === "true") {
    return true;
  }

  if (value === false || value === "false") {
    return false;
  }

  return null;
}

export function resolveSliceBranchContext(
  branchName,
  {
    includeBackend = false,
    includeFrontend = true,
    includeCloseout = true,
  } = {},
) {
  const productContext = parseProductBranchContext(branchName);
  if (
    (productContext.kind === "feature-be" && includeBackend)
    || (productContext.kind === "feature-fe" && includeFrontend)
  ) {
    return productContext;
  }

  if (includeCloseout && branchName.startsWith(CLOSEOUT_BRANCH_PREFIX)) {
    const closeoutSlice = branchName.slice(CLOSEOUT_BRANCH_PREFIX.length);
    if (!isValidBranchSlug(closeoutSlice)) {
      throw new Error(
        `Invalid closeout branch '${branchName}': the slice must use the public lowercase hyphenated branch slug grammar`,
      );
    }

    return {
      kind: "omo-closeout",
      slice: closeoutSlice,
      recovery: null,
    };
  }

  return {
    kind: null,
    slice: null,
    recovery: null,
  };
}

export function readText(filePath) {
  return readFileSync(filePath, "utf8");
}

export function readPullRequestBody({
  rootDir = process.cwd(),
  env = process.env,
  preferredBody = null,
  verifyEventHeadRef = false,
} = {}) {
  if (typeof preferredBody === "string" && preferredBody.trim().length > 0) {
    return preferredBody;
  }

  if (typeof env.PR_BODY === "string" && env.PR_BODY.trim().length > 0) {
    return env.PR_BODY;
  }

  const bodyFilePath = env.PR_BODY_FILE;
  if (typeof bodyFilePath === "string" && bodyFilePath.trim().length > 0 && existsSync(bodyFilePath)) {
    return readText(bodyFilePath.trim());
  }

  const eventPath = env.GITHUB_EVENT_PATH;
  if (typeof eventPath === "string" && eventPath.trim().length > 0 && existsSync(eventPath)) {
    try {
      const event = JSON.parse(readText(resolve(rootDir, eventPath.trim())));
      if (verifyEventHeadRef) {
        const eventHeadRef = event?.pull_request?.head?.ref;
        const requestedBranch = env.BRANCH_NAME ?? env.GITHUB_HEAD_REF;
        if (
          typeof requestedBranch === "string" &&
          requestedBranch.trim().length > 0 &&
          typeof eventHeadRef === "string" &&
          eventHeadRef.trim().length > 0 &&
          eventHeadRef.trim() !== requestedBranch.trim()
        ) {
          return null;
        }
      }

      const body = event?.pull_request?.body;
      if (typeof body === "string" && body.trim().length > 0) {
        return body;
      }
    } catch {
      return null;
    }
  }

  return null;
}

export function extractMarkdownSection(text, heading) {
  if (typeof text !== "string" || text.trim().length === 0) {
    return "";
  }

  const lines = text.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim() === heading);
  if (startIndex === -1) {
    return "";
  }

  const collected = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^##\s+/.test(line.trim())) {
      break;
    }
    collected.push(line);
  }

  return collected.join("\n");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function readMarkdownLabelValue(sectionText, label) {
  if (typeof sectionText !== "string" || sectionText.trim().length === 0) {
    return "";
  }

  const pattern = new RegExp(`^-\\s+${escapeRegExp(label)}:\\s*(.*)$`, "im");
  const match = sectionText.match(pattern);
  return (match?.[1] ?? "").trim();
}

export function normalizeInlineCode(value) {
  return value.replace(/`/g, "").trim();
}
