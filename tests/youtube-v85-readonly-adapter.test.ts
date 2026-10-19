import { describe,it,expect,vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {randomUUID} from 'node:crypto';
import { join,dirname } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import * as contract from '../scripts/lib/youtube-v85-cutover.mjs';
import { V74_ACTIVATION_SHA256 } from '../scripts/lib/prelaunch-youtube-v74-cutover.mjs';
import { fixture,h,now } from './fixtures/youtube-v85-cutover.fixture';
import {assertV85WorkerLifecycle,registeredV85WorkerPhase} from '../scripts/lib/v85-worker-lifecycle.mjs';
import {resumeRegisteredV85Cutover} from '../scripts/youtube-v85-controlled-cutover.mjs';

// Execute the actual adapter closure against an in-memory filesystem. No operating
// files, database, Keychain, tokens, launch services or network are accessed.
async function adapterFixture(activated=true,registeredOnly=false) {
  const f=fixture(),OP='/fixture/op',P={secrets:'/fixture/secrets',token:'/fixture/token',credential:'/fixture/credential',config:'/fixture/config'},PLIST='/fixture/launcher';
  const files=new Map<string,Buffer>(),writes=vi.fn();
  const put=(path:string,value:unknown)=>files.set(path,Buffer.from(typeof value==='string'?value:JSON.stringify(value)));
  const read=(path:string)=>{const bytes=files.get(path);if(!bytes)throw new Error('fixture missing file');return bytes;};
  put(PLIST,'fixture launcher');f.proof.service.plistSha256=contract.v85Hash(read(PLIST));
  put(join(OP,'generation-49.plist'),'fixture old launcher');f.plan.beforeService.plistSha256=contract.v85Hash(read(join(OP,'generation-49.plist')));
  put(P.config,'fixture preserved config');f.plan.beforeService.configSha256=contract.v85Hash(read(P.config));
  put(join(OP,'before50.dump'),'opaque fixture backup');put(join(OP,'backup.json'),{path:join(OP,'before50.dump'),targetSha256:h,fullArchiveDecoded:true,
    bytes:read(join(OP,'before50.dump')).length,sha256:contract.v85Hash(read(join(OP,'before50.dump')))});
  put(P.token,'fixture token\n');put(P.credential,f.metadata);
  put('/fixture/.homecook/secrets/full-local-supabase/jwt_keys',[]);
  put(join(OP,'issue-intent.json'),{planSha256:h,generation:50,releaseSha:contract.V85.releaseSha,expiresAt:contract.V85.expiresAt});
  put(join(OP,'issued.json'),{planSha256:h,tokenSha256:contract.v85Hash(read(P.token)),metadataSha256:contract.v85Hash(read(P.credential))});
  put(join(OP,'quiesced.json'),f.off);
  put(join(OP,'registration-intent.json'),{planSha256:h,metadataSha256:contract.v85Hash(read(P.credential)),beforeSha256:contract.v85Hash(read(join(OP,'quiesced.json'))),before:f.off});
  if(activated)put(join(OP,'activation.json'),f.proof);
  const observed=structuredClone(activated?f.proof.after:f.after);
  const service={loaded:activated,state:activated?'running':'unloaded',pid:activated?234:0};
  let failBootstrap=false,failEnable=false;
  if(activated){Object.assign(observed,{jobCount:43,originalJobsSha256:h});}
  const c={origin:f.origin,predecessor:f.plan.before.worker,legacy:{fingerprintRecovery:{...f.recovery,receipt:{after:{policy:f.plan.before.full.fingerprintPolicy}}}}};
  const deps={OP,P,PLIST,ROOT:'/fixture',HOME:'/fixture',NODE:'/fixture/node',join,dirname,isDeepStrictEqual,randomUUID,V:contract.V85,V74_ACTIVATION_SHA256,
    ownsV85Registration:contract.ownsV85Registration,
    registeredResumeInvocation:()=>registeredOnly,assertV85WorkerLifecycle,registeredV85WorkerPhase,status:()=>({...service}),
    parsePlist:()=>({}),buildYoutubeExtractionWorkerInstallPlan:()=>({plist_preview:'fixture launcher'}),preserveYoutubeResolutionLauncherEnvironment:()=>read(PLIST),
    lstatSync:(path:string)=>({isFile:()=>true,isSymbolicLink:()=>false,uid:process.getuid!(),mode:0o600,size:read(path).length}),
    stable:async()=>({pid:service.pid,secondPid:service.pid}),
    command:(_bin:string,args:string[])=>{if(args[0]==='bootstrap'){if(failBootstrap){failBootstrap=false;throw Error('fixture bootstrap failed');}Object.assign(service,{loaded:true,state:'running',pid:234});}
      else if(args[0]==='bootout')Object.assign(service,{loaded:false,state:'unloaded',pid:0});return '';},
    transaction:async(_c:unknown,callback:(tx:{observe:()=>Promise<typeof observed>,query:(sql:string)=>Promise<string>})=>unknown)=>callback({observe:async()=>observed,query:async(sql:string)=>{
      if(!sql.includes('UPDATE private.youtube_extraction_current_policy SET enabled='))throw Error('unexpected fixture mutation');
      if(failEnable){failEnable=false;throw Error('fixture enable failed');}
      observed.policy.enabled=sql.includes('enabled=true');observed.full.fingerprintPolicy.enabled=observed.policy.enabled;observed.worker.workerPolicyEnabled=observed.policy.enabled;return '';
    }}),
    check:contract.v85Check,sha:contract.v85Hash,zero:contract.v85Zero,preserved:contract.assertV85Preserved,
    assertV85Successor:contract.assertV85Successor,assertV85ActivatedRuntime:contract.assertV85ActivatedRuntime,
    assertV85After:contract.assertV85After,
    classifyV85Registration:contract.classifyV85Registration,
    json:(path:string)=>JSON.parse(read(path).toString()),readFileSync:read,readClosedR2PrivateBytes:read,existsSync:(path:string)=>files.has(path),
    claims:()=>f.claims,verifyV85IssuedToken:({metadata}:{metadata:unknown})=>contract.assertV85WorkerCredential({claims:f.claims,metadata,now}),
    readV85Approval:()=>contract.v85Hash(read(join(OP,'activation.json'))),registerV85Approval:writes,
    privateCreate:(path:string,bytes:string)=>{writes(path);put(path,bytes);},
    publish:(name:string,value:unknown)=>{writes(name);put(join(OP,name),value);return contract.v85Hash(read(join(OP,name)));},
    readSnapshot:async()=>observed,observation:async()=>observed,webReady:vi.fn(()=>({releaseSha:f.plan.webRef,plistSha256:h})),candidate:vi.fn(async()=>({codexCliVersion:'fixture'})),
    verifyClosedR2Control:vi.fn(),loadClosedR2Review:vi.fn(),verifyInstalled:vi.fn(async()=>({authenticatedStatus:200,emptyClaimDenied:true,ready:true,pid:service.pid,secondPid:service.pid})),
  };
  const source=readFileSync('scripts/youtube-v85-controlled-cutover.mjs','utf8');
  const closure=source.slice(source.indexOf('async function adapters(c,authority) {'),source.indexOf('\nasync function main() {'));
  const build=new Function(...Object.keys(deps),closure+';return adapters;')(...Object.values(deps));
  return {a:await build(c,{plan:f.plan,planSha256:h}),files,writes,OP,P,service,observed,deps,
    failNextBootstrap:()=>{failBootstrap=true;},failNextEnable:()=>{failEnable=true;}};
}
describe('actual v85 adapter read-only reconciliation',()=>{
  it('reconciles, resumes and verifies an activated runtime with zero filesystem or approval writes',async()=>{
    const {a,writes}=await adapterFixture();
    expect((await a.reconcile()).result).toMatchObject({state:'activated',readOnly:true,postActivationJobs:1});
    expect(await a.resumePreflight()).toEqual({activated:true});
    expect(await a.verifyActivated()).toMatchObject({activated:true,readOnly:true});
    expect(writes).not.toHaveBeenCalled();
  });
  it.each(['credential','receipt'])('rejects incomplete %s evidence without repairing it',async missing=>{
    const {a,files,writes,OP,P}=await adapterFixture(false);
    files.delete(missing==='credential'?P.credential:join(OP,'issued.json'));
    await expect(a.reconcile()).rejects.toThrow('incomplete issuance evidence');
    expect(writes).not.toHaveBeenCalled();
  });
  it('only repairs a missing registered receipt when explicitly requested by user resume',async()=>{
    const {a,writes}=await adapterFixture(false);
    expect((await a.reconcile()).result.state).toBe('registered');
    expect(writes).not.toHaveBeenCalled();
    expect((await a.reconcile({repair:true})).result.state).toBe('registered');
    expect(writes.mock.calls).toEqual([['registration.json']]);
  });
});
describe('actual registered50 adapter recovery without issuance or CAS',()=>{
  it.each([false,true])('keeps completed activation verification read-only even when health fails=%s',async fails=>{
    const f=await adapterFixture(true,true),contain=vi.spyOn(f.a,'containFailure'),cleanup=vi.spyOn(f.a,'removeManager');
    if(fails)f.deps.verifyInstalled.mockRejectedValueOnce(Error('fixture health failed'));
    if(fails)await expect(resumeRegisteredV85Cutover(f.a)).rejects.toThrow('fixture health failed');
    else expect(await resumeRegisteredV85Cutover(f.a)).toMatchObject({activated:true,readOnly:true});
    expect(f.writes).not.toHaveBeenCalled();expect(contain).not.toHaveBeenCalled();expect(cleanup).not.toHaveBeenCalled();expect(f.observed.policy.enabled).toBe(true);
  });
  it('recovers a committed registration receipt and completes existing50 install/verify/ON/seal',async()=>{
    const {a,files,OP,P,service}=await adapterFixture(false,true),original=Buffer.from(files.get(P.token)!);
    expect((await a.reconcile()).result.state).toBe('registered');expect(files.has(join(OP,'registration.json'))).toBe(false);
    expect(await resumeRegisteredV85Cutover(a)).toMatchObject({activated:true,generation:50,modelCalls:0});
    expect(files.get(P.token)).toEqual(original);expect(service.loaded).toBe(true);expect(files.has(join(OP,'activation.json'))).toBe(true);
  });
  it.each(['quiesce','issueWorker','issueManager','register'])('hard-denies %s before effects',async name=>{
    const {a,writes}=await adapterFixture(false,true);await expect(a[name]()).rejects.toThrow('forbids quiesce/issuance/registration');expect(writes).not.toHaveBeenCalled();
  });
  it.each(['credential','receipt'])('does not reconstruct missing issued %s evidence',async missing=>{
    const {a,files,writes,OP,P}=await adapterFixture(false,true);files.delete(missing==='credential'?P.credential:join(OP,'issued.json'));
    await expect(a.registeredResumePreflight()).rejects.toThrow('incomplete issuance evidence');expect(writes).not.toHaveBeenCalled();
    await expect(a.reconcile({repair:true})).rejects.toThrow('never reconstructs');
  });
  it.each(['bootstrap','enable'])('resumes the same50 after %s failure without new issuance',async point=>{
    const f=await adapterFixture(false,true),original=Buffer.from(f.files.get(f.P.token)!);
    if(point==='bootstrap')f.failNextBootstrap();else f.failNextEnable();
    await expect(resumeRegisteredV85Cutover(f.a)).rejects.toThrow('fixture');
    expect(f.observed.policy.enabled).toBe(false);expect(f.files.get(f.P.token)).toEqual(original);
    expect(await resumeRegisteredV85Cutover(f.a)).toMatchObject({activated:true,generation:50});expect(f.files.get(f.P.token)).toEqual(original);
  });
});
