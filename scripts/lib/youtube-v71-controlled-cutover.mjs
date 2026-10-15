import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { resolve } from "node:path";

import {
  DEFAULT_YOUTUBE_EXTRACTION_WORKER_EXTRACTOR_MODE,
  DEFAULT_YOUTUBE_EXTRACTION_WORKER_FINGERPRINT_KEY_VERSION,
  DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS,
  buildYoutubeExtractionWorkerPolicySnapshotDigest,
} from "./youtube-extraction-worker-artifact.mjs";
import {
  YOUTUBE_V71_CREDENTIAL_GENERATION_AFTER,
  YOUTUBE_V71_CREDENTIAL_GENERATION_BEFORE,
  YOUTUBE_V71_CREDENTIAL_TTL_SECONDS,
  YOUTUBE_V71_MANAGER_MAX_TTL_SECONDS,
  YOUTUBE_V71_PIPELINE_IDENTITY,
  YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST,
  YOUTUBE_V71_POLICY_VERSION,
  YOUTUBE_V71_RELEASE_SHA,
  YOUTUBE_V71_SCHEMA_IDENTITY,
} from "./youtube-v71-worker-preparation.mjs";

export const YOUTUBE_V71_CUTOVER_CONFIRMATION =
  "LOCAL_FULL_PRODUCTION_YOUTUBE_V71_GEN47_CUTOVER";
export const YOUTUBE_V71_PREDECESSOR_RELEASE_SHA =
  "c51d53871f31c7840fe24792b46b191ca963b11b";
export const YOUTUBE_V71_PREDECESSOR_PIPELINE_IDENTITY =
  "1c9c47074da3bf1c55ed83f1ba5131d9d48ad486503919c554a5530d7972d935";
export const YOUTUBE_V71_PREDECESSOR_POLICY_SNAPSHOT_DIGEST =
  "e40c9f4ef0d8a9241e49635f0fc906fe92a20f57a46e005fa4dd308805a191c0";

function check(condition, message) {
  if (!condition) throw new Error(`v71 controlled cutover rejected: ${message}`);
}

function integer(value, label) {
  check(Number.isSafeInteger(value), label);
  return value;
}

function digest(value, label) {
  check(/^[a-f0-9]{64}$/u.test(value ?? ""), label);
  return value;
}

export function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function decodeJwtClaims(token) {
  const parts = String(token ?? "").trim().split(".");
  check(parts.length === 3 && parts.every(Boolean), "JWT shape");
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new Error("v71 controlled cutover rejected: JWT claims");
  }
}

export function assertV71ManagerClaims(claims, now = new Date()) {
  check(claims?.role === "youtube_extraction_credential_manager", "manager role");
  check(claims?.scope === "youtube-extraction-credential-manager", "manager scope");
  check(claims?.iss === "https://worker.mumeok.kr", "manager issuer");
  check(claims?.aud === "youtube-extraction", "manager audience");
  digest(claims?.jti_hash, "manager JTI hash");
  integer(claims?.iat, "manager iat");
  integer(claims?.exp, "manager exp");
  check(claims.exp - claims.iat > 0, "manager positive lifetime");
  check(
    claims.exp - claims.iat <= YOUTUBE_V71_MANAGER_MAX_TTL_SECONDS,
    "manager lifetime exceeds five minutes",
  );
  check(claims.exp * 1_000 > now.getTime(), "manager expired");
  return true;
}

export function assertV71WorkerCredential({ claims, metadata }, now = new Date()) {
  const expected = {
    role: "youtube_extraction_worker",
    scope: "youtube-extraction-worker",
    iss: "https://worker.mumeok.kr",
    aud: "youtube-extraction",
    generation: YOUTUBE_V71_CREDENTIAL_GENERATION_AFTER,
    release_sha: YOUTUBE_V71_RELEASE_SHA,
    schema_identity: YOUTUBE_V71_SCHEMA_IDENTITY,
    allowed_snapshot_digest: YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST,
  };
  for (const [key, value] of Object.entries(expected)) {
    check(claims?.[key] === value, `worker claim ${key}`);
  }
  digest(claims?.jti_hash, "worker JTI hash");
  integer(claims?.iat, "worker iat");
  integer(claims?.exp, "worker exp");
  check(
    claims.exp - claims.iat === YOUTUBE_V71_CREDENTIAL_TTL_SECONDS,
    "worker lifetime is not exactly six days",
  );
  check(claims.exp * 1_000 > now.getTime(), "worker expired");
  check(metadata?.generation === claims.generation, "worker metadata generation");
  check(metadata?.jti_sha256 === claims.jti_hash, "worker metadata JTI hash");
  check(metadata?.release_sha === claims.release_sha, "worker metadata release");
  check(metadata?.schema_identity === claims.schema_identity, "worker metadata schema");
  check(
    metadata?.allowed_snapshot_digest === claims.allowed_snapshot_digest,
    "worker metadata policy digest",
  );
  check(Date.parse(metadata?.expires_at) === claims.exp * 1_000, "worker metadata expiry");
  return true;
}

export function assertV71PolicyConstants() {
  const digestValue = buildYoutubeExtractionWorkerPolicySnapshotDigest({
    extractorMode: DEFAULT_YOUTUBE_EXTRACTION_WORKER_EXTRACTOR_MODE,
    pipelineIdentity: YOUTUBE_V71_PIPELINE_IDENTITY,
    policyVersion: YOUTUBE_V71_POLICY_VERSION,
    resultAffectingOptions: DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS,
  });
  check(digestValue === YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST, "policy digest drift");
  return true;
}

export function assertV71CutoverPrestate(observation) {
  check(observation?.ledgerCount === 219, "migration ledger is not 219");
  check(observation?.queued === 0, "queued jobs are not drained");
  check(observation?.processing === 0, "processing jobs are not drained");
  check(observation?.permitHeld === false, "extractor permit is held");
  check(observation?.activeEnqueueSessions === 0, "enqueue session is active");
  check(
    observation?.credential?.generation === YOUTUBE_V71_CREDENTIAL_GENERATION_BEFORE,
    "predecessor generation",
  );
  check(
    observation?.credential?.releaseSha === YOUTUBE_V71_PREDECESSOR_RELEASE_SHA,
    "predecessor release",
  );
  check(
    observation?.credential?.snapshotDigest
      === YOUTUBE_V71_PREDECESSOR_POLICY_SNAPSHOT_DIGEST,
    "predecessor credential policy digest",
  );
  check(
    observation?.policy?.pipelineIdentity === YOUTUBE_V71_PREDECESSOR_PIPELINE_IDENTITY,
    "predecessor pipeline",
  );
  check(
    observation?.policy?.snapshotDigest === YOUTUBE_V71_PREDECESSOR_POLICY_SNAPSHOT_DIGEST,
    "predecessor policy digest",
  );
  check(observation?.policy?.enabled === true, "predecessor policy is disabled");
  return true;
}

export function assertV71CutoverPoststate(observation, { enabled }) {
  check(observation?.ledgerCount === 219, "migration ledger changed");
  check(observation?.queued === 0, "queued jobs appeared during zero-budget cutover");
  check(observation?.processing === 0, "processing jobs appeared during zero-budget cutover");
  check(observation?.permitHeld === false, "extractor permit was acquired during cutover");
  check(
    observation?.credential?.generation === YOUTUBE_V71_CREDENTIAL_GENERATION_AFTER,
    "generation 47 is not current",
  );
  check(observation?.credential?.releaseSha === YOUTUBE_V71_RELEASE_SHA, "release binding");
  check(
    observation?.credential?.schemaIdentity === YOUTUBE_V71_SCHEMA_IDENTITY,
    "schema binding",
  );
  check(
    observation?.credential?.snapshotDigest === YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST,
    "credential policy binding",
  );
  check(observation?.policy?.version === YOUTUBE_V71_POLICY_VERSION, "policy version");
  check(
    observation?.policy?.extractorMode === DEFAULT_YOUTUBE_EXTRACTION_WORKER_EXTRACTOR_MODE,
    "extractor mode",
  );
  check(
    observation?.policy?.pipelineIdentity === YOUTUBE_V71_PIPELINE_IDENTITY,
    "pipeline identity",
  );
  check(
    observation?.policy?.snapshotDigest === YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST,
    "policy digest",
  );
  check(observation?.policy?.enabled === enabled, "policy enabled state");
  check(
    isDeepStrictEqual(
      observation?.policy?.resultAffectingOptions,
      DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS,
    ),
    "result-affecting options",
  );
  return true;
}

export function assertV71OperationalPoststate(observation) {
  const normalized = {
    ...observation,
    queued: 0,
    processing: 0,
    permitHeld: false,
  };
  return assertV71CutoverPoststate(normalized, { enabled: true });
}

export function buildV71DatabaseTransitionSql({ managerClaims, credentialMetadata }) {
  assertV71ManagerClaims(managerClaims);
  assertV71PolicyConstants();
  const metadata = credentialMetadata;
  check(metadata?.generation === YOUTUBE_V71_CREDENTIAL_GENERATION_AFTER, "metadata generation");
  digest(metadata?.jti_sha256, "metadata JTI hash");
  check(metadata?.release_sha === YOUTUBE_V71_RELEASE_SHA, "metadata release");
  check(metadata?.schema_identity === YOUTUBE_V71_SCHEMA_IDENTITY, "metadata schema");
  check(
    metadata?.allowed_snapshot_digest === YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST,
    "metadata policy digest",
  );
  check(Number.isFinite(Date.parse(metadata?.expires_at)), "metadata expiry");
  const options = JSON.stringify(DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS);
  const claims = JSON.stringify(managerClaims);
  return `
UPDATE private.youtube_extraction_current_policy
SET policy_version = ${YOUTUBE_V71_POLICY_VERSION},
    extractor_mode = ${sqlLiteral(DEFAULT_YOUTUBE_EXTRACTION_WORKER_EXTRACTOR_MODE)},
    pipeline_identity = ${sqlLiteral(YOUTUBE_V71_PIPELINE_IDENTITY)},
    result_affecting_options = ${sqlLiteral(options)}::jsonb,
    fingerprint_key_version = ${sqlLiteral(DEFAULT_YOUTUBE_EXTRACTION_WORKER_FINGERPRINT_KEY_VERSION)},
    previous_fingerprint_key_version = NULL,
    previous_fingerprint_valid_until = NULL,
    enabled = false,
    updated_at = clock_timestamp()
WHERE policy_key = 'primary';
SET LOCAL request.jwt.claims = ${sqlLiteral(claims)};
SET LOCAL ROLE youtube_extraction_credential_manager;
SELECT public.rotate_youtube_extraction_worker_credential(
  ${YOUTUBE_V71_CREDENTIAL_GENERATION_BEFORE},
  ${YOUTUBE_V71_CREDENTIAL_GENERATION_AFTER},
  ${sqlLiteral(metadata.jti_sha256)},
  ${sqlLiteral(metadata.expires_at)}::timestamptz,
  ${sqlLiteral(YOUTUBE_V71_RELEASE_SHA)},
  ${sqlLiteral(YOUTUBE_V71_SCHEMA_IDENTITY)},
  ${sqlLiteral(YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST)}
)::text;
RESET ROLE;
`;
}

// This profile has independent immutable authority; it never retargets v71.
export const YOUTUBE_C04_QUANTITY_PROFILE = "c04-quantity-v4";
export const YOUTUBE_C04_CUTOVER_REVIEW_PIN = Object.freeze({"path":"/Users/cwj/.homecook/operations/mumeok-beta-c04-20261014-Ej3Zvr/approved-worker-control-review.json","sha256":"63ba82001909c381a7cf1a61c32ec2209aca157c42607371ed46a74c331839b6"});
export const YOUTUBE_C04_RELEASE_SHA = "6b610eb012da42b5d151b058531815dc12a8ca45";
export const YOUTUBE_C04_ARTIFACT_SHA256 = "81325e9905d0d30f5e43e57434d8dfce71111ec422856d51f85c8876e22726d0";
export const YOUTUBE_C04_OPERATION_ROOT = "/Users/cwj/.homecook/operations/mumeok-beta-c04-20261014-Ej3Zvr/worker-control";
export const YOUTUBE_C04_EXPECTED_SCHEMA_SHA256 = "2ea26b772e3f69e7bbf524d6303c5c40072b6c721028204a821dba0699822e20";
export const YOUTUBE_C04_QUIESCE_CONFIRMATION = "LOCAL_FULL_PRODUCTION_YOUTUBE_C04_GEN48_QUIESCE";
export const YOUTUBE_C04_CUTOVER_CONFIRMATION = "LOCAL_FULL_PRODUCTION_YOUTUBE_C04_GEN48_CUTOVER";
export const YOUTUBE_C04_ACTIVATE_CONFIRMATION = "LOCAL_FULL_PRODUCTION_YOUTUBE_C04_GEN48_ACTIVATE";
export const YOUTUBE_C04_REPAIR_CONFIRMATION = "LOCAL_FULL_PRODUCTION_YOUTUBE_C04_GEN48_PAUSE_FOR_REPAIR";
export const YOUTUBE_C04_CATALOG_BEFORE = "81362d758b5138a95b6cbe1d8d7c1f064653b467907a42a7335c00d97dc59ba9";
export const YOUTUBE_C04_CATALOG_AFTER = "de001df9981d361130136e2dff184665ec5280e82a857aa4e0e6cd593848af05";
const C04_MIGRATION_SHA = "f586b27f2f5da5063a7eaa70278c7f00edab762aa27248b91a224411f436c750";
const C04_RECEIPT_KEYS = "activeEnqueueSessions,artifactSha256,catalogFingerprint,consumersReceiptSha256,credentialGeneration,credentialMetadataSha256,credentialRowSha256,descriptorSha256,feature,ledgerCount,normalDataSha256,permitHeld,pid,plistSha256,policyRowSha256,processing,productWriterEnabled,quantityPolicyEnabled,queued,releaseSha,schema,schemaIdentity,serviceState,snapshotDigest,status,targetSha256,weightWriterEnabled,workerDatabaseReceiptSha256,workerOperationId,workerPolicyEnabled,workerReleaseSha,workerReviewSha256,zeroActualAI";
const C04_REVIEW_KEYS = "artifactSha256,catalogAfter,catalogBefore,descriptorSha256,expectedSchemaSha256,generationAfter,generationBefore,ledgerAfter,ledgerBefore,migrationSha256,operationId,operationRoot,postReceiptSha256,preReceiptSha256,releaseSha,schema,schemaIdentity,snapshotDigest,targetSha256";
const SHA64 = /^[a-f0-9]{64}$/u;
const SHA40 = /^[a-f0-9]{40}$/u;
const UUID4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
function c04Check(condition, message) {
  if (!condition) throw new Error(`C04 worker cutover rejected: ${message}`);
}

export function parseC04QuantityCutoverArguments(args) {
  c04Check(args[0] === "--profile" && args[1] === YOUTUBE_C04_QUANTITY_PROFILE, "unknown fixed profile");
  const command = args[2], confirmation = args[3];
  c04Check(["--prepare", "--quiesce", "--execute", "--resume", "--activate", "--pause-for-repair"].includes(command), "unknown phase");
  c04Check(command === "--prepare" ? args.length === 3 : args.length === 4
    && confirmation === (command === "--quiesce" ? YOUTUBE_C04_QUIESCE_CONFIRMATION : command === "--activate" ? YOUTUBE_C04_ACTIVATE_CONFIRMATION : command === "--pause-for-repair" ? YOUTUBE_C04_REPAIR_CONFIRMATION : YOUTUBE_C04_CUTOVER_CONFIRMATION),
  "exact phase/confirmation required; no additional arguments");
  return { command, confirmation };
}

export function assertC04QuantityControlReview(review, bindings) {
  c04Check(SHA40.test(bindings?.releaseSha ?? "") && SHA64.test(bindings?.artifactSha256 ?? "")
    && typeof bindings?.operationRoot === "string" && bindings.operationRoot.startsWith("/")
    && bindings.operationRoot !== "/" && resolve(bindings.operationRoot) === bindings.operationRoot, "unbound fixed source/artifact/operation root");
  c04Check(review && Object.keys(review).sort().join() === C04_REVIEW_KEYS
    && review.schema === "homecook.youtube-c04-controlled-cutover-review.v1"
    && review.releaseSha === bindings.releaseSha && review.artifactSha256 === bindings.artifactSha256
    && review.operationRoot === bindings.operationRoot && UUID4.test(review.operationId ?? "")
    && SHA64.test(review.targetSha256 ?? "") && SHA64.test(review.descriptorSha256 ?? "")
    && review.expectedSchemaSha256 === YOUTUBE_C04_EXPECTED_SCHEMA_SHA256
    && review.generationBefore === 47 && review.generationAfter === 48
    && review.ledgerBefore === 226 && review.ledgerAfter === 227
    && review.catalogBefore === YOUTUBE_C04_CATALOG_BEFORE && review.catalogAfter === YOUTUBE_C04_CATALOG_AFTER
    && review.migrationSha256 === C04_MIGRATION_SHA && review.schemaIdentity === YOUTUBE_V71_SCHEMA_IDENTITY
    && review.snapshotDigest === YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST
    && [review.preReceiptSha256, review.postReceiptSha256].every(value => value === null || SHA64.test(value ?? "")),
  "fixed source/target/CAS/schema/conditional receipt authority differs");
  return review;
}

export function assertC04QuantityPolicy(policy) {
  c04Check(policy?.version === YOUTUBE_V71_POLICY_VERSION
    && policy.extractorMode === DEFAULT_YOUTUBE_EXTRACTION_WORKER_EXTRACTOR_MODE
    && policy.pipelineIdentity === YOUTUBE_V71_PIPELINE_IDENTITY
    && policy.snapshotDigest === YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST
    && isDeepStrictEqual(policy.resultAffectingOptions, DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS), "model/pipeline/options/policy differ");
  return policy;
}

export function assertC04QuantityWorkerCredential({ claims, metadata }, review, now = new Date()) {
  const expected = { role: "youtube_extraction_worker", scope: "youtube-extraction-worker", iss: "https://worker.mumeok.kr",
    aud: "youtube-extraction", generation: 48, release_sha: review.releaseSha, schema_identity: YOUTUBE_V71_SCHEMA_IDENTITY,
    allowed_snapshot_digest: YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST };
  for (const [key, value] of Object.entries(expected)) c04Check(claims?.[key] === value, `worker claim ${key}`);
  c04Check(SHA64.test(claims?.jti_hash ?? "") && Number.isSafeInteger(claims.iat) && Number.isSafeInteger(claims.exp)
    && claims.exp - claims.iat === YOUTUBE_V71_CREDENTIAL_TTL_SECONDS && claims.iat * 1000 <= now.getTime() && claims.exp * 1000 > now.getTime(), "worker lifetime/binding");
  c04Check(metadata?.generation === 48 && metadata.release_sha === review.releaseSha && metadata.jti_sha256 === claims.jti_hash
    && metadata.schema_identity === expected.schema_identity && metadata.allowed_snapshot_digest === expected.allowed_snapshot_digest
    && Date.parse(metadata.expires_at) === claims.exp * 1000, "worker metadata differs");
  return metadata;
}

export function buildC04QuantityCredentialTransitionSql({ managerClaims, credentialMetadata, review }, now = new Date()) {
  assertV71ManagerClaims(managerClaims, now);
  c04Check(credentialMetadata?.generation === 48 && credentialMetadata.release_sha === review.releaseSha
    && SHA64.test(credentialMetadata.jti_sha256 ?? "") && credentialMetadata.schema_identity === YOUTUBE_V71_SCHEMA_IDENTITY
    && credentialMetadata.allowed_snapshot_digest === YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST
    && Number.isFinite(Date.parse(credentialMetadata.expires_at)) && Date.parse(credentialMetadata.expires_at) > now.getTime(), "fixed CAS credential differs");
  // Policy/key/previous-TTL fields are intentionally not assigned here.
  return `SET LOCAL request.jwt.claims = ${sqlLiteral(JSON.stringify(managerClaims))};
SET LOCAL ROLE youtube_extraction_credential_manager;
SELECT public.rotate_youtube_extraction_worker_credential(47,48,${sqlLiteral(credentialMetadata.jti_sha256)},${sqlLiteral(credentialMetadata.expires_at)}::timestamptz,${sqlLiteral(review.releaseSha)},${sqlLiteral(YOUTUBE_V71_SCHEMA_IDENTITY)},${sqlLiteral(YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST)})::text;
RESET ROLE;`;
}

export function assertC04QuantityCheckpoint(review, record, phase, reviewSha256) {
  const before = phase === "before";
  c04Check(["before", "after"].includes(phase) && SHA64.test(reviewSha256 ?? "")
    && record && Object.keys(record).sort().join() === C04_RECEIPT_KEYS
    && record.schema === `homecook.prelaunch-quantity-worker-${phase}.v1` && record.status === "committed"
    && record.feature === "ingredient-quantity-v4" && record.releaseSha === review.releaseSha && record.targetSha256 === review.targetSha256
    && record.workerReviewSha256 === reviewSha256 && record.workerOperationId === review.operationId
    && record.ledgerCount === (before ? 226 : 227) && record.catalogFingerprint === (before ? review.catalogBefore : review.catalogAfter)
    && record.credentialGeneration === (before ? 47 : 48) && record.workerReleaseSha === (before ? YOUTUBE_V71_RELEASE_SHA : review.releaseSha)
    && record.schemaIdentity === YOUTUBE_V71_SCHEMA_IDENTITY && record.snapshotDigest === review.snapshotDigest
    && record.artifactSha256 === review.artifactSha256 && record.descriptorSha256 === review.descriptorSha256
    && record.quantityPolicyEnabled === false && record.workerPolicyEnabled === false && record.productWriterEnabled === true && record.weightWriterEnabled === true
    && record.queued === 0 && record.processing === 0 && record.permitHeld === false && record.activeEnqueueSessions === 0 && record.zeroActualAI === true
    && record.serviceState === (before ? "stopped" : "running") && (before ? record.pid === null : Number.isSafeInteger(record.pid) && record.pid > 0)
    && (before ? record.workerDatabaseReceiptSha256 === null : SHA64.test(record.workerDatabaseReceiptSha256 ?? ""))
    && ["consumersReceiptSha256", "normalDataSha256", "credentialRowSha256", "policyRowSha256", "credentialMetadataSha256", "plistSha256"].every(key => SHA64.test(record[key] ?? "")),
  "checkpoint fields/source/zero budget differ");
  return record;
}

export function assertC04QuantityJournal(review, journal, reviewSha256) {
  c04Check(journal?.schema === "homecook.youtube-c04-controlled-cutover-journal.v1"
    && journal.reviewSha256 === reviewSha256 && journal.operationId === review.operationId
    && journal.operationDirectory === `${review.operationRoot}/${review.operationId}`
    && journal.releaseSha === review.releaseSha && journal.targetSha256 === review.targetSha256, "foreign controlled journal");
  return journal;
}

export function assertC04QuantityCheckpointOrigin(review, record, journal, { phase, reviewSha256, receiptSha256 }) {
  assertC04QuantityCheckpoint(review, record, phase, reviewSha256);
  assertC04QuantityJournal(review, journal, reviewSha256);
  const before = phase === "before", pointer = before ? journal.preWorkerCheckpoint : journal.postWorkerTerminal;
  const optional = before ? review.preReceiptSha256 : review.postReceiptSha256;
  c04Check(journal.state === (before ? "quiesced" : "verified-policy-disabled")
    && (pointer?.path === `${journal.operationDirectory}/${before ? "pre-worker-checkpoint.json" : "post-worker-terminal.json"}`
      || (!before && review.postReceiptSha256 === null && typeof pointer?.path === "string"
        && pointer.path.startsWith(`${journal.operationDirectory}/verifications/`)
        && UUID4.test(pointer.path.slice(`${journal.operationDirectory}/verifications/`.length).split("/")[0])
        && pointer.path.split("/").slice(-1)[0] === "post-worker-terminal.json"
        && pointer.path.slice(`${journal.operationDirectory}/verifications/`.length).split("/").length === 2))
    && SHA64.test(receiptSha256 ?? "") && pointer.sha256 === receiptSha256
    && (optional === null || optional === receiptSha256)
    && journal.workerDatabaseReceiptSha256 === record.workerDatabaseReceiptSha256, "immutable receipt/original origin differs");
  return record;
}

export function assertC04WorkerSuccessorBinding(review, binding, databaseReceiptSha256) {
  c04Check(binding && Object.keys(binding).sort().join() === "ledgerCount,migrationSha256,predecessorDatabaseReceiptSha256,receipt,reviewSha256,schema,targetSha256"
    && binding.schema === "homecook.cooked-weight-attestation-successor.v1" && binding.ledgerCount === 228
    && binding.targetSha256 === review.targetSha256 && binding.predecessorDatabaseReceiptSha256 === databaseReceiptSha256
    && [binding.reviewSha256, binding.migrationSha256, binding.predecessorDatabaseReceiptSha256, binding.receipt?.sha256].every(value => SHA64.test(value ?? ""))
    && Object.keys(binding.receipt ?? {}).sort().join() === "path,sha256"
    && typeof binding.receipt.path === "string" && binding.receipt.path.startsWith("/") && resolve(binding.receipt.path) === binding.receipt.path,
  "unbound current228 successor");
  return binding;
}

export function assertC04WorkerMaintenanceBinding(review, binding, successor) {
  if (binding?.schema === "homecook.recipe-request-role-maintenance.v1") {
    const prior=binding.predecessorMaintenance;
    c04Check(prior?.schema === "homecook.recipe-save-recovery-maintenance.v1", "request-role requires original231 authority");
    assertC04WorkerMaintenanceBinding(review,prior,successor);
    c04Check(Object.keys(binding).sort().join() === "databasePlanSha256,ledgerCount,migrationSha256,predecessorDatabaseReceiptSha256,predecessorMaintenance,receipt,reviewSha256,schema,sourceReaderRef,targetSha256"
      && binding.ledgerCount === 232 && binding.targetSha256 === review.targetSha256 && binding.predecessorDatabaseReceiptSha256 === prior.receipt.sha256
      && binding.migrationSha256 === "2322ccf737382e9738aa2c3d5cb50531c769c1a7902e2f621c8d378f9ce1505e"
      && [binding.reviewSha256,binding.predecessorDatabaseReceiptSha256,binding.databasePlanSha256,binding.receipt?.sha256].every(value=>SHA64.test(value??""))
      && /^[a-f0-9]{40}$/u.test(binding.sourceReaderRef??"") && Object.keys(binding.receipt??{}).sort().join()==="path,sha256"
      && typeof binding.receipt.path === "string" && binding.receipt.path.startsWith("/") && resolve(binding.receipt.path)===binding.receipt.path,
      "unbound exact current232 request-role maintenance");
    return binding;
  }
  if (binding?.schema === "homecook.recipe-save-recovery-maintenance.v1") {
    const prior=binding.predecessorMaintenance;
    c04Check(prior?.schema === "homecook.recipe-nutrition-validator-maintenance.v1", "recipe-save requires original229 authority");
    assertC04WorkerMaintenanceBinding(review,prior,successor);
    const migrations=[{filename:"20261014225200_recipe_snapshot_reason_identity.sql",sha256:"b6050c12e60594267908b89ff02cff0c0344a52ccb79dc9a88d21e3c57e8fe66"},
      {filename:"20261014225300_recipe_future_patch_http_replay.sql",sha256:"aed773e0d27e6b6dd4af8e65fb933d73c89927faef1d1d36804eec8476fed9c7"}];
    c04Check(Object.keys(binding).sort().join() === "databasePlanSha256,ledgerCount,migrationSha256,predecessorDatabaseReceiptSha256,predecessorMaintenance,receipt,reviewSha256,schema,sourceReaderRef,targetSha256"
      && binding.ledgerCount === 231 && binding.targetSha256 === review.targetSha256 && binding.predecessorDatabaseReceiptSha256 === prior.receipt.sha256
      && binding.migrationSha256 === createHash("sha256").update(JSON.stringify(migrations)).digest("hex")
      && [binding.reviewSha256,binding.predecessorDatabaseReceiptSha256,binding.databasePlanSha256,binding.receipt?.sha256].every(value=>SHA64.test(value??""))
      && /^[a-f0-9]{40}$/u.test(binding.sourceReaderRef??"") && Object.keys(binding.receipt??{}).sort().join()==="path,sha256"
      && typeof binding.receipt.path === "string" && binding.receipt.path.startsWith("/") && resolve(binding.receipt.path)===binding.receipt.path,
      "unbound exact current231 recipe-save maintenance");
    return binding;
  }
  assertC04WorkerSuccessorBinding(review, successor, successor?.predecessorDatabaseReceiptSha256);
  c04Check(binding && Object.keys(binding).sort().join() === "databasePlanSha256,ledgerCount,migrationSha256,predecessorDatabaseReceiptSha256,receipt,reviewSha256,schema,sourceReaderRef,targetSha256"
    && binding.schema === "homecook.recipe-nutrition-validator-maintenance.v1" && binding.ledgerCount === 229
    && binding.targetSha256 === review.targetSha256 && binding.predecessorDatabaseReceiptSha256 === successor.receipt.sha256
    && [binding.reviewSha256, binding.migrationSha256, binding.predecessorDatabaseReceiptSha256, binding.databasePlanSha256, binding.receipt?.sha256].every(value => SHA64.test(value ?? ""))
    && /^[a-f0-9]{40}$/u.test(binding.sourceReaderRef ?? "") && Object.keys(binding.receipt ?? {}).sort().join() === "path,sha256"
    && typeof binding.receipt.path === "string" && binding.receipt.path.startsWith("/") && resolve(binding.receipt.path) === binding.receipt.path,
    "unbound exact current229 validator maintenance");
  return binding;
}

export function assertC04SuccessorCheckpoint(review, record, reviewSha256) {
  const predecessor = record?.predecessorRecord;
  assertC04QuantityCheckpoint(review, predecessor, "after", reviewSha256);
  assertC04WorkerSuccessorBinding(review, record.databaseSuccessor, predecessor.workerDatabaseReceiptSha256);
  const maintenance = record.databaseMaintenance;
  if (maintenance) assertC04WorkerMaintenanceBinding(review, maintenance, record.databaseSuccessor);
  c04Check(Object.keys(record).sort().join() === [...C04_RECEIPT_KEYS.split(","), "databaseSuccessor", "predecessorRecord", ...(maintenance ? ["databaseMaintenance"] : [])].sort().join()
    && record.schema === "homecook.prelaunch-quantity-worker-after-successor.v1" && record.status === "committed"
    && record.ledgerCount === (maintenance ? maintenance.ledgerCount : 228) && record.catalogFingerprint === review.catalogAfter
    && record.serviceState === "running" && Number.isSafeInteger(record.pid) && record.pid > 0,
  "current228 checkpoint shape differs");
  for (const key of ["feature", "releaseSha", "targetSha256", "consumersReceiptSha256", "credentialGeneration", "workerReleaseSha", "schemaIdentity", "snapshotDigest",
    "credentialRowSha256", "artifactSha256", "descriptorSha256", "credentialMetadataSha256", "plistSha256", "workerDatabaseReceiptSha256", "workerOperationId", "workerReviewSha256", "zeroActualAI"])
    c04Check(isDeepStrictEqual(record[key], predecessor[key]), `current228 checkpoint ${key} changed`);
  c04Quiescence(record);
  for (const key of ["normalDataSha256", "policyRowSha256"]) c04Check(SHA64.test(record[key] ?? ""), "current228 checkpoint hash missing");
  return record;
}

function c04Identity(review, observation, stage, generation, successor = null, maintenance = null) {
  if (successor) assertC04WorkerSuccessorBinding(review, successor, successor.predecessorDatabaseReceiptSha256);
  if (maintenance) assertC04WorkerMaintenanceBinding(review, maintenance, successor);
  c04Check(isDeepStrictEqual(observation?.databaseMaintenance ?? null, maintenance), "current229 maintenance/intent differs");
  c04Check(isDeepStrictEqual(observation?.databaseSuccessor ?? null, successor) && (!successor || stage === "worker" && generation === 48), "current successor/stage differs");
  c04Check([47, 48].includes(generation) && observation.targetSha256 === review.targetSha256 && observation.ledgerCount === (maintenance ? maintenance.ledgerCount : successor ? 228 : stage === "consumers" ? 226 : 227)
    && observation.catalogFingerprint === (stage === "consumers" ? review.catalogBefore : review.catalogAfter)
    && observation.credentialGeneration === generation
    && observation.workerReleaseSha === (generation === 47 ? YOUTUBE_V71_RELEASE_SHA : review.releaseSha)
    && observation.schemaIdentity === review.schemaIdentity && observation.snapshotDigest === review.snapshotDigest, "fresh DB/source/generation identity differs");
  assertC04QuantityPolicy(observation.policy);
  c04Check(typeof observation.workerPolicyEnabled === "boolean" && observation.policy.enabled === observation.workerPolicyEnabled, "policy projection mismatch");
  c04Check(SHA64.test(observation.policyStableSha256 ?? ""), "unbound full stable policy observation");
}
function c04Quiescence(observation, quantityEnabled = false) {
  c04Check(observation.workerPolicyEnabled === false && observation.quantityPolicyEnabled === quantityEnabled
    && observation.productWriterEnabled === true && observation.weightWriterEnabled === true
    && observation.queued === 0 && observation.processing === 0 && observation.permitHeld === false && observation.activeEnqueueSessions === 0,
  "OFF/control/quiescence required for positive checkpoint");
}
function c04Record(review, reviewSha256, observation, service, consumersReceiptSha256, databaseReceiptSha256, metadataSha256, successor = null, predecessor = null) {
  const before = databaseReceiptSha256 === null;
  const record = { schema: `homecook.prelaunch-quantity-worker-${before ? "before" : "after"}.v1`, status: "committed",
    feature: "ingredient-quantity-v4", releaseSha: review.releaseSha, targetSha256: review.targetSha256,
    consumersReceiptSha256, ledgerCount: observation.ledgerCount, catalogFingerprint: observation.catalogFingerprint,
    normalDataSha256: observation.normalDataSha256, quantityPolicyEnabled: observation.quantityPolicyEnabled,
    productWriterEnabled: observation.productWriterEnabled, weightWriterEnabled: observation.weightWriterEnabled,
    workerPolicyEnabled: observation.workerPolicyEnabled, queued: observation.queued, processing: observation.processing,
    permitHeld: observation.permitHeld, activeEnqueueSessions: observation.activeEnqueueSessions,
    credentialGeneration: observation.credentialGeneration, workerReleaseSha: observation.workerReleaseSha,
    schemaIdentity: observation.schemaIdentity, snapshotDigest: observation.snapshotDigest,
    credentialRowSha256: observation.credentialRowSha256, policyRowSha256: observation.policyRowSha256,
    // These two are the sealed target, including in the stopped predecessor record.
    artifactSha256: review.artifactSha256, descriptorSha256: review.descriptorSha256,
    credentialMetadataSha256: metadataSha256, plistSha256: service.plistSha256,
    serviceState: service.loaded ? "running" : "stopped", pid: service.loaded ? service.pid : null,
    workerDatabaseReceiptSha256: databaseReceiptSha256, workerOperationId: review.operationId,
    workerReviewSha256: reviewSha256, zeroActualAI: true };
  if (successor) {
    c04Check(!before && predecessor?.credentialGeneration === 48, "successor cannot replace original47 authority");
    return assertC04SuccessorCheckpoint(review, { ...record, schema: "homecook.prelaunch-quantity-worker-after-successor.v1",
      databaseSuccessor: successor, ...(observation.databaseMaintenance ? { databaseMaintenance: observation.databaseMaintenance } : {}), predecessorRecord: predecessor.predecessorRecord ?? predecessor }, reviewSha256);
  }
  return assertC04QuantityCheckpoint(review, record, before ? "before" : "after", reviewSha256);
}

/** Fixed C04 orchestration. Adapters are trusted internal transports, never CLI inputs. */
export function createC04QuantityWorkerCutover({ review, reviewSha256, bindings, adapters }) {
  assertC04QuantityControlReview(review, bindings);
  c04Check(SHA64.test(reviewSha256 ?? ""), "original review is unbound");
  const checkedJournal = async () => assertC04QuantityJournal(review, await adapters.readJournal(), reviewSha256);
  const observe = async context => {
    if (context.successor) assertC04WorkerSuccessorBinding(review, context.successor, context.databaseReceiptSha256);
    return adapters.observe(context);
  };
  async function predecessor(context, stage, checkpoint = null) {
    const current = await observe(context);
    c04Identity(review, current, stage, 47, context.successor ?? null, context.databaseMaintenance ?? null);
    if (checkpoint) {
      c04Quiescence(current);
      for (const key of ["credentialRowSha256", "policyRowSha256", "normalDataSha256"])
        c04Check(current[key] === checkpoint[key], `predecessor ${key} changed`);
    }
    const service = await adapters.predecessorService();
    c04Check(current.jtiHash === service.jtiHash, "old47 token does not match the actual credential");
    if (checkpoint) c04Check(!service.loaded && service.plistSha256 === checkpoint.plistSha256
      && service.metadataSha256 === checkpoint.credentialMetadataSha256, "old worker resumed or predecessor files changed");
    return { current, service };
  }
  async function prepare() {
    await adapters.verifyCandidate();
    const context = await adapters.preflight("consumers");
    const { current, service } = await predecessor(context, "consumers");
    return adapters.publishPreparation({ observation: current, predecessor: service });
  }
  async function quiesce() {
    await adapters.verifyCandidate();
    await adapters.verifyPreparation();
    const context = await adapters.preflight("consumers");
    const { service } = await predecessor(context, "consumers");
    const existing = await adapters.readJournalIfPresent();
    c04Check(!existing || ["prepared", "policy-disable-intent", "policy-disabled-awaiting-quiescence", "quiesced"].includes(existing.state), "unknown quiesce origin");
    if (existing?.state === "quiesced") {
      const record = await adapters.readCheckpoint("before", existing);
      await predecessor(context, "consumers", record);
      c04Check(context.consumersReceiptSha256 === record.consumersReceiptSha256, "T1 receipt changed");
      return record;
    }
    await adapters.journal("policy-disable-intent", { workerDatabaseReceiptSha256: null, predecessor: service });
    // Busy queues/expired credentials never roll back the safe OFF itself.
    await adapters.transaction(context, async tx => {
      const before = await tx.observe(); c04Identity(review, before, "consumers", 47, context.successor ?? null, context.databaseMaintenance ?? null);
      c04Check(before.quantityPolicyEnabled === false && before.productWriterEnabled === true && before.weightWriterEnabled === true, "locked quiesce controls changed");
      await tx.closePolicy();
      const closed = await tx.observe();
      c04Identity(review, closed, "consumers", 47, context.successor ?? null, context.databaseMaintenance ?? null);
      c04Check(closed.workerPolicyEnabled === false && closed.normalDataSha256 === before.normalDataSha256
        && closed.credentialRowSha256 === before.credentialRowSha256 && closed.policyStableSha256 === before.policyStableSha256 && isDeepStrictEqual(closed.policy, { ...before.policy, enabled: false }), "policy OFF changed more than enabled/timestamp");
    });
    await adapters.journal("policy-disabled-awaiting-quiescence", { workerDatabaseReceiptSha256: null, predecessor: service });
    c04Quiescence((await predecessor(context, "consumers")).current);
    await adapters.stopPredecessor(service);
    const stopped = await adapters.predecessorService();
    c04Check(!stopped.loaded && stopped.plistSha256 === service.plistSha256 && stopped.metadataSha256 === service.metadataSha256,
      "old worker did not stop at the exact predecessor");
    const current = await observe(context);
    c04Identity(review, current, "consumers", 47, context.successor ?? null, context.databaseMaintenance ?? null); c04Quiescence(current);
    const record = c04Record(review, reviewSha256, current, stopped, context.consumersReceiptSha256, null, stopped.metadataSha256);
    return adapters.publishCheckpoint("before", record, { policyStableSha256: current.policyStableSha256 });
  }
  async function execute({ resume = false } = {}) {
    await adapters.verifyCandidate();
    await adapters.verifyPreparation();
    const journal = await checkedJournal();
    const context = await adapters.preflight("worker");
    if (context.successor) assertC04WorkerSuccessorBinding(review, context.successor, context.databaseReceiptSha256);
    const pre = await adapters.readCheckpoint(context.successor ? "after" : "before", journal);
    c04Check(context.consumersReceiptSha256 === pre.consumersReceiptSha256 && SHA64.test(context.databaseReceiptSha256 ?? ""), "DB2/consumers immutable receipt differs");
    const initial = await observe(context);
    const savedRepairBasis = journal.installationRepairBasis;
    if (savedRepairBasis) c04Check(typeof savedRepairBasis.path === "string" && SHA64.test(savedRepairBasis.sha256 ?? "")
      && savedRepairBasis.path === journal.activationVerification?.path && savedRepairBasis.sha256 === journal.activationVerification?.sha256,
    "foreign installation repair basis");
    const interruptedActivation = savedRepairBasis || ["activation-verified-policy-disabled", "activation-not-applied"].includes(journal.state)
      ? await adapters.activationOrigin(journal) : null;
    if (interruptedActivation && !savedRepairBasis) await adapters.journal(journal.state, { installationRepairBasis: journal.activationVerification });
    const repaired = !interruptedActivation && journal.repairPause ? await adapters.readRepairPause(journal) : null;
    const baseline = interruptedActivation?.observation ?? repaired?.observation ?? pre;
    if (context.successor) {
      c04Check(resume && initial.credentialGeneration === 48 && pre?.credentialGeneration === 48
        && Boolean(interruptedActivation || repaired)
        && isDeepStrictEqual(baseline.databaseSuccessor, context.successor)
        && isDeepStrictEqual(baseline.databaseMaintenance ?? null, context.databaseMaintenance ?? null), "current228 resume requires original48 current repair/activation origin");
    }
    let credentials;
    if (initial.credentialGeneration === 48) {
      c04Check(resume && ["credential-commit-intent", "credential-48-committed-policy-disabled", "install-repair-required", "checkpoint-publish-intent", "verified-policy-disabled", "repair-quiesced", "activation-verified-policy-disabled", "activation-not-applied"].includes(journal.state), "current48 requires its original resume origin");
      credentials = await adapters.existingCredentials(journal);
    } else {
      await predecessor(context, "worker", pre);
      c04Check(resume ? ["quiesced", "credential-issue-intent", "credential-issued", "credential-not-applied", "credential-commit-intent"].includes(journal.state) : journal.state === "quiesced", "unknown retry origin");
      credentials = resume && journal.credentials ? await adapters.existingCredentials(journal) : await adapters.issueCredentials();
      await adapters.journal("credential-issued", { credentials: adapters.credentialProof(credentials), workerDatabaseReceiptSha256: context.databaseReceiptSha256 });
      const manager = await adapters.issueManager(journal);
      try {
        await adapters.authenticateManager(manager);
        await adapters.journal("credential-commit-intent", { credentials: adapters.credentialProof(credentials), workerDatabaseReceiptSha256: context.databaseReceiptSha256 });
        await adapters.transaction(context, async tx => {
          const before = await tx.observe(); c04Identity(review, before, "worker", 47, context.successor ?? null, context.databaseMaintenance ?? null); c04Quiescence(before);
          for (const key of ["credentialRowSha256", "policyRowSha256", "normalDataSha256"])
            c04Check(before[key] === pre[key], `locked predecessor ${key} changed`);
          await adapters.assertStoppedPredecessor(pre);
          await tx.rotate(manager, credentials);
          const after = await tx.observe(); c04Identity(review, after, "worker", 48, context.successor ?? null, context.databaseMaintenance ?? null); c04Quiescence(after);
          c04Check(after.policyRowSha256 === before.policyRowSha256 && after.normalDataSha256 === before.normalDataSha256
            && after.policyStableSha256 === before.policyStableSha256 && isDeepStrictEqual(after.policy, before.policy)
            && after.jtiHash === credentials.metadata.jti_sha256, "CAS changed policy/data or registered a foreign credential");
        });
      } catch (error) {
        const actual = await observe(context).catch(() => null);
        let outcome = "credential-outcome-unknown";
        try {
          c04Identity(review, actual, "worker", actual?.credentialGeneration, context.successor ?? null, context.databaseMaintenance ?? null); c04Quiescence(actual);
          c04Check(actual.policyRowSha256 === pre.policyRowSha256 && actual.normalDataSha256 === pre.normalDataSha256, "unknown policy/data");
          if (actual.credentialGeneration === 48 && actual.jtiHash === credentials.metadata.jti_sha256) outcome = "credential-48-committed-policy-disabled";
          else if (actual.credentialGeneration === 47 && actual.credentialRowSha256 === pre.credentialRowSha256) outcome = "credential-not-applied";
        } catch { /* A mixed/unknown outcome never authorizes another CAS. */ }
        await adapters.journal(outcome,
          { credentials: adapters.credentialProof(credentials), workerDatabaseReceiptSha256: context.databaseReceiptSha256 });
        throw error;
      } finally { await adapters.removeManager(manager); }
      await adapters.journal("credential-48-committed-policy-disabled", { credentials: adapters.credentialProof(credentials), workerDatabaseReceiptSha256: context.databaseReceiptSha256 });
    }
    c04Check(!(repaired || interruptedActivation) || initial.credentialRowSha256 === baseline.credentialRowSha256, "repair credential changed");
    const registered = await observe(context); c04Identity(review, registered, "worker", 48, context.successor ?? null, context.databaseMaintenance ?? null); c04Quiescence(registered);
    c04Check(registered.jtiHash === credentials.metadata.jti_sha256 && registered.policyRowSha256 === baseline.policyRowSha256
      && registered.normalDataSha256 === baseline.normalDataSha256, "registered credential/policy/data differs");
    try {
      // The adapter checks actual plist before any replacement; foreign writes are never compensated over.
      const health = await adapters.installAndVerify(credentials, pre, { resume, successor: context.successor ?? null });
      c04Check(health.authenticatedStatus === 200 && health.emptyClaimDenied && health.health.ok && health.health.ready
        && health.stableObservations === 2, "actual zero-budget health is incomplete");
      const current = await observe(context); c04Identity(review, current, "worker", 48, context.successor ?? null, context.databaseMaintenance ?? null); c04Quiescence(current);
      c04Check(current.credentialRowSha256 === registered.credentialRowSha256 && current.policyRowSha256 === registered.policyRowSha256
        && current.normalDataSha256 === registered.normalDataSha256, "worker state changed during verification");
      const service = await adapters.currentService();
      const record = c04Record(review, reviewSha256, current, service, pre.consumersReceiptSha256, context.databaseReceiptSha256, credentials.metadataSha256, context.successor ?? null, pre);
      return adapters.publishCheckpoint("after", record, { repair: resume, policyStableSha256: current.policyStableSha256 });
    } catch (error) {
      await adapters.journal("install-repair-required", { credentials: adapters.credentialProof(credentials), workerDatabaseReceiptSha256: context.databaseReceiptSha256 });
      throw error; // Keep48/OFF. Never restore old47 or enable policy.
    }
  }
  async function activate() {
    const journal = await checkedJournal();
    const pendingIntent = ["activation-commit-intent", "activation-outcome-unknown"].includes(journal.state);
    // Candidate verification may materialize missing files. Resolve pending intent
    // identity using read-only evidence before allowing that or a new activation.
    if (!pendingIntent) await adapters.verifyCandidate();
    c04Check(["verified-policy-disabled", "activation-verified-policy-disabled", "activation-commit-intent", "activation-not-applied", "activation-outcome-unknown", "activation-committed"].includes(journal.state), "unknown activation origin");
    const post = await adapters.readCheckpoint("after", journal);
    const context = await adapters.preflight("worker", "on");
    c04Check(context.databaseReceiptSha256 === post.workerDatabaseReceiptSha256
      && context.consumersReceiptSha256 === post.consumersReceiptSha256, "activation DB2/T1 differs");
    const credentials = await adapters.existingCredentials(journal);
    const authority = await adapters.readerWriterAuthority(context);
    for (const key of ["readerReceiptSha256", "writerReceiptSha256"]) c04Check(SHA64.test(authority[key] ?? ""), "unbound reader/writer ON authority");
    const fresh = await observe(context); c04Identity(review, fresh, "worker", 48, context.successor ?? null, context.databaseMaintenance ?? null);
    c04Check(fresh.credentialRowSha256 === post.credentialRowSha256 && fresh.jtiHash === credentials.metadata.jti_sha256, "activation credential changed");
    if (pendingIntent) {
      const intent = await adapters.activationOrigin(journal);
      // The intent's before observation fixes the DB identity expected after its
      // enabled-only update too; historical227 cannot authorize current228.
      c04Identity(review, intent?.observation, "worker", 48, context.successor ?? null, context.databaseMaintenance ?? null);
      c04Check(intent.post?.workerDatabaseReceiptSha256 === context.databaseReceiptSha256
        && intent.post?.consumersReceiptSha256 === context.consumersReceiptSha256
        && intent.authority?.readerReceiptSha256 === authority.readerReceiptSha256
        && intent.authority?.writerReceiptSha256 === authority.writerReceiptSha256
        && fresh.credentialRowSha256 === intent.observation.credentialRowSha256
        && fresh.policyStableSha256 === intent.observation.policyStableSha256
        && isDeepStrictEqual(fresh.policy, { ...intent.observation.policy, enabled: fresh.workerPolicyEnabled })
        && (fresh.workerPolicyEnabled || fresh.policyRowSha256 === intent.observation.policyRowSha256),
      "pending activation intent authority/whole policy differs");
      await adapters.verifyCandidate();
    }
    if (fresh.workerPolicyEnabled) {
      c04Check(["activation-committed", "activation-commit-intent", "activation-outcome-unknown"].includes(journal.state), "already ON without original durable activation intent");
      if (journal.state !== "activation-committed") return adapters.finalizeActivation(context, journal, credentials, post, authority);
      return adapters.verifyActivationReceipt(context, journal, credentials, post, authority);
    }
    c04Quiescence(fresh, true);
    c04Check(fresh.policyRowSha256 === post.policyRowSha256, "activation policy changed since OFF proof");
    const health = await adapters.verifyInstalled(credentials, post);
    c04Check(health.authenticatedStatus === 200 && health.emptyClaimDenied && health.health.ok && health.health.ready
      && health.stableObservations === 2 && health.service.loaded && health.service.plistSha256 === post.plistSha256,
    "fresh activation verification incomplete");
    const proof = await adapters.publishActivationVerification({ observation: fresh, service: health.service, post, authority });
    try {
      await adapters.journal("activation-commit-intent", { activationVerification: proof });
      await adapters.transaction(context, async tx => {
        const before = await tx.observe(); c04Identity(review, before, "worker", 48, context.successor ?? null, context.databaseMaintenance ?? null); c04Quiescence(before, true);
        for (const key of ["credentialRowSha256", "policyRowSha256", "normalDataSha256"]) c04Check(before[key] === fresh[key], "locked activation state changed");
        await adapters.assertStableInstalled(health.service);
        await tx.enablePolicy();
        const after = await tx.observe(); c04Identity(review, after, "worker", 48, context.successor ?? null, context.databaseMaintenance ?? null);
        c04Check(after.workerPolicyEnabled === true && after.quantityPolicyEnabled === true
          && after.productWriterEnabled === true && after.weightWriterEnabled === true
          && after.credentialRowSha256 === before.credentialRowSha256 && after.normalDataSha256 === before.normalDataSha256
          && after.policyStableSha256 === before.policyStableSha256 && isDeepStrictEqual(after.policy, { ...before.policy, enabled: true })
          && after.queued === 0 && after.processing === 0 && after.permitHeld === false && after.activeEnqueueSessions === 0,
        "activation changed more than worker enabled/timestamp");
      });
    } catch (error) {
      const actual = await observe(context).catch(() => null);
      const known = actual?.credentialRowSha256 === fresh.credentialRowSha256 && actual?.targetSha256 === review.targetSha256
        && actual?.ledgerCount === (context.databaseMaintenance ? context.databaseMaintenance.ledgerCount : context.successor ? 228 : 227) && actual?.catalogFingerprint === review.catalogAfter
        && isDeepStrictEqual(actual?.databaseSuccessor ?? null, context.successor ?? null)
        && isDeepStrictEqual(actual?.databaseMaintenance ?? null, context.databaseMaintenance ?? null);
      await adapters.journal(known && actual.workerPolicyEnabled === false ? "activation-not-applied" : "activation-outcome-unknown", { activationVerification: proof });
      throw error; // Never compensate a possibly committed ON by restoring old credentials/plist.
    }
    return adapters.publishActivationReceipt(context, proof, authority);
  }
  async function pauseForRepair() {
    await adapters.verifyCandidate();
    const journal = await checkedJournal();
    c04Check(["activation-committed", "activation-commit-intent", "activation-outcome-unknown", "repair-disable-intent", "repair-drain-pending", "repair-quiesced"].includes(journal.state), "repair lacks original activation origin");
    const post = await adapters.readCheckpoint("after", journal);
    const context = await adapters.preflight("worker");
    c04Check(context.databaseReceiptSha256 === post.workerDatabaseReceiptSha256, "repair DB2 differs");
    const activation = await adapters.activationOrigin(journal);
    const initial = await observe(context); c04Identity(review, initial, "worker", 48, context.successor ?? null, context.databaseMaintenance ?? null);
    c04Check(initial.quantityPolicyEnabled === false && initial.productWriterEnabled === true && initial.weightWriterEnabled === true
      && initial.credentialRowSha256 === activation.observation.credentialRowSha256
      && initial.policyStableSha256 === activation.observation.policyStableSha256
      && isDeepStrictEqual(initial.policy, { ...activation.observation.policy, enabled: initial.workerPolicyEnabled }), "repair foreign control/policy/credential");
    if (!journal.activationReceipt) await adapters.reconcileActivation(journal, initial, post);
    const service = await adapters.currentService();
    c04Check(service.plistSha256 === post.plistSha256, "repair foreign launcher");
    const repairBefore = journal.state.startsWith("repair-") && journal.repairBeforeObservation ? journal.repairBeforeObservation : initial;
    if (context.successor) c04Identity(review, repairBefore, "worker", 48, context.successor, context.databaseMaintenance ?? null);
    c04Check(repairBefore.credentialRowSha256 === initial.credentialRowSha256 && repairBefore.policyStableSha256 === initial.policyStableSha256,
      "original repair intent differs");
    await adapters.journal("repair-disable-intent", { repairBeforeObservation: repairBefore });
    await adapters.transaction(context, async tx => {
      const before = await tx.observe(); c04Identity(review, before, "worker", 48, context.successor ?? null, context.databaseMaintenance ?? null);
      c04Check(before.quantityPolicyEnabled === false && before.productWriterEnabled === true && before.weightWriterEnabled === true
        && before.credentialRowSha256 === initial.credentialRowSha256 && before.policyRowSha256 === initial.policyRowSha256,
      "locked repair authority changed");
      await tx.closePolicy();
      const after = await tx.observe(); c04Identity(review, after, "worker", 48, context.successor ?? null, context.databaseMaintenance ?? null);
      c04Check(after.workerPolicyEnabled === false && after.credentialRowSha256 === before.credentialRowSha256
        && after.normalDataSha256 === before.normalDataSha256 && after.policyStableSha256 === before.policyStableSha256
        && isDeepStrictEqual(after.policy, { ...before.policy, enabled: false }), "repair OFF changed more than enabled/timestamp");
    });
    const closed = await observe(context); c04Identity(review, closed, "worker", 48, context.successor ?? null, context.databaseMaintenance ?? null);
    c04Check(closed.workerPolicyEnabled === false, "repair OFF not confirmed");
    const drained = closed.queued === 0 && closed.processing === 0 && !closed.permitHeld && closed.activeEnqueueSessions === 0;
    if (!drained) return adapters.publishRepairPause({ beforeObservation: repairBefore, observation: closed, service, status: "drain_pending", post });
    await adapters.stopInstalled(service);
    const stopped = await adapters.currentService();
    c04Check(!stopped.loaded && stopped.plistSha256 === post.plistSha256, "exact48 worker not stopped");
    const final = await observe(context); c04Identity(review, final, "worker", 48, context.successor ?? null, context.databaseMaintenance ?? null); c04Quiescence(final);
    return adapters.publishRepairPause({ beforeObservation: repairBefore, observation: final, service: stopped, status: "quiesced", post });
  }
  return { prepare, quiesce, execute, resume: () => execute({ resume: true }), activate, pauseForRepair };
}
