#!/usr/bin/env node
// Disposable local PostgreSQL/PostgREST gate. Never selects an existing project.
import { isDeepStrictEqual } from 'node:util';
import { writeFileSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import { readFile, writeFile, unlink, mkdir, lstat, realpath, rmdir } from 'node:fs/promises';
import { createHmac, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  createIsolatedSupabaseProject, readPinnedLocalDockerTarget,
  assertNoIsolatedDockerResources, assertOwnedDockerResources,
  assertPinnedSupabaseCliVersion, buildSupabaseCliArgs,
  buildIsolatedSupabaseStartArgs, removeIsolatedDockerResources,
  buildIsolatedDataApiContainerArgs, readIsolatedDockerResourceInventory,
  waitForIsolatedDataApi,
} from './lib/local-supabase-isolated-runtime.mjs';

const root = process.cwd();
const target = readPinnedLocalDockerTarget();
const isolated = await createIsolatedSupabaseProject(root);
const env = await isolated.buildCommandEnv(process.env, { dockerHost: target.docker_host });
function run(command, args, input) {
  const result = spawnSync(command, args, { env, cwd: isolated.rootDir, input, encoding: 'utf8', timeout: 300000, maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) { writeFileSync(`${root}/.omx/artifacts/r2-stage2/sql-subprocess-error.log`, String(result.stdout)+String(result.stderr)); throw new Error(`Isolated gate subprocess failed: ${command}; ${String(result.stderr).match(/ERROR[^\n]*/)?.[0] ?? String(result.stderr).slice(-1200)}`); }
  return result.stdout;
}
function cli(args) { return run('corepack', ['pnpm', ...buildSupabaseCliArgs(args, { workdir: isolated.rootDir })]); }
function sql(input) { return run('docker', ['exec', '-i', `supabase_db_${isolated.projectId}`, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-At'], input).trim(); }
let started = false;
try {
  const version = assertPinnedSupabaseCliVersion(cli(['--version']));
  assertNoIsolatedDockerResources(isolated.projectId, { env });
  const migrationName = '20260911100000_marketing_round2.sql';
  const migrationSource=await readFile(`${isolated.rootDir}/supabase/migrations/${migrationName}`,'utf8');
  await unlink(`${isolated.rootDir}/supabase/migrations/${migrationName}`);
  started = true;
  console.warn(JSON.stringify({ phase:'starting-isolated', projectId:isolated.projectId }));
  run('corepack', ['pnpm', ...buildIsolatedSupabaseStartArgs(isolated.rootDir)]);
  assertOwnedDockerResources(isolated.projectId, { env });
  console.warn(JSON.stringify({ phase: 'migration-replay', cliVersion: version, migrationSha256: isolated.migrationSha256, projectId: isolated.projectId }));
  sql(migrationSource);
  sql("select 'public.marketing_round2_apply(jsonb)'::regprocedure;");
  await runAssertions({ isolated, env, sql, run });
  console.warn(JSON.stringify({ result: 'PASS', projectId: isolated.projectId, productionWrites: 0, remoteAccess: 0 }));
} finally {
  if (started) removeIsolatedDockerResources(isolated.projectId, { env });
  assertNoIsolatedDockerResources(isolated.projectId, { env });
  await isolated.removeFiles();
}
async function runAssertions({ isolated, env, sql, run }) {
  const checks = [];
  function assert(value, name) { if (!value) throw new Error(`Assertion failed: ${name}`); checks.push(name); }
  function equal(actual, expected, name) { assert(isDeepStrictEqual(actual, expected), name); }
  // Keep the underlying database from recording PII on failed bound statements.
  run('docker', ['exec','-i',`supabase_db_${isolated.projectId}`,'psql','-U','supabase_admin','-d','postgres','-X','-v','ON_ERROR_STOP=1'], "alter system set log_statement='none'; alter system set log_min_error_statement='panic'; alter system set log_parameter_max_length=0; alter system set log_parameter_max_length_on_error=0; alter system set log_error_verbosity='terse'; select pg_reload_conf();");
  equal(sql("select current_setting('log_statement') || ':' || current_setting('log_min_error_statement') || ':' || current_setting('log_parameter_max_length_on_error')"), 'none:panic:0', 'backend statement/parameter privacy');
  assert(sql("select proowner::regrole::text='postgres' and prosecdef and provolatile='v' and proconfig @> array['search_path=pg_catalog, pg_temp','statement_timeout=8s','lock_timeout=2s'] from pg_proc where oid='public.marketing_round2_apply(jsonb)'::regprocedure") === 't', 'exact RPC owner/volatility/settings');
  equal(sql("select count(*) from pg_class where relnamespace='public'::regnamespace and relname in ('marketing_round2_participations','marketing_round2_events','marketing_round2_lead_requests') and relrowsecurity and relforcerowsecurity"), '3', 'FORCE RLS all tables');
  equal(sql("select count(*) from pg_trigger where tgname='marketing_round2_consistency' and tgdeferrable and tginitdeferred"), '3', 'three deferred constraint triggers');
  sql(`insert into public.marketing_validation_sessions(id,campaign_key,creative_key,audience_key,attribution_status,viewed_at,quiz_started_at,quiz_completed_at,quiz_result,quiz_answers,target_qualified,solution_viewed_at,intent_choice,intent_clicked_at,email,consent_version,consented_at,turnstile_verified_at,lead_submitted_at,lead_submission_status,retention_until)
  select gen_random_uuid(),'isolated_legacy_fixture','legacy_fixture','fixture','organic',t,t,t,'ingredient_reentry','{}'::jsonb,true,t,'needed',t,email,'fixture',t,t,t,status,retention
  from (values ('legacy@example.com','accepted',clock_timestamp()+interval '1 day'),('expired@example.com','accepted',clock_timestamp()-interval '1 day'),(null,'duplicate',clock_timestamp()+interval '1 day')) as fixture(email,status,retention) cross join lateral (select clock_timestamp()-interval '1 hour' as t) at;`);
  const beforeLegacy = sql("select md5(coalesce(string_agg(row_to_json(v)::text,',' order by id),'')) from public.marketing_validation_sessions v");
  const restEnv = (await readFile(isolated.dataApiEnvironmentFilePath, 'utf8')).replace('/homecook_gate_api', '/postgres') + '\nPGRST_DB_PRE_REQUEST=public.verify_hybrid_request_authority_pre_request\nPGRST_DB_TX_END=commit\nPGRST_DB_HOISTED_TX_SETTINGS=statement_timeout,lock_timeout\nPGRST_LOG_LEVEL=crit\n';
  await writeFile(isolated.dataApiEnvironmentFilePath, restEnv, { mode: 0o600 });
  const inventory = readIsolatedDockerResourceInventory(isolated.projectId, { env });
  run('docker', buildIsolatedDataApiContainerArgs({ containerName: `homecook_gate_rest_${isolated.projectId}`, environmentFilePath: isolated.dataApiEnvironmentFilePath, networkId: inventory.networks[0].id, port: isolated.basePort + 7, projectId: isolated.projectId }));
  function jwt(role) {
    const header = Buffer.from(JSON.stringify({ alg:'HS256',typ:'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ role, exp:Math.floor(Date.now()/1000)+3600 })).toString('base64url');
    return `${header}.${payload}.${createHmac('sha256',isolated.dataApiJwtSecret).update(`${header}.${payload}`).digest('base64url')}`;
  }
  const token = jwt('service_role');
  const client = createClient(`${isolated.dataApiUrl}`, token, { auth:{ persistSession:false,autoRefreshToken:false,detectSessionInUrl:false }, global:{ headers:{ 'x-homecook-internal-scope':'marketing-round2' } } });
  // Supabase SDK appends /rest/v1; the fixture PostgREST is deliberately unproxied.
  client.rest.url = isolated.dataApiUrl;
  const attribution = { first_channel:'direct',utm_source:null,utm_medium:null,utm_campaign:null,utm_content:null };
  const digest = (value) => createHmac('sha256','isolated-fixture-only-not-production').update(JSON.stringify(value)).digest('hex');
  function control(overrides={}) { const now = Date.now(); return { collection_enabled:true,lead_enabled:true,consent_generation:1,checked_at:new Date(now).toISOString(),valid_until:new Date(now+10000).toISOString(),...overrides }; }
  function command({action='bootstrap',topic='recording',pid=null,event=randomUUID(),payload=attribution,activity='menu',...rest}={}) {
    return { op:'apply',action,event_id:event,topic,round_version:'r2.1',participation_id:pid,bootstrap_intent:action==='bootstrap'?'create_or_resume':null,bootstrap_digest:action==='bootstrap'?digest(randomUUID()):null,activity,payload,payload_digest:digest({action,topic,activity,payload}),lead:null,control:control(),...rest };
  }
  async function rpc(cmd) { return client.rpc('marketing_round2_apply', { p_command:{ ...cmd,control:cmd.control??control() } }); }
  async function ok(cmd,name) { const {data,error}=await rpc(cmd); if(error) throw new Error(`${name}: ${error.code}/${error.message}`); assert(data?.kind === (cmd.op==='inspect'?'inspected':'applied'),name); return data; }
  async function denied(cmd,code,name) { const {data,error}=await rpc(cmd); assert(!data && error?.message===code,`${name} (${error?.code}/${error?.message})`); }
  function count() { return sql("select (select count(*) from public.marketing_round2_participations)||':'||(select count(*) from public.marketing_round2_events)||':'||(select count(*) from public.marketing_round2_lead_requests)"); }
  const b=command();
  await waitForIsolatedDataApi({ url:isolated.dataApiUrl, fetchImpl:async()=>{ const result=await rpc({...b,op:'inspect',control:control()}); if(result.error) throw new Error(`${result.error.code}/${result.error.message}`); return {ok:true,status:result.status}; }});
  const inspection=await ok({...b,op:'inspect'},'inspect absent');
  equal(inspection,{kind:'inspected',data:null,bootstrap:null,replay:'absent',needs_turnstile:false},'exact absent inspect');
  equal(count(),'0:0:0','inspect writes zero');
  const initial=await ok(b,'bootstrap atomic commit'); const pid=initial.data.participation_id;
  equal(count(),'1:1:0','bootstrap one parent/event and no lead');
  equal(initial.data.revision,1,'bootstrap revision one');
  assert(initial.cookie_claims.pid===pid && initial.cookie_claims.exp>initial.cookie_claims.iat,'bootstrap cookie claims');
  equal((await ok(b,'bootstrap replay')).data,initial.data,'same bootstrap identity');
  equal(count(),'1:1:0','same event replay writes zero');
  const resumed=await ok({...b,event_id:randomUUID(),bootstrap_intent:'resume'},'confirmed key resume');
  equal(resumed.data.participation_id,pid,'resume same parent');
  equal(resumed.cookie_claims,initial.cookie_claims,'resume fixed cookie expiry');
  await denied({...command(),bootstrap_intent:'resume'},'PARTICIPATION_EXPIRED','confirmed missing key never recreates');
  await denied({...command(),participation_id:pid},'BOOTSTRAP_CONFLICT','cookie/key mismatch');
  await denied({...command(),event_id:b.event_id},'EVENT_CONFLICT','cross owner global event id');
  function action(name,activity,payload={},extra={}) { return command({action:name,activity,payload,pid,...extra}); }
  await denied(action('example_complete','example'),'INVALID_TRANSITION','complete without start');
  await denied(action('survey_submit','survey',{survey_version:'r2.1-recording',answers:{q1:'none',q2:'other',q3:'none',q4:'no'}}),'INVALID_TRANSITION','survey without start');
  const cookieInspect=command({pid,op:'inspect',bootstrap_intent:'cookie_resume',bootstrap_digest:null,payload:{},payload_digest:null});
  const ci=await ok(cookieInspect,'cookie resume inspect');
  equal(ci.bootstrap.first_attribution,attribution,'cookie resume stored attribution');
  const cookieApply={...cookieInspect,op:'apply',payload:attribution,payload_digest:b.payload_digest};
  const cr=await ok(cookieApply,'cookie resume apply'); equal(cr.data.revision,1,'cookie resume no-op');
  const wrongAttribution={...attribution,first_channel:'unknown'};
  await denied({...cookieApply,event_id:randomUUID(),payload:wrongAttribution,payload_digest:digest({action:'bootstrap',topic:'recording',activity:'menu',payload:wrongAttribution})},'EVENT_CONFLICT','cookie resume must use stored first attribution');
  const deletedKey=command(); const deletedBootstrap=await ok(deletedKey,'deleted-cookie fixture bootstrap');
  sql(`delete from public.marketing_round2_participations where id='${deletedBootstrap.data.participation_id}';`);
  await denied({...deletedKey,participation_id:deletedBootstrap.data.participation_id},'PARTICIPATION_EXPIRED','deleted signed cookie key create_or_resume 410');
  await denied({...command(),participation_id:deletedBootstrap.data.participation_id},'PARTICIPATION_EXPIRED','deleted signed cookie different key 410');
  await denied({...deletedKey,participation_id:deletedBootstrap.data.participation_id,bootstrap_intent:'resume'},'PARTICIPATION_EXPIRED','deleted signed cookie confirmed resume 410');
  const startSurvey=action('activity_start','survey'); await ok(startSurvey,'survey starts independently');
  await ok(action('activity_start','example'),'example start');
  await ok(action('example_complete','example'),'example complete');
  const survey=action('survey_submit','survey',{survey_version:'r2.1-recording',answers:{q1:'none',q2:'reuse_saved',q3:'none',q4:'no'}});
  const surveyDone=await ok(survey,'survey complete negative answers');
  equal(surveyDone.data.state,{example:'completed',survey:'completed',lead:'not_started'},'independent state retained');
  equal(sql(`select survey_example_at_start||':'||survey_example_at_submit from public.marketing_round2_participations where id='${pid}'`),'not_started:completed','survey stores separate server snapshots');
  equal((await ok({...survey,event_id:randomUUID()},'same survey new id no-op')).data.revision,surveyDone.data.revision,'survey no-op revision');
  await denied({...survey,payload:{...survey.payload,answers:{...survey.payload.answers,q4:'yes'}},event_id:randomUUID()},'ACTIVITY_ALREADY_COMPLETED','survey immutable answers');
  const legacyCount=count();
  await denied({...survey,payload:{...survey.payload,answers:{...survey.payload.answers,extra:'leak'}},event_id:randomUUID()},'VALIDATION_ERROR','unknown survey answer rejected'); equal(count(),legacyCount,'invalid survey no writes');
  await denied({...survey,extra:'unknown'},'VALIDATION_ERROR','internal unknown key');
  await denied({...survey,payload:null},'VALIDATION_ERROR','internal null payload');
  await denied({...survey,control:control({collection_enabled:false})},'ROUND2_DISABLED','replay cannot bypass collection gate');
  await denied({...survey,control:control({checked_at:new Date(Date.now()-11000).toISOString(),valid_until:new Date(Date.now()-1000).toISOString()})},'ROUND2_UNAVAILABLE','expired control');
  await ok(action('activity_start','lead'),'lead start');
  function leadCommand(participationId=pid,topic='recording',email='preview@example.com') {
    return command({action:'lead_submit',activity:'lead',payload:{},pid:participationId,topic,lead:{email_normalized:email,email_key:digest(email),request_digest:digest({email,topic,generation:1}),consent_version:'mumeok-r2-beta-notice-20260911',purpose:'beta_open_notice',consent_generation:1,turnstile_verified_at:new Date(Date.now()-1000).toISOString()}});
  }
  const lead=leadCommand();
  const li=await ok({...lead,op:'inspect',lead:{...lead.lead,turnstile_verified_at:null}},'lead inspect needs provider'); assert(li.needs_turnstile,'provider needed for new lead');
  await denied({...lead,lead:{...lead.lead,turnstile_verified_at:null}},'TURNSTILE_FAILED','apply requires verified provider');
  // Actual table-trigger fault injection after each atomic boundary; the public RPC has no fault switch.
  for (const table of ['marketing_round2_events','marketing_round2_lead_requests','marketing_round2_participations']) {
    sql(`create function private.r2_fixture_fault() returns trigger language plpgsql as $$ begin raise exception 'FIXTURE_FAILURE'; end $$; create trigger r2_fixture_fault after ${table==='marketing_round2_participations'?'update':'insert'} on public.${table} for each row execute function private.r2_fixture_fault();`);
    const previous=count(); const response=await rpc(lead); assert(response.error,'fault raises error'); equal(count(),previous,`atomic rollback after ${table}`);
    sql(`drop trigger r2_fixture_fault on public.${table}; drop function private.r2_fixture_fault();`);
  }
  const leadDone=await ok(lead,'lead commits event/lead/state together');
  equal(leadDone.data.receipt,{event_id:lead.event_id,status:'received'},'exact server receipt');
  const leadReplay={...lead,lead:{...lead.lead,turnstile_verified_at:null}};
  equal((await ok(leadReplay,'tokenless exact receipt replay')).data.receipt,leadDone.data.receipt,'same receipt preserved');
  const receiptInspect=await ok({...leadReplay,op:'inspect'},'receipt inspect'); assert(!receiptInspect.needs_turnstile,'receipt does not require provider');
  await denied({...leadReplay,event_id:randomUUID()},'ACTIVITY_ALREADY_COMPLETED','new lead id not aliased');
  await denied({...leadReplay,lead:{...leadReplay.lead,request_digest:digest('different')}},'EVENT_CONFLICT','changed lead receipt payload');
  await denied({...leadReplay,control:control({consent_generation:2})},'CONSENT_REFRESH_REQUIRED','stale receipt generation');
  await denied({...leadReplay,control:control({lead_enabled:false})},'LEAD_CAPTURE_NOT_READY','receipt current lead gate');
  const newHome=await ok(command({topic:'homeflow'}),'homeflow bootstrap');
  await ok(command({action:'activity_start',activity:'lead',payload:{},topic:'homeflow',pid:newHome.data.participation_id}),'homeflow lead independent');
  const homeLead=leadCommand(newHome.data.participation_id,'homeflow'); await ok(homeLead,'same email other topic');
  equal(sql("select count(*) from public.marketing_round2_lead_requests where topic_status='new_topic'"),'2','same email one new-topic row per topic');
  equal(sql("select contact_observation from public.marketing_round2_lead_requests where topic='homeflow'"),'existing_round2','cross topic contact observation');
  for (const [email,observation] of [['legacy@example.com','existing_legacy'],['expired@example.com','new_observed'],['duplicate@example.com','new_observed']]) {
    const created=await ok(command(),'legacy contact fixture bootstrap'); await ok(command({action:'activity_start',activity:'lead',payload:{},pid:created.data.participation_id}),'legacy contact fixture lead start');
    const submitted=leadCommand(created.data.participation_id,'recording',email); await ok(submitted,'legacy accepted/expired/duplicate observation');
    equal(sql(`select contact_observation from public.marketing_round2_lead_requests where request_id='${submitted.event_id}'`),observation,'legacy only accepted and retained email matches');
  }
  // Twenty independent participants contend for one topic/email; exactly one representative remains.
  const contenders=[];
  for(let i=0;i<20;i++) { const created=await ok(command(),'parallel fixture bootstrap'); await ok(command({action:'activity_start',activity:'lead',payload:{},pid:created.data.participation_id}),'parallel fixture lead start'); contenders.push(leadCommand(created.data.participation_id,'recording','parallel@example.com')); }
  const parallel=await Promise.all(contenders.map(c=>rpc({...c,control:control()})));
  assert(parallel.every(r=>r.data?.kind==='applied'&&!r.error),'twenty concurrent lead transactions');
  equal(sql("select count(*)||':'||count(email_normalized)||':'||count(*) filter(where topic_status='new_topic') from public.marketing_round2_lead_requests where email_key=decode('"+digest('parallel@example.com')+"','hex')"),'20:1:1','parallel uniqueness and repeat email NULL');
  // Hold only this fresh fixture's table until both SDK requests are observed waiting.
  // This establishes overlapping transactions without relying on request-start timing.
  async function concurrentApply(commands,name) {
    const relation='public.marketing_round2_participations';
    const holder=spawn('docker',['exec','-i',`supabase_db_${isolated.projectId}`,'psql','-U','postgres','-d','postgres','-X','-v','ON_ERROR_STOP=1'],{env,stdio:['pipe','ignore','ignore']});
    const closed=new Promise((resolve,reject)=>{holder.once('exit',code=>code===0?resolve():reject(new Error('isolated concurrency barrier failed')));holder.once('error',reject);});
    holder.stdin.write(`begin; lock table ${relation} in access exclusive mode;\n`);
    async function waitForLock(condition,label) {
      for(let attempt=0;attempt<50;attempt++) {
        // Same-key bootstrap serializes on its advisory lock before reading the table.
        if(sql(`select ${condition} from pg_locks where relation='${relation}'::regclass or (locktype='advisory' and pid in (select pid from pg_stat_activity where query like '%marketing_round2_apply%'))`)==='t') return;
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      throw new Error(`Isolated concurrency barrier not reached: ${label}`);
    }
    let pending;
    try {
      await waitForLock("count(*) filter(where mode='AccessExclusiveLock' and granted)=1",name);
      pending=Promise.all(commands.map(cmd=>rpc({...cmd,control:control()})));
      await waitForLock(`count(distinct pid) filter(where not granted)>=${commands.length}`,name);
      assert(true,`${name}: both RPC transactions observed waiting`);
    } finally {
      holder.stdin.end('commit;\n');
      await closed;
    }
    return pending;
  }
  for(const sameEvent of [true,false]) {
    const label=`same-key bootstrap concurrent ${sameEvent?'same':'different'} event`;
    const first=command();
    const second=sameEvent?{...first}:command({bootstrap_digest:first.bootstrap_digest,payload:{...attribution,first_channel:'unknown'}});
    const responses=await concurrentApply([first,second],label);
    assert(responses.every(response=>!response.error&&response.data?.kind==='applied'),`${label}: both succeed`);
    const concurrentPid=responses[0].data.data.participation_id;
    equal(responses[1].data.data.participation_id,concurrentPid,`${label}: one identity`);
    equal(responses.map(response=>response.data.data.revision),[1,1],`${label}: revision stays one`);
    equal(responses[0].data.cookie_claims,responses[1].data.cookie_claims,`${label}: fixed cookie claims`);
    equal(sql(`select count(*) from public.marketing_round2_participations where bootstrap_digest=decode('${first.bootstrap_digest}','hex')`),'1',`${label}: one parent`);
    equal(sql(`select count(*)||':'||count(*) filter(where applied) from public.marketing_round2_events where participation_id='${concurrentPid}'`),sameEvent?'1:1':'2:1',`${label}: exactly one applied event`);
    assert(sql(`select p.first_channel=e.payload->>'first_channel' from public.marketing_round2_participations p join public.marketing_round2_events e on e.participation_id=p.id where p.id='${concurrentPid}' and e.applied`)==='t',`${label}: winner attribution retained`);
  }
  for(const sameEvent of [true,false]) {
    const label=`same-participant lead concurrent ${sameEvent?'same':'different'} event`;
    const created=await ok(command(),`${label}: bootstrap`); const concurrentPid=created.data.participation_id;
    await ok(command({action:'activity_start',activity:'lead',payload:{},pid:concurrentPid}),`${label}: start`);
    const first=leadCommand(concurrentPid,'recording',`same-participant-${randomUUID()}@example.com`);
    const second={...first,event_id:sameEvent?first.event_id:randomUUID()};
    const responses=await concurrentApply([first,second],label);
    const successes=responses.filter(response=>response.data?.kind==='applied'&&!response.error);
    equal(successes.length,sameEvent?2:1,`${label}: success count`);
    if(sameEvent) equal(successes[0].data.data.receipt,successes[1].data.data.receipt,`${label}: same receipt`);
    else equal(responses.filter(response=>response.error).map(response=>[response.error.code,response.error.message]),[['PT409','ACTIVITY_ALREADY_COMPLETED']],`${label}: second event rejected`);
    const receipt=successes[0].data.data.receipt;
    equal(sql(`select revision||':'||(select count(*) from public.marketing_round2_events where participation_id=p.id)||':'||(select count(*) from public.marketing_round2_lead_requests where participation_id=p.id) from public.marketing_round2_participations p where id='${concurrentPid}'`),'3:3:1',`${label}: one atomic completion`);
    equal(sql(`select request_id::text from public.marketing_round2_lead_requests where participation_id='${concurrentPid}'`),receipt.event_id,`${label}: winning receipt persisted`);
  }
  for(const activity of ['survey','lead']) {
    const label=`inspect then competing ${activity} commit`;
    const created=await ok(command(),`${label}: bootstrap`); const racePid=created.data.participation_id;
    await ok(command({action:'activity_start',activity,payload:{},pid:racePid}),`${label}: start`);
    const pending=activity==='survey'
      ?command({action:'survey_submit',activity,pid:racePid,payload:{survey_version:'r2.1-recording',answers:{q1:'none',q2:'other',q3:'none',q4:'no'}}})
      :leadCommand(racePid,'recording',`inspect-race-${randomUUID()}@example.com`);
    const beforeInspect=count();
    const inspected=await ok({...pending,op:'inspect',lead:pending.lead?{...pending.lead,turnstile_verified_at:null}:null},`${label}: inspect succeeds`);
    equal(count(),beforeInspect,`${label}: inspect writes zero`);
    equal(inspected.replay,'absent',`${label}: no prior event`);
    const winner=activity==='survey'
      ?command({action:'survey_submit',activity,pid:racePid,payload:{...pending.payload,answers:{...pending.payload.answers,q4:'yes'}}})
      :{...pending,event_id:randomUUID()};
    const committed=await ok({...winner,control:control()},`${label}: competing request commits`);
    const afterWinner=count();
    await denied({...pending,control:control()},'ACTIVITY_ALREADY_COMPLETED',`${label}: apply rechecks current state`);
    equal(count(),afterWinner,`${label}: losing apply writes zero`);
    equal(sql(`select count(*) from public.marketing_round2_events where event_id='${pending.event_id}'`),'0',`${label}: losing ID not reserved`);
    equal((await ok({...winner,control:control()},`${label}: winner replay`)).data,committed.data,`${label}: winning completion preserved`);
  }
  // Deferred consistency rejects partial edits even by a maintenance owner with a deadline.
  function rejectedSql(body,name) { let failed=false; try {sql(body);} catch {failed=true;} assert(failed,name); }
  rejectedSql(`begin; update public.marketing_round2_participations set revision=revision+1 where id='${pid}'; commit;`,'direct state mutation without GUC denied');
  rejectedSql(`begin; select set_config('homecook.r2_valid_until',(clock_timestamp()+interval '10 seconds')::text,true); delete from public.marketing_round2_events where event_id='${survey.event_id}'; commit;`,'partial success event deletion denied');
  rejectedSql(`begin; select set_config('homecook.r2_valid_until',(clock_timestamp()+interval '10 seconds')::text,true); update public.marketing_round2_participations set revision=revision+1 where id='${pid}'; commit;`,'revision differs from applied events rejected');
  rejectedSql(`begin; select set_config('homecook.r2_valid_until',(clock_timestamp()+interval '10 seconds')::text,true); update public.marketing_round2_participations set survey_example_at_submit='started' where id='${pid}'; commit;`,'survey event projection mismatch rejected');
  // Check deadline at commit, not the transaction start.
  rejectedSql(`begin; select set_config('homecook.r2_valid_until',(clock_timestamp()+interval '30 milliseconds')::text,true); update public.marketing_round2_participations set revision=revision where id='${pid}'; select pg_sleep(0.06); commit;`,'deferred deadline expires during transaction');
  sql(`delete from public.marketing_round2_participations where id='${newHome.data.participation_id}';`);
  equal(sql(`select (select count(*) from public.marketing_round2_events where participation_id='${newHome.data.participation_id}')||':'||(select count(*) from public.marketing_round2_lead_requests where participation_id='${newHome.data.participation_id}')`),'0:0','parent retention deletion cascades without GUC');
  await denied({...homeLead,control:control(),lead:{...homeLead.lead,turnstile_verified_at:null}},'PARTICIPATION_EXPIRED','deleted cookie participation 410');
  // Role/scope authority is enforced both before and inside SECURITY DEFINER.
  for(const role of ['anon','authenticated','service_role']) for(const table of ['marketing_round2_participations','marketing_round2_events','marketing_round2_lead_requests']) {
    assert(sql(`select has_table_privilege('${role}','public.${table}','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')`) === 'f', `${role} ${table} no direct grants`);
    const res=await fetch(`${isolated.dataApiUrl}/${table}`,{headers:{Authorization:`Bearer ${jwt(role)}`,'x-homecook-internal-scope':'marketing-round2'}}); assert(res.status>=400,`${role} table GET denied`);
  }
  for(const headers of [{Authorization:`Bearer ${jwt('anon')}`,'x-homecook-internal-scope':'marketing-round2'},{Authorization:`Bearer ${jwt('authenticated')}`,'x-homecook-internal-scope':'marketing-round2'},{Authorization:`Bearer ${token}`},{Authorization:`Bearer ${token}`,'x-homecook-internal-scope':'marketing-validation'}]) {
    const res=await fetch(`${isolated.dataApiUrl}/rpc/marketing_round2_apply`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({p_command:b})}); assert(res.status>=400,'wrong role/missing/wrong scope denied');
  }
  const getRpc=await fetch(`${isolated.dataApiUrl}/rpc/marketing_round2_apply?p_command=${encodeURIComponent(JSON.stringify(b))}`,{headers:{Authorization:`Bearer ${token}`,'x-homecook-internal-scope':'marketing-round2'}}); assert(getRpc.status>=400,'GET RPC denied');
  const wrongRpc=await fetch(`${isolated.dataApiUrl}/rpc/complete_cooking_session`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'x-homecook-internal-scope':'marketing-round2','Content-Type':'application/json'},body:'{}'}); assert(wrongRpc.status>=400,'other RPC denied');
  assert(!JSON.stringify(leadDone).includes('preview@example.com')&&!JSON.stringify(leadDone).includes('request_digest'),'public RPC result no PII');
  equal(sql("select count(*) from public.marketing_round2_events where payload::text like '%@%' or payload ?| array['email','email_key','request_digest','token','bootstrap_digest']"),'0','event payload has no PII/digests');
  equal(sql("select md5(coalesce(string_agg(row_to_json(v)::text,',' order by id),'')) from public.marketing_validation_sessions v"),beforeLegacy,'legacy rows unchanged');
  async function lockedFailure(table,cmd,name) {
    const before=count();
    const child=spawn('docker',['exec',`supabase_db_${isolated.projectId}`,'psql','-U','postgres','-d','postgres','-X','-v','ON_ERROR_STOP=1','-c',`begin; lock table public.${table} in access exclusive mode; select pg_sleep(3); commit;`],{env,stdio:'ignore'});
    const closed=new Promise((resolve,reject)=>{child.once('exit',code=>code===0?resolve():reject(new Error('isolated lock fixture failed')));child.once('error',reject);});
    try {
      let ready=false;
      for(let attempt=0;attempt<100;attempt++) { if(sql(`select exists(select 1 from pg_locks where relation='public.${table}'::regclass and mode='AccessExclusiveLock' and granted)`) === 't') { ready=true; break; } await new Promise(resolve=>setTimeout(resolve,10)); }
      assert(ready,'isolated exclusive lock acquired');
      const response=await rpc({...cmd,control:control()}); assert(response.error?.code==='55P03',name); equal(count(),before,`${name} atomic rollback`);
    } finally { await closed; }
  }
  await lockedFailure('marketing_round2_participations',action('menu_return','menu',{from_activity:'survey'}),'actual RPC 2 second row lock timeout');
  const lookupBootstrap=await ok(command(),'lookup failure fixture bootstrap');
  await ok(command({action:'activity_start',activity:'lead',payload:{},pid:lookupBootstrap.data.participation_id}),'lookup failure fixture lead start');
  await lockedFailure('marketing_validation_sessions',leadCommand(lookupBootstrap.data.participation_id,'recording','lookup@example.com'),'legacy lookup unavailable rejects instead of assuming new');
  // Real top-level timeout hoisting, not merely a pg_proc setting inspection.
  sql(`create function private.r2_fixture_timeout() returns trigger language plpgsql as $$ begin perform pg_sleep(8.5); return NEW; end $$; create trigger r2_fixture_timeout after insert on public.marketing_round2_events for each row execute function private.r2_fixture_timeout();`);
  const beforeTimeout=count(); const startedTimeout=Date.now();
  const timeoutResponse=await rpc({...action('menu_return','menu',{from_activity:'example'}),control:control()});
  assert(timeoutResponse.error?.code==='57014' && Date.now()-startedTimeout<8500,'PostgREST hoists actual 8 second statement timeout'); equal(count(),beforeTimeout,'statement timeout rolls event back');
  sql('drop trigger r2_fixture_timeout on public.marketing_round2_events; drop function private.r2_fixture_timeout();');
  // Additional coverage of the existing state contract: three single activities and all six orders, for both topics.
  const orders=[['example','survey','lead'],['example','lead','survey'],['survey','example','lead'],['survey','lead','example'],['lead','example','survey'],['lead','survey','example']];
  for (const topic of ['recording','homeflow']) for (const activities of [['example'],['survey'],['lead'],...orders]) {
    const pathBootstrap=await ok(command({topic}),'independent path bootstrap'); const pathPid=pathBootstrap.data.participation_id;
    let current=pathBootstrap;
    for (const activity of activities) {
      await ok(command({action:'activity_start',activity,payload:{},topic,pid:pathPid}),'independent path start');
      let completion;
      if(activity==='example') completion=command({action:'example_complete',activity,payload:{},topic,pid:pathPid});
      else if(activity==='survey') completion=command({action:'survey_submit',activity,payload:{survey_version:`r2.1-${topic}`,answers:{q1:'none',q2:'other',q3:'none',q4:'unsure'}},topic,pid:pathPid});
      else completion=leadCommand(pathPid,topic,`path-${randomUUID()}@example.test`);
      current=await ok(completion,'independent path completion');
    }
    const expectedState={example:'not_started',survey:'not_started',lead:'not_started'};
    for(const activity of activities) expectedState[activity]='completed';
    equal(current.data.state,expectedState,`${topic} ${activities.join(' -> ')} independent states`);
    equal(current.data.revision,1+2*activities.length,`${topic} ${activities.join(' -> ')} exact applied revision`);
  }
  // Approved-maintenance mechanics only, in this disposable fixture: remove every topic and repeat for one email.
  const withdrawalEmail='withdrawal-fixture@example.com'; const withdrawalKey=digest(withdrawalEmail); const withdrawn=[];
  for(const topic of ['recording','recording','homeflow','homeflow']) {
    const keyCommand=command({topic}); const created=await ok(keyCommand,'withdrawal fixture bootstrap');
    await ok(command({action:'activity_start',activity:'lead',payload:{},topic,pid:created.data.participation_id}),'withdrawal fixture lead start');
    await ok(leadCommand(created.data.participation_id,topic,withdrawalEmail),'withdrawal fixture lead receipt');
    withdrawn.push({keyCommand,pid:created.data.participation_id});
  }
  equal(sql(`select count(*)||':'||count(*) filter(where topic_status='new_topic') from public.marketing_round2_lead_requests where email_key=decode('${withdrawalKey}','hex')`),'4:2','withdrawal starts with both topics and their repeats');
  // Runbook-only export-lifetime rehearsal. The file is outside the repository, contains fixture contacts only,
  // and is removed after the database deletion is confirmed; this is not a production exporter or scheduler.
  const exportDirectory=`${isolated.rootDir}/withdrawal-export-fixture`;
  const exportPath=`${exportDirectory}/contacts.json`;
  await mkdir(exportDirectory,{mode:0o700});
  assert(!(await realpath(exportDirectory)).startsWith(`${await realpath(root)}/`),'withdrawal export is outside repository');
  assert((await lstat(exportDirectory)).isDirectory() && ((await lstat(exportDirectory)).mode & 0o777)===0o700,'withdrawal export directory is owner-only');
  const exportSnapshot=sql(`select json_agg(json_build_object('email',representative.email_normalized,'topic',l.topic,'consented_at',l.consented_at) order by l.request_id)
    from public.marketing_round2_lead_requests l join public.marketing_round2_lead_requests representative
      on representative.email_key=l.email_key and representative.round_version=l.round_version and representative.topic=l.topic and representative.topic_status='new_topic'
    where l.email_key=decode('${withdrawalKey}','hex')`);
  await writeFile(exportPath,exportSnapshot,{flag:'wx',mode:0o600});
  const exportStat=await lstat(exportPath);
  assert(exportStat.isFile() && !exportStat.isSymbolicLink() && (exportStat.mode & 0o777)===0o600 && exportStat.uid===process.getuid(),'withdrawal export file is owned regular 0600');
  const exportedContacts=JSON.parse(await readFile(exportPath,'utf8'));
  assert(exportedContacts.length===4 && exportedContacts.every(contact=>contact.email===withdrawalEmail && ['recording','homeflow'].includes(contact.topic) && Object.keys(contact).sort().join(',')==='consented_at,email,topic'),'private export contains four matching fixture contacts and only necessary fields');
  sql(`begin; select pg_advisory_xact_lock(hashtextextended('marketing-round2-email:' || '${withdrawalKey}',0)); delete from public.marketing_round2_participations p using public.marketing_round2_lead_requests l where l.participation_id=p.id and l.email_key=decode('${withdrawalKey}','hex'); commit;`);
  equal(sql(`select count(*) from public.marketing_round2_lead_requests where email_key=decode('${withdrawalKey}','hex')`),'0','withdrawal leaves no representative or repeat email keys');
  const withdrawnIds=withdrawn.map(v=>`'${v.pid}'`).join(',');
  equal(sql(`select (select count(*) from public.marketing_round2_participations where id in (${withdrawnIds}))||':'||(select count(*) from public.marketing_round2_events where participation_id in (${withdrawnIds}))`),'0:0','withdrawal cascades every matching parent and event');
  assert((await lstat(exportPath)).isFile(),'fixture export remains until confirmed database cascade commit');
  await unlink(exportPath);
  let exportAbsent=false;
  try { await lstat(exportPath); } catch(error) { if(error.code==='ENOENT') exportAbsent=true; else throw error; }
  assert(exportAbsent,'withdrawal removes the matching private export after database commit');
  await rmdir(exportDirectory);
  for(const previous of withdrawn) {
    await denied({...previous.keyCommand,event_id:randomUUID(),bootstrap_intent:'resume',control:control({consent_generation:2})},'PARTICIPATION_EXPIRED','withdrawn confirmed key resume returns 410');
    await denied({...previous.keyCommand,event_id:randomUUID(),participation_id:previous.pid,bootstrap_intent:'cookie_resume',bootstrap_digest:null,control:control({consent_generation:2})},'PARTICIPATION_EXPIRED','withdrawn signed-cookie resume returns 410');
  }
  const freshAfterWithdrawal=await ok({...command(),control:control({consent_generation:2})},'explicit new key after withdrawal');
  await ok(command({action:'activity_start',activity:'lead',payload:{},pid:freshAfterWithdrawal.data.participation_id,control:control({consent_generation:2})}),'new consent flow lead start');
  const newConsent=leadCommand(freshAfterWithdrawal.data.participation_id,'recording',withdrawalEmail);
  await denied({...newConsent,control:control({consent_generation:2})},'CONSENT_REFRESH_REQUIRED','withdrawal generation fence rejects old consent');
  const renewed=await ok({...newConsent,event_id:randomUUID(),lead:{...newConsent.lead,consent_generation:2,request_digest:digest({email:withdrawalEmail,topic:'recording',generation:2})},control:control({consent_generation:2})},'new explicit consent with new generation accepted');
  equal(renewed.data.consent_generation,2,'renewed receipt has current generation');
  equal(sql(`select topic_status||':'||contact_observation||':'||consent_generation from public.marketing_round2_lead_requests where participation_id='${freshAfterWithdrawal.data.participation_id}'`),'new_topic:new_observed:2','deleted identity has no permanent tombstone');
  const databaseLogs=run('docker',['logs',`supabase_db_${isolated.projectId}`]);
  assert(!databaseLogs.includes('preview@example.com')&&!databaseLogs.includes('parallel@example.com')&&!databaseLogs.includes('lookup@example.com'),'real backend logs omit fixture PII');
  assertOwnedDockerResources(isolated.projectId,{env});
  const reportPath=`${root}/.omx/artifacts/r2-stage2/http-integration.json`;
  const test=spawnSync('corepack',['pnpm','exec','vitest','run','tests/marketing-round2-http.integration.test.ts','--maxWorkers=1','--reporter=json',`--outputFile=${reportPath}`],{cwd:root,env:{...env,R2_HTTP_INTEGRATION:'1',R2_HTTP_DATA_URL:isolated.dataApiUrl,R2_HTTP_SERVICE_ROLE_KEY:token,R2_HTTP_EXPECTED_DB_NAMESPACE:isolated.projectId,R2_HTTP_TARGET_IDENTITY_JSON:JSON.stringify({projectId:isolated.projectId,dataApiUrl:isolated.dataApiUrl,cliVersion:'2.110.0',migrationSha256:isolated.migrationSha256})},encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
  await writeFile(`${root}/.omx/artifacts/r2-stage2/http-integration.log`,String(test.stdout)+String(test.stderr));
  const report=JSON.parse(await readFile(reportPath,'utf8'));
  assert(test.status===0 && report.numPassedTests===6 && report.numPendingTests===0,'six actual HTTPS handler SDK/DB tests executed');
  console.warn(JSON.stringify({ checks:checks.length, passed:checks }));
}
