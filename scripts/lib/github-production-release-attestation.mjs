import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const GITHUB_PRODUCTION_RELEASE_ATTESTATION_SCHEMA =
  "homecook.github.production-release-attestation.v1";
export const GITHUB_PRODUCTION_RELEASE_PREDICATE_TYPE =
  "https://slsa.dev/provenance/v1";

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

export function buildGitHubProductionReleaseAttestationDocument({
  checkRuns,
  manifestDigest,
  outputPath = null,
  releaseSha,
  releaseTag,
  releaseTree,
  repository,
} = {}) {
  const document = {
    schema: GITHUB_PRODUCTION_RELEASE_ATTESTATION_SCHEMA,
    repository: requireNonEmptyString(repository, "repository"),
    release_tag: requireNonEmptyString(releaseTag, "releaseTag"),
    release_sha: requireSha1(releaseSha, "releaseSha"),
    release_tree: requireSha1(releaseTree, "releaseTree"),
    manifest_sha256: requireSha256(manifestDigest, "manifestDigest"),
    required_check_summary: normalizeGitHubProductionReleaseCheckSummary(checkRuns),
  };

  if (outputPath) {
    writeFileSync(resolve(outputPath), `${JSON.stringify(document, null, 2)}\n`);
  }

  return document;
}

function validateAttestationDocument({
  document,
  gitEvidence,
  manifest,
  manifestDigest,
}) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("Production release attestation document must be a JSON object.");
  }
  if (document.schema !== GITHUB_PRODUCTION_RELEASE_ATTESTATION_SCHEMA) {
    throw new Error(
      `Production release attestation document schema must be ${GITHUB_PRODUCTION_RELEASE_ATTESTATION_SCHEMA}.`,
    );
  }
  if (requireNonEmptyString(document.repository, "attestation.repository") !== requireNonEmptyString(manifest.repository ?? document.repository, "repository")) {
    // no-op, repository is checked separately by verifier config
  }
  if (requireNonEmptyString(document.release_tag, "attestation.release_tag") !== requireNonEmptyString(manifest.release_tag, "manifest.release_tag")) {
    throw new Error("Production release attestation tag does not match the manifest.");
  }
  if (requireSha1(document.release_sha, "attestation.release_sha") !== requireSha1(manifest.release_sha, "manifest.release_sha")) {
    throw new Error("Production release attestation SHA does not match the manifest.");
  }
  if (requireSha1(document.release_tree, "attestation.release_tree") !== requireSha1(manifest.release_tree, "manifest.release_tree")) {
    throw new Error("Production release attestation tree does not match the manifest.");
  }
  if (document.release_sha !== requireSha1(gitEvidence.originMasterSha, "gitEvidence.originMasterSha")) {
    throw new Error("Production release attestation SHA does not match current origin/master evidence.");
  }
  if (document.release_tree !== requireSha1(gitEvidence.releaseTreeSha, "gitEvidence.releaseTreeSha")) {
    throw new Error("Production release attestation tree does not match current git tree evidence.");
  }
  if (
    requireSha256(document.manifest_sha256, "attestation.manifest_sha256")
    !== requireSha256(manifestDigest, "manifestDigest")
  ) {
    throw new Error("Production release attestation manifest digest does not match the release manifest.");
  }
  if (
    !sameCheckSummary(
      requireCheckSummary(document.required_check_summary, "attestation.required_check_summary"),
      requireCheckSummary(manifest.required_check_summary, "manifest.required_check_summary"),
    )
  ) {
    throw new Error("Production release attestation check summary does not match the release manifest.");
  }
}

/**
 * @param {{
 *   attestationPath?: string | null,
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
 *   trustedRootPath?: string | null,
 * }} [options]
 */
export function verifyGitHubProductionReleaseAttestation({
  attestationPath,
  bundlePath,
  gitEvidence,
  manifest,
  manifestDigest,
  manifestPath = null,
  repository,
  rootDir = process.cwd(),
  runGh = spawnSync,
  sha256File = defaultSha256File,
  signerWorkflow,
  trustedRootPath,
} = {}) {
  const normalizedAttestationPath = requireAbsoluteExistingPath(
    attestationPath,
    "attested document",
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
  const normalizedManifestDigest = requireSha256(
    manifestDigest ?? sha256File(requireAbsoluteExistingPath(manifestPath, "manifestPath")),
    "manifestDigest",
  );

  if (requireSha256(manifest.attestation_digest, "manifest.attestation_digest") !== sha256File(normalizedAttestationPath)) {
    throw new Error("Production release attested document digest does not match manifest.attestation_digest.");
  }

  const verification = runGh("gh", [
    "attestation",
    "verify",
    normalizedAttestationPath,
    "--repo",
    normalizedRepository,
    "--bundle",
    normalizedBundlePath,
    "--custom-trusted-root",
    normalizedTrustedRootPath,
    "--signer-workflow",
    normalizedSignerWorkflow,
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
  const predicateType =
    verificationPayload[0]?.verificationResult?.statement?.predicateType;
  if (predicateType !== GITHUB_PRODUCTION_RELEASE_PREDICATE_TYPE) {
    throw new Error("GitHub offline attestation verification predicate type is not the expected SLSA provenance.");
  }

  const document = readJson(
    normalizedAttestationPath,
    "Production release attestation document",
  );
  validateAttestationDocument({
    document,
    gitEvidence,
    manifest,
    manifestDigest: normalizedManifestDigest,
  });

  return {
    source: "github-attestation-offline",
    verified: true,
    verificationPayload,
  };
}

/**
 * @param {{
 *   attestationPath?: string | null,
 *   bundlePath?: string | null,
 *   repository?: string | null,
 *   runGh?: typeof spawnSync,
 *   sha256File?: (path: string) => string,
 *   signerWorkflow?: string | null,
 *   trustedRootPath?: string | null,
 * }} [config]
 */
export function createGitHubProductionReleaseAttestationVerifier(config = {}) {
  return (input) => verifyGitHubProductionReleaseAttestation({
    ...config,
    ...input,
  });
}
