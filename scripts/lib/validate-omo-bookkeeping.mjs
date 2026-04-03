import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { evaluateBookkeepingInvariant } from "./omo-bookkeeping.mjs";
import { resolveBaseRef } from "./check-workpack-docs.mjs";
import { listRuntimeStates, readRuntimeState } from "./omo-session-runtime.mjs";

function listTrackedWorkItems(rootDir) {
  const workItemsDir = resolve(rootDir, ".workflow-v2", "work-items");
  if (!existsSync(workItemsDir)) {
    return [];
  }

  return readdirSync(workItemsDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const workItemId = name.replace(/\.json$/, "");
      const runtimeState = readRuntimeState({
        rootDir,
        workItemId,
      }).state;

      return {
        id: workItemId,
        runtimeState,
      };
    });
}

function resolveBranchName(rootDir, env) {
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

function listChangedFilesAgainstBase({ rootDir, baseRef }) {
  const result = spawnSync("git", ["diff", "--name-only", `origin/${baseRef}...HEAD`], {
    cwd: rootDir,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
    throw new Error(stderr.length > 0 ? stderr : `Unable to diff against origin/${baseRef}`);
  }

  return (result.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function validateCloseoutBranchDiff({ rootDir, env = process.env }) {
  const branchName = resolveBranchName(rootDir, env);
  const match = /^docs\/omo-closeout-(.+)$/.exec(branchName);
  if (!match) {
    return [];
  }

  const slice = match[1];
  const baseRef = resolveBaseRef(env, spawnSync) ?? "master";
  const changedFiles = listChangedFilesAgainstBase({
    rootDir,
    baseRef,
  });
  const allowed = new Set([
    "docs/workpacks/README.md",
    `docs/workpacks/${slice}/README.md`,
  ]);

  return changedFiles
    .filter((filePath) => !allowed.has(filePath))
    .map((filePath) => ({
      path: filePath,
      message: "Closeout PR must only modify docs/workpacks/README.md and the target workpack README.",
    }));
}

export function validateOmoBookkeeping({
  rootDir = process.cwd(),
  env = process.env,
} = {}) {
  const trackedWorkItems = listTrackedWorkItems(rootDir);
  const trackedProductIds = trackedWorkItems
    .filter(({ id }) => /^\d{2}-/.test(id))
    .map(({ id }) => id);
  const runtimeIds = listRuntimeStates(rootDir)
    .map(({ state }) => state.work_item_id)
    .filter((id) => /^\d{2}-/.test(id));
  const workItemIds = [...new Set([...runtimeIds, ...trackedProductIds])];
  const results = [];

  for (const workItemId of workItemIds) {
    const runtimeState = readRuntimeState({
      rootDir,
      workItemId,
    }).state;
    const invariant = evaluateBookkeepingInvariant({
      rootDir,
      workItemId,
      slice: runtimeState.slice ?? workItemId,
      runtimeState,
    });
    const errors = [];

    if (invariant.outcome === "repairable_post_merge") {
      for (const issue of invariant.issues) {
        if (issue.kind === "roadmap_status") {
          errors.push({
            path: invariant.docs.roadmap.filePath,
            message: `Merged/runtime-done slice '${workItemId}' must be marked '${issue.expected}' in docs/workpacks/README.md.`,
          });
        }

        if (issue.kind === "design_status") {
          errors.push({
            path: invariant.docs.design.filePath,
            message: `Slice '${workItemId}' requires Design Status '${issue.expected}' after Stage 5/merge.`,
          });
        }
      }
    }

    if (invariant.outcome === "repairable_pre_merge") {
      for (const issue of invariant.issues) {
        if (issue.kind === "design_status") {
          errors.push({
            path: invariant.docs.design.filePath,
            message: `Slice '${workItemId}' requires Design Status '${issue.expected}' before final review handoff.`,
          });
        }

        if (
          issue.kind === "roadmap_status" &&
          issue.expected === "merged" &&
          runtimeState?.phase === "merge_pending"
        ) {
          errors.push({
            path: invariant.docs.roadmap.filePath,
            message: `Slice '${workItemId}' must update docs/workpacks/README.md to '${issue.expected}' before autonomous Stage 6 merge.`,
          });
        }
      }
    }

    if (invariant.outcome === "ambiguous_drift") {
      errors.push({
        path: invariant.docs.roadmap.filePath ?? `.workflow-v2/work-items/${workItemId}.json`,
        message: `Bookkeeping drift is ambiguous for '${workItemId}': ${invariant.reason ?? "unknown"}.`,
      });
    }

    if (errors.length > 0) {
      results.push({
        name: `omo-bookkeeping:${workItemId}`,
        errors,
      });
    }
  }

  const closeoutErrors = validateCloseoutBranchDiff({
    rootDir,
    env,
  });
  if (closeoutErrors.length > 0) {
    results.push({
      name: "omo-bookkeeping:closeout-branch",
      errors: closeoutErrors,
    });
  }

  return results;
}
