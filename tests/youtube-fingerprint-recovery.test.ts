import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertFingerprintPolicyChange, classifyFingerprintReconciliation, fingerprintRecoveryHash as hash,
  transitionFingerprintPolicy, FINGERPRINT_RECOVERY_SCHEMA } from '../scripts/lib/youtube-fingerprint-recovery.mjs';
import { assertFingerprintSource, assertFingerprintCurrentPolicy, fingerprintWorkerSuccessor, readFingerprintRecoveryAuthority } from '../scripts/lib/youtube-fingerprint-recovery-authority.mjs';
import { loadFingerprintV2SecretEnv, fingerprintV2SecretPath } from '../scripts/lib/youtube-fingerprint-secret-env.mjs';
import { sealFingerprintKey, openFingerprintKey } from '../scripts/lib/youtube-fingerprint-key-staging.mjs';

const roots:string[]=[];
const temp=()=>{const p=mkdtempSync(join(tmpdir(),'hc-fp-unit-'));chmodSync(p,0o700);roots.push(p);return p;};
afterEach(()=>{for(const p of roots.splice(0))rmSync(p,{recursive:true,force:true});});
const digest='a'.repeat(64),other='b'.repeat(64);
function fixture(){
  const policy={policy_key:'primary',enabled:true,policy_version:3,pipeline_identity:'fixed-v74',result_affecting_options:{},
    fingerprint_key_version:'1',previous_fingerprint_key_version:null,previous_fingerprint_valid_until:null,updated_at:'2026-10-16T00:00:00Z'};
  const before={policy,policyRowSha256:digest,policyStableSha256:digest,jobsSha256:digest,v1Count:8,v1TerminalCount:8,v2Count:0,activeCount:0,permitHeld:false};
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
    expect(classifyFingerprintReconciliation({expected:f.before,dispatch,observed:{...f.after,v2Count:1}})).toBe('forward-fix-only');
    expect(classifyFingerprintReconciliation({expected:f.before,dispatch,observed:{...f.after,jobsSha256:other}})).toBe('uncertain-forward-fix-only');
  });
});

describe('private V2 runtime file and encrypted recovery',()=>{
  function setup(){const home=temp();mkdirSync(join(home,'.homecook/youtube-extraction'),{recursive:true,mode:0o700});return {home,file:fingerprintV2SecretPath(home),repo:process.cwd()};}
  const fakeSecret='synthetic-fingerprint-test-only-'.repeat(2),fakeBackup='synthetic-backup-key-test-only-'.repeat(2);
  it('loads exactly V2 from a private fixed file and refuses env disagreement',()=>{
    const f=setup();writeFileSync(f.file,fakeSecret+'\n',{mode:0o600});
    const env={HOMECOOK_ENABLE_YOUTUBE_ASYNC_EXTRACTION:'1'};
    expect(loadFingerprintV2SecretEnv({repositoryRoot:f.repo,env,home:f.home})).toEqual({HOMECOOK_YOUTUBE_EXTRACTION_FINGERPRINT_HMAC_KEY_V2:fakeSecret});
    expect(()=>loadFingerprintV2SecretEnv({repositoryRoot:f.repo,env:{...env,HOMECOOK_YOUTUBE_EXTRACTION_FINGERPRINT_HMAC_KEY_V2:'different'},home:f.home})).toThrow();
  });
  it.each(['mode','symlink','short','oversize'])('rejects %s without exposing file bytes',kind=>{
    const f=setup();writeFileSync(f.file,kind==='short'?'short':kind==='oversize'?'x'.repeat(4097):fakeSecret,{mode:0o600});
    if(kind==='mode')chmodSync(f.file,0o644);
    if(kind==='symlink'){rmSync(f.file);const target=join(f.home,'target');writeFileSync(target,fakeSecret);symlinkSync(target,f.file);}
    expect(()=>loadFingerprintV2SecretEnv({repositoryRoot:f.repo,env:{HOMECOOK_ENABLE_YOUTUBE_ASYNC_EXTRACTION:'1'},home:f.home})).toThrow('unavailable or unsafe');
  });
  it('authenticates encrypted backup purpose/version and rejects tampering/wrong backup keys',()=>{
    const sealed=sealFingerprintKey(fakeSecret,fakeBackup,Buffer.alloc(12,1));
    expect(JSON.stringify(sealed)).not.toContain(fakeSecret);expect(openFingerprintKey(sealed,fakeBackup)).toBe(fakeSecret);
    expect(()=>openFingerprintKey({...sealed,version:'1'},fakeBackup)).toThrow();
    expect(()=>openFingerprintKey({...sealed,tag:Buffer.alloc(16).toString('base64')},fakeBackup)).toThrow();
    expect(()=>openFingerprintKey(sealed,'different-fake-backup-key-'.repeat(2))).toThrow();
  });
});
