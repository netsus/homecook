import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readCookingRecordingObservation} from '../scripts/lib/marketing-round2-controlled-deploy.mjs';
import {readPinnedLocalDockerTarget} from '../scripts/lib/local-supabase-isolated-runtime.mjs';

const directory=mkdtempSync(join(realpathSync('/tmp'),'hc-cooking-read-unit-'));
after(()=>rmSync(directory,{recursive:true,force:true}));
const source=readFileSync('scripts/lib/marketing-round2-controlled-deploy.mjs','utf8');
const original='export function openRecordingSession(container, env, applicationName, database = "postgres") {\n  return openDatabaseSession(container, env, applicationName, database, "postgres");\n}';
assert.equal(source.split(original).length,2);
const fixture=source.replace(original,'export function openRecordingSession() { return globalThis.__cookingReadUnitSession; }')
 .replace(/from (["'])(\.\/[^"'\n]+)\1/gu,(_all,_quote,relative)=>`from "${pathToFileURL(resolve('scripts/lib',relative)).href}"`);
const fixturePath=join(directory,'fixture.mjs');writeFileSync(fixturePath,fixture,{mode:0o600});
const owned=await import(pathToFileURL(fixturePath).href);
after(()=>{delete globalThis.__cookingReadUnitSession;});

test('cooking observation uses fixed async read-only SQL and host budgets',async()=>{
 let completed=false,closed=false,stopped=false;
 globalThis.__cookingReadUnitSession={async query(sql,timeout){
  assert.match(sql,/^BEGIN READ ONLY; SET LOCAL statement_timeout='90s'; SET LOCAL transaction_timeout='90s'; SELECT 7;\nCOMMIT;$/u);
  assert.equal(timeout,95000);await new Promise(r=>setTimeout(r,10));completed=true;return '7';
 },async close(){assert(completed);closed=true;return 0;},stop(){stopped=true;}};
 assert.equal(await owned.readCookingRecordingObservation('owned',{},'SELECT 7;'),'7');
 assert(closed);assert.equal(stopped,false);
});

test('observation failure stops its session and withholds SQL diagnostics',async()=>{
 let stopped=false;
 globalThis.__cookingReadUnitSession={async query(){throw new Error('synthetic private SQL diagnostic');},async close(){throw new Error('must not close failed session');},stop(){stopped=true;}};
 await assert.rejects(owned.readCookingRecordingObservation('owned',{},'SELECT 7;'),{message:'Cooking read-only observation failed; output withheld'});
 assert(stopped);
});

test('nonzero session close cannot return an accepted observation',async()=>{
 let stopped=false;
 globalThis.__cookingReadUnitSession={async query(){return '7';},async close(){return 9;},stop(){stopped=true;}};
 await assert.rejects(owned.readCookingRecordingObservation('owned',{},'SELECT 7;'),/output withheld/u);assert(stopped);
});

test('owned network-none PostgreSQL: long SELECT, read-only rejection, server timeout and live monitor',{
 skip:process.env.HOMECOOK_COOKING_RESPONSIVE_READS_PG!=='1',timeout:150000,
},async()=>{
 const image='public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a';
 const tag=randomBytes(16).toString('hex');
 const env=Object.fromEntries(['PATH','LANG','LC_ALL','TMPDIR'].filter(key=>process.env[key]).map(key=>[key,process.env[key]]));
 env.DOCKER_HOST=readPinnedLocalDockerTarget().docker_host;
 const report={schema:'homecook.cooking-responsive-read-fixture.v1',runId:tag,status:'RUNNING',productionConnections:0,network:'none',mounts:0,ports:0,syntheticRowsOnly:true};
 const reportPath='/tmp/homecook-cooking-responsive-reads-report.json';
 const save=()=>writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});save();
 const command=(args,input)=>{const r=spawnSync('docker',args,{env,input,encoding:'utf8',timeout:15000,maxBuffer:4*1024*1024});assert.equal(r.status,0,'Owned fixture command failed; output withheld');return r.stdout.trim();};
 let container;
 const imageId=command(['image','inspect','--format','{{.Id}}',image]);
 const own=()=>assert.equal(command(['inspect','--format','{{.Image}}|{{.HostConfig.NetworkMode}}|{{len .Mounts}}|{{len .HostConfig.PortBindings}}|{{index .Config.Labels "homecook.cooking-responsive-read-test"}}',container]),`${imageId}|none|0|0|${tag}`);
 const exec=(args,input)=>{own();return command(['exec','-i',container,...args],input);};
 const query=sql=>exec(['psql','-h','/var/run/postgresql','-U','postgres','-d','postgres','-XAtq','-v','ON_ERROR_STOP=1'],sql);
 try {
  container=command(['run','--detach','--pull=never','--network','none','--user','postgres','--label',`homecook.cooking-responsive-read-test=${tag}`,'--entrypoint','/bin/sh',image,'-c','exec sleep infinity']);
  assert.match(container,/^[a-f0-9]{64}$/u);own();
  exec(['mkdir','-p','/var/run/postgresql']);
  exec(['initdb','-D','/tmp/cooking-read-pg','-U','postgres','--auth-local=trust','--auth-host=reject']);
  exec(['pg_ctl','-D','/tmp/cooking-read-pg','-o',"-h '' -k /var/run/postgresql",'-l','/tmp/cooking-read-pg.log','-w','start']);
  query('create table public.cooking_read_fixture(id integer);');
  let ticks=0;const monitor=setInterval(()=>{ticks++;},100);
  try {
   own();const started=Date.now();
   assert.equal(await readCookingRecordingObservation(container,env,"SELECT 'long-select-ok' FROM pg_sleep(5.2);"),'long-select-ok');
   report.longSelectMs=Date.now()-started;report.monitorTicksDuringLongSelect=ticks;
   assert(report.longSelectMs>=5200);assert(ticks>=40);
  } finally {clearInterval(monitor);}
  assert.equal(await readCookingRecordingObservation(container,env,"SELECT current_setting('transaction_read_only')||'|'||current_setting('statement_timeout')||'|'||current_setting('transaction_timeout');"),'on|90s|90s');
  await assert.rejects(readCookingRecordingObservation(container,env,'INSERT INTO public.cooking_read_fixture VALUES(1);'),/output withheld/u);
  assert.equal(query('select count(*) from public.cooking_read_fixture;'),'0');report.readOnlyRejectedWrite=true;
  let timeoutTicks=0;const timer=setInterval(()=>{timeoutTicks++;},100);const began=Date.now();
  try {await assert.rejects(readCookingRecordingObservation(container,env,'SELECT pg_sleep(91);'),/output withheld/u);}
  finally {clearInterval(timer);}
  report.serverTimeoutMs=Date.now()-began;report.monitorTicksDuringTimeout=timeoutTicks;
  assert(report.serverTimeoutMs>=89000&&report.serverTimeoutMs<95000);assert(timeoutTicks>=800);
  assert.equal(await readCookingRecordingObservation(container,env,'SELECT 1;'),'1');
  assert.equal(query("select count(*) from pg_stat_activity where application_name like 'cooking-observe-%';"),'0');
  report.sessionsClosed=true;report.sourceSha256=createHash('sha256').update(source).digest('hex');report.status='PASS';
 } catch(error) {report.status='FAIL';report.error=error.message;throw error;}
 finally {
  if(container){own();command(['rm','--force',container]);const r=spawnSync('docker',['inspect',container],{env,encoding:'utf8',timeout:15000});assert.notEqual(r.status,0);report.cleanupCompleted=true;}
  save();
 }
});
