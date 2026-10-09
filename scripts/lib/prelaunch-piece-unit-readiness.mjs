/** One reviewed piece unit rollout. Unconfigured pins deliberately prohibit execution. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { DeploymentError, inheritRound2Readiness } from "./prelaunch-web-deploy.mjs";
import { createRecordingDockerAdapter, privatePath } from "./marketing-round2-controlled-deploy.mjs";
import { BETA_ALIASES_UNROUTED_SQL } from "./prelaunch-beta-readiness.mjs";

import {
  AI_NUTRITION_LEDGER_SQL as PIECE_UNIT_LEDGER_SQL,
  AI_NUTRITION_ROWS_SQL as PIECE_UNIT_ROWS_SQL,
  captureAiNutritionDatabaseAfter,
  assertAiNutritionDisabled,
  assertAiNutritionApplicationTree,
} from "./prelaunch-ai-nutrition-readiness.mjs";
export { PIECE_UNIT_LEDGER_SQL, PIECE_UNIT_ROWS_SQL };

// Filled only after the operator reviews the exact source pair and immutable
// private manifest. Neither CLI flags nor environment variables override it.
export const PIECE_UNIT_REVIEW_PIN = Object.freeze({"path":"/Users/cwj/.homecook/operations/ingredient-piece-rollout-20261009-uh9k7l/piece-readiness-review.json","sha256":"388b20340269e5fe0077571ced4855adcfb515b06bc6433dfaffc3c6efb346f5"});
export const PIECE_UNIT_MIGRATIONS = Object.freeze(["20261009130000_ingredient_piece_unit_evidence.sql"]);
export const PIECE_UNIT_MIGRATION_SHA256 = "cf17e3c267baa14e557063d4b9d1a05ddd31029e0614528ca013fa53281f6904";
const APPLICATION_PATHS = ["app", "components", "lib", "stores", "types", "hooks", "public", "instrumentation.ts", ".env.example", "scripts/lib/recipe-nutrition-predecessor.mjs"];
const SHA = /^[a-f0-9]{64}$/u;
const REF = /^[a-f0-9]{40}$/u;
const PROOFS = ["db_authority", "db_migration", "operator_approval", "privacy_consent", "retention_runbook", "turnstile_live"];
const PROXY_PROOFS = ["direct_access_denial", "header_overwrite", "launch_binding"];
const requireValue = (value, message) => { if (!value) throw new DeploymentError(`Reviewed piece unit readiness: ${message}`); };
const hash = value => createHash("sha256").update(value).digest("hex");
const sorted = values => [...values].sort();

// Reuse the already reviewed authority collectors without loading their old pin.
export {
  INGREDIENT_SEARCH_SCOPE_SQL as PIECE_UNIT_SCOPE_SQL,
  INGREDIENT_SEARCH_ANONYMOUS_SQL as PIECE_UNIT_ANONYMOUS_SQL,
  INGREDIENT_SEARCH_WORKER_SQL as PIECE_UNIT_WORKER_SQL,
} from "./prelaunch-ingredient-search-readiness.mjs";
import {
  INGREDIENT_SEARCH_SCOPE_SQL as PIECE_UNIT_SCOPE_SQL,
  INGREDIENT_SEARCH_ANONYMOUS_SQL as PIECE_UNIT_ANONYMOUS_SQL,
  INGREDIENT_SEARCH_WORKER_SQL as PIECE_UNIT_WORKER_SQL,
  ingredientSearchFunctionEvidence,
  assertIngredientSearchWorkerPrivileges,
} from "./prelaunch-ingredient-search-readiness.mjs";
export const PIECE_UNIT_HELPERS = Object.freeze([
  "private.ingredient_piece_unit_family(text,boolean)",
  "private.ingredient_piece_default_size(text)",
  "private.ingredient_piece_observation_matches(text,text,numeric,text,numeric,numeric)",
  "private.ingredient_piece_candidates(uuid)",
  "private.select_ingredient_piece_candidate(jsonb,text,text)",
]);
export const PIECE_UNIT_CONSUMERS = Object.freeze([
  "private.mutate_meal_log_entry_prelaunch_20260919(uuid,timestamp with time zone,text,integer,timestamp with time zone,text,uuid,uuid,bigint,jsonb,timestamp with time zone)",
  "private.build_recipe_nutrition_input_guard_pre_product_20260922(uuid)",
  "private.build_recipe_draft_nutrition_guard_pre_product_20260922(jsonb)",
  "private.recipe_nutrition_sources_pre_product_20260922(jsonb)",
  "public.preview_meal_log_nutrition(uuid,timestamp with time zone,text,integer,timestamp with time zone,text,uuid,numeric,text)",
  "public.get_ingredient_ai_recipe_refresh_input(uuid,uuid)",
]);
export const PIECE_UNIT_FUNCTIONS_SQL = `SELECT coalesce(jsonb_agg(jsonb_build_object(
  'signature', reviewed.signature, 'source',p.prosrc,'definition',pg_get_functiondef(p.oid),
  'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'securityDefiner',p.prosecdef,'config',p.proconfig,
  'apiExecute',jsonb_build_object('anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_role',has_function_privilege('service_role',p.oid,'EXECUTE'))
) ORDER BY reviewed.signature),'[]'::jsonb) FROM (VALUES ${[...PIECE_UNIT_HELPERS,...PIECE_UNIT_CONSUMERS].map(signature => `('${signature}')`).join(',')}) reviewed(signature) JOIN pg_proc p ON p.oid=to_regprocedure(reviewed.signature);`;
export function pieceUnitFunctionEvidence(rows) {
  requireValue(Array.isArray(rows) && rows.length > 0, "function evidence missing");
  return rows.map(({ source, definition, ...row }) => {
    requireValue([...PIECE_UNIT_HELPERS,...PIECE_UNIT_CONSUMERS].includes(row.signature)
      && typeof source === 'string' && typeof definition === 'string', 'invalid piece function evidence');
    return { ...row, bodySha256: hash(source), definitionSha256: hash(definition) };
  }).sort((a,b) => a.signature.localeCompare(b.signature));
}
function assertPieceFunctions(functions, signatures) {
  requireValue(Array.isArray(functions) && isDeepStrictEqual(sorted(functions.map(row => row.signature)), sorted(signatures))
    && functions.every(row => SHA.test(row.bodySha256 ?? '') && SHA.test(row.definitionSha256 ?? '')
      && row.owner === 'postgres' && Array.isArray(row.acl) && Array.isArray(row.config)
      && typeof row.securityDefiner === 'boolean' && row.apiExecute
      && ['anon','authenticated','service_role'].every(role => typeof row.apiExecute[role] === 'boolean')),
    'exact piece function signatures and postimage required');
  for (const row of functions.filter(row => PIECE_UNIT_HELPERS.includes(row.signature))) {
    requireValue(row.securityDefiner === false && isDeepStrictEqual(row.acl,['postgres=X/postgres'])
      && Object.values(row.apiExecute).every(value => value === false)
      && isDeepStrictEqual(row.config, [row.signature === 'private.ingredient_piece_candidates(uuid)'
        ? 'search_path=pg_catalog, public, pg_temp' : 'search_path=pg_catalog, pg_temp']),
      'private piece helpers must remain owner-only invokers');
  }
}

export function assertPieceUnitReview(review) {
  requireValue(review?.schema === "homecook.prelaunch-piece-unit-review.v1", "invalid review manifest");
  requireValue(REF.test(review.from ?? "") && REF.test(review.to ?? "") && review.from !== review.to
    && REF.test(review.migrationSourceRef ?? ""), "unreviewed source pair");
  requireValue(review.previousMigrationCount === 212 && review.migrationCount === 213, "exact reviewed 212-to-213 ledger required");
  requireValue(Array.isArray(review.migrations) && review.migrations.length === 1
    && isDeepStrictEqual(review.migrations.map(row => row.filename), [...PIECE_UNIT_MIGRATIONS])
    && review.migrations.every(row => row.sha256 === PIECE_UNIT_MIGRATION_SHA256), "exact one migration pins required");
  requireValue(SHA.test(review.originalReadinessSha256 ?? "")
    && isDeepStrictEqual(sorted(Object.keys(review.proofDigests ?? {})), sorted([...PROOFS, ...PROXY_PROOFS]))
    && Object.values(review.proofDigests).every(value => SHA.test(value)), "original readiness/proof pins required");
  requireValue(review.files && typeof review.files === "object" && !Array.isArray(review.files)
    && Object.keys(review.files).length > 0, "complete source pins missing");
  for (const [path, pair] of Object.entries(review.files)) {
    requireValue(!path.startsWith("/") && !path.split("/").includes("..") && Array.isArray(pair)
      && pair.length === 2 && pair.every(value => value === null || SHA.test(value))
      && pair.some(value => value !== null), "invalid source pin");
    requireValue(!path.startsWith("infra/"), "piece unit candidate cannot change infrastructure");
    if (path.startsWith("supabase/")) {
      const pin = review.migrations.find(row => path === `supabase/migrations/${row.filename}`);
      requireValue(pin && pair[0] === null && pair[1] === pin.sha256, "candidate SQL must be one of the exact one already-applied migration");
    }
  }
  requireValue(Array.isArray(review.protectedSources) && new Set(review.protectedSources).size === review.protectedSources.length
    && review.protectedSources.every(path => Object.hasOwn(review.files, path)), "invalid protected source review");
  requireValue(isAbsolute(review.preApplyProof?.path ?? "") && SHA.test(review.preApplyProof?.sha256 ?? ""), "pinned pre-apply proof required");
  requireValue(Array.isArray(review.expectedScopeFunctions) && review.expectedScopeFunctions.length > 0
    && new Set(review.expectedScopeFunctions.map(row => row.name)).size === review.expectedScopeFunctions.length
    && review.expectedScopeFunctions.every(row => SHA.test(row.bodySha256 ?? "") && row.owner === "postgres" && row.securityDefiner === true
      && isDeepStrictEqual(row.config, ["search_path=pg_catalog, public, private, pg_temp"])), "reviewed scope chain required");
  requireValue(Array.isArray(review.expectedAnonymousFunctions) && review.expectedAnonymousFunctions.length >= 2
    && new Set(review.expectedAnonymousFunctions.map(row => row.name)).size === review.expectedAnonymousFunctions.length
    && ["verify_full_local_anonymous_authority", "verify_anonymous_pre_canonical_search_20261009"].every(name => review.expectedAnonymousFunctions.some(row => row.name === name))
    && review.expectedAnonymousFunctions.every(row => SHA.test(row.bodySha256 ?? "") && row.owner === "postgres"
      && row.securityDefiner === true && isDeepStrictEqual(row.config, ["search_path=pg_catalog, public, private, pg_temp"])
      && Array.isArray(row.acl) && row.acl.length === 1 && /^postgres=X\/[a-z0-9_]+$/u.test(row.acl[0])), "reviewed owner-only anonymous chain required");
  requireValue(isAbsolute(review.preservationProof?.path ?? "") && SHA.test(review.preservationProof?.sha256 ?? ""), "pinned nutrition/history preservation proof required");
  assertIngredientSearchWorkerPrivileges(review.expectedWorkerPrivileges, review.expectedWorkerPrivileges);
  assertPieceFunctions(review.expectedPieceFunctions, [...PIECE_UNIT_HELPERS,...PIECE_UNIT_CONSUMERS]);
  return review;
}

export function assertPieceUnitReviewPin(pin) {
  requireValue(isAbsolute(pin?.path ?? "") && SHA.test(pin?.sha256 ?? ""), "review pins are not configured; execution prohibited");
}

export async function loadPieceUnitReview() {
  assertPieceUnitReviewPin(PIECE_UNIT_REVIEW_PIN);
  await privatePath(PIECE_UNIT_REVIEW_PIN.path);
  const bytes = readFileSync(PIECE_UNIT_REVIEW_PIN.path);
  requireValue(hash(bytes) === PIECE_UNIT_REVIEW_PIN.sha256, "review manifest bytes changed");
  return assertPieceUnitReview(JSON.parse(bytes));
}

async function readPreApplyProof(review) {
  await privatePath(review.preApplyProof.path);
  const bytes = readFileSync(review.preApplyProof.path);
  requireValue(hash(bytes) === review.preApplyProof.sha256, "pre-apply proof changed");
  const proof = JSON.parse(bytes);
  requireValue(proof.schema === "homecook.prelaunch-piece-unit-db-before.v1"
    && typeof proof.observedAt === "string" && Number.isFinite(Date.parse(proof.observedAt))
    && Array.isArray(proof.ledger) && proof.ledger.length === 212
    && SHA.test(proof.receiptSha256 ?? "") && SHA.test(proof.immutableScope ?? "")
    && SHA.test(proof.marketingPostimage ?? "") && SHA.test(proof.rowsSha256 ?? "")
    && Array.isArray(proof.scopeFunctions) && Array.isArray(proof.anonymousFunctions)
    && proof.workerPrivileges, "invalid pre-apply proof");
  assertPieceFunctions(proof.pieceFunctions, PIECE_UNIT_CONSUMERS);
  return proof;
}

async function capturePieceUnitDatabaseEvidence(adapter) {
  // Shared collector calls inspect before any query, validates R2 receipt/data,
  // and requires AI disabled. Extend its metadata without loading its old pin.
  const common = await captureAiNutritionDatabaseAfter(adapter);
  const anonymousRows = JSON.parse(await adapter.query(PIECE_UNIT_ANONYMOUS_SQL));
  return { ...common, schema: "homecook.prelaunch-piece-unit-db-before.v1",
    scopeFunctions: ingredientSearchFunctionEvidence(JSON.parse(await adapter.query(PIECE_UNIT_SCOPE_SQL))),
    anonymousFunctions: ingredientSearchFunctionEvidence(anonymousRows),
    pieceFunctions: pieceUnitFunctionEvidence(JSON.parse(await adapter.query(PIECE_UNIT_FUNCTIONS_SQL))),
    workerPrivileges: JSON.parse(await adapter.query(PIECE_UNIT_WORKER_SQL)),
  };
}

export async function capturePieceUnitDatabaseBefore(adapter) {
  const proof = await capturePieceUnitDatabaseEvidence(adapter);
  requireValue(proof.ledger.length === 212, "pre-apply 212-entry state required");
  assertPieceFunctions(proof.pieceFunctions, PIECE_UNIT_CONSUMERS);
  return proof;
}

export function assertPieceUnitAuthorityPreserved(before, after, review) {
  requireValue(isDeepStrictEqual(after.scopeFunctions, before.scopeFunctions)
    && isDeepStrictEqual(after.scopeFunctions, review.expectedScopeFunctions), "internal scope chain changed");
  requireValue(isDeepStrictEqual(after.anonymousFunctions, before.anonymousFunctions)
    && isDeepStrictEqual(after.anonymousFunctions, review.expectedAnonymousFunctions), "anonymous authority chain changed");
  requireValue(isDeepStrictEqual(after.workerPrivileges, before.workerPrivileges), "worker privileges changed");
  assertIngredientSearchWorkerPrivileges(after.workerPrivileges, review.expectedWorkerPrivileges);
  assertPieceFunctions(before.pieceFunctions, PIECE_UNIT_CONSUMERS);
  assertPieceFunctions(after.pieceFunctions, [...PIECE_UNIT_HELPERS,...PIECE_UNIT_CONSUMERS]);
  requireValue(isDeepStrictEqual(after.pieceFunctions, review.expectedPieceFunctions), "piece function postimage changed");
  for (const old of before.pieceFunctions) {
    const current = after.pieceFunctions.find(row => row.signature === old.signature);
    for (const key of ['owner','acl','securityDefiner','config','apiExecute'])
      requireValue(isDeepStrictEqual(old[key], current[key]), "existing consumer authority changed");
  }
}

export function assertPieceUnitPreservation(proof, review) {
  requireValue(proof?.schema === 'homecook.piece-unit-preservation.v1' && proof.verified === true
    && proof.migrationSourceRef === review.migrationSourceRef && isDeepStrictEqual(proof.migration, review.migrations[0])
    && ['officialNutrition','historicalRecords'].every(key => SHA.test(proof.before?.[key] ?? '') && proof.before[key] === proof.after?.[key]),
    "official nutrition or historical records preservation proof invalid");
}

async function verifyPreservationProof(review) {
  await privatePath(review.preservationProof.path);
  const bytes = readFileSync(review.preservationProof.path);
  requireValue(hash(bytes) === review.preservationProof.sha256, 'preservation proof bytes changed');
  assertPieceUnitPreservation(JSON.parse(bytes), review);
}

export function assertPieceUnitMigrationTransition(before, source, migrations) {
  requireValue(Array.isArray(before) && before.length === 212
    && Array.isArray(source) && source.length === 213
    && new Set(source.map(row => row.filename)).size === 213
    && new Set(before.map(row => row.filename)).size === 212
    && [...before, ...source].every(row => /^\d{14}_[^/]+\.sql$/u.test(row.filename) && SHA.test(row.sha256 ?? "")), "invalid reviewed migration ledger");
  requireValue(isDeepStrictEqual(source.filter(row => before.some(prior => prior.filename === row.filename)), before), "migration source changed its reviewed predecessor");
  requireValue(isDeepStrictEqual(source.filter(row => !before.some(prior => prior.filename === row.filename)), migrations)
    && isDeepStrictEqual(migrations.map(row => row.filename), [...PIECE_UNIT_MIGRATIONS]), "new migration bytes differ from reviewed one-file set");
}

function gitAt(repositoryRoot) {
  return args => execFileSync("git", ["-C", repositoryRoot, ...args], { maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
}

export function assertPieceUnitSource({ review, liveSha, releaseSha, files, actualFiles, digests }) {
  assertPieceUnitReview(review);
  requireValue(liveSha === review.from && releaseSha === review.to, "unreviewed source pair");
  requireValue(isDeepStrictEqual(sorted(files), sorted(actualFiles)) && isDeepStrictEqual(sorted(files), sorted(Object.keys(review.files))), "complete source diff differs from review");
  requireValue(isDeepStrictEqual(digests, review.files), "reviewed source bytes changed");
}

export function assertPieceUnitAppliedLedger(source, applied) {
  requireValue(Array.isArray(source) && source.length === 213 && isDeepStrictEqual(applied, source), "actual migration ledger differs from reviewed source");
}

/** SQL is applied separately under the controlled operation. The candidate may
 * contain only the one pinned addition; this module only reads the 213 ledger. */
export async function verifyPieceUnitAppliedDatabase({ repositoryRoot, configPath, releaseSha }) {
  const review = await loadPieceUnitReview();
  requireValue(releaseSha === review.to, "unreviewed database candidate");
  const proof = await readPreApplyProof(review);
  await verifyPreservationProof(review);
  const git = gitAt(repositoryRoot);
  const names = git(["ls-tree", "--name-only", `${review.migrationSourceRef}:supabase/migrations`]).toString().trim().split("\n").filter(name => /^\d{14}_.+\.sql$/u.test(name)).sort();
  const source = names.map(filename => ({ filename, sha256: hash(git(["show", `${review.migrationSourceRef}:supabase/migrations/${filename}`])) }));
  assertPieceUnitMigrationTransition(proof.ledger, source, review.migrations);
  const adapter = await createRecordingDockerAdapter({ configPath, backupDirectory: dirname(review.preApplyProof.path) });
  requireValue(isDeepStrictEqual(await adapter.inspect(), proof.target), "database target drift");
  const applied = JSON.parse(await adapter.query(PIECE_UNIT_LEDGER_SQL));
  assertPieceUnitAppliedLedger(source, applied);
  await assertAiNutritionDisabled(adapter);
  return { baselineRequired: false, pending: [], applied, source, migrationSourceRef: review.migrationSourceRef, aiRuntimeGate: "disabled" };
}

// This separately applied guard changes the app/DB input contract. A web-only
// rollback would restore v2 while the database still requires v3.
export const PIECE_UNIT_ROLLBACK_REASON = "Piece evidence guard requires v3 app; old v2 web cannot be restored without matching database guard.";
export const PIECE_UNIT_RECOVERY_MESSAGE = "단위 환산 DB는 v3 앱을 요구하므로 이전 v2 웹 자동 복구를 차단했습니다. DB는 되돌리지 않았으며 복구 기록을 유지합니다. 검증된 v3 앱을 복구하거나 DB와 앱을 함께 검토해 복구하세요.";
export function pieceUnitAppliedDatabaseState(plan) {
  requireValue(plan?.baselineRequired === false && Array.isArray(plan.pending) && plan.pending.length === 0
    && REF.test(plan.migrationSourceRef ?? '') && plan.aiRuntimeGate === 'disabled', 'verified piece database plan required');
  assertPieceUnitAppliedLedger(plan.source, plan.applied);
  const applied = plan.applied.filter(row => PIECE_UNIT_MIGRATIONS.includes(row.filename));
  requireValue(isDeepStrictEqual(applied, [{ filename: PIECE_UNIT_MIGRATIONS[0], sha256: PIECE_UNIT_MIGRATION_SHA256 }]),
    'exact applied piece migration required');
  return { changed: true, applied, backwardCompatible: false, reason: PIECE_UNIT_ROLLBACK_REASON };
}

export async function reviewedPieceUnitReadiness({ readiness, previous, next, liveSha, releaseSha, files, databasePlan, databaseDeployment, repositoryRoot, configPath }) {
  const review = await loadPieceUnitReview();
  requireValue(hash(JSON.stringify(readiness)) === review.originalReadinessSha256, "original readiness changed");
  requireValue(databaseDeployment === false && databasePlan?.baselineRequired === false && databasePlan.pending?.length === 0
    && databasePlan.applied?.length === 213 && databasePlan.migrationSourceRef === review.migrationSourceRef, "verified separately applied database required");
  const git = gitAt(repositoryRoot);
  requireValue(git(["status", "--porcelain", "--untracked-files=no"]).length === 0, "candidate tracked files changed");
  git(["merge-base", "--is-ancestor", liveSha, releaseSha]);
  const actualFiles = git(["diff", "--name-only", "--no-renames", "-z", liveSha, releaseSha]).toString().split("\0").filter(Boolean);
  const digests = Object.fromEntries(Object.keys(review.files).map(path => [path, [liveSha, releaseSha].map(ref => git(["ls-tree", ref, "--", path]).length ? hash(git(["show", `${ref}:${path}`])) : null)]));
  assertPieceUnitSource({ review, liveSha, releaseSha, files, actualFiles, digests });
  // Exact application trees also catch a new bootstrap omitted by a web-only
  // candidate builder. This does not copy deployment tools into the candidate.
  const appTree = ref => git(["ls-tree", "-r", "--full-tree", "-z", ref, "--", ...APPLICATION_PATHS]);
  assertAiNutritionApplicationTree(appTree(releaseSha), appTree(review.migrationSourceRef));
  for (const path of files.filter(path => /^(app|components|lib|stores|types|hooks|public)\//u.test(path)
    || ["instrumentation.ts", ".env.example", "scripts/lib/recipe-nutrition-predecessor.mjs"].includes(path))) {
    const sourceHash = git(["ls-tree", review.migrationSourceRef, "--", path]).length
      ? hash(git(["show", `${review.migrationSourceRef}:${path}`])) : null;
    requireValue(sourceHash === review.files[path][1], "candidate application bytes differ from reviewed integrated source");
  }
  const environment = { ...next.EnvironmentVariables };
  for (const [key, value] of Object.entries({ MUMEOK_ROUND2_RELEASE_SHA: releaseSha, MUMEOK_ROUND2_REPOSITORY_ROOT: next.WorkingDirectory, MUMEOK_ROUND2_READINESS_PATH: join(dirname(next.WorkingDirectory), "round2-readiness.json") })) {
    requireValue(environment[key] === previous.EnvironmentVariables[key] || environment[key] === value, "unexpected readiness binding");
    environment[key] = previous.EnvironmentVariables[key];
  }
  const inherited = inheritRound2Readiness({ readiness, previous, next: { ...next, EnvironmentVariables: environment }, liveSha, releaseSha,
    files: files.filter(path => !review.protectedSources.includes(path)), databaseDeployment: false });
  requireValue(isDeepStrictEqual(sorted(Object.keys(readiness.proofs ?? {})), PROOFS), "original proof set changed");
  const proxyProofs = Object.entries(readiness.proxy ?? {}).filter(([, value]) => value && typeof value === "object");
  requireValue(isDeepStrictEqual(sorted(proxyProofs.map(([key]) => key)), PROXY_PROOFS), "original proxy proof set changed");
  const proofDigests = {};
  for (const [key, value] of [...Object.entries(readiness.proofs), ...proxyProofs]) {
    await privatePath(value.path);
    requireValue(SHA.test(value.sha256 ?? "") && value.sha256 === review.proofDigests[key]
      && hash(readFileSync(value.path)) === value.sha256, "original proof changed");
    proofDigests[key] = value.sha256;
  }
  const authority = JSON.parse(readFileSync(readiness.proofs.db_authority.path, "utf8"));
  const before = await readPreApplyProof(review);
  const adapter = await createRecordingDockerAdapter({ configPath, backupDirectory: dirname(review.preApplyProof.path) });
  const observed = await capturePieceUnitDatabaseEvidence(adapter);
  requireValue(isDeepStrictEqual(observed.target, before.target) && isDeepStrictEqual(observed.target, authority.target), "database target drift");
  requireValue(isDeepStrictEqual(observed.ledger, databasePlan.applied), "database ledger changed after verification");
  requireValue(observed.receiptSha256 === before.receiptSha256 && observed.immutableScope === before.immutableScope
    && observed.immutableScope === authority.immutableScopeHash && observed.marketingPostimage === before.marketingPostimage
    && observed.rowsSha256 === before.rowsSha256, "marketing data or authority boundary changed");
  assertPieceUnitAuthorityPreserved(before, observed, review);
  await verifyPreservationProof(review);
  requireValue(await adapter.query(BETA_ALIASES_UNROUTED_SQL) === "t", "historical owner-only aliases became routed");
  return { readiness: inherited, review: { schema: "homecook.prelaunch-piece-unit-source-review.v1", observedAt: new Date().toISOString(), liveSha, releaseSha,
    originalVerifiedAt: readiness.verified_at, proofDigests, sources: review.files, protectedSources: review.protectedSources,
    migrationSourceRef: review.migrationSourceRef, migrationCount: observed.ledger.length,
    reviewManifestSha256: PIECE_UNIT_REVIEW_PIN.sha256, preApplyProofSha256: review.preApplyProof.sha256,
    receiptSha256: observed.receiptSha256, immutableScope: observed.immutableScope, marketingPostimage: observed.marketingPostimage,
    rowsSha256: observed.rowsSha256, anonymousFunctions: observed.anonymousFunctions, workerPrivileges: observed.workerPrivileges, pieceFunctions: observed.pieceFunctions, preservationProofSha256: review.preservationProof.sha256, aiRuntimeGate: "disabled", scopeFunctions: observed.scopeFunctions, aliasesUnrouted: true, providerReverified: false, databaseWrites: false } };
}
