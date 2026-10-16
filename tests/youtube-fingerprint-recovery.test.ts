import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertFingerprintPolicyChange, classifyFingerprintReconciliation, fingerprintRecoveryHash as hash,
  transitionFingerprintPolicy, verifyExistingV2Fingerprints, FINGERPRINT_RECOVERY_SCHEMA } from '../scripts/lib/youtube-fingerprint-recovery.mjs';
import { assertFingerprintSource, assertFingerprintCurrentPolicy, fingerprintWorkerSuccessor, readFingerprintRecoveryAuthority } from '../scripts/lib/youtube-fingerprint-recovery-authority.mjs';
import { buildYoutubeExtractionFingerprint } from '../lib/server/youtube-async-extraction';
import { verifyOperatingYoutubeEnqueueRuntime } from '../scripts/lib/youtube-enqueue-runtime-preflight-ops.mjs';

const roots:string[]=[];
const temp=()=>{const p=mkdtempSync(join(tmpdir(),'hc-fp-unit-'));chmodSync(p,0o700);roots.push(p);return p;};
afterEach(()=>{for(const p of roots.splice(0))rmSync(p,{recursive:true,force:true});});
const digest='a'.repeat(64),other='b'.repeat(64);
function fixture(){
  const policy={policy_key:'primary',enabled:true,policy_version:3,pipeline_identity:'fixed-v74',result_affecting_options:{},
    fingerprint_key_version:'1',previous_fingerprint_key_version:null,previous_fingerprint_valid_until:null,updated_at:'2026-10-16T00:00:00Z'};
  const before={policy,policyRowSha256:digest,policyStableSha256:digest,jobsSha256:digest,v1Count:8,v1TerminalCount:8,v2Count:33,activeCount:0,permitHeld:false,originalJobs:Object.fromEntries(Array.from({length:41},(_,n)=>[n.toString(16).padStart(64,'0'),digest]))};
  const after={...before,policy:{...policy,fingerprint_key_version:'2',updated_at:'2026-10-16T01:00:00Z'},policyRowSha256:other,policyStableSha256:other};
  const worker={credentialGeneration:49,workerReleaseSha:'3e58467499c63ba20c3b3191d9dd7dec77a7aa44',credentialRowSha256:digest,
    schemaIdentity:'fixed-schema',snapshotDigest:digest,workerPolicyEnabled:true,policyRowSha256:digest,policyStableSha256:digest};
  const stableWorker=Object.fromEntries(Object.entries(worker).filter(([key])=>!['policyRowSha256','policyStableSha256'].includes(key)));
  const beforePreserved={worker:stableWorker,normalDataSha256:digest,ledger:232};
  const origin={v74ActivationSha256:digest,authority:{original:digest}};
  const plan={schema:'homecook.youtube-fingerprint-recovery-plan.v1',from:'53da069a4b27672bb5eb9d0a617783c1b9c33d5f',candidate:'c'.repeat(40),origin,before,beforePreserved,
    sources:{'scripts/lib/start-production-runtime.mjs':[digest,other]}};
  const receipt={schema:FINGERPRINT_RECOVERY_SCHEMA,status:'committed',direction:'apply',predecessorSha256:digest,origin,before,after,beforePreserved,afterPreserved:beforePreserved};
  return {before,after,worker,plan,receipt,origin,beforePreserved};
}

describe('V2 exact authority and policy boundary',()=>{
  it('inherits only two policy hashes after validating the original authority and reviewed preimage',()=>{
    const f=fixture();const recovery={plan:f.plan,receipt:f.receipt,authority:{planSha256:hash(JSON.stringify(f.plan)),receiptSha256:other}};
    expect(fingerprintWorkerSuccessor(f.worker,recovery,f.origin.authority,digest)).toEqual({...f.worker,policyRowSha256:other,policyStableSha256:other});
    assertFingerprintCurrentPolicy(recovery,f.after.policy,{policyRowSha256:other,policyStableSha256:other});
    expect(()=>assertFingerprintCurrentPolicy(recovery,{...f.after.policy,enabled:false},{policyRowSha256:other,policyStableSha256:other})).toThrow('live-full-policy');
    expect(()=>assertFingerprintCurrentPolicy(recovery,f.after.policy,{policyRowSha256:digest,policyStableSha256:other})).toThrow();
  });
  it.each(['enabled','pipeline_identity','policy_version','previous_fingerprint_key_version'])('rejects unrelated policy %s',field=>{
    const f=fixture();const altered={...f.after.policy,[field]:'unreviewed'};
    expect(()=>assertFingerprintPolicyChange(f.before.policy,altered)).toThrow();
  });
  it('rejects unreviewed source files, missing byte pairs, and a different candidate',()=>{
    const {plan}=fixture();expect(assertFingerprintSource({plan,from:plan.from,to:plan.candidate,digests:plan.sources}).has('scripts/lib/start-production-runtime.mjs')).toBe(true);
    expect(()=>assertFingerprintSource({plan,from:plan.from,to:plan.candidate,digests:{}})).toThrow();
    expect(()=>assertFingerprintSource({plan:{...plan,sources:{'lib/server/auth.ts':[digest,other]}},from:plan.from,to:plan.candidate,digests:{'lib/server/auth.ts':[digest,other]}})).toThrow();
    expect(()=>assertFingerprintSource({plan,from:plan.from,to:'d'.repeat(40),digests:plan.sources})).toThrow();
  });
  it('preserves the merged master bytes but rejects unreviewed edits to those paths',()=>{
    const {plan}=fixture();
    const pair=["7380875b918a783e809febe06b397dc17007cbb73dc0343fe0a5cf9ba3b9a9fc", "bec65c06c6387961372a507647918f7e401a4cf87957cf4ccb913beb1f39d751"];
    const sources={'lib/server/user-progress.ts':pair};
    expect(()=>assertFingerprintSource({plan:{...plan,sources},from:plan.from,to:plan.candidate,digests:sources})).not.toThrow();
    for(const modified of [[digest,pair[1]],[pair[0],other]]) {
      const changed={'lib/server/user-progress.ts':modified};
      expect(()=>assertFingerprintSource({plan:{...plan,sources:changed},from:plan.from,to:plan.candidate,digests:changed})).toThrow('unrelated-source');
    }
  });
  it('binds compensation full preimage to the actual apply receipt, not just its hash labels',()=>{
    const f=fixture();
    const compensation={...f.receipt,direction:'compensate',planSha256:digest,predecessorSha256:other,
      before:structuredClone(f.after),after:{...f.after,policy:{...f.before.policy,updated_at:'2026-10-16T02:00:00Z'}}};
    const recovery={plan:f.plan,receipt:f.receipt,authority:{planSha256:digest,receiptSha256:other},compensation};
    expect(fingerprintWorkerSuccessor(f.worker,recovery,f.origin.authority,digest).policyRowSha256).toBe(other);
    const forged=structuredClone(recovery);
    forged.compensation.before.policy.pipeline_identity='unreviewed';
    forged.compensation.after.policy.pipeline_identity='unreviewed';
    expect(()=>fingerprintWorkerSuccessor(f.worker,forged,f.origin.authority,digest)).toThrow('compensation-chain');
  });
  it('refuses a coedited file bundle unless its plan matches the independent approval anchor',()=>{
    const root=temp(),f=fixture(),planBytes=JSON.stringify(f.plan),planSha=hash(planBytes);
    const receiptBytes=JSON.stringify({...f.receipt,planSha256:planSha});
    writeFileSync(join(root,'plan.json'),planBytes);writeFileSync(join(root,'apply-receipt.json'),receiptBytes);
    writeFileSync(join(root,'authority.json'),JSON.stringify({schema:'homecook.youtube-fingerprint-recovery-authority.v1',planSha256:planSha,receiptName:'apply-receipt.json',receiptSha256:hash(receiptBytes)}));
    const read=(p:string)=>readFileSync(p);
    expect(()=>readFingerprintRecoveryAuthority(read,root,()=>other)).toThrow('independent-approval');
    expect(readFingerprintRecoveryAuthority(read,root,()=>planSha)?.plan.candidate).toBe(f.plan.candidate);
    writeFileSync(join(root,'compensate-intent.json'),'{}');
    expect(()=>readFingerprintRecoveryAuthority(read,root,()=>planSha)).toThrow('pending-compensation');
  });
  it('cannot replace the approved old41 map in a commit dispatch or receipt',()=>{
    const f=fixture(),after={...f.after,originalJobs:{...f.after.originalJobs,['0'.repeat(64)]:other}};
    const observed={...after,v2Count:34,jobsSha256:other};
    expect(classifyFingerprintReconciliation({expected:f.before,dispatch:{after},observed})).toBe('uncertain-forward-fix-only');
    const recovery={plan:f.plan,receipt:{...f.receipt,after},authority:{planSha256:digest,receiptSha256:other}};
    expect(()=>fingerprintWorkerSuccessor(f.worker,recovery,f.origin.authority,digest)).toThrow('receipt-original-jobs');
  });
  it('blocks a pending attempt; only an explicitly reconciled noncommit permits a fresh attempt',()=>{
    const root=temp();mkdirSync(join(root,'attempt-1'),{mode:0o700});
    expect(()=>readFingerprintRecoveryAuthority((p:string)=>readFileSync(p),root,()=>digest)).toThrow('pending-transition');
    writeFileSync(join(root,'attempt-1/not-applied.json'),'{}');
    expect(readFingerprintRecoveryAuthority((p:string)=>readFileSync(p),root,()=>digest)).toBe(null);
  });
});

describe('uncertain commit and compensation',()=>{
  it.each(['commit-dispatch','committed','COMMIT;'])('never blindly rolls back or retries after %s failure',async failure=>{
    const f=fixture(),queries:string[]=[],events:string[]=[];let reads=0;
    const session={query:async(sql:string)=>{queries.push(sql);if(sql==='COMMIT;'&&failure===sql)throw new Error('lost transport');
      if(sql.includes("'policy',"))return JSON.stringify(reads++===0?f.before:f.after);if(sql.startsWith('WITH changed'))return '1';return '';}};
    await expect(transitionFingerprintPolicy({session,expected:f.before,observePreserved:async()=>f.beforePreserved,publish:async(phase:string)=>{events.push(phase);if(phase===failure)throw new Error('disk failure');}})).rejects.toThrow(failure==='commit-dispatch'?'rejected-before-commit':'outcome-uncertain');
    expect(queries.filter(q=>q==='COMMIT;')).toHaveLength(failure==='commit-dispatch'?0:1);
    expect(queries.filter(q=>q==='ROLLBACK;')).toHaveLength(failure==='commit-dispatch'?1:0);
    expect(events.filter(e=>e==='intent')).toHaveLength(1);
  });
  it('reconciliation never treats terminal V2 history, unrelated rows, or unknown policy as permission to compensate',()=>{
    const f=fixture(),dispatch={after:f.after};
    expect(classifyFingerprintReconciliation({expected:f.before,dispatch,observed:f.before})).toBe('not-applied');
    expect(classifyFingerprintReconciliation({expected:f.before,dispatch,observed:f.after})).toBe('committed');
    expect(classifyFingerprintReconciliation({expected:f.before,dispatch,observed:{...f.after,v2Count:34,originalJobs:{...f.after.originalJobs,[other]:other},jobsSha256:other}})).toBe('committed-with-new-work');
    expect(classifyFingerprintReconciliation({expected:f.before,dispatch,observed:{...f.after,jobsSha256:other}})).toBe('uncertain-forward-fix-only');
  });
});

describe('existing V2 key verification without key creation',()=>{
  const fake='synthetic-fingerprint-test-only-'.repeat(2);
  const policy={policyKey:'primary',policyVersion:3,extractorMode:'i031_codex_vision',pipelineIdentity:'existing',resultAffectingOptions:{singleRecipeOnly:true},currentFingerprintKeyVersion:'2'};
  const userId='80000000-0000-4000-8000-000000000010',videoId='fixtureVideo';
  const row={user_id:userId,youtube_video_id:videoId,extractor_mode:policy.extractorMode,pipeline_identity:policy.pipelineIdentity,
    policy_version:policy.policyVersion,result_affecting_options:policy.resultAffectingOptions,
    fingerprint:buildYoutubeExtractionFingerprint({secret:fake,userId,videoId,policy}).digest};
  it('matches the production canonical HMAC for all33 legacy rows and rejects a different key',()=>{
    const rows=Array.from({length:33},()=>row),env={HOMECOOK_YOUTUBE_EXTRACTION_FINGERPRINT_HMAC_KEY_V2:fake};
    expect(verifyExistingV2Fingerprints(env,rows)).toEqual({existingV2Configured:true,compared:33,matched:33,secretDisclosed:false});
    expect(()=>verifyExistingV2Fingerprints({...env,HOMECOOK_YOUTUBE_EXTRACTION_FINGERPRINT_HMAC_KEY_V2:'wrong-synthetic-key-'.repeat(3)},rows)).toThrow('existing-v2-key-mismatch');
    expect(()=>verifyExistingV2Fingerprints(env,rows.slice(1))).toThrow('existing-v2-history-count');
  });
  it('checks the actual production env-file loading in an isolated child without disclosing the key',()=>{
    const root=temp();writeFileSync(join(root,'.env.production.local'),'HOMECOOK_YOUTUBE_EXTRACTION_FINGERPRINT_HMAC_KEY_V2='+fake+'\n',{mode:0o600});
    const plist={WorkingDirectory:root,ProgramArguments:[process.execPath],EnvironmentVariables:{HOMECOOK_ENABLE_YOUTUBE_ASYNC_EXTRACTION:'1',NODE_ENV:'production'}};
    const readiness={currentFingerprintKeyVersion:'2',previousFingerprintKeyVersion:null,previousFingerprintValidUntil:null};
    const result=verifyOperatingYoutubeEnqueueRuntime({codeRoot:process.cwd(),plist,readiness});
    expect(result.ready).toBe(true);expect(JSON.stringify(result)).not.toContain(fake);
    expect(()=>verifyOperatingYoutubeEnqueueRuntime({codeRoot:process.cwd(),plist,readiness:{...readiness,currentFingerprintKeyVersion:'1'}})).toThrow('preflight failed');
  });
});
