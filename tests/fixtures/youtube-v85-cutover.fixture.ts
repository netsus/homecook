import { readFileSync } from 'node:fs';
import { V85 } from '../../scripts/lib/youtube-v85-cutover.mjs';
import { V74_ACTIVATION_SHA256 } from '../../scripts/lib/prelaunch-youtube-v74-cutover.mjs';
import { DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS } from '../../scripts/lib/youtube-extraction-worker-artifact.mjs';
export const now=new Date('2026-10-17T00:00:00Z'),h='a'.repeat(64),other='b'.repeat(64),ref='c'.repeat(40);
export const reviewed=JSON.parse(readFileSync('scripts/manifests/youtube-v85-reviewed-source.json','utf8'));
export function fixture() {
  const origin={personal:{path:'/owned/original.json',sha256:h}},pointer={path:'/owned/fingerprint-authority.json',sha256:h};
  const policy={version:3,extractorMode:'i031_codex_vision',pipelineIdentity:String(V85.predecessorPipelineIdentity),resultAffectingOptions:{...DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS,interval:Number(DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS.interval)},
    fingerprintKeyVersion:'2',previousFingerprintKeyVersion:null,previousFingerprintValidUntil:null,enabled:true};
  const raw={policy_key:'primary',policy_version:3,extractor_mode:policy.extractorMode,pipeline_identity:String(policy.pipelineIdentity),result_affecting_options:policy.resultAffectingOptions,
    fingerprint_key_version:'2',previous_fingerprint_key_version:null,previous_fingerprint_valid_until:null,enabled:true,updated_at:'2026-10-16T20:58:46Z'};
  const worker={credentialGeneration:49,credentialRowSha256:h,policyRowSha256:h,policyStableSha256:h,schemaIdentity:V85.schemaIdentity,snapshotDigest:V85.predecessorSnapshotDigest,
    workerPolicyEnabled:true,workerReleaseSha:V85.predecessorReleaseSha,catalogFingerprint:V85.catalogSha256,credentialActive:true,queued:0,processing:0,permitHeld:false,activeEnqueueSessions:0};
  const credential={generation:49,jtiSha256:h,expiresAt:String(V85.expiresAt),releaseSha:String(V85.predecessorReleaseSha),schemaIdentity:V85.schemaIdentity,snapshotDigest:V85.predecessorSnapshotDigest};
  const before={full:{ledger:Array.from({length:232},(_,i)=>({filename:`${i}.sql`,sha256:h})),fingerprintPolicy:raw,worker,normalDataSha256:h,preservedRowsSha256:h},worker,policy,credential,jobCount:42,jobsSha256:h,
    targetSha256:h,normalDataSha256:h,controlsSha256:h,catalogSha256:h,immutableSha256:h,authoritySha256:h};
  const plan={schema:'homecook.youtube-v85-plan.v1',webRef:ref,releaseSha:String(V85.releaseSha),artifactSha256:V85.artifactSha256,descriptorSha256:V85.descriptorSha256,expiresAt:String(V85.expiresAt),
    before,beforeService:{plistSha256:h,pid:123,configSha256:h},origin:{authority:origin,v74ActivationSha256:V74_ACTIVATION_SHA256,fingerprintAuthority:pointer,fingerprintReceiptSha256:h},sources:reviewed};
  const claims={role:'youtube_extraction_worker',scope:'youtube-extraction-worker',iss:'https://worker.mumeok.kr',aud:'youtube-extraction',generation:50,release_sha:V85.releaseSha,
    schema_identity:V85.schemaIdentity,allowed_snapshot_digest:V85.snapshotDigest,jti_hash:other,iat:now.getTime()/1000,exp:Date.parse(V85.expiresAt)/1000};
  const metadata={generation:50,jti_sha256:other,expires_at:V85.expiresAt,release_sha:V85.releaseSha,schema_identity:V85.schemaIdentity,allowed_snapshot_digest:V85.snapshotDigest};
  const off=structuredClone(before);off.policy.enabled=false;off.full.fingerprintPolicy.enabled=false;off.full.fingerprintPolicy.updated_at='2026-10-17T00:00:01Z';off.worker.workerPolicyEnabled=false;off.worker.policyRowSha256=other;
  const after=structuredClone(off);after.policy.pipelineIdentity=V85.pipelineIdentity;after.full.fingerprintPolicy.pipeline_identity=V85.pipelineIdentity;
  Object.assign(after.worker,{credentialGeneration:50,workerReleaseSha:V85.releaseSha,snapshotDigest:V85.snapshotDigest,credentialRowSha256:other,policyStableSha256:other});
  Object.assign(after.credential,{generation:50,jtiSha256:other,releaseSha:V85.releaseSha,snapshotDigest:V85.snapshotDigest});
  const intent={planSha256:h,metadataSha256:h,beforeSha256:h,before:off};
  const activated=structuredClone(after);activated.policy.enabled=true;activated.full.fingerprintPolicy.enabled=true;activated.worker.workerPolicyEnabled=true;
  const proof={schema:'homecook.youtube-v85-activation.v1',planSha256:h,before,after:activated,metadata,web:{releaseSha:ref,plistSha256:h},registrationSha256:h,verificationSha256:h,
    health:{authenticatedStatus:200,emptyClaimDenied:true,ready:true,pid:234,secondPid:234},service:{plistSha256:h}};
  return {plan,claims,metadata,off,after,intent,proof,origin,recovery:{pointer,authority:{receiptSha256:h}}};
}
