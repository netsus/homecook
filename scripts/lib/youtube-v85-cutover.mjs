import { createHash,createPublicKey,verify } from 'node:crypto';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import reviewed from '../manifests/youtube-v85-reviewed-source.json' with { type:'json' };
import { buildYoutubeExtractionWorkerPolicySnapshotDigest } from './youtube-extraction-worker-artifact.mjs';
import { assertV71ManagerClaims } from './youtube-v71-controlled-cutover.mjs';
import { V74_ACTIVATION_SHA256 } from './prelaunch-youtube-v74-cutover.mjs';
import { readV85Approval } from './youtube-v85-approval.mjs';
import { preserveRound2RotationState } from './round2-eight-key-rotation-fence.mjs';
export const V85=Object.freeze({from:'06a3369f5c5e1c3ca49045f370f0ce12f049c805',releaseSha:'1be5eeea5dd946d8a54edf6c5fd0c3c28d1815fa',
  predecessorReleaseSha:'3e58467499c63ba20c3b3191d9dd7dec77a7aa44',predecessorPipelineIdentity:'0d81a76c8df4b3f0c8ec05f1a0ad9aeab5477b9cb7fa4b64e299ce83452b7583',
  predecessorSnapshotDigest:'6ad984e1ff856c009698bb15d1c2afb72116264b29120390204cc6af32aef121',
  pipelineIdentity:'6dd494410f160937b550bc23fb355d6669b3abe7805c00eabd40fed1e799c618',snapshotDigest:'9307203ad29f0048655a62e6d2f430ef977dad75405ce606fbf68319a7a36d51',
  artifactSha256:'1a477eea93cccde17e1afc7a2a371195e8dc4ab1c5bf82eed9306766eee13d3e',
  descriptorSha256:'df9f89d3fa1f415d7266cb86a3fec09502e03b466f29b5d2d695209324579457',
  expiresAt:'2026-10-22T14:27:30.000Z',schemaIdentity:'youtube-extraction-worker-schema-v2',
  catalogSha256:'de001df9981d361130136e2dff184665ec5280e82a857aa4e0e6cd593848af05'});
export const V85_OPERATION_DIRECTORY=join(homedir(),'.homecook/operations/youtube-v85-gen50-20261017');
export const v85Hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const SHA=/^[a-f0-9]{64}$/u,REF=/^[a-f0-9]{40}$/u;
export const v85Check=(ok,reason)=>{if(!ok)throw new Error(`v85: ${reason}`);};
const check=v85Check;
const fields=['credentialGeneration','credentialRowSha256','policyRowSha256','policyStableSha256','schemaIdentity','snapshotDigest','workerPolicyEnabled','workerReleaseSha'];
export const v85Zero=w=>w.queued===0&&w.processing===0&&w.permitHeld===false&&w.activeEnqueueSessions===0;
export function v85Paths(home=homedir()) {
  const secrets=join(home,'.homecook/youtube-extraction'),artifact=join(home,'.homecook/youtube-extraction-releases/1be5eeea5dd9-v85');
  return {secrets,artifact,manifest:join(artifact,'artifact.json'),schema:join(artifact,'scripts/manifests/youtube-extraction-expected-schema.json'),
    descriptor:join(secrets,'app-descriptor-v85-gen50.json'),config:join(secrets,'worker-v85-gen50.env'),policy:join(secrets,'current-policy-v85-gen50.json'),
    credential:join(secrets,'worker-credential-v85-gen50.json'),token:join(secrets,'worker-v85-gen50.jwt')};
}
export function v85MetadataPatch(home=homedir()) {
  const p=v85Paths(home);return {HOMECOOK_YOUTUBE_EXTRACTION_APP_DESCRIPTOR_PATH:p.descriptor,HOMECOOK_YOUTUBE_EXTRACTION_EXPECTED_SCHEMA_PATH:p.schema,HOMECOOK_YOUTUBE_EXTRACTION_WORKER_MANIFEST_PATH:p.manifest};
}
const support=new Set(['scripts/run-youtube-v85-postgres.mjs','scripts/youtube-v85-controlled-cutover.mjs','scripts/lib/youtube-v85-cutover.mjs','scripts/lib/youtube-v85-approval.mjs',
  'scripts/manifests/youtube-v85-reviewed-source.json','tests/prelaunch-cooked-weight-attestation-successor.test.ts','tests/prelaunch-closed-r2-maintenance.test.ts','tests/prelaunch-quantity-public-read-continuation.test.ts','scripts/deploy-prelaunch-web.mjs','scripts/lib/prelaunch-web-deploy.mjs','scripts/lib/prelaunch-database.mjs']);
const continuationSupport = new Set([...support, 'package.json',
  'scripts/lib/prelaunch-v85-web-recovery.mjs', 'scripts/lib/prelaunch-v85-web-recovery-observation.mjs', 'scripts/lib/prelaunch-v85-recovered-readiness.mjs',
  'scripts/lib/round2-eight-key-rotation-fence.mjs', 'scripts/lib/round2-rotation-fixture-guards.mjs',
  'scripts/round2-eight-key-user-stage.py', 'scripts/round2-eight-key-user-apply.py',
  'tests/round2-eight-key-rotation-fence.test.mjs', 'tests/round2-rotation-fixture-guards.test.mjs',
  'tests/round2-eight-key-user-stage.test.py', 'tests/round2-eight-key-user-apply.test.py',
  'tests/prelaunch-v85-web-recovery.test.ts', 'tests/youtube-v85-cutover.test.ts', 'tests/youtube-v85-approval.test.ts',
  'tests/youtube-v85-readonly-adapter.test.ts', 'tests/fixtures/youtube-v85-cutover.fixture.ts',
  'docs/engineering/round2-eight-key-rotation-fixture-preparation-20261017.md',
  'docs/engineering/youtube-v85-continuation-20261017.md', 'docs/engineering/youtube-v85-controlled-cutover-20261017.md',
  'docs/engineering/youtube-v85-web-only-recovery-20261017.md', 'docs/sync/CURRENT_SOURCE_OF_TRUTH.md']);
export function assertV85PackageContinuation(before,next) {
  const expected=structuredClone(before);
  for(const [name,value] of Object.entries({
    'deploy:dev:recover-v85-web':'node scripts/deploy-prelaunch-web.mjs recover-v85-web',
    'deploy:dev:plan-v85-web-recovery':'node scripts/deploy-prelaunch-web.mjs plan-v85-web-recovery',
    'deploy:dev:plan-round2-eight-keys':'node scripts/deploy-prelaunch-web.mjs plan-round2-eight-keys',
    'deploy:dev:apply-round2-eight-keys':'node scripts/deploy-prelaunch-web.mjs apply-round2-eight-keys',
  })){
    check(before.scripts?.[name]===undefined||before.scripts[name]===value,'original package alias');
    expected.scripts[name]=value;
  }
  check(same(expected,next),'package continuation may add only the four reviewed recovery/rotation aliases');
}
/** @typedef {{plan:{webRef:string,sources:Record<string,(string|null)[]>},from:string,to:string,digests:Record<string,(string|null)[]>}} V85Source */
/** @param {V85Source} input */
export function assertV85Source({plan,from,to,digests}) {
  if (plan.schema === 'homecook.youtube-v85-continuation-plan.v1') {
    const original = plan.originalPlan;
    assertV85Source({ plan: original, from, to: original.webRef, digests: original.sources });
    check(from === V85.from && to === plan.webRef && same(plan.sources, digests), 'continuation exact source');
    const delta = {};
    for (const file of new Set([...Object.keys(original.sources), ...Object.keys(digests)])) {
      const prior = original.sources[file] ?? [digests[file]?.[0] ?? null, digests[file]?.[0] ?? null];
      const next = digests[file] ?? [prior[0], prior[0]];
      check(Array.isArray(next) && next.length === 2 && next.every(v => v === null || SHA.test(v))
        && next[0] === prior[0], 'continuation original source preimage');
      if (next[1] !== prior[1]) {
        check(continuationSupport.has(file), 'continuation changes evaluated or unrelated source');
        delta[file] = [prior[1], next[1]];
      }
    }
    check(same(delta, plan.continuation.sourceDelta), 'continuation complete exact tooling delta');
    if(delta['package.json']){
      const evidence=plan.continuation.packageEvidence,pair=delta['package.json'];
      check(typeof evidence?.before==='string'&&typeof evidence.after==='string'
        &&evidence.before.length<100000&&evidence.after.length<100000
        &&v85Hash(evidence.before)===pair[0]&&v85Hash(evidence.after)===pair[1],'exact public package bytes evidence');
      assertV85PackageContinuation(JSON.parse(evidence.before),JSON.parse(evidence.after));
    }else check(plan.continuation.packageEvidence===undefined,'unexpected package evidence');
    return new Set(Object.keys(digests).filter(p => p.startsWith('scripts/')));
  }
  check(from===V85.from&&to===plan.webRef&&REF.test(to)&&same(plan.sources,digests),'complete reviewed source');
  for(const [file,pair] of Object.entries(digests)) {
    check(Array.isArray(pair)&&pair.length===2&&pair.every(v=>v===null||SHA.test(v)),'source pair');
    if(support.has(file)||/^tests\/youtube-v85[-a-z0-9.]*\.(?:ts|mjs)$/u.test(file)||file==='docs/sync/CURRENT_SOURCE_OF_TRUTH.md'||/^docs\/engineering\/youtube-v85[-a-z0-9]*\.md$/u.test(file))continue;
    check(Object.hasOwn(reviewed,file)&&same(pair,reviewed[file]),'unreviewed file/bytes');
  }
  for(const [file,pair] of Object.entries(reviewed))if(!file.startsWith('docs/'))check(same(digests[file],pair),'omitted evaluated source');
  return new Set(Object.keys(digests).filter(p=>p.startsWith('scripts/')));
}
function assertPolicyViews(o) {
  const p=o.full.fingerprintPolicy;
  check(same(o.full.worker,o.worker)&&p.enabled===o.policy.enabled&&p.policy_version===o.policy.version&&p.pipeline_identity===o.policy.pipelineIdentity
    &&p.extractor_mode===o.policy.extractorMode&&same(p.result_affecting_options,o.policy.resultAffectingOptions)&&p.fingerprint_key_version===o.policy.fingerprintKeyVersion
    &&p.previous_fingerprint_key_version===o.policy.previousFingerprintKeyVersion&&p.previous_fingerprint_valid_until===o.policy.previousFingerprintValidUntil,'consistent observer views');
}
export function assertV85Plan(plan,now=new Date()) {
  check(plan?.schema==='homecook.youtube-v85-plan.v1'&&REF.test(plan.webRef)&&plan.releaseSha===V85.releaseSha,'plan identity');
  check(plan.artifactSha256===V85.artifactSha256&&plan.descriptorSha256===V85.descriptorSha256&&plan.expiresAt===V85.expiresAt,'sealed artifact/expiry');
  check(plan.before?.worker.credentialGeneration===49&&plan.before.worker.workerReleaseSha===V85.predecessorReleaseSha&&plan.before.worker.snapshotDigest===V85.predecessorSnapshotDigest,'original49');
  check(Date.parse(plan.before.credential.expiresAt)===Date.parse(V85.expiresAt)&&Date.parse(V85.expiresAt)>now.getTime(),'no expiry extension');
  check(plan.before.full.ledger.length===232&&plan.before.jobCount===42&&v85Zero(plan.before.worker)&&plan.before.policy.enabled===true&&plan.before.worker.workerPolicyEnabled===true&&plan.before.worker.credentialActive===true,'DB232/42/drained/on predecessor');
  assertPolicyViews(plan.before);check(SHA.test(plan.beforeService?.plistSha256)&&SHA.test(plan.beforeService.configSha256)&&plan.beforeService.pid>0,'actual predecessor service');
  check(plan.before.policy.pipelineIdentity===V85.predecessorPipelineIdentity&&plan.before.policy.version===3&&plan.before.policy.fingerprintKeyVersion==='2'
    &&plan.before.policy.previousFingerprintKeyVersion===null&&plan.before.policy.previousFingerprintValidUntil===null,'V2 immutable predecessor policy');
  check(buildYoutubeExtractionWorkerPolicySnapshotDigest({policyVersion:3,extractorMode:plan.before.policy.extractorMode,pipelineIdentity:V85.pipelineIdentity,resultAffectingOptions:plan.before.policy.resultAffectingOptions})===V85.snapshotDigest,'new snapshot');
  check(SHA.test(plan.origin?.v74ActivationSha256)&&SHA.test(plan.origin?.fingerprintReceiptSha256)&&SHA.test(plan.origin?.fingerprintAuthority?.sha256),'original authority');
  assertV85Source({plan,from:V85.from,to:plan.webRef,digests:plan.sources});return plan;
}
export function v85ContinuationDataDeltas(original, current) {
  return ['normalDataSha256', 'preservedRowsSha256'].map(key => ({ path: 'before.full.' + key,
    before: original.before.full[key], after: current.full[key] })).concat([
    { path: 'before.jobsSha256', before: original.before.jobsSha256, after: current.jobsSha256 },
    { path: 'before.jobCount', before: original.before.jobCount, after: current.jobCount },
  ]);
}
// Two authorities: the immutable original plan remains independently valid. Only this
// incident's exact prior-data differences can be adopted after a distinct human approval.
export function assertV85ExecutionPlan(plan, now = new Date()) {
  if (plan?.schema !== 'homecook.youtube-v85-continuation-plan.v1') return assertV85Plan(plan, now);
  const original = assertV85Plan(plan.originalPlan, now), c = plan.continuation;
  check(c?.schema === 'homecook.youtube-v85-continuation.v1' && SHA.test(c.originalPlanSha256)
    && c.originalCanonicalSha256 === v85Hash(JSON.stringify(original)), 'immutable original continuation authority');
  check(REF.test(plan.webRef) && plan.webRef !== original.webRef
    && ['releaseSha', 'artifactSha256', 'descriptorSha256', 'expiresAt'].every(k => plan[k] === original[k])
    && same(plan.origin, original.origin) && same(plan.beforeService, original.beforeService), 'continuation fixed artifact/expiry/authorities');
  const a = { ...original.before.full }, b = { ...plan.before.full };
  for (const key of ['normalDataSha256', 'preservedRowsSha256']) { delete a[key]; delete b[key]; }
  check(same(a, b) && same(plan.before.worker, original.before.worker) && same(plan.before.policy, original.before.policy)
    && same(plan.before.credential, original.before.credential), 'continuation non-data protection changed');
  for (const key of ['targetSha256', 'controlsSha256', 'catalogSha256', 'immutableSha256', 'authoritySha256']) {
    check(plan.before[key] === original.before[key], 'continuation original protection hash');
  }
  check(plan.before.jobCount === 43 && original.before.jobCount === 42
    && plan.before.originalJobsSha256 === original.before.jobsSha256
    && plan.before.approvedJobsSha256 === plan.before.jobsSha256
    && plan.before.normalDataSha256 === plan.before.full.normalDataSha256
    && [plan.before.normalDataSha256, plan.before.full.preservedRowsSha256, plan.before.jobsSha256].every(v => SHA.test(v)), 'continuation original42 and exact43 preimage');
  check(c.requiresExplicitUnattributedDataAcknowledgement === true && c.rawBeforeImagesAvailable === false
    && c.classification === 'unattributed-prior-auth-normal-and-extra-job'
    && same(c.dataDeltas, v85ContinuationDataDeltas(original, plan.before)), 'continuation explicit unattributed prior data');
  const marker = preserveRound2RotationState({ round2EightKeyRotation: plan.round2Binding?.marker }, {}).round2EightKeyRotation;
  check(marker && plan.round2Binding.fenceSha256 === marker.fenceSha256 && SHA.test(plan.round2Binding.controlSha256), 'continuation Round2 fence binding');
  assertPolicyViews(plan.before);
  check(plan.before.worker.credentialActive === true && plan.before.policy.enabled === true && v85Zero(plan.before.worker), 'continuation active idle49');
  assertV85Source({ plan, from: V85.from, to: plan.webRef, digests: plan.sources });
  return plan;
}
export function assertV85MetadataHandoff({plan,options,liveRef,patch,previous,next,home=homedir(),now=new Date()}) {
  assertV85ExecutionPlan(plan,now);
  check(options.refOption==='--reviewed-ref'&&options.ref===plan.webRef&&liveRef===V85.from&&options.alreadyAppliedDb===true&&options.dbConfig&&options.envFile
    &&!options.dbBaseline&&!options.dbCompatible&&!options.skipAutomatedTests&&!options.verifyScript&&!Object.entries(options).some(([k,v])=>k.startsWith('reviewed')&&v)
    &&same(patch,v85MetadataPatch(home)),'exact three-path web handoff');
  if(previous&&next)check(same({...previous,WorkingDirectory:next.WorkingDirectory,ProgramArguments:[previous.ProgramArguments[0],join(next.WorkingDirectory,'scripts/start-production.mjs'),...previous.ProgramArguments.slice(2)],
    EnvironmentVariables:{...previous.EnvironmentVariables,...patch}},next),'unrelated launcher/env change');
  return {...options,envFile:undefined};
}
export function assertV85Preserved(before,after) {
  for(const key of ['targetSha256','normalDataSha256','controlsSha256','catalogSha256','immutableSha256','authoritySha256','jobsSha256'])check(SHA.test(before[key])&&before[key]===after[key],`preserved ${key}`);
  check(before.jobCount===after.jobCount,'job count');
  if (before.originalJobsSha256 !== undefined) check(before.originalJobsSha256 === after.originalJobsSha256, 'original42 whole rows');
  if (before.approvedJobsSha256 !== undefined) check(before.approvedJobsSha256 === after.approvedJobsSha256, 'approved43 whole rows');
  const fullBefore={...before.full},fullAfter={...after.full};delete fullBefore.worker;delete fullBefore.fingerprintPolicy;delete fullAfter.worker;delete fullAfter.fingerprintPolicy;check(same(fullBefore,fullAfter),'complete protected projection');
  check(same({...before.policy,pipelineIdentity:after.policy.pipelineIdentity,enabled:after.policy.enabled},after.policy),'complete policy fields');
  check(same({...before.full.fingerprintPolicy,pipeline_identity:after.full.fingerprintPolicy.pipeline_identity,enabled:after.full.fingerprintPolicy.enabled,updated_at:after.full.fingerprintPolicy.updated_at},after.full.fingerprintPolicy),'full fingerprint policy');
}
export function assertV85WorkerCredential({claims,metadata,now=new Date()}) {
  const expected={role:'youtube_extraction_worker',scope:'youtube-extraction-worker',iss:'https://worker.mumeok.kr',aud:'youtube-extraction',generation:50,release_sha:V85.releaseSha,schema_identity:V85.schemaIdentity,allowed_snapshot_digest:V85.snapshotDigest};
  for(const [key,value]of Object.entries(expected))check(claims?.[key]===value,`claim ${key}`);
  check(SHA.test(claims.jti_hash)&&Number.isSafeInteger(claims.iat)&&claims.iat*1000<=now.getTime()+30000&&claims.iat*1000<=Date.parse(V85.expiresAt)
    &&claims.exp===Date.parse(V85.expiresAt)/1000&&claims.exp*1000>now.getTime()&&claims.exp>claims.iat&&claims.exp-claims.iat<=7*86400,'bounded worker expiry/JTI');
  check(metadata?.generation===50&&metadata.release_sha===V85.releaseSha&&metadata.schema_identity===V85.schemaIdentity&&metadata.allowed_snapshot_digest===V85.snapshotDigest
    &&metadata.jti_sha256===claims.jti_hash&&Date.parse(metadata.expires_at)===claims.exp*1000,'exact metadata');return metadata;
}
// Readback only: verify an already-created token using the existing public key; never sign/mint here.
export function verifyV85IssuedToken({token,jwtKeys,metadata,now=new Date()}) {
  check(typeof token==='string'&&token.length<65536&&/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token),'bounded existing token');
  const parts=token.split('.'),header=JSON.parse(Buffer.from(parts[0],'base64url').toString()),claims=JSON.parse(Buffer.from(parts[1],'base64url').toString());
  check(header.alg==='ES256'&&header.typ==='JWT'&&typeof header.kid==='string'&&Array.isArray(jwtKeys),'existing token header');
  const keys=jwtKeys.filter(k=>k?.kid===header.kid&&k.alg==='ES256'&&k.kty==='EC'&&k.crv==='P-256');check(keys.length===1,'unique existing public key');
  const k=keys[0],key=createPublicKey({format:'jwk',key:{kty:k.kty,crv:k.crv,x:k.x,y:k.y}});
  check(verify('SHA256',Buffer.from(parts[0]+'.'+parts[1]),{key,dsaEncoding:'ieee-p1363'},Buffer.from(parts[2],'base64url')),'existing token signature');
  assertV85WorkerCredential({claims,metadata,now});return claims;
}
export function assertV85After(plan,o,metadata,enabled) {
  assertV85Preserved(plan.before,o);assertPolicyViews(o);
  check(o.full.ledger.length===232&&o.worker.credentialGeneration===50&&o.worker.workerReleaseSha===V85.releaseSha&&o.worker.schemaIdentity===V85.schemaIdentity&&o.worker.snapshotDigest===V85.snapshotDigest
    &&o.worker.workerPolicyEnabled===enabled&&o.worker.catalogFingerprint===V85.catalogSha256&&o.worker.credentialActive===true&&v85Zero(o.worker)&&o.policy.enabled===enabled&&o.policy.pipelineIdentity===V85.pipelineIdentity,'fixed50 poststate');
  check(o.credential.generation===50&&o.credential.jtiSha256===metadata.jti_sha256&&Date.parse(o.credential.expiresAt)===Date.parse(V85.expiresAt)
    &&o.credential.releaseSha===V85.releaseSha&&o.credential.schemaIdentity===V85.schemaIdentity&&o.credential.snapshotDigest===V85.snapshotDigest,'registered exact50');
}
// Initial activation remains a strict full-data comparison. Once operating, new app
// records are expected; readback verifies owned runtime, immutable guards and all
// pre-transition jobs instead of pretending user data must stay frozen forever.
export function assertV85ActivatedRuntime(plan,proof,o,metadata,now=new Date()) {
  assertV85ExecutionPlan(plan,now);assertV85After(plan,proof.after,metadata,true);assertPolicyViews(o);
  const historical=plan.schema==='homecook.youtube-v85-continuation-plan.v1'?o.approvedJobsSha256:o.originalJobsSha256;
  check(historical===plan.before.jobsSha256&&o.jobCount>=plan.before.jobCount,'activated historical jobs preserved');
  const before={...proof.after.full},after={...o.full};
  for(const key of ['worker','fingerprintPolicy','normalDataSha256','preservedRowsSha256','attestationRowsSha256','attestationRowsEmpty','metadataNull','receiptColumnInitiallyNull']){delete before[key];delete after[key];}
  check(same(before,after)&&same(o.credential,proof.after.credential)&&same(o.policy,proof.after.policy)
    &&same(o.full.fingerprintPolicy,proof.after.full.fingerprintPolicy),'activated immutable controls/credential/policy');
  for(const key of [...fields,'catalogFingerprint'])check(o.worker[key]===proof.after.worker[key],'activated worker identity');
  check(o.worker.credentialActive===true&&Number.isInteger(o.worker.queued)&&o.worker.queued>=0
    &&Number.isInteger(o.worker.processing)&&o.worker.processing>=0,'activated worker active/queue');
  return {historicalJobsPreserved:true,postActivationJobs:o.jobCount-plan.before.jobCount};
}
// Failure containment may close only this exact registered identity, even if ordinary rows drifted.
export function ownsV85Registration(plan,o,metadata) {
  const c=o.credential;
  return o.worker.credentialGeneration===50&&c.generation===50&&c.jtiSha256===metadata.jti_sha256&&c.releaseSha===V85.releaseSha&&c.schemaIdentity===V85.schemaIdentity
    &&c.snapshotDigest===V85.snapshotDigest&&Date.parse(c.expiresAt)===Date.parse(V85.expiresAt)&&o.policy.pipelineIdentity===V85.pipelineIdentity
    &&same({...plan.before.policy,pipelineIdentity:V85.pipelineIdentity,enabled:o.policy.enabled},o.policy)
    &&same({...plan.before.full.fingerprintPolicy,pipeline_identity:V85.pipelineIdentity,enabled:o.full.fingerprintPolicy.enabled,updated_at:o.full.fingerprintPolicy.updated_at},o.full.fingerprintPolicy);
}
export function classifyV85Registration({plan,intent,metadata,observed,now=new Date()}) {
  try {
    assertV85ExecutionPlan(plan,now);check(intent.planSha256&&intent.metadataSha256&&same(intent.before.full.ledger,plan.before.full.ledger),'registration intent');
    assertV85Preserved(plan.before,observed);check(v85Zero(observed.worker),'drained');
    if(observed.worker.credentialGeneration===50){assertV85After(plan,observed,metadata,observed.policy.enabled);return {state:'registered',mayRegister:false,mayIssue:false,forwardOnly:true};}
    check(observed.worker.credentialGeneration===49&&same(observed.credential,intent.before.credential)&&same(observed.policy,intent.before.policy)
      &&observed.worker.credentialRowSha256===intent.before.worker.credentialRowSha256&&observed.worker.policyRowSha256===intent.before.worker.policyRowSha256,'exact49 transaction not applied');
    return {state:'not-applied',mayRegister:true,mayIssue:false,forwardOnly:true};
  }catch{return {state:'unknown',mayRegister:false,mayIssue:false,forwardOnly:true};}
}
export function assertV85Successor({authority,worker,policy,origin,recovery,now=new Date()}) {
  const {plan,proof}=authority;assertV85ExecutionPlan(plan,now);
  check(same(plan.origin.authority,origin)&&plan.origin.v74ActivationSha256===V74_ACTIVATION_SHA256&&same(plan.origin.fingerprintAuthority,recovery.pointer)
    &&plan.origin.fingerprintReceiptSha256===recovery.authority.receiptSha256,'original C04/v74/V2 lineage');
  for(const key of fields)check(plan.before.worker[key]===worker[key],`original49 ${key}`);
  check(same(plan.before.full.fingerprintPolicy,policy),'original V2 full policy');
  check(proof?.schema==='homecook.youtube-v85-activation.v1'&&proof.planSha256===authority.planSha256&&same(proof.before,plan.before),'approved proof preimage');
  assertV85After(plan,proof.after,proof.metadata,true);
  check(SHA.test(proof.registrationSha256)&&SHA.test(proof.verificationSha256)&&proof.web.releaseSha===plan.webRef&&SHA.test(proof.web.plistSha256)
    &&proof.health.authenticatedStatus===200&&proof.health.emptyClaimDenied===true&&proof.health.ready===true&&proof.health.pid>0&&proof.health.pid===proof.health.secondPid&&SHA.test(proof.service.plistSha256),'actual activation');
  return proof.after.worker;
}
export function readV85ExecutionApproval(read,readApproval=readV85Approval,directory=V85_OPERATION_DIRECTORY,now=new Date()) {
  const planPath=join(directory,'plan.json');if(!existsSync(planPath))return null;
  const originalBytes=read(planPath),originalSha256=v85Hash(originalBytes);check(readApproval()===originalSha256,'independent original approved plan');
  const original=assertV85Plan(JSON.parse(originalBytes),now),continuationPath=join(directory,'continuation-plan.json');
  if(!existsSync(continuationPath))return {plan:original,planSha256:originalSha256};
  const bytes=read(continuationPath),planSha256=v85Hash(bytes),plan=assertV85ExecutionPlan(JSON.parse(bytes),now);
  check(readApproval('approved-continuation-sha256')===planSha256 && plan.continuation.originalPlanSha256===originalSha256
    && same(plan.originalPlan,original),'independent continuation and original authorities');
  return {plan,planSha256};
}
export function readV85Authority(read,readApproval=readV85Approval,directory=V85_OPERATION_DIRECTORY,now=new Date()) {
  const authority=readV85ExecutionApproval(read,readApproval,directory,now);if(!authority)return null;
  const {plan,planSha256}=authority;
  const path=join(directory,'activation.json');
  if(!existsSync(path)){check(!existsSync(join(directory,'registration-intent.json')),'pending50 reconcile before unrelated deploy');return {plan,planSha256,proof:null};}
  const proofBytes=read(path);check(readApproval('activation-sha256')===v85Hash(proofBytes),'independent activation seal');
  return {plan,planSha256,proof:JSON.parse(proofBytes)};
}
const literal=value=>`'${String(value).replaceAll("'","''")}'`;
export function buildV85RegistrationSql({claims,metadata,managerClaims,now=new Date()}) {
  assertV85WorkerCredential({claims,metadata,now});assertV71ManagerClaims(managerClaims,now);check(managerClaims.iat*1000<=now.getTime()+30000,'future manager');
  return `UPDATE private.youtube_extraction_current_policy SET pipeline_identity=${literal(V85.pipelineIdentity)},updated_at=clock_timestamp() WHERE policy_key='primary' AND enabled=false AND pipeline_identity=${literal(V85.predecessorPipelineIdentity)};
SET LOCAL request.jwt.claims=${literal(JSON.stringify(managerClaims))}; SET LOCAL ROLE youtube_extraction_credential_manager;
SELECT public.rotate_youtube_extraction_worker_credential(49,50,${literal(metadata.jti_sha256)},${literal(metadata.expires_at)}::timestamptz,${literal(V85.releaseSha)},${literal(V85.schemaIdentity)},${literal(V85.snapshotDigest)})::text; RESET ROLE;`;
}
export const V85_BEGIN_SQL=`BEGIN ISOLATION LEVEL READ COMMITTED; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='45s'; SET LOCAL idle_in_transaction_session_timeout='60s'; SELECT pg_advisory_xact_lock(86120317);`;
// A separate statement after the advisory wait sees the winner's committed rows.
export const V85_LOCK_SQL=`LOCK TABLE private.youtube_extraction_current_policy,private.youtube_extraction_worker_credentials,public.youtube_extraction_jobs,public.youtube_extractor_permits IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE private.recipe_product_only_write_control,private.cooked_batch_weight_evidence_control,private.quantity_input_v4_policy,private.cooked_weight_user_attestation_control IN SHARE MODE;`;
