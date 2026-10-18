import {describe,it,expect,vi} from 'vitest';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
const {fixtureHashOverrides}=vi.hoisted(()=>({fixtureHashOverrides:new Map<string,string>()}));
// The immutable real-world prior hash cannot be produced from synthetic fixtures.
// Override only the exact pretty-printed prior fixture bytes; all other hashing is real.
vi.mock('node:crypto',async importOriginal=>{
  const actual=await importOriginal<typeof import('node:crypto')>();
  return {...actual,createHash:(algorithm:string)=>{
    const hash=actual.createHash(algorithm);let input='';
    const proxy=new Proxy(hash,{get(target,key){
      if(key==='update')return (value:string|Buffer)=>{input+=value.toString();target.update(value);return proxy;};
      if(key==='digest')return (encoding?:import('node:crypto').BinaryToTextEncoding)=>{
        const override=fixtureHashOverrides.get(input);
        if(override){const bytes=Buffer.from(override,'hex');return encoding?bytes.toString(encoding):bytes;}
        return encoding?target.digest(encoding):target.digest();
      };
      const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
    }});return proxy;
  }};
});
import {fixture,h,other,now} from './fixtures/youtube-v85-cutover.fixture';
import {V85_AUTH_SUCCESSOR as A,V85_AUTH_TABLES,v85Hash,v85AuthTableProjection,v85ContinuationDataDeltas,
  assertV85ExecutionPlan,assertV85AuthSuccessorTool,assertV85Preserved,v85RotationBridgeAuthority,readV85ExecutionApproval,v85Check} from '../scripts/lib/youtube-v85-cutover.mjs';
import {assertRotationBridgeToolBinding} from '../scripts/lib/round2-closed-marker-rotation-bridge.mjs';
import {confirmV85ReviewedOperation,readV85ConfirmedPlan,assertV85ConfirmedHash} from '../scripts/youtube-v85-controlled-cutover.mjs';

function successorFixture(){
  const original=fixture().plan;Object.assign(original.before.full,{ledgerPreservedRowsSha256:h});
  const before={...structuredClone(original.before),jobCount:43,jobsSha256:other,originalJobsSha256:h,approvedJobsSha256:other};
  const sources={...original.sources,'scripts/lib/round2-eight-key-rotation-fence.mjs':[null,other]};
  const tables:Record<string,{count:number|null,sha256?:string,absent?:true}>=Object.fromEntries(V85_AUTH_TABLES.map(t=>[t,{count:t==='auth.users'?7:1,sha256:h}]));
  before.full.preservedRowsSha256=v85AuthTableProjection(tables,before.full);
  const prior={...structuredClone(original),schema:'homecook.youtube-v85-continuation-plan.v1',webRef:String(A.target),originalPlan:original,before,sources,
    round2Binding:{marker:{version:1,fenceSha256:h,candidatePlistSha256:h,stageReceiptSha256:h,collectionEnabled:false,leadEnabled:false,reactivationReady:false},fenceSha256:h,controlSha256:h},
    continuation:{schema:'homecook.youtube-v85-continuation.v1',originalPlanSha256:h,originalCanonicalSha256:v85Hash(JSON.stringify(original)),
      sourceDelta:{'scripts/lib/round2-eight-key-rotation-fence.mjs':[null,other]},requiresExplicitUnattributedDataAcknowledgement:true,rawBeforeImagesAvailable:false,
      classification:'unattributed-prior-auth-normal-and-extra-job',dataDeltas:v85ContinuationDataDeltas(original,before)}};
  const currentTables=structuredClone(tables);currentTables['auth.users'].sha256=other;
  const current=structuredClone(prior);current.before.full.preservedRowsSha256=v85AuthTableProjection(currentTables,current.before.full);
  current.continuation.dataDeltas=v85ContinuationDataDeltas(original,current.before);
  const toolSources:Record<string,(string|null)[]>=Object.fromEntries(['scripts/youtube-v85-controlled-cutover.mjs','scripts/lib/youtube-v85-cutover.mjs',
    'scripts/lib/youtube-v85-approval.mjs','scripts/lib/round2-closed-marker-rotation-bridge.mjs','tests/youtube-v85-auth-successor.test.ts',
    'scripts/deploy-prelaunch-web.mjs','scripts/lib/prelaunch-web-deploy.mjs','tests/round2-closed-marker-rotation-bridge.test.mjs'].map(p=>[p,[null,h]]));
  return {...current,authSuccessor:{schema:'homecook.youtube-v85-auth-successor.v1',priorPlan:prior,priorPlanSha256:String(A.priorSha256),
    priorCanonicalSha256:v85Hash(JSON.stringify(prior)),requiresExplicitUnattributedAuthAcknowledgement:true,rawBeforeImagesAvailable:false,
    classification:'unattributed-auth-row-change',toolRef:'e'.repeat(40),toolSources,
    tableEvidence:{priorComponentsReconstructed:true,rawRowsAvailable:false,priorTables:tables,currentTables}}};
}
type Plan=ReturnType<typeof successorFixture>;
describe('one create-only exact auth successor with both prior authorities preserved',()=>{
  it('accepts a complete reconstructed prior projection and current auth-only table delta without mutation',()=>{
    const p=successorFixture(),bytes=JSON.stringify(p);expect(assertV85ExecutionPlan(p,now)).toBe(p);expect(JSON.stringify(p)).toBe(bytes);
    expect(p.before.originalJobsSha256).toBe(p.originalPlan.before.jobsSha256);expect(p.before.jobCount).toBe(43);
  });
  const mutations:Record<string,(p:Plan)=>void>={
    priorHash:p=>{p.authSuccessor.priorPlanSha256=other;},priorCanonical:p=>{p.authSuccessor.priorCanonicalSha256=other;},
    recursive:p=>{Object.assign(p.authSuccessor.priorPlan,{authSuccessor:{}});},unacknowledged:p=>{p.authSuccessor.requiresExplicitUnattributedAuthAcknowledgement=false;},
    rawBefore:p=>{p.authSuccessor.rawBeforeImagesAvailable=true;},normalLabel:p=>{p.authSuccessor.classification='normal-refresh';},
    wrongTarget:p=>{p.webRef='f'.repeat(40);},worker:p=>{p.before.worker.credentialRowSha256=other;},jobs:p=>{p.before.jobsSha256=h;},
    service:p=>{p.beforeService.configSha256=other;},normal:p=>{p.before.full.normalDataSha256=other;p.before.normalDataSha256=other;},
    delta:p=>{p.continuation.dataDeltas=[];},unknownField:p=>{Object.assign(p,{futureAuthAllowed:true});},
    omitted:p=>{Reflect.deleteProperty(p.authSuccessor.tableEvidence.currentTables,'auth.identities');},
    ordered:p=>{const t=p.authSuccessor.tableEvidence.currentTables;p.authSuccessor.tableEvidence.currentTables=Object.fromEntries(Object.entries(t).reverse());},
    changedOther:p=>{p.authSuccessor.tableEvidence.currentTables['auth.identities'].sha256=other;},
    population:p=>{p.authSuccessor.tableEvidence.currentTables['auth.users'].count=8;},
    forgedPrior:p=>{p.authSuccessor.tableEvidence.priorTables['auth.users'].sha256=other;},
    noAuthChange:p=>{p.authSuccessor.tableEvidence.currentTables['auth.users'].sha256=h;},
    pretendingSnapshot:p=>{p.authSuccessor.tableEvidence.priorComponentsReconstructed=false;},
    toolProduct:p=>{p.authSuccessor.toolSources['lib/auth/unrelated.ts']=[null,h];},
    toolDependency:p=>{p.authSuccessor.toolSources['package.json']=[h,other];},
    toolOmitted:p=>{Reflect.deleteProperty(p.authSuccessor.toolSources,'scripts/lib/youtube-v85-approval.mjs');},
    toolDeletion:p=>{p.authSuccessor.toolSources['scripts/lib/youtube-v85-approval.mjs']=[h,null];},
  };
  for(const [label,mutate]of Object.entries(mutations))it('rejects '+label,()=>{const p=successorFixture();mutate(p);expect(()=>assertV85ExecutionPlan(p,now)).toThrow();});
  it('keeps all current auth fields in future execution comparisons',()=>{
    const p=successorFixture(),after=structuredClone(p.before);after.full.preservedRowsSha256=h;
    expect(()=>assertV85Preserved(p.before,after)).toThrow('complete protected projection');
  });
  it('binds the actual tool and complete finite source delta independently from web15',()=>{
    const p=successorFixture(),input={plan:p,toolRef:p.authSuccessor.toolRef,digests:p.authSuccessor.toolSources,clean:true,untrackedPaths:[] as string[],ownRepository:true};
    expect(()=>assertV85AuthSuccessorTool(input,now)).not.toThrow();
    for(const change of [{toolRef:'f'.repeat(40)},{digests:{}},{clean:false},{untrackedPaths:['scripts/untracked.mjs']},{ownRepository:false}])
      expect(()=>assertV85AuthSuccessorTool({...input,...change},now)).toThrow();
  });
  it('uses old capsule only for historical rotation proof while displaying the new execution capsule',()=>{
    const p=successorFixture(),authority={plan:p,planSha256:h};
    expect(v85RotationBridgeAuthority(authority,now)).toEqual({plan:p.authSuccessor.priorPlan,planSha256:A.priorSha256});
    const binding={toolRef:p.authSuccessor.toolRef,requestedToolRef:p.authSuccessor.toolRef,targetRef:A.target,capsuleSha256:h,
      authority,clean:true,ownRepository:true,digests:p.authSuccessor.toolSources,untrackedPaths:[]};
    expect(assertRotationBridgeToolBinding(binding).capsuleSha256).toBe(h);
    expect(assertRotationBridgeToolBinding(binding).historicalCapsuleSha256).toBe(A.priorSha256);
    expect(()=>assertRotationBridgeToolBinding({...binding,capsuleSha256:A.priorSha256})).toThrow();
  });
  it('shows unknown changed columns/actor and all fixed bounds before an exact user TTY confirmation',async()=>{
    const p=successorFixture(),events:unknown[]=[],confirm=vi.fn(async()=>{events.push('confirm');return 'V85-GEN50';});
    await confirmV85ReviewedOperation('approve-plan',Buffer.from(JSON.stringify(p)),{platform:'darwin',stdinTTY:true,stdoutTTY:true,stderrTTY:true},(v:unknown)=>events.push(v),confirm);
    expect(events[2]).toMatchObject({toolRef:p.authSuccessor.toolRef,priorCapsuleSha256:A.priorSha256});expect(events.at(-1)).toBe('confirm');
    await expect(confirmV85ReviewedOperation('approve-plan',Buffer.from(JSON.stringify(p)),{platform:'darwin',stdinTTY:false,stdoutTTY:true,stderrTTY:true},()=>{},confirm)).rejects.toThrow();
  });
  it('retains real anchor reads, same-snapshot evidence and fresh complete checks before create-only approval',()=>{
    const source=readFileSync('scripts/youtube-v85-controlled-cutover.mjs','utf8'),contract=readFileSync('scripts/lib/youtube-v85-cutover.mjs','utf8');
    expect(source).toContain('readSnapshot(c,true)');expect(source).toContain('preserved(review.before,fresh)');
    expect(source.indexOf('assertV85UserTerminal(boundary)',source.indexOf('async function main()'))).toBeLessThan(source.indexOf('registerV85Approval(arg2,V85_AUTH_SUCCESSOR.account)'));
    expect(contract).toContain("readApproval('approved-continuation-sha256')===planSha256");
    expect(contract).toContain('readApproval(V85_AUTH_SUCCESSOR.account)===nextSha256');
  });
  it('actually reads all three independent anchors and rejects every missing/mismatched anchor and tampered nested prior',()=>{
    const dir=mkdtempSync('/tmp/v85-auth-successor-loader-');
    try{
      const p=successorFixture(),originalBytes=Buffer.from(JSON.stringify(p.originalPlan));
      const originalHash=v85Hash(originalBytes);
      p.continuation.originalPlanSha256=originalHash;p.authSuccessor.priorPlan.continuation.originalPlanSha256=originalHash;
      p.authSuccessor.priorCanonicalSha256=v85Hash(JSON.stringify(p.authSuccessor.priorPlan));
      const priorBytes=Buffer.from(JSON.stringify(p.authSuccessor.priorPlan,null,2)+'\n');
      fixtureHashOverrides.set(priorBytes.toString(),A.priorSha256);
      const nextBytes=Buffer.from(JSON.stringify(p,null,2)+'\n'),nextHash=v85Hash(nextBytes);
      for(const [name,bytes]of [['plan.json',originalBytes],['continuation-plan.json',priorBytes],[A.filename,nextBytes]] as const)
        writeFileSync(join(dir,name),bytes,{mode:0o600,flag:'wx'});
      const anchors=new Map([['approved-plan-sha256',originalHash],['approved-continuation-sha256',A.priorSha256],[A.account,nextHash]]);
      const readApproval=vi.fn((account='approved-plan-sha256')=>{const value=anchors.get(account);if(!value)throw Error('fixture missing anchor');return value;});
      const load=()=>readV85ExecutionApproval((path:string)=>readFileSync(path),readApproval,dir,now);
      expect(load()?.planSha256).toBe(nextHash);expect(readApproval.mock.calls.map(c=>c[0]??'approved-plan-sha256')).toEqual([...anchors.keys()]);
      for(const account of [...anchors.keys()]){
        const value=anchors.get(account)!;anchors.delete(account);expect(load).toThrow();
        anchors.set(account,'f'.repeat(64));expect(load).toThrow();anchors.set(account,value);
      }
      p.authSuccessor.priorPlan.beforeService.pid++;
      const changed=Buffer.from(JSON.stringify(p,null,2)+'\n');writeFileSync(join(dir,A.filename),changed);anchors.set(A.account,v85Hash(changed));
      expect(load).toThrow();expect(readFileSync(join(dir,'plan.json'))).toEqual(originalBytes);expect(readFileSync(join(dir,'continuation-plan.json'))).toEqual(priorBytes);
    }finally{fixtureHashOverrides.clear();rmSync(dir,{recursive:true,force:true});}
  });
  it('binds the confirmed bytes to approve/apply/resume and rejects changed, replaced or deleted files before writes',async()=>{
    const p=successorFixture(),path='/fixture/review.json',original=Buffer.from(JSON.stringify(p));
    const files=new Map([[path,original]]),write=vi.fn(),read=(key:string)=>{const bytes=files.get(key);if(!bytes)throw Error('fixture removed');return bytes;};
    const reviewed=await confirmV85ReviewedOperation('approve-plan',original,{platform:'darwin',stdinTTY:true,stdoutTTY:true,stderrTTY:true},()=>{},async()=> 'V85-GEN50');
    expect(readV85ConfirmedPlan(path,v85Hash(original),reviewed,read)).toEqual(original);
    for(const bytes of [Buffer.from(JSON.stringify({...p,unreviewed:true})),Buffer.from(JSON.stringify(successorFixture())+'\n')]){
      files.set(path,bytes);expect(()=>{readV85ConfirmedPlan(path,v85Hash(bytes),reviewed,read);write();}).toThrow('capsule changed');
    }
    files.delete(path);expect(()=>{readV85ConfirmedPlan(path,reviewed,reviewed,read);write();}).toThrow();
    expect(()=>{assertV85ConfirmedHash(reviewed,other);write();}).toThrow('capsule changed');expect(write).not.toHaveBeenCalled();
    const source=readFileSync('scripts/youtube-v85-controlled-cutover.mjs','utf8');
    expect(source).toContain('assertV85ConfirmedHash(userReviewedSha256,authority.planSha256)');
    const web=readFileSync('scripts/deploy-prelaunch-web.mjs','utf8');
    expect(web).toContain("if(action!=='deploy'){await verifyV85AuthSuccessorWebBoundary(authority)");
    expect(web).toContain('confirmedAuthority?.planSha256!==review.capsuleSha256');
    expect(web).toContain('await verifyV85AuthSuccessorWebBoundary(confirmedAuthority)');
    expect(web.indexOf("await reviewRotationBridgeTool('check',options)")).toBeLessThan(web.indexOf('await switchWeb(nextBytes)'));
  });
  it('executes the actual web boundary helper against isolated memory and refuses auth drift, issued files, activation or fence changes',async()=>{
    const p=successorFixture(),fresh=structuredClone(p.before),files=new Set<string>(),snapshot=vi.fn(async()=>fresh);
    let binding=p.round2Binding;
    const deps={P:{token:'/fixture/token',credential:'/fixture/credential',secrets:'/fixture/secrets'},OP:'/fixture/op',join,
      existsSync:(path:string)=>files.has(path),check:v85Check,assertAuthTool:()=>{},context:async()=>({}),readSnapshot:snapshot,
      assertBefore:()=>{},preserved:assertV85Preserved,isDeepStrictEqual,sha:()=>h,readFileSync:()=>Buffer.from('fixture launcher'),
      PLIST:'/fixture/launcher',round2Binding:()=>binding};
    const source=readFileSync('scripts/youtube-v85-controlled-cutover.mjs','utf8');
    const closure=source.slice(source.indexOf('function assertAuthSuccessorUnissued(){'),source.indexOf('\nfunction sourceDigests(ref)'))
      .replace('export async function verifyV85AuthSuccessorWebBoundary','async function verifyV85AuthSuccessorWebBoundary');
    const verify=new Function(...Object.keys(deps),closure+';return verifyV85AuthSuccessorWebBoundary;')(...Object.values(deps));
    const authority={plan:p,planSha256:h};await expect(verify(authority)).resolves.toBeUndefined();
    fresh.full.preservedRowsSha256=h;await expect(verify(authority)).rejects.toThrow('complete protected projection');
    fresh.full.preservedRowsSha256=p.before.full.preservedRowsSha256;
    fresh.jobCount=44;await expect(verify(authority)).rejects.toThrow('job count');fresh.jobCount=43;
    for(const file of ['/fixture/token','/fixture/credential','/fixture/secrets/manager-v85-gen50.jwt','/fixture/op/issued.json','/fixture/op/backup.json']){
      files.add(file);const reads=snapshot.mock.calls.length;await expect(verify(authority)).rejects.toThrow('partial gen50 attempt');
      expect(snapshot.mock.calls).toHaveLength(reads);files.clear();
    }
    await expect(verify({...authority,proof:{}})).rejects.toThrow('only before gen50 activation');
    binding={...binding,controlSha256:other};await expect(verify(authority)).rejects.toThrow('new8/fence/OFF');
    expect(files.size).toBe(0);
  });
});
