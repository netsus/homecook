import {describe,it,expect} from 'vitest';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {V85_WEB_RECOVERY as P,assertRecoveryBinding,assertRecoveryDatabase,assertRecoveryPreserved,assertRecoveryWebProcess,assertRecoveredEnqueue,runV85WebRecovery} from '../scripts/lib/prelaunch-v85-web-recovery.mjs';
import {v74MetadataPatch} from '../scripts/lib/prelaunch-youtube-v74-cutover.mjs';
import {v85MetadataPatch} from '../scripts/lib/youtube-v85-cutover.mjs';
import {loadRecoveredReadiness} from '../scripts/lib/prelaunch-v85-recovered-readiness.mjs';
const h='a'.repeat(64);
function binding(){
 const home='/Users/test',old='/old/checkout',current='/current/checkout';
 const plist={Label:'com.homecook.production',WorkingDirectory:current,ProgramArguments:['/node',current+'/scripts/start-production.mjs','-H','127.0.0.1','-p','3100'],EnvironmentVariables:{...v85MetadataPatch(home),SECRET:'fixture-only',MUMEOK_ROUND2_ENABLED:'false',MUMEOK_ROUND2_LEADS_ENABLED:'false'}};
 const previousPlist={...plist,WorkingDirectory:old,ProgramArguments:['/node',old+'/scripts/start-production.mjs','-H','127.0.0.1','-p','3100'],EnvironmentVariables:{...plist.EnvironmentVariables,...v74MetadataPatch(home)}};
 return {home,live:{ref:String(P.from),buildId:String(P.fromBuild),cwd:current,plist},state:{ref:String(P.from),checkout:current,buildId:String(P.fromBuild),targetPlistHash:String(P.fromPlist),previousCwd:old,previousPlistHash:String(P.toPlist),closedR2:{previousStateSha256:String(P.toState)}},previousState:{ref:String(P.to),checkout:old,buildId:String(P.toBuild),targetPlistHash:String(P.toPlist)},previousPlist,hashes:{currentPlist:String(P.fromPlist),previousPlist:String(P.toPlist),state:String(P.fromState),previousState:String(P.toState)}};
}
function db(){return {ledger:Array(232).fill({sha256:h}),worker:{credentialGeneration:49,workerReleaseSha:String(P.workerRelease),credentialActive:true,workerPolicyEnabled:true,queued:0,processing:0,permitHeld:false,activeEnqueueSessions:0},fingerprintPolicy:{enabled:true,fingerprint_key_version:'2',previous_fingerprint_key_version:null,previous_fingerprint_valid_until:null}};}
describe('exact existing web recovery authority',()=>{
 it('accepts only the observed current and prior web with the original three metadata paths',()=>expect(()=>assertRecoveryBinding(binding())).not.toThrow());
 it.each(['from','to','fromBuild','toBuild','fromHash','toHash','stateHash','priorStateHash','env','argument','uid','r2','metadata','previousPath'])('rejects changed %s',field=>{
  const f=binding();
  if(field==='from')f.live.ref=String(P.to);if(field==='to')f.previousState.ref=String(P.from);
  if(field==='fromBuild')f.live.buildId='other';if(field==='toBuild')f.previousState.buildId='other';
  if(field==='fromHash')f.hashes.currentPlist=h;if(field==='toHash')f.hashes.previousPlist=h;
  if(field==='stateHash')f.hashes.state=h;if(field==='priorStateHash')f.hashes.previousState=h;
  if(field==='env')f.previousPlist.EnvironmentVariables.SECRET='changed';
  if(field==='argument')f.previousPlist.ProgramArguments[5]='3101';
  if(field==='uid')Object.assign(f.previousPlist,{UserName:'root'});
  if(field==='r2')f.previousPlist.EnvironmentVariables.MUMEOK_ROUND2_ENABLED='true';
  if(field==='metadata')f.previousPlist.EnvironmentVariables.HOMECOOK_YOUTUBE_EXTRACTION_WORKER_MANIFEST_PATH='/foreign/artifact.json';
  if(field==='previousPath')f.previousState.checkout='/foreign';
  expect(()=>assertRecoveryBinding(f)).toThrow();
 });
 it.each(['generation','release','active','enabled','queue','processing','permit','enqueue','ledger','jobs','fingerprint','previous'])('rejects DB/worker %s',field=>{
  const f=db();let jobs=String(P.jobs);
  if(field==='generation')f.worker.credentialGeneration=50;if(field==='release')f.worker.workerReleaseSha=String(P.to);
  if(field==='active')f.worker.credentialActive=false;if(field==='enabled')f.worker.workerPolicyEnabled=false;
  if(field==='queue')f.worker.queued=1;if(field==='processing')f.worker.processing=1;if(field==='permit')f.worker.permitHeld=true;if(field==='enqueue')f.worker.activeEnqueueSessions=1;
  if(field==='ledger')f.ledger.pop();if(field==='jobs')jobs=h;if(field==='fingerprint')f.fingerprintPolicy.fingerprint_key_version='1';if(field==='previous')Object.assign(f.fingerprintPolicy,{previous_fingerprint_key_version:'1'});
  expect(()=>assertRecoveryDatabase(f,jobs)).toThrow();
 });
 it('uses fresh before/after preservation without rebinding original gen50 plan',()=>{
  const before={full:db(),normalDataSha256:'new-data',authRowsSha256:'new-auth',guards:{old:h},pid:22,plan:P.plan};
  expect(()=>assertRecoveryPreserved(before,structuredClone(before))).not.toThrow();
  for(const field of ['normalDataSha256','authRowsSha256','guards','pid','plan']){const after=structuredClone(before);Object.assign(after,{[field]:'changed'});expect(()=>assertRecoveryPreserved(before,after)).toThrow();}
 });
});
function adapters(fail=''){
 const events:string[]=[];let activated=false,state='7b';
 const call=async(name:string)=>{events.push(name);if(fail===name)throw Error(name);};
 const a={prepare:async()=>{await call('prepare');return {before:'fresh'};},journal:async(name:string)=>{await call('journal:'+name);},assertOwned:async(name:string)=>call('owned:'+name),activate:async()=>{activated=true;await call('activate');},verify:async()=>call('verify'),publishState:async()=>{state='06a';await call('publish');},verifyPublished:async()=>call('published'),restore:async()=>{await call('restore');activated=false;state='7b';},verifyRestored:async()=>call('restored')};
 return {a,events,status:()=>({activated,state})};
}
describe('service mutation and compensation',()=>{
 it.each(['parent','uid','cwd','pid','loaded','state'])('rejects a foreign production process %s',field=>{const f={loaded:{loaded:true,state:'running',pid:20},listener:{pid:21,parentPid:20,uid:501,cwd:'/approved'},uid:501,cwd:'/approved',expectedPid:20};if(field==='parent')f.listener.parentPid=30;if(field==='uid')f.listener.uid=0;if(field==='cwd')f.listener.cwd='/foreign';if(field==='pid')f.loaded.pid=30;if(field==='loaded')f.loaded.loaded=false;if(field==='state')f.loaded.state='waiting';expect(()=>assertRecoveryWebProcess(f)).toThrow();});
 it('publishes old official state only after verified web/readiness',async()=>{const f=adapters();await expect(runV85WebRecovery(f.a)).resolves.toMatchObject({recovered:true,generation:49,databaseWrites:0});expect(f.events).toEqual(['prepare','journal:intent','owned:before','activate','verify','publish','published','journal:complete']);});
 it.each(['prepare','journal:intent','owned:before'])('does not restart or write a web after %s failure',async stage=>{const f=adapters(stage);await expect(runV85WebRecovery(f.a)).rejects.toThrow();expect(f.events).not.toContain('activate');expect(f.events).not.toContain('restore');expect(f.status().state).toBe('7b');});
 it.each(['activate','verify','publish','published','journal:complete'])('restores exact original web/state after %s failure',async stage=>{const f=adapters(stage);await expect(runV85WebRecovery(f.a)).rejects.toThrow('original 7b web/state restored');expect(f.status()).toEqual({activated:false,state:'7b'});expect(f.events).toContain('journal:compensated');});
 it('never overwrites a foreign/newer state during compensation',async()=>{const f=adapters('verify');f.a.assertOwned=async name=>{f.events.push('owned:'+name);if(name==='compensation')throw Error('foreign');};await expect(runV85WebRecovery(f.a)).rejects.toThrow('compensation unconfirmed');expect(f.events).not.toContain('restore');expect(f.events).toContain('journal:unresolved');});
 it('reports failed compensation rather than claiming recovery',async()=>{const f=adapters('verify');f.a.restore=async()=>{throw Error('bootstrap failure');};await expect(runV85WebRecovery(f.a)).rejects.toThrow('unconfirmed');});
});
describe('actual application readiness boundary',()=>{
 it.each([null,{code:'POLICY_CHANGED'},{currentFingerprintKeyVersion:'1',previousFingerprintKeyVersion:null}])('rejects application rejection %j',async result=>{await expect(assertRecoveredEnqueue({loadReadiness:async()=>result,rpc:null,env:null,verifySecrets:()=>({status:'ready'})})).rejects.toThrow();});
 it('requires the original production secret loader to be ready',async()=>{await expect(assertRecoveredEnqueue({loadReadiness:async()=>({currentFingerprintKeyVersion:'2',previousFingerprintKeyVersion:null}),rpc:null,env:null,verifySecrets:()=>({status:'disabled'})})).rejects.toThrow();});
 it('compiles the real route loader, accepts valid readiness and rejects changed release before enqueue',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'v85-readiness-test-'));
  try{
   mkdirSync(join(dir,'lib/server'),{recursive:true});mkdirSync(join(dir,'scripts/lib'),{recursive:true});
   for(const file of ['youtube-async-extraction.ts','youtube-async-extraction-routes.ts'])writeFileSync(join(dir,'lib/server',file),readFileSync(join('lib/server',file)));
   const descriptor={schema:'homecook.youtube-extraction-app-descriptor',version:1,release_sha:'expected',artifact_sha256:h,expected_schema_sha256:h,schema_identity:'schema-v2',expected_policy_version:3,expected_policy_snapshot_digest:h};
   const manifest={schema:'homecook.youtube-extraction-worker-artifact',version:2,deterministic:true,release_sha:'expected',artifact_sha256:h,expected_schema_sha256:h,schema_identity:'schema-v2',policy_version:3,allowed_snapshot_digest:h,pipeline_identity:h};
   writeFileSync(join(dir,'scripts/lib/youtube-extraction-worker-artifact.mjs'),`export const readYoutubeExtractionAppDescriptor=()=>(${JSON.stringify(descriptor)});export const readYoutubeExtractionExpectedSchema=()=>({schema:'homecook.youtube-extraction-expected-schema',version:1,schema_identity:'schema-v2',catalog_fingerprint:'${h}'});export const sha256File=()=>'${h}';export const verifyYoutubeExtractionWorkerArtifact=()=>(${JSON.stringify(manifest)});export const buildYoutubeExtractionWorkerPolicySnapshotDigest=()=>'${h}';`);
   const env={HOMECOOK_YOUTUBE_EXTRACTION_APP_DESCRIPTOR_PATH:'/descriptor',HOMECOOK_YOUTUBE_EXTRACTION_EXPECTED_SCHEMA_PATH:'/schema',HOMECOOK_YOUTUBE_EXTRACTION_WORKER_MANIFEST_PATH:'/manifest'};
   const row={ready:true,release_sha:'expected',schema_identity:'schema-v2',catalog_fingerprint:h,policy_version:3,policy_snapshot_digest:h,allowed_snapshot_digest:h,credential_expires_at:new Date(Date.now()+86400000).toISOString(),fingerprint_key_version:'2',previous_fingerprint_key_version:null,previous_fingerprint_valid_until:null};
   await expect(loadRecoveredReadiness(dir,env,row)).resolves.toMatchObject({currentFingerprintKeyVersion:'2',fingerprintPipelineIdentity:h});
   await expect(loadRecoveredReadiness(dir,env,{...row,release_sha:'foreign'})).resolves.toBeNull();
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
 it('keeps the existing generic rollback guard and rejects action arguments',()=>{const source=readFileSync('scripts/deploy-prelaunch-web.mjs','utf8');expect(source).toContain('보호 DB 전환 guard/reader floor가 있어 수동 구 웹 rollback을 거부합니다.');expect(source).toContain('["status", "rollback", "recover-v85-web", "plan-v85-web-recovery"].includes(action) && args.length');});
});
