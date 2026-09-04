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
const SECRET_KEY_PATTERN = /(?:^|_)(?:cookie|credential|env|password|private_key|secret|token)(?:_|$)/iu;
const SECRET_VALUE_PATTERNS = [
  /authorization\s*:\s*bearer\s+\S+/iu,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u,
];
const MANIFEST_FIELDS = new Set([
  "schema", "expires_at", "repository", "source_ref", "release_sha", "release_tree",
  "build_id", "release_bundle_sha256", "required_ci_evidence_sha256",
  "rehearsal_receipt_sha256", "production_snapshot_sha256", "backup_receipt_sha256",
  "previous_release_sha", "approval", "rehearsal", "backup", "components", "release_tag",
  "manifest_sha256",
]);
const APPROVAL_FIELDS = new Set([
  "environment", "approved", "approval_count", "prevent_self_review", "approver",
]);
const REHEARSAL_FIELDS = new Set([
  "run_count", "candidate_health", "previous_bundle_rollback", "production_guard", "cleanup",
]);
const BACKUP_FIELDS = new Set(["fresh", "encrypted", "verified"]);
const COMPONENT_FIELDS = new Set([
  "component", "release_sha", "build_id", "release_bundle_sha256",
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

function validateApproval(value) {
  const approval = requireObject(value, "approval");
  requireExactKeys(approval, APPROVAL_FIELDS, "approval");
  requireExact(approval.environment, "production-release-approval", "approval.environment");
  requireExact(approval.approved, true, "approval.approved");
  if (approval.approval_count !== 1) fail("approval.approval_count must be exactly 1.");
  requireExact(approval.prevent_self_review, true, "approval.prevent_self_review");
  requireString(approval.approver, "approval.approver");
}

function validateRehearsal(value) {
  const rehearsal = requireObject(value, "rehearsal");
  requireExactKeys(rehearsal, REHEARSAL_FIELDS, "rehearsal");
  if (rehearsal.run_count !== 1) fail("rehearsal.run_count must be exactly 1.");
  requireExact(rehearsal.candidate_health, "pass", "rehearsal.candidate_health");
  requireExact(
    rehearsal.previous_bundle_rollback,
    "pass",
    "rehearsal.previous_bundle_rollback",
  );
  requireExact(rehearsal.production_guard, "unchanged", "rehearsal.production_guard");
  requireExact(rehearsal.cleanup, "complete", "rehearsal.cleanup");
}

function validateBackup(value) {
  const backup = requireObject(value, "backup");
  requireExactKeys(backup, BACKUP_FIELDS, "backup");
  requireExact(backup.fresh, true, "backup.fresh");
  requireExact(backup.encrypted, true, "backup.encrypted");
  requireExact(backup.verified, true, "backup.verified");
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
  ]) requireDigest(manifest[field], field);
  requireSha(manifest.previous_release_sha, "previous_release_sha");
  if (!TAG_PATTERN.test(requireString(manifest.release_tag, "release_tag"))) {
    fail("release_tag must match prod-YYYYMMDD.N.");
  }
  validateApproval(manifest.approval);
  validateRehearsal(manifest.rehearsal);
  validateBackup(manifest.backup);
  validateComponents(manifest.components, manifest);
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

export function validateCampaignPostdeployEvidence(value, manifest) {
  const evidence = requireObject(value, "Postdeploy evidence");
  validateComponents(evidence.components, manifest);
  const fullLocal = requireObject(evidence.full_local, "Postdeploy full_local");
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
  if (publicHttp.root !== 200 || publicHttp.beta !== 200
    || publicHttp.privacy !== 200 || publicHttp.auth_health !== 401) {
    fail("Campaign public HTTP checks failed.");
  }
  const marketing = requireObject(evidence.marketing, "Postdeploy marketing");
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
  const reservePort = requireAdapter(adapters, "reserveHighPort");
  const snapshot = requireAdapter(adapters, "snapshotProductionReadOnly");
  const runCandidate = requireAdapter(adapters, "runCandidateHealth");
  const runRollback = requireAdapter(adapters, "runPreviousBundleRollback");
  const cleanup = requireAdapter(adapters, "cleanupOwnedResources");
  const port = await reservePort();
  if (!Number.isInteger(port) || port < 20_000 || port > 60_999
    || new Set([3000, 3100, 5432, 54321, 54322, 54323, 54324]).has(port)) {
    fail("Rehearsal port must be one isolated high port in 20000..60999.");
  }
  const productionBefore = await snapshot({ phase: "before", readOnly: true });
  let candidate;
  let previous;
  let cleanupResult;
  try {
    candidate = await runCandidate({ bundle, port });
    if (candidate?.status !== "pass") fail("Campaign candidate health failed.");
    previous = await runRollback({ additiveMigrationHead: true, bundle, port });
    if (previous?.status !== "pass") fail("Campaign previous bundle rollback rehearsal failed.");
  } finally {
    cleanupResult = await cleanup({ bundle, port });
  }
  if (cleanupResult?.status !== "complete" || cleanupResult?.residue !== 0) {
    fail("Campaign rehearsal cleanup is incomplete.");
  }
  const productionAfter = await snapshot({ phase: "after", readOnly: true });
  requireDigest(productionBefore?.digest, "Production pre-snapshot digest");
  requireDigest(productionAfter?.digest, "Production post-snapshot digest");
  if (productionBefore.digest !== productionAfter.digest) {
    fail("Campaign rehearsal changed the production surface.");
  }
  const receipt = {
    run_count: 1,
    port,
    release_sha: bundle.release_sha,
    build_id: bundle.build_id,
    release_bundle_sha256: bundle.release_bundle_sha256,
    candidate_health: "pass",
    previous_bundle_rollback: "pass",
    production_guard: "unchanged",
    cleanup: "complete",
  };
  return Object.freeze({ ...receipt, receipt_sha256: sha256(canonicalJson(receipt)) });
}

function requireAdapter(adapters, name) {
  if (typeof adapters?.[name] !== "function") fail(`Campaign production adapter ${name} is required.`);
  return adapters[name];
}

/**
 * @param {{ manifest: Record<string, any>, now?: Date | string | number, adapters: Record<string, Function> }} options
 */
export async function runCampaignPromotionTransaction({ manifest, now = new Date(), adapters }) {
  assertCampaignCommandAllowed({ command: "promote", now });
  const authority = validateCampaignManifest(manifest, { now, requireFresh: true });
  const acquireLock = requireAdapter(adapters, "acquireProductionLock");
  const install = requireAdapter(adapters, "installBundleTransactionally");
  const verify = requireAdapter(adapters, "verifyPostdeploy");
  const rollback = requireAdapter(adapters, "rollbackPreviousBundle");
  const releaseLock = requireAdapter(adapters, "releaseProductionLock");
  const lock = await acquireLock({ manifest: authority });
  let deploymentStarted = false;
  try {
    deploymentStarted = true;
    const installation = await install({ lock, manifest: authority });
    const verification = validateCampaignPostdeployEvidence(
      await verify({ installation, lock, manifest: authority }),
      authority,
    );
    return { installed: true, installation, manifest: authority, verification };
  } catch (error) {
    if (deploymentStarted) {
      try {
        await rollback({ lock, manifest: authority, previousReleaseSha: authority.previous_release_sha });
      } catch (rollbackError) {
        throw new Error("manual_recovery_required: deployment and previous bundle rollback failed.", {
          cause: new AggregateError([error, rollbackError]),
        });
      }
      throw new Error("Campaign deployment failed and previous bundle was restored.", { cause: error });
    }
    throw error;
  } finally {
    await releaseLock({ lock, manifest: authority });
  }
}
