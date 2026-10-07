/** One reviewed rollout; never a general protected-source waiver. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { inheritRound2Readiness } from './prelaunch-web-deploy.mjs';
import { createRecordingDockerAdapter, readPrivateJson, privatePath, IMMUTABLE_SCOPE_SQL, POSTIMAGE_SQL, LEDGER_VALID_SQL } from './marketing-round2-controlled-deploy.mjs';
const FROM = '5c140caea3ce1d0ad7a22fae29bf19e1b3a18f08';
const TO = '5d9c5b09624dff83b43d91983704cec3171087da';
const PINS = Object.freeze({
  'app/globals.css': ['be910b57e5f311b57504063c8ac9f07d9f34074c641f4236f5c8cea25b8b285e', '8cfef7a9a80d3d81c54a6a19467ce5e16aa2618269cf8d3bb19425ca0412a8b4'],
  'supabase/migrations/20260919000000_prelaunch_recipe_meal_log_repairs.sql': [null, 'd0d0c8024ba53a9f6667614df38ab8e38d53d84c5f58997ba4dd22cf0b44ab50'],
  'supabase/migrations/20260919001000_ingredient_search_normalization.sql': [null, '4874649dae509a398109b73002fd76d9ccc11f2372f0b413bf0bec6df45fcf66'],
  'supabase/migrations/20260919002000_manual_recipe_create_recovery.sql': [null, '3c4c7ba3b3d63ba1ed85bf15dfbecf0636e6be99dddd26b99693d2849723a212'],
});
const hash = value => createHash('sha256').update(value).digest('hex');
const requireValue = (value, message) => { if (!value) throw new Error(`Reviewed repair readiness: ${message}`); };
const WRAPPERS_SQL = `SELECT json_agg(json_build_object('name',p.proname,'source',p.prosrc,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'securityDefiner',p.prosecdef,'config',p.proconfig) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname LIKE 'verify_full_local_internal_scope%';`;
// Canonicalize only the original function's rename, retaining body, ACL, owner,
// dependencies and all marketing table/function metadata in the original hash.
const OLD_SCOPE = 'verify_full_local_internal_scope_pre_recipe_save';
const CANONICAL_POSTIMAGE_SQL = POSTIMAGE_SQL
  .replaceAll("p.proname='verify_full_local_internal_scope'", `p.proname='${OLD_SCOPE}'`)
  .replaceAll('p.proname,', `CASE WHEN p.proname='${OLD_SCOPE}' THEN 'verify_full_local_internal_scope' ELSE p.proname END,`)
  .replaceAll('pg_get_functiondef(p.oid)', `replace(pg_get_functiondef(p.oid),'FUNCTION private.${OLD_SCOPE}(', 'FUNCTION private.verify_full_local_internal_scope(')`);

export async function reviewedRepairReadiness({ readiness, previous, next, liveSha, releaseSha, files, databasePlan, repositoryRoot, configPath }) {
  requireValue(liveSha === FROM && releaseSha === TO, 'unreviewed source pair');
  requireValue(databasePlan && databasePlan.baselineRequired === false && Array.isArray(databasePlan.pending) && databasePlan.pending.length === 0, 'fresh verified database plan required');
  const git = args => execFileSync('git', ['-C', repositoryRoot, ...args], { maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  const actualFiles = git(['diff', '--name-only', '--no-renames', '-z', FROM, TO]).toString().split('\0').filter(Boolean).sort();
  requireValue(Array.isArray(files) && isDeepStrictEqual([...files].sort(), actualFiles), 'complete source diff required');
  for (const [path, [before, after]] of Object.entries(PINS)) {
    requireValue(files.includes(path), 'reviewed source missing');
    requireValue(hash(git(['show', `${TO}:${path}`])) === after, 'candidate source drift');
    if (before) requireValue(hash(git(['show', `${FROM}:${path}`])) === before, 'previous source drift');
    else requireValue(git(['ls-tree', FROM, '--', path]).length === 0, 'migration unexpectedly existed');
    if (path.startsWith('supabase/')) {
      const name = path.split('/').at(-1);
      requireValue(databasePlan.applied.some(row => row.filename === name && row.sha256 === after), 'applied migration digest mismatch');
    }
  }
  // The exact CSS only changes recipebook note wrapping and mobile wave1 header
  // selectors. All remaining protected files are still checked by inheritance.
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
  const inherited = inheritRound2Readiness({ readiness, previous, next: { ...next, EnvironmentVariables: environment }, liveSha, releaseSha, files: files.filter(path => !Object.hasOwn(PINS, path)), databaseDeployment: false });
  const proofDigests = {};
  for (const [key, value] of [...Object.entries(readiness.proofs), ...Object.entries(readiness.proxy).filter(([, value]) => value && typeof value === 'object')]) {
    await privatePath(value.path);
    requireValue(hash(readFileSync(value.path)) === value.sha256, 'original proof changed');
    proofDigests[key] = value.sha256;
  }
  const authority = await readPrivateJson(readiness.proofs.db_authority.path);
  const adapter = await createRecordingDockerAdapter({ configPath, backupDirectory: dirname(previous.EnvironmentVariables.MUMEOK_ROUND2_READINESS_PATH) });
  requireValue(isDeepStrictEqual(await adapter.inspect(), authority.target), 'database target drift');
  requireValue(await adapter.query(LEDGER_VALID_SQL) === 't', 'R2 ledger authority drift');
  const receipt = JSON.parse(await adapter.query('SELECT receipt FROM marketing_round2_deploy.receipt WHERE singleton;'));
  const immutableScope = await adapter.query(IMMUTABLE_SCOPE_SQL);
  requireValue(immutableScope === authority.immutableScopeHash && immutableScope === receipt.immutableScopeHash, 'immutable authority drift');
  const postimage = await adapter.query(CANONICAL_POSTIMAGE_SQL);
  requireValue(postimage === receipt.postimage && postimage === '69461f22449ca1cd23848f486d8a388a9b0959e43c2e2c9889d39b98b63742ae', 'marketing catalog changed');
  const wrappers = JSON.parse(await adapter.query(WRAPPERS_SQL));
  const wrapperSha256 = hash(JSON.stringify(wrappers));
  requireValue(wrapperSha256 === '720fa17cc691897fae03ebe06cf70e5b877fd261e75c8796b7a0a2d7ca3238e6', 'reviewed scope chain changed');
  return { readiness: inherited, review: { schema: 'homecook.prelaunch-repair-readiness-review.v1', observedAt: new Date().toISOString(), liveSha, releaseSha, originalVerifiedAt: readiness.verified_at, proofDigests, sources: PINS, immutableScope, canonicalMarketingPostimage: postimage, wrapperSha256, providerReverified: false, databaseWrites: false } };
}
