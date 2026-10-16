import { isDeepStrictEqual as same } from 'node:util';
import { join } from 'node:path';
import { v74MetadataPatch } from './prelaunch-youtube-v74-cutover.mjs';
import { v85MetadataPatch } from './youtube-v85-cutover.mjs';

// One observed web-only recovery. These are existing receipts, never a new DB baseline.
export const V85_WEB_RECOVERY = Object.freeze({
  from: '7b4b74d12eb19993849f6bb282ed30e823343f64',
  to: '06a3369f5c5e1c3ca49045f370f0ce12f049c805',
  fromBuild: 'prelaunch-7b4b74d12eb1-f1VAGt', toBuild: 'prelaunch-06a3369f5c5e-EWuEsS',
  fromPlist: '00ad820073f95920e85936040da0f17561b5b4f55ca2b1f56eb954813ee127b3',
  toPlist: '51b70f01f3a47c08c154a9d9009372b1e8fc65324c82dd9c449c3ee609d7b176',
  fromState: '477186629d77713f8c256219754df783035ad64017b95033041f3ec764510d8f',
  toState: '0fd3ed269fa9a1b0917956db8f3f26fc4fdc7ee0faa03107c0fef083147015a5',
  plan: 'b887fbdc2d2bb1b80241d3abfef9ca56c95e796cc65d6def52825c57877a1342',
  workerRelease: '3e58467499c63ba20c3b3191d9dd7dec77a7aa44',
  workerArtifact: '89d78b374187d70099c63e6c5a1877fb2d360b149e23827cbffabc7da54af1bc',
  descriptor: '9efbec12c675b1b1a9098be73636c85af96b2b3d71d560962d429be1ae20d830',
  jobs: '3ca511162ebe1bee50c2b77820c7bbbc36dc5eeb84e84afb2848a85cb0967ba7',
});
export const recoveryCheck = (ok, reason) => { if (!ok) throw new Error(`v85 web recovery: ${reason}`); };

export function assertRecoveryBinding({ live, state, previousState, previousPlist, hashes, home }) {
  const p = V85_WEB_RECOVERY;
  recoveryCheck(live.ref === p.from && live.buildId === p.fromBuild && state.ref === p.from
    && state.checkout === live.cwd && state.buildId === live.buildId, 'exact current web');
  recoveryCheck(hashes.currentPlist === p.fromPlist && state.targetPlistHash === p.fromPlist
    && hashes.previousPlist === p.toPlist && state.previousPlistHash === p.toPlist
    && hashes.state === p.fromState && hashes.previousState === p.toState
    && state.closedR2.previousStateSha256 === p.toState, 'existing web receipts');
  recoveryCheck(previousState.ref === p.to && previousState.buildId === p.toBuild
    && previousState.checkout === state.previousCwd && previousState.targetPlistHash === p.toPlist
    && previousPlist.WorkingDirectory === previousState.checkout, 'exact previous web');
  for (const [key,value] of Object.entries(v85MetadataPatch(home))) recoveryCheck(live.plist.EnvironmentVariables[key] === value, 'current v85 metadata');
  for (const [key,value] of Object.entries(v74MetadataPatch(home))) recoveryCheck(previousPlist.EnvironmentVariables[key] === value, 'previous v74 metadata');
  const expected = { ...live.plist, WorkingDirectory: previousPlist.WorkingDirectory,
    ProgramArguments: [live.plist.ProgramArguments[0],join(previousPlist.WorkingDirectory,'scripts/start-production.mjs'),...live.plist.ProgramArguments.slice(2)],
    EnvironmentVariables: {...live.plist.EnvironmentVariables,...v74MetadataPatch(home)} };
  recoveryCheck(same(expected,previousPlist), 'unrelated environment/permissions/launcher change');
  recoveryCheck(previousPlist.EnvironmentVariables.MUMEOK_ROUND2_ENABLED === 'false'
    && previousPlist.EnvironmentVariables.MUMEOK_ROUND2_LEADS_ENABLED === 'false', 'R2 closed');
}

export function assertRecoveryDatabase(full, jobsHash) {
  const w=full.worker, p=full.fingerprintPolicy;
  recoveryCheck(full.ledger.length === 232 && jobsHash === V85_WEB_RECOVERY.jobs, 'DB232/original42');
  recoveryCheck(w.credentialGeneration === 49 && w.workerReleaseSha === V85_WEB_RECOVERY.workerRelease
    && w.credentialActive === true && w.workerPolicyEnabled === true && w.queued === 0
    && w.processing === 0 && w.permitHeld === false && w.activeEnqueueSessions === 0, 'exact idle worker49');
  recoveryCheck(p.enabled === true && p.fingerprint_key_version === '2'
    && p.previous_fingerprint_key_version === null && p.previous_fingerprint_valid_until === null, 'unchanged V2 policy');
}

export function assertRecoveryPreserved(before,after) {
  recoveryCheck(same(before,after), 'fresh before/after DB, controls, jobs, worker, guards or authority changed');
}

export function assertRecoveryWebProcess({loaded,listener,uid,cwd,expectedPid}) {
  recoveryCheck(loaded.loaded&&loaded.state==='running'&&loaded.pid>0
    &&(expectedPid===undefined||loaded.pid===expectedPid),'actual loaded web PID');
  recoveryCheck(listener.pid>0&&listener.parentPid===loaded.pid&&listener.uid===uid&&listener.cwd===cwd,'HTTP listener is owned web child');
  return loaded.pid;
}

// The caller supplies the actual 06a application's readiness loader, not a new approximation.
export async function assertRecoveredEnqueue({loadReadiness,rpc,env,verifySecrets}) {
  const ready=await loadReadiness(rpc,env);
  recoveryCheck(ready && !('code' in ready) && ready.currentFingerprintKeyVersion === '2'
    && ready.previousFingerprintKeyVersion === null, 'actual 06a enqueue readiness');
  recoveryCheck(verifySecrets(ready).status === 'ready', 'actual production enqueue secrets');
  return ready;
}

export async function runV85WebRecovery(a) {
  // All preparation and the fresh snapshot precede service mutation.
  const prepared=await a.prepare();
  await a.journal('intent',prepared);
  await a.assertOwned('before');
  try {
    await a.activate();
    await a.verify();
    await a.publishState();
    await a.verifyPublished();
    await a.journal('complete',prepared);
    return {recovered:true,webRef:V85_WEB_RECOVERY.to,generation:49,databaseWrites:0,credentialIssued:false};
  } catch (error) {
    // Never replace a newer/foreign web, state, worker or guard after an uncertain failure.
    try {
      await a.assertOwned('compensation');
      await a.restore();
      await a.verifyRestored();
      await a.journal('compensated',{errorKind:error.name});
    } catch {
      await a.journal('unresolved',{errorKind:error.name});
      throw new Error('v85 web recovery: failed; compensation unconfirmed; inspect exact receipts');
    }
    throw new Error('v85 web recovery: failed; original 7b web/state restored; enqueue still unavailable');
  }
}
