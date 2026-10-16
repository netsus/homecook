import { describe, expect, it } from 'vitest';
import { runV74Cutover, buildV74RegistrationSql } from '../scripts/youtube-v74-controlled-cutover.mjs';
import { V74_TRANSITION as V } from '../scripts/lib/youtube-v74-cutover-preparation.mjs';
function fixture(failure = '') {
  const calls: string[] = []; let generation = 48;
  const step = (name: string, value = {}) => async () => { calls.push(name); if (failure === name) throw new Error(name); return value; };
  const a = { preflight: step('preflight'), assertWebReady: step('web'), assertUnissued: step('unissued'), quiesce: step('OFF-stop48'),
    issueWorker: step('issue49'), issueManager: step('manager300'), register: async () => { calls.push('CAS'); generation = 49; if (failure === 'CAS-unknown') throw new Error('CAS-unknown'); },
    install: step('install'), verify: step('health'), activate: step('ON'), finish: step('receipt', { activated: true }),
    readGeneration: async () => { calls.push('readback'); return generation; }, closeNewPolicy: step('49-OFF'),
    failure: step('failure'), removeManager: step('remove-manager') };
  return { a, calls };
}
describe('v74 exact cutover sequence', () => {
  it('requires web and zero/stop proof before issuing49 and commits before install', async () => {
    const f = fixture(); await runV74Cutover(f.a);
    expect(f.calls).toEqual(['preflight','web','unissued','OFF-stop48','issue49','manager300','CAS','install','health','ON','receipt','remove-manager']);
  });
  it.each(['preflight','web','unissued','OFF-stop48'])('never issues for failed %s', async name => {
    const f = fixture(name); await expect(runV74Cutover(f.a)).rejects.toThrow(name); expect(f.calls).not.toContain('issue49');
  });
  it.each(['install','health','ON','receipt','CAS-unknown'])('reads uncertain outcome and keeps registered49 OFF after %s', async name => {
    const f = fixture(name); await expect(runV74Cutover(f.a)).rejects.toThrow();
    expect(f.calls.slice(-4)).toEqual(['readback','49-OFF','failure','remove-manager']);
    expect(f.calls.filter(x => x === 'issue49')).toHaveLength(1);
    expect(f.calls.filter(x => x === 'CAS')).toHaveLength(1);
  });
  it('manager failure does not attempt CAS or restore a predecessor blindly', async () => {
    const f = fixture('manager300'); await expect(runV74Cutover(f.a)).rejects.toThrow();
    expect(f.calls).not.toContain('CAS'); expect(f.calls).not.toContain('49-OFF'); expect(f.calls.at(-1)).toBe('remove-manager');
  });
});
const now = new Date('2026-10-16T23:00:00Z'), iat = now.getTime()/1000;
const manager = {role:'youtube_extraction_credential_manager',scope:'youtube-extraction-credential-manager',iss:'https://worker.mumeok.kr',aud:'youtube-extraction',jti_hash:'a'.repeat(64),iat,exp:iat+300};
const metadata = { generation:49,jti_sha256:'b'.repeat(64),expires_at:new Date(now.getTime()+V.workerLifetimeSeconds*1000).toISOString(),release_sha:V.releaseSha,schema_identity:V.schemaIdentity,allowed_snapshot_digest:V.snapshotDigest };
it('SQL uses the restricted manager with exact48->49 and never updates fingerprint rotation', () => {
  const sql = buildV74RegistrationSql({managerClaims:manager,metadata},now);
  expect(sql).toContain('SET LOCAL ROLE youtube_extraction_credential_manager'); expect(sql).toContain('rotate_youtube_extraction_worker_credential(48,49,');
  expect(sql).not.toMatch(/SET[^;]*fingerprint/); expect(sql).not.toContain('50');
});
it.each([50,48])('rejects generation%s before SQL', generation => expect(() => buildV74RegistrationSql({managerClaims:manager,metadata:{...metadata,generation}},now)).toThrow());

import { resumeV74Cutover } from '../scripts/youtube-v74-controlled-cutover.mjs';
describe('same49 forward repair', () => {
  it.each([false,true])('uses existing49, enabled=%s, without issuance or CAS', async enabled => {
    const f=fixture(); const a={...f.a,resumePreflight:async()=>({activated:false,enabled,metadata:{}}),verifyActivated:async()=>({readOnly:true})};
    await resumeV74Cutover(a);
    expect(f.calls).toEqual(enabled?['health','receipt']:['install','health','ON','receipt']);
  });
  it('rechecks a committed activation without changing policy or reinstalling', async () => {
    const f=fixture();const a={...f.a,resumePreflight:async()=>({activated:true,enabled:true,metadata:{}}),verifyActivated:async()=>({readOnly:true})};
    await expect(resumeV74Cutover(a)).resolves.toEqual({readOnly:true});expect(f.calls).toEqual([]);
  });
  it('does no repair when original49 registration identity is not established', async () => {
    const f=fixture();const a={...f.a,resumePreflight:async()=>{throw new Error('foreign49');},verifyActivated:async()=>({})};
    await expect(resumeV74Cutover(a)).rejects.toThrow('foreign49');expect(f.calls).toEqual([]);
  });
});
