/** One reviewed ingredient search rollout. Unconfigured pins deliberately prohibit execution. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { DeploymentError, inheritRound2Readiness } from "./prelaunch-web-deploy.mjs";
import { createRecordingDockerAdapter, privatePath } from "./marketing-round2-controlled-deploy.mjs";
import { BETA_ALIASES_UNROUTED_SQL } from "./prelaunch-beta-readiness.mjs";

import {
  AI_NUTRITION_LEDGER_SQL as INGREDIENT_SEARCH_LEDGER_SQL,
  AI_NUTRITION_ROWS_SQL as INGREDIENT_SEARCH_ROWS_SQL,
  captureAiNutritionDatabaseAfter,
  assertAiNutritionDisabled,
  assertAiNutritionApplicationTree,
} from "./prelaunch-ai-nutrition-readiness.mjs";
export { INGREDIENT_SEARCH_LEDGER_SQL, INGREDIENT_SEARCH_ROWS_SQL };

// Filled only after the operator reviews the exact source pair and immutable
// private manifest. Neither CLI flags nor environment variables override it.
export const INGREDIENT_SEARCH_REVIEW_PIN = Object.freeze({"path":"/Users/cwj/.homecook/operations/ingredient-search-rollout-20261009-0o0vbL/search-readiness-review.json","sha256":"291550ecc48ddc258ee4fe1249013afa40377ef0261f0fedaacdc60f7a89c0d2"});
export const INGREDIENT_SEARCH_MIGRATIONS = Object.freeze(["20261009090000_ingredient_canonical_search.sql"]);
const ANONYMOUS_ALIAS = "verify_anonymous_pre_canonical_search_20261009";
const ACTIVE_ANONYMOUS = "verify_full_local_anonymous_authority";
const WORKER_ROLE = "youtube_extraction_worker_rpc_owner";
const WORKER_COLUMNS = ["ingredient_id", "presentation", "representative_ingredient_id"];
const APPLICATION_PATHS = ["app", "components", "lib", "stores", "types", "hooks", "public", "instrumentation.ts", ".env.example", "scripts/lib/recipe-nutrition-predecessor.mjs"];
const SHA = /^[a-f0-9]{64}$/u;
const REF = /^[a-f0-9]{40}$/u;
const PROOFS = ["db_authority", "db_migration", "operator_approval", "privacy_consent", "retention_runbook", "turnstile_live"];
const PROXY_PROOFS = ["direct_access_denial", "header_overwrite", "launch_binding"];
const requireValue = (value, message) => { if (!value) throw new DeploymentError(`Reviewed ingredient search readiness: ${message}`); };
const hash = value => createHash("sha256").update(value).digest("hex");
const sorted = values => [...values].sort();

// Collect the actual deployed internal chain, including earlier Luna delegates.
const functionColumns = "'name',p.proname,'source',p.prosrc,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'securityDefiner',p.prosecdef,'config',p.proconfig";
export const INGREDIENT_SEARCH_SCOPE_SQL = `SELECT json_agg(json_build_object(${functionColumns}) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.pronargs=0 AND (p.proname LIKE 'verify_full_local_internal_scope%' OR p.proname LIKE 'verify_scope_pre_%');`;
export const INGREDIENT_SEARCH_ANONYMOUS_SQL = `SELECT json_agg(json_build_object(${functionColumns}) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.pronargs=0 AND (p.proname='verify_full_local_anonymous_authority' OR p.proname LIKE 'verify_anonymous_pre_%');`;
export const INGREDIENT_SEARCH_WORKER_SQL = `SELECT jsonb_build_object(
  'role', (SELECT jsonb_build_object('name',rolname,'superuser',rolsuper,'inherit',rolinherit,'bypassRls',rolbypassrls,'canLogin',rolcanlogin) FROM pg_roles WHERE rolname='youtube_extraction_worker_rpc_owner'),
  'rlsEnabled', (SELECT relrowsecurity FROM pg_class WHERE oid='public.ingredient_catalog_entries'::regclass),
  'tableSelect', has_table_privilege('youtube_extraction_worker_rpc_owner','public.ingredient_catalog_entries','SELECT'),
  'tableWrite', has_table_privilege('youtube_extraction_worker_rpc_owner','public.ingredient_catalog_entries','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
  'privateEvidenceSelect', has_table_privilege('youtube_extraction_worker_rpc_owner','public.ingredient_representative_links','SELECT'),
  'columns', (SELECT jsonb_agg(jsonb_build_object('name',attname,'select',has_column_privilege('youtube_extraction_worker_rpc_owner',attrelid,attnum,'SELECT'),'write',has_column_privilege('youtube_extraction_worker_rpc_owner',attrelid,attnum,'INSERT,UPDATE,REFERENCES')) ORDER BY attname) FROM pg_attribute WHERE attrelid='public.ingredient_catalog_entries'::regclass AND attnum>0 AND NOT attisdropped),
  'policies', (SELECT coalesce(jsonb_agg(jsonb_build_object('name',polname,'command',polcmd,'permissive',polpermissive,'roles',(SELECT jsonb_agg(CASE WHEN role_id=0 THEN 'public' ELSE pg_get_userbyid(role_id) END ORDER BY CASE WHEN role_id=0 THEN 'public' ELSE pg_get_userbyid(role_id) END) FROM unnest(polroles) role_id),'appliesToWorker',EXISTS(SELECT 1 FROM unnest(polroles) role_id WHERE CASE WHEN role_id=0 THEN true ELSE pg_has_role('youtube_extraction_worker_rpc_owner',role_id,'USAGE') END),'using',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid)) ORDER BY polname),'[]'::jsonb) FROM pg_policy WHERE polrelid='public.ingredient_catalog_entries'::regclass)
);`;

export function ingredientSearchFunctionEvidence(rows) {
  requireValue(Array.isArray(rows) && rows.length > 0, "function evidence missing");
  return rows.map(row => {
    requireValue(typeof row.name === "string" && /^[a-z0-9_]+$/u.test(row.name)
      && typeof row.source === "string", "invalid function evidence");
    return { name: row.name, bodySha256: hash(row.source), owner: row.owner,
      acl: row.acl, securityDefiner: row.securityDefiner, config: row.config };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

const ANONYMOUS_WRAPPER_BODY = `begin
  if coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb
      ->> 'x-homecook-public-read-scope' = 'ingredients'
    and upper(coalesce(current_setting('request.method', true), '')) = 'GET'
    and current_setting('request.path', true) = '/ingredient_catalog_aliases' then
    return;
  end if;
  perform private.verify_anonymous_pre_canonical_search_20261009();
end;`;
const normalizedBody = source => source.trim().replace(/\s+/gu, " ");
export function assertIngredientSearchAnonymousBody(rows) {
  const active = rows.find(row => row.name === ACTIVE_ANONYMOUS);
  requireValue(active && normalizedBody(active.source) === normalizedBody(ANONYMOUS_WRAPPER_BODY), "anonymous wrapper is outside the exact GET alias-view scope");
}

export function assertIngredientSearchWorkerPrivileges(observed, expected) {
  requireValue(isDeepStrictEqual(observed, expected), "worker privileges differ from reviewed postimage");
  requireValue(observed?.role?.name === WORKER_ROLE && observed.role.superuser === false
    && observed.role.inherit === false && observed.role.bypassRls === false && observed.role.canLogin === false,
    "worker role authority changed");
  requireValue(observed.rlsEnabled === true && observed.tableSelect === false && observed.tableWrite === false
    && observed.privateEvidenceSelect === false && Array.isArray(observed.columns)
    && isDeepStrictEqual(sorted(observed.columns.filter(row => row.select).map(row => row.name)), WORKER_COLUMNS)
    && observed.columns.every(row => row.write === false), "worker must have only three alias-edge SELECT columns");
  const policy = observed.policies?.find(row => row.name === "ingredient_catalog_alias_worker_read");
  requireValue(policy && policy.command === 'r' && policy.permissive === true
    && isDeepStrictEqual(policy.roles, [WORKER_ROLE]) && policy.appliesToWorker === true && policy.check === null
    && normalizedBody(policy.using) === "(presentation = 'alias'::text)", "worker policy must be alias-only SELECT");
  requireValue(observed.policies.every(row => row === policy || row.appliesToWorker === false),
    "additional public/worker RLS policy is not allowed");
}

export function assertIngredientSearchReview(review) {
  requireValue(review?.schema === "homecook.prelaunch-ingredient-search-review.v1", "invalid review manifest");
  requireValue(REF.test(review.from ?? "") && REF.test(review.to ?? "") && review.from !== review.to
    && REF.test(review.migrationSourceRef ?? ""), "unreviewed source pair");
  requireValue(review.previousMigrationCount === 211 && review.migrationCount === 212, "exact reviewed 211-to-212 ledger required");
  requireValue(Array.isArray(review.migrations) && review.migrations.length === 1
    && isDeepStrictEqual(review.migrations.map(row => row.filename), [...INGREDIENT_SEARCH_MIGRATIONS])
    && review.migrations.every(row => SHA.test(row.sha256 ?? "")), "exact one migration pins required");
  requireValue(SHA.test(review.originalReadinessSha256 ?? "")
    && isDeepStrictEqual(sorted(Object.keys(review.proofDigests ?? {})), sorted([...PROOFS, ...PROXY_PROOFS]))
    && Object.values(review.proofDigests).every(value => SHA.test(value)), "original readiness/proof pins required");
  requireValue(review.files && typeof review.files === "object" && !Array.isArray(review.files)
    && Object.keys(review.files).length > 0, "complete source pins missing");
  for (const [path, pair] of Object.entries(review.files)) {
    requireValue(!path.startsWith("/") && !path.split("/").includes("..") && Array.isArray(pair)
      && pair.length === 2 && pair.every(value => value === null || SHA.test(value))
      && pair.some(value => value !== null), "invalid source pin");
    requireValue(!path.startsWith("infra/"), "ingredient search candidate cannot change infrastructure");
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
    && [ACTIVE_ANONYMOUS, ANONYMOUS_ALIAS].every(name => review.expectedAnonymousFunctions.some(row => row.name === name))
    && review.expectedAnonymousFunctions.every(row => SHA.test(row.bodySha256 ?? "") && row.owner === "postgres"
      && row.securityDefiner === true && isDeepStrictEqual(row.config, ["search_path=pg_catalog, public, private, pg_temp"])
      && Array.isArray(row.acl) && row.acl.length === 1 && /^postgres=X\/[a-z0-9_]+$/u.test(row.acl[0])), "reviewed owner-only anonymous chain required");
  requireValue(isAbsolute(review.preservationProof?.path ?? "") && SHA.test(review.preservationProof?.sha256 ?? ""), "pinned nutrition/history preservation proof required");
  assertIngredientSearchWorkerPrivileges(review.expectedWorkerPrivileges, review.expectedWorkerPrivileges);
  return review;
}

export function assertIngredientSearchReviewPin(pin) {
  requireValue(isAbsolute(pin?.path ?? "") && SHA.test(pin?.sha256 ?? ""), "review pins are not configured; execution prohibited");
}

export async function loadIngredientSearchReview() {
  assertIngredientSearchReviewPin(INGREDIENT_SEARCH_REVIEW_PIN);
  await privatePath(INGREDIENT_SEARCH_REVIEW_PIN.path);
  const bytes = readFileSync(INGREDIENT_SEARCH_REVIEW_PIN.path);
  requireValue(hash(bytes) === INGREDIENT_SEARCH_REVIEW_PIN.sha256, "review manifest bytes changed");
  return assertIngredientSearchReview(JSON.parse(bytes));
}

async function readPreApplyProof(review) {
  await privatePath(review.preApplyProof.path);
  const bytes = readFileSync(review.preApplyProof.path);
  requireValue(hash(bytes) === review.preApplyProof.sha256, "pre-apply proof changed");
  const proof = JSON.parse(bytes);
  requireValue(proof.schema === "homecook.prelaunch-ingredient-search-db-before.v1"
    && typeof proof.observedAt === "string" && Number.isFinite(Date.parse(proof.observedAt))
    && Array.isArray(proof.ledger) && proof.ledger.length === 211
    && SHA.test(proof.receiptSha256 ?? "") && SHA.test(proof.immutableScope ?? "")
    && SHA.test(proof.marketingPostimage ?? "") && SHA.test(proof.rowsSha256 ?? "")
    && Array.isArray(proof.scopeFunctions) && Array.isArray(proof.anonymousFunctions)
    && proof.workerPrivileges, "invalid pre-apply proof");
  return proof;
}

async function captureIngredientSearchDatabaseEvidence(adapter) {
  // Shared collector calls inspect before any query, validates R2 receipt/data,
  // and requires AI disabled. Extend its metadata without loading its old pin.
  const common = await captureAiNutritionDatabaseAfter(adapter);
  const anonymousRows = JSON.parse(await adapter.query(INGREDIENT_SEARCH_ANONYMOUS_SQL));
  return { ...common, schema: "homecook.prelaunch-ingredient-search-db-before.v1",
    scopeFunctions: ingredientSearchFunctionEvidence(JSON.parse(await adapter.query(INGREDIENT_SEARCH_SCOPE_SQL))),
    anonymousFunctions: ingredientSearchFunctionEvidence(anonymousRows),
    anonymousRows,
    workerPrivileges: JSON.parse(await adapter.query(INGREDIENT_SEARCH_WORKER_SQL)),
  };
}

export async function captureIngredientSearchDatabaseBefore(adapter) {
  const proof = await captureIngredientSearchDatabaseEvidence(adapter);
  requireValue(proof.ledger.length === 211
    && !proof.anonymousFunctions.some(row => row.name === ANONYMOUS_ALIAS), "pre-apply 211-entry state required");
  delete proof.anonymousRows;
  return proof;
}

export function assertIngredientSearchAuthorityPreserved(before, after, review) {
  requireValue(isDeepStrictEqual(after.scopeFunctions, before.scopeFunctions)
    && isDeepStrictEqual(after.scopeFunctions, review.expectedScopeFunctions), "internal scope chain changed");
  requireValue(isDeepStrictEqual(after.anonymousFunctions, review.expectedAnonymousFunctions)
    && after.anonymousFunctions.length === before.anonymousFunctions.length + 1
    && isDeepStrictEqual(after.anonymousFunctions.filter(row => !before.anonymousFunctions.some(prior => prior.name === row.name)).map(row => row.name), [ANONYMOUS_ALIAS]),
    "anonymous chain differs from reviewed one-rename postimage");
  for (const original of before.anonymousFunctions) {
    const name = original.name === ACTIVE_ANONYMOUS ? ANONYMOUS_ALIAS : original.name;
    const preserved = after.anonymousFunctions.find(row => row.name === name);
    requireValue(preserved && isDeepStrictEqual({ ...preserved, name: original.name }, original), "original anonymous authority was not preserved");
  }
  assertIngredientSearchAnonymousBody(after.anonymousRows);
  assertIngredientSearchWorkerPrivileges(after.workerPrivileges, review.expectedWorkerPrivileges);
  requireValue(isDeepStrictEqual(before.workerPrivileges.role, after.workerPrivileges.role)
    && isDeepStrictEqual(before.workerPrivileges.policies, after.workerPrivileges.policies.filter(row => row.name !== 'ingredient_catalog_alias_worker_read')),
    "pre-existing worker role or RLS policies changed");
}

export function assertIngredientSearchPreservation(proof, review) {
  requireValue(proof?.schema === 'homecook.ingredient-search-preservation.v1' && proof.verified === true
    && proof.migrationSourceRef === review.migrationSourceRef && isDeepStrictEqual(proof.migration, review.migrations[0])
    && ['officialNutrition','historicalRecords'].every(key => SHA.test(proof.before?.[key] ?? '') && proof.before[key] === proof.after?.[key]),
    "official nutrition or historical records preservation proof invalid");
}

async function verifyPreservationProof(review) {
  await privatePath(review.preservationProof.path);
  const bytes = readFileSync(review.preservationProof.path);
  requireValue(hash(bytes) === review.preservationProof.sha256, 'preservation proof bytes changed');
  assertIngredientSearchPreservation(JSON.parse(bytes), review);
}

export function assertIngredientSearchMigrationTransition(before, source, migrations) {
  requireValue(Array.isArray(before) && before.length === 211
    && Array.isArray(source) && source.length === 212
    && new Set(source.map(row => row.filename)).size === 212
    && new Set(before.map(row => row.filename)).size === 211
    && [...before, ...source].every(row => /^\d{14}_[^/]+\.sql$/u.test(row.filename) && SHA.test(row.sha256 ?? "")), "invalid reviewed migration ledger");
  requireValue(isDeepStrictEqual(source.filter(row => before.some(prior => prior.filename === row.filename)), before), "migration source changed its reviewed predecessor");
  requireValue(isDeepStrictEqual(source.filter(row => !before.some(prior => prior.filename === row.filename)), migrations)
    && isDeepStrictEqual(migrations.map(row => row.filename), [...INGREDIENT_SEARCH_MIGRATIONS]), "new migration bytes differ from reviewed one-file set");
}

function gitAt(repositoryRoot) {
  return args => execFileSync("git", ["-C", repositoryRoot, ...args], { maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
}

export function assertIngredientSearchSource({ review, liveSha, releaseSha, files, actualFiles, digests }) {
  assertIngredientSearchReview(review);
  requireValue(liveSha === review.from && releaseSha === review.to, "unreviewed source pair");
  requireValue(isDeepStrictEqual(sorted(files), sorted(actualFiles)) && isDeepStrictEqual(sorted(files), sorted(Object.keys(review.files))), "complete source diff differs from review");
  requireValue(isDeepStrictEqual(digests, review.files), "reviewed source bytes changed");
}

export function assertIngredientSearchAppliedLedger(source, applied) {
  requireValue(Array.isArray(source) && source.length === 212 && isDeepStrictEqual(applied, source), "actual migration ledger differs from reviewed source");
}

/** SQL is applied separately under the controlled operation. The candidate may
 * contain only the one pinned addition; this module only reads the 212 ledger. */
export async function verifyIngredientSearchAppliedDatabase({ repositoryRoot, configPath, releaseSha }) {
  const review = await loadIngredientSearchReview();
  requireValue(releaseSha === review.to, "unreviewed database candidate");
  const proof = await readPreApplyProof(review);
  await verifyPreservationProof(review);
  const git = gitAt(repositoryRoot);
  const names = git(["ls-tree", "--name-only", `${review.migrationSourceRef}:supabase/migrations`]).toString().trim().split("\n").filter(name => /^\d{14}_.+\.sql$/u.test(name)).sort();
  const source = names.map(filename => ({ filename, sha256: hash(git(["show", `${review.migrationSourceRef}:supabase/migrations/${filename}`])) }));
  assertIngredientSearchMigrationTransition(proof.ledger, source, review.migrations);
  const adapter = await createRecordingDockerAdapter({ configPath, backupDirectory: dirname(review.preApplyProof.path) });
  requireValue(isDeepStrictEqual(await adapter.inspect(), proof.target), "database target drift");
  const applied = JSON.parse(await adapter.query(INGREDIENT_SEARCH_LEDGER_SQL));
  assertIngredientSearchAppliedLedger(source, applied);
  await assertAiNutritionDisabled(adapter);
  return { baselineRequired: false, pending: [], applied, source, migrationSourceRef: review.migrationSourceRef, aiRuntimeGate: "disabled" };
}

export async function reviewedIngredientSearchReadiness({ readiness, previous, next, liveSha, releaseSha, files, databasePlan, databaseDeployment, repositoryRoot, configPath }) {
  const review = await loadIngredientSearchReview();
  requireValue(hash(JSON.stringify(readiness)) === review.originalReadinessSha256, "original readiness changed");
  requireValue(databaseDeployment === false && databasePlan?.baselineRequired === false && databasePlan.pending?.length === 0
    && databasePlan.applied?.length === 212 && databasePlan.migrationSourceRef === review.migrationSourceRef, "verified separately applied database required");
  const git = gitAt(repositoryRoot);
  requireValue(git(["status", "--porcelain", "--untracked-files=no"]).length === 0, "candidate tracked files changed");
  git(["merge-base", "--is-ancestor", liveSha, releaseSha]);
  const actualFiles = git(["diff", "--name-only", "--no-renames", "-z", liveSha, releaseSha]).toString().split("\0").filter(Boolean);
  const digests = Object.fromEntries(Object.keys(review.files).map(path => [path, [liveSha, releaseSha].map(ref => git(["ls-tree", ref, "--", path]).length ? hash(git(["show", `${ref}:${path}`])) : null)]));
  assertIngredientSearchSource({ review, liveSha, releaseSha, files, actualFiles, digests });
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
  const observed = await captureIngredientSearchDatabaseEvidence(adapter);
  requireValue(isDeepStrictEqual(observed.target, before.target) && isDeepStrictEqual(observed.target, authority.target), "database target drift");
  requireValue(isDeepStrictEqual(observed.ledger, databasePlan.applied), "database ledger changed after verification");
  requireValue(observed.receiptSha256 === before.receiptSha256 && observed.immutableScope === before.immutableScope
    && observed.immutableScope === authority.immutableScopeHash && observed.marketingPostimage === before.marketingPostimage
    && observed.rowsSha256 === before.rowsSha256, "marketing data or authority boundary changed");
  assertIngredientSearchAuthorityPreserved(before, observed, review);
  await verifyPreservationProof(review);
  requireValue(await adapter.query(BETA_ALIASES_UNROUTED_SQL) === "t", "historical owner-only aliases became routed");
  return { readiness: inherited, review: { schema: "homecook.prelaunch-ingredient-search-source-review.v1", observedAt: new Date().toISOString(), liveSha, releaseSha,
    originalVerifiedAt: readiness.verified_at, proofDigests, sources: review.files, protectedSources: review.protectedSources,
    migrationSourceRef: review.migrationSourceRef, migrationCount: observed.ledger.length,
    reviewManifestSha256: INGREDIENT_SEARCH_REVIEW_PIN.sha256, preApplyProofSha256: review.preApplyProof.sha256,
    receiptSha256: observed.receiptSha256, immutableScope: observed.immutableScope, marketingPostimage: observed.marketingPostimage,
    rowsSha256: observed.rowsSha256, anonymousFunctions: observed.anonymousFunctions, workerPrivileges: observed.workerPrivileges, preservationProofSha256: review.preservationProof.sha256, aiRuntimeGate: "disabled", scopeFunctions: observed.scopeFunctions, aliasesUnrouted: true, providerReverified: false, databaseWrites: false } };
}
