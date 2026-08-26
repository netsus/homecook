import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

export {
  CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
  CANONICAL_GITHUB_PRODUCTION_RELEASE_SIGNER_WORKFLOW,
  CANONICAL_GITHUB_PRODUCTION_RELEASE_SOURCE_REF,
  GITHUB_ACTIONS_APP_INTEGRATION_ID,
} from "./production-release-approval-policy.mjs";

export const GITHUB_PRODUCTION_RELEASE_SUBJECT_SCHEMA =
  "homecook.github.production-release-manifest.v1";
export const GITHUB_PRODUCTION_RELEASE_PREDICATE_SCHEMA =
  "homecook.github.production-release-predicate.v1";
export const GITHUB_PRODUCTION_RELEASE_PREDICATE_TYPE =
  "https://github.com/netsus/homecook/attestations/production-release/v1";
export const GITHUB_CLI_TRUSTED_ROOT_SHA256 =
  "65ca537f6ed8a47fd0e560c421baa1f6c1efb8b25fc200d8c5c02c0e92eb2b9c";

const SHA1_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

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
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("excludedCheckSuiteIds must be a nonempty array.");
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
  if (["skipped", "neutral"].includes(conclusion)) {
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

export function normalizeGitHubProductionReleaseCheckSummary({
  checkRuns = [],
  commitStatuses = [],
  excludedCheckSuiteIds = null,
  expectedContexts = EXPECTED_RELEASE_CONTEXTS,
} = {}) {
  if (!Array.isArray(checkRuns)) {
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
  const observedExcludedSuiteIds = new Set();
  const byKey = new Map();
  for (const entry of checkRuns) {
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
      bucket: normalizeBucket(entry),
      context: contextKey(entry.name ?? entry.context, "check.context"),
      timestamp: sortTimestamp(entry),
    };
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
    const bucket = byKey.get(normalized.context) ?? [];
    bucket.push(normalized);
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
    const latestTimestamp = Math.max(...entries.map((entry) => entry.timestamp));
    const latestEntries = entries.filter((entry) => entry.timestamp === latestTimestamp);
    const latestBuckets = new Set(latestEntries.map((entry) => entry.bucket));
    if (latestBuckets.size !== 1 || !latestBuckets.has("success")) {
      throw new Error(
        `Production release latest trusted expected context must be exactly success: ${expectedContext}.`,
      );
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

  return summary;
}

/**
 * @param {{
 *   checkRuns: Array<Record<string, unknown>>,
 *   commitStatuses?: Array<Record<string, unknown>>,
 *   excludedCheckSuiteIds?: number[] | null,
 *   expectedContexts?: string[],
 *   predicateOutputPath?: string | null,
 *   releaseSha: string,
 *   releaseTag: string,
 *   releaseTagObjectSha: string,
 *   releaseTree: string,
 *   repository: string,
 *   subjectOutputPath?: string | null,
 * }} [options]
 */
export function buildGitHubProductionReleaseAttestationArtifacts({
  checkRuns,
  commitStatuses = [],
  excludedCheckSuiteIds = null,
  expectedContexts = EXPECTED_RELEASE_CONTEXTS,
  predicateOutputPath = null,
  releaseSha,
  releaseTag,
  releaseTagObjectSha,
  releaseTree,
  repository,
  subjectOutputPath = null,
} = {}) {
  const normalizedReleaseSha = requireSha1(releaseSha, "releaseSha");
  const subject = {
    schema: GITHUB_PRODUCTION_RELEASE_SUBJECT_SCHEMA,
    repository: requireCanonicalString(
      repository,
      CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
      "repository",
    ),
    source_ref: CANONICAL_GITHUB_PRODUCTION_RELEASE_SOURCE_REF,
    signer_workflow: CANONICAL_GITHUB_PRODUCTION_RELEASE_SIGNER_WORKFLOW,
    signer_digest: normalizedReleaseSha,
    expected_release_integration_id: GITHUB_ACTIONS_APP_INTEGRATION_ID,
    release_tag: validateProductionReleaseTag(releaseTag, "releaseTag"),
    release_tag_object_sha: requireSha1(
      releaseTagObjectSha,
      "releaseTagObjectSha",
    ),
    release_sha: normalizedReleaseSha,
    release_tree: requireSha1(releaseTree, "releaseTree"),
    expected_release_contexts: normalizeExpectedReleaseContexts(
      expectedContexts,
      "expected_release_contexts",
    ),
    required_check_summary: normalizeGitHubProductionReleaseCheckSummary({
      checkRuns,
      commitStatuses,
      excludedCheckSuiteIds,
      expectedContexts,
    }),
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
    schema: GITHUB_PRODUCTION_RELEASE_PREDICATE_SCHEMA,
    repository: subject.repository,
    source_ref: subject.source_ref,
    signer_workflow: subject.signer_workflow,
    signer_digest: subject.signer_digest,
    expected_release_integration_id: subject.expected_release_integration_id,
    release_tag: subject.release_tag,
    release_tag_object_sha: subject.release_tag_object_sha,
    release_sha: subject.release_sha,
    release_tree: subject.release_tree,
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
  if (document.schema !== GITHUB_PRODUCTION_RELEASE_SUBJECT_SCHEMA) {
    throw new Error(
      `Production release subject manifest schema must be ${GITHUB_PRODUCTION_RELEASE_SUBJECT_SCHEMA}.`,
    );
  }

  if (requireNonEmptyString(document.repository, "subject.repository") !== repository) {
    throw new Error("Production release subject manifest repository does not match the verifier repository.");
  }
  requireCanonicalString(document.source_ref, CANONICAL_GITHUB_PRODUCTION_RELEASE_SOURCE_REF, "subject.source_ref");
  requireCanonicalString(document.signer_workflow, CANONICAL_GITHUB_PRODUCTION_RELEASE_SIGNER_WORKFLOW, "subject.signer_workflow");
  if (requireSha1(document.signer_digest, "subject.signer_digest") !== requireSha1(manifest.release_sha, "manifest.release_sha")) {
    throw new Error("Production release subject signer digest does not match the release SHA.");
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
  if (predicate.schema !== GITHUB_PRODUCTION_RELEASE_PREDICATE_SCHEMA) {
    throw new Error(
      `Production release attestation predicate schema must be ${GITHUB_PRODUCTION_RELEASE_PREDICATE_SCHEMA}.`,
    );
  }
  if (requireNonEmptyString(predicate.repository, "predicate.repository") !== repository) {
    throw new Error("Production release attestation predicate repository does not match the verifier repository.");
  }
  requireCanonicalString(predicate.source_ref, CANONICAL_GITHUB_PRODUCTION_RELEASE_SOURCE_REF, "predicate.source_ref");
  requireCanonicalString(predicate.signer_workflow, CANONICAL_GITHUB_PRODUCTION_RELEASE_SIGNER_WORKFLOW, "predicate.signer_workflow");
  if (requireSha1(predicate.signer_digest, "predicate.signer_digest") !== requireSha1(manifest.release_sha, "manifest.release_sha")) {
    throw new Error("Production release predicate signer digest does not match the release SHA.");
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
 *   gitEvidence: {
 *     originMasterSha: string,
 *     releaseTreeSha: string,
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
    ? requireSha1(manifest.release_sha, "manifest.release_sha")
    : requireSha1(signerDigest, "signerDigest");
  if (normalizedSignerDigest !== requireSha1(manifest.release_sha, "manifest.release_sha")) {
    throw new Error("signerDigest must equal the exact release SHA.");
  }
  const trustedRootDigest = requireSha256(
    sha256File(normalizedTrustedRootPath),
    "trustedRootSha256",
  );
  if (trustedRootDigest !== GITHUB_CLI_TRUSTED_ROOT_SHA256) {
    throw new Error("GitHub CLI custom trusted root SHA-256 does not match the pinned digest.");
  }

  const verification = runGh("gh", [
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
    GITHUB_PRODUCTION_RELEASE_PREDICATE_TYPE,
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
  if (statement?.predicateType !== GITHUB_PRODUCTION_RELEASE_PREDICATE_TYPE) {
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
