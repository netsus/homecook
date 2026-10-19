import { isDeepStrictEqual as same } from 'node:util';
import { assertV85After, assertV85Preserved, v85Check as check } from './youtube-v85-cutover.mjs';

export function assertV85WorkerLifecycle({phase,plan,observed,metadata,service,plistSha256,targetPlistSha256}) {
  const phases=['predecessor-running','predecessor-stopped','registered-stopped','registered-partial','installed-off','activated'];
  check(phases.includes(phase),'known worker lifecycle phase');
  const enabled=phase==='predecessor-running'||phase==='activated';
  check(observed.policy.enabled===enabled,'worker phase policy');
  if(phase.startsWith('predecessor-')){
    assertV85Preserved(plan.before,observed);
    check(observed.worker.credentialGeneration===49&&same(observed.credential,plan.before.credential)
      &&observed.worker.credentialRowSha256===plan.before.worker.credentialRowSha256
      &&observed.worker.policyStableSha256===plan.before.worker.policyStableSha256
      &&plistSha256===plan.beforeService.plistSha256,'exact predecessor49 lifecycle');
    if(enabled)check(service.loaded&&service.state==='running'&&service.pid===plan.beforeService.pid
      &&observed.worker.policyRowSha256===plan.before.worker.policyRowSha256,'exact running predecessor PID');
    else check(!service.loaded,'predecessor must be stopped before registration');
    return;
  }
  assertV85After(plan,observed,metadata,enabled);
  check(/^[a-f0-9]{64}$/u.test(targetPlistSha256),'exact planned50 launcher digest');
  if(phase==='registered-stopped')check(!service.loaded
    &&[plan.beforeService.plistSha256,targetPlistSha256].includes(plistSha256),'registered50 stopped owned launcher');
  else {
    check(service.loaded&&plistSha256===targetPlistSha256,'registered50 exact installed launcher');
    if(phase!=='registered-partial')check(service.state==='running'&&service.pid>0,'registered50 running process');
  }
}

export function registeredV85WorkerPhase(observed,service) {
  if(observed.policy.enabled)return 'activated';
  if(!service.loaded)return 'registered-stopped';
  return service.state==='running'&&service.pid>0?'installed-off':'registered-partial';
}
