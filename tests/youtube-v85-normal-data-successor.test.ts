import {describe,it,expect,vi} from 'vitest';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
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
import {V85_AUTH_SUCCESSOR as A,V85_AUTH_TABLES,V85_DATA_SUCCESSOR as D,v85Hash,v85AuthTableProjection,v85ContinuationDataDeltas,
  assertV85ExecutionPlan,assertV85DataSuccessorTool,v85DataPredecessor,assertV85Preserved,v85RotationBridgeAuthority,readV85ExecutionApproval} from '../scripts/lib/youtube-v85-cutover.mjs';
import {V85_NORMAL_TABLES} from '../scripts/lib/youtube-v85-normal-data-evidence.mjs';
import {confirmV85ReviewedOperation} from '../scripts/youtube-v85-controlled-cutover.mjs';
import {assertRotationBridgeToolBinding} from '../scripts/lib/round2-closed-marker-rotation-bridge.mjs';
function authFixture(){
  const original=fixture().plan;Object.assign(original.before.full,{ledgerPreservedRowsSha256:h});
  const before={...structuredClone(original.before),normalDataSha256:String(D.priorNormalSha256),jobCount:43,jobsSha256:other,originalJobsSha256:h,approvedJobsSha256:other};
  before.full.normalDataSha256=D.priorNormalSha256;
  const sources={...original.sources,'scripts/lib/round2-eight-key-rotation-fence.mjs':[null,other]};
  const tables:Record<string,{count:number|null,sha256?:string,absent?:true}>=Object.fromEntries(V85_AUTH_TABLES.map(t=>[t,{count:t==='auth.users'?7:1,sha256:h}]));
  before.full.preservedRowsSha256=v85AuthTableProjection(tables,before.full);
  const prior={...structuredClone(original),schema:'homecook.youtube-v85-continuation-plan.v1',webRef:String(A.target),originalPlan:original,before,sources,
    round2Binding:{marker:{version:1,fenceSha256:h,candidatePlistSha256:h,stageReceiptSha256:h,collectionEnabled:false,leadEnabled:false,reactivationReady:false},fenceSha256:h,controlSha256:h},
    continuation:{schema:'homecook.youtube-v85-continuation.v1',originalPlanSha256:h,originalCanonicalSha256:v85Hash(JSON.stringify(original)),
      sourceDelta:{'scripts/lib/round2-eight-key-rotation-fence.mjs':[null,other]},requiresExplicitUnattributedDataAcknowledgement:true,rawBeforeImagesAvailable:false,
      classification:'unattributed-prior-auth-normal-and-extra-job',dataDeltas:v85ContinuationDataDeltas(original,before)}};
  const currentTables=structuredClone(tables);currentTables['auth.users'].sha256=other;
  const current=structuredClone(prior);
  const rowHash=v85Hash(JSON.stringify(V85_AUTH_TABLES.map(t=>[t,currentTables[t].sha256])));
  fixtureHashOverrides.set(JSON.stringify([rowHash,D.priorNormalSha256,h]),D.priorPreservedSha256);
  current.before.full.preservedRowsSha256=v85AuthTableProjection(currentTables,current.before.full);
  current.continuation.dataDeltas=v85ContinuationDataDeltas(original,current.before);
  const toolSources:Record<string,(string|null)[]>=Object.fromEntries(['scripts/youtube-v85-controlled-cutover.mjs','scripts/lib/youtube-v85-cutover.mjs',
    'scripts/lib/youtube-v85-approval.mjs','scripts/lib/round2-closed-marker-rotation-bridge.mjs','tests/youtube-v85-auth-successor.test.ts',
    'scripts/deploy-prelaunch-web.mjs','scripts/lib/prelaunch-web-deploy.mjs','tests/round2-closed-marker-rotation-bridge.test.mjs'].map(p=>[p,[null,h]]));
  return {...current,authSuccessor:{schema:'homecook.youtube-v85-auth-successor.v1',priorPlan:prior,priorPlanSha256:String(A.priorSha256),
    priorCanonicalSha256:v85Hash(JSON.stringify(prior)),requiresExplicitUnattributedAuthAcknowledgement:true,rawBeforeImagesAvailable:false,
    classification:'unattributed-auth-row-change',toolRef:'e'.repeat(40),toolSources,
    tableEvidence:{priorComponentsReconstructed:true,rawRowsAvailable:false,priorTables:tables,currentTables}}};
}
function dataFixture(){
  const prior=authFixture();fixtureHashOverrides.set(JSON.stringify(prior),D.priorCanonicalSha256);
  const tables=V85_NORMAL_TABLES.map(table=>({table,count:0,sha256:h}));
  const canonical='['+tables.map(e=>`["${e.table}", "${e.sha256}"]`).join(', ')+']';
  fixtureHashOverrides.set(canonical,D.acceptedNormalSha256);
  fixtureHashOverrides.set(JSON.stringify(tables),D.acceptedTablesSha256);
  const p=structuredClone(prior);p.before.normalDataSha256=D.acceptedNormalSha256;p.before.full.normalDataSha256=D.acceptedNormalSha256;
  p.before.full.preservedRowsSha256=v85AuthTableProjection(prior.authSuccessor.tableEvidence.currentTables,p.before.full);
  p.continuation.dataDeltas=v85ContinuationDataDeltas(p.originalPlan,p.before);
  const toolSources=Object.fromEntries(['scripts/youtube-v85-controlled-cutover.mjs','scripts/lib/youtube-v85-cutover.mjs','scripts/lib/youtube-v85-approval.mjs',
    'scripts/lib/youtube-v85-normal-data-evidence.mjs','tests/youtube-v85-normal-data-successor.test.ts','tests/youtube-v85-normal-data-evidence.test.ts'].map(path=>[path,[null,h]]));
  return {...p,dataSuccessor:{schema:'homecook.youtube-v85-normal-data-successor.v1',priorPlanSha256:String(D.priorSha256),priorCanonicalSha256:String(D.priorCanonicalSha256),
    classification:'unattributed-normal-data-change',requiresExplicitUnattributedNormalDataAcknowledgement:true,rawBeforeImagesAvailable:false,priorPerTableImagesAvailable:false,
    tables,toolBase:String(D.toolBase),toolRef:'d'.repeat(40),toolSources}};
}
type Data=ReturnType<typeof dataFixture>;
describe('one bounded unattributed normal-data successor',()=>{
  it('reconstructs exact d397 and validates original/auth rules without changing historical capsules',()=>{
    const p=dataFixture(),prior=v85DataPredecessor(p),bytes=JSON.stringify(p);
    expect(assertV85ExecutionPlan(p,now)).toBe(p);expect(JSON.stringify(p)).toBe(bytes);expect(prior).toEqual(authFixture());
    expect(v85RotationBridgeAuthority({plan:p,planSha256:h},now).planSha256).toBe(A.priorSha256);
  });
  const mutations:Record<string,(p:Data)=>void>={
    unknown:p=>{Object.assign(p,{newPermission:true});},recursive:p=>{Object.assign(p.dataSuccessor,{priorPlan:p});},
    acknowledge:p=>{p.dataSuccessor.requiresExplicitUnattributedNormalDataAcknowledgement=false;},
    classification:p=>{p.dataSuccessor.classification='normal-telemetry';},raw:p=>{p.dataSuccessor.rawBeforeImagesAvailable=true;},
    inventedPriorTableImages:p=>{p.dataSuccessor.priorPerTableImagesAvailable=true;},priorSha:p=>{p.dataSuccessor.priorPlanSha256=other;},
    priorCanonical:p=>{p.dataSuccessor.priorCanonicalSha256=other;},normal:p=>{p.before.normalDataSha256=other;},
    fullNormal:p=>{p.before.full.normalDataSha256=other;},preserved:p=>{p.before.full.preservedRowsSha256=other;},
    jobs:p=>{p.before.jobsSha256=h;},jobCount:p=>{p.before.jobCount=44;},worker:p=>{p.before.worker.credentialGeneration=51;},
    auth:p=>{p.authSuccessor.tableEvidence.currentTables['auth.users'].sha256=h;},policy:p=>{p.before.policy.enabled=false;},
    expiry:p=>{p.expiresAt='2026-10-23T14:27:30Z';},source:p=>{p.webRef='f'.repeat(40);},service:p=>{p.beforeService.pid++;},
    tableCount:p=>{p.dataSuccessor.tables[0].count++;},tableOrder:p=>{p.dataSuccessor.tables.reverse();},
    omitted:p=>{p.dataSuccessor.tables.pop();},rowHash:p=>{p.dataSuccessor.tables[0].sha256=other;},
    delta:p=>{p.continuation.dataDeltas=[];},toolBase:p=>{p.dataSuccessor.toolBase='f'.repeat(40);},
    product:p=>{p.dataSuccessor.toolSources['app/page.tsx']=[null,h];},
    missingTool:p=>{Reflect.deleteProperty(p.dataSuccessor.toolSources,'scripts/lib/youtube-v85-approval.mjs');},
  };
  for(const [name,mutate]of Object.entries(mutations))it('rejects '+name,()=>{const p=dataFixture();mutate(p);expect(()=>assertV85ExecutionPlan(p,now)).toThrow();});
  it('continues to reject later data drift and binds the new operational tool, not old d69',()=>{
    const p=dataFixture(),after=structuredClone(p.before);after.normalDataSha256=other;expect(()=>assertV85Preserved(p.before,after)).toThrow();
    const input={plan:p,toolRef:p.dataSuccessor.toolRef,digests:p.dataSuccessor.toolSources,clean:true,ownRepository:true,untrackedPaths:[] as string[]};
    expect(()=>assertV85DataSuccessorTool(input,now)).not.toThrow();
    for(const change of [{toolRef:p.authSuccessor.toolRef},{clean:false},{digests:{}},{untrackedPaths:['untracked']},{ownRepository:false}])
      expect(()=>assertV85DataSuccessorTool({...input,...change},now)).toThrow();
    const bridge=assertRotationBridgeToolBinding({...input,authority:{plan:p,planSha256:h},requestedToolRef:input.toolRef,targetRef:A.target,capsuleSha256:h});
    expect(bridge.historicalCapsuleSha256).toBe(A.priorSha256);
  });
  it('shows the new exact data scope and retains real Terminal confirmation before credential actions',async()=>{
    const p=dataFixture(),events:unknown[]=[],confirm=vi.fn(async()=>{events.push('confirmed');return 'V85-GEN50';});
    await confirmV85ReviewedOperation('approve-plan',Buffer.from(JSON.stringify(p)),{platform:'darwin',stdinTTY:true,stdoutTTY:true,stderrTTY:true},(e:unknown)=>events.push(e),confirm);
    expect(events.at(-2)).toMatchObject({protectedTables:41,normalDataSha256:String(D.acceptedNormalSha256),priorCapsuleSha256:String(D.priorSha256)});
    expect(events.at(-1)).toBe('confirmed');
    await expect(confirmV85ReviewedOperation('apply',Buffer.from(JSON.stringify(p)),{platform:'darwin',stdinTTY:false,stdoutTTY:true,stderrTTY:true},()=>{},confirm)).rejects.toThrow();
  });
  it('reads all four independent anchors and fails closed for every missing/tampered file or anchor',()=>{
    const dir=mkdtempSync('/tmp/v85-data-loader-');
    try{
      const p=dataFixture(),prior=v85DataPredecessor(p);
      const files=[['plan.json',p.originalPlan,'approved-plan-sha256'],['continuation-plan.json',p.authSuccessor.priorPlan,'approved-continuation-sha256'],
        [A.filename,prior,A.account],[D.filename,p,D.account]] as const;
      const raw=new Map<string,Buffer>(),anchors=new Map<string,string>();
      for(const [name,plan,account]of files){const bytes=Buffer.from(JSON.stringify(plan,null,2)+'\n');
        if(name==='continuation-plan.json')fixtureHashOverrides.set(bytes.toString(),A.priorSha256);
        if(name===A.filename)fixtureHashOverrides.set(bytes.toString(),D.priorSha256);
        raw.set(name,bytes);writeFileSync(join(dir,name),bytes,{flag:'wx',mode:0o600});anchors.set(account,v85Hash(bytes));}
      // The original immutable hash is the actual synthetic bytes; propagate it into both nested copies before reserializing.
      const originalHash=anchors.get('approved-plan-sha256')!;
      p.continuation.originalPlanSha256=originalHash;p.authSuccessor.priorPlan.continuation.originalPlanSha256=originalHash;
      const updatedPrior=structuredClone(p);Reflect.deleteProperty(updatedPrior,'dataSuccessor');
      updatedPrior.before.normalDataSha256=D.priorNormalSha256;updatedPrior.before.full.normalDataSha256=D.priorNormalSha256;updatedPrior.before.full.preservedRowsSha256=D.priorPreservedSha256;
      updatedPrior.continuation.dataDeltas=v85ContinuationDataDeltas(updatedPrior.originalPlan,updatedPrior.before);
      updatedPrior.authSuccessor.priorCanonicalSha256=v85Hash(JSON.stringify(updatedPrior.authSuccessor.priorPlan));
      p.authSuccessor.priorCanonicalSha256=updatedPrior.authSuccessor.priorCanonicalSha256;
      fixtureHashOverrides.set(JSON.stringify(updatedPrior),D.priorCanonicalSha256);
      for(const [name,plan,account]of [['continuation-plan.json',p.authSuccessor.priorPlan,'approved-continuation-sha256'],[A.filename,updatedPrior,A.account],[D.filename,p,D.account]] as const){
        const bytes=Buffer.from(JSON.stringify(plan,null,2)+'\n');if(name==='continuation-plan.json')fixtureHashOverrides.set(bytes.toString(),A.priorSha256);if(name===A.filename)fixtureHashOverrides.set(bytes.toString(),D.priorSha256);
        writeFileSync(join(dir,name),bytes);raw.set(name,bytes);anchors.set(account,v85Hash(bytes));}
      writeFileSync(join(dir,D.markerFilename),JSON.stringify({schema:'homecook.youtube-v85-normal-data-publication.v1',planSha256:anchors.get(D.account)}));
      const readApproval=vi.fn((account='approved-plan-sha256')=>{const value=anchors.get(account);if(!value)throw Error('no fixture anchor');return value;});
      const load=()=>readV85ExecutionApproval((path:string)=>readFileSync(path),readApproval,dir,now);
      expect(load()?.planSha256).toBe(anchors.get(D.account));expect(readApproval.mock.calls.map(c=>c[0]??'approved-plan-sha256')).toEqual([...anchors.keys()]);
      for(const [name,,account]of files){const path=join(dir,name),bytes=raw.get(name)!;rmSync(path);expect(load).toThrow();writeFileSync(path,bytes);
        const value=anchors.get(account)!;anchors.delete(account);expect(load).toThrow();anchors.set(account,other);expect(load).toThrow();anchors.set(account,value);}
      expect(readFileSync(join(dir,A.filename))).toEqual(raw.get(A.filename));
      const marker=readFileSync(join(dir,D.markerFilename));rmSync(join(dir,D.markerFilename));expect(load).toThrow('incomplete publication');writeFileSync(join(dir,D.markerFilename),marker);
      rmSync(join(dir,D.filename));rmSync(join(dir,D.markerFilename));expect(load).toThrow('anchor without capsule');
      for(const name of ['plan.json','continuation-plan.json',A.filename]){
        const path=join(dir,name),bytes=readFileSync(path);rmSync(path);expect(load).toThrow('anchor without capsule');writeFileSync(path,bytes);
      }
      anchors.delete(D.account);
      const racing=(account='approved-plan-sha256',optional=false)=>{
        if(account===A.account)writeFileSync(join(dir,D.markerFilename),marker);
        if(optional&&account===D.account)return null;
        const value=anchors.get(account);if(!value)throw Error('missing fixture anchor');return value;
      };
      expect(()=>readV85ExecutionApproval((path:string)=>readFileSync(path),racing,dir,now)).toThrow('partial normal-data publication');
    }finally{rmSync(dir,{recursive:true,force:true});fixtureHashOverrides.clear();}
  });
});
