import { isDeepStrictEqual } from "node:util";

export const LIVE_WEB_SHA = "91355997309321e9f775eac93a3a88c8352104e5";
export const LIVE_WORKER_SHA = "370483030665cb25548c40865544c3b6f4f49cbc";
export const LIVE_CATALOG_FINGERPRINT = "fb53256a0f5cb3c2690ecbc070718d2bbfaeafab4c23710dab0584f4cbc5d7c8";
export const TARGET_CATALOG_FINGERPRINT = "81362d758b5138a95b6cbe1d8d7c1f064653b467907a42a7335c00d97dc59ba9";
export const LIVE_POLICY_VERSION = 3;
export const LIVE_PIPELINE_IDENTITY = "1c9c47074da3bf1c55ed83f1ba5131d9d48ad486503919c554a5530d7972d935";
export const LIVE_POLICY_SNAPSHOT_DIGEST = "e40c9f4ef0d8a9241e49635f0fc906fe92a20f57a46e005fa4dd308805a191c0";
export const LIVE_CREDENTIAL_GENERATION = 45;
export const TARGET_CREDENTIAL_GENERATION = 46;
export const SCHEMA_IDENTITY = "youtube-extraction-worker-schema-v2";

/** Keep the adapter's complete identity while adding the DB-plan aliases. */
export function resolutionDatabaseTarget(target) {
  const systemId = target?.database?.systemIdentifier;
  const postgresMajor = target?.database?.major;
  if (typeof systemId !== "string" || !Number.isInteger(postgresMajor)
    || (target.systemId !== undefined && target.systemId !== systemId)
    || (target.postgresMajor !== undefined && target.postgresMajor !== postgresMajor)) {
    throw new Error("YouTube resolution database identity aliases disagree");
  }
  return { ...target, systemId, postgresMajor };
}
export const MIGRATIONS = Object.freeze([
  "20261009200000_youtube_ingredient_resolution.sql",
  "20261010010000_youtube_saved_ingredient_links.sql",
]);
export const SOURCE_BACKFILL = "20261009003000_youtube_saved_recipe_result_owner_correction.sql";
export const YOUTUBE_RESOLUTION_FUNCTION_SIGNATURES = Object.freeze([
  "public.ingredient_lookup_name_candidates(text,text,text)",
  "public.match_ingredient_name_exact_with_context(text,text,text)",
  "public.match_ingredient_name_exact(text)",
  "public.resolve_youtube_extraction_job_draft(uuid,text,bigint,bigint,text,jsonb)",
  "public.read_youtube_extraction_enqueue_readiness()",
  "private.assert_youtube_extraction_catalog_ready()",
  "private.project_youtube_saved_recipe_result(public.youtube_saved_recipe_results)",
  "private.project_youtube_saved_recipe_ingredient_links(public.youtube_saved_recipe_results)",
]);
export const YOUTUBE_RESOLUTION_BASELINE_ABSENT_FUNCTIONS = Object.freeze([
  "public.ingredient_lookup_name_candidates(text,text,text)",
  "public.match_ingredient_name_exact_with_context(text,text,text)",
  "private.project_youtube_saved_recipe_ingredient_links(public.youtube_saved_recipe_results)",
]);

const SHA40 = /^[a-f0-9]{40}$/u;
const SHA64 = /^[a-f0-9]{64}$/u;
const MIGRATION = /^\d{14}_[^/]+\.sql$/u;

function requireValue(value, message) {
  if (!value) throw new Error(`YouTube resolution operator: ${message}`);
}

function exactKeys(value, expected, label) {
  requireValue(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  requireValue(isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort()), `${label} fields changed`);
}

function validHashMap(value, expectedCount = null) {
  return value && typeof value === "object" && !Array.isArray(value)
    && (expectedCount === null || Object.keys(value).length === expectedCount)
    && Object.entries(value).every(([path, digest]) => path.length > 0 && !path.startsWith("/")
      && !path.split("/").includes("..") && SHA64.test(digest));
}

export function assertResolutionReview(review, { phase = "post-db" } = {}) {
  exactKeys(review, [
    "schema", "from", "to", "integrationSourceRef", "previousMigrationCount",
    "migrationCount", "migrations", "sourceBackfill", "files", "protectedSources",
    "runtimeFiles", "artifact", "previousWorker", "catalog", "policy", "credential", "proofs",
  ], "review");
  const expectedSchema = phase === "precutover"
    ? "homecook.prelaunch-youtube-resolution-precutover-authority.v1"
    : "homecook.prelaunch-youtube-resolution-review.v1";
  requireValue(review.schema === expectedSchema, "review schema mismatch");
  requireValue(review.from === LIVE_WEB_SHA && SHA40.test(review.to ?? "") && review.to !== review.from,
    "source pair mismatch");
  requireValue(SHA40.test(review.integrationSourceRef ?? ""), "integration source ref missing");
  requireValue(review.previousMigrationCount === 213 && review.migrationCount === 215,
    "exact 213-to-215 ledger required");
  requireValue(Array.isArray(review.migrations) && review.migrations.length === 2
    && isDeepStrictEqual(review.migrations.map((row) => row.filename), MIGRATIONS)
    && review.migrations.every((row) => MIGRATION.test(row.filename) && SHA64.test(row.sha256 ?? "")),
  "two exact migrations required");
  exactKeys(review.sourceBackfill, ["filename", "sha256"], "source backfill");
  requireValue(review.sourceBackfill.filename === SOURCE_BACKFILL && SHA64.test(review.sourceBackfill.sha256 ?? ""),
    "source backfill mismatch");
  requireValue(review.files && Object.keys(review.files).length > 0
    && Object.entries(review.files).every(([path, pair]) => !path.startsWith("/") && !path.split("/").includes("..")
      && Array.isArray(pair) && pair.length === 2
      && pair.every((digest) => digest === null || SHA64.test(digest)) && pair.some((digest) => digest !== null)),
  "complete source hash pairs required");
  requireValue(Array.isArray(review.protectedSources) && new Set(review.protectedSources).size === review.protectedSources.length
    && review.protectedSources.every((path) => Object.hasOwn(review.files, path)), "protected source set mismatch");
  requireValue(validHashMap(review.runtimeFiles, 22), "exact 22-file v63 runtime inventory required");
  exactKeys(review.artifact, ["identitySha256", "fileSha256", "descriptorFileSha256", "expectedSchemaSha256"], "artifact");
  requireValue(Object.values(review.artifact).every((value) => SHA64.test(value ?? "")), "artifact hashes missing");
  exactKeys(review.previousWorker, [
    "releaseSha", "plistPath", "plistSha256", "beforeClosureLoaded", "beforeClosureState",
    "atInstallLoaded", "atInstallState",
  ], "previous worker");
  requireValue(review.previousWorker.releaseSha === LIVE_WORKER_SHA
    && typeof review.previousWorker.plistPath === "string" && review.previousWorker.plistPath.startsWith("/")
    && SHA64.test(review.previousWorker.plistSha256 ?? "")
    && review.previousWorker.beforeClosureLoaded === true && review.previousWorker.beforeClosureState === "running"
    && review.previousWorker.atInstallLoaded === false && review.previousWorker.atInstallState === "unloaded",
  "previous worker/plist lifecycle mismatch");
  exactKeys(review.catalog, ["before", "after"], "catalog");
  requireValue(review.catalog.before === LIVE_CATALOG_FINGERPRINT
    && review.catalog.after === TARGET_CATALOG_FINGERPRINT, "catalog transition mismatch");
  exactKeys(review.policy, ["version", "pipelineIdentity", "snapshotDigest"], "policy");
  requireValue(review.policy.version === LIVE_POLICY_VERSION
    && review.policy.pipelineIdentity === LIVE_PIPELINE_IDENTITY
    && review.policy.snapshotDigest === LIVE_POLICY_SNAPSHOT_DIGEST,
  "policy identity mismatch");
  exactKeys(review.credential, ["beforeGeneration", "afterGeneration", "schemaIdentity", "maxTtlSeconds"], "credential");
  requireValue(review.credential.beforeGeneration === LIVE_CREDENTIAL_GENERATION
    && review.credential.afterGeneration === TARGET_CREDENTIAL_GENERATION
    && review.credential.schemaIdentity === SCHEMA_IDENTITY
    && Number.isInteger(review.credential.maxTtlSeconds) && review.credential.maxTtlSeconds > 0
    && review.credential.maxTtlSeconds <= 7 * 24 * 60 * 60, "credential scope mismatch");
  const proofNames = phase === "precutover"
    ? ["platformBackup", "isolatedRestore", "dbBefore", "enqueueClosure", "workerArtifact", "appDescriptor"]
    : ["platformBackup", "isolatedRestore", "dbBefore", "enqueueClosure", "dbApplyReceipt", "workerArtifact", "appDescriptor"];
  exactKeys(review.proofs, proofNames, "proofs");
  for (const proof of Object.values(review.proofs)) {
    exactKeys(proof, ["path", "sha256"], "proof");
    requireValue(typeof proof.path === "string" && proof.path.startsWith("/") && SHA64.test(proof.sha256 ?? ""),
      "proof path/hash missing");
  }
  return review;
}

export function assertSourceEvidence(review, evidence) {
  assertResolutionReview(review);
  exactKeys(evidence, ["from", "to", "files"], "source evidence");
  requireValue(evidence.from === review.from && evidence.to === review.to, "source SHA drift");
  requireValue(isDeepStrictEqual(evidence.files, review.files), "source bytes drift");
  return true;
}

export function assertRuntimeUnchanged(review, observedRuntimeFiles) {
  assertResolutionReview(review);
  requireValue(validHashMap(observedRuntimeFiles, 22), "observed runtime inventory invalid");
  requireValue(isDeepStrictEqual(observedRuntimeFiles, review.runtimeFiles), "v63 runtime changed");
  return true;
}

export function assertDatabaseTransition(review, before, after) {
  assertResolutionReview(review);
  exactKeys(before, ["ledgerCount", "catalogFingerprint", "aiAutomaticEnabled"], "DB before");
  exactKeys(after, ["ledgerCount", "catalogFingerprint", "aiAutomaticEnabled", "migrationFiles"], "DB after");
  requireValue(before.ledgerCount === 213 && before.catalogFingerprint === review.catalog.before
    && before.aiAutomaticEnabled === false, "DB predecessor mismatch");
  requireValue(after.ledgerCount === 215 && after.catalogFingerprint === review.catalog.after
    && after.aiAutomaticEnabled === false && isDeepStrictEqual(after.migrationFiles, MIGRATIONS),
  "DB poststate mismatch");
  return true;
}

export function assertCredentialTransition(review, before, after, now = Date.now()) {
  assertResolutionReview(review);
  const keys = ["generation", "releaseSha", "schemaIdentity", "allowedSnapshotDigest", "expiresAt", "role"];
  exactKeys(before, keys, "credential before");
  exactKeys(after, keys, "credential after");
  requireValue(before.generation === review.credential.beforeGeneration && before.releaseSha === LIVE_WORKER_SHA,
    "credential predecessor mismatch");
  requireValue(after.generation === review.credential.afterGeneration && after.releaseSha === review.to,
    "credential generation/release mismatch");
  requireValue(before.schemaIdentity === SCHEMA_IDENTITY && after.schemaIdentity === SCHEMA_IDENTITY,
    "credential schema changed");
  requireValue(before.allowedSnapshotDigest === review.policy.snapshotDigest
    && after.allowedSnapshotDigest === review.policy.snapshotDigest, "credential snapshot changed");
  requireValue(before.role === "youtube_extraction_worker" && after.role === before.role,
    "credential role changed");
  const expires = Date.parse(after.expiresAt);
  const previousExpires = Date.parse(before.expiresAt);
  requireValue(Number.isFinite(expires) && expires > now + 30 * 60 * 1000
    && Number.isFinite(previousExpires) && expires <= previousExpires
    && expires <= now + review.credential.maxTtlSeconds * 1000,
  "credential expiry outside reviewed non-extension boundary");
  return true;
}

export function assertWorkerInstallAuthority(review, authority) {
  assertResolutionReview(review);
  exactKeys(authority, [
    "releaseSha", "runtimeFiles", "catalogFingerprint", "policyVersion", "pipelineIdentity",
    "snapshotDigest", "credentialGeneration", "queue", "permitHeld", "dbReceiptSha256",
    "artifactIdentitySha256", "artifactFileSha256", "descriptorFileSha256", "expectedSchemaSha256",
    "previousPlistPath", "previousPlistSha256", "previousLoaded", "previousState",
    "enqueueClosureSha256", "workerStopped",
  ], "worker install authority");
  requireValue(authority.releaseSha === review.to, "worker release SHA mismatch");
  assertRuntimeUnchanged(review, authority.runtimeFiles);
  requireValue(authority.catalogFingerprint === review.catalog.after, "worker catalog mismatch");
  requireValue(authority.policyVersion === review.policy.version
    && authority.pipelineIdentity === review.policy.pipelineIdentity
    && authority.snapshotDigest === review.policy.snapshotDigest, "worker policy/snapshot drift");
  requireValue(authority.credentialGeneration === review.credential.afterGeneration,
    "worker credential generation mismatch");
  requireValue(authority.queue?.queued === 0 && authority.queue?.processing === 0
    && authority.permitHeld === false, "worker queue/permit not drained");
  requireValue(authority.previousPlistPath === review.previousWorker.plistPath
    && authority.previousPlistSha256 === review.previousWorker.plistSha256
    && authority.previousLoaded === review.previousWorker.atInstallLoaded
    && authority.previousState === review.previousWorker.atInstallState
    && authority.workerStopped === true
    && authority.enqueueClosureSha256 === review.proofs.enqueueClosure.sha256,
  "previous plist/closure/worker state mismatch");
  requireValue([
    authority.dbReceiptSha256, authority.artifactIdentitySha256, authority.artifactFileSha256,
    authority.descriptorFileSha256,
    authority.expectedSchemaSha256, authority.previousPlistSha256, authority.enqueueClosureSha256,
  ].every((value) => SHA64.test(value ?? "")), "worker evidence hash missing");
  requireValue(authority.dbReceiptSha256 === review.proofs.dbApplyReceipt.sha256
    && authority.artifactIdentitySha256 === review.artifact.identitySha256
    && authority.artifactFileSha256 === review.artifact.fileSha256
    && authority.descriptorFileSha256 === review.artifact.descriptorFileSha256
    && authority.expectedSchemaSha256 === review.artifact.expectedSchemaSha256
    && authority.artifactFileSha256 === review.proofs.workerArtifact.sha256
    && authority.descriptorFileSha256 === review.proofs.appDescriptor.sha256,
  "worker proof bytes differ from review");
  return true;
}

export function assertEnqueueClosureEvidence(review, evidence) {
  assertResolutionReview(review, {
    phase: review?.schema === "homecook.prelaunch-youtube-resolution-precutover-authority.v1" ? "precutover" : "post-db",
  });
  exactKeys(evidence, [
    "schema", "webReleaseSha", "descriptorFileSha256", "closedAt", "httpProbe",
    "enqueueWriteDelta", "observations", "activeEnqueueSessions", "workerStopped",
    "policyChanged", "permissionsChanged",
  ], "enqueue closure evidence");
  requireValue(evidence.schema === "homecook.youtube-resolution-enqueue-closure.v1"
    && evidence.webReleaseSha === LIVE_WEB_SHA
    && evidence.descriptorFileSha256 === review.artifact.descriptorFileSha256,
  "enqueue closure source/descriptor mismatch");
  requireValue(Number.isFinite(Date.parse(evidence.closedAt))
    && evidence.httpProbe?.status === 503 && evidence.httpProbe?.errorCode === "QUEUE_UNAVAILABLE"
    && evidence.httpProbe?.databaseWrite === false && evidence.enqueueWriteDelta === 0,
  "enqueue endpoint did not fail closed before DB mutation");
  requireValue(Array.isArray(evidence.observations) && evidence.observations.length >= 2,
    "two drained observations are required");
  const times = evidence.observations.map((row) => Date.parse(row.observedAt));
  requireValue(times.every(Number.isFinite) && Math.min(...times) >= Date.parse(evidence.closedAt)
    && Math.max(...times) - Math.min(...times) >= 5_000
    && evidence.observations.every((row) => row.queued === 0 && row.processing === 0 && row.permitHeld === false),
  "queue was not stably drained after enqueue closure");
  requireValue(evidence.activeEnqueueSessions === 0 && evidence.workerStopped === true
    && evidence.policyChanged === false && evidence.permissionsChanged === false,
  "enqueue/worker/policy boundary is not quiescent");
  return true;
}

export function assertRepresentativeSavedFlowEvidence(evidence) {
  exactKeys(evidence, [
    "schema", "origin", "authenticated", "testOwned", "autosaved", "initialContentSha256",
    "editedContentSha256", "reopenedContentSha256", "initialSourceSha256", "finalSourceSha256",
    "initialRevision", "finalRevision", "resolvedLinkCount", "modelCalls", "videoExtractions",
    "editWrites", "reopened", "crossOwnerReadDenied",
  ], "saved flow evidence");
  requireValue(evidence.schema === "homecook.youtube-resolution-representative-saved-flow.v1"
    && ["isolated-cache-clone", "new-v63-pilot"].includes(evidence.origin)
    && evidence.authenticated === true && evidence.testOwned === true && evidence.autosaved === true,
  "saved flow authority mismatch");
  requireValue(SHA64.test(evidence.initialContentSha256 ?? "")
    && SHA64.test(evidence.editedContentSha256 ?? "")
    && evidence.editedContentSha256 !== evidence.initialContentSha256
    && evidence.reopenedContentSha256 === evidence.editedContentSha256,
  "saved edit/reopen content mismatch");
  requireValue(SHA64.test(evidence.initialSourceSha256 ?? "")
    && evidence.finalSourceSha256 === evidence.initialSourceSha256,
  "saved source snapshot changed");
  requireValue(Number.isInteger(evidence.initialRevision) && evidence.finalRevision === evidence.initialRevision + 1
    && Number.isInteger(evidence.resolvedLinkCount) && evidence.resolvedLinkCount >= 1,
  "saved revision/link projection mismatch");
  const expectedCalls = evidence.origin === "new-v63-pilot" ? 1 : 0;
  requireValue(evidence.modelCalls === expectedCalls && evidence.videoExtractions === expectedCalls
    && evidence.editWrites === 1
    && evidence.reopened === true && evidence.crossOwnerReadDenied === true,
  "saved flow exceeded its reviewed origin scope");
  return true;
}
