import { describe,it,expect,vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import * as contract from '../scripts/lib/youtube-v85-cutover.mjs';
import { V74_ACTIVATION_SHA256 } from '../scripts/lib/prelaunch-youtube-v74-cutover.mjs';
import { fixture,h,now } from './fixtures/youtube-v85-cutover.fixture';

// Execute the actual adapter closure against an in-memory filesystem. No operating
// files, database, Keychain, tokens, launch services or network are accessed.
async function adapterFixture(activated=true) {
  const f=fixture(),OP='/fixture/op',P={secrets:'/fixture/secrets',token:'/fixture/token',credential:'/fixture/credential'},PLIST='/fixture/launcher';
  const files=new Map<string,Buffer>(),writes=vi.fn();
  const put=(path:string,value:unknown)=>files.set(path,Buffer.from(typeof value==='string'?value:JSON.stringify(value)));
  const read=(path:string)=>{const bytes=files.get(path);if(!bytes)throw new Error('fixture missing file');return bytes;};
  put(PLIST,'fixture launcher');f.proof.service.plistSha256=contract.v85Hash(read(PLIST));
  put(P.token,'fixture token\n');put(P.credential,f.metadata);
  put('/fixture/.homecook/secrets/full-local-supabase/jwt_keys',[]);
  put(join(OP,'issue-intent.json'),{planSha256:h,generation:50,releaseSha:contract.V85.releaseSha,expiresAt:contract.V85.expiresAt});
  put(join(OP,'issued.json'),{planSha256:h,tokenSha256:contract.v85Hash(read(P.token)),metadataSha256:contract.v85Hash(read(P.credential))});
  put(join(OP,'quiesced.json'),f.off);
  put(join(OP,'registration-intent.json'),{planSha256:h,metadataSha256:contract.v85Hash(read(P.credential)),beforeSha256:contract.v85Hash(read(join(OP,'quiesced.json'))),before:f.off});
  if(activated)put(join(OP,'activation.json'),f.proof);
  const observed=structuredClone(activated?f.proof.after:f.after);
  if(activated){Object.assign(observed,{jobCount:43,originalJobsSha256:h});}
  const c={origin:f.origin,predecessor:f.plan.before.worker,legacy:{fingerprintRecovery:{...f.recovery,receipt:{after:{policy:f.plan.before.full.fingerprintPolicy}}}}};
  const deps={OP,P,PLIST,ROOT:'/fixture',HOME:'/fixture',join,isDeepStrictEqual,V:contract.V85,V74_ACTIVATION_SHA256,
    check:contract.v85Check,sha:contract.v85Hash,zero:contract.v85Zero,preserved:contract.assertV85Preserved,
    assertV85Successor:contract.assertV85Successor,assertV85ActivatedRuntime:contract.assertV85ActivatedRuntime,
    classifyV85Registration:contract.classifyV85Registration,
    json:(path:string)=>JSON.parse(read(path).toString()),readFileSync:read,readClosedR2PrivateBytes:read,existsSync:(path:string)=>files.has(path),
    claims:()=>f.claims,verifyV85IssuedToken:({metadata}:{metadata:unknown})=>contract.assertV85WorkerCredential({claims:f.claims,metadata,now}),
    readV85Approval:()=>contract.v85Hash(read(join(OP,'activation.json'))),registerV85Approval:writes,
    privateCreate:(path:string,bytes:string)=>{writes(path);put(path,bytes);},
    publish:(name:string,value:unknown)=>{writes(name);put(join(OP,name),value);return contract.v85Hash(read(join(OP,name)));},
    readSnapshot:async()=>observed,observation:async()=>observed,webReady:vi.fn(),candidate:vi.fn(),
    verifyClosedR2Control:vi.fn(),loadClosedR2Review:vi.fn(),verifyInstalled:vi.fn(),
  };
  const source=readFileSync('scripts/youtube-v85-controlled-cutover.mjs','utf8');
  const closure=source.slice(source.indexOf('async function adapters(c,authority) {'),source.indexOf('\nasync function main() {'));
  const build=new Function(...Object.keys(deps),closure+';return adapters;')(...Object.values(deps));
  return {a:await build(c,{plan:f.plan,planSha256:h}),files,writes,OP,P};
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
