/** Exact reviewed nutrition recovery; no database or worker mutations. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { DeploymentError, inheritRound2Readiness } from "./prelaunch-web-deploy.mjs";
import { createRecordingDockerAdapter, privatePath } from "./marketing-round2-controlled-deploy.mjs";
import { BETA_ALIASES_UNROUTED_SQL } from "./prelaunch-beta-readiness.mjs";
import { captureAiNutritionDatabaseAfter, assertAiNutritionApplicationTree } from "./prelaunch-ai-nutrition-readiness.mjs";
import {
  INGREDIENT_SEARCH_SCOPE_SQL, INGREDIENT_SEARCH_ANONYMOUS_SQL, INGREDIENT_SEARCH_WORKER_SQL,
  ingredientSearchFunctionEvidence, assertIngredientSearchWorkerPrivileges,
} from "./prelaunch-ingredient-search-readiness.mjs";
import { PIECE_UNIT_FUNCTIONS_SQL, PIECE_UNIT_HELPERS, PIECE_UNIT_CONSUMERS, pieceUnitFunctionEvidence } from "./prelaunch-piece-unit-readiness.mjs";

// Filled only after reviewing immutable private evidence. CLI/env cannot override.
export const NUTRITION_RECOVERY_REVIEW_PIN = Object.freeze({"path":"/Users/cwj/.homecook/operations/ingredient-nutrition-recovery-20261010-7LsiyI/nutrition-recovery-web-review.json","sha256":"875323d4e173f46ecc5d852eb6c1c3b1292764a0d6d2cd2761de2b67e2fe808a"});
export const NUTRITION_RECOVERY_FROM = "c51d53871f31c7840fe24792b46b191ca963b11b";
export const NUTRITION_RECOVERY_CATALOG = "81362d758b5138a95b6cbe1d8d7c1f064653b467907a42a7335c00d97dc59ba9";
export const NUTRITION_RECOVERY_MIGRATIONS = Object.freeze(["20261010120000_ingredient_exclusion_recovery_selection.sql"]);
const SHA = /^[a-f0-9]{64}$/u;
const REF = /^[a-f0-9]{40}$/u;
const PROOFS = ["db_authority", "db_migration", "operator_approval", "privacy_consent", "retention_runbook", "turnstile_live", "direct_access_denial", "header_overwrite", "launch_binding"].sort();
const APPLICATION_PATHS = ["app", "components", "lib", "stores", "types", "hooks", "public", "instrumentation.ts", ".env.example", "scripts/lib/recipe-nutrition-predecessor.mjs"];
const WORKER_ENV = ["HOMECOOK_YOUTUBE_EXTRACTION_APP_DESCRIPTOR_PATH", "HOMECOOK_YOUTUBE_EXTRACTION_EXPECTED_SCHEMA_PATH", "HOMECOOK_YOUTUBE_EXTRACTION_WORKER_MANIFEST_PATH"];
const check = (value, message) => { if (!value) throw new DeploymentError(`Reviewed nutrition recovery: ${message}`); };
const hash = value => createHash("sha256").update(value).digest("hex");
const sorted = values => [...values].sort();
const pin = value => isAbsolute(value?.path ?? "") && SHA.test(value?.sha256 ?? "");
const gitAt = root => args => execFileSync("git", ["-C", root, ...args], { maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });

export const NUTRITION_RECOVERY_SELECTION_SQL = `SELECT jsonb_build_object('signature','public.is_selectable_catalog_ingredient(uuid)',
  'definitionSha256',encode(extensions.digest(convert_to(pg_get_functiondef(p.oid),'UTF8'),'sha256'),'hex'),
  'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'config',p.proconfig,'securityDefiner',p.prosecdef,'volatility',p.provolatile,'parallel',p.proparallel)
  FROM pg_proc p WHERE p.oid='public.is_selectable_catalog_ingredient(uuid)'::regprocedure;`;
export const NUTRITION_RECOVERY_YOUTUBE_SQL = `SELECT set_config('request.jwt.claims','{"role":"youtube_extraction_worker"}',true);
SELECT jsonb_build_object('readiness',public.read_youtube_extraction_enqueue_readiness(),
  'policy',(SELECT to_jsonb(t) FROM private.youtube_extraction_current_policy t WHERE policy_key='primary'),
  'credential',(SELECT jsonb_build_object('generation',current_generation,'releaseSha',release_sha,'schemaIdentity',schema_identity,'allowedSnapshotDigest',allowed_snapshot_digest,'expiresAt',expires_at,
    'rowSha256',encode(extensions.digest(convert_to(to_jsonb(t)::text,'UTF8'),'sha256'),'hex')) FROM private.youtube_extraction_worker_credentials t WHERE credential_name='primary'),
  'aiSettingsSha256',(SELECT encode(extensions.digest(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8'),'sha256'),'hex') FROM private.ingredient_ai_nutrition_settings t));`;

export function assertNutritionRecoverySelection(before, after, expected) {
  check(isDeepStrictEqual(after, expected) && SHA.test(after?.definitionSha256 ?? ""), "selection postimage differs");
  const { definitionSha256: oldHash, ...oldAuthority } = before;
  const { definitionSha256: newHash, ...newAuthority } = after;
  check(SHA.test(oldHash ?? "") && oldHash !== newHash && isDeepStrictEqual(oldAuthority, newAuthority), "selection authority changed or body not replaced");
  check(after.signature === 'public.is_selectable_catalog_ingredient(uuid)' && after.owner === 'supabase_admin'
    && after.securityDefiner === false && after.volatility === 'i' && after.parallel === 's'
    && isDeepStrictEqual(after.config, ['search_path=pg_catalog, pg_temp'])
    && isDeepStrictEqual(sorted(after.acl ?? []), ['postgres=X/supabase_admin','supabase_admin=X/supabase_admin','youtube_extraction_worker_rpc_owner=X/supabase_admin']), "selection authority contract changed");
}
export function assertNutritionRecoveryYoutube(youtube, before = youtube) {
  check(isDeepStrictEqual(youtube, before), "YouTube policy, credential, catalog or AI settings changed");
  check(youtube?.readiness?.ready === true && youtube.readiness.catalog_fingerprint === NUTRITION_RECOVERY_CATALOG
    && youtube.policy?.enabled === true && youtube.credential?.releaseSha === NUTRITION_RECOVERY_FROM
    && youtube.readiness.release_sha === NUTRITION_RECOVERY_FROM && SHA.test(youtube.credential.rowSha256 ?? '')
    && Date.parse(youtube.credential.expiresAt) > Date.now() + 30 * 60 * 1000
    && SHA.test(youtube.aiSettingsSha256 ?? ''), "current worker must remain ready with its unchanged credential");
}
export async function captureNutritionRecoveryDatabase(adapter) {
  const common = await captureAiNutritionDatabaseAfter(adapter); // inspect before queries, validates R2 and AI disabled
  const query = async sql => JSON.parse(await adapter.query(sql));
  const proof = { ...common, schema: 'homecook.prelaunch-nutrition-recovery-db-before.v1',
    scopeFunctions: ingredientSearchFunctionEvidence(await query(INGREDIENT_SEARCH_SCOPE_SQL)),
    anonymousFunctions: ingredientSearchFunctionEvidence(await query(INGREDIENT_SEARCH_ANONYMOUS_SQL)),
    workerPrivileges: await query(INGREDIENT_SEARCH_WORKER_SQL),
    pieceFunctions: pieceUnitFunctionEvidence(await query(PIECE_UNIT_FUNCTIONS_SQL)),
    selectionFunction: await query(NUTRITION_RECOVERY_SELECTION_SQL),
    youtube: JSON.parse((await adapter.query(NUTRITION_RECOVERY_YOUTUBE_SQL)).split('\n').filter(Boolean).at(-1)),
  };
  assertNutritionRecoveryYoutube(proof.youtube);
  assertIngredientSearchWorkerPrivileges(proof.workerPrivileges, proof.workerPrivileges);
  check(isDeepStrictEqual(sorted(proof.pieceFunctions.map(row => row.signature)), sorted([...PIECE_UNIT_HELPERS,...PIECE_UNIT_CONSUMERS])), 'piece helper/consumer closure changed');
  return proof;
}
export async function captureNutritionRecoveryDatabaseBefore(adapter) {
  const proof = await captureNutritionRecoveryDatabase(adapter);
  check(proof.ledger.length === 215, 'pre-apply 215 ledger required');
  return proof;
}
export function assertNutritionRecoveryReview(review) {
  check(review?.schema === 'homecook.prelaunch-nutrition-recovery-review.v1'
    && review.from === NUTRITION_RECOVERY_FROM && REF.test(review.to ?? '') && review.to !== review.from
    && REF.test(review.migrationSourceRef ?? ''), 'invalid manifest or source pair');
  check(review.previousMigrationCount === 215 && review.migrationCount === 216
    && Array.isArray(review.migrations) && review.migrations.length === 1
    && review.migrations[0].filename === NUTRITION_RECOVERY_MIGRATIONS[0]
    && SHA.test(review.migrations[0].sha256 ?? ''), 'exact 215-to-216 migration required');
  check(SHA.test(review.originalReadinessSha256 ?? '') && isDeepStrictEqual(sorted(Object.keys(review.proofDigests ?? {})), PROOFS)
    && Object.values(review.proofDigests).every(value => SHA.test(value)), 'original R2 proofs required');
  check(review.files && typeof review.files === 'object' && !Array.isArray(review.files) && Object.keys(review.files).length > 0, 'complete source pins required');
  for (const [path, pair] of Object.entries(review.files)) {
    check(!path.startsWith('/') && !path.split('/').includes('..') && Array.isArray(pair) && pair.length === 2
      && pair.every(value => value === null || SHA.test(value)) && pair.some(value => value !== null), 'invalid source pin');
    check(!path.startsWith('infra/') && !path.startsWith('lib/server/youtube-i031-runtime/')
      && !path.startsWith('scripts/manifests/youtube-extraction-') && path !== 'scripts/lib/youtube-extraction-worker-artifact.mjs', 'worker/runtime source changes are outside recovery');
    if (path.startsWith('supabase/')) check(path === `supabase/migrations/${review.migrations[0].filename}`
      && pair[0] === null && pair[1] === review.migrations[0].sha256, 'only exact new migration allowed');
  }
  check(Array.isArray(review.protectedSources) && new Set(review.protectedSources).size === review.protectedSources.length
    && review.protectedSources.every(path => Object.hasOwn(review.files,path)), 'invalid protected source list');
  for (const key of ['preApplyProof','preservationProof','databaseReceipt']) check(pin(review[key]), `${key} must be pinned`);
  check(SHA.test(review.expectedSelectionFunction?.definitionSha256 ?? '') && SHA.test(review.previousDatabaseStateSha256 ?? ''), 'selection postimage and original DB floor required');
  check(pin(review.workerPlist) && /^gui\/\d+\/[a-zA-Z0-9_.-]+$/u.test(review.workerService ?? ''), 'worker plist/service pin required');
  check(Array.isArray(review.workerArtifacts) && review.workerArtifacts.length >= 3 && review.workerArtifacts.every(pin)
    && new Set(review.workerArtifacts.map(value => value.path)).size === review.workerArtifacts.length, 'worker artifact pins required');
  check(isDeepStrictEqual(sorted(Object.keys(review.workerEnvironment ?? {})), sorted(WORKER_ENV))
    && Object.values(review.workerEnvironment).every(path => isAbsolute(path) && review.workerArtifacts.some(value => value.path === path)), 'worker environment pins required');
  return review;
}
export function assertNutritionRecoveryReviewPin(value) { check(pin(value), 'review pin is not configured; execution prohibited'); }
async function readPinned(value, label, installed = false) {
  check(pin(value), `${label} pin invalid`);
  if (installed) {
    // Installed artifacts are immutable 0444/0555, while LaunchAgents is 0755.
    // These existing permissions must not be changed to fit private proof rules.
    for (let path = value.path; ; path = dirname(path)) {
      const entry = lstatSync(path);
      check(!entry.isSymbolicLink(), 'installed worker path contains a link');
      if (path === dirname(path)) break;
    }
    const entry = lstatSync(value.path);
    check(entry.isFile() && entry.nlink === 1 && entry.uid === process.getuid() && (entry.mode & 0o022) === 0,
      'installed worker file ownership or writable permissions changed');
  } else await privatePath(value.path);
  const bytes = readFileSync(value.path);
  check(hash(bytes) === value.sha256, `${label} bytes changed`);
  return bytes;
}
export async function loadNutritionRecoveryReview() {
  assertNutritionRecoveryReviewPin(NUTRITION_RECOVERY_REVIEW_PIN);
  return assertNutritionRecoveryReview(JSON.parse(await readPinned(NUTRITION_RECOVERY_REVIEW_PIN, 'review manifest')));
}
export function assertNutritionRecoveryMigrationTransition(before, source, migrations) {
  check(Array.isArray(before) && before.length === 215 && Array.isArray(source) && source.length === 216
    && new Set(before.map(row => row.filename)).size === 215 && new Set(source.map(row => row.filename)).size === 216
    && [...before,...source].every(row => /^\d{14}_[^/]+\.sql$/u.test(row.filename) && SHA.test(row.sha256 ?? '')), 'invalid migration ledger');
  check(isDeepStrictEqual(source.filter(row => before.some(prior => prior.filename === row.filename)), before)
    && isDeepStrictEqual(source.filter(row => !before.some(prior => prior.filename === row.filename)), migrations)
    && isDeepStrictEqual(migrations.map(row => row.filename), [...NUTRITION_RECOVERY_MIGRATIONS]), 'migration predecessor or addition changed');
}
export function assertNutritionRecoveryPreservation(proof, review) {
  check(proof?.schema === 'homecook.nutrition-recovery-preservation.v1' && proof.verified === true
    && proof.migrationSourceRef === review.migrationSourceRef && isDeepStrictEqual(proof.migration, review.migrations[0])
    && ['originalNutrition','historicalRecords'].every(key => SHA.test(proof.before?.[key] ?? '') && proof.before[key] === proof.after?.[key])
    && Array.isArray(proof.operations) && proof.operations.length > 0
    && proof.operations.every(operation => SHA.test(operation.planSha256 ?? '') && SHA.test(operation.sqlSha256 ?? '')
      && operation.postimageVerified === true && operation.unreviewedChanges === 0), 'preservation proof or reviewed data scope invalid');
}
async function verifyOperationProofs(review) {
  const proof = JSON.parse(await readPinned(review.preservationProof, 'preservation proof'));
  assertNutritionRecoveryPreservation(proof, review);
  const receipt = JSON.parse(await readPinned(review.databaseReceipt, 'DB216 receipt'));
  check(receipt.schema === 'homecook.nutrition-recovery-db-receipt.v1' && receipt.status === 'committed'
    && receipt.migrationSourceRef === review.migrationSourceRef && receipt.previousMigrationCount === 215
    && receipt.migrationCount === 216 && isDeepStrictEqual(receipt.migrations, review.migrations)
    && receipt.catalogFingerprint === NUTRITION_RECOVERY_CATALOG
    && receipt.preservationProofSha256 === review.preservationProof.sha256, 'DB216 receipt differs');
}
export function assertNutritionRecoveryAuthority(before, observed, review) {
  check(before.schema === 'homecook.prelaunch-nutrition-recovery-db-before.v1' && before.ledger?.length === 215, 'pre-apply proof invalid');
  for (const key of ['target','receiptSha256','immutableScope','marketingPostimage','rowsSha256','scopeFunctions','anonymousFunctions','workerPrivileges','pieceFunctions']) {
    check(before[key] !== undefined && isDeepStrictEqual(observed[key],before[key]), `${key} changed`);
  }
  assertIngredientSearchWorkerPrivileges(observed.workerPrivileges,before.workerPrivileges);
  assertNutritionRecoverySelection(before.selectionFunction,observed.selectionFunction,review.expectedSelectionFunction);
  assertNutritionRecoveryYoutube(observed.youtube,before.youtube);
}
export async function verifyNutritionRecoveryWorker(review, previous, next, launch = args => execFileSync('/bin/launchctl',args,{encoding:'utf8',stdio:['ignore','pipe','ignore']})) {
  await readPinned(review.workerPlist, 'worker plist', true);
  for (const artifact of review.workerArtifacts) await readPinned(artifact, 'worker artifact', true);
  for (const [key,path] of Object.entries(review.workerEnvironment)) check(previous.EnvironmentVariables?.[key] === path
    && next.EnvironmentVariables?.[key] === path, 'worker environment binding changed');
  const status = launch(['print',review.workerService]);
  check(status.includes(review.workerPlist.path), 'loaded worker plist path changed');
  check(/^\s*state = running\s*$/mu.test(status) && /^\s*pid = [1-9][0-9]*\s*$/mu.test(status), 'installed worker is not running');
}
async function readBefore(review) {
  const before = JSON.parse(await readPinned(review.preApplyProof, 'pre-apply proof'));
  check(before.schema === 'homecook.prelaunch-nutrition-recovery-db-before.v1' && before.ledger?.length === 215
    && ['receiptSha256','immutableScope','marketingPostimage','rowsSha256'].every(key => SHA.test(before[key] ?? '')), 'pre-apply proof malformed');
  return before;
}
export async function verifyNutritionRecoveryAppliedDatabase({repositoryRoot,configPath,releaseSha}) {
  const review = await loadNutritionRecoveryReview();
  check(releaseSha === review.to, 'unreviewed DB candidate');
  const before = await readBefore(review);
  await verifyOperationProofs(review);
  const git = gitAt(repositoryRoot);
  const names = git(['ls-tree','--name-only',`${review.migrationSourceRef}:supabase/migrations`]).toString().trim().split('\n').filter(name => /^\d{14}_.+\.sql$/u.test(name)).sort();
  const source = names.map(filename => ({filename,sha256:hash(git(['show',`${review.migrationSourceRef}:supabase/migrations/${filename}`]))}));
  assertNutritionRecoveryMigrationTransition(before.ledger,source,review.migrations);
  const adapter = await createRecordingDockerAdapter({configPath,backupDirectory:dirname(review.preApplyProof.path)});
  const observed = await captureNutritionRecoveryDatabase(adapter);
  check(isDeepStrictEqual(observed.ledger,source), 'actual DB ledger differs');
  assertNutritionRecoveryAuthority(before,observed,review);
  return {baselineRequired:false,pending:[],applied:source,source,migrationSourceRef:review.migrationSourceRef,aiRuntimeGate:'disabled'};
}
export async function reviewedNutritionRecoveryReadiness({readiness,previous,next,liveSha,releaseSha,files,databasePlan,databaseDeployment,repositoryRoot,configPath}) {
  const review = await loadNutritionRecoveryReview();
  check(hash(JSON.stringify(readiness)) === review.originalReadinessSha256, 'original readiness changed');
  check(liveSha === review.from && releaseSha === review.to && databaseDeployment === false
    && databasePlan?.baselineRequired === false && databasePlan.pending?.length === 0 && databasePlan.applied?.length === 216
    && databasePlan.migrationSourceRef === review.migrationSourceRef, 'verified source pair and separately applied DB required');
  const git = gitAt(repositoryRoot);
  check(git(['status','--porcelain','--untracked-files=no']).length === 0, 'candidate tracked files changed');
  git(['merge-base','--is-ancestor',liveSha,releaseSha]);
  const actualFiles = git(['diff','--name-only','--no-renames','-z',liveSha,releaseSha]).toString().split('\0').filter(Boolean);
  const digests = Object.fromEntries(actualFiles.map(path => [path,[liveSha,releaseSha].map(ref => git(['ls-tree',ref,'--',path]).length ? hash(git(['show',`${ref}:${path}`])) : null)]));
  check(isDeepStrictEqual(sorted(files),sorted(actualFiles)) && isDeepStrictEqual(digests,review.files), 'complete source bytes differ');
  const appTree = ref => git(['ls-tree','-r','--full-tree','-z',ref,'--',...APPLICATION_PATHS]);
  assertAiNutritionApplicationTree(appTree(releaseSha),appTree(review.migrationSourceRef));
  await verifyNutritionRecoveryWorker(review,previous,next);
  const environment = {...next.EnvironmentVariables};
  for (const [key,value] of Object.entries({MUMEOK_ROUND2_RELEASE_SHA:releaseSha,MUMEOK_ROUND2_REPOSITORY_ROOT:next.WorkingDirectory,MUMEOK_ROUND2_READINESS_PATH:join(dirname(next.WorkingDirectory),'round2-readiness.json')})) {
    check(environment[key] === previous.EnvironmentVariables[key] || environment[key] === value, 'unexpected readiness binding');
    environment[key] = previous.EnvironmentVariables[key];
  }
  const inherited = inheritRound2Readiness({readiness,previous,next:{...next,EnvironmentVariables:environment},liveSha,releaseSha,
    files:files.filter(path => !review.protectedSources.includes(path)),databaseDeployment:false});
  const proofs = {...readiness.proofs,...Object.fromEntries(Object.entries(readiness.proxy ?? {}).filter(([,value]) => value && typeof value === 'object'))};
  check(isDeepStrictEqual(sorted(Object.keys(proofs)),PROOFS), 'original R2 proof set changed');
  for (const [key,value] of Object.entries(proofs)) {
    check(value.sha256 === review.proofDigests[key], 'original R2 proof pin changed');
    await readPinned(value,`R2 ${key}`);
  }
  const authority = JSON.parse(readFileSync(readiness.proofs.db_authority.path,'utf8'));
  const before = await readBefore(review);
  const adapter = await createRecordingDockerAdapter({configPath,backupDirectory:dirname(review.preApplyProof.path)});
  const observed = await captureNutritionRecoveryDatabase(adapter);
  assertNutritionRecoveryAuthority(before,observed,review);
  check(isDeepStrictEqual(observed.target,authority.target) && observed.immutableScope === authority.immutableScopeHash
    && isDeepStrictEqual(observed.ledger,databasePlan.applied), 'authority target or ledger changed');
  await verifyOperationProofs(review);
  check(await adapter.query(BETA_ALIASES_UNROUTED_SQL) === 't', 'historical aliases became routed');
  return {readiness:inherited,review:{schema:'homecook.prelaunch-nutrition-recovery-source-review.v1',observedAt:new Date().toISOString(),liveSha,releaseSha,
    originalVerifiedAt:readiness.verified_at,proofDigests:review.proofDigests,sources:review.files,reviewManifestSha256:NUTRITION_RECOVERY_REVIEW_PIN.sha256,
    migrationCount:216,databaseReceiptSha256:review.databaseReceipt.sha256,preservationProofSha256:review.preservationProof.sha256,
    catalogFingerprint:NUTRITION_RECOVERY_CATALOG,workerChanged:false,aiRuntimeGate:'disabled',databaseWrites:false,providerReverified:false}};
}

/** Preserve the existing DB215 worker compatibility floor and its receipt.
 * The new receipt describes only the compatible DB216 extension. */
export function nutritionRecoveryDatabaseState(previous, plan, review) {
  check(hash(JSON.stringify(previous)) === review.previousDatabaseStateSha256
    && previous?.releaseSha === NUTRITION_RECOVERY_FROM && previous.ledgerCount === 215
    && previous.catalogFingerprint === NUTRITION_RECOVERY_CATALOG && previous.backwardCompatible === false, 'original worker DB floor changed');
  check(plan?.applied?.length === 216 && plan.pending?.length === 0 && plan.migrationSourceRef === review.migrationSourceRef, 'verified DB216 required');
  return {...previous, compatibleExtension:{schema:'homecook.nutrition-recovery-db-extension.v1',
    releaseSha:review.to,ledgerCount:216,backwardCompatibleWith:NUTRITION_RECOVERY_FROM,
    migrations:review.migrations,receipt:review.databaseReceipt,preservationProof:review.preservationProof,
    originalFloorSha256:review.previousDatabaseStateSha256}};
}
