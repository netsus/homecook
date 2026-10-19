import {after, test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,realpathSync} from 'node:fs';
import {isAbsolute,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import * as unbound from '../scripts/lib/cooking-experience-maintenance.mjs';
import {unchangedCookingCatalogSql,COOKING_CATALOG_SOURCE_URL} from '../scripts/lib/cooking-catalog-comparison.mjs';
import {createOwnedCookingReviewModule} from '../scripts/lib/cooking-maintenance-engine-regression.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const sha=value=>value.repeat(64),ref=value=>value.repeat(40);
const root=mkdtempSync(join(realpathSync('/tmp'),'hc-cooking-authority-test-'));
after(()=>rmSync(root,{recursive:true,force:true}));
const helperPath=join(root,'cooking.mjs'),webPath=join(root,'web.mjs'),dbPath=join(root,'db.mjs');
const productionPin=structuredClone(unbound.COOKING_EXPERIENCE_REVIEW_PIN);
const productionHelperSource=readFileSync('scripts/lib/cooking-experience-maintenance.mjs','utf8');
writeFileSync(helperPath,createOwnedCookingReviewModule(productionHelperSource));
after(()=>assert.deepEqual(unbound.COOKING_EXPERIENCE_REVIEW_PIN,productionPin));
function ownedImports(text){return text.replace(/from (["'])(\.\/[^"'\n]+)\1/gu,(_text,_quote,relative)=>{
 const file=relative==='./cooking-experience-maintenance.mjs'?helperPath:relative==='./prelaunch-web-deploy.mjs'?webPath:join(process.cwd(),'scripts/lib',relative);
 return `from "${pathToFileURL(file).href}"`;
});}
writeFileSync(webPath,ownedImports(readFileSync('scripts/lib/prelaunch-web-deploy.mjs','utf8')));
writeFileSync(dbPath,ownedImports(readFileSync('scripts/lib/prelaunch-database.mjs','utf8')));
const cooking=await import(pathToFileURL(helperPath).href),web=await import(pathToFileURL(webPath).href),db=await import(pathToFileURL(dbPath).href);
const images=JSON.parse(readFileSync('tests/fixtures/cooking-experience-maintenance-postimages.json','utf8'));
const raw=cooking.COOKING_EXPERIENCE_MIGRATIONS.map(row=>readFileSync(`supabase/migrations/${row.filename}`));
const payloads=raw.map((bytes,i)=>bytes.toString().slice(cooking.COOKING_EXPERIENCE_MIGRATIONS[i].prefix.length).replace(/^begin;\n/iu,'').replace(/\ncommit;\n$/iu,''));
const target={owned:true,containerId:'synthetic-no-operating-target'};
function fixture(){
 const before=Array.from({length:232},(_,index)=>({filename:`${20250000000000+index}_synthetic.sql`,sha256:sha('0')}));
 const pointer=name=>({path:join(root,name),sha256:sha('1')});
 const files=Object.fromEntries(cooking.COOKING_EXPERIENCE_MIGRATIONS.map(row=>[`supabase/migrations/${row.filename}`,[null,row.sha256]]));
 return {schema:'homecook.prelaunch-protected-rollout-review.v1',feature:cooking.COOKING_EXPERIENCE_FEATURE,from:ref('a'),to:ref('b'),
  approved:{database:true,reader:false,writerOn:false},databasePrecedesReader:true,readerPrecedesDatabase:false,legacyReaderCompatible:true,
  files,isolatedEvidence:pointer('isolated'),isolatedEvidenceSha256:sha('1'),legacyReaderEvidence:pointer('old-reader'),postimages:pointer('images'),
  platformInventory:pointer('platform'),backupReadiness:pointer('readiness'),closedArtifactSha256:sha('2'),historicalProofsSha256:sha('3'),controlSha256:sha('4'),closedReviewSha256:sha('5'),consentGeneration:1,
  legacyMarkerDatabasePlanSha256:sha('6'),legacyReader:{ref:ref('a'),buildId:'owned-old-build',plistSha256:sha('7')},
  predecessorMaintenance:{schema:'homecook.recipe-request-role-maintenance.v1',ledgerCount:232,reviewSha256:sha('9'),receipt:pointer('original232')},
  database:{before,after:[...before,...cooking.COOKING_EXPERIENCE_MIGRATIONS.map(({filename,sha256})=>({filename,sha256}))],
   migrations:cooking.COOKING_EXPERIENCE_MIGRATIONS.map((row,i)=>({filename:row.filename,rawSha256:row.sha256,payloadSha256:hash(payloads[i])})),
   configPath:join(root,'config'),configSha256:sha('0'),targetSha256:hash(JSON.stringify(target)),
   catalogMode:cooking.COOKING_CATALOG_MODE,canonicalCatalog:{before:{catalogSha256:sha('a'),immutableSha256:sha('b'),stableImmutableSha256:sha('c')},after:{catalogSha256:sha('d'),immutableSha256:sha('e'),stableImmutableSha256:sha('f')}},
   unchangedCatalogSha256:sha('e'),catalogComparison:{helperSha256:hash(readFileSync(new URL(COOKING_CATALOG_SOURCE_URL))),catalogQuerySha256:hash(db.PROTECTED_CATALOG_SQL),immutableQuerySha256:hash(db.PROTECTED_IMMUTABLE_CATALOG_SQL),stableImmutableQuerySha256:hash(db.COOKED_WEIGHT_STABLE_IMMUTABLE_SQL),unchangedQuerySha256:hash(unchangedCookingCatalogSql(db.PROTECTED_CATALOG_SQL))},
   beforeCatalogSha256:images.before.catalogSha256,afterCatalogSha256:images.after.catalogSha256,immutableSha256:images.before.immutableSha256,afterImmutableSha256:images.after.immutableSha256,stableImmutableSha256:images.after.stableImmutableSha256,
   normalProjectionSha256:hash(db.RECIPE_REQUEST_ROLE_NORMAL_DATA_SQL),executionTableAfterSha256:hash(JSON.stringify(images.after.executionTable)),
   cookingFunctionsBefore:structuredClone(images.before.cookingFunctions),cookingFunctionsAfter:structuredClone(images.after.cookingFunctions),
   workerBaseline:{credentialGeneration:50,workerPolicyEnabled:true,workerReleaseSha:ref('c'),schemaIdentity:'youtube-extraction-worker-schema-v2',catalogFingerprint:images.after.workerReadiness.catalog_fingerprint,credentialRowSha256:sha('a'),policyRowSha256:sha('b'),policyStableSha256:sha('c'),snapshotDigest:sha('d')}}};
}
function observation(review,after=false){const d=review.database;return {target,ledger:after?d.after:d.before,catalogSha256:after?d.afterCatalogSha256:d.beforeCatalogSha256,
 canonicalCatalogSha256:d.canonicalCatalog[after?'after':'before'].catalogSha256,canonicalImmutableSha256:d.canonicalCatalog[after?'after':'before'].immutableSha256,canonicalStableImmutableSha256:d.canonicalCatalog[after?'after':'before'].stableImmutableSha256,unchangedCatalogSha256:d.unchangedCatalogSha256,immutableSha256:after?d.afterImmutableSha256:d.immutableSha256,stableImmutableSha256:d.stableImmutableSha256,normalProjectionSha256:d.normalProjectionSha256,
 cookingFunctions:after?d.cookingFunctionsAfter:d.cookingFunctionsBefore,scopeLink:after?{outerOid:101,aliasOid:100}:{outerOid:100,aliasOid:null},executionTableSha256:after?d.executionTableAfterSha256:null,
 executionRowsEmpty:true,ledgerAuthority:true,active:false,normalDataSha256:sha('1'),preservedRowsSha256:sha('2'),attestationRowsSha256:sha('3'),controlsSha256:sha('4'),productWriterEnabled:true,cookedWeightWriterEnabled:true,quantityWriterEnabled:true,
 worker:{...d.workerBaseline,credentialActive:true,queued:0,processing:0,permitHeld:false,activeEnqueueSessions:0}};}
function engineFixture({sqlFails=false,ackLost=false,drift=false,aliasWrong=false}={}){
 const review=fixture(),queries=[];let state=observation(review),attempt=null,dispatches=0,inserted=0;
 const backup={fullArchiveDecoded:true,sha256:sha('1'),rolesSha256:sha('2'),snapshot:'00000001-00000002-1',target};
 const session={postgresContext:{searchPath:'"$user", public, extensions',timeZone:'UTC'},query:async sql=>{
  queries.push(sql);
  if(sql==='SELECT session_user;'||sql==='SELECT current_user;'&&queries.at(-2)==='RESET ROLE;')return 'supabase_admin';
  if(sql==='SELECT current_user;')return 'postgres';
  if(sql==='SELECT pg_export_snapshot();')return backup.snapshot;
  if(payloads.includes(sql)){dispatches++;if(sqlFails)throw Error('owned SQL failure');}
  if(sql.includes('INSERT INTO homecook_deploy.migrations')){inserted++;if(inserted===3){state=observation(review,true);if(drift)state.controlsSha256=sha('f');if(aliasWrong)state.scopeLink.aliasOid=102;}}
  if(sql==='ROLLBACK;')state=observation(review);
  if(sql==='COMMIT;'&&ackLost)throw Error('owned ACK lost');return '';
 },close:async()=>{},stop:()=>{}};
 const adapter={observe:async()=>structuredClone(state),migrationSession:()=>session,backup:async()=>backup,reloadSchema:async()=>{}};
 const journal={read:async()=>attempt,write:async value=>{attempt=structuredClone(value);}};
 const migrations=[...review.database.before.map(row=>({...row,bytes:Buffer.alloc(0)})),...cooking.COOKING_EXPERIENCE_MIGRATIONS.map((row,i)=>({filename:row.filename,sha256:row.sha256,bytes:raw[i]}))];
 const engine=db.createProtectedPrelaunchDatabaseEngine({review,reviewSha256:sha('8'),operationId:'12345678-1234-4123-8123-123456789abc',adapter,journal,readMigrations:async()=>migrations,assertBoundary:async()=>{}});
 return {review,queries,engine,migrations,getState:()=>state,getAttempt:()=>attempt,dispatches:()=>dispatches};
}

test('production PIN shape is preserved; owned fixture loader rejects before private I/O',()=>{
 assert(productionPin.path===null&&productionPin.sha256===null || isAbsolute(productionPin.path??'')&&/^[a-f0-9]{64}$/u.test(productionPin.sha256??''));
 assert.throws(()=>web.loadProtectedRolloutReview(root,{feature:unbound.COOKING_EXPERIENCE_FEATURE}),/비어/u);
});
test('current-schema images contain exact4 to10 functions and VOLATILE reader',()=>{
 const r=fixture();assert.doesNotThrow(()=>cooking.assertCookingExperienceReview(r));
 assert.equal(images.before.cookingFunctions.length,4);assert.equal(images.after.cookingFunctions.length,10);
 assert.deepEqual(images.before.workerReadiness,images.after.workerReadiness);
 assert.equal(images.after.workerReadiness.ready,true);
 const reader=images.after.cookingFunctions.find(row=>row.signature.includes('public.read_cooking_execution_quantities'));
 assert.notEqual(reader.definitionSha256,JSON.parse(readFileSync('docs/security/cooking-experience-source-function-postimages.json','utf8')).functions.find(row=>row.postimage.name==='read_cooking_execution_quantities').postimage.definition);
});
test('rejects reader-first lie, foreign SQL, old generation and unrelated worker source',()=>{
 for(const mutate of [r=>r.readerPrecedesDatabase=true,r=>r.database.workerBaseline.credentialGeneration=49,r=>r.files['scripts/lib/youtube-extraction-worker-runtime.mjs']=[sha('1'),sha('2')],r=>r.files['supabase/migrations/20271019000000_foreign.sql']=[null,sha('1')],r=>r.database.after.reverse()]){
  const r=fixture();mutate(r);assert.throws(()=>cooking.assertCookingExperienceReview(r));
 }
});
test('plans only three raw pinned payloads without nested transaction or comments',()=>{
 const f=engineFixture(),plan=db.planProtectedPrelaunchMigrations(f.review,f.migrations);
 assert.equal(plan.pending.length,3);assert.deepEqual(plan.pending.map(row=>row.actor),['postgres','postgres','postgres']);
 assert.deepEqual(plan.pending.map(row=>row.payload),payloads);
 for(const mutate of [f=>f.migrations[232].bytes=Buffer.from('begin;\nselect 1;\ncommit;\n'),f=>f.migrations.push(f.migrations[232])]){const bad=engineFixture();mutate(bad);assert.throws(()=>db.planProtectedPrelaunchMigrations(bad.review,bad.migrations));}
});
test('one transaction reuses original snapshot/backup and preserves stopped-worker ON policy',async()=>{
 const f=engineFixture(),receipt=await f.engine.apply();
 assert.equal(f.dispatches(),3);assert.equal(f.queries.filter(sql=>sql==='COMMIT;').length,1);
 assert.equal(receipt.readerReady,false);assert.equal(receipt.legacyReaderCompatible,true);assert.equal(receipt.readerFloor,f.review.to);
 assert.equal(receipt.scopeAliasOidPreservedInTransaction,true);assert.equal(receipt.controlsPreservedInTransaction,true);
 assert.doesNotThrow(()=>cooking.assertCookingExperienceDatabaseReceipt(f.review,receipt));
 assert(!f.queries.some(sql=>/set.*enabled|update.*policy/iu.test(sql)&&!payloads.includes(sql)));
 assert(f.queries.some(sql=>sql.includes('LOCK TABLE public.youtube_extraction_jobs IN SHARE ROW EXCLUSIVE MODE')));
 await assert.rejects(f.engine.apply(),/retry|exists/iu);
});
test('SQL failure rolls back without dispatching later sources',async()=>{
 const f=engineFixture({sqlFails:true});await assert.rejects(f.engine.apply(),/owned SQL/);
 assert.equal(f.dispatches(),1);assert.equal(f.getAttempt().status,'rolled_back_before_commit');
 assert.equal((await f.engine.reconcile()).status,'not_applied');assert.equal(f.dispatches(),1);
});
test('control drift or wrong original alias OID prevents COMMIT',async()=>{
 for(const options of [{drift:true},{aliasWrong:true}]){const f=engineFixture(options);await assert.rejects(f.engine.apply());assert(!f.queries.includes('COMMIT;'));assert(f.queries.includes('ROLLBACK;'));}
});
test('ACK unknown reconciles receipt read-only without redispatch',async()=>{
 const f=engineFixture({ackLost:true});await assert.rejects(f.engine.apply(),/ACK/);assert.equal(f.getAttempt().status,'unknown');
 assert.equal(f.getAttempt().scopeAliasOidPreservedInTransaction,true);
 const receipt=await f.engine.reconcile();assert.equal(receipt.status,'committed');assert.equal(f.dispatches(),3);
 assert.doesNotThrow(()=>cooking.assertCookingExperienceDatabaseReceipt(f.review,receipt));
});
test('authority, complete catalog, policy, owner/RLS metadata and empty table are independent gates',()=>{
 const r=fixture();
 for(const mutate of [o=>o.canonicalCatalogSha256=sha('f'),o=>o.worker.catalogFingerprint=sha('f'),o=>o.worker.policyRowSha256=sha('f'),o=>o.worker.credentialRowSha256=sha('f'),o=>o.worker.credentialActive=false,o=>o.worker.queued=1,o=>o.executionTableSha256=sha('f'),o=>o.executionRowsEmpty=false,o=>o.ledgerAuthority=false,o=>o.cookingFunctions[0].sourceMd5='f'.repeat(32)]){
  const o=structuredClone(observation(r,true));mutate(o);assert.throws(()=>cooking.assertCookingExperienceObservation(r,o,'after'));
 }
 const afterWrites=observation(r,true);afterWrites.executionRowsEmpty=false;
 assert.doesNotThrow(()=>cooking.assertCookingExperienceObservation(r,afterWrites,'after',{requireExecutionEmpty:false}));
});
test('exact web successor source handoff cannot substitute foreign files/build/receipt',async()=>{
 const f=engineFixture(),record=await f.engine.apply();
 const pointer={path:join(root,'receipt.json'),sha256:sha('a')};
 const maintenance={review:f.review,record,pointer,guardPointer:{...pointer}};
 const handoff={maintenance,from:f.review.from,to:f.review.to,live:{...f.review.legacyReader},files:Object.keys(f.review.files),digests:f.review.files,reviewedSourceAncestor:true};
 assert.doesNotThrow(()=>web.assertNutritionValidatorSourceHandoff(handoff));
 for(const change of [h=>h.to=ref('e'),h=>h.live.buildId='foreign',h=>h.files=[...h.files,'app/foreign.ts'],h=>h.reviewedSourceAncestor=false]){const bad=structuredClone(handoff);change(bad);assert.throws(()=>web.assertNutritionValidatorSourceHandoff(bad));}
 const marker={databaseMaintenance:f.review.predecessorMaintenance,databasePlanSha256:f.review.legacyMarkerDatabasePlanSha256};
 assert.doesNotThrow(()=>web.assertNutritionValidatorMarker(maintenance,marker,true));
 assert.throws(()=>web.assertNutritionValidatorMarker(maintenance,marker,false));
 const binding=cooking.cookingExperienceBinding(maintenance);
 assert(web.matchesDatabaseMaintenanceBinding(f.review.predecessorMaintenance,binding));
 assert(!web.matchesDatabaseMaintenanceBinding({...f.review.predecessorMaintenance,receipt:{...pointer}},binding));
 assert.equal(web.cookingExperiencePhaseStatus({review:f.review,record},false,false).normalDeploymentAllowed,false);
 assert.equal(web.cookingExperiencePhaseStatus({review:f.review,record},false,true).normalDeploymentAllowed,true);
});

test('present unknown235 guard fails closed before any original232 private authority read',async()=>{
 const r=fixture(),evidencePath=join(root,'owned-evidence.json'),evidenceBytes='{}\n';writeFileSync(evidencePath,evidenceBytes,{mode:0o600});
 for(const key of ['isolatedEvidence','legacyReaderEvidence','postimages','platformInventory','backupReadiness'])r[key]={path:evidencePath,sha256:hash(evidenceBytes)};
 r.isolatedEvidenceSha256=r.isolatedEvidence.sha256;
 const reviewPath=join(root,'owned-review.json'),reviewBytes=JSON.stringify(r);writeFileSync(reviewPath,reviewBytes,{mode:0o600});
 const localHelper=join(root,'guard-cooking.mjs'),localWeb=join(root,'guard-web.mjs'),state=join(root,'guard-state');
 writeFileSync(localHelper,createOwnedCookingReviewModule(productionHelperSource).replace(`Object.freeze({path:null,sha256:"${sha('8')}"})`,`Object.freeze(${JSON.stringify({path:reviewPath,sha256:hash(reviewBytes)})})`));
 let code=ownedImports(readFileSync('scripts/lib/prelaunch-web-deploy.mjs','utf8')).replace(pathToFileURL(helperPath).href,pathToFileURL(localHelper).href);
 code=code.replace('function prelaunchStateRoot() { return join(homedir(), ".homecook/prelaunch-web"); }',`function prelaunchStateRoot() { return ${JSON.stringify(state)}; }`);
 writeFileSync(localWeb,code,{mode:0o600});const scoped=await import(pathToFileURL(localWeb).href);
 const {mkdirSync}=await import('node:fs');mkdirSync(state,{mode:0o700});
 const id='12345678-1234-4123-8123-123456789abc',paths=scoped.protectedRolloutPaths(state,r);
 const guard={schema:'homecook.prelaunch-protected-db-attempt.v1',feature:r.feature,reviewSha256:hash(reviewBytes),from:r.from,to:r.to,journalFile:'attempt.json',readerFloor:r.to,
  predecessorMaintenance:r.predecessorMaintenance,operationId:id,operationDirectory:join(paths.operationRoot,id),status:'unknown',target};
 writeFileSync(paths.databaseGuardPath,JSON.stringify(guard),{mode:0o600});
 assert.equal(scoped.readCookingExperienceAttempt(process.cwd()).record.status,'unknown');
 assert.throws(()=>scoped.loadCurrentDatabaseMaintenance(process.cwd()),/unresolved/u);
 guard.predecessorMaintenance={...guard.predecessorMaintenance,receipt:{path:evidencePath,sha256:sha('f')}};
 writeFileSync(paths.databaseGuardPath,JSON.stringify(guard),{mode:0o600});
 assert.throws(()=>scoped.loadCurrentDatabaseMaintenance(process.cwd()),/foreign/u);
});

test('ordinary additive scanner still rejects every cooking source',()=>{
 for(const bytes of raw)assert.throws(()=>db.validatePrelaunchMigrationSql(bytes.toString()));
});


test('raw remainder and exact catalog helper/query byte binding cannot drift',()=>{
 const r=fixture(),before=observation(r),after=observation(r,true);
 assert.doesNotThrow(()=>cooking.assertCookingExperienceTransition(before,after));
 after.unchangedCatalogSha256=sha('f');
 assert.throws(()=>cooking.assertCookingExperienceTransition(before,after),/remainder/u);
 assert.throws(()=>cooking.assertCookingExperienceObservation(r,after,'after'),/catalog/u);
 assert.throws(()=>db.createCookingExperienceAdapter({}, {...r,database:{...r.database,catalogComparison:{...r.database.catalogComparison,helperSha256:sha('f')}}}),/helper\/query bytes/u);
 const invalid=structuredClone(r);delete invalid.database.unchangedCatalogSha256;
 assert.throws(()=>cooking.assertCookingExperienceReview(invalid),/metadata/u);
});


test('cooking CLI selects only its three dedicated phases with null PIN fail closed',()=>{
 const args=['--reviewed-protected-rollout','--reviewed-ref',ref('b'),'--db-config','/private/tmp/synthetic-config','--test-script','test:feedback-batch:web'];
 for(const phase of ['cooking-database','cooking-database-retry','cooking-reconcile']) {
  assert.equal(web.parsePrelaunchOptions([...args,'--protected-phase',phase]).protectedPhase,phase);
  assert.throws(()=>web.loadProtectedRolloutReview(root,{phase,ref:ref('b')}),/비어/u);
 }
 for(const phase of ['cooking-reader','cooking-writer-on','cooking-reconcile-any'])assert.throws(()=>web.parsePrelaunchOptions([...args,'--protected-phase',phase]));
});


test('native raw before is exact; raw after is observed rather than a restored-fixture expectation',()=>{
 const r=fixture(),before=observation(r),after=observation(r,true);
 before.catalogSha256=sha('f');assert.throws(()=>cooking.assertCookingExperienceObservation(r,before,'before'));
 after.catalogSha256=sha('9');assert.doesNotThrow(()=>cooking.assertCookingExperienceObservation(r,after,'after'));
 const f=structuredClone(r);delete f.database.canonicalCatalog;assert.throws(()=>cooking.assertCookingExperienceReview(f),/canonical/u);
});


test('preexisting v85 tools transport only the exact historical byte pair',()=>{
 const r=fixture();r.files['scripts/lib/v85-worker-lifecycle.mjs']=[null, "9970e3ffbacdc2f10705662ad49133fc59211a0875eb965f7da95ae9d65b3593"];
 assert.doesNotThrow(()=>cooking.assertCookingExperienceReview(r));
 r.files['scripts/lib/v85-worker-lifecycle.mjs'][1]=sha('f');
 assert.throws(()=>cooking.assertCookingExperienceReview(r),/file byte pairs/u);
});


test('ACK reconciliation cannot adopt a different native post-catalog after its original intent',async()=>{
 const f=engineFixture({ackLost:true});await assert.rejects(f.engine.apply(),/ACK/u);
 f.getState().catalogSha256=sha('9');
 await assert.rejects(f.engine.reconcile(),/original alias OID transaction evidence/u);
 assert.equal(f.dispatches(),3);
});


test('owned PIN seam yields identical bytes before/after a future production binding',()=>{
 const declaration=/^export const COOKING_EXPERIENCE_REVIEW_PIN = Object\.freeze\(\{[^\n]*\}\);$/gmu;
 const nullSource=productionHelperSource.replace(declaration,'export const COOKING_EXPERIENCE_REVIEW_PIN = Object.freeze({ path: null, sha256: null });');
 const boundSource=productionHelperSource.replace(declaration,`export const COOKING_EXPERIENCE_REVIEW_PIN = Object.freeze({ path: "/private/tmp/synthetic-approved-review.json", sha256: "${sha('3')}" });`);
 const originalNullCopy=nullSource.replace('Object.freeze({ path: null, sha256: null })',`Object.freeze({path:null,sha256:"${sha('8')}"})`);
 assert.equal(hash(createOwnedCookingReviewModule(nullSource)),hash(originalNullCopy));
 assert.equal(hash(createOwnedCookingReviewModule(boundSource)),hash(originalNullCopy));
 assert.equal(hash(readFileSync(helperPath)),hash(originalNullCopy));
 assert.throws(()=>createOwnedCookingReviewModule('export const unrelated = 1;'),/Exactly one/u);
 assert.throws(()=>createOwnedCookingReviewModule(nullSource+'\n'+nullSource),/Exactly one/u);
});


test('cooking235 explicitly preserves writer states rather than retargeting historical toggle authority',()=>{
 assert.throws(()=>web.assertCookingWriterStatePreserved({review:{feature:cooking.COOKING_EXPERIENCE_FEATURE}}),/writer.*별도 권위/u);
 assert.doesNotThrow(()=>web.assertCookingWriterStatePreserved(null));
 assert.doesNotThrow(()=>web.assertCookingWriterStatePreserved({review:{feature:'cooked-weight-user-attestation'}}));
});
