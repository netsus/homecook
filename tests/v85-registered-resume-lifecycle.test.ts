import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {fixture,h,other} from './fixtures/youtube-v85-cutover.fixture';
import {assertV85WorkerLifecycle} from '../scripts/lib/v85-worker-lifecycle.mjs';
import {runV85Cutover,resumeRegisteredV85Cutover} from '../scripts/youtube-v85-controlled-cutover.mjs';
import {REGISTERED_RESUME as R,registeredResumeFiles,assertRegisteredResumePin} from '../scripts/lib/v85-registered-resume-source.mjs';

function lifecycle(){
  const f=fixture(),service={loaded:true,state:'running',pid:f.plan.beforeService.pid};
  const check=(phase:string,observed:typeof f.plan.before,plistSha256=h)=>assertV85WorkerLifecycle({phase,plan:f.plan,observed,metadata:f.metadata,service,plistSha256,targetPlistSha256:other});
  return {f,service,check};
}
describe('actual orchestration with phase-specific worker guards',()=>{
  it('runs49 -> stopped49 -> registered50/OFF -> installed50 -> verified -> ON, without old PID after registration',async()=>{
    const {f,service,check}=lifecycle(),trace:string[]=[];let current=f.plan.before;
    const a={preflight:async()=>{check('predecessor-running',current);trace.push('49');},assertWebReady:async()=>{},assertUnissued:async()=>{},
      quiesce:async()=>{current=f.off;Object.assign(service,{loaded:false,pid:0});check('predecessor-stopped',current);trace.push('stopped49');},
      issueWorker:async()=>f.metadata,issueManager:async()=>({}),register:async()=>{current=f.after;check('registered-stopped',current);trace.push('registered50');},
      install:async()=>{Object.assign(service,{loaded:true,state:'running',pid:987});check('installed-off',current,other);trace.push('installed50');},
      verify:async()=>{check('installed-off',current,other);trace.push('verified');return {pid:987};},activate:async()=>{current=f.proof.after;check('activated',current,other);trace.push('ON');},
      finish:async()=>({activated:true}),containFailure:vi.fn(),removeManager:async()=>{}};
    expect(await runV85Cutover(a)).toEqual({activated:true});expect(trace).toEqual(['49','stopped49','registered50','installed50','verified','ON']);
    expect(a.containFailure).not.toHaveBeenCalled();
  });
  it('has no issue or registration branch even when preflight returns an unissued/not-applied state',async()=>{
    const forbidden=vi.fn(async()=>{throw Error('forbidden');}),containFailure=vi.fn(),removeManager=vi.fn();
    for(const state of ['unissued','not-applied','unknown']){
      const a={registeredResumePreflight:async()=>({reconciliation:{state},metadata:{},enabled:false}),quiesce:forbidden,issueWorker:forbidden,issueManager:forbidden,register:forbidden,
        install:forbidden,verify:forbidden,activate:forbidden,finish:forbidden,containFailure,removeManager};
      await expect(resumeRegisteredV85Cutover(a)).rejects.toThrow('registered50-only');
    }
    expect(forbidden).not.toHaveBeenCalled();expect(removeManager).toHaveBeenCalledTimes(3);
  });
  it('rejects foreign launchers,51, policy mismatch and further protected-data drift',()=>{
    const mutations:Array<(f:ReturnType<typeof fixture>)=>void>=[f=>{f.after.worker.credentialGeneration=51;},f=>{f.after.normalDataSha256=other;},f=>{f.after.policy.enabled=true;}];
    for(const mutate of mutations){
      const {f,service,check}=lifecycle();Object.assign(service,{loaded:false,pid:0});mutate(f);expect(()=>check('registered-stopped',f.after)).toThrow();
    }
    const {f,service,check}=lifecycle();Object.assign(service,{loaded:false,pid:0});expect(()=>check('registered-stopped',f.after,'c'.repeat(64))).toThrow('owned launcher');
    Object.assign(service,{loaded:true,state:'running',pid:987});expect(()=>check('installed-off',f.after,h)).toThrow('installed launcher');
    Object.assign(service,{loaded:false,pid:0});expect(()=>check('predecessor-running',f.plan.before)).toThrow('predecessor PID');
  });
  it('the actual web probe retains startup8, repeated process proof and exact runtime while using web-only census',()=>{
    const source=readFileSync('scripts/youtube-v85-controlled-cutover.mjs','utf8');
    const web=source.slice(source.indexOf('function webReady(plan)'),source.indexOf('\nfunction round2Binding'));
    expect(web).toContain('rows=a.web_census(cwd)');expect(web).toContain('a.require(a.web_census(cwd)==rows');expect(web).toContain('a.process_fingerprints');
    expect(web).toContain('39019');expect(web).toContain('39025');expect(web).not.toContain('a.census(cwd)');
  });
});
describe('same50 repair source retains the exact four-approval capsule',()=>{
  function pinFixture(){
    const files=Object.fromEntries(registeredResumeFiles.map(p=>[p,[null,h]]));
    const pin={schema:'homecook.v85-registered-resume-source.v1',baseRef:R.base,executorRef:'e'.repeat(40),executorTree:'f'.repeat(40),files};
    const observed={executorRef:pin.executorRef,executorTree:pin.executorTree,executorParent:R.base,executorClean:true,executorOwned:true,executorUntracked:[] as string[],
      files,bindingParent:pin.executorRef,bindingDiff:[String(R.manifest)],bindingClean:true,bindingOwned:true,bindingUntracked:[] as string[]};return {pin,observed};
  }
  it('binds only a direct child repair and a one-manifest binding child',()=>{const {pin,observed}=pinFixture();expect(assertRegisteredResumePin(pin,observed)).toBe(pin);});
  it.each(['executorParent','bindingParent','executorTree','executorRef'])('rejects a different %s',key=>{
    const {pin,observed}=pinFixture();expect(()=>assertRegisteredResumePin(pin,{...observed,[key]:'d'.repeat(40)})).toThrow();
  });
  it.each(['executorClean','executorOwned','bindingClean','bindingOwned'])('rejects false %s',key=>{
    const {pin,observed}=pinFixture();expect(()=>assertRegisteredResumePin(pin,{...observed,[key]:false})).toThrow();
  });
  it('rejects unrelated files, missing guards, extra binding changes and removed files',()=>{
    for(const mode of ['product','missing','binding','deleted']){const {pin,observed}=pinFixture();
      if(mode==='product')Object.assign(pin.files,{'app/page.tsx':[null,h]});
      if(mode==='missing')Reflect.deleteProperty(pin.files,'scripts/lib/v85-worker-lifecycle.mjs');
      if(mode==='binding')observed.bindingDiff.push('other.json');
      if(mode==='deleted')pin.files['scripts/lib/v85-worker-lifecycle.mjs']=[h,null];
      expect(()=>assertRegisteredResumePin(pin,observed)).toThrow();
    }
  });
  it.each(['executorUntracked','bindingUntracked'])('rejects %s independently of a reported clean status',key=>{
    const {pin,observed}=pinFixture();expect(()=>assertRegisteredResumePin(pin,{...observed,[key]:['scripts/untracked.mjs']})).toThrow();
  });
});
