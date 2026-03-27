import { spawnSync } from "node:child_process";

import { findInvalidWorkflowV2Refs } from "./git-policy.mjs";

function ensureNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function parsePullRequestUrl(url) {
  const normalizedUrl = ensureNonEmptyString(url, "url");
  const match = normalizedUrl.match(/\/pull\/(\d+)(?:\/?|$)/);
  if (!match) {
    throw new Error(`Unable to parse pull request number from ${normalizedUrl}`);
  }

  return {
    url: normalizedUrl,
    number: Number(match[1]),
  };
}

function tryParsePullRequestUrl(text) {
  if (typeof text !== "string" || text.trim().length === 0) {
    return null;
  }

  const match = text.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/);
  if (!match) {
    return null;
  }

  return parsePullRequestUrl(match[0]);
}

function normalizePullRequestBody(body, workItemId) {
  const normalizedBody = ensureNonEmptyString(body, "body");
  const normalizedWorkItemId =
    typeof workItemId === "string" && workItemId.trim().length > 0 ? workItemId.trim() : null;

  if (!normalizedWorkItemId) {
    return normalizedBody;
  }

  const invalidRefs = findInvalidWorkflowV2Refs(normalizedBody);
  if (invalidRefs.length === 0) {
    return normalizedBody;
  }

  const workflowRefPath = `.workflow-v2/work-items/${normalizedWorkItemId}.json`;

  return normalizedBody.replace(
    /^-\s+workflow v2 work item:\s*(.+)$/gim,
    `- workflow v2 work item: \`${workflowRefPath}\``,
  );
}

function summarizeChecks(checks) {
  const buckets = checks.map((check) => check.bucket ?? "pass");

  if (buckets.some((bucket) => bucket === "fail" || bucket === "cancel")) {
    return "fail";
  }

  if (buckets.some((bucket) => bucket === "pending")) {
    return "pending";
  }

  return "pass";
}

function summarizeMergeState(summary) {
  if (typeof summary !== "object" || summary === null) {
    return {
      state: null,
      mergedAt: null,
      mergeStateStatus: null,
    };
  }

  return {
    state: typeof summary.state === "string" ? summary.state : null,
    mergedAt: typeof summary.mergedAt === "string" && summary.mergedAt.trim().length > 0 ? summary.mergedAt : null,
    mergeStateStatus:
      typeof summary.mergeStateStatus === "string" ? summary.mergeStateStatus : null,
  };
}

/**
 * @param {{ rootDir?: string, ghBin?: string, environment?: Record<string, string> }} [options]
 */
export function createGithubAutomationClient({
  rootDir = process.cwd(),
  ghBin = "gh",
  environment,
} = {}) {
  function runGh(args, { allowPendingExit = false } = {}) {
    const result = spawnSync(ghBin, args, {
      cwd: rootDir,
      env: {
        ...process.env,
        ...(environment ?? {}),
      },
      encoding: "utf8",
    });

    if (result.status === 0 || (allowPendingExit && result.status === 8)) {
      return (result.stdout ?? "").trim();
    }

    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
    throw new Error(stderr.length > 0 ? stderr : `gh ${args.join(" ")} failed.`);
  }

  function getPullRequestMergeSummary(prRef) {
    const stdout = runGh([
      "pr",
      "view",
      ensureNonEmptyString(prRef, "prRef"),
      "--json",
      "state,mergedAt,mergeStateStatus",
    ]);

    return summarizeMergeState(stdout.length > 0 ? JSON.parse(stdout) : null);
  }

  return {
    assertAuth() {
      runGh(["auth", "status"]);
    },
    createPullRequest({
      base,
      head,
      title,
      body,
      draft,
      workItemId,
    } = {}) {
      const normalizedHead = ensureNonEmptyString(head, "head");
      const args = [
        "pr",
        "create",
        "--base",
        ensureNonEmptyString(base, "base"),
        "--head",
        normalizedHead,
        "--title",
        ensureNonEmptyString(title, "title"),
        "--body",
        normalizePullRequestBody(body, workItemId),
      ];

      if (draft) {
        args.push("--draft");
      }

      let parsed;

      try {
        parsed = parsePullRequestUrl(runGh(args));
      } catch (error) {
        if (error instanceof Error && /already exists/i.test(error.message)) {
          parsed =
            tryParsePullRequestUrl(error.message) ??
            (() => {
              const existingStdout = runGh([
                "pr",
                "list",
                "--head",
                normalizedHead,
                "--json",
                "number,url,isDraft",
              ]);
              const existingPullRequests = existingStdout.length > 0 ? JSON.parse(existingStdout) : [];
              const existingPullRequest = existingPullRequests[0];

              if (!existingPullRequest?.url || !existingPullRequest?.number) {
                throw error;
              }

              return {
                url: existingPullRequest.url,
                number: Number(existingPullRequest.number),
                draft: Boolean(existingPullRequest.isDraft),
              };
            })();
        } else {
          throw error;
        }
      }

      return {
        ...parsed,
        draft: typeof parsed.draft === "boolean" ? parsed.draft : Boolean(draft),
      };
    },
    getRequiredChecks({
      prRef,
    }) {
      let stdout;
      try {
        stdout = runGh(
          [
            "pr",
            "checks",
            ensureNonEmptyString(prRef, "prRef"),
            "--required",
            "--json",
            "bucket,name,state,workflow,link",
          ],
          { allowPendingExit: true },
        );
      } catch (error) {
        if (
          error instanceof Error &&
          /no required checks reported/i.test(error.message)
        ) {
          const fallbackStdout = runGh([
            "pr",
            "checks",
            ensureNonEmptyString(prRef, "prRef"),
            "--json",
            "bucket,name,state,workflow,link",
          ]);
          const fallbackChecks = fallbackStdout.length > 0 ? JSON.parse(fallbackStdout) : [];

          return {
            bucket: fallbackChecks.length > 0 ? summarizeChecks(fallbackChecks) : "pending",
            checks: fallbackChecks,
          };
        }

        throw error;
      }
      const checks = stdout.length > 0 ? JSON.parse(stdout) : [];

      return {
        bucket: summarizeChecks(checks),
        checks,
      };
    },
    markReady({
      prRef,
    }) {
      runGh(["pr", "ready", ensureNonEmptyString(prRef, "prRef")]);
    },
    reviewPullRequest({
      prRef,
      decision,
      body,
    }) {
      const normalizedDecision = ensureNonEmptyString(decision, "decision");
      const decisionFlag =
        normalizedDecision === "approve" ? "--approve" : "--request-changes";
      runGh([
        "pr",
        "review",
        ensureNonEmptyString(prRef, "prRef"),
        decisionFlag,
        "--body",
        ensureNonEmptyString(body, "body"),
      ]);
    },
    commentPullRequest({
      prRef,
      body,
    }) {
      runGh([
        "pr",
        "comment",
        ensureNonEmptyString(prRef, "prRef"),
        "--body",
        ensureNonEmptyString(body, "body"),
      ]);
    },
    mergePullRequest({
      prRef,
      headSha,
    }) {
      const normalizedPrRef = ensureNonEmptyString(prRef, "prRef");
      runGh([
        "pr",
        "merge",
        normalizedPrRef,
        "--merge",
        "--match-head-commit",
        ensureNonEmptyString(headSha, "headSha"),
      ]);

      const mergeSummary = getPullRequestMergeSummary(normalizedPrRef);
      if (!mergeSummary.mergedAt) {
        throw new Error(
          `Pull request merge did not complete. state=${mergeSummary.state ?? "unknown"} mergeStateStatus=${mergeSummary.mergeStateStatus ?? "unknown"}`,
        );
      }

      return {
        merged: true,
      };
    },
    updateBranch({
      prRef,
    }) {
      runGh(["pr", "update-branch", ensureNonEmptyString(prRef, "prRef")]);
    },
  };
}
