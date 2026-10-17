#!/usr/bin/env node
// Fixed DB232, V2, same-scope49 ->50. No real credential action in prepare/preflight.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmodSync,closeSync,existsSync,fsyncSync,lstatSync,linkSync,mkdirSync,openSync,readFileSync,realpathSync,renameSync,unlinkSync,writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname,join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { createInterface } from 'node:readline/promises';
import { V85 as V,V85_OPERATION_DIRECTORY as OP,v85Paths,v85MetadataPatch,v85Hash as sha,v85Check as check,v85Zero as zero,assertV85Plan,assertV85Source,
  assertV85Preserved as preserved,assertV85WorkerCredential,verifyV85IssuedToken,assertV85After,classifyV85Registration,ownsV85Registration,assertV85Successor,buildV85RegistrationSql,V85_BEGIN_SQL,V85_LOCK_SQL,
  assertV85ExecutionPlan,readV85ExecutionApproval,v85ContinuationDataDeltas,assertV85ActivatedRuntime } from './lib/youtube-v85-cutover.mjs';
import { assertRound2EightKeyFence,preserveRound2RotationState } from './lib/round2-eight-key-rotation-fence.mjs';
import { readV85Approval,registerV85Approval } from './lib/youtube-v85-approval.mjs';
import { V74_ACTIVATION_SHA256,V74_OPERATION_DIRECTORY,v74Paths,assertV74WorkerSuccessor,assertV74LoadedService } from './lib/prelaunch-youtube-v74-cutover.mjs';
import { readFingerprintRecoveryAuthority,fingerprintWorkerSuccessor } from './lib/youtube-fingerprint-recovery-authority.mjs';
import { loadCookedWeightAttestationSuccessor,loadCurrentDatabaseMaintenance,loadCookedWeightAttestationWorkerContinuation,acquirePrelaunchDeployLock,
 verifyClosedR2Control,loadClosedR2Review,readClosedR2PrivateBytes } from './lib/prelaunch-web-deploy.mjs';
import { createRecordingDockerAdapter } from './lib/marketing-round2-controlled-deploy.mjs';
import { createProtectedPrelaunchAdapter,assertCookedWeightAttestationCurrentObservation } from './lib/prelaunch-database.mjs';
import { materializeYoutubeExtractionWorkerArtifact,verifyYoutubeExtractionWorkerArtifact,buildYoutubeExtractionCurrentPolicy,buildYoutubeExtractionAppDescriptor } from './lib/youtube-extraction-worker-artifact.mjs';
import { readWorkerEnvironment,readWorkerProviderEnvironment,sanitizeYoutubeExtractionChildEnvironment,verifyStandaloneYoutubeI031Preflight,createRestrictedPostgrestRpcClient } from './lib/youtube-extraction-worker-runtime.mjs';
import { issueYoutubeExtractionWorkerCredential,issueYoutubeExtractionCredentialManager } from './lib/youtube-extraction-worker-local-credential.mjs';
import { buildYoutubeExtractionWorkerCredentialState,buildYoutubeExtractionWorkerInstallPlan,parseLaunchctlPrintStatus } from './lib/youtube-extraction-worker-ops.mjs';
import { verifyYoutubeResolutionWorkerCaller,preserveYoutubeResolutionLauncherEnvironment } from './lib/prelaunch-youtube-resolution-worker-install.mjs';
import { openDedicatedAdminSession } from './youtube-resolution-controlled-db.mjs';
import { assertV71ManagerClaims } from './lib/youtube-v71-controlled-cutover.mjs';
const HOME=homedir(),NODE=join(HOME,'.nvm/versions/node/v22.19.0/bin/node'),ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..'),P=v85Paths();
const PLIST=join(HOME,'Library/LaunchAgents/com.homecook.youtube-extraction-worker.plist'),WEB_PLIST=join(HOME,'Library/LaunchAgents/com.homecook.production.plist');
const SERVICE=`gui/${process.getuid()}/com.homecook.youtube-extraction-worker`,DB_CONFIG=join(HOME,'.homecook/config/full-local-production.env');
const output=value=>process.stdout.write(JSON.stringify(value)+'\n');
const json=p=>JSON.parse(readClosedR2PrivateBytes(p,ROOT,524288));
const claims=token=>JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
let operationDeadline = null;
export function v85RemainingTimeout(maximum, deadline = operationDeadline, now = performance.now()) {
  const remaining = deadline === null ? maximum : Math.min(maximum, deadline - now);
  check(Number.isFinite(remaining) && remaining > 0, 'operation deadline exceeded; read-only reconcile required');
  return Math.max(1, Math.floor(remaining));
}
const budgetCheck = () => v85RemainingTimeout(1);
export function assertV85UserTerminal(boundary) {
  check(boundary.platform === 'darwin' && boundary.stdinTTY && boundary.stdoutTTY && boundary.stderrTTY, 'user local Terminal required before any credential/access change');
}
export async function requireV85UserExecution(action, boundary = {
  platform: process.platform, stdinTTY: Boolean(process.stdin.isTTY), stdoutTTY: Boolean(process.stdout.isTTY), stderrTTY: Boolean(process.stderr.isTTY),
}, confirm = async () => {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try { return await terminal.question('Type V85-GEN50 to confirm the reviewed bounded credential operation: '); }
  finally { terminal.close(); }
}) {
  if (!['approve-plan', 'apply', 'resume'].includes(action)) return;
  assertV85UserTerminal(boundary);
  check(await confirm() === 'V85-GEN50', 'user credential operation cancelled');
}
export async function confirmV85ReviewedOperation(action,bytes,boundary,display,confirm) {
  assertV85UserTerminal(boundary);
  const review=assertV85ExecutionPlan(JSON.parse(bytes));
  display({userReviewRequired:true,planSha256:sha(bytes),toolAndWebSha:review.webRef,workerRelease:V.releaseSha,generation:50,workerExpiresAt:V.expiresAt,managerMaximumSeconds:300,
    priorDataChangesUnattributed:review.schema==='homecook.youtube-v85-continuation-plan.v1',originalJobs:42,currentJobs:review.before.jobCount,old49InvalidAfterRegistration:true,round2LeadRemainOff:true});
  if(review.schema==='homecook.youtube-v85-continuation-plan.v1')display({warning:'Approval preserves the exact current data despite unattributed prior auth/normal changes and one extra job. It does not classify those changes as normal or overwrite the original authority.'});
  await requireV85UserExecution(action,boundary,confirm);
}
function command(bin, args, input) {
  const result = spawnSync(bin, args, { encoding: 'utf8', input, timeout: v85RemainingTimeout(30000), maxBuffer: 16 * 1024 * 1024 });
  check(result.status === 0, `${bin} failed; sensitive output withheld`); return result.stdout.trim();
}
const parsePlist = bytes => JSON.parse(command('/usr/bin/plutil', ['-convert','json','-o','-','--','-'], bytes));
export function createV85PrivateFile(path,bytes) {
  const temp=join(dirname(path),`.v85-write-${randomUUID()}`),fd=openSync(temp,'wx',0o600);
  try {writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
  try {linkSync(temp,path);const dir=openSync(dirname(path),'r');try{fsyncSync(dir);}finally{closeSync(dir);}}
  finally {unlinkSync(temp);const dir=openSync(dirname(path),'r');try{fsyncSync(dir);}finally{closeSync(dir);}}
}
const privateCreate=createV85PrivateFile;
function privateExact(path,bytes) {
  if(existsSync(path)){check(sha(readClosedR2PrivateBytes(path,ROOT,524288))===sha(bytes),'foreign/partial staged file');return;}
  privateCreate(path,bytes);
}
function publish(name, value) { const path = join(OP, name); privateCreate(path, JSON.stringify(value, null, 2) + '\n'); return sha(readFileSync(path)); }
function status() {
  const result=spawnSync('/bin/launchctl',['print',SERVICE],{encoding:'utf8',timeout:v85RemainingTimeout(5000)});
  if(result.status!==0)return parseLaunchctlPrintStatus({serviceTarget:SERVICE,...result});
  return assertV74LoadedService({stdout:result.stdout,plist:parsePlist(readFileSync(PLIST)),plistPath:PLIST,serviceTarget:SERVICE,requireRunning:false});
}
async function stable() {
  for (let i=0;i<40;i++) { const a=status(); await delay(250); const b=status(); if(a.loaded && a.state==='running' && a.pid>0 && a.pid===b.pid) return {pid:a.pid,secondPid:b.pid}; }
  throw new Error('v85 worker not stable');
}
const POLICY_SQL = `SELECT jsonb_build_object('version',policy_version,'extractorMode',extractor_mode,'pipelineIdentity',pipeline_identity,
 'resultAffectingOptions',result_affecting_options,'fingerprintKeyVersion',fingerprint_key_version,
 'previousFingerprintKeyVersion',previous_fingerprint_key_version,'previousFingerprintValidUntil',previous_fingerprint_valid_until,'enabled',enabled)
 FROM private.youtube_extraction_current_policy WHERE policy_key='primary';`;
function lastJson(output) { const lines=output.split('\n').filter(line=>line.startsWith('{')); check(lines.length===1,'ambiguous SQL observation'); return JSON.parse(lines[0]); }
const CREDENTIAL_SQL=`SELECT jsonb_build_object('generation',current_generation,'jtiSha256',current_jti_hash,'expiresAt',expires_at,'releaseSha',release_sha,'schemaIdentity',schema_identity,'snapshotDigest',allowed_snapshot_digest) FROM private.youtube_extraction_worker_credentials WHERE credential_name='primary';`;
const JOBS_SQL=`SELECT jsonb_build_object('count',count(*),'sha256',encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(j) ORDER BY id),'[]'::jsonb)::text,'UTF8')),'hex')) FROM public.youtube_extraction_jobs j;`;
const ORIGINAL_JOBS_SQL=`SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(j) ORDER BY id),'[]'::jsonb)::text,'UTF8')),'hex') FROM (SELECT * FROM public.youtube_extraction_jobs ORDER BY created_at,id LIMIT 42) j;`;
const APPROVED_JOBS_SQL=`SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(j) ORDER BY id),'[]'::jsonb)::text,'UTF8')),'hex') FROM (SELECT * FROM public.youtube_extraction_jobs ORDER BY created_at,id LIMIT 43) j;`;
async function context(backupDirectory=OP) {
  const s=loadCookedWeightAttestationSuccessor(ROOT),m=loadCurrentDatabaseMaintenance(ROOT),c=loadCookedWeightAttestationWorkerContinuation(s,ROOT);
  const base=await createRecordingDockerAdapter({configPath:DB_CONFIG,backupDirectory}),target=await base.inspect();
  check(target.database.systemIdentifier==='7669475895419854882'&&target.database.major===17,'exact full-local DB');
  const origin={personalSuccessor:s.pointer,databaseMaintenance:m.pointer,c04Activation:c.activation.pointer,c04Post:c.post.pointer};
  const bytes=readClosedR2PrivateBytes(join(V74_OPERATION_DIRECTORY,'activation.json'),ROOT,524288);check(sha(bytes)===V74_ACTIVATION_SHA256,'immutable v74');
  const legacy={proof:JSON.parse(bytes),origin,fingerprintRecovery:readFingerprintRecoveryAuthority(p=>readClosedR2PrivateBytes(p,ROOT,524288))};
  const worker=assertV74WorkerSuccessor({...legacy,baseline:s.review.database.workerBaseline,approvedPolicy:c.observation});
  const predecessor=fingerprintWorkerSuccessor(worker,legacy.fingerprintRecovery,origin,V74_ACTIVATION_SHA256);
  return {s,m,c,base,target,origin,legacy,predecessor,adapter:createProtectedPrelaunchAdapter(base,m.review.feature,m.review,m)};
}
async function observation(c,query) {
  const full=await c.adapter.observe(query,'youtube-resolution-v85-observe');
  const read=sql=>query?query(sql):c.base.query(sql),policy=lastJson(await read(POLICY_SQL)),credential=lastJson(await read(CREDENTIAL_SQL)),jobs=lastJson(await read(JOBS_SQL));
  const originalJobsSha256=(await read(ORIGINAL_JOBS_SQL)).trim(),approvedJobsSha256=(await read(APPROVED_JOBS_SQL)).trim();check([originalJobsSha256,approvedJobsSha256].every(v=>/^[a-f0-9]{64}$/u.test(v)),'original42/approved43 digest');
  return {full,worker:full.worker,policy,credential,jobCount:jobs.count,jobsSha256:jobs.sha256,originalJobsSha256,approvedJobsSha256,targetSha256:sha(JSON.stringify(full.target)),normalDataSha256:full.normalDataSha256,
    controlsSha256:full.controlsSha256,catalogSha256:full.catalogSha256,immutableSha256:full.immutableSha256,authoritySha256:sha(JSON.stringify(c.origin))};
}
function assertBefore(c,o) {
  check(o.worker.credentialGeneration===49&&o.worker.workerReleaseSha===V.predecessorReleaseSha&&o.policy.enabled&&zero(o.worker),'original49 active/drained');
  assertCookedWeightAttestationCurrentObservation(c.s,o.full,{quantityWriterState:'on',approvedWorkerPolicy:c.c.observation,approvedWorkerSuccessor:c.legacy,databaseMaintenance:c.m});
}
async function readSnapshot(c) {
  const s=openDedicatedAdminSession(c.target.postgresContainerId,'youtube-resolution-v85-readonly');
  try {await s.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL ROLE postgres; SET LOCAL statement_timeout='45s'; SET LOCAL search_path=public,extensions; SET LOCAL TIME ZONE 'UTC';");
    const result=await observation(c,sql=>s.query(sql));await s.query('COMMIT;');check(await s.close()===0,'read-only snapshot close');return result;
  }finally{s.stop();}
}
async function transaction(c,callback) {
  const s=openDedicatedAdminSession(c.target.postgresContainerId,'youtube-resolution-v85');
  try {
    budgetCheck();await s.query(V85_BEGIN_SQL);await s.query(V85_LOCK_SQL);
    const query=sql=>s.query(sql),observe=async()=>{
      await query("SAVEPOINT v85_observation; SET LOCAL ROLE postgres; SET LOCAL search_path=public,extensions; SET LOCAL TIME ZONE 'UTC';");
      try{return await observation(c,query);}finally{await query('ROLLBACK TO SAVEPOINT v85_observation; RELEASE SAVEPOINT v85_observation;');}
    };
    const result=await callback({query,observe});budgetCheck();await s.query('COMMIT;');check(await s.close()===0,'commit outcome unknown; reconcile');return result;
  }finally{s.stop();}
}
function approvedPlan() {
  const authority=readV85ExecutionApproval(p=>readClosedR2PrivateBytes(p,ROOT,524288)),plan=authority?.plan;check(plan,'approved original/continuation required');
  check(command('git',['-C',ROOT,'rev-parse','HEAD'])===plan.webRef,'exact reviewed tooling/web source');
  check(!command('git',['-C',ROOT,'status','--porcelain','--untracked-files=no']),'clean tooling checkout');
  assertV85Source({plan,from:V.from,to:plan.webRef,digests:sourceDigests(plan.webRef)});return authority;
}
function sourceDigests(ref) {
  const files=command('git',['-C',ROOT,'diff','--name-only',V.from,ref]).split('\n').filter(Boolean).sort();
  return Object.fromEntries(files.map(p=>[p,[V.from,ref].map(r=>{
    const found=command('git',['-C',ROOT,'ls-tree',r,'--',p]);return found?sha(Buffer.from(commandBytes('git',['-C',ROOT,'show',`${r}:${p}`]))):null;
  })]));
}
function commandBytes(bin,args) {
  const r=spawnSync(bin,args,{timeout:v85RemainingTimeout(15000),maxBuffer:64*1024*1024});check(r.status===0,'source read');return r.stdout;
}
async function candidate() {
  const a=verifyYoutubeExtractionWorkerArtifact(P.manifest);
  check(a.release_sha===V.releaseSha&&a.artifact_sha256===V.artifactSha256&&a.pipeline_identity===V.pipelineIdentity&&a.allowed_snapshot_digest===V.snapshotDigest,'sealed v85');
  check(sha(readFileSync(P.descriptor))===V.descriptorSha256,'sealed descriptor');
  const env=await readWorkerEnvironment(P.config),provider=await readWorkerProviderEnvironment(env.HOMECOOK_YOUTUBE_WORKER_PROVIDER_SECRET_FILE);
  return verifyStandaloneYoutubeI031Preflight({workerEnv:sanitizeYoutubeExtractionChildEnvironment({...process.env,...provider},{HOME}),expectedUserId:process.getuid()});
}
function webReady(plan) {
  const bytes=readFileSync(WEB_PLIST),plist=parsePlist(bytes),state=json(join(HOME,'.homecook/prelaunch-web/state.json'));
  check(command('git',['-C',plist.WorkingDirectory,'rev-parse','HEAD'])===plan.webRef,'official reviewed web first');
  for(const [k,v]of Object.entries(v85MetadataPatch()))check(plist.EnvironmentVariables[k]===v,'web metadata paths');
  check(state.ref===plan.webRef&&state.targetPlistHash===sha(bytes)&&state.buildId===readFileSync(join(plist.WorkingDirectory,'.next/BUILD_ID'),'utf8').trim(),'official web receipt');
  check(!existsSync(join(HOME,'.homecook/prelaunch-web/recovery.json')),'web recovery pending');
  if(plan.schema==='homecook.youtube-v85-continuation-plan.v1')check(isDeepStrictEqual(round2Binding(),plan.round2Binding),'exact inherited new8/fence/OFF binding');
  return {releaseSha:plan.webRef,plistSha256:sha(bytes),stateSha256:sha(readFileSync(join(HOME,'.homecook/prelaunch-web/state.json'))),buildId:state.buildId};
}
function round2Binding() {
  const state=json(join(HOME,'.homecook/prelaunch-web/state.json'));
  const marker=preserveRound2RotationState(state,{}).round2EightKeyRotation;check(marker,'rotation marker required');
  const fenceBytes=readClosedR2PrivateBytes(join(HOME,'.homecook/prelaunch-web/round2-eight-key-rotation-fence.json'),ROOT);
  check(sha(fenceBytes)===marker.fenceSha256,'immutable rotation fence');
  const env=parsePlist(readFileSync(WEB_PLIST)).EnvironmentVariables;assertRound2EightKeyFence(env,JSON.parse(fenceBytes));
  const control=readClosedR2PrivateBytes(env.MUMEOK_ROUND2_CONTROL_PATH,ROOT),flags=JSON.parse(control);
  check(flags.collection_enabled===false&&flags.lead_enabled===false&&(!env.MUMEOK_ROUND2_PREFLIGHT_ARM_PATH||!existsSync(env.MUMEOK_ROUND2_PREFLIGHT_ARM_PATH)),'Round2 control OFF/arm closed');
  return {marker,fenceSha256:sha(fenceBytes),controlSha256:sha(control)};
}
const flags=()=>['--config',P.config,'--manifest',P.manifest,'--credential',P.credential,'--secret-root',P.secrets,'--app-descriptor',P.descriptor,'--policy',P.policy,'--expected-schema',P.schema];
async function verifyInstalled(metadata) {
  const token=readClosedR2PrivateBytes(P.token,ROOT).toString('utf8').trim();assertV85WorkerCredential({claims:claims(token),metadata});
  const first=await stable(),env=await readWorkerEnvironment(P.config),caller=await verifyYoutubeResolutionWorkerCaller({environment:env,token,secretRoot:P.secrets});
  const h=JSON.parse(command(NODE,[join(P.artifact,'scripts/youtube-extraction-worker-runner.mjs'),'health',...flags()]));
  check(h.ok&&h.ready&&status().pid===first.pid,'health/same PID');return {...caller,ready:true,...first};
}
export async function runV85Cutover(a) {
  budgetCheck();await a.preflight();budgetCheck();await a.assertWebReady();budgetCheck();await a.assertUnissued();
  try {
    budgetCheck();await a.quiesce();budgetCheck();const m=await a.issueWorker();budgetCheck();const manager=await a.issueManager();budgetCheck();await a.register(m,manager);
    budgetCheck();await a.install(m);budgetCheck();const health=await a.verify(m);budgetCheck();await a.activate(m,health);budgetCheck();return await a.finish();
  }catch(error){await a.containFailure(error);throw error;}finally{await a.removeManager();}
}
export async function resumeV85Cutover(a) {
  budgetCheck();const state=await a.resumePreflight();
  if(state.activated)return a.verifyActivated();
  try {
    if(state.unissued){budgetCheck();state.metadata=await a.issueWorker();budgetCheck();const manager=await a.issueManager();budgetCheck();await a.register(state.metadata,manager);state.reconciliation={state:'registered'};}
    else if(state.reconciliation.state==='not-applied'){budgetCheck();const manager=await a.issueManager();budgetCheck();await a.register(state.metadata,manager);}
    check(state.reconciliation.state!=='unknown','unknown state; read-only reconcile');
    budgetCheck();await a.install(state.metadata);budgetCheck();const health=await a.verify(state.metadata);
    if(!state.enabled){budgetCheck();await a.activate(state.metadata,health);}budgetCheck();return await a.finish();
  }catch(error){await a.containFailure(error);throw error;}finally{await a.removeManager();}
}
async function adapters(c,authority) {
  const {plan,planSha256}=authority;let registrationSha256,verificationSha256,managerTokenSha256,health;
  const managerPath=join(P.secrets,'manager-v85-gen50.jwt'),metadata=()=>json(P.credential),before=plan.before;
  const readClaims=()=>claims(readClosedR2PrivateBytes(P.token,ROOT).toString('utf8').trim());
  const exactLineage=()=>{check(isDeepStrictEqual(plan.origin.authority,c.origin)&&plan.origin.v74ActivationSha256===V74_ACTIVATION_SHA256
    &&isDeepStrictEqual(plan.origin.fingerprintAuthority,c.legacy.fingerprintRecovery.pointer)&&plan.origin.fingerprintReceiptSha256===c.legacy.fingerprintRecovery.authority.receiptSha256,'unchanged original authorities');};
  const assertIssued=({repair=false}={})=>{const intent=json(join(OP,'issue-intent.json'));check(intent.planSha256===planSha256&&intent.generation===50&&intent.releaseSha===V.releaseSha&&intent.expiresAt===V.expiresAt,'issued plan');
    check(repair||(existsSync(P.credential)&&existsSync(join(OP,'issued.json'))),'incomplete issuance evidence requires user resume');
    const token=readClosedR2PrivateBytes(P.token,ROOT).toString('utf8').trim(),c=claims(token);
    const m=existsSync(P.credential)?metadata():buildYoutubeExtractionWorkerCredentialState({tokenFile:P.token,generation:50,jtiHash:c.jti_hash,expiresAt:new Date(c.exp*1000).toISOString(),releaseSha:V.releaseSha,schemaIdentity:V.schemaIdentity,allowedSnapshotDigest:V.snapshotDigest,secretRoot:P.secrets});
    verifyV85IssuedToken({token,metadata:m,jwtKeys:json(join(HOME,'.homecook/secrets/full-local-supabase/jwt_keys'))});
    if(repair&&!existsSync(P.credential))privateCreate(P.credential,JSON.stringify(m,null,2)+'\n');
    if(repair&&!existsSync(join(OP,'issued.json')))publish('issued.json',{planSha256,tokenSha256:sha(readFileSync(P.token)),metadataSha256:sha(readFileSync(P.credential)),recoveredExistingSignedToken:true});
    const receipt=json(join(OP,'issued.json'));check(receipt.planSha256===planSha256&&receipt.tokenSha256===sha(readFileSync(P.token))&&receipt.metadataSha256===sha(readFileSync(P.credential)),'durable exact issued50');return m;};
  const getIntent=()=>{const i=existsSync(join(OP,'registration-intent.json'))?json(join(OP,'registration-intent.json')):{planSha256,metadataSha256:sha(readFileSync(P.credential)),beforeSha256:sha(readFileSync(join(OP,'quiesced.json'))),before:json(join(OP,'quiesced.json'))};check(i.planSha256===planSha256&&i.metadataSha256===sha(readFileSync(P.credential))&&i.beforeSha256===sha(readFileSync(join(OP,'quiesced.json'))),'immutable registration intent');return i;};
  const reconcile=async({repair=false}={})=>{
    exactLineage();
    if(existsSync(join(OP,'activation.json'))){
      const proofBytes=readClosedR2PrivateBytes(join(OP,'activation.json'),ROOT,524288);check(readV85Approval('activation-sha256')===sha(proofBytes),'independent activated seal');
      const proof=JSON.parse(proofBytes),m=assertIssued(),o=await readSnapshot(c);
      assertV85Successor({authority:{plan,planSha256,proof},worker:c.predecessor,policy:(c.legacy.fingerprintRecovery.compensation??c.legacy.fingerprintRecovery.receipt).after.policy,origin:c.origin,recovery:c.legacy.fingerprintRecovery});
      const runtime=assertV85ActivatedRuntime(plan,proof,o,m);
      check(sha(readFileSync(PLIST))===proof.service.plistSha256,'activated launcher');webReady(plan);
      return {result:{state:'activated',mayRegister:false,mayIssue:false,readOnly:true,...runtime},observation:o,metadata:m};
    }
    if(!existsSync(join(OP,'issue-intent.json'))){check(!existsSync(P.token)&&!existsSync(P.credential),'partial issuance without intent');const o=await readSnapshot(c);preserved(before,o);
      check(isDeepStrictEqual(o.credential,before.credential)&&o.worker.credentialGeneration===49&&o.worker.policyStableSha256===before.worker.policyStableSha256&&zero(o.worker),'exact unissued49');
      return {result:{state:'unissued',mayIssue:false,mayRegister:false,next:'resume-preissuance'},observation:o};}
    const m=assertIssued({repair}),intent=getIntent(),o=await readSnapshot(c),result=classifyV85Registration({plan,intent,metadata:m,observed:o});
    if(result.state==='registered') {
      if(repair&&!existsSync(join(OP,'registration.json')))publish('registration.json',{planSha256,intent,observation:o,recoveredAfterUncertainCommit:true,web:webReady(plan)});
      if(existsSync(join(OP,'registration.json'))){const reg=json(join(OP,'registration.json'));check(reg.planSha256===planSha256&&isDeepStrictEqual(reg.intent,intent)
        &&reg.observation.worker.credentialRowSha256===o.worker.credentialRowSha256&&reg.observation.worker.policyStableSha256===o.worker.policyStableSha256,'exact recovered registration');
      registrationSha256=sha(readFileSync(join(OP,'registration.json')));}
    }
    return {result,observation:o,metadata:m};
  };
  const verifyBackup=()=>{const b=json(join(OP,'backup.json'));const stat=lstatSync(b.path);
    check(b.targetSha256===before.targetSha256&&b.fullArchiveDecoded===true&&dirname(b.path)===OP&&stat.isFile()&&!stat.isSymbolicLink()&&stat.uid===process.getuid()
      &&(stat.mode&0o777)===0o600&&stat.size===b.bytes&&sha(readFileSync(b.path))===b.sha256,'exact owned decoded backup');};
  const a={
    preflight:async()=>{exactLineage();await candidate();verifyClosedR2Control(loadClosedR2Review(ROOT),ROOT);const o=await observation(c);assertBefore(c,o);preserved(before,o);
      check(o.worker.credentialRowSha256===before.worker.credentialRowSha256&&o.worker.policyRowSha256===before.worker.policyRowSha256,'approved exact preimage');},
    assertWebReady:async()=>{webReady(plan);for(const p of ['/','/login','/privacy'])check((await fetch(`http://127.0.0.1:3100${p}`)).ok,'web health');},
    assertUnissued:async()=>{for(const p of [P.token,P.credential,managerPath,join(OP,'issue-intent.json'),join(OP,'quiesced.json')])check(!existsSync(p),'partial attempt; reconcile/resume, never issue again');},
    quiesce:async()=>{
      const o=await observation(c);assertBefore(c,o);preserved(before,o);const old=readFileSync(PLIST);check(sha(old)===plan.beforeService.plistSha256,'old launcher exact');
      privateExact(join(OP,'generation-49.plist'),old);
      if(!existsSync(join(OP,'backup.json'))){const dump=join(OP,`before-gen50-${randomUUID()}.dump`),fd=openSync(dump,'wx',0o600);let r;
      try{r=spawnSync('docker',['exec',c.target.postgresContainerId,'pg_dump','-U','postgres','-d','postgres','-Fc'],{timeout:v85RemainingTimeout(120000),stdio:['ignore',fd,'pipe']});fsyncSync(fd);}finally{closeSync(fd);}
      check(r.status===0&&lstatSync(dump).size>0,'full-local backup');
      for(const args of [['--list'],['--file=/dev/null']]){const input=openSync(dump,'r');let decoded;try{decoded=spawnSync('docker',['exec','-i',c.target.postgresContainerId,'pg_restore',...args],{timeout:v85RemainingTimeout(120000),stdio:[input,'ignore','pipe']});}finally{closeSync(input);}check(decoded.status===0,'backup decode');}
      publish('backup.json',{path:dump,targetSha256:before.targetSha256,sha256:sha(readFileSync(dump)),bytes:lstatSync(dump).size,fullArchiveDecoded:true});}
      verifyBackup();const off=await transaction(c,async tx=>{const b=await tx.observe();assertBefore(c,b);preserved(before,b);check(b.worker.credentialRowSha256===before.worker.credentialRowSha256&&b.worker.policyRowSha256===before.worker.policyRowSha256,'locked approved preimage');
        await tx.query("UPDATE private.youtube_extraction_current_policy SET enabled=false,updated_at=clock_timestamp() WHERE policy_key='primary' AND enabled=true;");const post=await tx.observe();preserved(b,post);check(!post.policy.enabled&&zero(post.worker),'OFF/drained');return post;});
      publish('quiesced.json',off);check(sha(readFileSync(PLIST))===plan.beforeService.plistSha256,'old launcher before stop');command('/bin/launchctl',['bootout',SERVICE]);
      for(let i=0;i<40&&status().loaded;i++)await delay(250);check(!status().loaded,'old worker stopped');
    },
    issueWorker:async()=>{
      const now=new Date(),ttlSeconds=Date.parse(V.expiresAt)/1000-Math.floor(now.getTime()/1000);check(ttlSeconds>0&&ttlSeconds<=7*86400,'bounded remaining lifetime');
      publish('issue-intent.json',{planSha256,generation:50,releaseSha:V.releaseSha,expiresAt:V.expiresAt,at:now.toISOString()});
      const worker=issueYoutubeExtractionWorkerCredential({jwtKeys:json(join(HOME,'.homecook/secrets/full-local-supabase/jwt_keys')),generation:50,releaseSha:V.releaseSha,schemaIdentity:V.schemaIdentity,allowedSnapshotDigest:V.snapshotDigest,now,ttlSeconds});
      privateCreate(P.token,worker.token+'\n');const m=buildYoutubeExtractionWorkerCredentialState({tokenFile:P.token,generation:50,jtiHash:worker.jtiHash,expiresAt:worker.metadata.expires_at,releaseSha:V.releaseSha,schemaIdentity:V.schemaIdentity,allowedSnapshotDigest:V.snapshotDigest,secretRoot:P.secrets});
      assertV85WorkerCredential({claims:claims(worker.token),metadata:m,now});privateCreate(P.credential,JSON.stringify(m,null,2)+'\n');publish('issued.json',{planSha256,tokenSha256:sha(readFileSync(P.token)),metadataSha256:sha(readFileSync(P.credential))});return m;
    },
    issueManager:async()=>{let m;
      if(existsSync(managerPath)){const bytes=readClosedR2PrivateBytes(managerPath,ROOT),hash=sha(bytes),receipt=json(join(OP,`manager-owned-${hash}.json`));
        check(receipt.planSha256===planSha256&&receipt.tokenSha256===hash,'foreign manager file');const token=bytes.toString('utf8').trim(),c=claims(token);
        check(Date.parse(receipt.expiresAt)===c.exp*1000,'owned manager expiry');
        if(c.exp*1000<=Date.now())unlinkSync(managerPath);else m={token,claims:c};
      }
      if(!m){m=issueYoutubeExtractionCredentialManager({jwtKeys:json(join(HOME,'.homecook/secrets/full-local-supabase/jwt_keys')),ttlSeconds:300});
        privateCreate(managerPath,m.token+'\n');const hash=sha(readFileSync(managerPath));publish(`manager-owned-${hash}.json`,{planSha256,tokenSha256:hash,expiresAt:new Date(m.claims.exp*1000).toISOString()});}
      managerTokenSha256=sha(readFileSync(managerPath));assertV71ManagerClaims(m.claims);check(m.claims.iat*1000<=Date.now()+30000,'future manager');const env=await readWorkerEnvironment(P.config);
      const client=createRestrictedPostgrestRpcClient({dataApiUrl:env.HOMECOOK_YOUTUBE_WORKER_DATA_API_URL,apiKey:readClosedR2PrivateBytes(env.HOMECOOK_YOUTUBE_WORKER_DATA_API_KEY_FILE,ROOT).toString('utf8').trim(),token:m.token});
      check((await client.rpc('check_youtube_extraction_worker_pre_request')).error===null,'manager authenticated');return m;},
    register:async(m,manager)=>{
      assertIssued();let intent;
      if(existsSync(join(OP,'registration-intent.json'))){const recovery=await reconcile();check(recovery.result.state==='not-applied','same50 CAS allowed only after exact not-applied');intent=getIntent();}
      else{const off=json(join(OP,'quiesced.json'));intent={planSha256,metadataSha256:sha(readFileSync(P.credential)),beforeSha256:sha(readFileSync(join(OP,'quiesced.json'))),before:off};publish('registration-intent.json',intent);}
      const registered=await transaction(c,async tx=>{
        const b=await tx.observe();check(classifyV85Registration({plan,intent,metadata:m,observed:b}).state==='not-applied','locked exact49 OFF CAS');check(!status().loaded,'old worker remains stopped');
        await tx.query(buildV85RegistrationSql({claims:readClaims(),metadata:m,managerClaims:manager.claims}));const post=await tx.observe();assertV85After(plan,post,m,false);return post;
      });registrationSha256=publish('registration.json',{planSha256,intent,observation:registered,web:webReady(plan)});
    },
    install:async()=>{
      const recovery=await reconcile();check(recovery.result.state==='registered','exact registered50');
      const preflight=await candidate(),raw=buildYoutubeExtractionWorkerInstallPlan({configPath:P.config,manifestPath:P.manifest,credentialPath:P.credential,appDescriptorPath:P.descriptor,currentPolicyPath:P.policy,expectedSchemaPath:P.schema,secretRoot:P.secrets,homeDir:HOME,nodeBin:NODE,rootDir:P.artifact,userId:process.getuid(),dryRun:true,i031Preflight:{ready:true,codexCliVersion:preflight.codexCliVersion,chatGptLogin:true,toolsReady:true}});
      const preview=preserveYoutubeResolutionLauncherEnvironment(parsePlist(readFileSync(join(OP,'generation-49.plist'))),raw.plist_preview),target=sha(preview),current=sha(readFileSync(PLIST)),running=status();
      check(current===plan.beforeService.plistSha256||current===target,'foreign launcher');check(!running.loaded||current===target,'foreign loaded predecessor');
      if(current===target&&running.loaded&&running.state==='running'){await stable();return;}
      if(running.loaded)command('/bin/launchctl',['bootout',SERVICE]);if(current!==target){privateCreate(PLIST+'.v85.tmp',preview);renameSync(PLIST+'.v85.tmp',PLIST);}
      command('/bin/launchctl',['bootstrap',`gui/${process.getuid()}`,PLIST]);await stable();
    },
    verify:async m=>{verifyClosedR2Control(loadClosedR2Review(ROOT),ROOT);health=await verifyInstalled(m);const o=await observation(c);assertV85After(plan,o,m,o.policy.enabled);check(!o.policy.enabled||existsSync(join(OP,'verification.json')),'ON requires prior durable verification');
      verificationSha256=publish(existsSync(join(OP,'verification.json'))?`verification-repair-${randomUUID()}.json`:'verification.json',{planSha256,registrationSha256,observation:o,health,web:webReady(plan),service:{plistSha256:sha(readFileSync(PLIST))}});return health;},
    activate:async(m,h)=>{verifyClosedR2Control(loadClosedR2Review(ROOT),ROOT);check(verificationSha256,'durable fresh verification');await transaction(c,async tx=>{const b=await tx.observe();assertV85After(plan,b,m,false);check(status().pid===h.pid,'same verified PID');
      await tx.query("UPDATE private.youtube_extraction_current_policy SET enabled=true,updated_at=clock_timestamp() WHERE policy_key='primary' AND enabled=false;");const post=await tx.observe();assertV85After(plan,post,m,true);});},
    finish:async()=>{
      const after=await observation(c),m=assertIssued();assertV85After(plan,after,m,true);const currentHealth=await verifyInstalled(m);
      const proof={schema:'homecook.youtube-v85-activation.v1',planSha256,before,after,metadata:m,web:webReady(plan),registrationSha256,verificationSha256,health:currentHealth,service:{plistSha256:sha(readFileSync(PLIST))},at:new Date().toISOString()};
      assertV85Successor({authority:{plan,planSha256,proof},worker:c.predecessor,policy:(c.legacy.fingerprintRecovery.compensation??c.legacy.fingerprintRecovery.receipt).after.policy,origin:c.origin,recovery:c.legacy.fingerprintRecovery});
      const hash=publish('activation.json',proof);registerV85Approval(hash,'activation-sha256');return {activated:true,generation:50,releaseSha:V.releaseSha,webRef:plan.webRef,activationSha256:hash,modelCalls:0};
    },
    resumePreflight:async()=>{exactLineage();await candidate();webReady(plan);verifyClosedR2Control(loadClosedR2Review(ROOT),ROOT);
      if(existsSync(join(OP,'activation.json'))){await reconcile();return {activated:true};}
      if(!existsSync(join(OP,'issue-intent.json'))){check(!existsSync(P.token)&&!existsSync(P.credential),'partial issuance; never issue again');
        let o=await observation(c);preserved(before,o);check(isDeepStrictEqual(o.credential,before.credential)&&o.worker.credentialGeneration===49&&o.worker.policyStableSha256===before.worker.policyStableSha256&&zero(o.worker),'unissued original49');
        if(o.policy.enabled){await a.quiesce();o=await observation(c);}else{
          verifyBackup();check(sha(readClosedR2PrivateBytes(join(OP,'generation-49.plist'),ROOT))===plan.beforeService.plistSha256&&sha(readFileSync(PLIST))===plan.beforeService.plistSha256,'owned original49 launcher');
          if(!existsSync(join(OP,'quiesced.json')))publish('quiesced.json',o);else check(json(join(OP,'quiesced.json')).worker.policyRowSha256===o.worker.policyRowSha256,'exact recovered OFF');
          if(status().loaded)command('/bin/launchctl',['bootout',SERVICE]);check(!status().loaded,'old worker stopped before first issue');
        }
        return {unissued:true,enabled:false};
      }
      const r=await reconcile({repair:true});check(r.result.state!=='unknown','read-only unknown; no retry');
      check(!r.observation.policy.enabled||existsSync(join(OP,'verification.json')),'ON without durable verification');return {activated:existsSync(join(OP,'activation.json')),enabled:r.observation.policy.enabled,metadata:r.metadata,reconciliation:r.result};},
    verifyActivated:async()=>{const proof=json(join(OP,'activation.json'));assertV85Successor({authority:{plan,planSha256,proof},worker:c.predecessor,policy:(c.legacy.fingerprintRecovery.compensation??c.legacy.fingerprintRecovery.receipt).after.policy,origin:c.origin,recovery:c.legacy.fingerprintRecovery});
      const o=await observation(c);assertV85ActivatedRuntime(plan,proof,o,assertIssued());for(const k of ['credentialRowSha256','policyRowSha256','policyStableSha256'])check(o.worker[k]===proof.after.worker[k],'activated rows exact');
      check(sha(readFileSync(PLIST))===proof.service.plistSha256&&readV85Approval('activation-sha256')===sha(readClosedR2PrivateBytes(join(OP,'activation.json'),ROOT,524288)),'activated launcher/seal');await verifyInstalled(metadata());return {activated:true,readOnly:true,generation:50,modelCalls:0};},
    containFailure:async error=>{
      // No new issuance/registration here. Give owned-identity containment a separate minute.
      operationDeadline=performance.now()+60000;
      // Never close a foreign/newer generation. Unknown outcomes get read-only evidence only.
      let result={state:'unknown'};try{result=(await reconcile()).result;}catch{/* Partial local issuance needs operator readback. */}
      let closedOwn50=false;
      try {const m=assertIssued();await transaction(c,async tx=>{const o=await tx.observe();if(ownsV85Registration(plan,o,m)&&o.policy.enabled){await tx.query("UPDATE private.youtube_extraction_current_policy SET enabled=false,updated_at=clock_timestamp() WHERE policy_key='primary';");closedOwn50=true;}});}catch{/* No foreign/unknown identity is modified. Manual readback remains necessary. */}
      publish(`failure-${randomUUID()}.json`,{planSha256,reconciliation:result,closedOwn50,errorKind:error.name,noAutomaticRetry:true,same50ForwardOnly:true,at:new Date().toISOString()});
    },
    removeManager:async()=>{if(existsSync(managerPath)){const hash=sha(readClosedR2PrivateBytes(managerPath,ROOT)),receipt=json(join(OP,`manager-owned-${hash}.json`));check(receipt.planSha256===planSha256&&receipt.tokenSha256===hash&&(!managerTokenSha256||hash===managerTokenSha256),'foreign manager not removed');unlinkSync(managerPath);}},
    reconcile,
  };return a;
}
async function main() {
  const [action,arg1,arg2]=process.argv.slice(2);check(process.argv.length===(['prepare','prepare-continuation','approve-plan'].includes(action)?5:3),'exact arguments only');check(['prepare','prepare-continuation','approve-plan','stage','preflight','apply','reconcile','resume'].includes(action),'usage: prepare|prepare-continuation REF OUTPUT_DIR | approve-plan PLAN SHA | stage | preflight | apply | reconcile | resume');
  if(['approve-plan','apply','resume'].includes(action)){
    const boundary={platform:process.platform,stdinTTY:Boolean(process.stdin.isTTY),stdoutTTY:Boolean(process.stdout.isTTY),stderrTTY:Boolean(process.stderr.isTTY)};
    assertV85UserTerminal(boundary);
    const path=action==='approve-plan'?arg1:join(OP,existsSync(join(OP,'continuation-plan.json'))?'continuation-plan.json':'plan.json');
    await confirmV85ReviewedOperation(action,readClosedR2PrivateBytes(path,ROOT,524288),boundary,output);
  }
  if(action==='apply'||action==='resume')operationDeadline=performance.now()+600000;
  if(action==='prepare'||action==='prepare-continuation'){
    check(/^[a-f0-9]{40}$/u.test(arg1??'')&&arg2&&resolve(arg2).startsWith('/tmp/'),'prepare exact SHA and new /tmp directory');
    check(!existsSync(arg2),'output exists');command('git',['-C',ROOT,'merge-base','--is-ancestor',V.releaseSha,arg1]);
    check(command('git',['-C',ROOT,'rev-parse','HEAD'])===arg1&&!command('git',['-C',ROOT,'status','--porcelain','--untracked-files=no']),'clean reviewed source');
    mkdirSync(arg2,{mode:0o700});const outputDirectory=realpathSync(arg2),c=await context(outputDirectory),before=await readSnapshot(c);assertBefore(c,before);verifyClosedR2Control(loadClosedR2Review(ROOT),ROOT);
    check(sha(readFileSync(PLIST))===c.legacy.proof.service.plistSha256,'original activated49 launcher');const web=parsePlist(readFileSync(WEB_PLIST));check(command('git',['-C',web.WorkingDirectory,'rev-parse','HEAD'])===V.from,'unchanged web06a');
    const plan={schema:'homecook.youtube-v85-plan.v1',webRef:arg1,releaseSha:V.releaseSha,artifactSha256:V.artifactSha256,descriptorSha256:V.descriptorSha256,expiresAt:V.expiresAt,
      before,beforeService:{plistSha256:sha(readFileSync(PLIST)),pid:status().pid,configSha256:sha(readClosedR2PrivateBytes(v74Paths().config,ROOT))},origin:{authority:c.origin,v74ActivationSha256:V74_ACTIVATION_SHA256,
        fingerprintAuthority:c.legacy.fingerprintRecovery.pointer,fingerprintReceiptSha256:c.legacy.fingerprintRecovery.authority.receiptSha256},sources:sourceDigests(arg1)};
    if(action==='prepare-continuation'){
      const originalBytes=readClosedR2PrivateBytes(join(OP,'plan.json'),ROOT,524288),original=assertV85Plan(JSON.parse(originalBytes));check(readV85Approval()===sha(originalBytes),'original immutable approval');
      plan.schema='homecook.youtube-v85-continuation-plan.v1';plan.originalPlan=original;plan.round2Binding=round2Binding();
      const sourceDelta={};for(const file of new Set([...Object.keys(original.sources),...Object.keys(plan.sources)])){
        const prior=original.sources[file]??[plan.sources[file]?.[0]??null,plan.sources[file]?.[0]??null],next=plan.sources[file]??[prior[0],prior[0]];
        if(prior[1]!==next[1])sourceDelta[file]=[prior[1],next[1]];
      }
      plan.continuation={schema:'homecook.youtube-v85-continuation.v1',originalPlanSha256:sha(originalBytes),originalCanonicalSha256:sha(JSON.stringify(original)),sourceDelta,
        requiresExplicitUnattributedDataAcknowledgement:true,rawBeforeImagesAvailable:false,classification:'unattributed-prior-auth-normal-and-extra-job',dataDeltas:v85ContinuationDataDeltas(original,before)};
      if(sourceDelta['package.json'])plan.continuation.packageEvidence={before:commandBytes('git',['-C',ROOT,'show',`${original.webRef}:package.json`]).toString('utf8'),after:commandBytes('git',['-C',ROOT,'show',`${arg1}:package.json`]).toString('utf8')};
    }
    assertV85ExecutionPlan(plan);privateCreate(join(outputDirectory,'plan.json'),JSON.stringify(plan,null,2)+'\n');
    output({prepared:true,planPath:join(outputDirectory,'plan.json'),planSha256:sha(readFileSync(join(outputDirectory,'plan.json'))),webRef:arg1,releaseSha:V.releaseSha,generation:50,expiresAt:V.expiresAt,issued:false,operatingChanged:false,
      priorDataChangesUnattributed:action==='prepare-continuation',originalJobsPreserved:before.originalJobsSha256===plan.originalPlan?.before.jobsSha256});return;
  }
  if(action==='approve-plan'){
    const bytes=readClosedR2PrivateBytes(arg1,ROOT,524288);check(sha(bytes)===arg2,'explicit approved plan hash');const review=assertV85ExecutionPlan(JSON.parse(bytes));
    // Run only after the human confirms the exact issuance/transition package. No token is created here.
    mkdirSync(OP,{mode:0o700,recursive:true});check(lstatSync(OP).isDirectory()&&!lstatSync(OP).isSymbolicLink()&&lstatSync(OP).uid===process.getuid(),'owned approval directory');chmodSync(OP,0o700);
    const continuation=review.schema==='homecook.youtube-v85-continuation-plan.v1',destination=join(OP,continuation?'continuation-plan.json':'plan.json');
    if(continuation){const original=readClosedR2PrivateBytes(join(OP,'plan.json'),ROOT,524288);check(readV85Approval()===sha(original)&&review.continuation.originalPlanSha256===sha(original)&&isDeepStrictEqual(JSON.parse(original),review.originalPlan),'preserved original approval before continuation');}
    if(existsSync(destination))check(sha(readFileSync(destination))===arg2,'existing different plan');
    registerV85Approval(arg2,continuation?'approved-continuation-sha256':'approved-plan-sha256');
    if(!existsSync(destination))privateCreate(destination,bytes);
    output({approvedPlanBound:true,credentialIssued:false});return;
  }
  const authority=approvedPlan();check(lstatSync(OP).isDirectory()&&!lstatSync(OP).isSymbolicLink()&&lstatSync(OP).uid===process.getuid()&&(lstatSync(OP).mode&0o777)===0o700,'owned private operation directory');
  if(action==='reconcile'){
    const c=await context(),a=await adapters(c,authority),r=await a.reconcile();
    output({...r.result,credentialIssued:false,readOnly:true});return;
  }
  const lock=await acquirePrelaunchDeployLock();try{
    if(action==='stage'){
      const result=existsSync(P.artifact)?{manifest:verifyYoutubeExtractionWorkerArtifact(P.manifest)}:materializeYoutubeExtractionWorkerArtifact({rootDir:ROOT,outputDir:P.artifact,releaseSha:V.releaseSha,releaseTree:'a3791e0d2056b89579a176d2dbe30dde52fdc628',buildId:'v85-prepared-1be5eeea5dd9',promotionId:'v85-gen50-pending-confirmation-20261017',schemaIdentity:V.schemaIdentity,allowedSnapshotDigest:V.snapshotDigest,policyVersion:3,pipelineIdentity:V.pipelineIdentity});
      check(result.manifest.artifact_sha256===V.artifactSha256,'original sealed artifact bytes');
      const descriptor=JSON.stringify(buildYoutubeExtractionAppDescriptor({releaseSha:V.releaseSha,schemaIdentity:V.schemaIdentity,expectedPolicyVersion:3,expectedPolicySnapshotDigest:V.snapshotDigest,artifactSha256:V.artifactSha256,expectedSchemaSha256:result.manifest.expected_schema_sha256}),null,2)+'\n';
      check(sha(descriptor)===V.descriptorSha256,'original descriptor');privateExact(P.descriptor,descriptor);
      const oldConfig=readClosedR2PrivateBytes(v74Paths().config,ROOT);check(sha(oldConfig)===authority.plan.beforeService.configSha256,'approved original worker config');privateExact(P.config,oldConfig);
      privateExact(P.policy,JSON.stringify(buildYoutubeExtractionCurrentPolicy({policyVersion:3,policySnapshotDigest:V.snapshotDigest,pipelineIdentity:V.pipelineIdentity,enabled:true}),null,2)+'\n');
      privateExact(join(OP,'web-metadata.env'),Object.entries(v85MetadataPatch()).map(([k,v])=>`${k}='${v}'`).join('\n')+'\n');await candidate();output({staged:true,credentialIssued:false});return;
    }
    const c=await context(),a=await adapters(c,authority);
    if(action==='preflight'){await a.preflight();output({ready:true,credentialIssued:false});return;}
    output(action==='resume'?await resumeV85Cutover(a):await runV85Cutover(a));
  }finally{await lock.release();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message?.startsWith('v85:')?error.message:'v85 cutover stopped; private evidence/readback required; no automatic retry');process.exitCode=1;});
