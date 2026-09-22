/** Reviewed September beta rollout only; ordinary R2 inheritance remains closed. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { inheritRound2Readiness } from './prelaunch-web-deploy.mjs';
import { createRecordingDockerAdapter, readPrivateJson, privatePath, IMMUTABLE_SCOPE_SQL, POSTIMAGE_SQL, LEDGER_VALID_SQL } from './marketing-round2-controlled-deploy.mjs';

export const BETA_SOURCE = Object.freeze({
  from: '6fa49be6ac55d77a6537d097cf872dba785e0533',
  to: '3f1fc55038f7e172ec052cda2b8a802808e1d64e',
});
export const BETA_SOURCE_PINS = Object.freeze({
  'lib/supabase/server.ts': ['5eac87904f7348f134cb2fdf9ad5ae937ccf22ae4ee631f314c00a9eb564c55b', 'de08239c8f8d69a73fe2abb185d29b3f5a80bcaf9bce49d51a7d70246f96ff35'],
  'package.json': ['a918dd81abef6318e21434143f120948d99bbc75720449a38a078c2f1c8967aa', '7b4ea063a9b1eaeb905ae7ebd1ff6c36ee82ffc1ba158615fd5af5962cf7dfcd'],
  'supabase/migrations/20260919100000_ingredient_representative_links.sql': [null, '9689e8f6d66c97eec8861c589be6e61ef5d411acbaeeae7a5ea52c9ea3181f70'],
  'supabase/migrations/20260922000000_youtube_catalog_after_ingredient_search.sql': [null, '6fdf618b6cb1a3d3782ae479d4e74ff73eb2c9233b744f714ed6718e6d8e6d1e'],
  'supabase/migrations/20260922010000_youtube_fractional_quantity.sql': [null, '88efe3d37ee82cfd9053a2202a1a246fc17d3a6324fe44dfa6c3b0796bb7e384'],
  'supabase/migrations/20260922020000_recipe_product_selection.sql': [null, '5d80ac1c5b5a2aad3d2402128704249b70eea0e105f2f9af4f71b5cb021062e5'],
  'supabase/migrations/20260922021000_recipe_product_nutrition.sql': [null, 'aaf6f7108606cfac33ee5822633279e0d9574bb680e41a9b282576841e47b07a'],
  'supabase/migrations/20260922023000_meal_log_catalog_identity.sql': [null, '22ef1174d92d28bd2ab9a212fea84c849e099615da436a7b4207a6497a7ed4e9'],
  'supabase/migrations/20260922024000_recipe_product_cook_mode_display.sql': [null, '8733f1cc622819cb96c2f934c4f9882825db631b12e12bf80fd4360024b80ade'],
});

// Fresh migration replay is the baseline. Existing production-only protection is
// retained only when its exact bytes also exist in the pre-change backup proof.
const EXPECTED_BASELINE_WRAPPER_SHA256 = '02fd2c881ab01135ce3d201ff604688502b31a68e59e6afc591f18219fc996d3';
const EXPECTED_WRAPPER_SHA256 = '9b1c2333b0ea375a30e881372d50e43ae1911ef30c8045cb95dfeba4d6174580';
const PRIOR_SCOPE_EVIDENCE = join(homedir(), '.homecook/operations/beta-rollout-20260922-ACzBhd/backup-scope-functions.json');
const PRIOR_SCOPE_EVIDENCE_SHA256 = '0e865236506409aba6d8a445bc2072b0ddc018ca62ecb3d6a970a26e29039283';
const PRIOR_SCOPE_PROVENANCE = join(dirname(PRIOR_SCOPE_EVIDENCE), 'backup-scope-functions-provenance.json');
const PRIOR_SCOPE_PROVENANCE_SHA256 = 'fa9537a75c23a16c585aaf2aacbdaccba1ac42d176b96e7dbafd99c754685a2c';
const PRIOR_BACKUP_SHA256 = '7e4ef478fcba7cdcf8ab3d3a17593422bd153bbefb32049d6ba7357fac640813';
const PRIOR_SCHEMA_SHA256 = '72a7d6b081003b8fdf307ab3a60b17c66c214e0d990856bf65dc2f3663bc2e86';
const PRIOR_SCOPE_PINS = Object.freeze({
  verify_full_local_internal_scope_pre_legacy_compat: 'd1df060858a48d3c3e207c735ca9bfbf29a1e0a2912bafcacebe1724c4777abb',
  verify_full_local_internal_scope_without_production_scan: '7f697a02e959edac6068271d5fc11cde27c1d3943003136e2b471d067c5418bc',
  verify_full_local_internal_scope_without_recipe_book_projection: 'a8f9ee01e13bf0910a7b9af9ee8d733df426fb5a6b6899e0dbc5b6a059b0d25c',
});
const HISTORICAL_ALIASES = Object.keys(PRIOR_SCOPE_PINS).filter(name => name.includes('_without_'));
const NULL_SCOPE_DENIAL = "  -- NULL must not turn the existing allow-list denial into SQL UNKNOWN.\n  if v_scope is null or v_scope = '' then\n    raise exception 'ACCOUNT_SESSION_STALE' using errcode = '55000';\n  end if;\n\n";
const EXPECTED_RECEIPT_SHA256 = '318386724ab446c274724cb26acfce5a14de65d4d87b408c6a225ce39739e05e';
const EXPECTED_IMMUTABLE_SCOPE = '5ba5a5ebd0ef24ed1417bead3239a7be1ab57f00bf9fa0419b0b6d87df953a3c';
const EXPECTED_MARKETING_POSTIMAGE = '69461f22449ca1cd23848f486d8a388a9b0959e43c2e2c9889d39b98b63742ae';
const PROOF_KEYS = ['db_authority', 'db_migration', 'operator_approval', 'privacy_consent', 'retention_runbook', 'turnstile_live'];
const PROXY_KEYS = ['direct_access_denial', 'header_overwrite', 'launch_binding'];
const hash = value => createHash('sha256').update(value).digest('hex');
const requireValue = (value, message) => { if (!value) throw new Error(`Reviewed beta readiness: ${message}`); };
export const BETA_WRAPPERS_SQL = `SELECT json_agg(json_build_object('name',p.proname,'source',p.prosrc,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'securityDefiner',p.prosecdef,'config',p.proconfig) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname LIKE 'verify_full_local_internal_scope%';`;
export const BETA_ALIASES_UNROUTED_SQL = `SELECT
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('private','public')
      AND p.proname NOT IN ('verify_full_local_internal_scope_without_production_scan','verify_full_local_internal_scope_without_recipe_book_projection')
      AND (strpos(p.prosrc,'verify_full_local_internal_scope_without_production_scan')>0
        OR strpos(p.prosrc,'verify_full_local_internal_scope_without_recipe_book_projection')>0)
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_db_role_setting s CROSS JOIN LATERAL unnest(s.setconfig) setting
    WHERE setting LIKE 'pgrst.db_pre_request=%'
      AND (strpos(setting,'verify_full_local_internal_scope_without_production_scan')>0
        OR strpos(setting,'verify_full_local_internal_scope_without_recipe_book_projection')>0)
  );`;
const OLD_SCOPE = 'verify_full_local_internal_scope_pre_recipe_save';
export const BETA_CANONICAL_POSTIMAGE_SQL = POSTIMAGE_SQL
  .replaceAll("p.proname='verify_full_local_internal_scope'", `p.proname='${OLD_SCOPE}'`)
  .replaceAll('p.proname,', `CASE WHEN p.proname='${OLD_SCOPE}' THEN 'verify_full_local_internal_scope' ELSE p.proname END,`)
  .replaceAll('pg_get_functiondef(p.oid)', `replace(pg_get_functiondef(p.oid),'FUNCTION private.${OLD_SCOPE}(', 'FUNCTION private.verify_full_local_internal_scope(')`);

export function assertBetaSource({ liveSha, releaseSha, files, actualFiles, digests, databasePlan, databaseDeployment }) {
  requireValue(liveSha === BETA_SOURCE.from && releaseSha === BETA_SOURCE.to, 'unreviewed source pair');
  requireValue(databaseDeployment === false, 'database must already be applied');
  requireValue(databasePlan?.baselineRequired === false && Array.isArray(databasePlan.pending) && databasePlan.pending.length === 0 && Array.isArray(databasePlan.applied), 'fresh verified database plan required');
  requireValue(Array.isArray(files) && isDeepStrictEqual([...files].sort(), [...actualFiles].sort()), 'complete source diff required');
  for (const [path, expected] of Object.entries(BETA_SOURCE_PINS)) {
    requireValue(files.includes(path) && isDeepStrictEqual(digests[path], expected), 'reviewed source digest mismatch');
    if (path.startsWith('supabase/')) {
      requireValue(databasePlan.applied.some(row => row.filename === path.split('/').at(-1) && row.sha256 === expected[1]), 'applied migration digest mismatch');
    }
  }
}

function assertBetaBaselineChain(wrappers) {
  const wrapperSha256 = hash(JSON.stringify(wrappers));
  requireValue(wrapperSha256 === EXPECTED_BASELINE_WRAPPER_SHA256, 'reviewed scope chain digest mismatch');
  const delegates = {
    verify_full_local_internal_scope: 'verify_full_local_internal_scope_pre_product_nutrition_20260922',
    verify_full_local_internal_scope_pre_product_nutrition_20260922: 'verify_full_local_internal_scope_pre_manual_recovery_20260919',
    verify_full_local_internal_scope_pre_manual_recovery_20260919: 'verify_full_local_internal_scope_prelaunch_20260919',
    verify_full_local_internal_scope_prelaunch_20260919: 'verify_full_local_internal_scope_pre_legacy_leftover_meal_log',
    verify_full_local_internal_scope_pre_legacy_leftover_meal_log: OLD_SCOPE,
    [OLD_SCOPE]: 'verify_full_local_internal_scope_pre_legacy_compat',
    verify_full_local_internal_scope_pre_legacy_compat: null,
  };
  requireValue(Array.isArray(wrappers) && isDeepStrictEqual(wrappers.map(row => row.name).sort(), Object.keys(delegates).sort()), 'scope chain names changed');
  for (const row of wrappers) {
    requireValue(row.owner === 'postgres' && row.securityDefiner === true && isDeepStrictEqual(row.config, ['search_path=pg_catalog, public, private, pg_temp']), 'scope chain authority changed');
    const delegate = delegates[row.name];
    if (delegate) requireValue(row.source.includes(`perform private.${delegate}();`), 'original authority delegate missing');
  }
  return wrapperSha256;
}

export function assertBetaWrapperChain(wrappers, backupProof) {
  requireValue(backupProof?.format === 'homecook-backup-scope-functions-v1' && backupProof.archive_authenticated === true && backupProof.archive_sha256 === PRIOR_BACKUP_SHA256 && backupProof.schema_sha256 === PRIOR_SCHEMA_SHA256 && backupProof.metadata_schema_sha256 === PRIOR_SCHEMA_SHA256, 'pre-change backup scope proof required');
  requireValue(Array.isArray(backupProof.functions) && isDeepStrictEqual(backupProof.functions.map(row => row.name).sort(), Object.keys(PRIOR_SCOPE_PINS).sort()), 'pre-change backup scope set mismatch');
  requireValue(Array.isArray(wrappers) && wrappers.length === 9 && new Set(wrappers.map(row => row.name)).size === 9, 'scope chain names changed');
  for (const [name, expected] of Object.entries(PRIOR_SCOPE_PINS)) {
    const extracted = backupProof.functions.find(row => row.name === name);
    const prior = Object.fromEntries(['name', 'source', 'owner', 'acl', 'securityDefiner', 'config'].map(key => [key, extracted[key]]));
    const current = wrappers.find(row => row.name === name);
    requireValue(hash(JSON.stringify(prior)) === expected && isDeepStrictEqual(current, prior), 'prior scope bytes or authority changed');
    requireValue(current.owner === 'postgres' && isDeepStrictEqual(current.acl, ['postgres=X/postgres']), 'prior scope must remain owner-only');
  }
  const normalized = wrappers.filter(row => !HISTORICAL_ALIASES.includes(row.name)).map(row => {
    requireValue(!HISTORICAL_ALIASES.some(name => row.source.includes(name)), 'historical alias entered active scope chain');
    if (row.name !== 'verify_full_local_internal_scope_pre_legacy_compat') return row;
    requireValue(row.source.split(NULL_SCOPE_DENIAL).length === 2, 'exact existing NULL denial required');
    // This is only an in-memory comparison. Never rewrite the actual stronger guard.
    return { ...row, source: row.source.replace(NULL_SCOPE_DENIAL, '') };
  });
  assertBetaBaselineChain(normalized);
  const wrapperSha256 = hash(JSON.stringify(wrappers));
  requireValue(wrapperSha256 === EXPECTED_WRAPPER_SHA256, 'reviewed production scope chain digest mismatch');
  return wrapperSha256;
}

export async function reviewedBetaReadiness({ readiness, previous, next, liveSha, releaseSha, files, databasePlan, databaseDeployment, repositoryRoot, configPath }) {
  // Reject an unrelated release before opening proofs or the database.
  requireValue(liveSha === BETA_SOURCE.from && releaseSha === BETA_SOURCE.to, 'unreviewed source pair');
  const git = args => execFileSync('git', ['-C', repositoryRoot, ...args], { maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  requireValue(git(['rev-parse', 'HEAD']).toString().trim() === releaseSha && next.WorkingDirectory === repositoryRoot, 'candidate checkout identity mismatch');
  requireValue(git(['status', '--porcelain', '--untracked-files=no']).length === 0, 'candidate tracked files changed');
  git(['merge-base', '--is-ancestor', liveSha, releaseSha]);
  const actualFiles = git(['diff', '--name-only', '--no-renames', '-z', liveSha, releaseSha]).toString().split('\0').filter(Boolean);
  const digests = Object.fromEntries(Object.keys(BETA_SOURCE_PINS).map(path => [path, [
    git(['ls-tree', liveSha, '--', path]).length ? hash(git(['show', `${liveSha}:${path}`])) : null,
    hash(git(['show', `${releaseSha}:${path}`])),
  ]]));
  assertBetaSource({ liveSha, releaseSha, files, actualFiles, digests, databasePlan, databaseDeployment });

  const environment = { ...next.EnvironmentVariables };
  const bindings = {
    MUMEOK_ROUND2_RELEASE_SHA: releaseSha,
    MUMEOK_ROUND2_REPOSITORY_ROOT: next.WorkingDirectory,
    MUMEOK_ROUND2_READINESS_PATH: join(dirname(next.WorkingDirectory), 'round2-readiness.json'),
  };
  for (const [key, target] of Object.entries(bindings)) {
    requireValue(environment[key] === previous.EnvironmentVariables[key] || environment[key] === target, 'unexpected staged readiness binding');
    environment[key] = previous.EnvironmentVariables[key];
  }
  const inherited = inheritRound2Readiness({ readiness, previous, next: { ...next, EnvironmentVariables: environment }, liveSha, releaseSha, files: files.filter(path => !Object.hasOwn(BETA_SOURCE_PINS, path)), databaseDeployment: false });
  requireValue(isDeepStrictEqual(Object.keys(readiness.proofs ?? {}).sort(), PROOF_KEYS), 'original proof set changed');
  const proxyProofs = Object.entries(readiness.proxy ?? {}).filter(([, value]) => value && typeof value === 'object');
  requireValue(isDeepStrictEqual(proxyProofs.map(([key]) => key).sort(), PROXY_KEYS), 'original ingress proof set changed');
  const proofDigests = {};
  for (const [key, value] of [...Object.entries(readiness.proofs), ...proxyProofs]) {
    requireValue(typeof value.path === 'string' && /^[a-f0-9]{64}$/u.test(value.sha256), 'invalid original proof');
    await privatePath(value.path);
    requireValue(hash(readFileSync(value.path)) === value.sha256, 'original proof changed');
    proofDigests[key] = value.sha256;
  }
  const authority = await readPrivateJson(readiness.proofs.db_authority.path);
  const adapter = await createRecordingDockerAdapter({ configPath, backupDirectory: dirname(previous.EnvironmentVariables.MUMEOK_ROUND2_READINESS_PATH) });
  requireValue(isDeepStrictEqual(await adapter.inspect(), authority.target), 'database target drift');
  requireValue(await adapter.query(LEDGER_VALID_SQL) === 't', 'R2 ledger authority drift');
  const receipt = JSON.parse(await adapter.query('SELECT receipt FROM marketing_round2_deploy.receipt WHERE singleton;'));
  const receiptSha256 = hash(JSON.stringify(receipt));
  requireValue(receiptSha256 === EXPECTED_RECEIPT_SHA256, 'original R2 receipt changed');
  const immutableScope = await adapter.query(IMMUTABLE_SCOPE_SQL);
  requireValue(immutableScope === authority.immutableScopeHash && immutableScope === receipt.immutableScopeHash && immutableScope === EXPECTED_IMMUTABLE_SCOPE, 'immutable authority drift');
  const postimage = await adapter.query(BETA_CANONICAL_POSTIMAGE_SQL);
  requireValue(postimage === receipt.postimage && postimage === EXPECTED_MARKETING_POSTIMAGE, 'marketing catalog changed');
  await privatePath(PRIOR_SCOPE_EVIDENCE);
  const priorScopeBytes = readFileSync(PRIOR_SCOPE_EVIDENCE);
  requireValue(hash(priorScopeBytes) === PRIOR_SCOPE_EVIDENCE_SHA256, 'pre-change backup evidence changed');
  const priorScopeProof = JSON.parse(priorScopeBytes.toString('utf8'));
  await privatePath(PRIOR_SCOPE_PROVENANCE);
  const provenanceBytes = readFileSync(PRIOR_SCOPE_PROVENANCE);
  requireValue(hash(provenanceBytes) === PRIOR_SCOPE_PROVENANCE_SHA256, 'backup provenance evidence changed');
  const provenance = JSON.parse(provenanceBytes.toString('utf8'));
  requireValue(provenance.function_evidence_sha256 === PRIOR_SCOPE_EVIDENCE_SHA256 && provenance.authenticated_archive_sha256 === PRIOR_BACKUP_SHA256 && provenance.authenticated_schema_sha256 === PRIOR_SCHEMA_SHA256 && provenance.restore_source_archive_matches === true && provenance.restore_source_schema_matches === true, 'backup restoration provenance mismatch');
  const wrappers = JSON.parse(await adapter.query(BETA_WRAPPERS_SQL));
  const wrapperSha256 = assertBetaWrapperChain(wrappers, priorScopeProof);
  requireValue(await adapter.query(BETA_ALIASES_UNROUTED_SQL) === 't', 'historical scope aliases became routed');
  return { readiness: inherited, review: { schema: 'homecook.prelaunch-beta-readiness-review.v1', observedAt: new Date().toISOString(), liveSha, releaseSha, originalVerifiedAt: readiness.verified_at, proofDigests, sources: BETA_SOURCE_PINS, immutableScope, canonicalMarketingPostimage: postimage, wrapperSha256, baselineWrapperSha256: EXPECTED_BASELINE_WRAPPER_SHA256, priorScopeEvidenceSha256: PRIOR_SCOPE_EVIDENCE_SHA256, priorScopeProvenanceSha256: PRIOR_SCOPE_PROVENANCE_SHA256, backupSha256: PRIOR_BACKUP_SHA256, aliasesUnrouted: true, receiptSha256, providerReverified: false, databaseWrites: false } };
}
