import { describe, expect, it } from 'vitest';
import { assertV74MetadataHandoff, v74MetadataPatch, V74_RELEASE, V74_WEB_PREDECESSOR } from '../scripts/lib/prelaunch-youtube-v74-cutover.mjs';
import { assertClosedR2ContinuationOptions, retargetPlist } from '../scripts/lib/prelaunch-web-deploy.mjs';
const options = { refOption: '--reviewed-ref', ref: V74_RELEASE, alreadyAppliedDb: true, dbConfig: '/private/config.env', envFile: '/private/v74.env' };
const previous = { Label: 'com.homecook.production', WorkingDirectory: '/old', ProgramArguments: ['/node', '/old/scripts/start-production.mjs', '-H', '127.0.0.1', '-p', '3100'], EnvironmentVariables: { MUMEOK_ROUND2_ACTIVE: 'false', SECRET: 'unchanged' } };
const patch = v74MetadataPatch('/Users/cwj');
const next = retargetPlist({ ...previous, EnvironmentVariables: { ...previous.EnvironmentVariables, ...patch } }, '/new');
const input = () => structuredClone({ options, liveRef: V74_WEB_PREDECESSOR, patch, previous, next, home: '/Users/cwj' });
describe('v74 web metadata handoff', () => {
  it('passes only the exact handoff into the existing closed DB read-only boundary', () => {
    expect(() => assertClosedR2ContinuationOptions(assertV74MetadataHandoff(input()))).not.toThrow();
  });
  it.each(['ref', 'liveRef', 'extraEnv', 'missingEnv', 'credentialEnv', 'secret', 'r2', 'port', 'skip', 'dbCompatible', 'review'])('rejects %s', change => {
    const value = input();
    if (change === 'ref') value.options.ref = 'a'.repeat(40);
    if (change === 'liveRef') value.liveRef = 'b'.repeat(40);
    if (change === 'extraEnv') Object.assign(value.patch, { EXTRA: '1' });
    if (change === 'missingEnv') delete (value.patch as Partial<typeof patch>).HOMECOOK_YOUTUBE_EXTRACTION_EXPECTED_SCHEMA_PATH;
    if (change === 'credentialEnv') value.patch.HOMECOOK_YOUTUBE_EXTRACTION_APP_DESCRIPTOR_PATH = '/secret.jwt';
    if (change === 'secret') value.next.EnvironmentVariables.SECRET = 'changed';
    if (change === 'r2') value.next.EnvironmentVariables.MUMEOK_ROUND2_ACTIVE = 'true';
    if (change === 'port') value.next.ProgramArguments[5] = '3101';
    if (change === 'skip') Object.assign(value.options, { skipAutomatedTests: true });
    if (change === 'dbCompatible') Object.assign(value.options, { dbCompatible: true });
    if (change === 'review') Object.assign(value.options, { reviewedProtectedRollout: true });
    expect(() => assertV74MetadataHandoff(value)).toThrow();
  });
  it('keeps the ordinary no-environment continuation rule strict', () => expect(() => assertClosedR2ContinuationOptions(options)).toThrow());
});

import { assertV74WorkerSuccessor } from '../scripts/lib/prelaunch-youtube-v74-cutover.mjs';
function successorFixture() {
  const digest = 'a'.repeat(64);
  const baseline = {credentialGeneration:48,credentialRowSha256:digest,policyRowSha256:digest,policyStableSha256:digest,
    schemaIdentity:'youtube-extraction-worker-schema-v2',snapshotDigest:'b'.repeat(64),workerPolicyEnabled:true,workerReleaseSha:'6b610eb012da42b5d151b058531815dc12a8ca45'};
  const origin = { original: {path:'/private/original.json',sha256:digest} };
  const policy = {pipelineIdentity:'85fbf4877e6f2894841bfd160f2d9a63894eb709fd63e897483efe71fd4016cd',enabled:true,fingerprintKeyVersion:'keep',previousFingerprintKeyVersion:'previous',previousFingerprintValidUntil:'2026-10-20T00:00:00Z'};
  const before = {worker:{...baseline},policy,targetSha256:digest,normalDataSha256:digest,controlsSha256:digest,catalogSha256:digest,immutableSha256:digest,authoritySha256:digest};
  const after = {...structuredClone(before),worker:{...baseline,credentialGeneration:49,workerReleaseSha:V74_RELEASE,snapshotDigest:'6ad984e1ff856c009698bb15d1c2afb72116264b29120390204cc6af32aef121',catalogFingerprint:'de001df9981d361130136e2dff184665ec5280e82a857aa4e0e6cd593848af05'},policy:{...policy,pipelineIdentity:'0d81a76c8df4b3f0c8ec05f1a0ad9aeab5477b9cb7fa4b64e299ce83452b7583'}};
  const proof = {schema:'homecook.youtube-v74-activation.v1',releaseSha:V74_RELEASE,origin,before,after,web:{releaseSha:V74_RELEASE,plistSha256:digest},registrationSha256:digest,verificationSha256:digest,health:{authenticatedStatus:200,emptyClaimDenied:true,ready:true,pid:123,secondPid:123},service:{plistSha256:digest}};
  return {proof,baseline,approvedPolicy:baseline,origin};
}
describe('v74 original C04 authority successor', () => {
  it('accepts the exact48 predecessor and bound49 without rewriting original review', () => expect(assertV74WorkerSuccessor(successorFixture()).credentialGeneration).toBe(49));
  it.each(['origin','predecessor','foreign49','gen50','policyReset','previousReset','data','controls','schema','snapshot','unauthenticated','unstable','web'])('rejects %s', change => {
    const f=successorFixture();
    if(change==='origin')f.proof.origin.original.sha256='c'.repeat(64);
    if(change==='predecessor')f.proof.before.worker.credentialRowSha256='c'.repeat(64);
    if(change==='foreign49')f.proof.after.worker.workerReleaseSha='c'.repeat(40);
    if(change==='gen50')f.proof.after.worker.credentialGeneration=50;
    if(change==='policyReset')f.proof.after.policy.fingerprintKeyVersion='reset';
    if(change==='previousReset')f.proof.after.policy.previousFingerprintKeyVersion='reset';
    if(change==='data')f.proof.after.normalDataSha256='c'.repeat(64);
    if(change==='controls')f.proof.after.controlsSha256='c'.repeat(64);
    if(change==='schema')f.proof.after.worker.schemaIdentity='different';
    if(change==='snapshot')f.proof.after.worker.snapshotDigest='c'.repeat(64);
    if(change==='unauthenticated')f.proof.health.authenticatedStatus=403;
    if(change==='unstable')f.proof.health.secondPid=456;
    if(change==='web')f.proof.web.releaseSha='c'.repeat(40);
    // Freeze the original origin independently, as the private loader does.
    expect(()=>assertV74WorkerSuccessor({...f,origin:successorFixture().origin})).toThrow();
  });
});

import { assertV74LoadedService } from '../scripts/lib/prelaunch-youtube-v74-cutover.mjs';
it('validates actual loaded root arguments and ignores a nested fake PID', () => {
  const plist={ProgramArguments:['/usr/bin/env','-i','HOME=/Users/cwj','/node','/runner'],WorkingDirectory:'/artifact'};
  const serviceTarget='gui/501/com.homecook.youtube-extraction-worker',plistPath='/worker.plist';
  const stdout=`${serviceTarget} = {\n\tpath = ${plistPath}\n\ttype = LaunchAgent\n\tprogram = /usr/bin/env\n\tworking directory = /artifact\n\tstate = running\n\tpid = 123\n\targuments = {\n${plist.ProgramArguments.map(x=>'\t\t'+x).join('\n')}\n\t}\n\tchild = {\n\t\tpid = 999\n\t}\n}`;
  const f={stdout,plist,serviceTarget,plistPath};
  expect(assertV74LoadedService(f).pid).toBe(123);
  expect(()=>assertV74LoadedService({...f,stdout:stdout.replace('\t\t/runner','\t\t/foreign')})).toThrow();
  expect(()=>assertV74LoadedService({...f,stdout:stdout.replace('\tpid = 123','\tpid = 123\n\tpid = 999')})).toThrow();
});

import {readFileSync} from 'node:fs';
import {assertV74SourceHandoff,assertV74WebHandoff} from '../scripts/lib/prelaunch-youtube-v74-cutover.mjs';
const sourceHandoff=JSON.parse(readFileSync('docs/engineering/evidence/youtube-v74-source-handoff-20261016.json','utf8'));
describe('complete exact source handoff',()=>{
  it('admits only the pinned administrative files and already-applied SQL closure',()=>{
    const support=assertV74SourceHandoff(sourceHandoff);
    expect(support.has('scripts/lib/full-local-security-inventory.mjs')).toBe(true);
    expect(support.has('lib/server/youtube-async-extraction.ts')).toBe(false);
  });
  it.each(['from','to','omit','extra','alter'])('rejects %s',change=>{
    const x=structuredClone(sourceHandoff);
    if(change==='from')x.from='a'.repeat(40);if(change==='to')x.to='b'.repeat(40);
    if(change==='omit')delete x.digests[Object.keys(x.digests)[0]];
    if(change==='extra')x.digests['lib/server/auth.ts']=['a'.repeat(64),'b'.repeat(64)];
    if(change==='alter')x.digests[Object.keys(x.digests)[0]][1]='f'.repeat(64);
    expect(()=>assertV74SourceHandoff(x)).toThrow();
  });
  it('has no web receipt authority before the actual official deployment',()=>expect(()=>assertV74WebHandoff({proof:{},maintenance:{},ledger:[]})).toThrow());
});
function webReceiptFixture(){
  const hash='a'.repeat(64),maintenance={path:'/original/receipt.json',sha256:hash};
  const ledger=Array.from({length:232},(_,i)=>({filename:`${i}.sql`,sha256:hash}));
  const proof={schema:'homecook.youtube-v74-web-handoff.v1',from:V74_WEB_PREDECESSOR,to:V74_RELEASE,
    sourceDiffSha256:sourceHandoff.diffSha256,databaseMaintenance:maintenance,
    web:{releaseSha:V74_RELEASE,plistSha256:hash,buildId:'actual-build'},
    state:{ref:V74_RELEASE,targetPlistHash:hash,buildId:'actual-build',databaseVerification:{baselineRequired:false,pending:[],source:ledger,applied:ledger},
      closedR2:{from:V74_WEB_PREDECESSOR,to:V74_RELEASE,activationAuthorized:false,kind:'continuation',targetPlistSha256:hash,previousStateSha256:hash,previousArtifactSha256:hash}}};
  return {proof,maintenance,ledger};
}
it('binds the actual web build to the original232 maintenance and complete applied ledger',()=>expect(assertV74WebHandoff(webReceiptFixture())).toBe(true));
it.each(['ledger','build','plist','maintenance','active'])('rejects actual web receipt %s',change=>{
  const f=webReceiptFixture();
  if(change==='ledger')f.proof.state.databaseVerification.source=[];
  if(change==='build')f.proof.web.buildId='other';
  if(change==='plist')f.proof.web.plistSha256='b'.repeat(64);
  if(change==='maintenance')f.proof.databaseMaintenance={path:'/foreign/receipt.json',sha256:'b'.repeat(64)};
  if(change==='active')f.proof.state.closedR2.activationAuthorized=true;
  expect(()=>assertV74WebHandoff(f)).toThrow();
});

import {classifyPrelaunchScope} from '../scripts/lib/prelaunch-web-deploy.mjs';
it('classifies only the enumerated v74 operator files as support for later official web deployments',()=>{
 const pkg={scripts:{build:'next build',start:'node scripts/start-production.mjs'}};
 const files=['scripts/lib/prelaunch-youtube-v74-cutover.mjs','scripts/lib/youtube-v74-cutover-preparation.mjs','scripts/youtube-v74-controlled-cutover.mjs','scripts/verify-youtube-v74-cutover-native.mjs'];
 expect(classifyPrelaunchScope(files,pkg,pkg).support).toEqual(files);
 expect(()=>classifyPrelaunchScope(['scripts/unreviewed-worker-control.mjs'],pkg,pkg)).toThrow();
});
