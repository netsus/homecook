import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  buildYoutubeResolutionDbPlan,
  assertYoutubeResolutionDbPoststate,
  assertYoutubeResolutionLockedPrestate,
  YOUTUBE_RESOLUTION_POSTGRES_MAJOR,
  YOUTUBE_RESOLUTION_TARGET_SYSTEM_ID,
} from "../scripts/lib/prelaunch-youtube-resolution-db-plan.mjs";
import {
  LIVE_CATALOG_FINGERPRINT,
  LIVE_PIPELINE_IDENTITY,
  LIVE_POLICY_SNAPSHOT_DIGEST,
  LIVE_WEB_SHA,
  MIGRATIONS,
  SCHEMA_IDENTITY,
  SOURCE_BACKFILL,
  TARGET_CATALOG_FINGERPRINT,
  YOUTUBE_RESOLUTION_BASELINE_ABSENT_FUNCTIONS,
  YOUTUBE_RESOLUTION_FUNCTION_SIGNATURES,
} from "../scripts/lib/prelaunch-youtube-resolution-contract.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const ledger = Array.from({ length: 213 }, (_, index) => ({ filename: `${String(index).padStart(14, "0")}_old.sql`, sha256: sha(String(index)) }));
const migrations = MIGRATIONS.map((filename) => ({ filename, sha256: sha(filename) }));
const runtimeFiles = Object.fromEntries(Array.from({ length: 22 }, (_, index) => [`runtime/${index}`, sha(`r${index}`)]));
const review = {
  schema: "homecook.prelaunch-youtube-resolution-precutover-authority.v1",
  from: LIVE_WEB_SHA,
  to: "a".repeat(40),
  integrationSourceRef: "b".repeat(40),
  previousMigrationCount: 213,
  migrationCount: 215,
  migrations,
  sourceBackfill: { filename: SOURCE_BACKFILL, sha256: sha(SOURCE_BACKFILL) },
  files: { "lib/ingredient-search.ts": [sha("old"), sha("new")] },
  protectedSources: ["lib/ingredient-search.ts"],
  runtimeFiles,
  artifact: { identitySha256: sha("aid"), fileSha256: sha("afile"), descriptorFileSha256: sha("desc"), expectedSchemaSha256: sha("schema") },
  previousWorker: { releaseSha: "370483030665cb25548c40865544c3b6f4f49cbc", plistPath: "/Users/operator/Library/LaunchAgents/com.homecook.youtube-extraction-worker.plist", plistSha256: sha("plist"), beforeClosureLoaded: true, beforeClosureState: "running", atInstallLoaded: false, atInstallState: "unloaded" },
  catalog: { before: LIVE_CATALOG_FINGERPRINT, after: TARGET_CATALOG_FINGERPRINT },
  policy: { version: 3, pipelineIdentity: LIVE_PIPELINE_IDENTITY, snapshotDigest: LIVE_POLICY_SNAPSHOT_DIGEST },
  credential: { beforeGeneration: 45, afterGeneration: 46, schemaIdentity: SCHEMA_IDENTITY, maxTtlSeconds: 604800 },
  proofs: Object.fromEntries(["platformBackup","isolatedRestore","dbBefore","enqueueClosure","workerArtifact","appDescriptor"].map((name) => [name, { path: `/private/${name}`, sha256: sha(name === "workerArtifact" ? "afile" : name === "appDescriptor" ? "desc" : name) }])),
};
const closure = {
  schema: "homecook.youtube-resolution-enqueue-closure.v1", webReleaseSha: LIVE_WEB_SHA,
  descriptorFileSha256: review.artifact.descriptorFileSha256,
  closedAt: "2026-10-10T00:00:00.000Z",
  httpProbe: { status: 503, errorCode: "QUEUE_UNAVAILABLE", databaseWrite: false },
  enqueueWriteDelta: 0,
  observations: [
    { observedAt: "2026-10-10T00:00:01.000Z", queued: 0, processing: 0, permitHeld: false },
    { observedAt: "2026-10-10T00:00:07.000Z", queued: 0, processing: 0, permitHeld: false },
  ],
  activeEnqueueSessions: 0, workerStopped: true, policyChanged: false, permissionsChanged: false,
};
const protectedDigests = Object.fromEntries([
  "public.ingredients", "public.nutrition_sources", "public.nutrition_source_items",
  "public.nutrition_profiles", "public.nutrition_values", "public.ingredient_nutrition_profiles",
  "public.youtube_saved_recipe_results",
].map((name) => [name, sha(name)]));
const clone = {
  source_archive_sha256: sha("backup"),
  status: "PASS", source: { ledger_count: 213, catalog_fingerprint: LIVE_CATALOG_FINGERPRINT, synonym_count: 4146, protected_relation_sha256: protectedDigests },
  target: { ledger_count: 215, catalog_fingerprint: TARGET_CATALOG_FINGERPRINT, synonym_count: 4147, protected_relation_sha256: protectedDigests },
  rerun: { ledger_count: 215, catalog_fingerprint: TARGET_CATALOG_FINGERPRINT, synonym_count: 4147, protected_relation_sha256: protectedDigests },
  synonym_insert_delta: 1, cleanup_verified: true,
  migrations: migrations.map((row) => ({ path: `supabase/migrations/${row.filename}`, sha256: row.sha256 })),
};
const prestate = {
  target: { systemId: YOUTUBE_RESOLUTION_TARGET_SYSTEM_ID, postgresMajor: YOUTUBE_RESOLUTION_POSTGRES_MAJOR }, ledger, catalogFingerprint: LIVE_CATALOG_FINGERPRINT,
  synonymCount: 4146,
  aiAutomaticEnabled: false, policyVersion: 3, pipelineIdentity: LIVE_PIPELINE_IDENTITY,
  snapshotDigest: LIVE_POLICY_SNAPSHOT_DIGEST, queue: { queued: 0, processing: 0 },
  permitHeld: false, activeEnqueueSessions: 0, workerStopped: true,
  functionEvidence: YOUTUBE_RESOLUTION_FUNCTION_SIGNATURES.map((signature) =>
    YOUTUBE_RESOLUTION_BASELINE_ABSENT_FUNCTIONS.includes(signature)
      ? { signature, exists: false }
      : { signature, exists: true, definitionSha256: sha(signature), owner: "postgres", acl: null, securityDefiner: true, config: [] }),
  preservation: protectedDigests,
};
const expectedFunctionEvidence = YOUTUBE_RESOLUTION_FUNCTION_SIGNATURES.map((signature, index) => ({
  signature, definitionSha256: sha(`new${index}`), owner: "postgres",
  acl: null, securityDefiner: index > 4, config: ["search_path=pg_catalog"],
}));

test("builds a fail-closed 213-to-215 transaction plan", () => {
  const plan = buildYoutubeResolutionDbPlan({ review, prestate, closureEvidence: closure,
    backupCloneEvidence: clone, sourceLedger: [...ledger, ...migrations], backupArchiveSha256: sha("backup"),
    expectedFunctionEvidence });
  assert.equal(plan.status, "PREPARED_NOT_AUTHORIZED");
  assert.equal(plan.executionRole, "supabase_admin");
  assert.equal(plan.executeAuthorized, false);
  assert.equal(plan.credentialApprovalRequiredBeforeCutover, true);
  assert.ok(plan.lockSql.some((sql) => sql.includes("youtube_extraction_jobs")));
  assert.doesNotThrow(() => assertYoutubeResolutionLockedPrestate(plan, { ...prestate }));
  const observed = {
    review, ledger: plan.sourceLedger, catalogFingerprint: TARGET_CATALOG_FINGERPRINT,
    aiAutomaticEnabled: false, preservation: protectedDigests, functionEvidence: expectedFunctionEvidence,
    policyVersion: 3, pipelineIdentity: LIVE_PIPELINE_IDENTITY, snapshotDigest: LIVE_POLICY_SNAPSHOT_DIGEST,
    queue: { queued: 0, processing: 0 }, permitHeld: false, activeEnqueueSessions: 0,
    synonymCount: 4147, synonymInsertDelta: 1,
  };
  assert.doesNotThrow(() => assertYoutubeResolutionDbPoststate(review, plan, observed));
  assert.throws(() => assertYoutubeResolutionDbPoststate(review, plan, { ...observed, functionEvidence: [] }), /poststate/u);
  assert.throws(() => assertYoutubeResolutionDbPoststate(review, plan, { ...observed, snapshotDigest: sha("wrong") }), /poststate/u);
});

test("rejects a race, source drift, or protected-data drift", () => {
  const sourceLedger = [...ledger, ...migrations];
  assert.throws(() => buildYoutubeResolutionDbPlan({ review, prestate,
    closureEvidence: { ...closure, activeEnqueueSessions: 1 }, backupCloneEvidence: clone,
    sourceLedger, backupArchiveSha256: sha("backup"), expectedFunctionEvidence }), /not quiescent/u);
  assert.throws(() => buildYoutubeResolutionDbPlan({ review, prestate, closureEvidence: closure,
    backupCloneEvidence: clone, sourceLedger: sourceLedger.map((row, index) => index === 214 ? { ...row, sha256: sha("wrong") } : row),
    backupArchiveSha256: sha("backup"), expectedFunctionEvidence }), /source closure/u);
  assert.throws(() => buildYoutubeResolutionDbPlan({ review, prestate, closureEvidence: closure,
    backupCloneEvidence: { ...clone, target: { ...clone.target, protected_relation_sha256: { ...protectedDigests, "public.ingredients": sha("changed") } } },
    sourceLedger, backupArchiveSha256: sha("backup"), expectedFunctionEvidence }), /preservation/u);
  const plan = buildYoutubeResolutionDbPlan({ review, prestate, closureEvidence: closure,
    backupCloneEvidence: clone, sourceLedger, backupArchiveSha256: sha("backup"), expectedFunctionEvidence });
  assert.throws(() => assertYoutubeResolutionLockedPrestate(plan, { ...prestate, snapshotDigest: sha("wrong") }), /locked prestate/u);
  assert.throws(() => assertYoutubeResolutionLockedPrestate(plan, { ...prestate, preservation: { ...protectedDigests, "public.ingredients": sha("changed") } }), /locked prestate/u);
});
