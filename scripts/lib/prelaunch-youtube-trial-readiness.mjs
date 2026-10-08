/** Exact, one-release readiness for the reviewed YouTube manual trial. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { DeploymentError, inheritRound2Readiness } from "./prelaunch-web-deploy.mjs";
import { createRecordingDockerAdapter, privatePath, IMMUTABLE_SCOPE_SQL, LEDGER_VALID_SQL } from "./marketing-round2-controlled-deploy.mjs";
import { BETA_CANONICAL_POSTIMAGE_SQL } from "./prelaunch-beta-readiness.mjs";
import { AI_NUTRITION_LEDGER_SQL } from "./prelaunch-ai-nutrition-readiness.mjs";
import { evaluateYoutubeExtractionWorkerPreflight, loadYoutubeExtractionWorkerRuntimeInputs, parseLaunchctlPrintStatus } from "./youtube-extraction-worker-ops.mjs";
import { buildYoutubeExtractionWorkerPolicySnapshotDigest, YOUTUBE_EXTRACTION_WORKER_LABEL } from "./youtube-extraction-worker-artifact.mjs";

export const YOUTUBE_TRIAL_LIVE_SHA = "7b672ef55370137367f4b77848feeb1416c9a2ea";
export const YOUTUBE_TRIAL_MIGRATION = Object.freeze({
  filename: "20261008180000_youtube_saved_recipe_results.sql",
  sha256: "d338ce2db5139085d301e7e0f1ba55c8836c498d0a7a9cf18035d7add19509e2",
});
export const YOUTUBE_TRIAL_MIGRATION_FILENAMES = Object.freeze([
  YOUTUBE_TRIAL_MIGRATION.filename,
  "20261009001000_youtube_trial_quantity_bridge.sql",
  "20261009002000_youtube_trial_catalog_attestation.sql",
]);
export const YOUTUBE_TRIAL_MIGRATIONS = Object.freeze([
  YOUTUBE_TRIAL_MIGRATION,
  { filename: YOUTUBE_TRIAL_MIGRATION_FILENAMES[1], sha256: "9606515640551a0b934b5502269383bf5ce0954872343affaf81434f23205de2" },
  { filename: YOUTUBE_TRIAL_MIGRATION_FILENAMES[2], sha256: "cf789077ff27cfbabb51a27687f5882ee19bdafc7fc74c3a653870714f68703f" },
]);
export const YOUTUBE_TRIAL_EXPECTED_SCHEMA_SHA256 = "042da2771108678abf24ddd7c04a9f5981777fb2e0f652c42a1bd6e839cd6b83";
export const YOUTUBE_TRIAL_SCOPE_ALIAS = "verify_internal_scope_before_saved_results_20261008";
export const YOUTUBE_TRIAL_WEB_SUPPORT_FILES = Object.freeze([
  "scripts/lib/youtube-extraction-worker-artifact.mjs",
  "scripts/manifests/youtube-extraction-expected-schema.json",
]);
export const YOUTUBE_TRIAL_SOURCE_BACKFILL_MIGRATIONS = Object.freeze([
  "20260922030000_recipe_snapshot_activation_repairs.sql", "20260922040000_food_catalog_search_candidates.sql",
  "20260926100000_full_local_account_quarantine_resolution.sql", "20260927010000_recipe_view_count_local_scope.sql",
  "20260927120000_recipe_future_save_repairs.sql", "20260927120100_recipe_fork_image_preservation.sql",
  "20260927120200_personal_recipe_unit_choices.sql", "20260927120300_shopping_deleted_private_recipe_pin.sql",
  "20260927120400_manual_public_recipe_runtime.sql", "20260927120500_manual_recipe_publication.sql",
  "20260927120501_manual_recipe_publication_scope.sql", "20260927120600_manual_public_owner_edit_context.sql",
  "20260927120650_cooking_session_resume.sql", "20260927120651_cooking_deleted_owner_plan_pin.sql",
  "20260927120700_cooked_batch_estimated_weight.sql", "20260928010000_meal_log_recent_available_batches.sql",
  "20260928020000_action_notifications.sql", "20261006120000_meal_log_nutrition_preview.sql",
  "20261006130000_future_meal_create_idempotency.sql", "20261007143000_ingredient_catalog_organization.sql",
  "20261007160000_ingredient_catalog_definitions.sql", "20261007210000_ingredient_source_name_capacity.sql",
]);
// Filled only in a separate operations commit after the web candidate, DB proof,
// and controlled worker rollout proof are all frozen. No CLI/env override exists.
export const YOUTUBE_TRIAL_REVIEW_PIN = Object.freeze({ path: "/Users/cwj/.homecook/operations/youtube-trial-20261009-m_t4r_cs/web-readiness-review.json", sha256: "73ba5b0c9d2af81d3a60b3498ac339022d0e209f9b524c755fa3d5d9f4166ee1" });
export const AI_NUTRITION_SETTINGS_SQL = "SELECT jsonb_build_object('count',count(*),'enabled',CASE WHEN count(*)=1 THEN bool_and(enabled) ELSE NULL END,'sha256',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex')) FROM private.ingredient_ai_nutrition_settings t;";
export const YOUTUBE_TRIAL_SCOPE_SQL = `SELECT json_agg(json_build_object('name',p.proname,'source',p.prosrc,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'securityDefiner',p.prosecdef,'config',p.proconfig) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND (p.proname LIKE 'verify_full_local_internal_scope%' OR p.proname LIKE 'verify_scope_pre_%' OR p.proname='${YOUTUBE_TRIAL_SCOPE_ALIAS}');`;
export const YOUTUBE_TRIAL_POLICY_SQL = "SELECT jsonb_build_object('enabled',p.enabled,'policy_version',p.policy_version,'extractor_mode',p.extractor_mode,'pipeline_identity',p.pipeline_identity,'result_affecting_options',p.result_affecting_options) FROM private.youtube_extraction_current_policy p WHERE p.policy_key='primary';";

const SHA = /^[a-f0-9]{64}$/u; const REF = /^[a-f0-9]{40}$/u;
const PROOFS = ["db_authority", "db_migration", "operator_approval", "privacy_consent", "retention_runbook", "turnstile_live"];
const PROXY_PROOFS = ["direct_access_denial", "header_overwrite", "launch_binding"];
const APPLICATION_PATHS = ["app", "components", "lib", "stores", "types", "hooks", "public", "instrumentation.ts", ".env.example"];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sorted = (values) => [...values].sort();
const requireValue = (value, message) => { if (!value) throw new DeploymentError(`Reviewed YouTube trial readiness: ${message}`); };

export function deriveYoutubeTrialPolicySnapshot(policy) {
  return { ...policy, policy_snapshot_digest: buildYoutubeExtractionWorkerPolicySnapshotDigest({
    extractorMode: policy.extractor_mode, pipelineIdentity: policy.pipeline_identity,
    policyVersion: policy.policy_version, resultAffectingOptions: policy.result_affecting_options }) };
}

export function youtubeTrialScopeEvidence(rows) {
  requireValue(Array.isArray(rows) && rows.length > 0, "scope evidence missing");
  return rows.map((row) => {
    requireValue(typeof row.name === "string"
      && (/^(?:verify_full_local_internal_scope[a-z0-9_]*|verify_scope_pre_[a-z0-9_]+)$/u.test(row.name)
        || row.name === YOUTUBE_TRIAL_SCOPE_ALIAS)
      && typeof row.source === "string", "invalid scope function");
    return { name: row.name, bodySha256: hash(row.source), owner: row.owner, acl: row.acl,
      securityDefiner: row.securityDefiner, config: row.config };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export function assertYoutubeTrialReviewPin(pin) {
  requireValue(isAbsolute(pin?.path ?? "") && SHA.test(pin?.sha256 ?? ""), "review pins are not configured; execution prohibited");
}

export function assertYoutubeTrialReview(review, { requireWorkerRolloutProof = true } = {}) {
  requireValue(review?.schema === "homecook.prelaunch-youtube-trial-review.v1", "invalid review manifest");
  requireValue(review.from === YOUTUBE_TRIAL_LIVE_SHA && REF.test(review.to ?? "") && review.to !== review.from
    && REF.test(review.migrationSourceRef ?? "") && REF.test(review.applicationSourceRef ?? ""), "unreviewed source pair");
  requireValue(review.previousMigrationCount === 207 && review.migrationCount === 210
    && Array.isArray(review.migrations) && review.migrations.length === 3
    && isDeepStrictEqual(review.migrations.map((row) => row.filename), [...YOUTUBE_TRIAL_MIGRATION_FILENAMES])
    && isDeepStrictEqual(review.migrations, [...YOUTUBE_TRIAL_MIGRATIONS]), "exact reviewed 207-to-210 ledger required");
  requireValue(review.files && typeof review.files === "object" && !Array.isArray(review.files)
    && Object.keys(review.files).length > 0, "complete source pins missing");
  for (const [file, pair] of Object.entries(review.files)) {
    requireValue(!file.startsWith("/") && !file.split("/").includes("..") && Array.isArray(pair) && pair.length === 2
      && pair.every((value) => value === null || SHA.test(value)) && pair.some(Boolean), "invalid source pin");
    const reviewedSupport = YOUTUBE_TRIAL_WEB_SUPPORT_FILES.includes(file);
    requireValue(!file.startsWith("infra/")
      && (reviewedSupport || !/^scripts\/.*(?:worker|runtime|install)/u.test(file)),
    "worker operations must remain outside the web candidate");
    if (file.startsWith("supabase/")) {
      const migration = [...review.migrations, ...(review.sourceBackfillMigrations ?? [])]
        .find((row) => file === `supabase/migrations/${row.filename}`);
      requireValue(migration && pair[0] === null && pair[1] === migration.sha256, "only exact reviewed trial SQL is allowed");
    }
  }
  requireValue(review.migrations.every((migration) => isDeepStrictEqual(
    review.files[`supabase/migrations/${migration.filename}`], [null, migration.sha256])),
  "both reviewed trial migrations must be present in the source closure");
  requireValue(Array.isArray(review.sourceBackfillMigrations) && review.sourceBackfillMigrations.length === 22
    && isDeepStrictEqual(review.sourceBackfillMigrations.map((row) => row.filename), [...YOUTUBE_TRIAL_SOURCE_BACKFILL_MIGRATIONS])
    && review.sourceBackfillMigrations.every((row) => SHA.test(row.sha256 ?? "")
      && isDeepStrictEqual(review.files[`supabase/migrations/${row.filename}`], [null, row.sha256])),
  "exact reviewed historical source backfill required");
  requireValue(Array.isArray(review.protectedSources) && new Set(review.protectedSources).size === review.protectedSources.length
    && review.protectedSources.every((file) => Object.hasOwn(review.files, file)), "invalid protected source review");
  requireValue(SHA.test(review.originalReadinessSha256 ?? "")
    && isDeepStrictEqual(sorted(Object.keys(review.proofDigests ?? {})), sorted([...PROOFS, ...PROXY_PROOFS]))
    && Object.values(review.proofDigests).every((value) => SHA.test(value)), "R2 proof pins required");
  requireValue(isAbsolute(review.preApplyProof?.path ?? "") && SHA.test(review.preApplyProof?.sha256 ?? ""), "pinned pre-apply proof required");
  if (requireWorkerRolloutProof) requireValue(isAbsolute(review.workerRolloutProof?.path ?? "")
    && SHA.test(review.workerRolloutProof?.sha256 ?? ""), "pinned controlled worker rollout proof required");
  requireValue(SHA.test(review.applicationTreeSha256 ?? "") && SHA.test(review.runtimeBundleTreeSha256 ?? "")
    && SHA.test(review.workerDescriptorSha256 ?? "") && SHA.test(review.installedWorkerArtifactSha256 ?? "")
    && SHA.test(review.queuePolicySha256 ?? ""),
  "reviewed app/worker identity pins required");
  requireValue(typeof review.expectedNutritionSetting === "boolean" && SHA.test(review.expectedNutritionSettingsSha256 ?? ""),
    "pinned nutrition setting proof required");
  requireValue(Array.isArray(review.expectedScopeFunctions) && review.expectedScopeFunctions.length > 0
    && new Set(review.expectedScopeFunctions.map((row) => row.name)).size === review.expectedScopeFunctions.length
    && review.expectedScopeFunctions.every((row) => SHA.test(row.bodySha256 ?? "") && row.owner === "postgres"
      && row.securityDefiner === true && isDeepStrictEqual(row.config, ["search_path=pg_catalog, public, private, pg_temp"])),
  "reviewed scope chain required");
  requireValue(isDeepStrictEqual(review.newScopeAliases, [YOUTUBE_TRIAL_SCOPE_ALIAS])
    && review.expectedScopeFunctions.some((row) => row.name === YOUTUBE_TRIAL_SCOPE_ALIAS), "exactly one known reviewed scope alias required");
  requireValue(review.expectedSchemaSha256 === YOUTUBE_TRIAL_EXPECTED_SCHEMA_SHA256, "expected schema pin mismatch");
  requireValue(review.currentWorkerPaths
    && isDeepStrictEqual(Object.keys(review.currentWorkerPaths).sort(), ["appDescriptorPath", "credentialPath", "currentPolicyPath",
      "expectedSchemaPath", "queueStatePath", "secretRoot", "workerArtifactPath"].sort())
    && Object.values(review.currentWorkerPaths).every((value) => isAbsolute(value)),
    "fixed current worker paths required");
  requireValue(Number.isInteger(review.credentialGeneration) && review.credentialGeneration >= 1
    && Number.isInteger(review.queuePolicyVersion) && review.queuePolicyVersion >= 1
    && SHA.test(review.pipelineIdentity ?? "") && SHA.test(review.queuePolicySnapshotDigest ?? ""),
  "worker policy and credential identity required");
  return review;
}

export async function loadYoutubeTrialReview() {
  assertYoutubeTrialReviewPin(YOUTUBE_TRIAL_REVIEW_PIN);
  await privatePath(YOUTUBE_TRIAL_REVIEW_PIN.path);
  const bytes = readFileSync(YOUTUBE_TRIAL_REVIEW_PIN.path);
  requireValue(hash(bytes) === YOUTUBE_TRIAL_REVIEW_PIN.sha256, "review manifest bytes changed");
  return assertYoutubeTrialReview(JSON.parse(bytes));
}

export function assertYoutubeTrialSource({ review, liveSha, releaseSha, files, actualFiles, digests }) {
  assertYoutubeTrialReview(review);
  requireValue(liveSha === review.from && releaseSha === review.to, "unreviewed source pair");
  requireValue(isDeepStrictEqual(sorted(files), sorted(actualFiles))
    && isDeepStrictEqual(sorted(files), sorted(Object.keys(review.files))), "complete source diff differs from review");
  requireValue(isDeepStrictEqual(digests, review.files), "reviewed source bytes changed");
}

export function assertYoutubeTrialMigrationTransition(before, source, migrations) {
  requireValue(Array.isArray(before) && before.length === 207 && Array.isArray(source) && source.length === 210
    && new Set(source.map((row) => row.filename)).size === 210
    && [...before, ...source].every((row) => /^\d{14}_[^/]+\.sql$/u.test(row.filename) && SHA.test(row.sha256 ?? "")),
  "invalid reviewed migration ledger");
  requireValue(isDeepStrictEqual(source.slice(0, 207), before)
    && isDeepStrictEqual(source.slice(207), migrations)
    && isDeepStrictEqual(migrations.map((row) => row.filename), [...YOUTUBE_TRIAL_MIGRATION_FILENAMES]),
  "ledger predecessor or reviewed trial SQL changed");
}

export function assertYoutubeTrialSourceBackfill(review, beforeLedger, sourceRows) {
  const before = new Map(beforeLedger.map((row) => [row.filename, row.sha256]));
  requireValue(review.sourceBackfillMigrations.every((row) => before.get(row.filename) === row.sha256),
    "source backfill differs from pinned 207 ledger");
  requireValue(isDeepStrictEqual(sourceRows, review.sourceBackfillMigrations),
    "source backfill differs from frozen migration source");
  return true;
}

export async function verifyYoutubeTrialSourceBackfill({ review, repositoryRoot }) {
  const proof = await readPinnedPrivateJson(review.preApplyProof, "pre-apply proof");
  requireValue(Array.isArray(proof.ledger) && proof.ledger.length === 207, "invalid pinned 207 ledger");
  const git = gitAt(repositoryRoot);
  const sourceRows = review.sourceBackfillMigrations.map((row) => ({ filename: row.filename,
    sha256: hash(git(["show", `${review.migrationSourceRef}:supabase/migrations/${row.filename}`])) }));
  return assertYoutubeTrialSourceBackfill(review, proof.ledger, sourceRows);
}

export function assertYoutubeTrialScopePreserved(before, after, expected, newAlias) {
  requireValue(isDeepStrictEqual(after, [...expected].sort((a, b) => a.name.localeCompare(b.name))), "scope chain differs from reviewed postimage");
  requireValue(after.length === before.length + 1
    && isDeepStrictEqual(after.filter((row) => !before.some((prior) => prior.name === row.name)).map((row) => row.name), [newAlias]),
  "only one reviewed scope alias may be added");
  for (const original of before) {
    const delegated = original.name === "verify_full_local_internal_scope";
    const preserved = after.find((row) => row.name === (delegated ? newAlias : original.name));
    requireValue(preserved && isDeepStrictEqual(delegated ? { ...preserved, name: original.name } : preserved, original),
      "existing scope authority changed");
  }
}

export function assertYoutubeTrialNutritionSettings(review, before, after) {
  requireValue(before?.count === 1 && after?.count === 1
    && before.enabled === review.expectedNutritionSetting && after.enabled === review.expectedNutritionSetting
    && before.sha256 === review.expectedNutritionSettingsSha256
    && after.sha256 === review.expectedNutritionSettingsSha256, "AI nutrition settings changed");
}

export function assertCurrentYoutubeTrialWorker(review, { inputs, preflight, launchd, descriptorSha256, policySha256,
  expectedSchemaSha256, now = Date.now() }) {
  const { appDescriptor, workerArtifact, currentPolicy, credentialState } = inputs;
  requireValue(preflight?.ready === true && launchd?.loaded === true && launchd.state === "running"
    && launchd.label === YOUTUBE_EXTRACTION_WORKER_LABEL, "current worker is not loaded and healthy");
  requireValue(workerArtifact.artifact_sha256 === review.installedWorkerArtifactSha256
    && descriptorSha256 === review.workerDescriptorSha256
    && policySha256 === review.queuePolicySha256
    && expectedSchemaSha256 === review.expectedSchemaSha256, "current worker file identity drift");
  requireValue(appDescriptor.release_sha === review.to && workerArtifact.release_sha === review.to
    && credentialState.release_sha === review.to, "current worker release drift");
  requireValue(currentPolicy.pipeline_identity === workerArtifact.pipeline_identity
    && currentPolicy.pipeline_identity === review.pipelineIdentity, "current worker pipeline identity drift");
  requireValue(currentPolicy.policy_version === review.queuePolicyVersion && currentPolicy.enabled === true,
    "current worker queue policy drift");
  requireValue(currentPolicy.policy_snapshot_digest === review.queuePolicySnapshotDigest,
    "current worker queue policy drift");
  requireValue(credentialState.generation === review.credentialGeneration
    && credentialState.schema_identity === workerArtifact.schema_identity
    && credentialState.allowed_snapshot_digest === workerArtifact.allowed_snapshot_digest
    && Date.parse(credentialState.expires_at) > now + (30 * 60 * 1000), "current restricted credential metadata drift");
  return { releaseSha: workerArtifact.release_sha, artifactSha256: workerArtifact.artifact_sha256,
    descriptorSha256, policySha256, expectedSchemaSha256, credentialGeneration: credentialState.generation,
    credentialExpiresAt: credentialState.expires_at, launchd: { label: launchd.label, state: launchd.state, loaded: launchd.loaded } };
}

export function attestCurrentYoutubeTrialWorker(review, { now = Date.now() } = {}) {
  const paths = review.currentWorkerPaths;
  const inputs = loadYoutubeExtractionWorkerRuntimeInputs({ ...paths, queueStatePath: paths.queueStatePath ?? null,
    secretRoot: paths.secretRoot, expectedSchemaPath: paths.expectedSchemaPath });
  const preflight = evaluateYoutubeExtractionWorkerPreflight({ ...inputs, requirePolicyEnabled: true });
  const serviceTarget = `gui/${process.getuid()}/${YOUTUBE_EXTRACTION_WORKER_LABEL}`;
  const launch = execFileSync("/bin/launchctl", ["print", serviceTarget], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const launchd = parseLaunchctlPrintStatus({ serviceTarget, status: 0, stdout: launch, label: YOUTUBE_EXTRACTION_WORKER_LABEL });
  return assertCurrentYoutubeTrialWorker(review, { inputs, preflight, launchd,
    descriptorSha256: hash(readFileSync(paths.appDescriptorPath)), policySha256: hash(readFileSync(paths.currentPolicyPath)),
    expectedSchemaSha256: hash(readFileSync(paths.expectedSchemaPath)), now });
}

async function readPinnedPrivateJson(pin, label) {
  await privatePath(pin.path); const bytes = readFileSync(pin.path);
  requireValue(hash(bytes) === pin.sha256, `${label} changed`); return JSON.parse(bytes);
}

function gitAt(repositoryRoot) {
  return (args) => execFileSync("git", ["-C", repositoryRoot, ...args], { maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
}

export async function verifyYoutubeTrialAppliedDatabase({ repositoryRoot, configPath, releaseSha }) {
  const review = await loadYoutubeTrialReview(); requireValue(releaseSha === review.to, "unreviewed database candidate");
  const before = await readPinnedPrivateJson(review.preApplyProof, "pre-apply proof");
  requireValue(before.schema === "homecook.prelaunch-youtube-trial-db-before.v1" && Array.isArray(before.ledger)
    && before.ledger.length === 207 && SHA.test(before.immutableScope ?? "") && SHA.test(before.marketingPostimage ?? "")
    && SHA.test(before.receiptSha256 ?? "") && SHA.test(before.rowsSha256 ?? "")
    && Array.isArray(before.scopeFunctions) && typeof before.nutritionSetting === "boolean"
    && before.nutritionSettingsSha256 === review.expectedNutritionSettingsSha256, "invalid 207-entry pre-apply proof");
  requireValue(before.nutritionSetting === review.expectedNutritionSetting && before.nutritionSettingsCount === 1,
    "pre-apply nutrition setting differs from reviewed proof");
  const git = gitAt(repositoryRoot);
  const names = git(["ls-tree", "--name-only", `${review.migrationSourceRef}:supabase/migrations`]).toString().trim().split("\n").filter((name) => /^\d{14}_.+\.sql$/u.test(name)).sort();
  const source = names.map((filename) => ({ filename, sha256: hash(git(["show", `${review.migrationSourceRef}:supabase/migrations/${filename}`])) }));
  assertYoutubeTrialMigrationTransition(before.ledger, source, review.migrations);
  const adapter = await createRecordingDockerAdapter({ configPath, backupDirectory: dirname(review.preApplyProof.path) });
  requireValue(isDeepStrictEqual(await adapter.inspect(), before.target), "database target drift");
  requireValue(await adapter.query(LEDGER_VALID_SQL) === "t", "R2 ledger authority drift");
  const applied = JSON.parse(await adapter.query(AI_NUTRITION_LEDGER_SQL));
  requireValue(isDeepStrictEqual(applied, source), "actual 210 ledger differs from reviewed source");
  requireValue(await adapter.query(IMMUTABLE_SCOPE_SQL) === before.immutableScope
    && await adapter.query(BETA_CANONICAL_POSTIMAGE_SQL) === before.marketingPostimage, "immutable R2 authority or marketing postimage changed");
  const nutrition = JSON.parse(await adapter.query(AI_NUTRITION_SETTINGS_SQL));
  assertYoutubeTrialNutritionSettings(review,
    { count: before.nutritionSettingsCount, enabled: before.nutritionSetting, sha256: before.nutritionSettingsSha256 }, nutrition);
  const scopes = youtubeTrialScopeEvidence(JSON.parse(await adapter.query(YOUTUBE_TRIAL_SCOPE_SQL)));
  assertYoutubeTrialScopePreserved(before.scopeFunctions, scopes, review.expectedScopeFunctions, review.newScopeAliases[0]);
  const livePolicy = deriveYoutubeTrialPolicySnapshot(JSON.parse(await adapter.query(YOUTUBE_TRIAL_POLICY_SQL)));
  requireValue(livePolicy.enabled === true && livePolicy.policy_version === review.queuePolicyVersion
    && livePolicy.pipeline_identity === review.pipelineIdentity
    && livePolicy.policy_snapshot_digest === review.queuePolicySnapshotDigest, "live DB queue policy drift");
  return { baselineRequired: false, pending: [], applied, source, migrationSourceRef: review.migrationSourceRef,
    aiNutritionSetting: review.expectedNutritionSetting, aiNutritionSettingsSha256: review.expectedNutritionSettingsSha256,
    youtubeTrialDatabaseVerified: true, youtubeTrialPolicy: livePolicy };
}

export async function reviewedYoutubeTrialReadiness({ readiness, previous, next, liveSha, releaseSha, files,
  databasePlan, databaseDeployment, repositoryRoot }) {
  const review = await loadYoutubeTrialReview();
  requireValue(hash(JSON.stringify(readiness)) === review.originalReadinessSha256, "original readiness changed");
  requireValue(databaseDeployment === false && databasePlan?.baselineRequired === false && databasePlan.pending?.length === 0
    && databasePlan.applied?.length === 210 && databasePlan.aiNutritionSetting === review.expectedNutritionSetting
    && databasePlan.aiNutritionSettingsSha256 === review.expectedNutritionSettingsSha256
    && databasePlan.youtubeTrialDatabaseVerified === true, "verified separately applied 210 database required");
  const git = gitAt(repositoryRoot); git(["merge-base", "--is-ancestor", liveSha, releaseSha]);
  requireValue(git(["status", "--porcelain", "--untracked-files=no"]).length === 0, "candidate tracked files changed");
  const actualFiles = git(["diff", "--name-only", "--no-renames", "-z", liveSha, releaseSha]).toString().split("\0").filter(Boolean);
  const digests = Object.fromEntries(Object.keys(review.files).map((file) => [file, [liveSha, releaseSha].map((ref) =>
    git(["ls-tree", ref, "--", file]).length ? hash(git(["show", `${ref}:${file}`])) : null)]));
  assertYoutubeTrialSource({ review, liveSha, releaseSha, files, actualFiles, digests });
  const appTree = git(["ls-tree", "-r", "--full-tree", "-z", releaseSha, "--", ...APPLICATION_PATHS]);
  const sourceAppTree = git(["ls-tree", "-r", "--full-tree", "-z", review.applicationSourceRef, "--", ...APPLICATION_PATHS]);
  requireValue(appTree.equals(sourceAppTree) && hash(appTree) === review.applicationTreeSha256,
    "candidate application tree differs from reviewed integrated source");
  const worker = await readPinnedPrivateJson(review.workerRolloutProof, "worker rollout proof");
  requireValue(worker.schema === "homecook.youtube-trial-worker-rollout-proof.v1" && worker.status === "installed-verified"
    && worker.releaseSha === releaseSha && worker.runtimeBundleTreeSha256 === review.runtimeBundleTreeSha256
    && worker.descriptorSha256 === review.workerDescriptorSha256
    && worker.installedArtifactSha256 === review.installedWorkerArtifactSha256
    && worker.queuePolicySha256 === review.queuePolicySha256
    && worker.queuePolicyVerified === true, "controlled worker rollout proof does not match web candidate");
  const currentWorker = attestCurrentYoutubeTrialWorker(review);
  requireValue(isDeepStrictEqual(sorted(Object.keys(readiness.proofs ?? {})), PROOFS), "original proof set changed");
  const proxyProofs = Object.entries(readiness.proxy ?? {}).filter(([, value]) => value && typeof value === "object");
  requireValue(isDeepStrictEqual(sorted(proxyProofs.map(([key]) => key)), PROXY_PROOFS), "original proxy proof set changed");
  const inherited = inheritRound2Readiness({ readiness, previous, next, liveSha, releaseSha,
    files: files.filter((file) => !review.protectedSources.includes(file)), databaseDeployment: false });
  return { readiness: inherited, review, currentWorker };
}
