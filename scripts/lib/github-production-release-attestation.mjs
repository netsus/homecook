import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import {
  CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
  CANONICAL_GITHUB_PRODUCTION_RELEASE_SIGNER_WORKFLOW,
  CANONICAL_GITHUB_PRODUCTION_RELEASE_SOURCE_REF,
  EXPECTED_RELEASE_CONTEXTS,
  GITHUB_ACTIONS_APP_INTEGRATION_ID,
  normalizeExpectedReleaseContexts,
  validateProductionReleaseTag,
} from "./production-release-approval-policy.mjs";
import {
  REHEARSAL_SELECTION_AUTHORITY_KEYS,
  validateRehearsalSelectionAuthority,
} from "./local-mac-production-rehearsal-selection.mjs";

export {
  CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
  CANONICAL_GITHUB_PRODUCTION_RELEASE_SIGNER_WORKFLOW,
  CANONICAL_GITHUB_PRODUCTION_RELEASE_SOURCE_REF,
  GITHUB_ACTIONS_APP_INTEGRATION_ID,
  buildProductionReleaseAnnotatedTagMessage,
} from "./production-release-approval-policy.mjs";

export const GITHUB_PRODUCTION_RELEASE_SUBJECT_SCHEMA =
  "homecook.github.production-release-manifest.v1";
export const GITHUB_PRODUCTION_RELEASE_PREDICATE_SCHEMA =
  "homecook.github.production-release-predicate.v1";
export const GITHUB_PRODUCTION_RELEASE_PREDICATE_TYPE =
  "https://github.com/netsus/homecook/attestations/production-release/v1";
export const GITHUB_PRODUCTION_RELEASE_SUBJECT_SCHEMA_V3 =
  "homecook.github.production-release-manifest.v3";
export const GITHUB_PRODUCTION_RELEASE_PREDICATE_SCHEMA_V3 =
  "homecook.github.production-release-predicate.v3";
export const GITHUB_PRODUCTION_RELEASE_PREDICATE_TYPE_V3 =
  "https://github.com/netsus/homecook/attestations/production-release/v3";
export const GITHUB_CLI_TRUSTED_ROOT_SHA256 =
  "65ca537f6ed8a47fd0e560c421baa1f6c1efb8b25fc200d8c5c02c0e92eb2b9c";

const SHA1_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const REPEATABILITY_SCHEMA = "homecook.local-mac-production-rehearsal-repeatability-receipt.v1";
const REHEARSAL_AUTHORITY_KEYS = [
  "rehearsal_receipt_schema", ...REHEARSAL_SELECTION_AUTHORITY_KEYS,
  "build_id", "sealed_bundle_digest",
  "repeatability_receipt_digest", "rehearsal_receipt_valid_until",
];
const CANONICAL_WORKFLOW_PATH = ".github/workflows/production-release-attestation.yml";
const WORKFLOW_AUTHORITY_KEYS = [
  "workflow_head_sha", "workflow_head_tree", "workflow_run_id",
  "workflow_run_attempt", "workflow_check_suite_id",
];
const APPROVAL_AUTHORITY_KEYS = [
  "master_sha_at_approval", "master_tree_at_approval",
];
const EXTERNAL_CHECK_EVIDENCE_KEYS = [
  "all_check_suite_count", "all_check_suite_ids_digest", "all_check_suite_authority_digest",
  "all_actions_workflow_run_provenance_digest",
  "all_context_check_run_instances_digest", "all_context_check_suite_ids",
  "all_context_commit_statuses_digest",
];
const GITHUB_CHECK_SUITE_TRUNCATION_BOUNDARY = 1_000;
const GITHUB_WORKFLOW_RUN_TRUNCATION_BOUNDARY = 1_000;
const GITHUB_CHECKS_PAGE_SIZE = 100;
export const GITHUB_PRODUCTION_RELEASE_GITGUARDIAN_CHECK = Object.freeze({
  appId: 46_505,
  appName: "GitGuardian",
  appSlug: "gitguardian",
  checkName: "GitGuardian Security Checks",
  externalId: "",
});
const GITHUB_PRODUCTION_RELEASE_ZERO_CHECK_EXTERNAL_SUITES = Object.freeze([
  Object.freeze({ appId: 8_329, appName: "Vercel", appSlug: "vercel" }),
  Object.freeze({ appId: 13_473, appName: "Netlify", appSlug: "netlify" }),
  Object.freeze({ appId: 46_505, appName: "GitGuardian", appSlug: "gitguardian" }),
  Object.freeze({ appId: 1_236_702, appName: "Claude", appSlug: "claude" }),
]);
const SUBJECT_BASE_KEYS = [
  "schema", "repository", "source_ref", "signer_workflow", "signer_digest",
  "expected_release_integration_id", "release_tag", "release_tag_object_sha",
  "release_sha", "release_tree", "expected_release_contexts", "required_check_summary",
];

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function requireSha1(value, label) {
  const normalized = requireNonEmptyString(value, label);
  if (!SHA1_PATTERN.test(normalized)) {
    throw new Error(`${label} must be a 40-character lowercase SHA.`);
  }
  return normalized;
}

function requireSha256(value, label) {
  const normalized = requireNonEmptyString(value, label);
  if (!SHA256_PATTERN.test(normalized)) {
    throw new Error(`${label} must be a 64-character lowercase digest.`);
  }
  return normalized;
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return value;
}

function requireCompleteCheckSuiteCount(value, label) {
  const count = requirePositiveInteger(value, label);
  if (count >= GITHUB_CHECK_SUITE_TRUNCATION_BOUNDARY) {
    throw new Error(`${label} must be below the GitHub check-suite truncation boundary.`);
  }
  return count;
}

function requireExactKeys(value, expectedKeys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} must use the exact closed field set.`);
  }
}

function normalizeRehearsalAuthority(value, label = "rehearsalAuthority") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const actualKeys = Object.keys(value).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify([...REHEARSAL_AUTHORITY_KEYS].sort())) {
    throw new Error(`${label} must use the exact closed rehearsal authority fields.`);
  }
  if (value.rehearsal_receipt_schema !== REPEATABILITY_SCHEMA) {
    throw new Error(`${label}.rehearsal_receipt_schema is invalid.`);
  }
  const selectionAuthority = validateRehearsalSelectionAuthority(Object.fromEntries(
    REHEARSAL_SELECTION_AUTHORITY_KEYS.map((key) => [key, value[key]]),
  ));
  const validUntil = requireNonEmptyString(
    value.rehearsal_receipt_valid_until,
    `${label}.rehearsal_receipt_valid_until`,
  );
  const validUntilMs = Date.parse(validUntil);
  if (!Number.isFinite(validUntilMs) || new Date(validUntilMs).toISOString() !== validUntil) {
    throw new Error(`${label}.rehearsal_receipt_valid_until must be exact UTC millisecond RFC3339.`);
  }
  return Object.freeze({
    rehearsal_receipt_schema: REPEATABILITY_SCHEMA,
    ...selectionAuthority,
    build_id: requireNonEmptyString(value.build_id, `${label}.build_id`),
    sealed_bundle_digest: requireSha256(value.sealed_bundle_digest, `${label}.sealed_bundle_digest`),
    repeatability_receipt_digest: requireSha256(
      value.repeatability_receipt_digest,
      `${label}.repeatability_receipt_digest`,
    ),
    rehearsal_receipt_valid_until: validUntil,
  });
}

function normalizeWorkflowAuthority(value, label = "workflowAuthority") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  requireExactKeys(value, WORKFLOW_AUTHORITY_KEYS, label);
  const workflowRunAttempt = requirePositiveInteger(
    value.workflow_run_attempt,
    `${label}.workflow_run_attempt`,
  );
  if (workflowRunAttempt !== 1) {
    throw new Error(`${label}.workflow_run_attempt must be exactly 1.`);
  }
  return Object.freeze({
    workflow_head_sha: requireSha1(value.workflow_head_sha, `${label}.workflow_head_sha`),
    workflow_head_tree: requireSha1(value.workflow_head_tree, `${label}.workflow_head_tree`),
    workflow_run_id: requirePositiveInteger(value.workflow_run_id, `${label}.workflow_run_id`),
    workflow_run_attempt: workflowRunAttempt,
    workflow_check_suite_id: requirePositiveInteger(
      value.workflow_check_suite_id,
      `${label}.workflow_check_suite_id`,
    ),
  });
}

function normalizeApprovalAuthority(value, label = "approvalAuthority") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  requireExactKeys(value, APPROVAL_AUTHORITY_KEYS, label);
  return Object.freeze({
    master_sha_at_approval: requireSha1(
      value.master_sha_at_approval,
      `${label}.master_sha_at_approval`,
    ),
    master_tree_at_approval: requireSha1(
      value.master_tree_at_approval,
      `${label}.master_tree_at_approval`,
    ),
  });
}

function normalizeCheckSuiteIds(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a nonempty array.`);
  }
  const normalized = value.map((entry, index) =>
    requirePositiveInteger(entry, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${label} must contain unique IDs.`);
  }
  return [...normalized].sort((left, right) => left - right);
}

function normalizeExternalCheckEvidence(value, label = "externalCheckEvidence") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  requireExactKeys(value, EXTERNAL_CHECK_EVIDENCE_KEYS, label);
  return Object.freeze({
    all_check_suite_count: requireCompleteCheckSuiteCount(
      value.all_check_suite_count,
      `${label}.all_check_suite_count`,
    ),
    all_check_suite_ids_digest: requireSha256(
      value.all_check_suite_ids_digest,
      `${label}.all_check_suite_ids_digest`,
    ),
    all_check_suite_authority_digest: requireSha256(
      value.all_check_suite_authority_digest,
      `${label}.all_check_suite_authority_digest`,
    ),
    all_actions_workflow_run_provenance_digest: requireSha256(
      value.all_actions_workflow_run_provenance_digest,
      `${label}.all_actions_workflow_run_provenance_digest`,
    ),
    all_context_check_run_instances_digest: requireSha256(
      value.all_context_check_run_instances_digest,
      `${label}.all_context_check_run_instances_digest`,
    ),
    all_context_check_suite_ids: normalizeCheckSuiteIds(
      value.all_context_check_suite_ids,
      `${label}.all_context_check_suite_ids`,
    ),
    all_context_commit_statuses_digest: requireSha256(
      value.all_context_commit_statuses_digest,
      `${label}.all_context_commit_statuses_digest`,
    ),
  });
}

function requireAbsoluteExistingPath(value, label) {
  const normalized = resolve(requireNonEmptyString(value, label));
  if (!existsSync(normalized)) {
    throw new Error(`${label} is required for offline verification: ${normalized}`);
  }
  return normalized;
}

function readJson(path, label, readFile = readFileSync) {
  try {
    return JSON.parse(readFile(path, "utf8"));
  } catch {
    throw new Error(`${label} is unreadable or invalid JSON: ${path}`);
  }
}

function defaultSha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function requireCheckSummary(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  const summary = {
    total: Number(value.total),
    success: Number(value.success),
    intended_skip: Number(value.intended_skip),
    bad: Number(value.bad ?? 0),
    cancelled: Number(value.cancelled ?? 0),
    failed: Number(value.failed ?? 0),
    pending: Number(value.pending ?? 0),
    queued: Number(value.queued ?? 0),
    rerun: Number(value.rerun ?? 0),
  };

  for (const [key, count] of Object.entries(summary)) {
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(`${label}.${key} must be an integer >= 0.`);
    }
  }

  if (summary.total !== summary.success + summary.intended_skip) {
    throw new Error(`${label} total must equal success + intended_skip exactly.`);
  }
  if (summary.success < EXPECTED_RELEASE_CONTEXTS.length) {
    throw new Error(`${label} must preserve success for all expected release contexts.`);
  }

  return summary;
}

function requireCommitStatuses(commitStatuses, label) {
  if (!Array.isArray(commitStatuses)) {
    throw new Error(`${label} must be an array.`);
  }
  return commitStatuses;
}

function requireCanonicalString(value, canonical, label) {
  const normalized = value === undefined || value === null
    ? canonical
    : requireNonEmptyString(value, label);
  if (normalized !== canonical) {
    throw new Error(`${label} must be the canonical value ${canonical}.`);
  }
  return canonical;
}

function normalizeExcludedCheckSuiteIds(value) {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error("excludedCheckSuiteIds must be an array.");
  }
  const normalized = value.map((entry, index) => {
    if (!Number.isSafeInteger(entry) || entry <= 0) {
      throw new Error(`excludedCheckSuiteIds[${index}] must be a positive integer.`);
    }
    return entry;
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("excludedCheckSuiteIds must contain unique IDs.");
  }
  return [...normalized].sort((left, right) => left - right);
}

function sameCheckSummary(left, right) {
  const leftSummary = requireCheckSummary(left, "leftCheckSummary");
  const rightSummary = requireCheckSummary(right, "rightCheckSummary");
  return Object.keys(leftSummary).every(
    (key) => leftSummary[key] === rightSummary[key],
  );
}

function contextKey(value, label) {
  return requireNonEmptyString(value, label).toLowerCase();
}

export function buildGitHubProductionReleaseWorkflowEvidence({
  releaseSha,
  repository,
  run,
  runAttempt,
  runId,
  sourceRef,
  workflowHeadSha,
  workflowHeadTree,
  workflowId,
  workflowPath,
} = {}) {
  const normalizedRepository = requireCanonicalString(
    repository,
    CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
    "repository",
  );
  const normalizedSourceRef = requireCanonicalString(
    sourceRef,
    CANONICAL_GITHUB_PRODUCTION_RELEASE_SOURCE_REF,
    "sourceRef",
  );
  const normalizedWorkflowPath = requireNonEmptyString(workflowPath, "workflowPath");
  if (normalizedWorkflowPath !== CANONICAL_WORKFLOW_PATH) {
    throw new Error(`workflowPath must be ${CANONICAL_WORKFLOW_PATH}.`);
  }
  if (!run || typeof run !== "object" || Array.isArray(run)) {
    throw new Error("Current workflow run evidence must be an object.");
  }
  const normalizedRunId = requirePositiveInteger(runId, "runId");
  const normalizedRunAttempt = requirePositiveInteger(runAttempt, "runAttempt");
  const normalizedWorkflowId = requirePositiveInteger(workflowId, "workflowId");
  const normalizedWorkflowHeadSha = requireSha1(workflowHeadSha, "workflowHeadSha");
  const normalizedWorkflowHeadTree = requireSha1(workflowHeadTree, "workflowHeadTree");
  const normalizedReleaseSha = requireSha1(releaseSha, "releaseSha");
  const expectedRun = {
    id: normalizedRunId,
    run_attempt: normalizedRunAttempt,
    workflow_id: normalizedWorkflowId,
    path: normalizedWorkflowPath,
    event: "workflow_dispatch",
    head_sha: normalizedWorkflowHeadSha,
    head_branch: normalizedSourceRef.replace(/^refs\/heads\//u, ""),
    head_repository: normalizedRepository,
    repository: normalizedRepository,
  };
  const actualRun = {
    id: run.id,
    run_attempt: run.run_attempt,
    workflow_id: run.workflow_id,
    path: run.path,
    event: run.event,
    head_sha: run.head_sha,
    head_branch: run.head_branch,
    head_repository: run.head_repository?.full_name,
    repository: run.repository?.full_name,
  };
  if (JSON.stringify(actualRun) !== JSON.stringify(expectedRun)) {
    throw new Error("Current workflow run identity/head/ref/repository/attempt is not exact.");
  }
  const workflowCheckSuiteId = requirePositiveInteger(
    run.check_suite_id,
    "run.check_suite_id",
  );
  const workflowAuthority = normalizeWorkflowAuthority({
    workflow_head_sha: normalizedWorkflowHeadSha,
    workflow_head_tree: normalizedWorkflowHeadTree,
    workflow_run_id: normalizedRunId,
    workflow_run_attempt: normalizedRunAttempt,
    workflow_check_suite_id: workflowCheckSuiteId,
  });

  return Object.freeze({
    workflow_authority: workflowAuthority,
    suite_exclusion: Object.freeze({
      schema: "homecook.github.production-release-suite-exclusions.v2",
      repository: normalizedRepository,
      source_ref: normalizedSourceRef,
      workflow_id: normalizedWorkflowId,
      workflow_path: normalizedWorkflowPath,
      event: "workflow_dispatch",
      release_sha: normalizedReleaseSha,
      workflow_head_sha: normalizedWorkflowHeadSha,
      workflow_run_id: normalizedRunId,
      workflow_run_attempt: normalizedRunAttempt,
      workflow_check_suite_id: workflowCheckSuiteId,
      check_suite_ids: normalizedReleaseSha === normalizedWorkflowHeadSha
        ? [workflowCheckSuiteId]
        : [],
    }),
  });
}

function sortTimestamp(entry) {
  const candidates = [
    entry.completed_at,
    entry.completedAt,
    entry.started_at,
    entry.startedAt,
  ]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));
  return candidates.length > 0 ? Math.max(...candidates) : 0;
}

function sortCommitStatusTimestamp(entry) {
  const candidates = [
    entry.updated_at,
    entry.created_at,
  ]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));
  return candidates.length > 0 ? Math.max(...candidates) : 0;
}

function normalizeBucket(entry) {
  const status = requireNonEmptyString(entry.status ?? "queued", "check.status").toLowerCase();
  if (status === "queued") {
    return "queued";
  }
  if (status !== "completed") {
    return "pending";
  }

  const conclusion = requireNonEmptyString(entry.conclusion ?? "failure", "check.conclusion").toLowerCase();
  if (["success"].includes(conclusion)) {
    return "success";
  }
  if (conclusion === "skipped") {
    return "intended_skip";
  }
  if (conclusion === "cancelled") {
    return "cancelled";
  }
  return "failed";
}

function normalizeCommitStatusBucket(entry) {
  const state = requireNonEmptyString(entry.state ?? "error", "commitStatus.state").toLowerCase();
  if (state === "success") {
    return "success";
  }
  if (state === "pending") {
    return "pending";
  }
  return "failed";
}

function normalizePaginatedGitHubChecksCollection({
  collectionKey,
  label,
  pages,
}) {
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new Error(`${label} must contain at least one GitHub API page.`);
  }

  let totalCount = null;
  const entries = [];
  for (const [pageIndex, page] of pages.entries()) {
    if (!page || typeof page !== "object" || Array.isArray(page)) {
      throw new Error(`${label}[${pageIndex}] must be an object.`);
    }
    const pageTotalCount = page.total_count;
    if (!Number.isSafeInteger(pageTotalCount) || pageTotalCount < 0) {
      throw new Error(`${label}[${pageIndex}].total_count must be a nonnegative safe integer.`);
    }
    if (totalCount === null) {
      totalCount = pageTotalCount;
    } else if (pageTotalCount !== totalCount) {
      throw new Error(`${label} pages must report one stable total_count.`);
    }
    if (!Array.isArray(page[collectionKey])) {
      throw new Error(`${label}[${pageIndex}].${collectionKey} must be an array.`);
    }
    entries.push(...page[collectionKey]);
  }

  const expectedPageCount = Math.max(1, Math.ceil(totalCount / GITHUB_CHECKS_PAGE_SIZE));
  if (pages.length !== expectedPageCount) {
    throw new Error(
      `${label} pagination is incomplete: expected ${expectedPageCount} pages for total_count ${totalCount}.`,
    );
  }
  for (const [pageIndex, page] of pages.entries()) {
    const remaining = Math.max(0, totalCount - pageIndex * GITHUB_CHECKS_PAGE_SIZE);
    const expectedLength = Math.min(GITHUB_CHECKS_PAGE_SIZE, remaining);
    if (page[collectionKey].length !== expectedLength) {
      throw new Error(
        `${label}[${pageIndex}] length does not match total_count pagination authority.`,
      );
    }
  }
  if (entries.length !== totalCount) {
    throw new Error(`${label} flattened count does not match total_count.`);
  }

  return { entries, totalCount };
}

export function buildGitHubProductionReleaseCheckSuiteAuthority({
  checkSuitePages,
  releaseSha,
} = {}) {
  const normalizedReleaseSha = requireSha1(releaseSha, "releaseSha");
  const { entries: checkSuites, totalCount } = normalizePaginatedGitHubChecksCollection({
    collectionKey: "check_suites",
    label: "checkSuitePages",
    pages: checkSuitePages,
  });
  if (totalCount >= GITHUB_CHECK_SUITE_TRUNCATION_BOUNDARY) {
    throw new Error(
      `Production release check-suite count reached the ${GITHUB_CHECK_SUITE_TRUNCATION_BOUNDARY} suite truncation boundary.`,
    );
  }
  if (totalCount === 0) {
    throw new Error("Production release check-suite authority must be nonempty.");
  }

  const sortedCheckSuites = normalizeGitHubProductionReleaseCheckSuiteAuthorityTuples({
    checkSuites,
    releaseSha: normalizedReleaseSha,
    label: "checkSuitePages entry",
  });
  const sortedSuiteIds = sortedCheckSuites.map((entry) => entry.id);

  return Object.freeze({
    all_check_suite_count: totalCount,
    all_check_suite_ids: Object.freeze(sortedSuiteIds),
    all_check_suite_ids_digest: createHash("sha256")
      .update(JSON.stringify(sortedSuiteIds))
      .digest("hex"),
    all_check_suite_authority_digest: createHash("sha256")
      .update(JSON.stringify(sortedCheckSuites))
      .digest("hex"),
    check_suite_app_ids: Object.freeze(Object.fromEntries(
      sortedCheckSuites.map((entry) => [entry.id, entry.app_id]),
    )),
    check_suite_metadata: Object.freeze(Object.fromEntries(
      sortedCheckSuites.map((entry) => [entry.id, entry]),
    )),
  });
}

/**
 * @param {{
 *   checkSuites?: Array<{
 *     id?: unknown,
 *     app_id?: unknown,
 *     app_name?: unknown,
 *     app_slug?: unknown,
 *     head_sha?: unknown,
 *     repository?: string | {full_name?: unknown},
 *     app?: {id?: unknown,name?: unknown,slug?: unknown},
 *   }>,
 *   releaseSha?: string,
 *   label?: string,
 * }} [options]
 */
export function normalizeGitHubProductionReleaseCheckSuiteAuthorityTuples({
  checkSuites,
  releaseSha,
  label = "checkSuites",
} = {}) {
  const normalizedReleaseSha = requireSha1(releaseSha, "releaseSha");
  if (!Array.isArray(checkSuites)) {
    throw new Error(`${label} must be an array.`);
  }
  const normalizedCheckSuites = checkSuites.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`${label} ${index} must be an object.`);
    }
    const usesStoredTuple = Object.hasOwn(entry, "app_id");
    if (usesStoredTuple) {
      requireExactKeys(entry, [
        "app_id", "app_name", "app_slug", "head_sha", "id", "repository",
      ], `${label} ${index}`);
    }
    const suiteId = requirePositiveInteger(entry.id, `${label} ${index}.id`);
    if (requireSha1(entry.head_sha, `${label} ${index}.head_sha`) !== normalizedReleaseSha) {
      throw new Error(`${label} ${index} does not belong to the selected release SHA.`);
    }
    const appId = requirePositiveInteger(
      entry.app_id ?? entry.app?.id,
      `${label} ${index}.app_id`,
    );
    const rawAppName = usesStoredTuple ? entry.app_name : entry.app?.name;
    const appName = requireNonEmptyString(
      rawAppName,
      `${label} ${index}.app_name`,
    );
    const rawAppSlug = usesStoredTuple ? entry.app_slug : entry.app?.slug;
    const appSlug = requireNonEmptyString(
      rawAppSlug,
      `${label} ${index}.app_slug`,
    );
    if (appName !== rawAppName || appSlug !== rawAppSlug) {
      throw new Error(`${label} ${index} App owner name/slug must be exact.`);
    }
    const repository = typeof entry.repository === "string"
      ? entry.repository
      : entry.repository?.full_name;
    if (repository !== CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY) {
      throw new Error(`${label} ${index} repository is not canonical.`);
    }
    return Object.freeze({
      app_id: appId,
      app_name: appName,
      app_slug: appSlug,
      head_sha: normalizedReleaseSha,
      id: suiteId,
      repository,
    });
  });
  const suiteIds = normalizedCheckSuites.map((entry) => entry.id);
  if (new Set(suiteIds).size !== suiteIds.length) {
    throw new Error(`${label} contains duplicate suite IDs.`);
  }
  return Object.freeze([...normalizedCheckSuites]
    .sort((left, right) => left.id - right.id));
}

function normalizeCompleteCheckRunPages({ checkRunPages, checkSuiteIdSet, releaseSha }) {
  const { entries: checkRuns } = normalizePaginatedGitHubChecksCollection({
    collectionKey: "check_runs",
    label: "checkRunPages",
    pages: checkRunPages,
  });
  const checkRunIds = new Set();
  for (const [index, entry] of checkRuns.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`checkRunPages entry ${index} must be an object.`);
    }
    const checkRunId = requirePositiveInteger(entry.id, `checkRunPages entry ${index}.id`);
    if (checkRunIds.has(checkRunId)) {
      throw new Error("Production release check-run pages contain duplicate check-run IDs.");
    }
    checkRunIds.add(checkRunId);
    const checkSuiteId = requirePositiveInteger(
      entry.check_suite?.id,
      `checkRunPages entry ${index}.check_suite.id`,
    );
    if (!checkSuiteIdSet.has(checkSuiteId)) {
      throw new Error("Production release check-run pages reference an unknown check-suite ID.");
    }
    if (requireSha1(entry.head_sha, `checkRunPages entry ${index}.head_sha`) !== releaseSha) {
      throw new Error(`checkRunPages entry ${index} does not belong to the selected release SHA.`);
    }
  }
  return checkRuns;
}

function normalizeWorkflowRunPages({
  checkSuiteAppIds,
  checkSuiteIdSet,
  excludedSuiteIdSet,
  releaseSha,
  workflowRunPages,
}) {
  const { entries: workflowRuns, totalCount } = normalizePaginatedGitHubChecksCollection({
    collectionKey: "workflow_runs",
    label: "workflowRunPages",
    pages: workflowRunPages,
  });
  if (totalCount >= GITHUB_WORKFLOW_RUN_TRUNCATION_BOUNDARY) {
    throw new Error(
      `Production release workflow-run count reached the ${GITHUB_WORKFLOW_RUN_TRUNCATION_BOUNDARY} result boundary.`,
    );
  }
  const runIds = new Set();
  const suiteIds = new Set();
  const pathsByWorkflowId = new Map();
  const normalized = [];
  for (const [index, entry] of workflowRuns.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`workflowRunPages entry ${index} must be an object.`);
    }
    const runId = requirePositiveInteger(entry.id, `workflowRunPages entry ${index}.id`);
    const workflowId = requirePositiveInteger(
      entry.workflow_id,
      `workflowRunPages entry ${index}.workflow_id`,
    );
    const checkSuiteId = requirePositiveInteger(
      entry.check_suite_id,
      `workflowRunPages entry ${index}.check_suite_id`,
    );
    const headSha = requireSha1(entry.head_sha, `workflowRunPages entry ${index}.head_sha`);
    const repository = requireNonEmptyString(
      entry.repository?.full_name,
      `workflowRunPages entry ${index}.repository.full_name`,
    );
    const headRepository = requireNonEmptyString(
      entry.head_repository?.full_name,
      `workflowRunPages entry ${index}.head_repository.full_name`,
    );
    const event = requireNonEmptyString(entry.event, `workflowRunPages entry ${index}.event`);
    const path = requireNonEmptyString(entry.path, `workflowRunPages entry ${index}.path`);
    const runAttempt = requirePositiveInteger(
      entry.run_attempt,
      `workflowRunPages entry ${index}.run_attempt`,
    );
    const status = requireNonEmptyString(
      entry.status,
      `workflowRunPages entry ${index}.status`,
    ).toLowerCase();
    const conclusion = entry.conclusion === null || entry.conclusion === undefined
      ? null
      : requireNonEmptyString(
          entry.conclusion,
          `workflowRunPages entry ${index}.conclusion`,
        ).toLowerCase();
    if (runIds.has(runId) || suiteIds.has(checkSuiteId)) {
      throw new Error("Production release workflow-run metadata contains duplicate run or check-suite IDs.");
    }
    runIds.add(runId);
    suiteIds.add(checkSuiteId);
    if (
      headSha !== releaseSha
      || repository !== CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY
      || headRepository !== CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY
    ) {
      throw new Error("Production release workflow-run head/repository metadata is inconsistent.");
    }
    if (!checkSuiteIdSet.has(checkSuiteId)) {
      throw new Error(`Production release workflow run ${runId} references an unknown check suite.`);
    }
    if (checkSuiteAppIds[checkSuiteId] !== GITHUB_ACTIONS_APP_INTEGRATION_ID) {
      throw new Error(`Production release workflow run ${runId} is not owned by GitHub Actions.`);
    }
    if (runAttempt !== 1) {
      throw new Error(`Production release workflow run ${runId} is an actual rerun (run_attempt=${runAttempt}).`);
    }
    if (excludedSuiteIdSet.has(checkSuiteId)) {
      continue;
    }
    if (status !== "completed" || conclusion !== "success") {
      throw new Error(`Production release workflow run ${runId} is not terminal success.`);
    }
    const knownPath = pathsByWorkflowId.get(workflowId);
    if (knownPath !== undefined && knownPath !== path) {
      throw new Error(`Production release workflow ${workflowId} has inconsistent path ownership.`);
    }
    pathsByWorkflowId.set(workflowId, path);
    normalized.push(Object.freeze({
      checkSuiteId,
      conclusion,
      event,
      headRepository,
      headSha,
      path,
      repository,
      runAttempt,
      runId,
      status,
      workflowId,
    }));
  }
  return Object.freeze({
    externalWorkflowRuns: Object.freeze(normalized.sort((left, right) =>
      left.runId - right.runId
      || left.checkSuiteId - right.checkSuiteId)),
    mappedCheckSuiteIds: Object.freeze([...suiteIds].sort((left, right) => left - right)),
  });
}

/**
 * @param {{
 *   checkRunPages?: Array<Record<string, unknown>> | null,
 *   checkRuns?: Array<Record<string, unknown>>,
 *   checkSuitePages?: Array<Record<string, unknown>> | null,
 *   commitStatuses?: Array<Record<string, unknown>>,
 *   excludedCheckSuiteIds?: number[] | null,
 *   expectedContexts?: string[],
 *   releaseSha?: string | null,
 *   workflowRunPages?: Array<Record<string, unknown>> | null,
 * }} [options]
 */
export function buildGitHubProductionReleaseExternalCheckEvidence({
  checkRunPages = null,
  checkRuns = [],
  checkSuitePages = null,
  commitStatuses = [],
  excludedCheckSuiteIds = null,
  expectedContexts = EXPECTED_RELEASE_CONTEXTS,
  releaseSha = null,
  workflowRunPages = null,
} = {}) {
  const hasCompletePages = checkRunPages !== null || checkSuitePages !== null;
  if (hasCompletePages && (checkRunPages === null || checkSuitePages === null)) {
    throw new Error("Complete production release checks require both check-run and check-suite pages.");
  }
  const completeSuiteAuthority = hasCompletePages
    ? buildGitHubProductionReleaseCheckSuiteAuthority({ checkSuitePages, releaseSha })
    : null;
  const normalizedCheckRuns = hasCompletePages
    ? normalizeCompleteCheckRunPages({
        checkRunPages,
        checkSuiteIdSet: new Set(completeSuiteAuthority.all_check_suite_ids),
        releaseSha,
      })
    : checkRuns;
  if (!Array.isArray(normalizedCheckRuns)) {
    throw new Error("GitHub production release check runs must be an array.");
  }
  const normalizedExpectedContexts = normalizeExpectedReleaseContexts(
    expectedContexts,
    "expected_release_contexts",
  );

  const normalizedExcludedCheckSuiteIds = normalizeExcludedCheckSuiteIds(
    excludedCheckSuiteIds,
  );
  const excludedSuiteIdSet = new Set(normalizedExcludedCheckSuiteIds);
  if (hasCompletePages && workflowRunPages === null) {
    throw new Error("Current production release checks require complete workflow-run metadata pages.");
  }
  if (hasCompletePages && requireCommitStatuses(commitStatuses, "commitStatuses").length > 0) {
    throw new Error("Current production release contract requires legacy commit statuses to be empty.");
  }
  const workflowRunAuthority = hasCompletePages
    ? normalizeWorkflowRunPages({
        checkSuiteAppIds: completeSuiteAuthority.check_suite_app_ids,
        checkSuiteIdSet: new Set(completeSuiteAuthority.all_check_suite_ids),
        excludedSuiteIdSet,
        releaseSha,
        workflowRunPages,
      })
    : { externalWorkflowRuns: [], mappedCheckSuiteIds: [] };
  const normalizedWorkflowRuns = workflowRunAuthority.externalWorkflowRuns;
  if (hasCompletePages) {
    const mappedSuiteIdSet = new Set(workflowRunAuthority.mappedCheckSuiteIds);
    const unmappedActionsSuiteIds = Object.values(completeSuiteAuthority.check_suite_metadata)
      .filter((entry) => entry.app_id === GITHUB_ACTIONS_APP_INTEGRATION_ID)
      .map((entry) => entry.id)
      .filter((suiteId) => !mappedSuiteIdSet.has(suiteId));
    if (unmappedActionsSuiteIds.length > 0) {
      throw new Error(
        `GitHub Actions check suites are missing bijective workflow-run mappings: ${unmappedActionsSuiteIds.join(", ")}.`,
      );
    }
  }
  const workflowRunsBySuiteId = new Map(
    normalizedWorkflowRuns.map((entry) => [entry.checkSuiteId, entry]),
  );
  if (hasCompletePages) {
    const externalOwnerKeys = new Set();
    for (const suite of Object.values(completeSuiteAuthority.check_suite_metadata)) {
      if (suite.app_id === GITHUB_ACTIONS_APP_INTEGRATION_ID) continue;
      const owner = GITHUB_PRODUCTION_RELEASE_ZERO_CHECK_EXTERNAL_SUITES.find((entry) =>
        entry.appId === suite.app_id
        && entry.appName === suite.app_name
        && entry.appSlug === suite.app_slug);
      if (!owner || suite.repository !== CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY) {
        throw new Error(`External check suite ${suite.id} owner/repository is not allowlisted.`);
      }
      const ownerKey = `${owner.appId}:${owner.appSlug}:${owner.appName}`;
      if (externalOwnerKeys.has(ownerKey)) {
        throw new Error(`External zero-check suite owner is duplicated: ${ownerKey}.`);
      }
      externalOwnerKeys.add(ownerKey);
    }
  }
  const observedExcludedSuiteIds = new Set(
    completeSuiteAuthority === null
      ? []
      : normalizedExcludedCheckSuiteIds.filter((id) =>
          completeSuiteAuthority.all_check_suite_ids.includes(id)),
  );
  const byKey = new Map();
  const instancesByIdentity = new Map();
  let allowlistedExternalCheckCount = 0;
  for (const entry of normalizedCheckRuns) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("Each production release check run must be an object.");
    }
    const checkSuiteId = Number(entry.check_suite?.id);
    if (
      excludedSuiteIdSet.size > 0
      && Number.isSafeInteger(checkSuiteId)
      && excludedSuiteIdSet.has(checkSuiteId)
    ) {
      observedExcludedSuiteIds.add(checkSuiteId);
      continue;
    }
    const normalized = {
      appId: Number(entry.app?.id),
      appName: typeof entry.app?.name === "string" ? entry.app.name : null,
      appSlug: typeof entry.app?.slug === "string" ? entry.app.slug : null,
      bucket: normalizeBucket(entry),
      checkRunId: Number(entry.id),
      checkSuiteId,
      context: contextKey(entry.name ?? entry.context, "check.context"),
      externalId: entry.external_id === null || entry.external_id === undefined
        ? null
        : String(entry.external_id),
      timestamp: sortTimestamp(entry),
    };
    if (
      !Number.isSafeInteger(normalized.checkRunId)
      || normalized.checkRunId <= 0
      || !Number.isSafeInteger(normalized.checkSuiteId)
      || normalized.checkSuiteId <= 0
    ) {
      throw new Error(
        `Production release check context must bind positive check-run and check-suite IDs: ${normalized.context}.`,
      );
    }
    const suiteMetadata = completeSuiteAuthority?.check_suite_metadata?.[normalized.checkSuiteId];
    const isGitGuardian = hasCompletePages
      && normalized.appId === GITHUB_PRODUCTION_RELEASE_GITGUARDIAN_CHECK.appId
      && normalized.appName === GITHUB_PRODUCTION_RELEASE_GITGUARDIAN_CHECK.appName
      && normalized.appSlug === GITHUB_PRODUCTION_RELEASE_GITGUARDIAN_CHECK.appSlug
      && entry.name === GITHUB_PRODUCTION_RELEASE_GITGUARDIAN_CHECK.checkName
      && normalized.externalId === GITHUB_PRODUCTION_RELEASE_GITGUARDIAN_CHECK.externalId
      && suiteMetadata?.app_id === GITHUB_PRODUCTION_RELEASE_GITGUARDIAN_CHECK.appId
      && suiteMetadata?.app_name === GITHUB_PRODUCTION_RELEASE_GITGUARDIAN_CHECK.appName
      && suiteMetadata?.app_slug === GITHUB_PRODUCTION_RELEASE_GITGUARDIAN_CHECK.appSlug
      && suiteMetadata?.repository === CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY;
    if (
      hasCompletePages
      && normalized.appId !== GITHUB_ACTIONS_APP_INTEGRATION_ID
      && !isGitGuardian
    ) {
      throw new Error(
        `Production release non-Actions started check is not the exact allowlisted GitGuardian owner tuple: ${normalized.context}.`,
      );
    }
    const suiteAppId = completeSuiteAuthority?.check_suite_app_ids?.[normalized.checkSuiteId];
    if (hasCompletePages && suiteAppId !== normalized.appId) {
      throw new Error(
        `Production release check-run/check-suite App metadata is inconsistent: ${normalized.context}.`,
      );
    }
    const workflowRun = workflowRunsBySuiteId.get(normalized.checkSuiteId) ?? null;
    if (
      hasCompletePages
      && normalized.appId === GITHUB_ACTIONS_APP_INTEGRATION_ID
      && workflowRun === null
    ) {
      throw new Error(
        `Production release Actions check is missing workflow-run metadata: ${normalized.context}.`,
      );
    }
    if (isGitGuardian) {
      allowlistedExternalCheckCount += 1;
      if (allowlistedExternalCheckCount !== 1) {
        throw new Error("Production release allows exactly one GitGuardian check instance.");
      }
      if (normalized.bucket !== "success") {
        throw new Error("Production release GitGuardian check must be completed success.");
      }
    }
    const withProvenance = workflowRun === null
      ? Object.freeze({
          ...normalized,
          suiteRepository: suiteMetadata?.repository ?? null,
        })
      : Object.freeze({
          ...normalized,
          workflowEvent: workflowRun.event,
          workflowHeadRepository: workflowRun.headRepository,
          workflowHeadSha: workflowRun.headSha,
          workflowId: workflowRun.workflowId,
          workflowPath: workflowRun.path,
          workflowRepository: workflowRun.repository,
          workflowRunAttempt: workflowRun.runAttempt,
          workflowRunId: workflowRun.runId,
        });
    if (["pending", "queued"].includes(normalized.bucket)) {
      throw new Error(
        `Production release terminal check summary contains pending checks for ${normalized.context}.`,
      );
    }
    if (["failed", "cancelled"].includes(normalized.bucket)) {
      throw new Error(
        `Production release terminal check summary contains failed checks for ${normalized.context}.`,
      );
    }
    const instanceIdentity = `${normalized.checkRunId}:${normalized.checkSuiteId}`;
    const existingInstance = instancesByIdentity.get(instanceIdentity);
    if (existingInstance) {
      if (JSON.stringify(existingInstance) !== JSON.stringify(withProvenance)) {
        throw new Error(
          `Production release check-run instance has conflicting evidence: ${instanceIdentity}.`,
        );
      }
      continue;
    }
    instancesByIdentity.set(instanceIdentity, withProvenance);
    const bucket = byKey.get(normalized.context) ?? [];
    bucket.push(withProvenance);
    byKey.set(normalized.context, bucket);
  }
  const unobservedExcludedSuiteIds = normalizedExcludedCheckSuiteIds.filter(
    (id) => !observedExcludedSuiteIds.has(id),
  );
  if (unobservedExcludedSuiteIds.length > 0) {
    throw new Error(
      `excludedCheckSuiteIds were not observed in current check runs: ${unobservedExcludedSuiteIds.join(", ")}.`,
    );
  }

  const statusesByContext = new Map();
  for (const entry of requireCommitStatuses(commitStatuses, "commitStatuses")) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("Each production release commit status must be an object.");
    }
    const normalized = {
      bucket: normalizeCommitStatusBucket(entry),
      context: contextKey(entry.context, "commitStatus.context"),
      id: Number.isSafeInteger(Number(entry.id)) && Number(entry.id) > 0
        ? Number(entry.id)
        : null,
      timestamp: sortCommitStatusTimestamp(entry),
    };
    const bucket = statusesByContext.get(normalized.context) ?? [];
    bucket.push(normalized);
    statusesByContext.set(normalized.context, bucket);
  }

  const summary = {
    total: 0,
    success: 0,
    intended_skip: 0,
    bad: 0,
    cancelled: 0,
    failed: 0,
    pending: 0,
    queued: 0,
    rerun: 0,
  };

  for (const expectedContext of normalizedExpectedContexts) {
    const entries = byKey.get(expectedContext) ?? [];
    if (entries.length === 0) {
      throw new Error(
        `Production release trusted GitHub Actions expected context is missing: ${expectedContext}.`,
      );
    }
    if (entries.some((entry) => entry.appId !== GITHUB_ACTIONS_APP_INTEGRATION_ID)) {
      throw new Error(
        `Production release expected context must use trusted GitHub Actions App integration ${GITHUB_ACTIONS_APP_INTEGRATION_ID}: ${expectedContext}.`,
      );
    }
    if (entries.some((entry) => entry.bucket !== "success")) {
      throw new Error(
        `Production release every trusted expected context instance must be exactly success: ${expectedContext}.`,
      );
    }
  }

  for (const [context, entries] of byKey) {
    if (entries.length <= 1) continue;
    if (!hasCompletePages) {
      summary.rerun += entries.length - 1;
      continue;
    }
    const [owner, ...rest] = entries;
    const distinctRunIds = new Set(entries.map((entry) => entry.workflowRunId));
    const distinctSuiteIds = new Set(entries.map((entry) => entry.checkSuiteId));
    if (
      distinctRunIds.size !== entries.length
      || distinctSuiteIds.size !== entries.length
    ) {
      throw new Error(`Production release context is duplicated inside one Actions run/check suite: ${context}.`);
    }
    if (rest.some((entry) =>
      entry.workflowId !== owner.workflowId
      || entry.workflowPath !== owner.workflowPath)) {
      throw new Error(`Production release context has a cross-workflow ownership collision: ${context}.`);
    }
  }

  for (const [context, entries] of statusesByContext) {
    const latestTimestamp = Math.max(...entries.map((entry) => entry.timestamp));
    const latestEntries = entries.filter((entry) => entry.timestamp === latestTimestamp);
    const latestBuckets = new Set(latestEntries.map((entry) => entry.bucket));
    if (latestBuckets.size !== 1 || !latestBuckets.has("success")) {
      throw new Error(
        `Production release latest commit status is not terminal success: ${context}.`,
      );
    }
  }

  for (const context of [...byKey.keys()].sort()) {
    const entries = (byKey.get(context) ?? [])
      .sort((left, right) => right.timestamp - left.timestamp);
    const latestTimestamp = entries[0].timestamp;
    const latestEntries = entries.filter((entry) => entry.timestamp === latestTimestamp);
    const latestBuckets = new Set(latestEntries.map((entry) => entry.bucket));
    if (latestBuckets.size > 1) {
      throw new Error(
        `Production release context has an ambiguous latest result: ${context}.`,
      );
    }
    const latestBucket = latestEntries[0].bucket;
    summary.total += 1;
    summary[latestBucket] += 1;
  }

  const allInstances = [...instancesByIdentity.values()].sort((left, right) =>
    left.context.localeCompare(right.context)
    || left.checkRunId - right.checkRunId
    || left.checkSuiteId - right.checkSuiteId);
  const allContextCheckSuiteIds = [...new Set(allInstances.map(
    (entry) => entry.checkSuiteId,
  ))].sort((left, right) => left - right);
  const normalizedCommitStatuses = [...statusesByContext.values()]
    .flat()
    .sort((left, right) =>
      left.context.localeCompare(right.context)
      || left.timestamp - right.timestamp
      || (left.id ?? 0) - (right.id ?? 0)
      || left.bucket.localeCompare(right.bucket));

  return {
    ...(completeSuiteAuthority === null ? {} : {
      all_check_suite_count: completeSuiteAuthority.all_check_suite_count,
      all_check_suite_ids_digest: completeSuiteAuthority.all_check_suite_ids_digest,
      all_check_suite_authority_digest: completeSuiteAuthority.all_check_suite_authority_digest,
    }),
    ...(completeSuiteAuthority === null ? {} : {
      all_actions_workflow_run_provenance_digest: createHash("sha256")
        .update(JSON.stringify(normalizedWorkflowRuns))
        .digest("hex"),
    }),
    all_context_check_run_instances_digest: createHash("sha256")
      .update(JSON.stringify(allInstances))
      .digest("hex"),
    all_context_check_suite_ids: allContextCheckSuiteIds,
    all_context_commit_statuses_digest: createHash("sha256")
      .update(JSON.stringify(normalizedCommitStatuses))
      .digest("hex"),
    required_check_summary: summary,
  };
}

export function normalizeGitHubProductionReleaseCheckSummary(options = {}) {
  return buildGitHubProductionReleaseExternalCheckEvidence(options).required_check_summary;
}

/**
 * @param {{
 *   checkRunPages?: Array<Record<string, unknown>> | null,
 *   checkRuns: Array<Record<string, unknown>>,
 *   checkSuitePages?: Array<Record<string, unknown>> | null,
 *   approvalAuthority?: Record<string, unknown> | null,
 *   commitStatuses?: Array<Record<string, unknown>>,
 *   excludedCheckSuiteIds?: number[] | null,
 *   expectedContexts?: string[],
 *   predicateOutputPath?: string | null,
 *   releaseSha: string,
 *   releaseTag: string,
 *   releaseTagObjectSha: string,
 *   releaseTree: string,
 *   repository: string,
 *   rehearsalAuthority?: Record<string, unknown> | null,
 *   subjectOutputPath?: string | null,
 *   workflowAuthority?: Record<string, unknown> | null,
 *   workflowRunPages?: Array<Record<string, unknown>> | null,
 * }} [options]
 */
export function buildGitHubProductionReleaseAttestationArtifacts({
  approvalAuthority = null,
  checkRunPages = null,
  checkRuns,
  checkSuitePages = null,
  commitStatuses = [],
  excludedCheckSuiteIds = null,
  expectedContexts = EXPECTED_RELEASE_CONTEXTS,
  predicateOutputPath = null,
  releaseSha,
  releaseTag,
  releaseTagObjectSha,
  releaseTree,
  repository,
  rehearsalAuthority = null,
  subjectOutputPath = null,
  workflowAuthority = null,
  workflowRunPages = null,
} = {}) {
  const normalizedReleaseSha = requireSha1(releaseSha, "releaseSha");
  const normalizedReleaseTree = requireSha1(releaseTree, "releaseTree");
  const normalizedRehearsalAuthority = rehearsalAuthority === null
    ? null
    : normalizeRehearsalAuthority(rehearsalAuthority);
  const normalizedWorkflowAuthority = normalizedRehearsalAuthority === null
    ? null
    : normalizeWorkflowAuthority(workflowAuthority);
  const normalizedApprovalAuthority = normalizedRehearsalAuthority === null
    ? null
    : normalizeApprovalAuthority(approvalAuthority);
  const normalizedExcludedCheckSuiteIds = normalizeExcludedCheckSuiteIds(excludedCheckSuiteIds);
  if (
    normalizedRehearsalAuthority !== null
    && (checkRunPages === null || checkSuitePages === null)
  ) {
    throw new Error(
      "Production release v2 attestation requires complete check-run and check-suite page authority.",
    );
  }
  if (normalizedWorkflowAuthority !== null) {
    const completeSuiteAuthority = buildGitHubProductionReleaseCheckSuiteAuthority({
      checkSuitePages,
      releaseSha: normalizedReleaseSha,
    });
    const selfSuiteObserved = completeSuiteAuthority.all_check_suite_ids.includes(
      normalizedWorkflowAuthority.workflow_check_suite_id,
    );
    if (normalizedReleaseSha === normalizedWorkflowAuthority.workflow_head_sha && !selfSuiteObserved) {
      throw new Error(
        "Production release complete suite authority is missing the exact current workflow suite.",
      );
    }
    const expectedExcludedCheckSuiteIds = (
      normalizedReleaseSha === normalizedWorkflowAuthority.workflow_head_sha
    )
      ? [normalizedWorkflowAuthority.workflow_check_suite_id]
      : [];
    if (
      JSON.stringify(normalizedExcludedCheckSuiteIds)
      !== JSON.stringify(expectedExcludedCheckSuiteIds)
    ) {
      throw new Error(
        "Production release self-suite exclusion must contain only the exact current workflow suite when observed on the selected release.",
      );
    }
  }
  if (
    normalizedRehearsalAuthority !== null
    && normalizedRehearsalAuthority.selection_digest !== null
    && (
      normalizedRehearsalAuthority.selected_sha !== normalizedReleaseSha
      || normalizedRehearsalAuthority.selected_tree !== normalizedReleaseTree
    )
  ) {
    throw new Error("Selected rehearsal authority SHA/tree must equal the attested release SHA/tree.");
  }
  const externalCheckEvidence = buildGitHubProductionReleaseExternalCheckEvidence({
    checkRunPages,
    checkRuns,
    checkSuitePages,
    commitStatuses,
    excludedCheckSuiteIds: normalizedExcludedCheckSuiteIds,
    expectedContexts,
    releaseSha: normalizedReleaseSha,
    workflowRunPages,
  });
  const requiredCheckSummary = externalCheckEvidence.required_check_summary;
  if (requiredCheckSummary.rerun !== 0) {
    throw new Error("Production release all-context snapshot contains check-run reruns and is not fresh.");
  }
  const subject = {
    schema: normalizedRehearsalAuthority
      ? GITHUB_PRODUCTION_RELEASE_SUBJECT_SCHEMA_V3
      : GITHUB_PRODUCTION_RELEASE_SUBJECT_SCHEMA,
    repository: requireCanonicalString(
      repository,
      CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
      "repository",
    ),
    source_ref: CANONICAL_GITHUB_PRODUCTION_RELEASE_SOURCE_REF,
    signer_workflow: CANONICAL_GITHUB_PRODUCTION_RELEASE_SIGNER_WORKFLOW,
    signer_digest: normalizedWorkflowAuthority?.workflow_head_sha ?? normalizedReleaseSha,
    expected_release_integration_id: GITHUB_ACTIONS_APP_INTEGRATION_ID,
    release_tag: validateProductionReleaseTag(releaseTag, "releaseTag"),
    release_tag_object_sha: requireSha1(
      releaseTagObjectSha,
      "releaseTagObjectSha",
    ),
    release_sha: normalizedReleaseSha,
    release_tree: normalizedReleaseTree,
    ...(normalizedRehearsalAuthority ?? {}),
    ...(normalizedWorkflowAuthority ?? {}),
    ...(normalizedApprovalAuthority ?? {}),
    ...(normalizedRehearsalAuthority === null ? {} : {
      all_check_suite_count: externalCheckEvidence.all_check_suite_count,
      all_check_suite_ids_digest: externalCheckEvidence.all_check_suite_ids_digest,
      all_check_suite_authority_digest:
        externalCheckEvidence.all_check_suite_authority_digest,
      all_actions_workflow_run_provenance_digest:
        externalCheckEvidence.all_actions_workflow_run_provenance_digest,
      all_context_check_run_instances_digest:
        externalCheckEvidence.all_context_check_run_instances_digest,
      all_context_check_suite_ids: externalCheckEvidence.all_context_check_suite_ids,
      all_context_commit_statuses_digest:
        externalCheckEvidence.all_context_commit_statuses_digest,
    }),
    expected_release_contexts: normalizeExpectedReleaseContexts(
      expectedContexts,
      "expected_release_contexts",
    ),
    required_check_summary: requiredCheckSummary,
  };

  if (subjectOutputPath) {
    writeFileSync(resolve(subjectOutputPath), `${JSON.stringify(subject, null, 2)}\n`);
  }

  const normalizedSubjectOutputPath = subjectOutputPath
    ? resolve(subjectOutputPath)
    : null;
  const subjectManifestSha256 = normalizedSubjectOutputPath
    ? defaultSha256File(normalizedSubjectOutputPath)
    : createHash("sha256").update(JSON.stringify(subject)).digest("hex");

  const predicate = {
    schema: normalizedRehearsalAuthority
      ? GITHUB_PRODUCTION_RELEASE_PREDICATE_SCHEMA_V3
      : GITHUB_PRODUCTION_RELEASE_PREDICATE_SCHEMA,
    repository: subject.repository,
    source_ref: subject.source_ref,
    signer_workflow: subject.signer_workflow,
    signer_digest: subject.signer_digest,
    expected_release_integration_id: subject.expected_release_integration_id,
    release_tag: subject.release_tag,
    release_tag_object_sha: subject.release_tag_object_sha,
    release_sha: subject.release_sha,
    release_tree: subject.release_tree,
    ...(normalizedRehearsalAuthority ?? {}),
    ...(normalizedWorkflowAuthority ?? {}),
    ...(normalizedApprovalAuthority ?? {}),
    ...(normalizedRehearsalAuthority === null ? {} : {
      all_check_suite_count: externalCheckEvidence.all_check_suite_count,
      all_check_suite_ids_digest: externalCheckEvidence.all_check_suite_ids_digest,
      all_check_suite_authority_digest:
        externalCheckEvidence.all_check_suite_authority_digest,
      all_actions_workflow_run_provenance_digest:
        externalCheckEvidence.all_actions_workflow_run_provenance_digest,
      all_context_check_run_instances_digest:
        externalCheckEvidence.all_context_check_run_instances_digest,
      all_context_check_suite_ids: externalCheckEvidence.all_context_check_suite_ids,
      all_context_commit_statuses_digest:
        externalCheckEvidence.all_context_commit_statuses_digest,
    }),
    expected_release_contexts: subject.expected_release_contexts,
    required_check_summary: subject.required_check_summary,
    subject_manifest_sha256: subjectManifestSha256,
  };

  if (predicateOutputPath) {
    writeFileSync(resolve(predicateOutputPath), `${JSON.stringify(predicate, null, 2)}\n`);
  }

  return {
    predicate,
    subject,
    subject_manifest_sha256: subjectManifestSha256,
  };
}

function validateSubjectDocument({
  document,
  fileSha256,
  gitEvidence,
  manifest,
  repository,
}) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("Production release subject manifest must be a JSON object.");
  }
  const manifestRehearsalAuthority = manifest.schema === "homecook.local-mac-production-release.v3"
    ? normalizeRehearsalAuthority(Object.fromEntries(
        REHEARSAL_AUTHORITY_KEYS.map((key) => [key, manifest[key]]),
      ), "manifest rehearsal authority")
    : null;
  const expectedSubjectSchema = manifestRehearsalAuthority
    ? GITHUB_PRODUCTION_RELEASE_SUBJECT_SCHEMA_V3
    : GITHUB_PRODUCTION_RELEASE_SUBJECT_SCHEMA;
  if (document.schema !== expectedSubjectSchema) {
    throw new Error(
      `Production release subject manifest schema must be ${expectedSubjectSchema}.`,
    );
  }
  requireExactKeys(
    document,
    manifestRehearsalAuthority
      ? [
          ...SUBJECT_BASE_KEYS,
          ...REHEARSAL_AUTHORITY_KEYS,
          ...WORKFLOW_AUTHORITY_KEYS,
          ...APPROVAL_AUTHORITY_KEYS,
          ...EXTERNAL_CHECK_EVIDENCE_KEYS,
        ]
      : SUBJECT_BASE_KEYS,
    "Production release subject manifest",
  );
  if (manifestRehearsalAuthority) {
    const subjectAuthority = normalizeRehearsalAuthority(Object.fromEntries(
      REHEARSAL_AUTHORITY_KEYS.map((key) => [key, document[key]]),
    ), "subject rehearsal authority");
    if (JSON.stringify(subjectAuthority) !== JSON.stringify(manifestRehearsalAuthority)) {
      throw new Error("Production release subject rehearsal authority does not match the release manifest.");
    }
    const subjectWorkflowAuthority = normalizeWorkflowAuthority(Object.fromEntries(
      WORKFLOW_AUTHORITY_KEYS.map((key) => [key, document[key]]),
    ), "subject workflow authority");
    const manifestWorkflowAuthority = normalizeWorkflowAuthority(Object.fromEntries(
      WORKFLOW_AUTHORITY_KEYS.map((key) => [key, manifest[key]]),
    ), "manifest workflow authority");
    if (JSON.stringify(subjectWorkflowAuthority) !== JSON.stringify(manifestWorkflowAuthority)) {
      throw new Error("Production release subject workflow authority does not match the release manifest.");
    }
    const subjectApprovalAuthority = normalizeApprovalAuthority(Object.fromEntries(
      APPROVAL_AUTHORITY_KEYS.map((key) => [key, document[key]]),
    ), "subject approval authority");
    const manifestApprovalAuthority = normalizeApprovalAuthority(Object.fromEntries(
      APPROVAL_AUTHORITY_KEYS.map((key) => [key, manifest[key]]),
    ), "manifest approval authority");
    if (JSON.stringify(subjectApprovalAuthority) !== JSON.stringify(manifestApprovalAuthority)) {
      throw new Error("Production release subject approval authority does not match the release manifest.");
    }
    const subjectExternalEvidence = normalizeExternalCheckEvidence(Object.fromEntries(
      EXTERNAL_CHECK_EVIDENCE_KEYS.map((key) => [key, document[key]]),
    ), "subject external check evidence");
    const manifestExternalEvidence = normalizeExternalCheckEvidence(Object.fromEntries(
      EXTERNAL_CHECK_EVIDENCE_KEYS.map((key) => [key, manifest[key]]),
    ), "manifest external check evidence");
    if (JSON.stringify(subjectExternalEvidence) !== JSON.stringify(manifestExternalEvidence)) {
      throw new Error("Production release subject external check evidence does not match the release manifest.");
    }
    if (
      subjectWorkflowAuthority.workflow_head_tree
      !== requireSha1(gitEvidence.workflowHeadTreeSha, "gitEvidence.workflowHeadTreeSha")
    ) {
      throw new Error("Production release subject workflow head tree does not match git evidence.");
    }
    if (
      subjectApprovalAuthority.master_tree_at_approval
      !== requireSha1(gitEvidence.masterAtApprovalTreeSha, "gitEvidence.masterAtApprovalTreeSha")
    ) {
      throw new Error("Production release subject approval-time master tree does not match git evidence.");
    }
    if (
      gitEvidence.releaseIsAncestorOfWorkflowHead !== true
      || gitEvidence.workflowHeadIsAncestorOfMasterAtApproval !== true
      || gitEvidence.masterAtApprovalIsAncestorOfOriginMaster !== true
    ) {
      throw new Error("Production release subject Git authority lineage is incomplete.");
    }
  }

  if (requireNonEmptyString(document.repository, "subject.repository") !== repository) {
    throw new Error("Production release subject manifest repository does not match the verifier repository.");
  }
  requireCanonicalString(document.source_ref, CANONICAL_GITHUB_PRODUCTION_RELEASE_SOURCE_REF, "subject.source_ref");
  requireCanonicalString(document.signer_workflow, CANONICAL_GITHUB_PRODUCTION_RELEASE_SIGNER_WORKFLOW, "subject.signer_workflow");
  if (requireSha1(document.signer_digest, "subject.signer_digest") !== requireSha1(manifest.workflow_head_sha, "manifest.workflow_head_sha")) {
    throw new Error("Production release subject signer digest does not match the workflow head SHA.");
  }
  if (
    document.expected_release_integration_id !== GITHUB_ACTIONS_APP_INTEGRATION_ID
    || manifest.expected_release_integration_id !== GITHUB_ACTIONS_APP_INTEGRATION_ID
  ) {
    throw new Error("Production release subject integration id is not the trusted GitHub Actions App.");
  }
  if (requireNonEmptyString(document.release_tag, "subject.release_tag") !== requireNonEmptyString(manifest.release_tag, "manifest.release_tag")) {
    throw new Error("Production release subject manifest tag does not match the release manifest.");
  }
  const subjectTagObjectSha = requireSha1(
    document.release_tag_object_sha,
    "subject.release_tag_object_sha",
  );
  if (
    subjectTagObjectSha
    !== requireSha1(manifest.release_tag_object_sha, "manifest.release_tag_object_sha")
  ) {
    throw new Error("Production release subject tag object SHA does not match the release manifest.");
  }
  if (
    subjectTagObjectSha
    !== requireSha1(gitEvidence.releaseTagObjectSha, "gitEvidence.releaseTagObjectSha")
  ) {
    throw new Error("Production release subject tag object SHA does not match current git evidence.");
  }
  if (requireSha1(document.release_sha, "subject.release_sha") !== requireSha1(manifest.release_sha, "manifest.release_sha")) {
    throw new Error("Production release subject manifest SHA does not match the release manifest.");
  }
  if (requireSha1(document.release_tree, "subject.release_tree") !== requireSha1(manifest.release_tree, "manifest.release_tree")) {
    throw new Error("Production release subject manifest tree does not match the release manifest.");
  }
  if (document.release_tree !== requireSha1(gitEvidence.releaseTreeSha, "gitEvidence.releaseTreeSha")) {
    throw new Error("Production release subject manifest tree does not match current git tree evidence.");
  }
  if (
    JSON.stringify(
      normalizeExpectedReleaseContexts(
        document.expected_release_contexts,
        "subject.expected_release_contexts",
      ),
    ) !== JSON.stringify(
      normalizeExpectedReleaseContexts(
        manifest.expected_release_contexts,
        "manifest.expected_release_contexts",
      ),
    )
  ) {
    throw new Error("Production release subject manifest expected context set does not match the release manifest.");
  }
  if (
    !sameCheckSummary(
      requireCheckSummary(document.required_check_summary, "subject.required_check_summary"),
      requireCheckSummary(manifest.required_check_summary, "manifest.required_check_summary"),
    )
  ) {
    throw new Error("Production release subject manifest check summary does not match the release manifest.");
  }
  if (requireSha256(manifest.attestation_digest, "manifest.attestation_digest") !== requireSha256(fileSha256, "subjectManifestSha256")) {
    throw new Error("Production release subject manifest digest does not match manifest.attestation_digest.");
  }
}

function validatePredicateDocument({
  predicate,
  subjectManifestSha256,
  manifest,
  repository,
}) {
  if (!predicate || typeof predicate !== "object" || Array.isArray(predicate)) {
    throw new Error("Production release attestation predicate must be a JSON object.");
  }
  const manifestRehearsalAuthority = manifest.schema === "homecook.local-mac-production-release.v3"
    ? normalizeRehearsalAuthority(Object.fromEntries(
        REHEARSAL_AUTHORITY_KEYS.map((key) => [key, manifest[key]]),
      ), "manifest rehearsal authority")
    : null;
  const expectedPredicateSchema = manifestRehearsalAuthority
    ? GITHUB_PRODUCTION_RELEASE_PREDICATE_SCHEMA_V3
    : GITHUB_PRODUCTION_RELEASE_PREDICATE_SCHEMA;
  if (predicate.schema !== expectedPredicateSchema) {
    throw new Error(
      `Production release attestation predicate schema must be ${expectedPredicateSchema}.`,
    );
  }
  requireExactKeys(
    predicate,
    manifestRehearsalAuthority
      ? [
          ...SUBJECT_BASE_KEYS,
          ...REHEARSAL_AUTHORITY_KEYS,
          ...WORKFLOW_AUTHORITY_KEYS,
          ...APPROVAL_AUTHORITY_KEYS,
          ...EXTERNAL_CHECK_EVIDENCE_KEYS,
          "subject_manifest_sha256",
        ]
      : [...SUBJECT_BASE_KEYS, "subject_manifest_sha256"],
    "Production release predicate",
  );
  if (manifestRehearsalAuthority) {
    const predicateAuthority = normalizeRehearsalAuthority(Object.fromEntries(
      REHEARSAL_AUTHORITY_KEYS.map((key) => [key, predicate[key]]),
    ), "predicate rehearsal authority");
    if (JSON.stringify(predicateAuthority) !== JSON.stringify(manifestRehearsalAuthority)) {
      throw new Error("Production release predicate rehearsal authority does not match the release manifest.");
    }
    const predicateWorkflowAuthority = normalizeWorkflowAuthority(Object.fromEntries(
      WORKFLOW_AUTHORITY_KEYS.map((key) => [key, predicate[key]]),
    ), "predicate workflow authority");
    const manifestWorkflowAuthority = normalizeWorkflowAuthority(Object.fromEntries(
      WORKFLOW_AUTHORITY_KEYS.map((key) => [key, manifest[key]]),
    ), "manifest workflow authority");
    if (JSON.stringify(predicateWorkflowAuthority) !== JSON.stringify(manifestWorkflowAuthority)) {
      throw new Error("Production release predicate workflow authority does not match the release manifest.");
    }
    const predicateApprovalAuthority = normalizeApprovalAuthority(Object.fromEntries(
      APPROVAL_AUTHORITY_KEYS.map((key) => [key, predicate[key]]),
    ), "predicate approval authority");
    const manifestApprovalAuthority = normalizeApprovalAuthority(Object.fromEntries(
      APPROVAL_AUTHORITY_KEYS.map((key) => [key, manifest[key]]),
    ), "manifest approval authority");
    if (JSON.stringify(predicateApprovalAuthority) !== JSON.stringify(manifestApprovalAuthority)) {
      throw new Error("Production release predicate approval authority does not match the release manifest.");
    }
    const predicateExternalEvidence = normalizeExternalCheckEvidence(Object.fromEntries(
      EXTERNAL_CHECK_EVIDENCE_KEYS.map((key) => [key, predicate[key]]),
    ), "predicate external check evidence");
    const manifestExternalEvidence = normalizeExternalCheckEvidence(Object.fromEntries(
      EXTERNAL_CHECK_EVIDENCE_KEYS.map((key) => [key, manifest[key]]),
    ), "manifest external check evidence");
    if (JSON.stringify(predicateExternalEvidence) !== JSON.stringify(manifestExternalEvidence)) {
      throw new Error("Production release predicate external check evidence does not match the release manifest.");
    }
  }
  if (requireNonEmptyString(predicate.repository, "predicate.repository") !== repository) {
    throw new Error("Production release attestation predicate repository does not match the verifier repository.");
  }
  requireCanonicalString(predicate.source_ref, CANONICAL_GITHUB_PRODUCTION_RELEASE_SOURCE_REF, "predicate.source_ref");
  requireCanonicalString(predicate.signer_workflow, CANONICAL_GITHUB_PRODUCTION_RELEASE_SIGNER_WORKFLOW, "predicate.signer_workflow");
  if (requireSha1(predicate.signer_digest, "predicate.signer_digest") !== requireSha1(manifest.workflow_head_sha, "manifest.workflow_head_sha")) {
    throw new Error("Production release predicate signer digest does not match the workflow head SHA.");
  }
  if (
    predicate.expected_release_integration_id !== GITHUB_ACTIONS_APP_INTEGRATION_ID
    || manifest.expected_release_integration_id !== GITHUB_ACTIONS_APP_INTEGRATION_ID
  ) {
    throw new Error("Production release predicate integration id is not the trusted GitHub Actions App.");
  }
  if (requireNonEmptyString(predicate.release_tag, "predicate.release_tag") !== requireNonEmptyString(manifest.release_tag, "manifest.release_tag")) {
    throw new Error("Production release attestation predicate tag does not match the release manifest.");
  }
  if (
    requireSha1(predicate.release_tag_object_sha, "predicate.release_tag_object_sha")
    !== requireSha1(manifest.release_tag_object_sha, "manifest.release_tag_object_sha")
  ) {
    throw new Error("Production release predicate tag object SHA does not match the release manifest.");
  }
  if (requireSha1(predicate.release_sha, "predicate.release_sha") !== requireSha1(manifest.release_sha, "manifest.release_sha")) {
    throw new Error("Production release attestation predicate SHA does not match the release manifest.");
  }
  if (requireSha1(predicate.release_tree, "predicate.release_tree") !== requireSha1(manifest.release_tree, "manifest.release_tree")) {
    throw new Error("Production release attestation predicate tree does not match the release manifest.");
  }
  if (
    JSON.stringify(
      normalizeExpectedReleaseContexts(
        predicate.expected_release_contexts,
        "predicate.expected_release_contexts",
      ),
    ) !== JSON.stringify(
      normalizeExpectedReleaseContexts(
        manifest.expected_release_contexts,
        "manifest.expected_release_contexts",
      ),
    )
  ) {
    throw new Error("Production release attestation predicate expected context set does not match the release manifest.");
  }
  if (
    !sameCheckSummary(
      requireCheckSummary(predicate.required_check_summary, "predicate.required_check_summary"),
      requireCheckSummary(manifest.required_check_summary, "manifest.required_check_summary"),
    )
  ) {
    throw new Error("Production release attestation predicate check summary does not match the release manifest.");
  }
  if (
    requireSha256(
      predicate.subject_manifest_sha256,
      "predicate.subject_manifest_sha256",
    ) !== requireSha256(subjectManifestSha256, "subjectManifestSha256")
  ) {
    throw new Error("Production release attestation predicate digest does not match the verified subject manifest.");
  }
}

/**
 * @param {{
 *   bundlePath?: string | null,
 *   ghExecutable?: string | null,
 *   gitEvidence: {
 *     masterAtApprovalIsAncestorOfOriginMaster: boolean,
 *     masterAtApprovalTreeSha: string,
 *     originMasterSha: string,
 *     releaseIsAncestorOfWorkflowHead: boolean,
 *     releaseTreeSha: string,
 *     workflowHeadIsAncestorOfMasterAtApproval: boolean,
 *     workflowHeadTreeSha: string,
 *   },
 *   manifest: Record<string, unknown>,
 *   manifestDigest?: string | null,
 *   manifestPath?: string | null,
 *   repository: string,
 *   rootDir?: string,
 *   runGh?: typeof spawnSync,
 *   sha256File?: (path: string) => string,
 *   signerWorkflow?: string | null,
 *   signerDigest?: string | null,
 *   sourceRef?: string | null,
 *   subjectManifestPath?: string | null,
 *   trustedRootPath?: string | null,
 * }} [options]
 */
export function verifyGitHubProductionReleaseAttestation({
  bundlePath,
  ghExecutable = "gh",
  gitEvidence,
  manifest,
  manifestDigest = null,
  manifestPath = null,
  repository,
  rootDir = process.cwd(),
  runGh = spawnSync,
  sha256File = defaultSha256File,
  signerWorkflow,
  sourceRef,
  signerDigest,
  subjectManifestPath,
  trustedRootPath,
} = {}) {
  void manifestDigest;
  void manifestPath;
  const normalizedSubjectManifestPath = requireAbsoluteExistingPath(
    subjectManifestPath,
    "subject manifest",
  );
  const normalizedBundlePath = requireAbsoluteExistingPath(
    bundlePath,
    "bundle",
  );
  const normalizedTrustedRootPath = requireAbsoluteExistingPath(
    trustedRootPath,
    "trusted root",
  );
  const normalizedRepository = requireCanonicalString(
    repository,
    CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
    "repository",
  );
  const normalizedSignerWorkflow = requireCanonicalString(
    signerWorkflow,
    CANONICAL_GITHUB_PRODUCTION_RELEASE_SIGNER_WORKFLOW,
    "signerWorkflow",
  );
  const normalizedSourceRef = requireCanonicalString(
    sourceRef,
    CANONICAL_GITHUB_PRODUCTION_RELEASE_SOURCE_REF,
    "sourceRef",
  );
  const normalizedSignerDigest = signerDigest === undefined || signerDigest === null
    ? requireSha1(manifest.workflow_head_sha, "manifest.workflow_head_sha")
    : requireSha1(signerDigest, "signerDigest");
  if (normalizedSignerDigest !== requireSha1(manifest.workflow_head_sha, "manifest.workflow_head_sha")) {
    throw new Error("signerDigest must equal the exact workflow head SHA.");
  }
  const expectedPredicateType = manifest.schema === "homecook.local-mac-production-release.v3"
    ? GITHUB_PRODUCTION_RELEASE_PREDICATE_TYPE_V3
    : GITHUB_PRODUCTION_RELEASE_PREDICATE_TYPE;
  const trustedRootDigest = requireSha256(
    sha256File(normalizedTrustedRootPath),
    "trustedRootSha256",
  );
  if (trustedRootDigest !== GITHUB_CLI_TRUSTED_ROOT_SHA256) {
    throw new Error("GitHub CLI custom trusted root SHA-256 does not match the pinned digest.");
  }

  const normalizedGhExecutable = requireNonEmptyString(ghExecutable, "ghExecutable");
  const verification = runGh(normalizedGhExecutable, [
    "attestation",
    "verify",
    normalizedSubjectManifestPath,
    "--repo",
    normalizedRepository,
    "--bundle",
    normalizedBundlePath,
    "--custom-trusted-root",
    normalizedTrustedRootPath,
    "--signer-workflow",
    normalizedSignerWorkflow,
    "--source-ref",
    normalizedSourceRef,
    "--signer-digest",
    normalizedSignerDigest,
    "--predicate-type",
    expectedPredicateType,
    "--format",
    "json",
  ], {
    cwd: resolve(rootDir),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (verification.status !== 0) {
    throw new Error(
      `GitHub offline attestation verification failed: ${String(verification.stderr ?? "").trim() || "unknown error"}`,
    );
  }

  const verificationPayload = JSON.parse(String(verification.stdout ?? "[]"));
  if (!Array.isArray(verificationPayload) || verificationPayload.length === 0) {
    throw new Error("GitHub offline attestation verification returned no verified attestations.");
  }

  const statement = verificationPayload[0]?.verificationResult?.statement;
  if (statement?.predicateType !== expectedPredicateType) {
    throw new Error("GitHub offline attestation verification predicate type is not the expected custom release predicate.");
  }

  const subjectEntries = Array.isArray(statement?.subject) ? statement.subject : [];
  if (subjectEntries.length === 0) {
    throw new Error("GitHub offline attestation verification returned no attested subject digest.");
  }

  const verifiedSubjectManifestSha256 = requireSha256(
    subjectEntries[0]?.digest?.sha256,
    "verifiedSubject.digest.sha256",
  );
  const localSubjectManifestSha256 = requireSha256(
    sha256File(normalizedSubjectManifestPath),
    "localSubjectManifestSha256",
  );
  if (verifiedSubjectManifestSha256 !== localSubjectManifestSha256) {
    throw new Error("GitHub offline attestation verification subject digest does not match the local subject manifest.");
  }

  const subject = readJson(
    normalizedSubjectManifestPath,
    "Production release subject manifest",
  );
  validateSubjectDocument({
    document: subject,
    fileSha256: localSubjectManifestSha256,
    gitEvidence,
    manifest,
    repository: normalizedRepository,
  });
  validatePredicateDocument({
    manifest,
    predicate: statement.predicate,
    repository: normalizedRepository,
    subjectManifestSha256: verifiedSubjectManifestSha256,
  });

  return {
    source: "github-attestation-offline",
    subject_manifest_sha256: verifiedSubjectManifestSha256,
    verified: true,
    verificationPayload,
  };
}

/**
 * @param {{
 *   bundlePath?: string | null,
 *   ghExecutable?: string | null,
 *   repository?: string | null,
 *   runGh?: typeof spawnSync,
 *   sha256File?: (path: string) => string,
 *   signerWorkflow?: string | null,
 *   subjectManifestPath?: string | null,
 *   trustedRootPath?: string | null,
 * }} [config]
 */
export function createGitHubProductionReleaseAttestationVerifier(config = {}) {
  return (input) => verifyGitHubProductionReleaseAttestation({
    ...config,
    ...input,
  });
}
