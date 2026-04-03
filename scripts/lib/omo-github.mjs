import { spawnSync } from "node:child_process";

import {
  REQUIRED_PR_SECTIONS,
  findEmptyPrSections,
  findInvalidWorkflowV2Refs,
  findMissingPrSections,
} from "./git-policy.mjs";

function ensureNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function parsePullRequestUrl(url) {
  const normalizedUrl = ensureNonEmptyString(url, "url");
  const match = normalizedUrl.match(/https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/?|$)/);
  if (!match) {
    throw new Error(`Unable to parse pull request number from ${normalizedUrl}`);
  }

  return {
    url: normalizedUrl,
    owner: match[1],
    repo: match[2],
    number: Number(match[3]),
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

function extractSectionContent(body, section) {
  const start = body.indexOf(section);
  if (start === -1) {
    return null;
  }

  const afterHeader = body.slice(start + section.length);
  const nextSectionStart =
    REQUIRED_PR_SECTIONS.map((candidate) => afterHeader.indexOf(candidate))
      .filter((index) => index > 0)
      .sort((left, right) => left - right)[0] ?? afterHeader.length;
  const sectionContent = afterHeader.slice(0, nextSectionStart).trim();

  return sectionContent.length > 0 ? sectionContent : null;
}

function buildDefaultPrSectionContent(section, { body, workItemId }) {
  const workflowRefPath =
    typeof workItemId === "string" && workItemId.trim().length > 0
      ? `.workflow-v2/work-items/${workItemId.trim()}.json`
      : "N/A";

  switch (section) {
    case "## Summary":
      return body.includes("## ")
        ? "- Supervisor가 생성한 변경 요약입니다."
        : body;
    case "## Workpack / Slice":
      return `- workflow v2 work item: \`${workflowRefPath}\``;
    case "## Test Plan":
      return "- Supervisor 검증 명령과 필수 CI 체크를 기준으로 확인";
    case "## Docs Impact":
      return "- 자동 보정: 문서 영향 분석이 stage result에 없어 수동 확인이 필요합니다.";
    case "## Merge Gate":
      return "- current head SHA: 수동 확인 필요\n- started PR checks: 수동 확인 필요\n- all checks completed green: 아니오 (확인 필요)\n- pending / failed / rerun checks: 수동 확인 필요";
    case "## Security Review":
      return "- 자동 보정: 보안 영향 분석이 stage result에 없어 수동 확인이 필요합니다.";
    case "## Performance":
      return "- 자동 보정: 성능 영향 분석이 stage result에 없어 수동 확인이 필요합니다.";
    case "## Design / Accessibility":
      return "- 자동 보정: 디자인/접근성 영향 분석이 stage result에 없어 수동 확인이 필요합니다.";
    case "## Breaking Changes":
      return "- 자동 보정: breaking change 여부를 수동 확인해 주세요.";
    default:
      return "- 해당 없음";
  }
}

function normalizePullRequestBody(body, workItemId) {
  const normalizedBody = ensureNonEmptyString(body, "body");
  const normalizedWorkItemId =
    typeof workItemId === "string" && workItemId.trim().length > 0 ? workItemId.trim() : null;
  const workflowRefPath = normalizedWorkItemId
    ? `.workflow-v2/work-items/${normalizedWorkItemId}.json`
    : "N/A";
  const refNormalizedBody = normalizedBody.replace(
    /^-\s+workflow v2 work item:\s*(.+)$/gim,
    `- workflow v2 work item: \`${workflowRefPath}\``,
  );
  const missingSections = new Set(findMissingPrSections(refNormalizedBody));
  const emptySections = new Set(findEmptyPrSections(refNormalizedBody));

  if (missingSections.size === 0 && emptySections.size === 0) {
    return findInvalidWorkflowV2Refs(refNormalizedBody).length === 0
      ? refNormalizedBody
      : refNormalizedBody.replace(
          /^-\s+workflow v2 work item:\s*(.+)$/gim,
          `- workflow v2 work item: \`${workflowRefPath}\``,
        );
  }

  return REQUIRED_PR_SECTIONS.map((section) => {
    const existingContent =
      !missingSections.has(section) && !emptySections.has(section)
        ? extractSectionContent(refNormalizedBody, section)
        : null;
    const content =
      existingContent ??
      buildDefaultPrSectionContent(section, {
        body: refNormalizedBody,
        workItemId: normalizedWorkItemId,
      });

    return `${section}\n${content}`;
  }).join("\n\n");
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

function normalizeCheckLabel(value) {
  return typeof value === "string" ? value.trim() : "";
}

function createCheckKey(check) {
  const name = normalizeCheckLabel(check?.name);
  if (name.length === 0) {
    return "";
  }

  const workflow = normalizeCheckLabel(check?.workflow ?? check?.workflowName);
  return `${workflow.toLowerCase()}::${name.toLowerCase()}`;
}

function hasDuplicateCheckKeys(checks) {
  const seen = new Set();
  for (const check of checks) {
    const key = createCheckKey(check);
    if (key.length === 0) {
      continue;
    }
    if (seen.has(key)) {
      return true;
    }
    seen.add(key);
  }
  return false;
}

function parseCheckTimestamp(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return 0;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function bucketPriority(bucket) {
  switch (bucket) {
    case "pending":
      return 4;
    case "pass":
      return 3;
    case "fail":
      return 2;
    case "cancel":
      return 1;
    default:
      return 0;
  }
}

function chooseMoreRecentCheck(current, candidate) {
  if (!current) {
    return candidate;
  }

  if ((candidate._sortTimestamp ?? 0) > (current._sortTimestamp ?? 0)) {
    return candidate;
  }

  if ((candidate._sortTimestamp ?? 0) < (current._sortTimestamp ?? 0)) {
    return current;
  }

  return bucketPriority(candidate.bucket) >= bucketPriority(current.bucket) ? candidate : current;
}

function normalizeStatusRollupBucket(entry) {
  const status = normalizeCheckLabel(entry?.status).toUpperCase();
  if (status !== "COMPLETED") {
    return "pending";
  }

  const conclusion = normalizeCheckLabel(entry?.conclusion).toUpperCase();
  switch (conclusion) {
    case "SUCCESS":
    case "NEUTRAL":
    case "SKIPPED":
      return "pass";
    case "CANCELLED":
      return "cancel";
    default:
      return "fail";
  }
}

function normalizeStatusRollupEntry(entry) {
  const name = normalizeCheckLabel(entry?.name);
  if (name.length === 0) {
    return null;
  }

  return {
    name,
    workflow: normalizeCheckLabel(entry?.workflowName),
    link:
      normalizeCheckLabel(entry?.detailsUrl) ||
      normalizeCheckLabel(entry?.targetUrl) ||
      null,
    bucket: normalizeStatusRollupBucket(entry),
    state: normalizeCheckLabel(entry?.conclusion) || normalizeCheckLabel(entry?.status) || "UNKNOWN",
    _sortTimestamp: Math.max(
      parseCheckTimestamp(entry?.startedAt),
      parseCheckTimestamp(entry?.completedAt),
    ),
  };
}

function summarizeCheckGroup(checks) {
  const buckets = checks.map((check) => check.bucket ?? "pass");
  if (buckets.includes("pending")) {
    return "pending";
  }
  if (buckets.includes("fail")) {
    return "fail";
  }
  if (buckets.includes("cancel")) {
    return "cancel";
  }
  return "pass";
}

function reconcileChecksWithStatusRollup(checks, statusCheckRollup) {
  const groupedChecks = new Map();
  for (const check of checks) {
    const key = createCheckKey(check);
    if (key.length === 0) {
      continue;
    }
    const existing = groupedChecks.get(key) ?? [];
    existing.push(check);
    groupedChecks.set(key, existing);
  }

  const latestRollupByKey = new Map();
  for (const entry of statusCheckRollup ?? []) {
    const normalized = normalizeStatusRollupEntry(entry);
    if (!normalized) {
      continue;
    }
    const key = createCheckKey(normalized);
    if (!groupedChecks.has(key)) {
      continue;
    }
    latestRollupByKey.set(key, chooseMoreRecentCheck(latestRollupByKey.get(key), normalized));
  }

  return Array.from(groupedChecks.entries()).map(([key, group]) => {
    const latest = latestRollupByKey.get(key);
    if (latest) {
      return {
        name: latest.name,
        workflow: latest.workflow,
        link: latest.link,
        bucket: latest.bucket,
        state: latest.state,
      };
    }

    const representative = group[0];
    return {
      name: representative.name,
      workflow: representative.workflow ?? null,
      link: representative.link ?? null,
      bucket: summarizeCheckGroup(group),
      state: representative.state ?? "UNKNOWN",
    };
  });
}

function summarizeMergeState(summary) {
  if (typeof summary !== "object" || summary === null) {
    return {
      state: null,
      mergedAt: null,
      mergeStateStatus: null,
      reviewDecision: null,
    };
  }

  return {
    state: typeof summary.state === "string" ? summary.state : null,
    mergedAt: typeof summary.mergedAt === "string" && summary.mergedAt.trim().length > 0 ? summary.mergedAt : null,
    mergeStateStatus:
      typeof summary.mergeStateStatus === "string" ? summary.mergeStateStatus : null,
    reviewDecision:
      typeof summary.reviewDecision === "string" && summary.reviewDecision.trim().length > 0
        ? summary.reviewDecision
        : null,
  };
}

function summarizeApprovalRequirement(data) {
  const reviewPolicy = data?.required_pull_request_reviews;
  const count = Number(reviewPolicy?.required_approving_review_count ?? 0);
  return {
    required: Number.isInteger(count) && count > 0,
    requiredApprovingReviewCount: Number.isInteger(count) && count > 0 ? count : 0,
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
      "state,mergedAt,mergeStateStatus,reviewDecision",
    ]);

    return summarizeMergeState(stdout.length > 0 ? JSON.parse(stdout) : null);
  }

  function getPullRequestStatusRollup(prRef) {
    const stdout = runGh([
      "pr",
      "view",
      ensureNonEmptyString(prRef, "prRef"),
      "--json",
      "statusCheckRollup",
    ]);
    const parsed = stdout.length > 0 ? JSON.parse(stdout) : null;
    return Array.isArray(parsed?.statusCheckRollup) ? parsed.statusCheckRollup : [];
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
      const normalizedBody = normalizePullRequestBody(body, workItemId);

      try {
        args[args.indexOf("--body") + 1] = normalizedBody;
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
          runGh([
            "pr",
            "edit",
            ensureNonEmptyString(parsed.url, "parsed.url"),
            "--title",
            ensureNonEmptyString(title, "title"),
            "--body",
            normalizedBody,
          ]);
        } else {
          throw error;
        }
      }

      return {
        ...parsed,
        draft: typeof parsed.draft === "boolean" ? parsed.draft : Boolean(draft),
      };
    },
    editPullRequest({
      prRef,
      title,
      body,
      workItemId,
    } = {}) {
      runGh([
        "pr",
        "edit",
        ensureNonEmptyString(prRef, "prRef"),
        "--title",
        ensureNonEmptyString(title, "title"),
        "--body",
        normalizePullRequestBody(body, workItemId),
      ]);
    },
    getRequiredChecks({
      prRef,
    }) {
      const normalizedPrRef = ensureNonEmptyString(prRef, "prRef");
      const stdout = runGh(
        [
          "pr",
          "checks",
          normalizedPrRef,
          "--json",
          "bucket,name,state,workflow,link",
        ],
        { allowPendingExit: true },
      );
      const checks = stdout.length > 0 ? JSON.parse(stdout) : [];
      // Legacy method name: merge gate now waits for every check that started on the PR head,
      // not only GitHub-required checks.
      const shouldReconcile =
        summarizeChecks(checks) !== "pass" || hasDuplicateCheckKeys(checks);
      const reconciledChecks = shouldReconcile
        ? reconcileChecksWithStatusRollup(checks, getPullRequestStatusRollup(normalizedPrRef))
        : checks;

      return {
        bucket: reconciledChecks.length > 0 ? summarizeChecks(reconciledChecks) : "pending",
        checks: reconciledChecks,
      };
    },
    getPullRequestSummary({
      prRef,
    }) {
      return getPullRequestMergeSummary(ensureNonEmptyString(prRef, "prRef"));
    },
    getApprovalRequirement({
      prRef,
      baseBranch = "master",
    }) {
      const parsed = parsePullRequestUrl(ensureNonEmptyString(prRef, "prRef"));
      try {
        const stdout = runGh([
          "api",
          `repos/${parsed.owner}/${parsed.repo}/branches/${ensureNonEmptyString(baseBranch, "baseBranch")}/protection`,
        ]);
        return {
          ...summarizeApprovalRequirement(stdout.length > 0 ? JSON.parse(stdout) : null),
          source: "branch-protection",
        };
      } catch (error) {
        if (error instanceof Error && /404|Branch not protected/i.test(error.message)) {
          return {
            required: false,
            requiredApprovingReviewCount: 0,
            source: "unprotected",
          };
        }

        throw error;
      }
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
