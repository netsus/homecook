import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  assertCredentialTransition,
  assertDatabaseTransition,
  assertEnqueueClosureEvidence,
  assertRepresentativeSavedFlowEvidence,
  assertResolutionReview,
  assertRuntimeUnchanged,
  assertSourceEvidence,
  assertWorkerInstallAuthority,
  LIVE_CATALOG_FINGERPRINT,
  LIVE_CREDENTIAL_GENERATION,
  LIVE_PIPELINE_IDENTITY,
  LIVE_POLICY_SNAPSHOT_DIGEST,
  LIVE_WEB_SHA,
  LIVE_WORKER_SHA,
  MIGRATIONS,
  SCHEMA_IDENTITY,
  SOURCE_BACKFILL,
  TARGET_CATALOG_FINGERPRINT,
  TARGET_CREDENTIAL_GENERATION,
} from "../scripts/lib/prelaunch-youtube-resolution-contract.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const target = "a".repeat(40);
const runtimeFiles = Object.fromEntries(Array.from({ length: 22 }, (_, index) => [
  `runtime/file-${index}.mjs`, sha(`runtime-${index}`),
]));

function review() {
  return {
    schema: "homecook.prelaunch-youtube-resolution-review.v1",
    from: LIVE_WEB_SHA,
    to: target,
    integrationSourceRef: "b".repeat(40),
    previousMigrationCount: 213,
    migrationCount: 215,
    migrations: MIGRATIONS.map((filename) => ({ filename, sha256: sha(filename) })),
    sourceBackfill: { filename: SOURCE_BACKFILL, sha256: sha(SOURCE_BACKFILL) },
    files: {
      "lib/ingredient-search.ts": [sha("old"), sha("new")],
      [`supabase/migrations/${MIGRATIONS[0]}`]: [null, sha(MIGRATIONS[0])],
      [`supabase/migrations/${MIGRATIONS[1]}`]: [null, sha(MIGRATIONS[1])],
    },
    protectedSources: ["lib/ingredient-search.ts"],
    runtimeFiles,
    artifact: {
      identitySha256: sha("artifact identity"),
      fileSha256: sha("artifact file"),
      descriptorFileSha256: sha("descriptor file"),
      expectedSchemaSha256: sha("expected schema"),
    },
    previousWorker: {
      releaseSha: LIVE_WORKER_SHA,
      plistPath: "/Users/operator/Library/LaunchAgents/com.homecook.youtube-extraction-worker.plist",
      plistSha256: sha("previous plist"),
      beforeClosureLoaded: true,
      beforeClosureState: "running",
      atInstallLoaded: false,
      atInstallState: "unloaded",
    },
    catalog: { before: LIVE_CATALOG_FINGERPRINT, after: TARGET_CATALOG_FINGERPRINT },
    policy: { version: 3, pipelineIdentity: LIVE_PIPELINE_IDENTITY, snapshotDigest: LIVE_POLICY_SNAPSHOT_DIGEST },
    credential: {
      beforeGeneration: LIVE_CREDENTIAL_GENERATION,
      afterGeneration: TARGET_CREDENTIAL_GENERATION,
      schemaIdentity: SCHEMA_IDENTITY,
      maxTtlSeconds: 604800,
    },
    proofs: Object.fromEntries([
      "platformBackup", "isolatedRestore", "dbBefore", "enqueueClosure", "dbApplyReceipt", "workerArtifact", "appDescriptor",
    ].map((name) => [name, {
      path: `/private/${name}.json`,
      sha256: sha(name === "workerArtifact" ? "artifact file" : name === "appDescriptor" ? "descriptor file" : name),
    }])),
  };
}

test("accepts only the exact reviewed source pair and file bytes", () => {
  const expected = review();
  assert.doesNotThrow(() => assertResolutionReview(expected));
  assert.doesNotThrow(() => assertSourceEvidence(expected, {
    from: expected.from, to: expected.to, files: structuredClone(expected.files),
  }));
  assert.throws(() => assertSourceEvidence(expected, {
    from: expected.from, to: "c".repeat(40), files: expected.files,
  }), /source SHA drift/u);
  assert.throws(() => assertSourceEvidence(expected, {
    from: expected.from, to: expected.to,
    files: { ...expected.files, "lib/ingredient-search.ts": [sha("old"), sha("wrong")] },
  }), /source bytes drift/u);
});

test("denies any v63 runtime byte drift", () => {
  const expected = review();
  assert.doesNotThrow(() => assertRuntimeUnchanged(expected, structuredClone(runtimeFiles)));
  assert.throws(() => assertRuntimeUnchanged(expected, {
    ...runtimeFiles,
    "runtime/file-7.mjs": sha("changed runtime"),
  }), /v63 runtime changed/u);
});

test("denies wrong ledger count or catalog fingerprint", () => {
  const expected = review();
  const before = { ledgerCount: 213, catalogFingerprint: LIVE_CATALOG_FINGERPRINT, aiAutomaticEnabled: false };
  const after = { ledgerCount: 215, catalogFingerprint: TARGET_CATALOG_FINGERPRINT, aiAutomaticEnabled: false, migrationFiles: [...MIGRATIONS] };
  assert.doesNotThrow(() => assertDatabaseTransition(expected, before, after));
  assert.throws(() => assertDatabaseTransition(expected, before, { ...after, ledgerCount: 214 }), /DB poststate/u);
  assert.throws(() => assertDatabaseTransition(expected, before, { ...after, catalogFingerprint: sha("wrong") }), /DB poststate/u);
});

test("denies snapshot, release, role, generation, and TTL drift", () => {
  const expected = review();
  const now = Date.parse("2026-10-10T00:00:00.000Z");
  const before = {
    generation: 45, releaseSha: LIVE_WORKER_SHA, schemaIdentity: SCHEMA_IDENTITY,
    allowedSnapshotDigest: expected.policy.snapshotDigest,
    expiresAt: "2026-10-14T00:00:00.000Z", role: "youtube_extraction_worker",
  };
  const after = {
    generation: 46, releaseSha: expected.to, schemaIdentity: SCHEMA_IDENTITY,
    allowedSnapshotDigest: expected.policy.snapshotDigest,
    expiresAt: "2026-10-13T23:00:00.000Z", role: "youtube_extraction_worker",
  };
  assert.doesNotThrow(() => assertCredentialTransition(expected, before, after, now));
  assert.throws(() => assertCredentialTransition(expected, before, { ...after, generation: 47 }, now), /generation\/release/u);
  assert.throws(() => assertCredentialTransition(expected, before, { ...after, releaseSha: "d".repeat(40) }, now), /generation\/release/u);
  assert.throws(() => assertCredentialTransition(expected, before, { ...after, allowedSnapshotDigest: sha("wrong") }, now), /snapshot changed/u);
  assert.throws(() => assertCredentialTransition(expected, before, { ...after, role: "service_role" }, now), /role changed/u);
  assert.throws(() => assertCredentialTransition(expected, before, { ...after, expiresAt: "2026-10-15T00:00:01.000Z" }, now), /non-extension/u);
});

test("worker install authority is tied to exact DB, artifact, descriptor and drained queue", () => {
  const expected = review();
  const authority = {
    releaseSha: expected.to,
    runtimeFiles,
    catalogFingerprint: TARGET_CATALOG_FINGERPRINT,
    policyVersion: 3,
    pipelineIdentity: expected.policy.pipelineIdentity,
    snapshotDigest: expected.policy.snapshotDigest,
    credentialGeneration: 46,
    queue: { queued: 0, processing: 0 },
    permitHeld: false,
    dbReceiptSha256: expected.proofs.dbApplyReceipt.sha256,
    artifactIdentitySha256: expected.artifact.identitySha256,
    artifactFileSha256: expected.artifact.fileSha256,
    descriptorFileSha256: expected.artifact.descriptorFileSha256,
    expectedSchemaSha256: expected.artifact.expectedSchemaSha256,
    previousPlistPath: expected.previousWorker.plistPath,
    previousPlistSha256: sha("previous plist"),
    previousLoaded: false,
    previousState: "unloaded",
    enqueueClosureSha256: expected.proofs.enqueueClosure.sha256,
    workerStopped: true,
  };
  assert.doesNotThrow(() => assertWorkerInstallAuthority(expected, authority));
  assert.throws(() => assertWorkerInstallAuthority(expected, { ...authority, snapshotDigest: sha("wrong") }), /policy\/snapshot/u);
  assert.throws(() => assertWorkerInstallAuthority(expected, { ...authority, credentialGeneration: 45 }), /generation/u);
  assert.throws(() => assertWorkerInstallAuthority(expected, { ...authority, queue: { queued: 1, processing: 0 } }), /queue\/permit/u);
});

test("DB mutation requires fail-closed enqueue plus stable drain observations", () => {
  const expected = review();
  const closure = {
    schema: "homecook.youtube-resolution-enqueue-closure.v1",
    webReleaseSha: LIVE_WEB_SHA,
    descriptorFileSha256: expected.artifact.descriptorFileSha256,
    closedAt: "2026-10-10T00:00:00.000Z",
    httpProbe: { status: 503, errorCode: "QUEUE_UNAVAILABLE", databaseWrite: false },
    enqueueWriteDelta: 0,
    observations: [
      { observedAt: "2026-10-10T00:00:01.000Z", queued: 0, processing: 0, permitHeld: false },
      { observedAt: "2026-10-10T00:00:07.000Z", queued: 0, processing: 0, permitHeld: false },
    ],
    activeEnqueueSessions: 0,
    workerStopped: true,
    policyChanged: false,
    permissionsChanged: false,
  };
  assert.doesNotThrow(() => assertEnqueueClosureEvidence(expected, closure));
  assert.throws(() => assertEnqueueClosureEvidence(expected, { ...closure, observations: closure.observations.slice(0, 1) }), /two drained/u);
  assert.throws(() => assertEnqueueClosureEvidence(expected, { ...closure, enqueueWriteDelta: 1 }), /fail closed/u);
  assert.throws(() => assertEnqueueClosureEvidence(expected, { ...closure, activeEnqueueSessions: 1 }), /not quiescent/u);
  assert.throws(() => assertEnqueueClosureEvidence(expected, { ...closure, httpProbe: { ...closure.httpProbe, status: 200 } }), /fail closed/u);
});

test("representative saved flow proves a real edit/reopen and preserves source", () => {
  const evidence = {
    schema: "homecook.youtube-resolution-representative-saved-flow.v1",
    origin: "isolated-cache-clone",
    authenticated: true,
    testOwned: true,
    autosaved: true,
    initialContentSha256: sha("content"),
    editedContentSha256: sha("edited content"),
    reopenedContentSha256: sha("edited content"),
    initialSourceSha256: sha("source"),
    finalSourceSha256: sha("source"),
    initialRevision: 3,
    finalRevision: 4,
    resolvedLinkCount: 2,
    modelCalls: 0,
    videoExtractions: 0,
    editWrites: 1,
    reopened: true,
    crossOwnerReadDenied: true,
  };
  assert.doesNotThrow(() => assertRepresentativeSavedFlowEvidence(evidence));
  assert.throws(() => assertRepresentativeSavedFlowEvidence({ ...evidence, reopenedContentSha256: sha("changed") }), /content mismatch/u);
  assert.throws(() => assertRepresentativeSavedFlowEvidence({ ...evidence, modelCalls: 1 }), /origin scope/u);
  assert.doesNotThrow(() => assertRepresentativeSavedFlowEvidence({
    ...evidence,
    origin: "new-v63-pilot",
    modelCalls: 1,
    videoExtractions: 1,
  }));
});
