import {test,after}from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync}from 'node:fs';
import {join,resolve}from 'node:path';
import {pathToFileURL}from 'node:url';
import {execFileSync,spawnSync}from 'node:child_process';
import {isDeepStrictEqual}from 'node:util';
import * as saved from '../scripts/lib/saved-recipe-nutrition-maintenance.mjs';
import * as cooking from '../scripts/lib/cooking-experience-maintenance.mjs';
import {unboundMassProxyModules}from './fixtures/mass-proxy-unbound-modules.mjs';
import {review,observation,hash,sha,source,target}from './fixtures/cooked-weight-mass-proxy-maintenance-fixture.mjs';
const root=mkdtempSync('/tmp/hc-mass-proxy-cli-'),helper=join(root,'helper.mjs'),webPath=join(root,'web.mjs');
after(()=>rmSync(root,{recursive:true,force:true}));
const imports=text=>text.replace(/from (["'])(\.\/[^"'\n]+)\1/gu,(_all,_q,p)=>`from "${pathToFileURL(p==='./cooked-weight-mass-proxy-maintenance.mjs'?helper:resolve('scripts/lib',p)).href}"`);
let helperCode=readFileSync('scripts/lib/cooked-weight-mass-proxy-maintenance.mjs','utf8').replace(/^export const MASS_PROXY_REVIEW_PIN = Object\.freeze\(\{[^\n]*\}\);$/gmu,`export const MASS_PROXY_REVIEW_PIN = Object.freeze(${JSON.stringify({path:join(root,'synthetic-unused-review.json'),sha256:sha('8')})});`)
 .replace('new URL("./cooked-weight-mass-proxy-source.json", import.meta.url)',`new URL(${JSON.stringify(pathToFileURL(resolve('scripts/lib/cooked-weight-mass-proxy-source.json')).href)})`);
writeFileSync(helper,imports(helperCode),{mode:0o600});writeFileSync(webPath,imports(readFileSync('scripts/lib/prelaunch-web-deploy.mjs','utf8')),{mode:0o600});
const feature=await import(pathToFileURL(helper).href),web=await import(pathToFileURL(webPath).href);
const cli=readFileSync('scripts/deploy-prelaunch-web.mjs','utf8');
function slice(start,end){const a=cli.indexOf(start),b=cli.indexOf(end,a);assert(a>=0&&b>a);return cli.slice(a,b);}
function harness(){
 const r=review(),bytes=Buffer.from('synthetic live plist'),oid='12345678-1234-4123-8123-123456789abc';r.legacyReader.plistSha256=hash(bytes);
 const o=observation(r,true),record={...o,schema:'homecook.prelaunch-protected-db-attempt.v1',feature:r.feature,reviewSha256:sha('8'),from:r.from,to:r.to,readerFloor:r.to,journalFile:'attempt.json',predecessorMaintenance:structuredClone(r.predecessorMaintenance),operationId:oid,applicationName:`protected-mass-proxy-${oid}`,status:'committed',targetSha256:r.database.targetSha256,databasePlanSha256:hash(JSON.stringify({source:r.database.after,applied:r.database.after})),readerReady:false,writerEnabled:false,legacyReaderCompatible:true,backwardCompatible:false,rowsPreservedInTransaction:true,controlsPreservedInTransaction:true,featureMetadataPreservedInTransaction:true,scopeAliasOidPreservedInTransaction:true,functionOids:r.database.functionOids,nativePostCatalog:Object.fromEntries(['catalogSha256','immutableSha256','stableImmutableSha256'].map(k=>[k,o[k]])),backup:{fullArchiveDecoded:true,sha256:sha('a'),rolesSha256:sha('b'),target,snapshot:'00000003-0000001B-1'}};
 const pointer={path:join(root,'synthetic-receipt.json'),sha256:sha('1')},maintenance={review:r,record,pointer,guardPointer:{...pointer}};
 const live={ref:r.from,buildId:r.legacyReader.buildId,bytes,cwd:'/synthetic-current',plist:{Label:'com.homecook.production',WorkingDirectory:'/synthetic-current',ProgramArguments:['/synthetic-node','/synthetic-current/scripts/start-production.mjs','-H','127.0.0.1','-p','3100'],EnvironmentVariables:{MUMEOK_ROUND2_ENABLED:'false',MUMEOK_ROUND2_LEADS_ENABLED:'false'}}};
 const options={ref:r.to,refOption:'--reviewed-ref',alreadyAppliedDb:true,dbConfig:'/synthetic/nonexistent.env',testScript:'test:feedback-batch:web'};let baselineChecks=0;
 const command=(bin,args)=>execFileSync(bin,args,{encoding:'utf8',maxBuffer:64*1024*1024});
 const context={...web,...saved,...cooking,...feature,isDeepStrictEqual,repository:process.cwd(),root,join,hash,execFileSync,spawnSync,command,
  git:args=>command('git',['-C',process.cwd(),...args]).trim(),assertClean:()=>{},fingerprintSourceHandoff:()=>null,v85SourceHandoff:()=>null,
  V74_WEB_PREDECESSOR:'a'.repeat(40),V74_RELEASE:'b'.repeat(40),loadCurrentDatabaseMaintenance:()=>maintenance,
  readEnvironmentPatch:()=>({}),quantityPublicReadDigests:()=>null,loadClosedR2Review:()=>({}),verifyClosedR2Control:()=>{},
  verifyProtectedBaseline:async(_review,plan)=>{baselineChecks++;assert.deepEqual(plan.applied,r.database.after);assert.deepEqual(plan.source,r.database.after);assert.deepEqual(plan.pending,[]);}};
 const bodies=slice('function plan(','\nfunction ownChild(')+slice('function nutritionSourceHandoff(','\nasync function stageRound2Readiness');
 const real=new Function(...Object.keys(context),`${bodies};return{plan,nutritionSourceHandoff};`)(...Object.values(context));
 const prebuildContext={...context,...real,current:()=>live,recoveryPath:'/synthetic-no-recovery',existsSync:()=>false,requireClosedR2Mode:opts=>{web.assertClosedR2ContinuationOptions(opts);return{review:{synthetic:true}};}};
 const prebuild=new Function(...Object.keys(prebuildContext),`${slice('async function deploy(options) {','  const release = mkdtempSync')}return{selection,readOnlyDatabase};}\nreturn deploy;`)(...Object.values(prebuildContext));
 const stageContext={...context,...real};
 const stage=new Function(...Object.keys(stageContext),`${slice('async function stageRound2Readiness(','\nfunction copyEnvironment(')};return stageRound2Readiness;`)(...Object.values(stageContext));
 return{r,maintenance,live,options,real,prebuild:()=>prebuild(options),runPlan:()=>real.plan(r.to,live,'--reviewed-ref',undefined,false,options.testScript,null,null,false,null,options),stage:async()=>stage(live.plist,'/synthetic-release',live,{target:r.to,files:Object.keys(r.files)},false,options,{source:r.database.after,applied:r.database.after,pending:[],baselineRequired:false},{marker:{protectedRollout:{}},rollout:{historical:true}}),baselineChecks:()=>baselineChecks};
}
test('real CLI normal already-applied plan validates exact239 source handoff',()=>{const f=harness(),plan=f.runPlan();assert.equal(plan.target,source.to);assert.equal(plan.files.length,55);assert.deepEqual(plan.scope.database,[`supabase/migrations/${feature.MASS_PROXY_MIGRATION.filename}`]);assert.deepEqual(Object.keys(f.real.nutritionSourceHandoff(f.live,plan,f.options).digests).sort(),Object.keys(f.r.files).sort());});
test('real CLI closed-R2 readiness stage preserves plist and rechecks committed239 DB',async()=>{const f=harness();const result=await f.stage();assert.deepEqual(result,f.live.plist);assert.equal(f.baselineChecks(),1);});
for(const [name,mutate]of [
 ['unknown receipt',f=>f.maintenance.record.status='unknown'],['foreign predecessor',f=>f.maintenance.record.predecessorMaintenance.receipt.sha256=sha('f')],['changed current build',f=>f.live.buildId='foreign'],['missing source pair',f=>delete f.r.files[Object.keys(f.r.files)[0]]],['foreign scope file',f=>f.r.files['lib/server/foreign-auth.ts']=[null,sha('f')]],['changed receipt postimage',f=>f.maintenance.record.nativePostCatalog.catalogSha256=sha('f')]
])test(`real CLI refuses ${name}`,()=>{const f=harness();mutate(f);assert.throws(f.runPlan);});
test('normal closed-R2 continuation still rejects DB write/baseline shortcuts',()=>{for(const change of [{dbCompatible:true},{alreadyAppliedDb:false},{dbBaseline:'/foreign'},{skipAutomatedTests:true}]){const f=harness();Object.assign(f.options,change);assert.throws(()=>web.assertClosedR2ContinuationOptions(f.options));}});
test('real CLI deploy prebuild keeps239 handoff strictly read-only',async()=>{const f=harness(),result=await f.prebuild();assert.equal(result.readOnlyDatabase,true);assert.equal(result.selection.target,source.to);});
test('actual CLI new phase and loader reject an unbound PIN before target access',async()=>{
 const unbound=await unboundMassProxyModules();try{
 assert.throws(()=>unbound.web.loadProtectedRolloutReview(process.cwd(),{phase:'mass-proxy-database',ref:source.to}),/PIN is unbound/);
 const r=spawnSync(process.execPath,[unbound.cli,'plan','--reviewed-ref',source.to,'--reviewed-protected-rollout','--protected-phase','mass-proxy-database','--db-config','/does-not-exist','--test-script','test:feedback-batch:web'],{encoding:'utf8',env:Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('HOMECOOK_')))});
 assert.equal(r.status,1);assert.match(r.stderr,/배포 도구 실패/);assert.doesNotMatch(r.stderr,/ENOENT/);
 }finally{unbound.cleanup();}
});

// Registry bodies are real; private review/files and predecessor observations are synthetic.
test('actual current-maintenance registry retains unknown/foreign239 guard instead of falling back238',()=>{
 const f=harness(),stateRoot=join(root,'synthetic-state'),paths=web.protectedRolloutPaths(stateRoot,{feature:feature.MASS_PROXY_FEATURE});
 const record={...f.maintenance.record,status:'unknown',target,operationDirectory:join(paths.operationRoot,f.maintenance.record.operationId)};
 let predecessorReads=0,bytes=Buffer.from(JSON.stringify(record));
 const context={...web,...feature,prelaunchStateRoot:()=>stateRoot,join,existsSync:p=>p===paths.databaseGuardPath,
  loadProtectedRolloutReview:()=>f.r,readClosedR2PrivateBytes:()=>bytes,closedR2Hash:hash,closedR2Require:(ok,message)=>assert(ok,message),
  loadSavedRecipeNutritionMaintenance:()=>{predecessorReads++;return{original238:true};},loadCookingExperienceMaintenance:()=>null,loadRecipeRequestRoleMaintenance:()=>null,loadRecipeSaveRecoveryMaintenance:()=>null,loadNutritionValidatorMaintenance:()=>null,isDeepStrictEqual};
 const sourceText=readFileSync('scripts/lib/prelaunch-web-deploy.mjs','utf8');
 const body=sourceText.slice(sourceText.indexOf('export function readMassProxyAttempt(')).replaceAll('export function','function');
 const current=sourceText.slice(sourceText.indexOf('export function loadCurrentDatabaseMaintenance('),sourceText.indexOf('\nexport function recipeSaveRecoveryPhaseStatus(')).replace('export function','function');
 const registry=new Function(...Object.keys(context),`${body}\n${current};return loadCurrentDatabaseMaintenance;`)(...Object.values(context));
 assert.throws(()=>registry(process.cwd()),/outcome unresolved; no238 fallback/);assert.equal(predecessorReads,0);
 record.predecessorMaintenance.receipt.sha256=sha('f');bytes=Buffer.from(JSON.stringify(record));assert.throws(()=>registry(process.cwd()));assert.equal(predecessorReads,0);
});
