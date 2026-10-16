import { spawnSync } from 'node:child_process';
import { closeSync, constants, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { createRecordingDockerAdapter, privatePath } from './marketing-round2-controlled-deploy.mjs';
import { createProtectedPrelaunchAdapter, assertCookedWeightAttestationCurrentObservation } from './prelaunch-database.mjs';
import { acquirePrelaunchDeployLock, acquireClosedR2ControlLease, loadClosedR2Review, verifyClosedR2Control,
  loadCookedWeightAttestationSuccessor, loadCurrentDatabaseMaintenance, loadCookedWeightAttestationWorkerContinuation,
  readClosedR2PrivateBytes } from './prelaunch-web-deploy.mjs';
import { V74_ACTIVATION_SHA256, V74_OPERATION_DIRECTORY, assertV74WorkerSuccessor, assertV74LoadedService } from './prelaunch-youtube-v74-cutover.mjs';
import { openDedicatedAdminSession } from '../youtube-resolution-controlled-db.mjs';
import { verifyOperatingYoutubeEnqueueRuntime } from './youtube-enqueue-runtime-preflight-ops.mjs';
import { FINGERPRINT_RECOVERY_FROM, FINGERPRINT_RECOVERY_SCHEMA, FINGERPRINT_RECOVERY_CONFIRMATION,
  FINGERPRINT_RECOVERY_STATE_SQL, FINGERPRINT_RECOVERY_BEGIN_SQL, FINGERPRINT_RECOVERY_TABLE_LOCK_SQL,
  transitionFingerprintPolicy, fingerprintRecoveryHash as hash, assertFingerprintRecoveryState,
  classifyFingerprintReconciliation, assertFingerprintReceipt } from './youtube-fingerprint-recovery.mjs';
import { FINGERPRINT_RECOVERY_DIRECTORY as OP, assertFingerprintSource, readFingerprintRecoveryAuthority,
  fingerprintWorkerSuccessor, fingerprintRecoveryAttemptDirectory } from './youtube-fingerprint-recovery-authority.mjs';
import { readFingerprintPlanApproval, registerFingerprintPlanApproval } from './youtube-fingerprint-approval.mjs';

const HOME_DIR = homedir();
const DB_CONFIG = join(HOME_DIR, '.homecook/operations/mumeok-beta-db-backup-20261015-4g3a88bt/staged-production.env');
const WEB_PLIST = join(HOME_DIR, 'Library/LaunchAgents/com.homecook.production.plist');
const WORKER_PLIST = join(HOME_DIR, 'Library/LaunchAgents/com.homecook.youtube-extraction-worker.plist');
const check = (ok, why) => { if (!ok) throw new Error(`fingerprint operation: ${why}`); };
function command(bin, args, input) {
  const r = spawnSync(bin, args, { input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 30000 });
  check(r.status === 0, 'command-failed-output-withheld'); return r.stdout.trim();
}
function createPrivate(file, value) {
  check(!existsSync(file),'immutable-file-already-exists');
  const temporary=`${file}.${randomUUID()}.tmp`;
  const fd = openSync(temporary, constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, value); fsyncSync(fd); } finally { closeSync(fd); }
  // All publishers hold the common deploy lock (prepare owns its exclusive output).
  // Publish complete bytes atomically; never replace a known terminal record.
  try { check(!existsSync(file),'immutable-publication-race');renameSync(temporary,file); }
  finally { if(existsSync(temporary))unlinkSync(temporary); }
  const parent = openSync(dirname(file), 'r'); try { fsyncSync(parent); } finally { closeSync(parent); }
}
function publishIfExact(root,file,value) {
  const raw=bytes(value);
  if(existsSync(file))check(readClosedR2PrivateBytes(file,root,524288).equals(Buffer.from(raw)),'immutable-publication-conflict');
  else createPrivate(file,raw);
}
const bytes = value => JSON.stringify(value, null, 2) + '\n';
export function preservedFingerprintObservation(full) {
  const omit=new Set(['policyRowSha256','policyStableSha256','queued','processing','permitHeld','activeEnqueueSessions']);
  const worker=Object.fromEntries(Object.entries(full.worker).filter(([key])=>!omit.has(key)));
  return { ...Object.fromEntries(Object.entries(full).filter(([key])=>key!=='fingerprintPolicy')), worker };
}
function live(root) {
  const webBytes = readFileSync(WEB_PLIST), workerBytes = readFileSync(WORKER_PLIST);
  const plist = JSON.parse(command('/usr/bin/plutil', ['-convert','json','-o','-','--','-'], webBytes));
  const worker = JSON.parse(command('/usr/bin/plutil', ['-convert','json','-o','-','--','-'], workerBytes));
  const target = `gui/${process.getuid()}/com.homecook.youtube-extraction-worker`;
  const workerState = assertV74LoadedService({ stdout: command('/bin/launchctl', ['print', target]), plist: worker,
    plistPath: WORKER_PLIST, serviceTarget: target });
  const ref = command('git', ['-C', plist.WorkingDirectory, 'rev-parse', 'HEAD']);
  check(!existsSync(join(HOME_DIR,'.homecook/prelaunch-web/recovery.json')), 'web-recovery-pending');
  const stateBytes = readClosedR2PrivateBytes(join(HOME_DIR,'.homecook/prelaunch-web/state.json'), root, 524288);
  const state = JSON.parse(stateBytes);
  check(state.targetPlistHash === hash(webBytes) && state.buildId === readFileSync(join(plist.WorkingDirectory,'.next/BUILD_ID'),'utf8').trim(), 'official-web-state');
  return { ref, plist, web: { ref, plistSha256: hash(webBytes), stateSha256: hash(stateBytes), buildId: state.buildId },
    service: { pid: workerState.pid, plistSha256: hash(workerBytes) } };
}
export function fingerprintSourceDigests(root, from, to) {
  const files = command('git', ['-C',root,'diff','--name-only','--no-renames',from,to,'--']).split('\n').filter(Boolean).sort();
  return Object.fromEntries(files.map(file => [file, [from,to].map(ref => {
    const found = command('git',['-C',root,'ls-tree',ref,'--',file]);
    return found ? hash(spawnSync('git',['-C',root,'show',`${ref}:${file}`],{maxBuffer:32*1024*1024}).stdout) : null;
  })]));
}
async function context(root, { includeRecovery = true } = {}) {
  const read = file => readClosedR2PrivateBytes(file, root, 524288);
  const successor = loadCookedWeightAttestationSuccessor(root), maintenance = loadCurrentDatabaseMaintenance(root);
  const continuation = loadCookedWeightAttestationWorkerContinuation(successor, root);
  const activationBytes = read(join(V74_OPERATION_DIRECTORY,'activation.json'));
  check(hash(activationBytes) === V74_ACTIVATION_SHA256, 'v74-original-bytes');
  const proof = JSON.parse(activationBytes), origin = { personalSuccessor: successor.pointer, databaseMaintenance: maintenance.pointer,
    c04Activation: continuation.activation.pointer, c04Post: continuation.post.pointer };
  const worker = assertV74WorkerSuccessor({ proof, baseline: successor.review.database.workerBaseline,
    approvedPolicy: continuation.observation, origin });
  const recovery = includeRecovery ? readFingerprintRecoveryAuthority(read) : null;
  const activeWorker = fingerprintWorkerSuccessor(worker,recovery,origin,V74_ACTIVATION_SHA256);
  const adapter = await createRecordingDockerAdapter({ configPath: DB_CONFIG, backupDirectory: V74_OPERATION_DIRECTORY });
  const target = await adapter.inspect();
  check(target.database.systemIdentifier === '7669475895419854882' && target.database.major === 17, 'exact-local-db17-target');
  const protectedAdapter = createProtectedPrelaunchAdapter(adapter,maintenance.review.feature,maintenance.review,maintenance);
  const observe = async query => {
    // Same observer/search_path/timezone as immutable v74 evidence. No new auth/RPC grants.
    if (!query) return protectedAdapter.observe(undefined,'youtube-fingerprint-recovery-observe');
    await query("SAVEPOINT fingerprint_observer; SET LOCAL ROLE postgres; SET LOCAL search_path=public,extensions; SET LOCAL TIME ZONE 'UTC';");
    try { return await protectedAdapter.observe(query,'youtube-fingerprint-recovery-observe'); }
    finally { await query('ROLLBACK TO SAVEPOINT fingerprint_observer; RELEASE SAVEPOINT fingerprint_observer;'); }
  };
  return { root, read, successor, maintenance, continuation, proof, origin, activeWorker, recovery, adapter, target, observe,
    approvedWorkerSuccessor: { proof, origin, fingerprintRecovery: recovery } };
}
function assertFull(c, full) {
  assertCookedWeightAttestationCurrentObservation(c.successor,full,{ quantityWriterState:'on',
    approvedWorkerPolicy:c.continuation.observation, approvedWorkerSuccessor:c.approvedWorkerSuccessor, databaseMaintenance:c.maintenance });
  check(full.ledger.length === 232, 'ledger232');
}
async function state(c, query) {
  return JSON.parse((await (query ?? (sql => c.adapter.query(sql)))(FINGERPRINT_RECOVERY_STATE_SQL)).trim());
}
export async function prepareFingerprintRecovery({ root, candidate, output }) {
  check(/^[a-f0-9]{40}$/u.test(candidate), 'candidate-sha');
  check(command('git',['-C',root,'rev-parse','HEAD'])===candidate,'executing-candidate-source');
  check(isAbsolute(output) && resolve(output)===output && relative(root,output).startsWith(`..${sep}`),'external-private-output');
  await privatePath(dirname(output),true);
  check(command('git',['-C',root,'status','--porcelain']) === '', 'commit-reviewed-source-first');
  const c = await context(root), current = live(root);
  check(current.ref === FINGERPRINT_RECOVERY_FROM && !c.recovery, 'exact-original-web');
  verifyClosedR2Control(loadClosedR2Review(root),root);
  const full = await c.observe(); assertFull(c,full);
  check(isDeepStrictEqual(preservedFingerprintObservation(full).worker,
    preservedFingerprintObservation({worker:c.proof.after.worker}).worker),'v74-complete-worker-preimage');
  const before = await state(c); assertFingerprintRecoveryState(before,{version:'1',requireOriginalV2:true});
  const plan = { schema:'homecook.youtube-fingerprint-recovery-plan.v1', from:current.ref,candidate,
    preparedAt:new Date().toISOString(), origin:{v74ActivationSha256:V74_ACTIVATION_SHA256,authority:c.origin},
    configSha256:hash(readClosedR2PrivateBytes(DB_CONFIG,root)), targetSha256:hash(JSON.stringify(full.target)),
    before, beforePreserved:preservedFingerprintObservation(full), web:current.web, service:current.service,
    sources:fingerprintSourceDigests(root,current.ref,candidate), existingV2Verification:await verifyExistingKey(c,current),
    keyChanges:0, operatingTransitionApproved:false, httpAcceptanceRequired:true };
  assertFingerprintSource({plan,from:plan.from,to:candidate,digests:plan.sources});
  // Only evidence output; never create the operational authority during preparation.
  createPrivate(output,bytes(plan));
  return {planPath:output,planSha256:hash(readFileSync(output)),candidate,readOnly:true,secretCreated:false};
}
function approvedPlan(root, planPath, planSha256, confirmation) {
  check(confirmation === FINGERPRINT_RECOVERY_CONFIRMATION && /^[a-f0-9]{64}$/u.test(planSha256), 'explicit-exact-confirmation');
  const raw = readClosedR2PrivateBytes(planPath,root,524288);
  check(hash(raw) === planSha256,'approved-plan-bytes');
  const plan = JSON.parse(raw);
  check(command('git',['-C',root,'rev-parse','HEAD'])===plan.candidate
    && command('git',['-C',root,'status','--porcelain'])==='','executing-approved-clean-source');
  check(Number.isFinite(Date.parse(plan.preparedAt)) && Date.now() >= Date.parse(plan.preparedAt), 'plan-time');
  assertFingerprintSource({plan,from:plan.from,to:plan.candidate,digests:fingerprintSourceDigests(root,plan.from,plan.candidate)});
  return {plan,raw};
}
async function verifyExistingKey(c,current) {
  const rows=JSON.parse(await c.adapter.query(`SELECT coalesce(json_agg(json_build_object('user_id',user_id,
   'youtube_video_id',youtube_video_id,'extractor_mode',extractor_mode,'pipeline_identity',pipeline_identity,
   'policy_version',policy_version,'result_affecting_options',result_affecting_options,'fingerprint',request_fingerprint)),'[]'::json)::text
   FROM public.youtube_extraction_jobs WHERE request_fingerprint_key_version='2';`));
  return verifyOperatingYoutubeEnqueueRuntime({codeRoot:c.root,plist:current.plist,
    readiness:{currentFingerprintKeyVersion:'2',previousFingerprintKeyVersion:null,previousFingerprintValidUntil:null},rows});
}
export async function authorizeFingerprintPlan({root,planPath,planSha256,confirmation}) {
  const {plan}=approvedPlan(root,planPath,planSha256,confirmation);
  const c=await context(root),current=live(root);
  check(isDeepStrictEqual(current.web,plan.web) && isDeepStrictEqual(current.service,plan.service),'approval-live-drift');
  await verifyExistingKey(c,current);
  return {...registerFingerprintPlanApproval(planSha256),keyChanges:0};
}
export async function applyFingerprintRecovery({root,planPath,planSha256,confirmation,retry=false}) {
  const {plan,raw} = approvedPlan(root,planPath,planSha256,confirmation);
  check(readFingerprintPlanApproval()===planSha256,'independent-plan-approval');
  const lock = acquirePrelaunchDeployLock(); let lease,session;
  try {
    lease = await acquireClosedR2ControlLease(loadClosedR2Review(root),root);
    const c = await context(root), current = live(root);
    check(!c.recovery && isDeepStrictEqual(current.web,plan.web)
      && isDeepStrictEqual(current.service,plan.service), 'predecessor-or-operation-drift');
    const previousAttempt=fingerprintRecoveryAttemptDirectory();
    if (existsSync(OP)) check(retry && previousAttempt && existsSync(join(previousAttempt,'not-applied.json'))
      && hash(c.read(join(OP,'plan.json')))===planSha256,'known-not-applied-retry-only');
    else check(!retry,'retry-needs-original-attempt');
    check(hash(readClosedR2PrivateBytes(DB_CONFIG,root)) === plan.configSha256, 'config-drift');
    await verifyExistingKey(c,current);
    if (!existsSync(OP)) {
      mkdirSync(OP,{mode:0o700}); createPrivate(join(OP,'plan.json'),raw);
      createPrivate(join(OP,'policy-backup.json'),bytes({targetSha256:plan.targetSha256,policy:plan.before.policy,policyRowSha256:plan.before.policyRowSha256}));
    }
    const attempt=join(OP,`attempt-${previousAttempt?Number(previousAttempt.split('attempt-').at(-1))+1:1}`);
    mkdirSync(attempt,{mode:0o700});
    session = openDedicatedAdminSession(c.target.postgresContainerId,'youtube-resolution-fingerprint-v2-recovery');
    const observePreserved = async query => {
      const full = await c.observe(query);
      // Before update, compare all existing C04/v74 guards; after update compare complete preserved image.
      if (full.worker.policyRowSha256 === plan.before.policyRowSha256) assertFull(c,full);
      const p = preservedFingerprintObservation(full);
      check(isDeepStrictEqual(p,plan.beforePreserved),'prepared-protected-preimage');
      lease.verify(); check(isDeepStrictEqual(live(root).service,plan.service),'same-worker-process');
      return p;
    };
    const result = await transitionFingerprintPolicy({session,expected:plan.before,observePreserved,
      publish:async(phase,value)=>createPrivate(join(attempt,`${phase}.json`),bytes(value))});
    const receipt = {...result,schema:FINGERPRINT_RECOVERY_SCHEMA,status:'committed',planSha256,
      predecessorSha256:V74_ACTIVATION_SHA256,origin:plan.origin};
    createPrivate(join(OP,'apply-receipt.json'),bytes(receipt));
    createPrivate(join(OP,'authority.json'),bytes({schema:'homecook.youtube-fingerprint-recovery-authority.v1',planSha256,
      receiptName:'apply-receipt.json',receiptSha256:hash(readFileSync(join(OP,'apply-receipt.json')))}));
    return {status:'db-committed-web-and-login-http-pending',readOnly:false,workerChanged:false,modelCalls:0};
  } finally {session?.stop();await lease?.release();lock.release();}
}

export async function reconcileFingerprintRecovery({root}) {
  const lock = acquirePrelaunchDeployLock();let session;
  try {
    const c = await context(root,{includeRecovery:false});
    const plan = JSON.parse(c.read(join(OP,'plan.json'))),attempt=fingerprintRecoveryAttemptDirectory();
    check(attempt,'attempt-required');
    const compensating=existsSync(join(OP,'compensate-intent.json'))&&!existsSync(join(OP,'compensate-receipt.json'))&&!existsSync(join(OP,'compensate-not-applied.json'));
    const expected=compensating?JSON.parse(c.read(join(OP,'apply-receipt.json'))).after:plan.before;
    const dispatchPath=compensating?join(OP,'compensate-commit-dispatch.json'):join(attempt,'commit-dispatch.json');
    const dispatch=existsSync(dispatchPath)?JSON.parse(c.read(dispatchPath)):null;
    session=openDedicatedAdminSession(c.target.postgresContainerId,'youtube-resolution-fingerprint-v2-reconcile');
    await session.query(FINGERPRINT_RECOVERY_BEGIN_SQL);await session.query(FINGERPRINT_RECOVERY_TABLE_LOCK_SQL);
    const observed=await state(c,session.query);
    const outcome=classifyFingerprintReconciliation({expected,dispatch,observed});
    await session.query('ROLLBACK;');
    return {outcome,direction:compensating?'compensate':'apply',readOnly:true,automaticRetry:false,automaticCompensation:false};
  } finally {session?.stop();lock.release();}
}

// Repair only local evidence after an uncertain commit. Never dispatches another DB update.
export async function recoverFingerprintReceipt({root,planPath,planSha256,confirmation,compensation=false}) {
  const {plan}=approvedPlan(root,planPath,planSha256,confirmation);
  check(readFingerprintPlanApproval()===planSha256,'independent-plan-approval');
  const lock=acquirePrelaunchDeployLock();let session,lease;
  try {
    lease=await acquireClosedR2ControlLease(loadClosedR2Review(root),root);
    const c=await context(root,{includeRecovery:false}),current=live(root),attempt=fingerprintRecoveryAttemptDirectory();
    check(attempt && isDeepStrictEqual(current.web,plan.web) && isDeepStrictEqual(current.service,plan.service),'recovery-live-drift');
    const apply=compensation?JSON.parse(c.read(join(OP,'apply-receipt.json'))):null;
    const expected=apply?apply.after:plan.before;
    const dispatchPath=compensation?join(OP,'compensate-commit-dispatch.json'):join(attempt,'commit-dispatch.json');
    const dispatch=existsSync(dispatchPath)?JSON.parse(c.read(dispatchPath)):null;
    session=openDedicatedAdminSession(c.target.postgresContainerId,'youtube-resolution-fingerprint-v2-evidence-recovery');
    await session.query(FINGERPRINT_RECOVERY_BEGIN_SQL);await session.query(FINGERPRINT_RECOVERY_TABLE_LOCK_SQL);
    const observed=await state(c,session.query),outcome=classifyFingerprintReconciliation({expected,dispatch,observed});
    check(['not-applied','committed','committed-with-new-work'].includes(outcome),'unknown-or-v2-history-forward-fix-only');
    const preserved=preservedFingerprintObservation(await c.observe(session.query));
    if(outcome!=='committed-with-new-work')check(isDeepStrictEqual(preserved,plan.beforePreserved),'recovery-preservation-drift');
    lease.verify();
    if(outcome==='not-applied') {
      publishIfExact(root,compensation?join(OP,'compensate-not-applied.json'):join(attempt,'not-applied.json'),{planSha256,outcome,observed});
    } else {
      const receipt={...dispatch,schema:FINGERPRINT_RECOVERY_SCHEMA,status:'committed',planSha256,
        predecessorSha256:apply?hash(c.read(join(OP,'apply-receipt.json'))):V74_ACTIVATION_SHA256,origin:plan.origin};
      check((outcome==='committed-with-new-work'||isDeepStrictEqual(observed,dispatch.after)) && isDeepStrictEqual(dispatch.before,expected)
        && isDeepStrictEqual(dispatch.beforePreserved,plan.beforePreserved),'recovery-exact-dispatch');
      assertFingerprintReceipt(receipt,{predecessorSha256:receipt.predecessorSha256,origin:plan.origin,worker:c.activeWorker});
      const recovery={plan,receipt:apply??receipt,authority:{planSha256,receiptSha256:hash(bytes(apply??receipt))},
        ...(apply?{compensation:receipt}:{})};
      assertCookedWeightAttestationCurrentObservation(c.successor,await c.observe(session.query),{quantityWriterState:'on',
        approvedWorkerPolicy:c.continuation.observation,approvedWorkerSuccessor:{proof:c.proof,origin:c.origin,fingerprintRecovery:recovery},databaseMaintenance:c.maintenance});
      publishIfExact(root,compensation?join(OP,'compensate-committed.json'):join(attempt,'committed.json'),dispatch);
      publishIfExact(root,join(OP,compensation?'compensate-receipt.json':'apply-receipt.json'),receipt);
      if(!compensation)publishIfExact(root,join(OP,'authority.json'),{schema:'homecook.youtube-fingerprint-recovery-authority.v1',planSha256,
        receiptName:'apply-receipt.json',receiptSha256:hash(c.read(join(OP,'apply-receipt.json')))});
    }
    await session.query('ROLLBACK;');
    return {outcome,evidenceRecovered:true,databaseWrites:0,secretChanges:0,webRestarted:false};
  } finally {session?.stop();await lease?.release();lock.release();}
}

export async function compensateFingerprintRecovery({root,planPath,planSha256,confirmation}) {
  const {plan}=approvedPlan(root,planPath,planSha256,confirmation);
  check(readFingerprintPlanApproval()===planSha256,'independent-plan-approval');
  const lock=acquirePrelaunchDeployLock();let lease,session;
  try {
    lease=await acquireClosedR2ControlLease(loadClosedR2Review(root),root);
    const c=await context(root),current=live(root);
    check(c.recovery && !c.recovery.compensation && isDeepStrictEqual(current.web,plan.web)
      && isDeepStrictEqual(current.service,plan.service), 'compensation-only-before-web-switch');
    const expected=c.recovery.receipt.after;
    session=openDedicatedAdminSession(c.target.postgresContainerId,'youtube-resolution-fingerprint-v2-compensate');
    const result=await transitionFingerprintPolicy({session,expected,direction:'compensate',
      observePreserved:async query=>{const full=await c.observe(query);const p=preservedFingerprintObservation(full);
        check(isDeepStrictEqual(p,plan.beforePreserved),'compensation-protected-drift');lease.verify();return p;},
      publish:async(phase,value)=>createPrivate(join(OP,`compensate-${phase}.json`),bytes(value))});
    createPrivate(join(OP,'compensate-receipt.json'),bytes({...result,schema:FINGERPRINT_RECOVERY_SCHEMA,status:'committed',planSha256,
      predecessorSha256:c.recovery.authority.receiptSha256,origin:plan.origin}));
    return {status:'compensated-to-original-unavailable-v1',keyPreserved:true,workerChanged:false};
  } finally {session?.stop();await lease?.release();lock.release();}
}
