#!/usr/bin/env node
// One reviewed release: DB232, 48 -> 49. No predecessor rotation after CAS.
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { V74_TRANSITION as V, assertV74WorkerCredential } from './lib/youtube-v74-cutover-preparation.mjs';
import { V74_OPERATION_DIRECTORY as OP, v74Paths, v74MetadataPatch, assertV74WorkerSuccessor, assertV74LoadedService, assertV74WebHandoff, V74_WEB_PREDECESSOR, V74_SOURCE_DIFF_SHA256 } from './lib/prelaunch-youtube-v74-cutover.mjs';
import { loadCookedWeightAttestationSuccessor, loadCurrentDatabaseMaintenance, loadCookedWeightAttestationWorkerContinuation,
  acquirePrelaunchDeployLock, verifyClosedR2Control, loadClosedR2Review, readClosedR2PrivateBytes } from './lib/prelaunch-web-deploy.mjs';
import { createRecordingDockerAdapter } from './lib/marketing-round2-controlled-deploy.mjs';
import { createProtectedPrelaunchAdapter, assertCookedWeightAttestationCurrentObservation } from './lib/prelaunch-database.mjs';
import { materializeYoutubeExtractionWorkerArtifact, verifyYoutubeExtractionWorkerArtifact,
  buildYoutubeExtractionWorkerPolicySnapshotDigest } from './lib/youtube-extraction-worker-artifact.mjs';
import { readWorkerEnvironment, readWorkerProviderEnvironment, sanitizeYoutubeExtractionChildEnvironment,
  verifyStandaloneYoutubeI031Preflight, createRestrictedPostgrestRpcClient } from './lib/youtube-extraction-worker-runtime.mjs';
import { issueYoutubeExtractionWorkerCredential, issueYoutubeExtractionCredentialManager } from './lib/youtube-extraction-worker-local-credential.mjs';
import { buildYoutubeExtractionWorkerCredentialState, buildYoutubeExtractionWorkerInstallPlan, parseLaunchctlPrintStatus } from './lib/youtube-extraction-worker-ops.mjs';
import { verifyYoutubeResolutionWorkerCaller, preserveYoutubeResolutionLauncherEnvironment } from './lib/prelaunch-youtube-resolution-worker-install.mjs';
import { openDedicatedAdminSession } from './youtube-resolution-controlled-db.mjs';
import { assertV71ManagerClaims } from './lib/youtube-v71-controlled-cutover.mjs';
const HOME = homedir(), NODE = join(HOME, '.nvm/versions/node/v22.19.0/bin/node');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..'), P = v74Paths();
const PLIST = join(HOME, 'Library/LaunchAgents/com.homecook.youtube-extraction-worker.plist');
const WEB_PLIST = join(HOME, 'Library/LaunchAgents/com.homecook.production.plist');
const SERVICE = `gui/${process.getuid()}/com.homecook.youtube-extraction-worker`;
const DB_CONFIG = join(HOME, '.homecook/config/full-local-production.env');
const OLD_CONFIG = join(P.secrets, 'worker-v48-6b610eb012da-116dabb5-c04.env');
const sha = b => createHash('sha256').update(b).digest('hex');
const check = (ok, why) => { if (!ok) throw new Error(`v74 cutover: ${why}`); };
const json = p => JSON.parse(readClosedR2PrivateBytes(p, ROOT, 524288));
const claims = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
function command(bin, args, input) {
  const result = spawnSync(bin, args, { encoding: 'utf8', input, maxBuffer: 16 * 1024 * 1024 });
  check(result.status === 0, `${bin} failed; sensitive output withheld`); return result.stdout.trim();
}
const parsePlist = bytes => JSON.parse(command('/usr/bin/plutil', ['-convert','json','-o','-','--','-'], bytes));
function privateCreate(path, bytes) {
  const fd = openSync(path, 'wx', 0o600); try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
  const directory = openSync(dirname(path), 'r'); try { fsyncSync(directory); } finally { closeSync(directory); }
}
function publish(name, value) { const path = join(OP, name); privateCreate(path, JSON.stringify(value, null, 2) + '\n'); return sha(readFileSync(path)); }
function status() {
  const result=spawnSync('/bin/launchctl',['print',SERVICE],{encoding:'utf8'});
  if(result.status!==0)return parseLaunchctlPrintStatus({serviceTarget:SERVICE,...result});
  return assertV74LoadedService({stdout:result.stdout,plist:parsePlist(readFileSync(PLIST)),plistPath:PLIST,serviceTarget:SERVICE,requireRunning:false});
}
async function stable() {
  for (let i=0;i<40;i++) { const a=status(); await delay(250); const b=status(); if(a.loaded && a.state==='running' && a.pid>0 && a.pid===b.pid) return {pid:a.pid,secondPid:b.pid}; }
  throw new Error('v74 worker not stable');
}
const zero = w => w.queued===0 && w.processing===0 && w.permitHeld===false && w.activeEnqueueSessions===0;
const POLICY_SQL = `SELECT jsonb_build_object('version',policy_version,'extractorMode',extractor_mode,'pipelineIdentity',pipeline_identity,
 'resultAffectingOptions',result_affecting_options,'fingerprintKeyVersion',fingerprint_key_version,
 'previousFingerprintKeyVersion',previous_fingerprint_key_version,'previousFingerprintValidUntil',previous_fingerprint_valid_until,'enabled',enabled)
 FROM private.youtube_extraction_current_policy WHERE policy_key='primary';`;
function lastJson(output) { const lines=output.split('\n').filter(line=>line.startsWith('{')); check(lines.length===1,'ambiguous SQL observation'); return JSON.parse(lines[0]); }
export function buildV74RegistrationSql({ managerClaims, metadata }, now = new Date()) {
  assertV71ManagerClaims(managerClaims, now);
  const expected={role:'youtube_extraction_worker',scope:'youtube-extraction-worker',iss:'https://worker.mumeok.kr',aud:'youtube-extraction',
    generation:49,release_sha:V.releaseSha,schema_identity:V.schemaIdentity,allowed_snapshot_digest:V.snapshotDigest,
    jti_hash:metadata.jti_sha256,exp:Math.floor(Date.parse(metadata.expires_at)/1000)};
  assertV74WorkerCredential({claims:{...expected,iat:expected.exp-V.workerLifetimeSeconds},metadata,now});
  return `UPDATE private.youtube_extraction_current_policy SET pipeline_identity=${literal(V.pipelineIdentity)},updated_at=clock_timestamp()
 WHERE policy_key='primary' AND enabled=false AND pipeline_identity=${literal(V.predecessorPipelineIdentity)};
 SET LOCAL request.jwt.claims=${literal(JSON.stringify(managerClaims))}; SET LOCAL ROLE youtube_extraction_credential_manager;
 SELECT public.rotate_youtube_extraction_worker_credential(48,49,${literal(metadata.jti_sha256)},${literal(metadata.expires_at)}::timestamptz,${literal(V.releaseSha)},${literal(V.schemaIdentity)},${literal(V.snapshotDigest)})::text;
 RESET ROLE;`;
}
// Exercised with real adapters below and injected failure cases in regression tests.
export async function runV74Cutover(a) {
  await a.preflight();
  await a.assertWebReady();
  await a.assertUnissued();
  const before = await a.quiesce();
  const credential = await a.issueWorker();
  let registered = false;
  try {
    const manager=await a.issueManager();
    await a.register(before,credential,manager); registered=true;
    await a.install(credential);
    const verification=await a.verify(credential);
    await a.activate(credential,verification);
    return await a.finish();
  } catch(error) {
    const observed=await a.readGeneration();
    if (observed===49) { registered=true; await a.closeNewPolicy(); }
    // A mixed/unknown result is never treated as permission to issue or rotate again.
    await a.failure({registered,observed,message:error.message});
    throw error;
  } finally { await a.removeManager(); }
}
export async function resumeV74Cutover(a) {
  const state=await a.resumePreflight();
  if(state.activated)return await a.verifyActivated();
  try {
    if(!state.enabled)await a.install(state.metadata);
    const verification=await a.verify(state.metadata);
    if(!state.enabled)await a.activate(state.metadata,verification);
    return await a.finish();
  } catch(error) {
    const observed=await a.readGeneration();
    if(observed===49)await a.closeNewPolicy();
    await a.failure({registered:true,observed,message:error.message});throw error;
  }
}
async function context() {
  const s=loadCookedWeightAttestationSuccessor(ROOT), m=loadCurrentDatabaseMaintenance(ROOT);
  const c=loadCookedWeightAttestationWorkerContinuation(s,ROOT);
  const base=await createRecordingDockerAdapter({configPath:DB_CONFIG,backupDirectory:OP}); const target=await base.inspect();
  check(target.database.systemIdentifier==='7669475895419854882' && target.database.major===17,'production DB target');
  const adapter=createProtectedPrelaunchAdapter(base,m.review.feature,m.review,m);
  return {s,m,c,base,target,adapter,origin:{personalSuccessor:s.pointer,databaseMaintenance:m.pointer,c04Activation:c.activation.pointer,c04Post:c.post.pointer}};
}
const CREDENTIAL_SQL = `SELECT jsonb_build_object('generation',current_generation,'jtiSha256',current_jti_hash,'expiresAt',expires_at,
 'releaseSha',release_sha,'schemaIdentity',schema_identity,'snapshotDigest',allowed_snapshot_digest)
 FROM private.youtube_extraction_worker_credentials WHERE credential_name='primary';`;
async function observation(c, query) {
  const full=await c.adapter.observe(query,'youtube-resolution-v74-observe');
  const policy=lastJson(await (query?query(POLICY_SQL):c.base.query(POLICY_SQL)));
  const credential=lastJson(await (query?query(CREDENTIAL_SQL):c.base.query(CREDENTIAL_SQL)));
  return {full, worker:full.worker,policy,credential,targetSha256:sha(JSON.stringify(full.target)),normalDataSha256:full.normalDataSha256,
    controlsSha256:full.controlsSha256,catalogSha256:full.catalogSha256,immutableSha256:full.immutableSha256,authoritySha256:sha(JSON.stringify(c.origin))};
}
function preserved(a,b) {
  for(const key of ['targetSha256','normalDataSha256','controlsSha256','catalogSha256','immutableSha256','authoritySha256']) check(a[key]===b[key],`changed ${key}`);
  check(isDeepStrictEqual({...a.policy,pipelineIdentity:b.policy.pipelineIdentity,enabled:b.policy.enabled},b.policy),'policy fields/fingerprint changed');
}
function assertBefore(c,o) {
  check(o.full.ledger.length===232 && o.worker.credentialGeneration===48 && o.worker.workerReleaseSha===V.predecessorReleaseSha
    && o.policy.pipelineIdentity===V.predecessorPipelineIdentity && zero(o.worker),'exact drained DB232/48 predecessor');
  assertCookedWeightAttestationCurrentObservation(c.s,o.full,{quantityWriterState:'on',approvedWorkerPolicy:c.c.observation,databaseMaintenance:c.m});
}
function assertAfter(o,metadata,enabled) {
  check(o.full.ledger.length===232 && o.worker.credentialGeneration===49 && o.worker.workerReleaseSha===V.releaseSha
    && o.worker.snapshotDigest===V.snapshotDigest && o.worker.schemaIdentity===V.schemaIdentity && o.worker.catalogFingerprint===V.catalogSha256
    && o.worker.credentialActive===true && zero(o.worker) && o.policy.enabled===enabled && o.policy.pipelineIdentity===V.pipelineIdentity,'fixed49 poststate');
  const token=readFileSync(P.token,'utf8').trim(); assertV74WorkerCredential({claims:claims(token),metadata});
  check(o.credential.jtiSha256===metadata.jti_sha256 && Date.parse(o.credential.expiresAt)===Date.parse(metadata.expires_at),'registered credential exact JTI/expiry');
  check(buildYoutubeExtractionWorkerPolicySnapshotDigest({policyVersion:o.policy.version,extractorMode:o.policy.extractorMode,
    pipelineIdentity:o.policy.pipelineIdentity,resultAffectingOptions:o.policy.resultAffectingOptions})===V.snapshotDigest,'DB policy snapshot');
}
async function transaction(c,callback) {
  const session=openDedicatedAdminSession(c.target.postgresContainerId,'youtube-resolution-v74');
  try {
    await session.query(`BEGIN ISOLATION LEVEL SERIALIZABLE; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='45s'; SET LOCAL idle_in_transaction_session_timeout='60s';
 SELECT pg_advisory_xact_lock(86120317);
 LOCK TABLE private.youtube_extraction_current_policy,private.youtube_extraction_worker_credentials,public.youtube_extraction_jobs,public.youtube_extractor_permits IN SHARE ROW EXCLUSIVE MODE;
 LOCK TABLE private.recipe_product_only_write_control,private.cooked_batch_weight_evidence_control,private.quantity_input_v4_policy,private.cooked_weight_user_attestation_control IN SHARE MODE;`);
    const query=sql=>session.query(sql);
    // Exact existing observer requires the same postgres search path/time zone as its original evidence.
    const observe=async()=>{
      await query('SAVEPOINT v74_observation; SET LOCAL ROLE postgres; SET LOCAL search_path=public,extensions; SET LOCAL TIME ZONE \'UTC\';');
      try {return await observation(c,query);} finally {await query('ROLLBACK TO SAVEPOINT v74_observation; RELEASE SAVEPOINT v74_observation;');}
    };
    const result=await callback({query,observe});
    await session.query('COMMIT;'); check(await session.close()===0,'transaction close outcome unknown'); return result;
  } finally {session.stop();}
}
async function candidate() {
  const artifact=verifyYoutubeExtractionWorkerArtifact(P.manifest);
  check(artifact.artifact_sha256===V.artifactSha256 && artifact.release_sha===V.releaseSha && artifact.pipeline_identity===V.pipelineIdentity
    && artifact.expected_schema_sha256===V.schemaSha256 && artifact.allowed_snapshot_digest===V.snapshotDigest,'sealed candidate');
  const env=await readWorkerEnvironment(P.config); const provider=await readWorkerProviderEnvironment(env.HOMECOOK_YOUTUBE_WORKER_PROVIDER_SECRET_FILE);
  return verifyStandaloneYoutubeI031Preflight({workerEnv:sanitizeYoutubeExtractionChildEnvironment({...process.env,...provider},{HOME}),expectedUserId:process.getuid()});
}
function webReady() {
  const bytes=readFileSync(WEB_PLIST), plist=parsePlist(bytes);
  check(command('git',['-C',plist.WorkingDirectory,'rev-parse','HEAD'])===V.releaseSha,'web must be deployed first');
  for(const [key,value] of Object.entries(v74MetadataPatch())) check(plist.EnvironmentVariables[key]===value,'web metadata handoff');
  const state=json(join(HOME,'.homecook/prelaunch-web/state.json'));
  check(state.to===V.releaseSha || state.ref===V.releaseSha || state.releaseSha===V.releaseSha,'official web deploy receipt');
  check(!existsSync(join(HOME,'.homecook/prelaunch-web/recovery.json')),'web recovery pending');
  return {releaseSha:V.releaseSha,plistSha256:sha(bytes),stateSha256:sha(readFileSync(join(HOME,'.homecook/prelaunch-web/state.json'))),buildId:readFileSync(join(plist.WorkingDirectory,'.next/BUILD_ID'),'utf8').trim()};
}
async function verifyInstalled(metadata) {
  const token=readFileSync(P.token,'utf8').trim(); assertV74WorkerCredential({claims:claims(token),metadata});
  const first=await stable(),env=await readWorkerEnvironment(P.config);
  const caller=await verifyYoutubeResolutionWorkerCaller({environment:env,token,secretRoot:P.secrets});
  const result=JSON.parse(command(NODE,[join(P.artifact,'scripts/youtube-extraction-worker-runner.mjs'),'health',...flags()]));
  check(result.ok && result.ready && status().pid===first.pid,'local health and same PID');
  return {...caller,ready:true,...first};
}
const flags=()=>['--config',P.config,'--manifest',P.manifest,'--credential',P.credential,'--secret-root',P.secrets,'--app-descriptor',P.descriptor,'--policy',P.policy,'--expected-schema',P.schema];
async function adapters(c, resume = false) {
  let before=resume?json(join(OP,'before.json')):undefined,web=resume?before.web:undefined,registrationSha256=resume?sha(readFileSync(join(OP,'registration.json'))):undefined,verificationSha256,health,resumeEnabled=false,managerTokenSha256,managerTokenPath=join(P.secrets,'manager-v74-gen49.jwt');
  const metadata=()=>json(P.credential);
  return {
    resumePreflight:async()=>{
      await candidate();const reg=json(join(OP,'registration.json')),m=metadata();
      check(reg.intent.beforeSha256===sha(readFileSync(join(OP,'before.json'))) && reg.intent.metadataSha256===sha(readFileSync(P.credential))
        && isDeepStrictEqual(reg.origin,c.origin) && isDeepStrictEqual(webReady(),reg.web),'same49 immutable origin/web/metadata');
      const o=await observation(c);assertAfter(o,m,o.policy.enabled);preserved(before,o);
      check(o.worker.credentialRowSha256===reg.observation.worker.credentialRowSha256
        && o.worker.policyStableSha256===reg.observation.worker.policyStableSha256,'same49 registration rows');
      if(o.policy.enabled)check(existsSync(join(OP,'verification.json')),'ON without durable verification; readback only');
      resumeEnabled=o.policy.enabled;return {activated:existsSync(join(OP,'activation.json')),enabled:o.policy.enabled,metadata:m};
    },
    verifyActivated:async()=>{
      const proof=json(join(OP,'activation.json'));assertV74WorkerSuccessor({proof,baseline:c.s.review.database.workerBaseline,approvedPolicy:c.c.observation,origin:c.origin});
      const o=await observation(c);assertAfter(o,metadata(),true);preserved(before,o);
      for(const key of ['credentialRowSha256','policyRowSha256','policyStableSha256'])check(o.worker[key]===proof.after.worker[key],'activated exact rows');
      check(sha(readFileSync(PLIST))===proof.service.plistSha256,'activated exact launcher');await verifyInstalled(metadata());
      return {activated:true,alreadyActivated:true,readOnly:true,generation:49,modelCalls:0};
    },
    preflight:async()=>{await candidate();verifyClosedR2Control(loadClosedR2Review(ROOT),ROOT);const o=await observation(c);assertBefore(c,o);},
    assertWebReady:async()=>{web=webReady();for(const path of ['/', '/login','/privacy']) check((await fetch(`http://127.0.0.1:3100${path}`)).ok,'web HTTP health');},
    assertUnissued:async()=>{check(!existsSync(P.token)&&!existsSync(P.credential)&&!existsSync(join(OP,'issue-intent.json'))&&!existsSync(managerTokenPath),'49 was issued/pending; use readback, no duplicate issue');},
    quiesce:async()=>{
      before=await observation(c);assertBefore(c,before);publish('before.json',{...before,origin:c.origin,web,service:{plistSha256:sha(readFileSync(PLIST)),pid:status().pid}});
      privateCreate(join(OP,'generation-48.plist'),readFileSync(PLIST));
      // Full-local custom-format backup; no credentials in arguments or output.
      const dump=join(OP,'before-gen49.dump'),fd=openSync(dump,'wx',0o600);
      let backup;try{backup=spawnSync('docker',['exec',c.target.postgresContainerId,'pg_dump','-U','postgres','-d','postgres','-Fc'],{stdio:['ignore',fd,'pipe']});fsyncSync(fd);}finally{closeSync(fd);}
      check(backup.status===0&&lstatSync(dump).size>0,'pre-transition backup');
      for(const args of [['--list'],['--file=/dev/null']]){const input=openSync(dump,'r');let decoded;try{decoded=spawnSync('docker',['exec','-i',c.target.postgresContainerId,'pg_restore',...args],{stdio:[input,'ignore','pipe']});}finally{closeSync(input);}check(decoded.status===0,'backup archive decode');}
      publish('backup.json',{targetSha256:before.targetSha256,path:dump,sha256:sha(readFileSync(dump)),bytes:lstatSync(dump).size,fullArchiveDecoded:true});
      await transaction(c,async tx=>{const b=await tx.observe();assertBefore(c,b);preserved(before,b);await tx.query("UPDATE private.youtube_extraction_current_policy SET enabled=false,updated_at=clock_timestamp() WHERE policy_key='primary';");const a=await tx.observe();preserved(b,a);check(!a.policy.enabled&&zero(a.worker),'OFF/drain');});
      check(sha(readFileSync(PLIST))===json(join(OP,'before.json')).service.plistSha256,'predecessor launcher changed');
      command('/bin/launchctl',['bootout',SERVICE]);for(let i=0;i<40&&status().loaded;i++)await delay(250);check(!status().loaded,'predecessor stop');return before;
    },
    issueWorker:async()=>{
      publish('issue-intent.json',{generation:49,releaseSha:V.releaseSha,ttlSeconds:V.workerLifetimeSeconds,at:new Date().toISOString()});
      const worker=issueYoutubeExtractionWorkerCredential({jwtKeys:json(join(HOME,'.homecook/secrets/full-local-supabase/jwt_keys')),generation:49,releaseSha:V.releaseSha,schemaIdentity:V.schemaIdentity,allowedSnapshotDigest:V.snapshotDigest,ttlSeconds:V.workerLifetimeSeconds});
      privateCreate(P.token,worker.token+'\n');const m=buildYoutubeExtractionWorkerCredentialState({tokenFile:P.token,generation:49,jtiHash:worker.jtiHash,expiresAt:worker.metadata.expires_at,releaseSha:V.releaseSha,schemaIdentity:V.schemaIdentity,allowedSnapshotDigest:V.snapshotDigest,secretRoot:P.secrets});privateCreate(P.credential,JSON.stringify(m,null,2)+'\n');return m;
    },
    issueManager:async()=>{
      const m=issueYoutubeExtractionCredentialManager({jwtKeys:json(join(HOME,'.homecook/secrets/full-local-supabase/jwt_keys')),ttlSeconds:300});
      privateCreate(managerTokenPath,m.token+'\n');managerTokenSha256=sha(readFileSync(managerTokenPath));assertV71ManagerClaims(m.claims);const env=await readWorkerEnvironment(P.config);
      const client=createRestrictedPostgrestRpcClient({dataApiUrl:env.HOMECOOK_YOUTUBE_WORKER_DATA_API_URL,apiKey:readFileSync(env.HOMECOOK_YOUTUBE_WORKER_DATA_API_KEY_FILE,'utf8').trim(),token:m.token});
      check((await client.rpc('check_youtube_extraction_worker_pre_request')).error===null,'manager authenticated pre-request');return m;
    },
    register:async(_before,m,manager)=>{
      const intent={generationBefore:48,generationAfter:49,releaseSha:V.releaseSha,metadataSha256:sha(readFileSync(P.credential)),beforeSha256:sha(readFileSync(join(OP,'before.json')))};publish('registration-intent.json',intent);
      const registered=await transaction(c,async tx=>{
        const b=await tx.observe();check(b.worker.credentialGeneration===48&&!b.policy.enabled&&zero(b.worker)
          && b.policy.pipelineIdentity===V.predecessorPipelineIdentity && b.worker.policyStableSha256===before.worker.policyStableSha256
          && b.worker.credentialRowSha256===before.worker.credentialRowSha256,'locked exact48 OFF');preserved(before,b);
        check(!status().loaded,'predecessor must remain stopped');await tx.query(buildV74RegistrationSql({managerClaims:manager.claims,metadata:m}));
        const a=await tx.observe();assertAfter(a,m,false);preserved(b,a);return a;
      });registrationSha256=publish('registration.json',{intent,observation:registered,web,origin:c.origin});
    },
    install:async()=>{
      const preflight=await candidate();const raw=buildYoutubeExtractionWorkerInstallPlan({configPath:P.config,manifestPath:P.manifest,credentialPath:P.credential,appDescriptorPath:P.descriptor,currentPolicyPath:P.policy,expectedSchemaPath:P.schema,secretRoot:P.secrets,homeDir:HOME,nodeBin:NODE,rootDir:P.artifact,userId:process.getuid(),dryRun:true,i031Preflight:{ready:true,codexCliVersion:preflight.codexCliVersion,chatGptLogin:true,toolsReady:true}});
      const old=parsePlist(readFileSync(join(OP,'generation-48.plist'))),preview=preserveYoutubeResolutionLauncherEnvironment(old,raw.plist_preview);
      const currentHash=sha(readFileSync(PLIST)),targetHash=sha(preview),oldHash=json(join(OP,'before.json')).service.plistSha256;
      const running=status();check(currentHash===oldHash||resume&&currentHash===targetHash,'foreign installed service');
      if(currentHash===targetHash&&running.loaded&&running.state==='running'){await stable();return;}
      check(!running.loaded||resume&&currentHash===targetHash,'foreign loaded service');
      if(running.loaded)command('/bin/launchctl',['bootout',SERVICE]);
      if(currentHash!==targetHash){const temp=PLIST+'.v74.tmp';privateCreate(temp,preview);renameSync(temp,PLIST);}
      command('/bin/launchctl',['bootstrap',`gui/${process.getuid()}`,PLIST]);await stable();
    },
    verify:async m=>{health=await verifyInstalled(m);const o=await observation(c);assertAfter(o,m,resume&&resumeEnabled);preserved(before,o);verificationSha256=publish(existsSync(join(OP,'verification.json'))?`verification-repair-${randomUUID()}.json`:'verification.json',{observation:o,health,service:{plistSha256:sha(readFileSync(PLIST))},registrationSha256,web});return health;},
    activate:async(m,h)=>{
      await transaction(c,async tx=>{const b=await tx.observe();assertAfter(b,m,false);preserved(before,b);check(status().pid===h.pid,'PID before enable');
        await tx.query("UPDATE private.youtube_extraction_current_policy SET enabled=true,updated_at=clock_timestamp() WHERE policy_key='primary' AND enabled=false;");const a=await tx.observe();assertAfter(a,m,true);preserved(b,a);});
    },
    finish:async()=>{
      const after=await observation(c);assertAfter(after,metadata(),true);preserved(before,after);const currentHealth=await verifyInstalled(metadata());
      const proof={schema:'homecook.youtube-v74-activation.v1',releaseSha:V.releaseSha,origin:c.origin,before,after,web,registrationSha256,verificationSha256,health:currentHealth,service:{plistSha256:sha(readFileSync(PLIST))},at:new Date().toISOString()};
      assertV74WorkerSuccessor({proof,baseline:c.s.review.database.workerBaseline,approvedPolicy:c.c.observation,origin:c.origin});
      const digest=publish('activation.json',proof);return {activated:true,generation:49,releaseSha:V.releaseSha,activationSha256:digest,modelCalls:0};
    },
    readGeneration:async()=>{const o=await observation(c);if(o.worker.credentialGeneration===49){assertAfter(o,metadata(),o.policy.enabled);preserved(before,o);}return o.worker.credentialGeneration;},
    closeNewPolicy:async()=>{await c.base.query(`UPDATE private.youtube_extraction_current_policy SET enabled=false,updated_at=clock_timestamp() WHERE policy_key='primary' AND EXISTS(SELECT 1 FROM private.youtube_extraction_worker_credentials WHERE credential_name='primary' AND current_generation=49 AND release_sha=${literal(V.releaseSha)});`);},
    failure:async result=>{publish(`failure-${randomUUID()}.json`,{...result,at:new Date().toISOString(),same49RepairOnly:result.registered,noAutomaticRetry:true});},
    removeManager:async()=>{if(existsSync(managerTokenPath)){check(managerTokenSha256&&sha(readFileSync(managerTokenPath))===managerTokenSha256,'foreign manager file; not removed');unlinkSync(managerTokenPath);}},
  };
}
async function main() {
  const action=process.argv[2];check(['stage','preflight','apply','resume','seal-web'].includes(action),'usage: stage | preflight | apply | resume | seal-web');
  mkdirSync(OP,{recursive:true,mode:0o700});check(lstatSync(OP).isDirectory()&&!lstatSync(OP).isSymbolicLink()&&lstatSync(OP).uid===process.getuid(),'owned operation directory');chmodSync(OP,0o700);
  if(action==='stage'){
    check(!existsSync(P.artifact)&&!existsSync(P.descriptor)&&!existsSync(P.config)&&!existsSync(P.policy),'candidate staging already exists; readback required');
    const result=materializeYoutubeExtractionWorkerArtifact({rootDir:ROOT,outputDir:P.artifact,releaseSha:V.releaseSha,releaseTree:'3da7e7ab7c0b40c4275251a7e92eb9b394d7c6d8',buildId:'youtube-v74-3e58467499c6',promotionId:'youtube-v74-20261016',schemaIdentity:V.schemaIdentity,allowedSnapshotDigest:V.snapshotDigest,policyVersion:3,pipelineIdentity:V.pipelineIdentity});
    check(result.manifest.artifact_sha256===V.artifactSha256,'staged artifact digest');
    privateCreate(P.descriptor,readFileSync('/tmp/mumeok-v74-rollout-20261016-tw7G9p/app-descriptor.json'));
    privateCreate(P.policy,readFileSync('/tmp/mumeok-v74-rollout-20261016-tw7G9p/candidate-policy-NOT-APPLIED.json'));
    privateCreate(P.config,readClosedR2PrivateBytes(OLD_CONFIG,ROOT));
    privateCreate(join(OP,'web-metadata.env'),Object.entries(v74MetadataPatch()).map(([k,v])=>`${k}='${v}'`).join('\n')+'\n');
    await candidate();process.stdout.write(JSON.stringify({staged:true,credentialIssued:false,paths:P})+'\n');return;
  }
  const c=await context();
  if(action==='preflight'){await candidate();const o=await observation(c);assertBefore(c,o);verifyClosedR2Control(loadClosedR2Review(ROOT),ROOT);process.stdout.write(JSON.stringify({preflight:true,generation:o.worker.credentialGeneration,queued:o.worker.queued,processing:o.worker.processing,ledgerCount:o.full.ledger.length,credentialIssued:false})+'\n');return;}
  const lock=await acquirePrelaunchDeployLock();
  try{
    if(action==='seal-web'){
      const web=webReady(),state=json(join(HOME,'.homecook/prelaunch-web/state.json'));
      const proof={schema:'homecook.youtube-v74-web-handoff.v1',from:V74_WEB_PREDECESSOR,to:V.releaseSha,
        sourceDiffSha256:V74_SOURCE_DIFF_SHA256,databaseMaintenance:c.m.pointer,state,web};
      assertV74WebHandoff({proof,maintenance:c.m.pointer,ledger:c.m.review.database.after});
      const digest=publish('web-handoff.json',proof);process.stdout.write(JSON.stringify({sealed:true,webHandoffSha256:digest,credentialIssued:false})+'\n');return;
    }
    const a=await adapters(c,action==='resume');process.stdout.write(JSON.stringify(action==='resume'?await resumeV74Cutover(a):await runV74Cutover(a))+'\n');
  }finally{await lock.release();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
