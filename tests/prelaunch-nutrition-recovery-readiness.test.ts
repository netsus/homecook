import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  NUTRITION_RECOVERY_FROM, NUTRITION_RECOVERY_CATALOG, NUTRITION_RECOVERY_MIGRATIONS,
  assertNutritionRecoveryReview, assertNutritionRecoveryReviewPin, assertNutritionRecoveryMigrationTransition,
  assertNutritionRecoverySelection, assertNutritionRecoveryYoutube, assertNutritionRecoveryAuthority,
  assertNutritionRecoveryPreservation, nutritionRecoveryDatabaseState, verifyNutritionRecoveryWorker,
} from '../scripts/lib/prelaunch-nutrition-recovery-readiness.mjs';
import { parsePrelaunchOptions, assertDatabaseRollbackCompatible } from '../scripts/lib/prelaunch-web-deploy.mjs';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const pinned = (name: string) => ({path:`/private/${name}`,sha256:hash(name)});
const migrations = () => [{filename:NUTRITION_RECOVERY_MIGRATIONS[0],sha256:hash('migration')}];
const ledger = () => Array.from({length:215},(_,index) => ({filename:`${String(index).padStart(14,'0')}_old.sql`,sha256:hash(String(index))}));
const selection = (body = 'old') => ({signature:'public.is_selectable_catalog_ingredient(uuid)',definitionSha256:hash(body),
  owner:'supabase_admin',acl:['postgres=X/supabase_admin','supabase_admin=X/supabase_admin','youtube_extraction_worker_rpc_owner=X/supabase_admin'],
  config:['search_path=pg_catalog, pg_temp'],securityDefiner:false,volatility:'i',parallel:'s'});
const youtube = () => ({readiness:{ready:true,catalog_fingerprint:NUTRITION_RECOVERY_CATALOG,release_sha:NUTRITION_RECOVERY_FROM},
  policy:{enabled:true,policy_version:3},credential:{generation:8,releaseSha:NUTRITION_RECOVERY_FROM,rowSha256:hash('credential'),expiresAt:'2099-01-01T00:00:00Z'},aiSettingsSha256:hash('disabled')});
const worker = () => ({role:{name:'youtube_extraction_worker_rpc_owner',superuser:false,inherit:false,bypassRls:false,canLogin:false},
  rlsEnabled:true,tableSelect:false,tableWrite:false,privateEvidenceSelect:false,
  columns:['ingredient_id','presentation','representative_ingredient_id'].map(name => ({name,select:true,write:false})),
  policies:[{name:'ingredient_catalog_alias_worker_read',command:'r',permissive:true,roles:['youtube_extraction_worker_rpc_owner'],appliesToWorker:true,using:"(presentation = 'alias'::text)",check:null}]});
const floor = () => ({releaseSha:NUTRITION_RECOVERY_FROM,ledgerCount:215,catalogFingerprint:NUTRITION_RECOVERY_CATALOG,backwardCompatible:false,receipt:pinned('old-215-receipt'),reason:'older workers are incompatible'});
function review() {
  return {schema:'homecook.prelaunch-nutrition-recovery-review.v1',from:NUTRITION_RECOVERY_FROM,to:'b'.repeat(40),migrationSourceRef:'c'.repeat(40),
    previousMigrationCount:215,migrationCount:216,migrations:migrations(),originalReadinessSha256:hash('readiness'),
    proofDigests:Object.fromEntries(['db_authority','db_migration','operator_approval','privacy_consent','retention_runbook','turnstile_live','direct_access_denial','header_overwrite','launch_binding'].map(name => [name,hash(name)])),
    files:{'lib/ingredient-catalog-policy.ts':[hash('old'),hash('new')],...Object.fromEntries(migrations().map(row => [`supabase/migrations/${row.filename}`,[null,row.sha256]]))},
    protectedSources:migrations().map(row => `supabase/migrations/${row.filename}`),preApplyProof:pinned('before'),preservationProof:pinned('preserved'),databaseReceipt:pinned('new-216-receipt'),
    expectedSelectionFunction:selection('new'),previousDatabaseStateSha256:hash(JSON.stringify(floor())),
    workerPlist:pinned('worker.plist'),workerService:'gui/501/kr.mumeok.worker',workerArtifacts:['descriptor','schema','manifest'].map(pinned),
    workerEnvironment:{HOMECOOK_YOUTUBE_EXTRACTION_APP_DESCRIPTOR_PATH:'/private/descriptor',HOMECOOK_YOUTUBE_EXTRACTION_EXPECTED_SCHEMA_PATH:'/private/schema',HOMECOOK_YOUTUBE_EXTRACTION_WORKER_MANIFEST_PATH:'/private/manifest'}};
}
const states = () => {
  const before = {schema:'homecook.prelaunch-nutrition-recovery-db-before.v1',ledger:ledger(),target:{container:'exact'},receiptSha256:hash('receipt'),immutableScope:hash('scope'),marketingPostimage:hash('marketing'),rowsSha256:hash('rows'),
    scopeFunctions:[{name:'scope',bodySha256:hash('scope')}],anonymousFunctions:[{name:'anon',bodySha256:hash('anon')}],workerPrivileges:worker(),pieceFunctions:[{signature:'piece',bodySha256:hash('piece')}],selectionFunction:selection(),youtube:youtube()};
  return {before,after:{...structuredClone(before),ledger:[...ledger(),...migrations()],selectionFunction:selection('new')}};
};
const preservation = () => ({schema:'homecook.nutrition-recovery-preservation.v1',verified:true,migrationSourceRef:review().migrationSourceRef,migration:migrations()[0],
  before:{originalNutrition:hash('nutrition'),historicalRecords:hash('history')},after:{originalNutrition:hash('nutrition'),historicalRecords:hash('history')},
  operations:[{planSha256:hash('plan'),sqlSha256:hash('sql'),postimageVerified:true,unreviewedChanges:0}]});

describe('reviewed nutrition recovery', () => {
  it('requires exact ref, separately applied DB, config, and an exclusive review mode', () => {
    const args = ['--reviewed-nutrition-recovery-readiness','--already-applied-db','--db-config','/private/db','--reviewed-ref','b'.repeat(40)];
    expect(parsePrelaunchOptions(args)).toMatchObject({reviewedNutritionRecoveryReadiness:true});
    expect(() => parsePrelaunchOptions(args.filter(value => value !== '--already-applied-db'))).toThrow('already-applied-db');
    expect(() => parsePrelaunchOptions(args.slice(0,-2))).toThrow('reviewed-ref');
    expect(() => parsePrelaunchOptions(args.filter(value => !['--db-config','/private/db'].includes(value)))).toThrow('db-config');
    for (const flag of ['--reviewed-youtube-resolution-readiness','--reviewed-piece-unit-readiness','--reviewed-ingredient-search-readiness','--reviewed-ai-nutrition-readiness','--reviewed-youtube-trial-readiness','--reviewed-feedback-readiness','--reviewed-repair-readiness','--reviewed-beta-readiness']) {
      expect(() => parsePrelaunchOptions([...args,flag])).toThrow('함께');
    }
  });
  it('fails closed without immutable private pins', () => {
    expect(() => assertNutritionRecoveryReviewPin({path:null,sha256:null})).toThrow('not configured');
    expect(() => assertNutritionRecoveryReviewPin(pinned('review'))).not.toThrow();
    expect(() => assertNutritionRecoveryReview(review())).not.toThrow();
    expect(() => assertNutritionRecoveryReview({...review(),from:'a'.repeat(40)})).toThrow('source pair');
    expect(() => assertNutritionRecoveryReview({...review(),databaseReceipt:{path:'relative',sha256:hash('x')}})).toThrow('databaseReceipt');
  });
  it('does not allow migration, runtime or infrastructure scope expansion', () => {
    for (const path of ['infra/worker.yml','lib/server/youtube-i031-runtime/bundle/config.json','scripts/manifests/youtube-extraction-expected-schema.json','supabase/migrations/20261010130000_extra.sql']) {
      const r=review(); expect(() => assertNutritionRecoveryReview({...r,files:{...r.files,[path]:[null,hash(path)]}})).toThrow();
    }
    expect(() => assertNutritionRecoveryReview({...review(),migrationCount:217})).toThrow('215-to-216');
    expect(() => assertNutritionRecoveryReview({...review(),workerEnvironment:{}})).toThrow('environment pins');
    expect(() => assertNutritionRecoveryReview({...review(),previousDatabaseStateSha256:''})).toThrow('DB floor');
  });
  it('preserves all 215 predecessor migrations and permits precisely one addition', () => {
    expect(() => assertNutritionRecoveryMigrationTransition(ledger(),[...ledger(),...migrations()],migrations())).not.toThrow();
    const source=[...ledger(),...migrations()]; source[0].sha256=hash('tamper');
    expect(() => assertNutritionRecoveryMigrationTransition(ledger(),source,migrations())).toThrow('predecessor');
    expect(() => assertNutritionRecoveryMigrationTransition(ledger(),[...ledger(),...migrations(),...migrations()],migrations())).toThrow('ledger');
  });
  it('permits only the selection body change, preserving exact ownership and rights', () => {
    expect(() => assertNutritionRecoverySelection(selection(),selection('new'),selection('new'))).not.toThrow();
    for (const change of [{owner:'postgres'},{securityDefiner:true},{acl:['anon=X/supabase_admin']},{config:['search_path=public']},{parallel:'u'}]) {
      const altered={...selection('new'),...change};
      expect(() => assertNutritionRecoverySelection(selection(),altered,altered)).toThrow('authority');
    }
    expect(() => assertNutritionRecoverySelection(selection(),selection(),selection())).toThrow('not replaced');
    expect(() => assertNutritionRecoverySelection(selection(),selection('wrong'),selection('new'))).toThrow('postimage');
  });
  it('rejects catalog drift, expired credentials and any policy or AI-setting mutation', () => {
    const before=youtube(); expect(() => assertNutritionRecoveryYoutube(before)).not.toThrow();
    for (const after of [ {...before,readiness:{...before.readiness,ready:false}}, {...before,readiness:{...before.readiness,catalog_fingerprint:hash('wrong')}},
      {...before,credential:{...before.credential,expiresAt:'2000-01-01T00:00:00Z'}}, {...before,credential:{...before.credential,generation:9}},
      {...before,policy:{...before.policy,enabled:false}}, {...before,aiSettingsSha256:hash('enabled')} ]) {
      expect(() => assertNutritionRecoveryYoutube(after,before)).toThrow();
    }
  });
  it.each(['target','receiptSha256','immutableScope','marketingPostimage','rowsSha256','scopeFunctions','anonymousFunctions','workerPrivileges','pieceFunctions'])('rejects preservation drift in %s', key => {
    const {before,after}=states();
    expect(() => assertNutritionRecoveryAuthority(before,after,review())).not.toThrow();
    expect(() => assertNutritionRecoveryAuthority(before,{...after,[key]:null},review())).toThrow(`${key} changed`);
  });
  it('rejects changed historical values or unverifiable/unreviewed data operations', () => {
    expect(() => assertNutritionRecoveryPreservation(preservation(),review())).not.toThrow();
    const proof=preservation();
    for (const bad of [{...proof,after:{...proof.after,historicalRecords:hash('tampered')}}, {...proof,after:{...proof.after,originalNutrition:hash('overwritten')}},
      {...proof,operations:[]},{...proof,operations:[{...proof.operations[0],unreviewedChanges:1}]}, {...proof,operations:[{...proof.operations[0],postimageVerified:false}]}]) {
      expect(() => assertNutritionRecoveryPreservation(bad,review())).toThrow('preservation');
    }
  });
  it('adds a separate 216 receipt without relabelling the original incompatible worker floor', () => {
    const r=review(); const prior=floor();const plan={applied:[...ledger(),...migrations()],pending:[],migrationSourceRef:r.migrationSourceRef};
    const result=nutritionRecoveryDatabaseState(prior,plan,r);
    expect(result.receipt).toEqual(prior.receipt);
    expect(result.ledgerCount).toBe(215);
    expect(result.backwardCompatible).toBe(false);
    expect(result.compatibleExtension.ledgerCount).toBe(216);
    expect(result.compatibleExtension.receipt).toEqual(r.databaseReceipt);
    expect(() => assertDatabaseRollbackCompatible(result,result)).toThrow('older workers');
    expect(() => nutritionRecoveryDatabaseState({...prior,ledgerCount:216},plan,r)).toThrow('floor changed');
    expect(() => nutritionRecoveryDatabaseState(prior,{...plan,applied:ledger()},r)).toThrow('DB216');
  });
  it('rechecks immutable installed worker artifacts, bindings and running service without changing file modes', async () => {
    const directory=mkdtempSync(join(realpathSync(tmpdir()),'nutrition-readiness-test-'));
    try {
      const r=review();
      const names=['worker.plist','descriptor','schema','manifest'];
      const pins=names.map(name => {
        const path=join(directory,name);writeFileSync(path,name,{mode:0o444});return {path,sha256:hash(name)};
      });
      r.workerPlist=pins[0];r.workerArtifacts=pins.slice(1);
      r.workerEnvironment={HOMECOOK_YOUTUBE_EXTRACTION_APP_DESCRIPTOR_PATH:pins[1].path,HOMECOOK_YOUTUBE_EXTRACTION_EXPECTED_SCHEMA_PATH:pins[2].path,HOMECOOK_YOUTUBE_EXTRACTION_WORKER_MANIFEST_PATH:pins[3].path};
      const plist={EnvironmentVariables:r.workerEnvironment};
      const launch=() => `path = ${pins[0].path}\nstate = running\npid = 123\n`;
      await expect(verifyNutritionRecoveryWorker(r,plist,plist,launch)).resolves.toBeUndefined();
      await expect(verifyNutritionRecoveryWorker(r,plist,plist,() => `path = ${pins[0].path}\nstate = waiting\n`)).rejects.toThrow('not running');
      await expect(verifyNutritionRecoveryWorker(r,plist,{EnvironmentVariables:{}},launch)).rejects.toThrow('binding');
      chmodSync(pins[1].path,0o600);writeFileSync(pins[1].path,'tampered');
      await expect(verifyNutritionRecoveryWorker(r,plist,plist,launch)).rejects.toThrow('bytes changed');
    } finally {rmSync(directory,{recursive:true,force:true});}
  });
  it('wires both preparation and immediate pre-swap rechecks without worker installer or SQL execution', () => {
    const deploy=readFileSync('scripts/deploy-prelaunch-web.mjs','utf8');
    expect(deploy).toContain('if (options.reviewedNutritionRecoveryReadiness) return verifyNutritionRecoveryAppliedDatabase');
    expect(deploy).toContain('else if (options.reviewedNutritionRecoveryReadiness || options.reviewedRepairReadiness');
    expect(deploy).toContain('const reviewedDatabase = nutritionRecoveryDatabase ??');
    const source=readFileSync('scripts/lib/prelaunch-nutrition-recovery-readiness.mjs','utf8');
    expect(source).toContain('captureAiNutritionDatabaseAfter(adapter)');
    expect(source).not.toContain('executeYoutubeResolutionWorkerInstall');
    expect(source).not.toContain('adapter.apply(');
  });
});
