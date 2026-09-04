import { createHash } from "node:crypto";

import { createLocalMacProductionPromoteAdapters } from "./local-mac-production-promote-adapters.mjs";

export const CAMPAIGN_RELEASE_EXPIRES_AT = "2026-09-15T15:00:00.000Z";
export const CAMPAIGN_RELEASE_SCHEMA = "homecook.marketing-campaign-fast-release.v1";
export const CAMPAIGN_RELEASE_REQUIRED_CONTEXTS = Object.freeze([
  "build",
  "changes",
  "dependency-audit",
  "policy",
  "quality",
  "security-function-authorization",
  "security-smoke",
]);

const REPOSITORY = "netsus/homecook";
const SOURCE_REF = "refs/heads/master";
const ACTIONS_APP_ID = 15368;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
const TAG_PATTERN = /^prod-[0-9]{8}\.[1-9][0-9]*$/u;
const MUTATING_COMMANDS = new Set(["plan", "prepare", "rehearse", "promote"]);
const READ_ONLY_COMMANDS = new Set(["status", "verify"]);
const SECRET_KEY_PATTERN = /(?:^|_)(?:access_key|api_key|argv|cookie|credential|env|password|payload|private_key|secret|service_role_key|stderr|stdout|token)(?:_|$)/iu;
const SECRET_VALUE_PATTERNS = [
  /authorization\s*:\s*bearer\s+\S+/iu,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u,
  /\bgh[ps]_[A-Za-z0-9_]{20,}\b/u,
  /^\//u,
];
const MANIFEST_FIELDS = new Set([
  "schema", "expires_at", "repository", "source_ref", "release_sha", "release_tree",
  "build_id", "release_bundle_sha256", "required_ci_evidence_sha256",
  "rehearsal_receipt_sha256", "production_snapshot_sha256", "backup_receipt_sha256",
  "approval_authority_sha256", "previous_bundle", "release_tag", "manifest_sha256",
]);
const COMPONENT_FIELDS = new Set([
  "component", "release_sha", "build_id", "release_bundle_sha256",
]);
const PREVIOUS_BUNDLE_FIELDS = new Set(["release_sha", "build_id", "release_bundle_sha256"]);
const POSTDEPLOY_FIELDS = new Set([
  "components", "full_local", "worker_identity", "internal_readiness", "public_http", "marketing",
]);
const POSTDEPLOY_FULL_LOCAL_FIELDS = new Set([
  "healthy_services", "auth_jwks", "volume_provenance", "migration_head", "authorization_contract",
]);
const POSTDEPLOY_HTTP_FIELDS = new Set(["root", "beta", "privacy", "auth_health"]);
const POSTDEPLOY_MARKETING_FIELDS = new Set([
  "canary_id", "api", "state", "database", "analytics_excludes_canary",
]);

function fail(message) {
  throw new Error(message);
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function requireExactKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key)).sort();
  if (unknown.length > 0) fail(`${label} contains unknown fields: ${unknown.join(", ")}.`);
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    fail(`${label} must be a non-empty exact string.`);
  }
  return value;
}

function requireExact(value, expected, label) {
  if (value !== expected) fail(`${label} must be ${String(expected)}.`);
  return value;
}

function requireSha(value, label) {
  if (!SHA_PATTERN.test(requireString(value, label))) {
    fail(`${label} must be an exact lowercase 40-character SHA.`);
  }
  return value;
}

function requireDigest(value, label) {
  if (!DIGEST_PATTERN.test(requireString(value, label))) {
    fail(`${label} must be an exact lowercase SHA-256 digest.`);
  }
  return value;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function authorityDigest(value, digestField) {
  const copy = { ...requireObject(value, "Authority artifact") };
  delete copy[digestField];
  return sha256(canonicalJson(copy));
}

export function sealCampaignAuthorityArtifact(value, digestField) {
  const field = requireString(digestField, "Authority digest field");
  const payload = { ...requireObject(value, "Authority artifact") };
  delete payload[field];
  assertNoCampaignSecretMaterial(payload);
  return Object.freeze({ ...payload, [field]: authorityDigest(payload, field) });
}

function verifyCampaignAuthorityArtifact(value, digestField, label) {
  const artifact = requireObject(value, `${label} authority input`);
  const observed = requireDigest(artifact[digestField], `${label}.${digestField}`);
  const expected = authorityDigest(artifact, digestField);
  if (observed !== expected) fail(`${label}.${digestField} does not match the actual authority bytes.`);
  assertNoCampaignSecretMaterial(artifact);
  return artifact;
}

function compareLatest(left, right) {
  const timestamp = Date.parse(left.completed_at) - Date.parse(right.completed_at);
  if (timestamp !== 0) return timestamp;
  return Number(left.id) - Number(right.id);
}

/**
 * @param {{
 *   command: string,
 *   now?: Date | string | number,
 *   activeTransaction?: { started_at: string, state: string } | null,
 *   beforeSensitiveAccess?: (() => unknown) | null,
 * }} options
 */
export function assertCampaignCommandAllowed({
  command,
  now = new Date(),
  activeTransaction = null,
  beforeSensitiveAccess = null,
} = {}) {
  const normalized = requireString(command, "Campaign command");
  const instant = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(instant.getTime())) fail("Campaign command clock is invalid.");
  const expired = instant.getTime() >= Date.parse(CAMPAIGN_RELEASE_EXPIRES_AT);

  if (READ_ONLY_COMMANDS.has(normalized)) return normalized;
  if (normalized === "rollback") {
    if (!expired) return normalized;
    const transaction = requireObject(
      activeTransaction,
      "Rollback requires an active pre-expiry transaction",
    );
    const startedAt = Date.parse(transaction.started_at);
    if (!Number.isFinite(startedAt)
      || startedAt >= Date.parse(CAMPAIGN_RELEASE_EXPIRES_AT)
      || transaction.state !== "failed_deploy") {
      fail("Rollback requires an active pre-expiry transaction in failed_deploy state.");
    }
    return normalized;
  }
  if (!MUTATING_COMMANDS.has(normalized)) fail(`Unknown campaign command: ${normalized}.`);
  if (expired) {
    fail(`campaign_release_expired: ${normalized} is disabled after ${CAMPAIGN_RELEASE_EXPIRES_AT}.`);
  }
  if (typeof beforeSensitiveAccess === "function") beforeSensitiveAccess();
  return normalized;
}

export function verifyCampaignActiveTransaction(value) {
  const transaction = verifyCampaignAuthorityArtifact(
    value,
    "transaction_sha256",
    "active_transaction",
  );
  requireExact(
    transaction.schema,
    "homecook.marketing-campaign-production-transaction.v1",
    "active_transaction.schema",
  );
  requireString(transaction.transaction_id, "active_transaction.transaction_id");
  requireSha(transaction.release_sha, "active_transaction.release_sha");
  requireSha(transaction.previous_release_sha, "active_transaction.previous_release_sha");
  requireExact(transaction.state, "failed_deploy", "active_transaction.state");
  const startedAt = Date.parse(transaction.started_at);
  if (!Number.isFinite(startedAt) || startedAt >= Date.parse(CAMPAIGN_RELEASE_EXPIRES_AT)) {
    fail("Active transaction must have started before campaign expiry.");
  }
  return transaction;
}

export function selectLatestRequiredCampaignChecks({ releaseSha, checkRuns }) {
  requireSha(releaseSha, "releaseSha");
  if (!Array.isArray(checkRuns)) fail("checkRuns must be an array.");

  const selected = CAMPAIGN_RELEASE_REQUIRED_CONTEXTS.map((name) => {
    const candidates = checkRuns.filter((check) => check?.name === name);
    if (candidates.length === 0) fail(`Missing required check ${name}.`);
    for (const check of candidates) {
      if (check.head_sha !== releaseSha
        || check.repository?.full_name !== REPOSITORY
        || check.app?.id !== ACTIONS_APP_ID
        || !Number.isInteger(check.id)
        || !Number.isFinite(Date.parse(check.completed_at))) {
        fail(`Required check ${name} has invalid SHA, repository, owner, id, or completion metadata.`);
      }
    }
    const latest = [...candidates].sort(compareLatest).at(-1);
    if (latest.status !== "completed" || latest.conclusion !== "success") {
      fail(`The latest required check ${name} is not completed/success.`);
    }
    return {
      completed_at: new Date(latest.completed_at).toISOString(),
      conclusion: latest.conclusion,
      id: latest.id,
      name,
      status: latest.status,
    };
  });
  const evidence = {
    integration_id: ACTIONS_APP_ID,
    release_sha: releaseSha,
    repository: REPOSITORY,
    checks: selected,
  };
  return Object.freeze({ ...evidence, sha256: sha256(canonicalJson(evidence)) });
}

export function assertNoCampaignSecretMaterial(value, path = "evidence") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoCampaignSecretMaterial(entry, `${path}[${index}]`));
    return value;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (SECRET_KEY_PATTERN.test(key)) fail(`Campaign evidence contains secret material at ${path}.${key}.`);
      assertNoCampaignSecretMaterial(entry, `${path}.${key}`);
    }
    return value;
  }
  if (typeof value === "string" && SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
    fail(`Campaign evidence contains secret material at ${path}.`);
  }
  return value;
}

function validateComponents(value, manifest) {
  if (!Array.isArray(value) || value.length !== 3) {
    fail("components must contain exact app, full-local, and youtube-worker identities.");
  }
  const expected = ["app", "full-local", "youtube-worker"];
  if (value.map((entry) => entry?.component).sort().join(",") !== [...expected].sort().join(",")) {
    fail("components must contain exact app, full-local, and youtube-worker identities.");
  }
  for (const component of value) {
    requireExactKeys(component, COMPONENT_FIELDS, `component ${component.component ?? "unknown"}`);
    if (component.release_sha !== manifest.release_sha
      || component.build_id !== manifest.build_id
      || component.release_bundle_sha256 !== manifest.release_bundle_sha256) {
      fail(`Component ${component.component} violates release bundle parity.`);
    }
  }
}

function validatePreviousBundle(value) {
  const previous = requireObject(value, "previous_bundle");
  requireExactKeys(previous, PREVIOUS_BUNDLE_FIELDS, "previous_bundle");
  requireSha(previous.release_sha, "previous_bundle.release_sha");
  requireString(previous.build_id, "previous_bundle.build_id");
  requireDigest(previous.release_bundle_sha256, "previous_bundle.release_bundle_sha256");
  return previous;
}

export function validateCampaignManifest(value, { now = null, requireFresh = false } = {}) {
  const manifest = requireObject(value, "Campaign manifest");
  requireExactKeys(manifest, MANIFEST_FIELDS, "Campaign manifest");
  requireExact(manifest.schema, CAMPAIGN_RELEASE_SCHEMA, "schema");
  requireExact(manifest.expires_at, CAMPAIGN_RELEASE_EXPIRES_AT, "expires_at");
  requireExact(manifest.repository, REPOSITORY, "repository");
  requireExact(manifest.source_ref, SOURCE_REF, "source_ref");
  requireSha(manifest.release_sha, "release_sha");
  requireSha(manifest.release_tree, "release_tree");
  requireString(manifest.build_id, "build_id");
  requireDigest(manifest.release_bundle_sha256, "release_bundle_sha256");
  for (const field of [
    "required_ci_evidence_sha256",
    "rehearsal_receipt_sha256",
    "production_snapshot_sha256",
    "backup_receipt_sha256",
    "approval_authority_sha256",
  ]) requireDigest(manifest[field], field);
  validatePreviousBundle(manifest.previous_bundle);
  if (!TAG_PATTERN.test(requireString(manifest.release_tag, "release_tag"))) {
    fail("release_tag must match prod-YYYYMMDD.N.");
  }
  assertNoCampaignSecretMaterial(manifest);
  const withoutDigest = { ...manifest };
  delete withoutDigest.manifest_sha256;
  const expectedDigest = sha256(canonicalJson(withoutDigest));
  if (manifest.manifest_sha256 !== expectedDigest) fail("manifest_sha256 is invalid.");
  if (requireFresh) {
    assertCampaignCommandAllowed({ command: "promote", now: now ?? new Date() });
  }
  return manifest;
}

export function buildCampaignManifest(input) {
  const withoutDigest = { ...requireObject(input, "Campaign manifest input") };
  delete withoutDigest.manifest_sha256;
  const manifest = {
    ...withoutDigest,
    manifest_sha256: sha256(canonicalJson(withoutDigest)),
  };
  return Object.freeze(validateCampaignManifest(manifest));
}

function validateBundleAuthority(bundle, bundleBytes) {
  const authority = verifyCampaignAuthorityArtifact(bundle, "authority_sha256", "bundle");
  requireExact(authority.schema, "homecook.marketing-campaign-bundle-authority.v1", "bundle.schema");
  requireSha(authority.release_sha, "bundle.release_sha");
  requireSha(authority.release_tree, "bundle.release_tree");
  requireString(authority.build_id, "bundle.build_id");
  requireDigest(authority.release_bundle_sha256, "bundle.release_bundle_sha256");
  if (!Buffer.isBuffer(bundleBytes) || sha256(bundleBytes) !== authority.release_bundle_sha256) {
    fail("Actual sealed bundle bytes do not match release_bundle_sha256.");
  }
  validateComponents(authority.components, authority);
  validateCampaignAuthorityProducer(authority.producer, authority.release_sha);
  return authority;
}

function validateCampaignAuthorityProducer(value, releaseSha) {
  const producer = requireObject(value, "authority producer");
  requireExact(producer.repository, REPOSITORY, "authority producer.repository");
  requireExact(
    producer.workflow_path,
    ".github/workflows/marketing-campaign-release-authority.yml",
    "authority producer.workflow_path",
  );
  requireExact(producer.workflow_head_sha, releaseSha, "authority producer.workflow_head_sha");
  requireExact(producer.workflow_run_attempt, 1, "authority producer.workflow_run_attempt");
  if (!Number.isInteger(producer.workflow_run_id) || producer.workflow_run_id <= 0) {
    fail("authority producer.workflow_run_id must be a positive integer.");
  }
  return producer;
}

function validateRehearsalAuthority(rehearsal, bundle) {
  const receipt = verifyCampaignAuthorityArtifact(rehearsal, "receipt_sha256", "rehearsal");
  requireExact(receipt.schema, "homecook.marketing-campaign-rehearsal-receipt.v1", "rehearsal.schema");
  if (receipt.release_sha !== bundle.release_sha || receipt.build_id !== bundle.build_id
    || receipt.release_bundle_sha256 !== bundle.release_bundle_sha256) {
    fail("Rehearsal receipt is not bound to the actual sealed bundle.");
  }
  validateCampaignAuthorityProducer(receipt.producer, bundle.release_sha);
  if (receipt.run_count !== 1) fail("Rehearsal run_count must be exactly 1.");
  for (const [field, expected] of Object.entries({
    candidate_health: "pass", previous_bundle_rollback: "pass",
    production_guard: "unchanged", cleanup: "complete",
  })) requireExact(receipt[field], expected, `rehearsal.${field}`);
  const isolation = requireObject(receipt.isolation, "rehearsal.isolation");
  for (const field of ["private_root", "unique_docker_project", "unique_volumes", "fresh_database"]) {
    requireExact(isolation[field], true, `rehearsal.isolation.${field}`);
  }
  return receipt;
}

function validateSnapshotAuthority(snapshot, releaseSha) {
  const value = verifyCampaignAuthorityArtifact(snapshot, "snapshot_sha256", "production_snapshot");
  requireExact(value.schema, "homecook.marketing-campaign-production-snapshot.v1", "production_snapshot.schema");
  requireExact(value.complete, true, "production_snapshot.complete");
  requireExact(value.promotion_safe, true, "production_snapshot.promotion_safe");
  requireSha(value.previous_release_sha, "production_snapshot.previous_release_sha");
  requireDigest(value.inventory_sha256, "production_snapshot.inventory_sha256");
  validateCampaignAuthorityProducer(value.producer, releaseSha);
  requireString(value.captured_at, "production_snapshot.captured_at");
  return value;
}

function validateBackupAuthority(backup, snapshot, now, backupArchiveBytes) {
  const value = verifyCampaignAuthorityArtifact(backup, "receipt_sha256", "backup");
  requireExact(value.schema, "homecook.marketing-campaign-backup-receipt.v1", "backup.schema");
  requireExact(value.source_snapshot_sha256, snapshot.snapshot_sha256, "backup.source_snapshot_sha256");
  requireDigest(value.archive_sha256, "backup.archive_sha256");
  if (!Buffer.isBuffer(backupArchiveBytes) || sha256(backupArchiveBytes) !== value.archive_sha256) {
    fail("Actual encrypted backup archive bytes do not match backup.archive_sha256.");
  }
  requireExact(value.encrypted, true, "backup.encrypted");
  requireExact(value.verified, true, "backup.verified");
  validateCampaignAuthorityProducer(value.producer, snapshot.producer.workflow_head_sha);
  const createdAt = Date.parse(value.created_at);
  const current = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(createdAt) || !Number.isFinite(current)
    || createdAt > current || current - createdAt > 24 * 60 * 60 * 1000) {
    fail("Campaign promotion requires a fresh backup created within 24 hours.");
  }
  return value;
}

function validateApprovalAuthority(approval, releaseSha) {
  const value = verifyCampaignAuthorityArtifact(approval, "authority_sha256", "approval");
  requireExact(value.schema, "homecook.marketing-campaign-approval-authority.v1", "approval.schema");
  requireExact(value.environment, "production-release-approval", "approval.environment");
  requireExact(value.reviewer_id, 57648890, "approval.reviewer_id");
  requireExact(value.prevent_self_review, true, "approval.prevent_self_review");
  requireExact(value.workflow_run_attempt, 1, "approval.workflow_run_attempt");
  requireExact(value.workflow_head_sha, releaseSha, "approval.workflow_head_sha");
  const approvedAt = Date.parse(requireString(value.approved_at, "approval.approved_at"));
  if (!Number.isFinite(approvedAt) || approvedAt >= Date.parse(CAMPAIGN_RELEASE_EXPIRES_AT)) {
    fail("approval.approved_at must be before campaign expiry.");
  }
  if (!Number.isInteger(value.workflow_run_id) || value.workflow_run_id <= 0) {
    fail("approval.workflow_run_id must be a positive integer.");
  }
  return value;
}

export function buildCampaignManifestFromAuthorities({
  releaseTag, ciCheckRuns, bundleBytes, backupArchiveBytes, bundle, rehearsal, snapshot, backup, approval, previousBundle,
  now = new Date(),
}) {
  const bundleAuthority = validateBundleAuthority(bundle, bundleBytes);
  const ci = selectLatestRequiredCampaignChecks({
    releaseSha: bundleAuthority.release_sha,
    checkRuns: ciCheckRuns,
  });
  const rehearsalAuthority = validateRehearsalAuthority(rehearsal, bundleAuthority);
  const snapshotAuthority = validateSnapshotAuthority(snapshot, bundleAuthority.release_sha);
  const approvalAuthority = validateApprovalAuthority(approval, bundleAuthority.release_sha);
  const previous = validatePreviousBundle(previousBundle);
  requireExact(snapshotAuthority.previous_release_sha, previous.release_sha, "snapshot previous release");
  const backupAuthority = validateBackupAuthority(backup, snapshotAuthority, now, backupArchiveBytes);
  const snapshotAt = Date.parse(snapshotAuthority.captured_at);
  const backupAt = Date.parse(backupAuthority.created_at);
  const approvedAt = Date.parse(approvalAuthority.approved_at);
  if (!Number.isFinite(snapshotAt) || snapshotAt > backupAt || backupAt > approvedAt) {
    fail("Campaign snapshot, backup, and approval authority must be ordered.");
  }
  return buildCampaignManifest({
    schema: CAMPAIGN_RELEASE_SCHEMA,
    expires_at: CAMPAIGN_RELEASE_EXPIRES_AT,
    repository: REPOSITORY,
    source_ref: SOURCE_REF,
    release_sha: bundleAuthority.release_sha,
    release_tree: bundleAuthority.release_tree,
    build_id: bundleAuthority.build_id,
    release_bundle_sha256: bundleAuthority.release_bundle_sha256,
    required_ci_evidence_sha256: ci.sha256,
    rehearsal_receipt_sha256: rehearsalAuthority.receipt_sha256,
    production_snapshot_sha256: snapshotAuthority.snapshot_sha256,
    backup_receipt_sha256: backupAuthority.receipt_sha256,
    approval_authority_sha256: approvalAuthority.authority_sha256,
    previous_bundle: previous,
    release_tag: releaseTag,
  });
}

/** @param {Record<string, any>} options */
export function verifyCampaignPromotionAuthority({
  manifest, attestation, attestationBundleBytes, attestationVerifier, ciCheckRuns, bundleBytes,
  backupArchiveBytes, bundle, rehearsal, snapshot, backup, approval, now = new Date(),
}) {
  if (![manifest, attestation, attestationBundleBytes, ciCheckRuns, bundleBytes, backupArchiveBytes, bundle, rehearsal, snapshot, backup, approval]
    .every((value) => value !== undefined && value !== null)) {
    fail("Every campaign authority input is required for promotion.");
  }
  if (typeof attestationVerifier !== "function") {
    fail("Campaign promotion requires a cryptographic attestation verifier.");
  }
  const candidate = validateCampaignManifest(manifest, { now, requireFresh: true });
  const expected = buildCampaignManifestFromAuthorities({
    releaseTag: candidate.release_tag,
    ciCheckRuns,
    bundleBytes,
    backupArchiveBytes,
    bundle,
    rehearsal,
    snapshot,
    backup,
    approval,
    previousBundle: candidate.previous_bundle,
    now,
  });
  if (canonicalJson(expected) !== canonicalJson(candidate)) fail("Campaign manifest is not derived from actual authority inputs.");
  const snapshotAuthority = validateSnapshotAuthority(snapshot, candidate.release_sha);
  validateBackupAuthority(backup, snapshotAuthority, now, backupArchiveBytes);
  const attestationAuthority = verifyCampaignAuthorityArtifact(attestation, "attestation_sha256", "attestation");
  for (const [field, expectedValue] of Object.entries({
    schema: "homecook.marketing-campaign-attestation-authority.v1",
    repository: REPOSITORY,
    release_sha: candidate.release_sha,
    release_tag: candidate.release_tag,
    manifest_sha256: candidate.manifest_sha256,
    release_bundle_sha256: candidate.release_bundle_sha256,
    verified: true,
  })) requireExact(attestationAuthority[field], expectedValue, `attestation.${field}`);
  requireDigest(attestationAuthority.subject_sha256, "attestation.subject_sha256");
  requireDigest(attestationAuthority.predicate_sha256, "attestation.predicate_sha256");
  requireDigest(
    attestationAuthority.github_attestation_bundle_sha256,
    "attestation.github_attestation_bundle_sha256",
  );
  if (!Buffer.isBuffer(attestationBundleBytes)
    || sha256(attestationBundleBytes) !== attestationAuthority.github_attestation_bundle_sha256) {
    fail("GitHub attestation result bytes do not match the verified attestation authority.");
  }
  const cryptographic = attestationVerifier({
    attestationBundleBytes,
    attestationAuthority,
    manifest: candidate,
  });
  for (const [field, expectedValue] of Object.entries({
    verified: true,
    repository: REPOSITORY,
    signer_workflow: "netsus/homecook/.github/workflows/marketing-campaign-fast-release.yml",
    source_ref: SOURCE_REF,
    source_digest: candidate.release_sha,
    subject_sha256: attestationAuthority.subject_sha256,
  })) requireExact(cryptographic?.[field], expectedValue, `cryptographic attestation.${field}`);
  requireExact(
    cryptographic?.predicate?.manifest_sha256,
    candidate.manifest_sha256,
    "cryptographic attestation predicate.manifest_sha256",
  );
  requireExact(
    cryptographic?.predicate?.release_bundle_sha256,
    candidate.release_bundle_sha256,
    "cryptographic attestation predicate.release_bundle_sha256",
  );
  return Object.freeze({
    verified: true,
    manifest: candidate,
    release_bundle_sha256: candidate.release_bundle_sha256,
    authority_sha256: sha256(canonicalJson({
      manifest_sha256: candidate.manifest_sha256,
      attestation_sha256: attestationAuthority.attestation_sha256,
    })),
  });
}

export function validateCampaignPostdeployEvidence(value, manifest) {
  const evidence = requireObject(value, "Postdeploy evidence");
  requireExactKeys(evidence, POSTDEPLOY_FIELDS, "Postdeploy evidence");
  validateComponents(evidence.components, manifest);
  const fullLocal = requireObject(evidence.full_local, "Postdeploy full_local");
  requireExactKeys(fullLocal, POSTDEPLOY_FULL_LOCAL_FIELDS, "Postdeploy full_local");
  const expectedServices = [
    "api-gateway", "auth", "auth-proxy", "postgres", "postgrest", "postgrest-probe", "storage",
  ];
  if (!Array.isArray(fullLocal.healthy_services)
    || fullLocal.healthy_services.length !== expectedServices.length
    || [...fullLocal.healthy_services].sort().join(",") !== expectedServices.join(",")) {
    fail("Postdeploy full-local must report the exact seven healthy services.");
  }
  for (const field of ["auth_jwks", "volume_provenance", "migration_head", "authorization_contract"]) {
    requireExact(fullLocal[field], "pass", `Postdeploy full_local.${field}`);
  }
  requireExact(evidence.worker_identity, "pass", "Postdeploy worker_identity");
  requireExact(evidence.internal_readiness, "pass", "Postdeploy internal_readiness");
  const publicHttp = requireObject(evidence.public_http, "Postdeploy public_http");
  requireExactKeys(publicHttp, POSTDEPLOY_HTTP_FIELDS, "Postdeploy public_http");
  if (publicHttp.root !== 200 || publicHttp.beta !== 200
    || publicHttp.privacy !== 200 || publicHttp.auth_health !== 401) {
    fail("Campaign public HTTP checks failed.");
  }
  const marketing = requireObject(evidence.marketing, "Postdeploy marketing");
  requireExactKeys(marketing, POSTDEPLOY_MARKETING_FIELDS, "Postdeploy marketing");
  if (!/^release_canary_[A-Za-z0-9._-]+$/u.test(marketing.canary_id ?? "")) {
    fail("Marketing canary_id must be PII-free and release-scoped.");
  }
  for (const field of ["api", "state", "database", "analytics_excludes_canary"]) {
    requireExact(marketing[field], "pass", `Postdeploy marketing.${field}`);
  }
  assertNoCampaignSecretMaterial(evidence);
  return evidence;
}

/**
 * Keep the temporary lane on the existing transactional app/full-local/worker
 * operations. The activation task supplies the already-validated mutation
 * authority context and the existing production lock/recovery functions.
 *
 * @param {{
 *   productionAdapterFactory?: (options: Record<string, any>, dependencies?: Record<string, any>) => Record<string, Function>,
 *   productionAdapterOptions: Record<string, any>,
 *   productionAdapterDependencies?: Record<string, any>,
 *   contextFactory: (input: Record<string, any>) => Record<string, any>,
 *   acquireProductionLock: Function,
 *   releaseProductionLock: Function,
 *   rollbackPreviousBundle: Function,
 *   verifyPostdeployEvidence: Function,
 * }} options
 */
export function createCampaignProductionAdapterBridge({
  productionAdapterFactory = createLocalMacProductionPromoteAdapters,
  productionAdapterOptions,
  productionAdapterDependencies = {},
  contextFactory,
  acquireProductionLock,
  releaseProductionLock,
  rollbackPreviousBundle,
  verifyPostdeployEvidence,
}) {
  if (typeof contextFactory !== "function") fail("Campaign production contextFactory is required.");
  const production = productionAdapterFactory(
    productionAdapterOptions,
    productionAdapterDependencies,
  );
  const installBundle = requireAdapter(production, "installBundle");
  const readinessProbe = requireAdapter(production, "readinessProbe");
  const finalWorkerProbe = requireAdapter(production, "finalWorkerProbe");
  for (const [name, adapter] of Object.entries({
    acquireProductionLock,
    releaseProductionLock,
    rollbackPreviousBundle,
    verifyPostdeployEvidence,
  })) {
    if (typeof adapter !== "function") fail(`Campaign production bridge ${name} is required.`);
  }
  return Object.freeze({
    acquireProductionLock,
    releaseProductionLock,
    rollbackPreviousBundle,
    async installBundleTransactionally(input) {
      return installBundle(contextFactory(input));
    },
    async verifyPostdeploy(input) {
      const context = contextFactory(input);
      const readiness = await readinessProbe(context);
      const worker = await finalWorkerProbe(context);
      return verifyPostdeployEvidence({ ...input, context, readiness, worker });
    },
  });
}

export async function prepareCampaignBundle({ releaseSha, now = new Date(), adapters }) {
  assertCampaignCommandAllowed({ command: "prepare", now });
  requireSha(releaseSha, "releaseSha");
  const resolveMaster = requireAdapter(adapters, "resolveOriginMasterSha");
  const createCheckout = requireAdapter(adapters, "createCleanIsolatedCheckout");
  const install = requireAdapter(adapters, "installFrozenOffline");
  const build = requireAdapter(adapters, "buildSealedBundleOnce");
  const originMasterSha = await resolveMaster();
  if (originMasterSha !== releaseSha) fail("releaseSha must equal the exact current origin/master SHA.");
  const checkout = await createCheckout({ detached: true, releaseSha });
  if (checkout?.clean !== true || checkout?.head_sha !== releaseSha) {
    fail("Campaign checkout must be clean, isolated, detached, and exact-master.");
  }
  const installation = await install({
    checkout,
    flags: ["--frozen-lockfile", "--offline", "--package-import-method=copy"],
  });
  if (installation?.frozen !== true || installation?.offline !== true) {
    fail("Campaign dependency installation must be frozen and offline.");
  }
  const bundle = await build({ checkout, installation, releaseSha });
  requireString(bundle?.build_id, "Prepared build_id");
  requireDigest(bundle?.release_bundle_sha256, "Prepared release_bundle_sha256");
  validateComponents(bundle?.components, {
    release_sha: releaseSha,
    build_id: bundle.build_id,
    release_bundle_sha256: bundle.release_bundle_sha256,
  });
  return Object.freeze({
    release_sha: releaseSha,
    build_id: bundle.build_id,
    release_bundle_sha256: bundle.release_bundle_sha256,
    components: bundle.components,
    build_count: 1,
    install_count: 1,
  });
}

export async function rehearseCampaignBundle({ prepared, now = new Date(), adapters }) {
  assertCampaignCommandAllowed({ command: "rehearse", now });
  const bundle = requireObject(prepared, "Prepared campaign bundle");
  requireSha(bundle.release_sha, "Prepared release_sha");
  requireString(bundle.build_id, "Prepared build_id");
  requireDigest(bundle.release_bundle_sha256, "Prepared release_bundle_sha256");
  validateComponents(bundle.components, bundle);
  const reserveIsolation = requireAdapter(adapters, "reserveIsolation");
  const snapshot = requireAdapter(adapters, "snapshotProductionReadOnly");
  const runCandidate = requireAdapter(adapters, "runCandidateHealth");
  const runRollback = requireAdapter(adapters, "runPreviousBundleRollback");
  const cleanup = requireAdapter(adapters, "cleanupOwnedResources");
  const isolation = await reserveIsolation({ bundle });
  const port = isolation?.port;
  if (!Number.isInteger(port) || port < 20_000 || port > 60_999
    || new Set([3000, 3100, 5432, 54321, 54322, 54323, 54324]).has(port)) {
    fail("Rehearsal port must be one isolated high port in 20000..60999.");
  }
  for (const field of ["private_root", "unique_docker_project", "unique_volumes", "fresh_database"]) {
    requireExact(isolation[field], true, `Rehearsal isolation.${field}`);
  }
  const productionBefore = await snapshot({ phase: "before", readOnly: true });
  /** @type {unknown[]} */
  const failures = [];
  let cleanupResult = null;
  let productionAfter = null;
  try {
    const candidate = await runCandidate({ bundle, isolation, port });
    if (candidate?.status !== "pass") fail("Campaign candidate health failed.");
    const previous = await runRollback({ additiveMigrationHead: true, bundle, isolation, port });
    if (previous?.status !== "pass") fail("Campaign previous bundle rollback rehearsal failed.");
  } catch (error) {
    failures.push(error);
  } finally {
    try {
      cleanupResult = await cleanup({ bundle, isolation, port });
    } catch (error) {
      failures.push(error);
    }
    try {
      productionAfter = await snapshot({ phase: "after", readOnly: true });
    } catch (error) {
      failures.push(error);
    }
  }
  if (cleanupResult?.status !== "complete" || cleanupResult?.residue !== 0) {
    failures.push(new Error("Campaign rehearsal cleanup is incomplete."));
  }
  requireDigest(productionBefore?.digest, "Production pre-snapshot digest");
  requireDigest(productionAfter?.digest, "Production post-snapshot digest");
  if (productionBefore.digest !== productionAfter.digest) {
    failures.push(new Error("Campaign rehearsal changed the production surface."));
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "Campaign rehearsal failed after cleanup and production equality verification.");
  }
  const receipt = {
    schema: "homecook.marketing-campaign-rehearsal-receipt.v1",
    run_count: 1,
    port,
    release_sha: bundle.release_sha,
    build_id: bundle.build_id,
    release_bundle_sha256: bundle.release_bundle_sha256,
    candidate_health: "pass",
    previous_bundle_rollback: "pass",
    production_guard: "unchanged",
    cleanup: "complete",
    isolation: {
      private_root: true,
      unique_docker_project: true,
      unique_volumes: true,
      fresh_database: true,
    },
  };
  return sealCampaignAuthorityArtifact(receipt, "receipt_sha256");
}

function requireAdapter(adapters, name) {
  if (typeof adapters?.[name] !== "function") fail(`Campaign production adapter ${name} is required.`);
  return adapters[name];
}

export function validateCampaignRollbackRecovery(value, previousBundle) {
  const recovery = requireObject(value, "Rollback recovery");
  requireExact(recovery.recovered, true, "Rollback recovery.recovered");
  validateComponents(recovery.components, previousBundle);
  requireExact(recovery.internal_health, "pass", "Rollback recovery.internal_health");
  requireExact(recovery.public_health, "pass", "Rollback recovery.public_health");
  assertNoCampaignSecretMaterial(recovery);
  return recovery;
}

function validateLiveCampaignAuthority(value, manifest) {
  const live = requireObject(value, "Live campaign authority");
  requireExact(live.origin_master_sha, manifest.release_sha, "Live origin/master");
  requireExact(
    live.required_ci_evidence_sha256,
    manifest.required_ci_evidence_sha256,
    "Live latest required CI evidence",
  );
  requireExact(
    live.production_snapshot_sha256,
    manifest.production_snapshot_sha256,
    "Live production snapshot",
  );
  requireExact(live.attestation_verified, true, "Live attestation verification");
  return live;
}

/** @param {{ authorityInputs: Record<string, any>, clock?: () => Date, createAdapters: Function }} options */
export async function runCampaignPromotionTransaction({
  authorityInputs,
  clock = () => new Date(),
  createAdapters,
}) {
  const assertFresh = () => assertCampaignCommandAllowed({ command: "promote", now: clock() });
  const verifiedAuthority = verifyCampaignPromotionAuthority({ ...authorityInputs, now: clock() });
  assertFresh();
  if (typeof createAdapters !== "function") fail("Campaign production adapter factory is required.");
  const adapters = createAdapters({ authority: verifiedAuthority, assertFresh });
  assertFresh();
  const acquireLock = requireAdapter(adapters, "acquireProductionLock");
  const install = requireAdapter(adapters, "installBundleTransactionally");
  const verify = requireAdapter(adapters, "verifyPostdeploy");
  const rollback = requireAdapter(adapters, "rollbackPreviousBundle");
  const verifyRecovery = requireAdapter(adapters, "verifyPreviousBundleRecovery");
  const releaseLock = requireAdapter(adapters, "releaseProductionLock");
  const revalidateLiveAuthority = requireAdapter(adapters, "revalidateLiveAuthority");
  const revalidate = async (phase) => {
    assertFresh();
    return validateLiveCampaignAuthority(
      await revalidateLiveAuthority({
        authority: verifiedAuthority,
        assertFresh,
        phase,
      }),
      verifiedAuthority.manifest,
    );
  };
  await revalidate("before_lock");
  const lock = await acquireLock({ authority: verifiedAuthority, assertFresh });
  let primaryError = null;
  let result = null;
  try {
    await revalidate("before_install");
    const installation = await install({
      authority: verifiedAuthority,
      assertFresh,
      lock,
      manifest: verifiedAuthority.manifest,
    });
    await revalidate("before_postdeploy_canary");
    const verification = validateCampaignPostdeployEvidence(
      await verify({ installation, lock, manifest: verifiedAuthority.manifest, assertFresh }),
      verifiedAuthority.manifest,
    );
    result = { installed: true, installation, manifest: verifiedAuthority.manifest, verification };
  } catch (error) {
    primaryError = error;
    try {
      const recovered = validateCampaignRollbackRecovery(
        await rollback({
          activeTransaction: { started_at: authorityInputs.approval.approved_at, state: "failed_deploy" },
          lock,
          manifest: verifiedAuthority.manifest,
          previousBundle: verifiedAuthority.manifest.previous_bundle,
        }),
        verifiedAuthority.manifest.previous_bundle,
      );
      validateCampaignRollbackRecovery(
        await verifyRecovery({ lock, manifest: verifiedAuthority.manifest, recovery: recovered }),
        verifiedAuthority.manifest.previous_bundle,
      );
    } catch (rollbackError) {
      primaryError = new Error(
        `manual_recovery_required: ${error instanceof Error ? error.message : String(error)}`,
        { cause: new AggregateError([error, rollbackError]) },
      );
    }
  }
  let releaseError = null;
  try {
    await releaseLock({ lock, manifest: verifiedAuthority.manifest });
  } catch (error) {
    releaseError = error;
  }
  if (primaryError) {
    const primaryMessage = primaryError instanceof Error ? primaryError.message : String(primaryError);
    const releaseMessage = releaseError
      ? `; production_lock_release_failed: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`
      : "";
    const restored = primaryMessage.startsWith("manual_recovery_required:")
      ? ""
      : "; campaign deployment failed and previous bundle was restored";
    throw new Error(`${primaryMessage}${restored}${releaseMessage}`, {
      cause: new AggregateError([primaryError, ...(releaseError ? [releaseError] : [])]),
    });
  }
  if (releaseError) {
    throw new Error(`production_lock_release_failed: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`, { cause: releaseError });
  }
  return result;
}
