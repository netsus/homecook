/** Exact one-release readiness for the 2026-10-10 YouTube resolution rollout. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { DeploymentError, inheritRound2Readiness } from "./prelaunch-web-deploy.mjs";
import { createRecordingDockerAdapter, privatePath } from "./marketing-round2-controlled-deploy.mjs";
import {
  assertDatabaseTransition,
  assertEnqueueClosureEvidence,
  assertResolutionReview,
  assertRuntimeUnchanged,
  assertSourceEvidence,
  resolutionDatabaseTarget,
  LIVE_CATALOG_FINGERPRINT,
  LIVE_PIPELINE_IDENTITY,
  LIVE_POLICY_SNAPSHOT_DIGEST,
  LIVE_WEB_SHA,
  MIGRATIONS,
  TARGET_CATALOG_FINGERPRINT,
  YOUTUBE_RESOLUTION_FUNCTION_SIGNATURES,
} from "./prelaunch-youtube-resolution-contract.mjs";

// Filled only after the exact R source, backup-clone evidence, DB receipt,
// artifact and descriptor have all been independently reviewed. CLI/env cannot
// override this pin. An empty pin intentionally prohibits deployment.
export const YOUTUBE_RESOLUTION_REVIEW_PIN = Object.freeze({
  path: "/Users/cwj/.homecook/operations/youtube-resolution-20261010/web-rollout-review.json",
  sha256: "d98737dd9677c31d79cdb7a8d87e1c74e8cbcb8b40284bf00ece556fb9e5eae9",
});
// Filled only after the worker installer creates and verifies its immutable
// success receipt. Keeping this separate avoids a pre-install circular proof.
export const YOUTUBE_RESOLUTION_WEB_ACTIVATION_PIN = Object.freeze({
  path: "/Users/cwj/.homecook/operations/youtube-resolution-20261010/web-activation-private-proofs.json",
  sha256: "28daf06c55eba93973c82729aae66c4aa64ed09bda28568be9619e88b3f12fb3",
});
export const YOUTUBE_RESOLUTION_LIVE_SHA = LIVE_WEB_SHA;
export const YOUTUBE_RESOLUTION_TARGET_CATALOG = TARGET_CATALOG_FINGERPRINT;
export const YOUTUBE_RESOLUTION_LEDGER_SQL = "SELECT coalesce(json_agg(t ORDER BY filename),'[]'::json) FROM (SELECT filename,sha256 FROM homecook_deploy.migrations) t;";
const SHA = /^[a-f0-9]{64}$/u;
const REF = /^[a-f0-9]{40}$/u;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const requireValue = (value, message) => { if (!value) throw new DeploymentError(`Reviewed YouTube resolution readiness: ${message}`); };
const sorted = (values) => [...values].sort();
const PROTECTED_RELATIONS = [
  "public.ingredients",
  "public.nutrition_sources",
  "public.nutrition_source_items",
  "public.nutrition_profiles",
  "public.nutrition_values",
  "public.ingredient_nutrition_profiles",
  "public.youtube_saved_recipe_results",
].sort();
const R2_PROOF_NAMES = [
  "db_authority", "db_migration", "operator_approval", "privacy_consent", "retention_runbook", "turnstile_live",
  "direct_access_denial", "header_overwrite", "launch_binding",
].sort();

export const YOUTUBE_RESOLUTION_FUNCTION_EVIDENCE_SQL = `WITH expected(signature) AS (VALUES
  ('public.ingredient_lookup_name_candidates(text,text,text)'),
  ('public.match_ingredient_name_exact_with_context(text,text,text)'),
  ('public.match_ingredient_name_exact(text)'),
  ('public.resolve_youtube_extraction_job_draft(uuid,text,bigint,bigint,text,jsonb)'),
  ('public.read_youtube_extraction_enqueue_readiness()'),
  ('private.assert_youtube_extraction_catalog_ready()'),
  ('private.project_youtube_saved_recipe_result(public.youtube_saved_recipe_results)'),
  ('private.project_youtube_saved_recipe_ingredient_links(public.youtube_saved_recipe_results)')
), resolved AS (
  SELECT signature, signature::regprocedure AS oid FROM expected
)
SELECT coalesce(jsonb_agg(jsonb_build_object(
  'signature', expected.signature,
  'definitionSha256', encode(extensions.digest(convert_to(pg_get_functiondef(p.oid),'UTF8'),'sha256'),'hex'),
  'owner', pg_get_userbyid(p.proowner),
  'acl', coalesce(to_jsonb(p.proacl),'null'::jsonb),
  'securityDefiner', p.prosecdef,
  'config', coalesce(to_jsonb(p.proconfig),'null'::jsonb)
) ORDER BY expected.signature),'[]'::jsonb)
FROM resolved expected JOIN pg_proc p ON p.oid=expected.oid;`;

function exactKeys(value, expected, label) {
  requireValue(value && typeof value === "object" && !Array.isArray(value)
    && isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort()), `${label} fields changed`);
}

export function assertYoutubeResolutionReviewPin(pin) {
  requireValue(isAbsolute(pin?.path ?? "") && SHA.test(pin?.sha256 ?? ""), "review pin is not configured");
}

export function assertYoutubeResolutionWebActivationPin(pin) {
  requireValue(isAbsolute(pin?.path ?? "") && SHA.test(pin?.sha256 ?? ""), "post-install activation pin is not configured");
}

export function assertYoutubeResolutionWorkerInstallResult(result, review) {
  const expectedKeys = [
    "schema", "status", "releaseSha", "artifactIdentitySha256", "artifactFileSha256",
    "descriptorFileSha256", "expectedSchemaSha256", "credentialGeneration", "policyVersion",
    "pipelineIdentity", "snapshotDigest", "plistSha256", "runningObservations",
    "authenticatedPreRequest", "emptyClaimSucceeded", "queue", "permitFree", "installedAt", "changed",
  ];
  exactKeys(result, expectedKeys, "worker install result");
  requireValue(result.schema === "homecook.prelaunch-youtube-resolution-worker-install-result.v1"
    && result.status === "installed-verified" && result.releaseSha === review.contract.to
    && result.artifactIdentitySha256 === review.contract.artifact.identitySha256
    && result.artifactFileSha256 === review.contract.artifact.fileSha256
    && result.descriptorFileSha256 === review.contract.artifact.descriptorFileSha256
    && result.expectedSchemaSha256 === review.contract.artifact.expectedSchemaSha256
    && result.credentialGeneration === review.contract.credential.afterGeneration
    && result.policyVersion === review.contract.policy.version
    && result.pipelineIdentity === review.contract.policy.pipelineIdentity
    && result.snapshotDigest === review.contract.policy.snapshotDigest
    && SHA.test(result.plistSha256 ?? "") && Number.isFinite(Date.parse(result.installedAt))
    && result.authenticatedPreRequest === true && result.emptyClaimSucceeded === true
    && result.queue?.queued === 0 && result.queue?.processing === 0 && result.permitFree === true
    && result.changed === true, "worker install result identity/health mismatch");
  requireValue(Array.isArray(result.runningObservations) && result.runningObservations.length === 2
    && result.runningObservations.every((row) => row.loaded === true && row.state === "running"
      && Number.isInteger(row.pid) && row.pid > 0)
    && result.runningObservations[0].pid === result.runningObservations[1].pid,
  "worker install running observations mismatch");
  return true;
}

export function assertYoutubeResolutionRolloutReview(review) {
  exactKeys(review, [
    "schema", "contract", "originalReadinessSha256", "proofDigests", "artifactPaths",
    "databaseBefore", "expectedFunctionEvidence",
  ], "review wrapper");
  requireValue(review.schema === "homecook.prelaunch-youtube-resolution-rollout-review.v1", "review wrapper schema mismatch");
  assertResolutionReview(review.contract);
  requireValue(review.contract.from === LIVE_WEB_SHA && REF.test(review.contract.to), "reviewed source pair mismatch");
  requireValue(isDeepStrictEqual(sorted(review.contract.protectedSources), sorted(Object.keys(review.contract.files))),
    "protectedSources must equal the complete reviewed source diff");
  requireValue(SHA.test(review.originalReadinessSha256 ?? ""), "original readiness hash missing");
  requireValue(review.proofDigests && Object.values(review.proofDigests).length > 0
    && isDeepStrictEqual(Object.keys(review.proofDigests).sort(), R2_PROOF_NAMES)
    && Object.values(review.proofDigests).every((digest) => SHA.test(digest)), "R2 proof hashes missing");
  exactKeys(review.artifactPaths, ["manifest", "descriptor", "expectedSchema"], "artifact paths");
  requireValue(Object.values(review.artifactPaths).every((path) => isAbsolute(path)), "artifact paths must be absolute");
  exactKeys(review.databaseBefore, ["target", "ledgerCount", "catalogFingerprint", "aiAutomaticEnabled", "credential"], "database predecessor");
  requireValue(review.databaseBefore.ledgerCount === 213
    && review.databaseBefore.catalogFingerprint === LIVE_CATALOG_FINGERPRINT
    && review.databaseBefore.aiAutomaticEnabled === false
    && review.databaseBefore.target && typeof review.databaseBefore.target === "object",
  "database predecessor mismatch");
  exactKeys(review.databaseBefore.credential, [
    "generation", "releaseSha", "schemaIdentity", "allowedSnapshotDigest", "expiresAt",
  ], "database predecessor credential");
  requireValue(review.databaseBefore.credential.generation === 45
    && review.databaseBefore.credential.releaseSha === "370483030665cb25548c40865544c3b6f4f49cbc"
    && review.databaseBefore.credential.schemaIdentity === review.contract.credential.schemaIdentity
    && review.databaseBefore.credential.allowedSnapshotDigest === review.contract.policy.snapshotDigest
    && Number.isFinite(Date.parse(review.databaseBefore.credential.expiresAt)),
  "database predecessor credential mismatch");
  requireValue(Array.isArray(review.expectedFunctionEvidence) && review.expectedFunctionEvidence.length === 8
    && isDeepStrictEqual(review.expectedFunctionEvidence.map((row) => row.signature).sort(), [...YOUTUBE_RESOLUTION_FUNCTION_SIGNATURES].sort())
    && review.expectedFunctionEvidence.every((row) => typeof row.signature === "string" && SHA.test(row.definitionSha256 ?? "")),
  "function evidence missing");
  return review;
}

function assertIsolatedRestoreEvidence(evidence, review) {
  requireValue(evidence?.status === "PASS" && evidence.backup_format === "homecook-full-local-platform-v5"
    && evidence.source?.ledger_count === 213 && evidence.source.catalog_fingerprint === review.contract.catalog.before
    && evidence.target?.ledger_count === 215 && evidence.target.catalog_fingerprint === review.contract.catalog.after
    && evidence.rerun?.ledger_count === 215 && evidence.rerun.catalog_fingerprint === review.contract.catalog.after
    && evidence.source.synonym_count === 4146 && evidence.target.synonym_count === 4147
    && evidence.rerun.synonym_count === 4147 && evidence.synonym_insert_delta === 1,
  "isolated restore transition evidence mismatch");
  for (const state of [evidence.source, evidence.target, evidence.rerun]) {
    requireValue(isDeepStrictEqual(Object.keys(state.protected_relation_sha256 ?? {}).sort(), PROTECTED_RELATIONS)
      && Object.values(state.protected_relation_sha256).every((value) => SHA.test(value)),
    "isolated restore protected relation digest set incomplete");
  }
  requireValue(isDeepStrictEqual(evidence.target.protected_relation_sha256, evidence.source.protected_relation_sha256)
    && isDeepStrictEqual(evidence.rerun.protected_relation_sha256, evidence.source.protected_relation_sha256),
  "isolated restore protected data changed");
  requireValue(isDeepStrictEqual(evidence.migrations.map((row) => ({
    filename: row.path.replace("supabase/migrations/", ""), sha256: row.sha256,
  })), review.contract.migrations), "isolated restore migration bytes changed");
  requireValue(evidence.cleanup_verified === true
    && isDeepStrictEqual(evidence.production_access, { reads: 0, writes: 0, drops: 0, resets: 0 }),
  "isolated restore cleanup/production isolation failed");
}

function assertDbApplyReceipt(receipt, review) {
  requireValue(receipt?.schema === "homecook.youtube-resolution-db-apply-receipt.v1"
    && receipt.status === "applied-verified" && receipt.releaseSha === review.contract.to
    && receipt.before?.ledgerCount === 213 && receipt.before.catalogFingerprint === review.contract.catalog.before
    && receipt.after?.ledgerCount === 215 && receipt.after.catalogFingerprint === review.contract.catalog.after
    && isDeepStrictEqual(receipt.migrations, review.contract.migrations)
    && receipt.aiAutomaticBefore === false && receipt.aiAutomaticAfter === false,
  "DB apply receipt identity/state mismatch");
  requireValue(isDeepStrictEqual(Object.keys(receipt.preservationBefore ?? {}).sort(), PROTECTED_RELATIONS)
    && Object.values(receipt.preservationBefore).every((value) => SHA.test(value))
    && isDeepStrictEqual(receipt.preservationBefore, receipt.preservationAfter)
    && isDeepStrictEqual(receipt.functionEvidence, review.expectedFunctionEvidence),
  "DB apply receipt preservation/function evidence mismatch");
}

export function assertReadonlyArtifactFile(path) {
  requireValue(isAbsolute(path) && resolve(path) === path, "artifact path is not canonical");
  const file = lstatSync(path);
  requireValue(file.isFile() && !file.isSymbolicLink() && file.nlink === 1
    && file.uid === process.getuid() && (file.mode & 0o777) === 0o444,
  "immutable artifact ownership/mode changed");
  for (let parent = dirname(path); ; parent = dirname(parent)) {
    const stat = lstatSync(parent);
    requireValue(stat.isDirectory() && !stat.isSymbolicLink(), "artifact parent is not a real directory");
    if (parent === dirname(parent)) break;
  }
}

async function verifyPinnedArtifacts(review) {
  const { manifest, descriptor, expectedSchema } = review.artifactPaths;
  assertReadonlyArtifactFile(manifest);
  assertReadonlyArtifactFile(expectedSchema);
  await privatePath(descriptor);
  requireValue((statSync(manifest).mode & 0o777) === 0o444
    && (statSync(descriptor).mode & 0o777) === 0o600
    && (statSync(expectedSchema).mode & 0o777) === 0o444, "artifact file modes changed");
  const manifestBytes = readFileSync(manifest);
  const descriptorBytes = readFileSync(descriptor);
  const schemaBytes = readFileSync(expectedSchema);
  requireValue(hash(manifestBytes) === review.contract.artifact.fileSha256
    && hash(descriptorBytes) === review.contract.artifact.descriptorFileSha256
    && hash(schemaBytes) === review.contract.artifact.expectedSchemaSha256,
  "artifact/descriptor/schema file bytes changed");
  const artifact = JSON.parse(manifestBytes);
  const app = JSON.parse(descriptorBytes);
  const schema = JSON.parse(schemaBytes);
  requireValue(artifact.release_sha === review.contract.to
    && artifact.artifact_sha256 === review.contract.artifact.identitySha256
    && artifact.expected_schema_sha256 === review.contract.artifact.expectedSchemaSha256
    && app.release_sha === review.contract.to && app.artifact_sha256 === artifact.artifact_sha256
    && app.expected_schema_sha256 === artifact.expected_schema_sha256
    && schema.catalog_fingerprint === review.contract.catalog.after,
  "artifact/descriptor/schema identities differ");
  const prefix = "lib/server/youtube-i031-runtime/bundle/";
  const declaredRuntime = Object.fromEntries(artifact.files
    .filter((row) => row.path.startsWith(prefix) && row.path !== `${prefix}manifest.json`)
    .map((row) => [row.path.slice(prefix.length), row.sha256]));
  assertRuntimeUnchanged(review.contract, declaredRuntime);
  for (const [relative, expected] of Object.entries(review.contract.runtimeFiles)) {
    const path = join(dirname(manifest), prefix, relative);
    requireValue(hash(readFileSync(path)) === expected, `materialized runtime bytes changed: ${relative}`);
  }
}

export async function loadYoutubeResolutionReview({ requireWorkerInstall = true } = {}) {
  assertYoutubeResolutionReviewPin(YOUTUBE_RESOLUTION_REVIEW_PIN);
  await privatePath(YOUTUBE_RESOLUTION_REVIEW_PIN.path);
  const bytes = readFileSync(YOUTUBE_RESOLUTION_REVIEW_PIN.path);
  requireValue(hash(bytes) === YOUTUBE_RESOLUTION_REVIEW_PIN.sha256, "review manifest bytes changed");
  const review = assertYoutubeResolutionRolloutReview(JSON.parse(bytes));
  for (const [name, proof] of Object.entries(review.contract.proofs)) {
    if (name === "workerArtifact") assertReadonlyArtifactFile(proof.path);
    else await privatePath(proof.path);
    requireValue(hash(readFileSync(proof.path)) === proof.sha256, "pinned proof bytes changed");
  }
  for (const [name, digest] of Object.entries(review.proofDigests)) {
    const proof = review.contract.proofs[name];
    if (proof) requireValue(proof.sha256 === digest, "proof digest map differs from contract");
  }
  const isolated = JSON.parse(readFileSync(review.contract.proofs.isolatedRestore.path));
  assertIsolatedRestoreEvidence(isolated, review);
  const closure = JSON.parse(readFileSync(review.contract.proofs.enqueueClosure.path));
  assertEnqueueClosureEvidence(review.contract, closure);
  const receipt = JSON.parse(readFileSync(review.contract.proofs.dbApplyReceipt.path));
  assertDbApplyReceipt(receipt, review);
  await verifyPinnedArtifacts(review);
  if (requireWorkerInstall) {
    assertYoutubeResolutionWebActivationPin(YOUTUBE_RESOLUTION_WEB_ACTIVATION_PIN);
    await privatePath(YOUTUBE_RESOLUTION_WEB_ACTIVATION_PIN.path);
    const activationBytes = readFileSync(YOUTUBE_RESOLUTION_WEB_ACTIVATION_PIN.path);
    requireValue(hash(activationBytes) === YOUTUBE_RESOLUTION_WEB_ACTIVATION_PIN.sha256,
      "post-install activation manifest bytes changed");
    const activation = JSON.parse(activationBytes);
    exactKeys(activation, ["schema", "rolloutReview", "workerInstallResult"], "post-install activation manifest");
    requireValue(activation.schema === "homecook.prelaunch-youtube-resolution-web-activation.v1"
      && activation.rolloutReview.path === YOUTUBE_RESOLUTION_REVIEW_PIN.path
      && activation.rolloutReview.sha256 === YOUTUBE_RESOLUTION_REVIEW_PIN.sha256,
    "post-install activation review binding mismatch");
    await privatePath(activation.workerInstallResult.path);
    const resultBytes = readFileSync(activation.workerInstallResult.path);
    requireValue(hash(resultBytes) === activation.workerInstallResult.sha256, "worker install result bytes changed");
    assertYoutubeResolutionWorkerInstallResult(JSON.parse(resultBytes), review);
  }
  return review;
}

function gitAt(root) {
  return (args) => execFileSync("git", ["-C", root, ...args], { maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
}

function committedRuntimeFiles(git, ref) {
  const manifest = JSON.parse(git(["show", `${ref}:lib/server/youtube-i031-runtime/bundle/manifest.json`]));
  const observed = {};
  for (const [relative, declared] of Object.entries(manifest.files ?? {})) {
    const bytes = git(["show", `${ref}:lib/server/youtube-i031-runtime/bundle/${relative}`]);
    const actual = hash(bytes);
    requireValue(actual === declared, `runtime manifest does not match committed bytes: ${relative}`);
    observed[relative] = actual;
  }
  return observed;
}

function committedMigrationLedger(git, ref) {
  const names = git(["ls-tree", "--name-only", `${ref}:supabase/migrations`]).toString().trim().split("\n")
    .filter((name) => /^\d{14}_.+\.sql$/u.test(name)).sort();
  return names.map((filename) => ({ filename, sha256: hash(git(["show", `${ref}:supabase/migrations/${filename}`])) }));
}

export async function collectYoutubeResolutionDatabase(adapter) {
  const target = resolutionDatabaseTarget(await adapter.inspect());
  const [ledger, readiness, policy, credential, queue, permit, ai, functions] = await Promise.all([
    adapter.query(YOUTUBE_RESOLUTION_LEDGER_SQL).then(JSON.parse),
    adapter.query(`SELECT set_config('request.jwt.claims','{"role":"youtube_extraction_worker"}',true); SELECT public.read_youtube_extraction_enqueue_readiness();`).then((value) => JSON.parse(value.split("\n").filter(Boolean).at(-1))),
    adapter.query("SELECT jsonb_build_object('enabled',enabled,'policyVersion',policy_version,'pipelineIdentity',pipeline_identity) FROM private.youtube_extraction_current_policy WHERE policy_key='primary';").then(JSON.parse),
    adapter.query("SELECT jsonb_build_object('generation',current_generation,'releaseSha',release_sha,'schemaIdentity',schema_identity,'allowedSnapshotDigest',allowed_snapshot_digest,'expiresAt',expires_at) FROM private.youtube_extraction_worker_credentials WHERE credential_name='primary';").then(JSON.parse),
    adapter.query("SELECT jsonb_build_object('queued',count(*) filter(where status='queued'),'processing',count(*) filter(where status='processing')) FROM public.youtube_extraction_jobs;").then(JSON.parse),
    adapter.query("SELECT EXISTS(SELECT 1 FROM public.youtube_extractor_permits WHERE permit_key='primary' AND owner_id IS NOT NULL);").then((value) => value === "t"),
    adapter.query("SELECT jsonb_build_object('enabled',coalesce(bool_or(enabled),false),'count',count(*)) FROM private.ingredient_ai_nutrition_settings;").then(JSON.parse),
    adapter.query(YOUTUBE_RESOLUTION_FUNCTION_EVIDENCE_SQL).then(JSON.parse),
  ]);
  return { target, ledger, readiness, policy, credential, queue, permitHeld: permit, ai, functions };
}

export async function verifyYoutubeResolutionAppliedDatabase({ repositoryRoot, configPath, releaseSha }) {
  const review = await loadYoutubeResolutionReview();
  requireValue(releaseSha === review.contract.to, "unreviewed release SHA");
  const git = gitAt(repositoryRoot);
  const source = committedMigrationLedger(git, releaseSha);
  requireValue(source.length === 215, "candidate migration closure is not 215");
  const newRows = source.slice(213);
  requireValue(isDeepStrictEqual(newRows.map((row) => row.filename), MIGRATIONS)
    && isDeepStrictEqual(newRows, review.contract.migrations), "candidate migration bytes changed");
  assertRuntimeUnchanged(review.contract, committedRuntimeFiles(git, releaseSha));

  const adapter = await createRecordingDockerAdapter({ configPath, backupDirectory: dirname(review.contract.proofs.dbBefore.path) });
  const observed = await collectYoutubeResolutionDatabase(adapter);
  requireValue(isDeepStrictEqual(observed.target, review.databaseBefore.target), "database target drift");
  requireValue(isDeepStrictEqual(observed.ledger, source), "live ledger differs from candidate 215 source");
  assertDatabaseTransition(review.contract, {
    ledgerCount: review.databaseBefore.ledgerCount,
    catalogFingerprint: review.databaseBefore.catalogFingerprint,
    aiAutomaticEnabled: review.databaseBefore.aiAutomaticEnabled,
  }, {
    ledgerCount: observed.ledger.length,
    catalogFingerprint: observed.readiness.catalog_fingerprint,
    aiAutomaticEnabled: observed.ai.enabled,
    migrationFiles: newRows.map((row) => row.filename),
  });
  requireValue(observed.readiness.ready === true
    && observed.readiness.catalog_fingerprint === TARGET_CATALOG_FINGERPRINT, "enqueue readiness/catalog mismatch");
  requireValue(observed.policy.enabled === true && observed.policy.policyVersion === 3
    && observed.policy.pipelineIdentity === LIVE_PIPELINE_IDENTITY
    && observed.readiness.policy_snapshot_digest === LIVE_POLICY_SNAPSHOT_DIGEST, "policy/pipeline/snapshot changed");
  requireValue(observed.credential.generation === review.contract.credential.afterGeneration
    && observed.credential.releaseSha === review.contract.to
    && observed.credential.schemaIdentity === review.contract.credential.schemaIdentity
    && observed.credential.allowedSnapshotDigest === review.contract.policy.snapshotDigest
    && Date.parse(observed.credential.expiresAt) > Date.now() + 30 * 60 * 1000
    && Date.parse(observed.credential.expiresAt) <= Date.parse(review.databaseBefore.credential.expiresAt),
  "live DB credential metadata differs from reviewed non-extension transition");
  requireValue(observed.queue.queued === 0 && observed.queue.processing === 0 && observed.permitHeld === false,
    "queue/permit not drained");
  requireValue(isDeepStrictEqual(observed.functions, review.expectedFunctionEvidence), "function body/authority poststate drift");
  return { baselineRequired: false, pending: [], applied: source, source, migrationSourceRef: releaseSha };
}

export function assertOriginalReadinessBytes(bytes, readiness, expectedSha256) {
  requireValue(hash(bytes) === expectedSha256
    && isDeepStrictEqual(JSON.parse(bytes.toString("utf8")), readiness),
  "original R2 readiness changed");
}

export async function reviewedYoutubeResolutionReadiness({
  readiness, previous, next, liveSha, releaseSha, files, databasePlan,
  databaseDeployment, repositoryRoot,
}) {
  const review = await loadYoutubeResolutionReview();
  const originalPath = previous.EnvironmentVariables?.MUMEOK_ROUND2_READINESS_PATH;
  requireValue(typeof originalPath === "string", "original R2 readiness path missing");
  await privatePath(originalPath);
  assertOriginalReadinessBytes(readFileSync(originalPath), readiness, review.originalReadinessSha256);
  requireValue(liveSha === review.contract.from && releaseSha === review.contract.to, "unreviewed source pair");
  requireValue(databaseDeployment === false && databasePlan?.baselineRequired === false
    && databasePlan.pending?.length === 0 && databasePlan.applied?.length === 215
    && databasePlan.migrationSourceRef === releaseSha, "verified separately applied 215 DB required");
  const git = gitAt(repositoryRoot);
  requireValue(git(["status", "--porcelain", "--untracked-files=no"]).length === 0, "candidate tracked files changed");
  git(["merge-base", "--is-ancestor", liveSha, releaseSha]);
  const actualFiles = git(["diff", "--name-only", "--no-renames", "-z", liveSha, releaseSha]).toString().split("\0").filter(Boolean);
  const digests = Object.fromEntries(actualFiles.map((path) => [path, [liveSha, releaseSha].map((ref) =>
    git(["ls-tree", ref, "--", path]).length ? hash(git(["show", `${ref}:${path}`])) : null)]));
  assertSourceEvidence(review.contract, { from: liveSha, to: releaseSha, files: digests });
  requireValue(isDeepStrictEqual(sorted(files), sorted(actualFiles)), "deploy selection differs from reviewed complete diff");
  assertRuntimeUnchanged(review.contract, committedRuntimeFiles(git, releaseSha));

  const expectedEnvironment = {
    HOMECOOK_YOUTUBE_EXTRACTION_APP_DESCRIPTOR_PATH: review.artifactPaths.descriptor,
    HOMECOOK_YOUTUBE_EXTRACTION_EXPECTED_SCHEMA_PATH: review.artifactPaths.expectedSchema,
    HOMECOOK_YOUTUBE_EXTRACTION_WORKER_MANIFEST_PATH: review.artifactPaths.manifest,
  };
  for (const [key, value] of Object.entries(expectedEnvironment)) {
    requireValue(next.EnvironmentVariables?.[key] === value, `${key} is not the reviewed path`);
  }
  const environment = { ...next.EnvironmentVariables };
  for (const key of ["MUMEOK_ROUND2_RELEASE_SHA", "MUMEOK_ROUND2_REPOSITORY_ROOT", "MUMEOK_ROUND2_READINESS_PATH"]) {
    environment[key] = previous.EnvironmentVariables[key];
  }
  const inherited = inheritRound2Readiness({
    readiness, previous, next: { ...next, EnvironmentVariables: environment }, liveSha, releaseSha,
    files: files.filter((path) => !review.contract.protectedSources.includes(path)), databaseDeployment: false,
  });
  const actualProofs = {
    ...(readiness.proofs ?? {}),
    ...Object.fromEntries(Object.entries(readiness.proxy ?? {}).filter(([, value]) => value && typeof value === "object")),
  };
  requireValue(isDeepStrictEqual(Object.keys(actualProofs).sort(), R2_PROOF_NAMES), "original R2 proof set changed");
  for (const [name, proof] of Object.entries(actualProofs)) {
    await privatePath(proof.path);
    requireValue(proof.sha256 === review.proofDigests[name]
      && hash(readFileSync(proof.path)) === proof.sha256, `original R2 proof changed: ${name}`);
  }
  return {
    readiness: inherited,
    review: {
      schema: "homecook.prelaunch-youtube-resolution-source-review.v1",
      observedAt: new Date().toISOString(),
      liveSha,
      releaseSha,
      sourceFiles: review.contract.files,
      runtimeFiles: review.contract.runtimeFiles,
      catalogFingerprint: TARGET_CATALOG_FINGERPRINT,
      databaseWrites: false,
      providerReverified: false,
    },
  };
}
