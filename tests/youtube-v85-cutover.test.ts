import { describe,it,expect,vi } from 'vitest';
import { readFileSync,mkdtempSync,writeFileSync,rmSync,lstatSync,readdirSync,symlinkSync } from 'node:fs';
import { join } from 'node:path';
import {generateKeyPairSync,sign} from 'node:crypto';
import { V85,V85_BEGIN_SQL,V85_LOCK_SQL,assertV85Plan,assertV85Source,assertV85MetadataHandoff,v85MetadataPatch,assertV85Preserved,assertV85WorkerCredential,verifyV85IssuedToken,
  classifyV85Registration,ownsV85Registration,buildV85RegistrationSql,assertV85Successor,readV85Authority,v85Hash } from '../scripts/lib/youtube-v85-cutover.mjs';
import { V74_ACTIVATION_SHA256 } from '../scripts/lib/prelaunch-youtube-v74-cutover.mjs';
import { DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS } from '../scripts/lib/youtube-extraction-worker-artifact.mjs';
import { classifyPrelaunchScope,assertClosedR2ContinuationOptions,assertRound2InheritanceBoundaries,retargetPlist } from '../scripts/lib/prelaunch-web-deploy.mjs';
import { runV85Cutover,resumeV85Cutover,createV85PrivateFile } from '../scripts/youtube-v85-controlled-cutover.mjs';
const now=new Date('2026-10-17T00:00:00Z'),h='a'.repeat(64),other='b'.repeat(64),ref='c'.repeat(40);
const reviewed=JSON.parse(readFileSync('scripts/manifests/youtube-v85-reviewed-source.json','utf8'));
function fixture() {
  const origin={personal:{path:'/owned/original.json',sha256:h}},pointer={path:'/owned/fingerprint-authority.json',sha256:h};
  const policy={version:3,extractorMode:'i031_codex_vision',pipelineIdentity:String(V85.predecessorPipelineIdentity),resultAffectingOptions:{...DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS,interval:Number(DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS.interval)},
    fingerprintKeyVersion:'2',previousFingerprintKeyVersion:null,previousFingerprintValidUntil:null,enabled:true};
  const raw={policy_key:'primary',policy_version:3,extractor_mode:policy.extractorMode,pipeline_identity:String(policy.pipelineIdentity),result_affecting_options:policy.resultAffectingOptions,
    fingerprint_key_version:'2',previous_fingerprint_key_version:null,previous_fingerprint_valid_until:null,enabled:true,updated_at:'2026-10-16T20:58:46Z'};
  const worker={credentialGeneration:49,credentialRowSha256:h,policyRowSha256:h,policyStableSha256:h,schemaIdentity:V85.schemaIdentity,snapshotDigest:V85.predecessorSnapshotDigest,
    workerPolicyEnabled:true,workerReleaseSha:V85.predecessorReleaseSha,catalogFingerprint:V85.catalogSha256,credentialActive:true,queued:0,processing:0,permitHeld:false,activeEnqueueSessions:0};
  const credential={generation:49,jtiSha256:h,expiresAt:String(V85.expiresAt),releaseSha:String(V85.predecessorReleaseSha),schemaIdentity:V85.schemaIdentity,snapshotDigest:V85.predecessorSnapshotDigest};
  const before={full:{ledger:Array.from({length:232},(_,i)=>({filename:`${i}.sql`,sha256:h})),fingerprintPolicy:raw,worker},worker,policy,credential,jobCount:42,jobsSha256:h,
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
describe('v85 approved source and immutable worker boundary',()=>{
  it('accepts evaluated artifact, V2/42/DB232 and unchanged credential duration',()=>expect(assertV85Plan(fixture().plan,now)).toBeTruthy());
  it.each(['generation','release','expiry','fingerprint','previous','options','jobs','ledger','service','view','source'])('rejects changed %s',change=>{
    const {plan}=fixture();
    if(change==='generation')plan.before.worker.credentialGeneration=50;
    if(change==='release')plan.releaseSha=ref;
    if(change==='expiry')plan.expiresAt='2026-10-23T00:00:00.000Z';
    if(change==='fingerprint')plan.before.policy.fingerprintKeyVersion='1';
    if(change==='previous')Object.assign(plan.before.policy,{previousFingerprintKeyVersion:'1'});
    if(change==='options')plan.before.policy.resultAffectingOptions={...plan.before.policy.resultAffectingOptions,interval:5};
    if(change==='jobs')plan.before.jobCount=41;
    if(change==='ledger')plan.before.full.ledger.pop();
    if(change==='service')plan.beforeService.pid=0;
    if(change==='view')plan.before.full.fingerprintPolicy.enabled=false;
    if(change==='source')plan.sources={...plan.sources,'lib/server/unrelated.ts':[null,h]};
    expect(()=>assertV85Plan(plan,now)).toThrow();
  });
  it.each(['role','scope','issuer','audience','generation','expiry','future','jti','metadata'])('rejects unsafe worker %s',change=>{
    const f=fixture();if(change==='role')f.claims.role='service_role';if(change==='scope')f.claims.scope='all';if(change==='issuer')f.claims.iss='foreign';if(change==='audience')f.claims.aud='foreign';
    if(change==='generation')f.claims.generation=49;if(change==='expiry')f.claims.exp++;if(change==='future')f.claims.iat+=31;if(change==='jti')f.claims.jti_hash='bad';if(change==='metadata')f.metadata.jti_sha256=h;
    expect(()=>assertV85WorkerCredential({...f,now})).toThrow();
  });
  it('keeps expiry absolute rather than issuing a fresh six-day window',()=>{const f=fixture();expect(()=>assertV85WorkerCredential({...f,now})).not.toThrow();expect(()=>assertV85WorkerCredential({...f,now:new Date(V85.expiresAt)})).toThrow();});
  it('passes the complete frozen product diff through the actual web scope classifier',()=>{const f=fixture(),pkg=JSON.parse(readFileSync('package.json','utf8')),support=assertV85Source({plan:f.plan,from:V85.from,to:ref,digests:reviewed});expect(classifyPrelaunchScope(Object.keys(reviewed),pkg,pkg,{reviewedIntegratedFiles:support}).database).toEqual([]);});
  it('rejects omitted/altered evaluated source and unrelated environment/control files',()=>{
    const f=fixture(),input={plan:f.plan,from:V85.from,to:ref,digests:structuredClone(reviewed)};
    expect(assertV85Source(input).has('scripts/lib/youtube-extraction-worker-artifact.mjs')).toBe(true);
    for(const path of ['lib/server/youtube-async-extraction.ts','scripts/lib/youtube-extraction-worker-artifact.mjs']){const i=structuredClone(input);delete i.digests[path];expect(()=>assertV85Source(i)).toThrow();}
    const i=structuredClone(input);i.digests['.env.production']=[null,h];i.plan.sources=i.digests;expect(()=>assertV85Source(i)).toThrow();
  });
});
describe('exact metadata handoff with original closed controls',()=>{
  function input(){const {plan}=fixture();const previous={Label:'com.homecook.production',WorkingDirectory:'/old',ProgramArguments:['/node','/old/scripts/start-production.mjs','-H','127.0.0.1','-p','3100'],EnvironmentVariables:{MUMEOK_ROUND2_ACTIVE:'false',SECRET:'unchanged'}};
    const patch=v85MetadataPatch('/Users/cwj');return {plan,home:'/Users/cwj',now,options:{refOption:'--reviewed-ref',ref,alreadyAppliedDb:true,dbConfig:'/private/db.env',envFile:'/private/v85.env'},liveRef:String(V85.from),patch,previous,next:retargetPlist({...previous,EnvironmentVariables:{...previous.EnvironmentVariables,...patch}},'/new')};}
  it('passes only three metadata paths to the existing no-DB-write continuation',()=>expect(()=>assertClosedR2ContinuationOptions(assertV85MetadataHandoff(input()))).not.toThrow());
  it.each(['ref','live','skip','env','secret','port','review'])('rejects %s',change=>{const f=input();if(change==='ref')f.options.ref=V85.releaseSha;if(change==='live')f.liveRef=ref;
    if(change==='skip')Object.assign(f.options,{skipAutomatedTests:true});if(change==='env')Object.assign(f.patch,{SUPABASE_SERVICE_ROLE_KEY:'bad'});if(change==='secret')f.next.EnvironmentVariables.SECRET='bad';
    if(change==='port')f.next.ProgramArguments[5]='3101';if(change==='review')Object.assign(f.options,{reviewedProtectedRollout:true});expect(()=>assertV85MetadataHandoff(f)).toThrow();});
  it('does not exempt an unrelated R2 protected change',()=>{const f=input();expect(()=>assertRound2InheritanceBoundaries({previous:f.previous,next:f.previous,files:['lib/server/full-local-auth/guard.ts'],reviewedV85Source:{plan:f.plan,from:V85.from,to:ref,digests:reviewed}})).toThrow();});
});
describe('registration exact readback and successor',()=>{
  it('distinguishes no commit from committed response loss; never permits another issue',()=>{const f=fixture();expect(classifyV85Registration({...f,observed:f.off,now})).toEqual({state:'not-applied',mayRegister:true,mayIssue:false,forwardOnly:true});
    expect(classifyV85Registration({...f,observed:f.after,now})).toEqual({state:'registered',mayRegister:false,mayIssue:false,forwardOnly:true});});
  it.each(['jti','expiry','foreign','newer','pipeline','history','data','control','queue','fingerprint','timestamp','ledger','protectedProjection'])('fails closed for uncertain %s',change=>{const f=fixture(),o=structuredClone(f.after);
    if(change==='jti')o.credential.jtiSha256=h;if(change==='expiry')o.credential.expiresAt='2026-10-23T00:00:00Z';if(change==='foreign')o.credential.releaseSha=ref;if(change==='newer')o.worker.credentialGeneration=51;
    if(change==='pipeline')o.policy.pipelineIdentity=V85.predecessorPipelineIdentity;if(change==='history')o.jobsSha256=other;if(change==='data')o.normalDataSha256=other;if(change==='control')o.controlsSha256=other;
    if(change==='queue')o.worker.queued=1;if(change==='fingerprint')o.policy.fingerprintKeyVersion='1';if(change==='timestamp'){Object.assign(o,structuredClone(f.off));o.worker.policyRowSha256=h;}if(change==='ledger')o.full.ledger[0].sha256=other;if(change==='protectedProjection')Object.assign(o.full,{active:true});
    expect(classifyV85Registration({...f,observed:o,now}).state).toBe('unknown');});
  it('accepts only the original49 + fingerprint receipt lineage and verified50',()=>{const f=fixture();expect(assertV85Successor({authority:{plan:f.plan,planSha256:h,proof:f.proof},worker:f.plan.before.worker,policy:f.plan.before.full.fingerprintPolicy,origin:f.origin,recovery:f.recovery,now}).credentialGeneration).toBe(50);});
  it.each(['origin','before','policy','registration','auth','pid','web','preserved'])('rejects invalid successor %s',change=>{const f=fixture();if(change==='origin')f.plan.origin.v74ActivationSha256=other;if(change==='before')f.proof.before.worker.credentialRowSha256=other;
    if(change==='policy')f.plan.before.full.fingerprintPolicy.fingerprint_key_version='1';if(change==='registration')f.proof.registrationSha256='';if(change==='auth')f.proof.health.emptyClaimDenied=false;if(change==='pid')f.proof.health.secondPid=5;
    if(change==='web')f.proof.web.releaseSha=V85.releaseSha;if(change==='preserved')f.proof.after.jobsSha256=other;
    expect(()=>assertV85Successor({authority:{plan:f.plan,planSha256:h,proof:f.proof},worker:fixture().plan.before.worker,policy:fixture().plan.before.full.fingerprintPolicy,origin:fixture().origin,recovery:fixture().recovery,now})).toThrow();});
  it('can close only its exact50 after unrelated data drift, without granting retry',()=>{const f=fixture();f.proof.after.normalDataSha256=other;expect(ownsV85Registration(f.plan,f.proof.after,f.metadata)).toBe(true);expect(classifyV85Registration({...f,observed:f.proof.after,now}).state).toBe('unknown');});
  it('cannot contain a foreign or newer generation by changing its policy',()=>{const f=fixture();f.after.credential.jtiSha256=h;expect(ownsV85Registration(f.plan,f.after,f.metadata)).toBe(false);f.after.credential.jtiSha256=other;f.after.worker.credentialGeneration=51;expect(ownsV85Registration(f.plan,f.after,f.metadata)).toBe(false);});
  it('keeps complete history/control hashes strict',()=>{const f=fixture();expect(()=>assertV85Preserved(f.plan.before,f.after)).not.toThrow();f.after.jobsSha256=other;expect(()=>assertV85Preserved(f.plan.before,f.after)).toThrow();});
  it('generates only49->50 rotation and pipeline change, with RC/fresh-lock statements',()=>{const f=fixture(),managerClaims={role:'youtube_extraction_credential_manager',scope:'youtube-extraction-credential-manager',iss:'https://worker.mumeok.kr',aud:'youtube-extraction',jti_hash:h,iat:now.getTime()/1000,exp:now.getTime()/1000+300};
    const sql=buildV85RegistrationSql({...f,managerClaims,now});expect(sql).toContain('rotate_youtube_extraction_worker_credential(49,50,');expect(sql).not.toMatch(/grant|fingerprint_key_version\s*=|delete|truncate/iu);
    expect(V85_BEGIN_SQL).toContain('READ COMMITTED');expect(V85_LOCK_SQL).toContain('SHARE ROW EXCLUSIVE');expect(V85_BEGIN_SQL).not.toContain('LOCK TABLE');});
  it.each(['future','long','expired'])('rejects unsafe manager %s before constructing rotation SQL',change=>{const f=fixture(),iat=now.getTime()/1000,managerClaims={role:'youtube_extraction_credential_manager',scope:'youtube-extraction-credential-manager',iss:'https://worker.mumeok.kr',aud:'youtube-extraction',jti_hash:h,iat,exp:iat+300};if(change==='future'){managerClaims.iat+=31;managerClaims.exp+=31;}if(change==='long')managerClaims.exp++;if(change==='expired')managerClaims.exp=iat;expect(()=>buildV85RegistrationSql({...f,managerClaims,now})).toThrow();});
  it('requires separate approval and activation byte anchors; pending registration cannot authorize unrelated deploy',()=>{
    const dir=mkdtempSync('/tmp/v85-authority-test-');try{const f=fixture(),bytes=JSON.stringify(f.plan),digest=v85Hash(bytes);writeFileSync(join(dir,'plan.json'),bytes);
      const read=(p:string)=>readFileSync(p);expect(()=>readV85Authority(read,()=>other,dir,now)).toThrow();expect(readV85Authority(read,()=>digest,dir,now)?.proof).toBeNull();
      writeFileSync(join(dir,'registration-intent.json'),'{}');expect(()=>readV85Authority(read,()=>digest,dir,now)).toThrow();
      const proof=JSON.stringify(f.proof);writeFileSync(join(dir,'activation.json'),proof);expect(()=>readV85Authority(read,()=>digest,dir,now)).toThrow();
      expect(readV85Authority(read,(account?:string)=>account==='activation-sha256'?v85Hash(proof):digest,dir,now)?.proof).toBeTruthy();
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
});
function adapter(fail?:string){const events:string[]=[];const a:Record<string,ReturnType<typeof vi.fn>>={};
  for(const name of ['preflight','assertWebReady','assertUnissued','quiesce','issueWorker','issueManager','register','install','verify','activate','finish','containFailure','removeManager'])a[name]=vi.fn(async()=>{events.push(name);if(name===fail)throw Error(name);return {};});return {a,events};}
describe('partial execution and same50 forward repair orchestration',()=>{
  it('issues once and verifies before activation',async()=>{const {a,events}=adapter();await runV85Cutover(a);expect(events).toEqual(['preflight','assertWebReady','assertUnissued','quiesce','issueWorker','issueManager','register','install','verify','activate','finish','removeManager']);});
  it.each(['quiesce','issueWorker','issueManager','register','install','verify','activate','finish'])('contains partial failure at %s and removes owned manager',async name=>{const {a,events}=adapter(name);await expect(runV85Cutover(a)).rejects.toThrow(name);expect(events.slice(-2)).toEqual(['containFailure','removeManager']);expect(a.issueWorker.mock.calls.length).toBeLessThanOrEqual(1);});
  it('fails before issuance for busy queue or duplicate execution',async()=>{const {a}=adapter('assertUnissued');await expect(runV85Cutover(a)).rejects.toThrow();expect(a.issueWorker).not.toHaveBeenCalled();});
  it.each(['registered','not-applied'])('resumes %s using existing50 without issuing another worker',async state=>{const {a,events}=adapter();a.resumePreflight=vi.fn(async()=>({activated:false,enabled:false,metadata:{generation:50},reconciliation:{state}}));await resumeV85Cutover(a);expect(a.issueWorker).not.toHaveBeenCalled();expect(a.quiesce).not.toHaveBeenCalled();expect(a.register.mock.calls.length).toBe(state==='registered'?0:1);expect(events.indexOf('verify')).toBeLessThan(events.indexOf('activate'));});
  it('continues an interrupted pre-issuance OFF using one first worker issue',async()=>{const {a}=adapter();a.resumePreflight=vi.fn(async()=>({unissued:true,enabled:false}));await resumeV85Cutover(a);expect(a.issueWorker).toHaveBeenCalledTimes(1);expect(a.register).toHaveBeenCalledTimes(1);});
  it('keeps unknown readback from touching install/register/issue',async()=>{const {a}=adapter();a.resumePreflight=vi.fn(async()=>({activated:false,enabled:false,metadata:{},reconciliation:{state:'unknown'}}));await expect(resumeV85Cutover(a)).rejects.toThrow();expect(a.install).not.toHaveBeenCalled();expect(a.register).not.toHaveBeenCalled();expect(a.issueWorker).not.toHaveBeenCalled();});
  it('repeated completed execution is read-only verification',async()=>{const {a}=adapter();a.resumePreflight=vi.fn(async()=>({activated:true}));a.verifyActivated=vi.fn(async()=>({readOnly:true}));expect(await resumeV85Cutover(a)).toEqual({readOnly:true});expect(a.issueWorker).not.toHaveBeenCalled();expect(a.activate).not.toHaveBeenCalled();});
});

describe('recovering an existing signed50 without issuing another credential',()=>{
 function signed(){const f=fixture(),keys=generateKeyPairSync('ec',{namedCurve:'P-256'}),jwk={...keys.publicKey.export({format:'jwk'}),kid:'isolated-test',alg:'ES256'};
   const header=Buffer.from(JSON.stringify({alg:'ES256',typ:'JWT',kid:jwk.kid})).toString('base64url'),payload=Buffer.from(JSON.stringify(f.claims)).toString('base64url'),input=header+'.'+payload;
   return {...f,token:input+'.'+sign('SHA256',Buffer.from(input),{key:keys.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url'),jwtKeys:[jwk]};}
 it('validates an existing synthetic token with public coordinates only',()=>{const f=signed();expect(verifyV85IssuedToken({...f,now}).generation).toBe(50);});
 it.each(['signature','payload','kid','algorithm','duplicate','metadata','expired'])('rejects ambiguous/invalid existing %s',change=>{const f=signed();if(change==='signature')f.token=f.token.slice(0,-6)+'aaaaaa';if(change==='payload'){const p=f.token.split('.');p[1]=Buffer.from(JSON.stringify({...f.claims,scope:'all'})).toString('base64url');f.token=p.join('.');}
   if(change==='kid')f.jwtKeys[0].kid='foreign';if(change==='algorithm')f.jwtKeys[0].alg='RS256';if(change==='duplicate')f.jwtKeys.push(f.jwtKeys[0]);if(change==='metadata')f.metadata.jti_sha256=h;
   expect(()=>verifyV85IssuedToken({...f,now:change==='expired'?new Date(V85.expiresAt):now})).toThrow();});
});
describe('atomic owned private evidence publication',()=>{
 it('publishes mode600 and never overwrites existing bytes on retry',()=>{const dir=mkdtempSync('/tmp/v85-atomic-test-');try{const path=join(dir,'receipt.json');createV85PrivateFile(path,'first');expect(lstatSync(path).mode&0o777).toBe(0o600);expect(()=>createV85PrivateFile(path,'second')).toThrow();expect(readFileSync(path,'utf8')).toBe('first');expect(readdirSync(dir)).toEqual(['receipt.json']);}finally{rmSync(dir,{recursive:true,force:true});}});
 it('rejects an existing symlink without touching its target',()=>{const dir=mkdtempSync('/tmp/v85-atomic-test-');try{const target=join(dir,'target'),path=join(dir,'receipt.json');writeFileSync(target,'unchanged');symlinkSync(target,path);expect(()=>createV85PrivateFile(path,'replacement')).toThrow();expect(readFileSync(target,'utf8')).toBe('unchanged');}finally{rmSync(dir,{recursive:true,force:true});}});
});
