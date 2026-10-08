/** One reviewed AI nutrition rollout. Unconfigured pins deliberately prohibit execution. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { inheritRound2Readiness } from "./prelaunch-web-deploy.mjs";
import { createRecordingDockerAdapter, privatePath, IMMUTABLE_SCOPE_SQL, LEDGER_VALID_SQL } from "./marketing-round2-controlled-deploy.mjs";
import { BETA_ALIASES_UNROUTED_SQL, BETA_CANONICAL_POSTIMAGE_SQL } from "./prelaunch-beta-readiness.mjs";

// Filled only after the operator reviews the exact source pair and immutable
// private manifest. Neither CLI flags nor environment variables override it.
export const AI_NUTRITION_REVIEW_PIN = Object.freeze({ path: "/Users/cwj/.homecook/operations/ingredient-ai-nutrition-20261008-xaPr1w/ai-readiness-review.json", sha256: "a1b4e801bbe7ac12cd05ec0c03394eb0af0c3f2f5469cbf147085180d3b05b9b" });
export const AI_NUTRITION_MIGRATIONS = Object.freeze([
  "20261008090000_ingredient_ai_nutrition.sql",
  "20261008091000_ai_nutrition_snapshot_evidence.sql",
  "20261008092000_ai_nutrition_recipe_refresh.sql",
]);
const NEW_SCOPE_ALIASES = ["verify_scope_pre_ingredient_ai_20261008", "verify_scope_pre_ai_refresh_20261008"];
export const AI_NUTRITION_DISABLED_SQL = "SELECT CASE WHEN count(*) = 1 AND bool_and(enabled IS FALSE) THEN 'disabled' ELSE 'unsafe' END FROM private.ingredient_ai_nutrition_settings;";
const APPLICATION_PATHS = ["app", "components", "lib", "stores", "types", "hooks", "public", "instrumentation.ts", ".env.example", "scripts/lib/recipe-nutrition-predecessor.mjs"];
const SHA = /^[a-f0-9]{64}$/u;
const REF = /^[a-f0-9]{40}$/u;
const PROOFS = ["db_authority", "db_migration", "operator_approval", "privacy_consent", "retention_runbook", "turnstile_live"];
const PROXY_PROOFS = ["direct_access_denial", "header_overwrite", "launch_binding"];
const requireValue = (value, message) => { if (!value) throw new Error(`Reviewed AI nutrition readiness: ${message}`); };
const hash = value => createHash("sha256").update(value).digest("hex");
const sorted = values => [...values].sort();

// Preserve the existing scope chain and admit exactly the two reviewed AI delegates.
export const AI_NUTRITION_SCOPE_SQL = `SELECT json_agg(json_build_object('name',p.proname,'source',p.prosrc,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'securityDefiner',p.prosecdef,'config',p.proconfig) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND (p.proname LIKE 'verify_full_local_internal_scope%' OR p.proname IN ('verify_scope_pre_action_notifications_20260928','verify_scope_pre_meal_log_preview_20261006','verify_scope_pre_meal_create_key_20261006','verify_scope_pre_ingredient_ai_20261008','verify_scope_pre_ai_refresh_20261008'));`;
const REVIEWED_SCOPE_ALIAS = /^(?:verify_full_local_internal_scope[a-z0-9_]*|verify_scope_pre_action_notifications_20260928|verify_scope_pre_meal_log_preview_20261006|verify_scope_pre_meal_create_key_20261006|verify_scope_pre_ingredient_ai_20261008|verify_scope_pre_ai_refresh_20261008)$/u;

export const AI_NUTRITION_LEDGER_SQL = "SELECT coalesce(jsonb_agg(jsonb_build_object('filename',filename,'sha256',sha256) ORDER BY filename),'[]'::jsonb) FROM homecook_deploy.migrations;";
export const AI_NUTRITION_ROWS_SQL = `SELECT jsonb_object_agg(relation, evidence) FROM (${[
  "marketing_validation_sessions", "marketing_round2_participations", "marketing_round2_events", "marketing_round2_lead_requests",
].map(name => `SELECT '${name}' relation, jsonb_build_object('count', count(*), 'sha256', encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex')) evidence FROM public.${name} t`).join(" UNION ALL ")}) rows;`;

export function aiNutritionScopeEvidence(rows) {
  requireValue(Array.isArray(rows) && rows.length > 0, "scope evidence missing");
  return rows.map(row => {
    requireValue(typeof row.name === "string" && REVIEWED_SCOPE_ALIAS.test(row.name)
      && typeof row.source === "string", "invalid scope function");
    return { name: row.name, bodySha256: hash(row.source), owner: row.owner,
      acl: row.acl, securityDefiner: row.securityDefiner, config: row.config };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export function assertAiNutritionReview(review) {
  requireValue(review?.schema === "homecook.prelaunch-ai-nutrition-review.v1", "invalid review manifest");
  requireValue(REF.test(review.from ?? "") && REF.test(review.to ?? "") && review.from !== review.to
    && REF.test(review.migrationSourceRef ?? ""), "unreviewed source pair");
  requireValue(review.previousMigrationCount === 204 && review.migrationCount === 207, "exact reviewed 204-to-207 ledger required");
  requireValue(Array.isArray(review.migrations) && review.migrations.length === 3
    && isDeepStrictEqual(review.migrations.map(row => row.filename), [...AI_NUTRITION_MIGRATIONS])
    && review.migrations.every(row => SHA.test(row.sha256 ?? "")), "exact three migration pins required");
  requireValue(SHA.test(review.originalReadinessSha256 ?? "")
    && isDeepStrictEqual(sorted(Object.keys(review.proofDigests ?? {})), sorted([...PROOFS, ...PROXY_PROOFS]))
    && Object.values(review.proofDigests).every(value => SHA.test(value)), "original readiness/proof pins required");
  requireValue(review.files && typeof review.files === "object" && !Array.isArray(review.files)
    && Object.keys(review.files).length > 0, "complete source pins missing");
  for (const [path, pair] of Object.entries(review.files)) {
    requireValue(!path.startsWith("/") && !path.split("/").includes("..") && Array.isArray(pair)
      && pair.length === 2 && pair.every(value => value === null || SHA.test(value))
      && pair.some(value => value !== null), "invalid source pin");
    requireValue(!path.startsWith("infra/"), "AI nutrition candidate cannot change infrastructure");
    if (path.startsWith("supabase/")) {
      const pin = review.migrations.find(row => path === `supabase/migrations/${row.filename}`);
      requireValue(pin && pair[0] === null && pair[1] === pin.sha256, "candidate SQL must be one of the exact three already-applied migrations");
    }
  }
  requireValue(Array.isArray(review.protectedSources) && new Set(review.protectedSources).size === review.protectedSources.length
    && review.protectedSources.every(path => Object.hasOwn(review.files, path)), "invalid protected source review");
  requireValue(isAbsolute(review.preApplyProof?.path ?? "") && SHA.test(review.preApplyProof?.sha256 ?? ""), "pinned pre-apply proof required");
  requireValue(Array.isArray(review.expectedScopeFunctions) && review.expectedScopeFunctions.length > 0
    && new Set(review.expectedScopeFunctions.map(row => row.name)).size === review.expectedScopeFunctions.length
    && review.expectedScopeFunctions.every(row => SHA.test(row.bodySha256 ?? "") && row.owner === "postgres" && row.securityDefiner === true
      && isDeepStrictEqual(row.config, ["search_path=pg_catalog, public, private, pg_temp"])), "reviewed scope chain required");
  requireValue(NEW_SCOPE_ALIASES.every(name => review.expectedScopeFunctions.some(row => row.name === name))
    && review.expectedScopeFunctions.some(row => row.name === "verify_full_local_internal_scope"), "both reviewed AI scope aliases required");
  requireValue(review.expectedScopeFunctions
    .filter(row => NEW_SCOPE_ALIASES.includes(row.name) || row.name === "verify_full_local_internal_scope")
    .every(row => Array.isArray(row.acl) && row.acl.length === 1
      && /^postgres=X\/[a-z0-9_]+$/u.test(row.acl[0])), "AI scope functions must remain owner-only");
  return review;
}

export function assertAiNutritionReviewPin(pin) {
  requireValue(isAbsolute(pin?.path ?? "") && SHA.test(pin?.sha256 ?? ""), "review pins are not configured; execution prohibited");
}

export async function loadAiNutritionReview() {
  assertAiNutritionReviewPin(AI_NUTRITION_REVIEW_PIN);
  await privatePath(AI_NUTRITION_REVIEW_PIN.path);
  const bytes = readFileSync(AI_NUTRITION_REVIEW_PIN.path);
  requireValue(hash(bytes) === AI_NUTRITION_REVIEW_PIN.sha256, "review manifest bytes changed");
  return assertAiNutritionReview(JSON.parse(bytes));
}

async function readPreApplyProof(review) {
  await privatePath(review.preApplyProof.path);
  const bytes = readFileSync(review.preApplyProof.path);
  requireValue(hash(bytes) === review.preApplyProof.sha256, "pre-apply proof changed");
  const proof = JSON.parse(bytes);
  requireValue(proof.schema === "homecook.prelaunch-ai-nutrition-db-before.v1"
    && typeof proof.observedAt === "string" && Number.isFinite(Date.parse(proof.observedAt))
    && Array.isArray(proof.ledger) && proof.ledger.length === 204
    && SHA.test(proof.receiptSha256 ?? "") && SHA.test(proof.immutableScope ?? "")
    && SHA.test(proof.marketingPostimage ?? "") && SHA.test(proof.rowsSha256 ?? "")
    && Array.isArray(proof.scopeFunctions), "invalid pre-apply proof");
  return proof;
}

/** Read-only collection. Caller saves this BEFORE applying SQL and reviews/pins it. */
async function captureAiNutritionDatabaseEvidence(adapter) {
  const target = await adapter.inspect();
  requireValue(await adapter.query(LEDGER_VALID_SQL) === "t", "R2 ledger authority drift");
  const receipt = JSON.parse(await adapter.query("SELECT receipt FROM marketing_round2_deploy.receipt WHERE singleton;"));
  const immutableScope = await adapter.query(IMMUTABLE_SCOPE_SQL);
  const marketingPostimage = await adapter.query(BETA_CANONICAL_POSTIMAGE_SQL);
  requireValue(immutableScope === receipt.immutableScopeHash && marketingPostimage === receipt.postimage, "original R2 receipt no longer matches its authority/catalog");
  return { schema: "homecook.prelaunch-ai-nutrition-db-before.v1", observedAt: new Date().toISOString(), target,
    ledger: JSON.parse(await adapter.query(AI_NUTRITION_LEDGER_SQL)),
    receiptSha256: hash(JSON.stringify(receipt)), immutableScope, marketingPostimage,
    rowsSha256: hash(JSON.stringify(JSON.parse(await adapter.query(AI_NUTRITION_ROWS_SQL)))),
    scopeFunctions: aiNutritionScopeEvidence(JSON.parse(await adapter.query(AI_NUTRITION_SCOPE_SQL))),
  };
}

export async function captureAiNutritionDatabaseBefore(adapter) {
  const proof = await captureAiNutritionDatabaseEvidence(adapter);
  requireValue(proof.ledger.length === 204
    && !proof.scopeFunctions.some(row => NEW_SCOPE_ALIASES.includes(row.name)), "pre-apply 204-entry state required");
  return proof;
}

export function assertAiNutritionScopePreserved(before, after, expected) {
  requireValue(isDeepStrictEqual(after, [...expected].sort((a, b) => a.name.localeCompare(b.name))), "scope chain differs from reviewed post-apply evidence");
  requireValue(after.length === before.length + 2
    && isDeepStrictEqual(sorted(after.filter(row => !before.some(prior => prior.name === row.name)).map(row => row.name)), sorted(NEW_SCOPE_ALIASES)), "only two reviewed scope aliases may be added");
  for (const original of before) {
    const name = original.name === "verify_full_local_internal_scope"
      ? "verify_scope_pre_ingredient_ai_20261008" : original.name;
    const preserved = after.find(row => row.name === name);
    requireValue(preserved && isDeepStrictEqual({ ...preserved, name: original.name }, original), "existing scope delegate or authority changed");
  }
}

export function assertAiNutritionMigrationTransition(before, source, migrations) {
  requireValue(Array.isArray(before) && before.length === 204
    && Array.isArray(source) && source.length === 207
    && new Set(source.map(row => row.filename)).size === 207
    && new Set(before.map(row => row.filename)).size === 204
    && [...before, ...source].every(row => /^\d{14}_[^/]+\.sql$/u.test(row.filename) && SHA.test(row.sha256 ?? "")), "invalid reviewed migration ledger");
  requireValue(isDeepStrictEqual(source.filter(row => before.some(prior => prior.filename === row.filename)), before), "migration source changed its reviewed predecessor");
  requireValue(isDeepStrictEqual(source.filter(row => !before.some(prior => prior.filename === row.filename)), migrations)
    && isDeepStrictEqual(migrations.map(row => row.filename), [...AI_NUTRITION_MIGRATIONS]), "new migration bytes differ from reviewed three-file set");
}

export async function assertAiNutritionDisabled(adapter) {
  requireValue(await adapter.query(AI_NUTRITION_DISABLED_SQL) === "disabled", "AI worker must remain disabled until live web verification");
}

function gitAt(repositoryRoot) {
  return args => execFileSync("git", ["-C", repositoryRoot, ...args], { maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
}

export function assertAiNutritionSource({ review, liveSha, releaseSha, files, actualFiles, digests }) {
  assertAiNutritionReview(review);
  requireValue(liveSha === review.from && releaseSha === review.to, "unreviewed source pair");
  requireValue(isDeepStrictEqual(sorted(files), sorted(actualFiles)) && isDeepStrictEqual(sorted(files), sorted(Object.keys(review.files))), "complete source diff differs from review");
  requireValue(isDeepStrictEqual(digests, review.files), "reviewed source bytes changed");
}

export function assertAiNutritionAppliedLedger(source, applied) {
  requireValue(Array.isArray(source) && source.length === 207 && isDeepStrictEqual(applied, source), "actual migration ledger differs from reviewed source");
}

export function assertAiNutritionApplicationTree(candidate, integrated) {
  requireValue(Buffer.isBuffer(candidate) && Buffer.isBuffer(integrated)
    && candidate.equals(integrated), "candidate application tree differs from reviewed integrated source");
}

/** SQL is applied separately under the controlled operation. The candidate may
 * contain only the three pinned additions; this module only reads the 207 ledger. */
export async function verifyAiNutritionAppliedDatabase({ repositoryRoot, configPath, releaseSha }) {
  const review = await loadAiNutritionReview();
  requireValue(releaseSha === review.to, "unreviewed database candidate");
  const proof = await readPreApplyProof(review);
  const git = gitAt(repositoryRoot);
  const names = git(["ls-tree", "--name-only", `${review.migrationSourceRef}:supabase/migrations`]).toString().trim().split("\n").filter(name => /^\d{14}_.+\.sql$/u.test(name)).sort();
  const source = names.map(filename => ({ filename, sha256: hash(git(["show", `${review.migrationSourceRef}:supabase/migrations/${filename}`])) }));
  assertAiNutritionMigrationTransition(proof.ledger, source, review.migrations);
  const adapter = await createRecordingDockerAdapter({ configPath, backupDirectory: dirname(review.preApplyProof.path) });
  requireValue(isDeepStrictEqual(await adapter.inspect(), proof.target), "database target drift");
  const applied = JSON.parse(await adapter.query(AI_NUTRITION_LEDGER_SQL));
  assertAiNutritionAppliedLedger(source, applied);
  await assertAiNutritionDisabled(adapter);
  return { baselineRequired: false, pending: [], applied, source, migrationSourceRef: review.migrationSourceRef, aiRuntimeGate: "disabled" };
}

export async function reviewedAiNutritionReadiness({ readiness, previous, next, liveSha, releaseSha, files, databasePlan, databaseDeployment, repositoryRoot, configPath }) {
  const review = await loadAiNutritionReview();
  requireValue(hash(JSON.stringify(readiness)) === review.originalReadinessSha256, "original readiness changed");
  requireValue(databaseDeployment === false && databasePlan?.baselineRequired === false && databasePlan.pending?.length === 0
    && databasePlan.applied?.length === 207 && databasePlan.migrationSourceRef === review.migrationSourceRef, "verified separately applied database required");
  const git = gitAt(repositoryRoot);
  requireValue(git(["status", "--porcelain", "--untracked-files=no"]).length === 0, "candidate tracked files changed");
  git(["merge-base", "--is-ancestor", liveSha, releaseSha]);
  const actualFiles = git(["diff", "--name-only", "--no-renames", "-z", liveSha, releaseSha]).toString().split("\0").filter(Boolean);
  const digests = Object.fromEntries(Object.keys(review.files).map(path => [path, [liveSha, releaseSha].map(ref => git(["ls-tree", ref, "--", path]).length ? hash(git(["show", `${ref}:${path}`])) : null)]));
  assertAiNutritionSource({ review, liveSha, releaseSha, files, actualFiles, digests });
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
  await assertAiNutritionDisabled(adapter);
  const observed = await captureAiNutritionDatabaseEvidence(adapter);
  requireValue(isDeepStrictEqual(observed.target, before.target) && isDeepStrictEqual(observed.target, authority.target), "database target drift");
  requireValue(isDeepStrictEqual(observed.ledger, databasePlan.applied), "database ledger changed after verification");
  requireValue(observed.receiptSha256 === before.receiptSha256 && observed.immutableScope === before.immutableScope
    && observed.immutableScope === authority.immutableScopeHash && observed.marketingPostimage === before.marketingPostimage
    && observed.rowsSha256 === before.rowsSha256, "marketing data or authority boundary changed");
  assertAiNutritionScopePreserved(before.scopeFunctions, observed.scopeFunctions, review.expectedScopeFunctions);
  requireValue(await adapter.query(BETA_ALIASES_UNROUTED_SQL) === "t", "historical owner-only aliases became routed");
  return { readiness: inherited, review: { schema: "homecook.prelaunch-ai-nutrition-source-review.v1", observedAt: new Date().toISOString(), liveSha, releaseSha,
    originalVerifiedAt: readiness.verified_at, proofDigests, sources: review.files, protectedSources: review.protectedSources,
    migrationSourceRef: review.migrationSourceRef, migrationCount: observed.ledger.length,
    reviewManifestSha256: AI_NUTRITION_REVIEW_PIN.sha256, preApplyProofSha256: review.preApplyProof.sha256,
    receiptSha256: observed.receiptSha256, immutableScope: observed.immutableScope, marketingPostimage: observed.marketingPostimage,
    rowsSha256: observed.rowsSha256, aiRuntimeGate: "disabled", scopeFunctions: observed.scopeFunctions, aliasesUnrouted: true, providerReverified: false, databaseWrites: false } };
}
