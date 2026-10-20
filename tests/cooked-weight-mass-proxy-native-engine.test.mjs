// Opt-in, exact labelled network-none native fixture only. No production URL/config arguments.
import {test,before,after}from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync,spawn}from 'node:child_process';
import {createHash,randomUUID}from 'node:crypto';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync,realpathSync}from 'node:fs';
import {join,resolve}from 'node:path';
import {pathToFileURL}from 'node:url';
import {openProtectedMigrationSession,backupRecordingSnapshot}from '../scripts/lib/marketing-round2-controlled-deploy.mjs';
import {readPinnedLocalDockerTarget}from '../scripts/lib/local-supabase-isolated-runtime.mjs';
import {DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS}from '../scripts/lib/youtube-extraction-worker-artifact.mjs';
import {review as syntheticReview}from './fixtures/cooked-weight-mass-proxy-maintenance-fixture.mjs';
import * as production from '../scripts/lib/cooked-weight-mass-proxy-maintenance.mjs';
const enabled=process.env.HOMECOOK_MASS_PROXY_NATIVE_ENGINE==='1',container=process.env.HOMECOOK_WEIGHT_EVIDENCE_TEST_CONTAINER??'',tag=process.env.HOMECOOK_WEIGHT_EVIDENCE_TEST_TAG??'';
const image='public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a';
const hash=value=>createHash('sha256').update(value).digest('hex'),sha=value=>value.repeat(64),literal=value=>`'${String(value).replaceAll("'","''")}'`;
let env,contextPrefix,directory,db,feature,r,migrations,payload,beforeState;
const report={schema:'homecook.mass-proxy-native-engine.v1',productionConnections:0,network:'none',operatingPinPublished:false,cases:[],status:'RUNNING'};
function own(){assert.match(container,/^[a-f0-9]{64}$/u);assert.match(tag,/^[a-f0-9]{32}$/u);const out=spawnSync('docker',['inspect','--format','{{.Id}}|{{.Config.Image}}|{{.HostConfig.NetworkMode}}|{{len .Mounts}}|{{len .HostConfig.PortBindings}}|{{index .Config.Labels "homecook.cooked-weight-test"}}',container],{env,encoding:'utf8'});assert.equal(out.status,0,out.stderr);assert.equal(out.stdout.trim(),`${container}|${image}|none|0|0|${tag}`);}
function sql(statement,user='postgres',database='postgres'){own();const out=spawnSync('docker',['exec','-i',container,'psql','-h','/tmp/pgsocket','-U',user,'-d',database,'-XqAt','-v','ON_ERROR_STOP=1'],{env,encoding:'utf8',input:contextPrefix+statement,timeout:60000,maxBuffer:16*1024*1024});assert.equal(out.status,0,out.stderr);return out.stdout.trim();}
before(async()=>{
 if(!enabled)return;
 env=Object.fromEntries(['PATH','LANG','LC_ALL','TMPDIR'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));env.DOCKER_HOST=readPinnedLocalDockerTarget().docker_host;
 const contextBytes=readFileSync('/private/tmp/homecook-cooking-pg-context-live-20261019.json');assert.equal(hash(contextBytes),'569b5da16f96c5f00a564cbe52925d6c1f73878b90ea026999c5d480c249a846');const context=JSON.parse(contextBytes);contextPrefix=`do $$begin perform set_config('search_path',${literal(context.searchPath)},false);perform set_config('TimeZone','UTC',false);end$$;\n`;
 directory=mkdtempSync(join(realpathSync('/tmp'),'hc-mass-native-engine-'));const helper=join(directory,'helper.mjs'),webPath=join(directory,'web.mjs'),dbPath=join(directory,'db.mjs');
 const imports=text=>text.replace(/from (["'])(\.\/[^"'\n]+)\1/gu,(_all,_q,p)=>`from "${pathToFileURL(p==='./cooked-weight-mass-proxy-maintenance.mjs'?helper:p==='./prelaunch-web-deploy.mjs'?webPath:resolve('scripts/lib',p)).href}"`);
 let code=readFileSync('scripts/lib/cooked-weight-mass-proxy-maintenance.mjs','utf8').replace(/^export const MASS_PROXY_REVIEW_PIN = Object\.freeze\(\{[^\n]*\}\);$/gmu,`export const MASS_PROXY_REVIEW_PIN = Object.freeze(${JSON.stringify({path:join(directory,'synthetic-review.json'),sha256:sha('8')})});`)
  .replace('new URL("./cooked-weight-mass-proxy-source.json", import.meta.url)',`new URL(${JSON.stringify(pathToFileURL(resolve('scripts/lib/cooked-weight-mass-proxy-source.json')).href)})`);
 writeFileSync(helper,imports(code),{mode:0o600});writeFileSync(webPath,imports(readFileSync('scripts/lib/prelaunch-web-deploy.mjs','utf8')),{mode:0o600});writeFileSync(dbPath,imports(readFileSync('scripts/lib/prelaunch-database.mjs','utf8')),{mode:0o600});
 db=await import(pathToFileURL(dbPath).href);feature=await import(pathToFileURL(helper).href);r=syntheticReview();
 const oldEvidence=readFileSync('supabase/migrations/20261013233000_cooked_batch_weight_evidence.sql','utf8');const oldCompletion=oldEvidence.slice(oldEvidence.indexOf('create or replace function public.complete_snapshot_v2_cooking_session_with_weight_evidence('),oldEvidence.indexOf('create or replace function public.mutate_cooked_batch_weight_with_evidence('));
 sql(readFileSync('supabase/migrations/20261017210000_cooked_weight_mass_fallback.sql','utf8')+oldCompletion);
 const source=production.massProxySourceManifest(),options=JSON.stringify(DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS);
 sql(`insert into homecook_deploy.migrations(filename,sha256)values${source.before.map(x=>`(${literal(x.filename)},${literal(x.sha256)})`).join(',')};insert into private.youtube_extraction_current_policy values('primary',3,'codex_cli',repeat('a',64),${literal(options)},'1',null,null,true,'2026-01-01');insert into private.youtube_extraction_worker_credentials values('primary',50,repeat('b',64),'2099-01-01','1be5eeea5dd946d8a54edf6c5fd0c3c28d1815fa','youtube-extraction-worker-schema-v2',private.youtube_extraction_policy_snapshot_digest('codex_cli',repeat('a',64),${literal(options)},3),'2026-01-01');`,'supabase_admin');
 const target={fixture:true,containerId:container,tag,database:'postgres'};r.database.targetSha256=hash(JSON.stringify(target));r.predecessorMaintenance.targetSha256=r.database.targetSha256;
 const base={inspect:async()=>{own();return target;},query:async statement=>sql(`begin read only;${statement}\ncommit;`)};
 const first=await db.createMassProxyAdapter(base,r).observe(undefined,'native-mass-baseline');
 migrations=r.database.after.map(row=>({...row,bytes:readFileSync(`supabase/migrations/${row.filename}`)}));payload=production.planMassProxyMigration(r,migrations).pending[0].payload;
 const afterFunctions=JSON.parse(sql(`begin;${payload}\n${feature.MASS_PROXY_FUNCTIONS_SQL}\nrollback;`));
 const portable=rows=>rows.map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>key!=='oid')));
 Object.assign(r.database,{beforeCatalogSha256:first.catalogSha256,immutableSha256:first.immutableSha256,stableImmutableSha256:first.stableImmutableSha256,unchangedCatalogSha256:first.unchangedCatalogSha256,executionTableSha256:first.executionTableSha256,functionsBefore:portable(first.functions),functionsAfter:portable(afterFunctions),functionOids:first.functions.map(row=>[row.signature,row.oid]),scopeLink:first.scopeLink});
 r.database.workerBaseline={...first.worker};for(const key of ['credentialActive','queued','processing','permitHeld','activeEnqueueSessions'])delete r.database.workerBaseline[key];
 feature.assertMassProxyReview(r);feature.assertMassProxyObservation(r,first,'before');beforeState=first;
 report.functionsBefore=r.database.functionsBefore;report.functionsAfter=r.database.functionsAfter;report.sourceSql=production.MASS_PROXY_MIGRATION;report.originalRows={normalDataSha256:first.normalDataSha256,preservedRowsSha256:first.preservedRowsSha256,executionRowsSha256:first.executionRowsSha256,ledgerPreservedRowsSha256:first.ledgerPreservedRowsSha256};
 sql('create database hc_mass_engine_template template postgres;','supabase_admin','template1');
});
after(()=>{if(!enabled)return;report.status=report.cases.length===3&&report.cases.every(x=>x.pass)?'PASS':'FAIL';writeFileSync('.artifacts/feedback-ui/native-engine-report.json',JSON.stringify(report,null,2)+'\n');if(directory)rmSync(directory,{recursive:true,force:true});});
for(const scenario of ['commit','sql-error','commit-ack-unknown'])test(`native protected engine ${scenario}`,{skip:!enabled,timeout:300000},async()=>{
 own();sql('drop database postgres;create database postgres template hc_mass_engine_template;','supabase_admin','template1');
 const operationId=randomUUID(),operationDirectory=join(directory,scenario);mkdirSync(operationDirectory,{mode:0o700});const backupDirectory=join(operationDirectory,'backup');mkdirSync(backupDirectory,{mode:0o700});
 let dispatches=0,backups=0,ticks=0;const run=(args,options={})=>new Promise((resolveRun,reject)=>{own();const timer=setInterval(()=>ticks++,10),child=spawn('docker',args,{env,...options});child.stderr?.resume();child.once('error',error=>{clearInterval(timer);reject(error);});child.once('close',code=>{clearInterval(timer);if(code!==0)return reject(Error('Owned native backup child failed'));try{own();resolveRun();}catch(error){reject(error);}});});
 const base={inspect:async()=>({fixture:true,containerId:container,tag,database:'postgres'}),query:async statement=>sql(`begin read only;${statement}\ncommit;`),migrationSession:applicationName=>{own();const session=openProtectedMigrationSession(container,env,applicationName);return{...session,postgresContext:JSON.parse(sql("select jsonb_build_object('searchPath',current_setting('search_path'),'timeZone',current_setting('TimeZone'));")),query:async statement=>{if(statement===payload){dispatches++;if(scenario==='sql-error')return session.query(statement+'\nselect 1/0;');}if(statement==='COMMIT;'&&scenario==='commit-ack-unknown')return session.query('COMMIT; SELECT pg_terminate_backend(pg_backend_pid());');return session.query(statement);}};},backup:async options=>{backups++;return backupRecordingSnapshot({...options,run,container,directory:backupDirectory});},reloadSchema:async()=>sql("notify pgrst,'reload schema';")};
 const adapter=db.createMassProxyAdapter(base,r),journal=db.createProtectedPrelaunchJournal({repositoryRoot:process.cwd(),operationDirectory,operationId,guardPath:join(directory,`${scenario}-guard.json`)}),engine=db.createProtectedPrelaunchDatabaseEngine({review:r,reviewSha256:sha('8'),operationId,adapter,journal,readMigrations:async()=>migrations,assertBoundary:async()=>own()});
 let firstError=null,receipt;try{receipt=await engine.apply();}catch(error){firstError=error;}
 if(scenario==='commit')assert.equal(firstError,null);else{assert(firstError);receipt=await engine.reconcile();}
 const expected=scenario==='sql-error'?'not_applied':'committed';assert.equal(receipt.status,expected);assert.equal(dispatches,1);assert.equal(backups,1);assert(ticks>0);
 if(expected==='committed')feature.assertMassProxyDatabaseReceipt(r,receipt,sha('8'));
 const final=await adapter.observe(undefined,'native-mass-final');feature.assertMassProxyObservation(r,final,expected==='committed'?'after':'before');for(const key of ['normalDataSha256','preservedRowsSha256','attestationRowsSha256','controlsSha256','executionRowsSha256','ledgerPreservedRowsSha256'])assert.equal(final[key],beforeState[key],key);
 report.cases.push({scenario,status:receipt.status,pass:true,dispatches,backups,asyncBackupTicks:ticks,originalRowsPreserved:true,originalFunctionOidsPreserved:true});
});
