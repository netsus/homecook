import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const GITHUB_PRODUCTION_RELEASE_SUBJECT_SCHEMA =
  "homecook.github.production-release-manifest.v1";
export const GITHUB_PRODUCTION_RELEASE_PREDICATE_SCHEMA =
  "homecook.github.production-release-predicate.v1";
export const GITHUB_PRODUCTION_RELEASE_PREDICATE_TYPE =
  "https://github.com/shj/homecook/attestations/production-release/v1";

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

function sameCheckSummary(left, right) {
  const leftSummary = requireCheckSummary(left, "leftCheckSummary");
  const rightSummary = requireCheckSummary(right, "rightCheckSummary");
  return Object.keys(leftSummary).every(
    (key) => leftSummary[key] === rightSummary[key],
  );
}

function checkKey(entry) {
  const workflow = requireNonEmptyString(
    entry.workflow ?? entry.workflow_name ?? entry.app_slug ?? "unknown-workflow",
    "check.workflow",
  );
  const name = requireNonEmptyString(entry.name, "check.name");
  return `${workflow.toLowerCase()}::${name.toLowerCase()}`;
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

export function normalizeGitHubProductionReleaseCheckSummary(checkRuns = []) {
  if (!Array.isArray(checkRuns)) {
    throw new Error("GitHub production release check runs must be an array.");
  }

  const byKey = new Map();
  for (const entry of checkRuns) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("Each production release check run must be an object.");
    }
    const normalized = {
      bucket: normalizeBucket(entry),
      key: checkKey(entry),
      timestamp: sortTimestamp(entry),
    };
    const current = byKey.get(normalized.key);
    if (
      !current
      || normalized.timestamp > current.timestamp
      || (
        normalized.timestamp === current.timestamp
        && normalized.bucket === "pending"
        && current.bucket !== "pending"
      )
    ) {
      byKey.set(normalized.key, normalized);
    } else if (current.timestamp > normalized.timestamp && current.bucket !== normalized.bucket) {
      current.rerun = true;
    }
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

  for (const entry of byKey.values()) {
    summary.total += 1;
    summary[entry.bucket] += 1;
    if (entry.rerun) {
      summary.rerun += 1;
    }
  }

  if (summary.pending > 0 || summary.queued > 0 || summary.failed > 0 || summary.cancelled > 0) {
    throw new Error("Production release terminal check summary contains pending, failed, or cancelled checks.");
  }

  return summary;
}

/**
 * @param {{
 *   checkRuns: Array<Record<string, unknown>>,
 *   predicateOutputPath?: string | null,
 *   releaseSha: string,
 *   releaseTag: string,
 *   releaseTree: string,
 *   repository: string,
 *   subjectOutputPath?: string | null,
 * }} [options]
 */
export function buildGitHubProductionReleaseAttestationArtifacts({
  checkRuns,
  predicateOutputPath = null,
  releaseSha,
  releaseTag,
  releaseTree,
  repository,
  subjectOutputPath = null,
} = {}) {
  const subject = {
    schema: GITHUB_PRODUCTION_RELEASE_SUBJECT_SCHEMA,
    repository: requireNonEmptyString(repository, "repository"),
    release_tag: requireNonEmptyString(releaseTag, "releaseTag"),
    release_sha: requireSha1(releaseSha, "releaseSha"),
    release_tree: requireSha1(releaseTree, "releaseTree"),
    required_check_summary: normalizeGitHubProductionReleaseCheckSummary(checkRuns),
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
    release_tag: subject.release_tag,
    release_sha: subject.release_sha,
    release_tree: subject.release_tree,
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
}) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("Production release subject manifest must be a JSON object.");
  }
  if (document.schema !== GITHUB_PRODUCTION_RELEASE_SUBJECT_SCHEMA) {
    throw new Error(
      `Production release subject manifest schema must be ${GITHUB_PRODUCTION_RELEASE_SUBJECT_SCHEMA}.`,
    );
  }

  if (requireNonEmptyString(document.repository, "subject.repository") !== requireNonEmptyString(manifest.repository ?? document.repository, "manifest.repository")) {
    // repository identity is enforced by gh attestation verify --repo
  }
  if (requireNonEmptyString(document.release_tag, "subject.release_tag") !== requireNonEmptyString(manifest.release_tag, "manifest.release_tag")) {
    throw new Error("Production release subject manifest tag does not match the release manifest.");
  }
  if (requireSha1(document.release_sha, "subject.release_sha") !== requireSha1(manifest.release_sha, "manifest.release_sha")) {
    throw new Error("Production release subject manifest SHA does not match the release manifest.");
  }
  if (requireSha1(document.release_tree, "subject.release_tree") !== requireSha1(manifest.release_tree, "manifest.release_tree")) {
    throw new Error("Production release subject manifest tree does not match the release manifest.");
  }
  if (document.release_sha !== requireSha1(gitEvidence.originMasterSha, "gitEvidence.originMasterSha")) {
    throw new Error("Production release subject manifest SHA does not match current origin/master evidence.");
  }
  if (document.release_tree !== requireSha1(gitEvidence.releaseTreeSha, "gitEvidence.releaseTreeSha")) {
    throw new Error("Production release subject manifest tree does not match current git tree evidence.");
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
}) {
  if (!predicate || typeof predicate !== "object" || Array.isArray(predicate)) {
    throw new Error("Production release attestation predicate must be a JSON object.");
  }
  if (predicate.schema !== GITHUB_PRODUCTION_RELEASE_PREDICATE_SCHEMA) {
    throw new Error(
      `Production release attestation predicate schema must be ${GITHUB_PRODUCTION_RELEASE_PREDICATE_SCHEMA}.`,
    );
  }
  if (requireNonEmptyString(predicate.repository, "predicate.repository") !== requireNonEmptyString(manifest.repository ?? predicate.repository, "manifest.repository")) {
    // repository identity is enforced by gh attestation verify --repo
  }
  if (requireNonEmptyString(predicate.release_tag, "predicate.release_tag") !== requireNonEmptyString(manifest.release_tag, "manifest.release_tag")) {
    throw new Error("Production release attestation predicate tag does not match the release manifest.");
  }
  if (requireSha1(predicate.release_sha, "predicate.release_sha") !== requireSha1(manifest.release_sha, "manifest.release_sha")) {
    throw new Error("Production release attestation predicate SHA does not match the release manifest.");
  }
  if (requireSha1(predicate.release_tree, "predicate.release_tree") !== requireSha1(manifest.release_tree, "manifest.release_tree")) {
    throw new Error("Production release attestation predicate tree does not match the release manifest.");
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
  const normalizedRepository = requireNonEmptyString(repository, "repository");
  const normalizedSignerWorkflow = requireNonEmptyString(
    signerWorkflow,
    "signerWorkflow",
  );

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
    "--predicate-type",
    GITHUB_PRODUCTION_RELEASE_PREDICATE_TYPE,
    "--source-digest",
    requireSha1(manifest.release_sha, "manifest.release_sha"),
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
  });
  validatePredicateDocument({
    manifest,
    predicate: statement.predicate,
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
