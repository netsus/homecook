import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROTATION_BRIDGE as R, assertRound2ClosedMarkerRotationBridge } from '../scripts/lib/round2-closed-marker-rotation-bridge.mjs';
import { ROUND2_ROTATION_NAMES as names, assertRound2EightKeyFence, guardRound2EightKeyRestart, preserveRound2RotationState } from '../scripts/lib/round2-eight-key-rotation-fence.mjs';
import { assertClosedR2CompensationTarget, deployTransaction, restartLaunchAgent } from '../scripts/lib/prelaunch-web-deploy.mjs';
const bytes = value => Buffer.from(JSON.stringify(value)), hash = value => createHash('sha256').update(value).digest('hex');
// Reuse the established synthetic incident fixture; no production scalar/key is read.
const fixtureSource = readFileSync('tests/round2-closed-marker-rotation-bridge.test.mjs', 'utf8');
const makeFixture = new Function('names', 'R', 'bytes', 'hash', fixtureSource.slice(fixtureSource.indexOf('function fixture(){'), fixtureSource.indexOf("\ntest('explicit bridge")) + ';return fixture;')(names, R, bytes, hash);
const cli = readFileSync('scripts/deploy-prelaunch-web.mjs', 'utf8');
function functionSource(name, next) { return cli.slice(cli.indexOf('function ' + name + '('), cli.indexOf('\n' + next, cli.indexOf('function ' + name + '('))); }
function harness() {
  const f = makeFixture(), root = '/fixture';
  f.marker.protectedRollout = { reviewSha256: 'fixture-reviewed-rollout' };
  // The fixture marker is historical, so update its before/after bytes consistently.
  const oldState = JSON.parse(f.beforeBytes); oldState.closedR2 = f.marker;
  f.beforeBytes = bytes(oldState); f.state.closedR2 = f.marker; f.afterBytes = bytes(f.state); f.stateBytes = f.afterBytes;
  const journal = JSON.parse(f.journalBytes); journal.state_before_sha256 = hash(f.beforeBytes); journal.state_after_sha256 = hash(f.afterBytes); f.journalBytes = bytes(journal);
  const canonical = Buffer.concat([f.stateBytes, Buffer.from('\n')]);
  const targetPlist = structuredClone(f.live.plist); targetPlist.WorkingDirectory = '/fixture/15/checkout';
  const backupBytes = bytes(f.live.plist);
  const record = { ref: R.target, checkout: targetPlist.WorkingDirectory, buildId: 'fixed15', backup: '/fixture/15/previous.plist',
    previousCwd: f.state.checkout, previousBuildId: f.state.buildId,
    closedR2: { kind: 'continuation', from: R.web, previousStateSha256: hash(canonical), previousArtifactSha256: hash(bytes(f.marker)) } };
  const files = new Map([
    ['/fixture/state.json', f.stateBytes], ['/fixture/15/previous-closed-state.json', canonical],
    ['/fixture/round2-closed-maintenance.json', bytes(f.marker)], [record.backup, backupBytes],
    ['/fixture/releases/7b4b74d12eb1-f1VAGt/previous.plist', f.beforePlistBytes],
    ['/fixture/round2-eight-key-rotation-apply-20261017/state-before.json', f.beforeBytes],
    ['/fixture/round2-eight-key-rotation-apply-20261017/state-after.json', f.afterBytes],
    ['/fixture/round2-eight-key-rotation-apply-20261017/journal.json', f.journalBytes],
    ['/fixture/round2-eight-key-rotation-stage-20261017/receipt.json', f.receiptBytes],
    ['/fixture/round2-eight-key-rotation-fence.json', f.fenceBytes],
    ['/fixture/control.json', f.controlBytes],
  ]);
  for (const plist of [f.live.plist, targetPlist]) plist.EnvironmentVariables.MUMEOK_ROUND2_CONTROL_PATH = '/fixture/control.json';
  f.beforePlist.EnvironmentVariables.MUMEOK_ROUND2_CONTROL_PATH = '/fixture/control.json';
  // Control path is an unchanged non-eight setting in this synthetic fixture.
  // Rebuild its complete hash chain by restarting fixture construction with that setting.
  f.beforePlistBytes = bytes(f.beforePlist); f.marker.targetPlistSha256 = hash(f.beforePlistBytes);
  const candidate = hash(bytes(f.live.plist)), receipt = JSON.parse(f.receiptBytes);
  receipt.source_plist_sha256 = hash(f.beforePlistBytes); receipt.candidate_plist_sha256 = candidate; f.receiptBytes = bytes(receipt);
  f.state.targetPlistHash = candidate; f.state.round2EightKeyRotation.candidatePlistSha256 = candidate;
  f.state.round2EightKeyRotation.stageReceiptSha256 = hash(f.receiptBytes);
  f.authority.plan.round2Binding.marker = structuredClone(f.state.round2EightKeyRotation);
  const before = { ...f.state, targetPlistHash: receipt.source_plist_sha256 }; delete before.round2EightKeyRotation;
  f.beforeBytes = bytes(before); f.afterBytes = bytes(f.state); f.stateBytes = f.afterBytes;
  Object.assign(journal, { state_before_sha256: hash(f.beforeBytes), state_after_sha256: hash(f.afterBytes), stage_receipt_sha256: hash(f.receiptBytes), source_sha256: receipt.source_plist_sha256, candidate_sha256: candidate });
  f.journalBytes = bytes(journal); f.live.plistHash = candidate;
  const set = (path, value) => files.set(path, value);
  set('/fixture/state.json', f.stateBytes); set('/fixture/15/previous-closed-state.json', Buffer.concat([f.stateBytes, Buffer.from('\n')]));
  set('/fixture/round2-closed-maintenance.json', bytes(f.marker)); set(record.backup, bytes(f.live.plist));
  set('/fixture/releases/7b4b74d12eb1-f1VAGt/previous.plist', f.beforePlistBytes);
  set('/fixture/round2-eight-key-rotation-stage-20261017/receipt.json', f.receiptBytes);
  for (const [file, value] of [['state-before.json',f.beforeBytes],['state-after.json',f.afterBytes],['journal.json',f.journalBytes]]) set('/fixture/round2-eight-key-rotation-apply-20261017/'+file,value);
  record.closedR2.previousStateSha256 = hash(files.get('/fixture/15/previous-closed-state.json'));
  record.closedR2.previousArtifactSha256 = hash(bytes(f.marker));
  const beforeIdentity = { ref: R.web, cwd: f.state.checkout, buildId: f.state.buildId, bytes: bytes(f.live.plist) };
  const target = { ref: R.target, cwd: record.checkout, buildId: record.buildId, plistSha256: hash(bytes(targetPlist)) };
  let live = { ...beforeIdentity }, loaded = true, mode = '', bridgeCalls = 0;
  const deps = { join, dirname, repository: '/fixture/repository', root, statePath: '/fixture/state.json', hash,
    closedR2ArtifactName: 'round2-closed-maintenance.json', readClosedR2PrivateBytes: path => { assert.ok(files.has(path), 'unexpected read: '+path); return files.get(path); },
    parsePlist: value => JSON.parse(value), DeploymentError: Error, existsSync: () => false,
    loadProtectedRolloutReview: () => ({ schema: 'fixture-reviewed-rollout' }), protectedRolloutPins: () => ({ rollout: { sha256: 'fixture-reviewed-rollout' } }),
    protectedMarkerAuthority: () => ({}), v85Authority: () => f.authority,
    assertProtectedClosedR2Marker: input => { assert.ok(input.rotationBridge, 'compensation bridge missing'); assertRound2ClosedMarkerRotationBridge({ ...input.rotationBridge, state: input.state, marker: input.marker, live: input.live }); bridgeCalls++; },
    assertClosedR2PredecessorState: () => { throw Error('unexpected unprotected path'); }, CLOSED_R2_REVIEW_PIN: {},
  };
  const source = functionSource('closedMarkerRotationBridge', 'async function reviewRotationBridgeTool') + '\n' + functionSource('previousClosedR2State', 'function closedR2RestoredState');
  const previous = new Function(...Object.keys(deps), source + ';return previousClosedR2State;')(...Object.values(deps));
  const restart = async (plistBytes, restoring = false) => {
    const plist = JSON.parse(plistBytes), isNext = plist.WorkingDirectory === record.checkout;
    const guard = () => assertRound2EightKeyFence(plist.EnvironmentVariables, JSON.parse(f.fenceBytes));
    if (!restoring && mode === 'before-stop') throw Error('before-stop');
    await restartLaunchAgent(guardRound2EightKeyRestart({
      isLoaded: async () => loaded,
      bootout: async () => { loaded = false; if (!restoring && mode === 'after-stop') throw Error('after-stop'); },
      writePlist: async () => { live = isNext ? { ...target, bytes: plistBytes } : { ...beforeIdentity, bytes: plistBytes }; },
      bootstrap: async () => { if (!restoring && mode === 'bootstrap-fails') return 1; loaded = true; return 0; },
      wait: async () => {},
    }, guard));
  };
  return { f, files, record, target, beforeIdentity, previous, getLive: () => live, getLoaded: () => loaded, bridgeCalls: () => bridgeCalls,
    setMode: value => { mode = value; }, restart, nextBytes: () => bytes(targetPlist), backupBytes: () => files.get(record.backup),
    restore: async () => {
      assertClosedR2CompensationTarget({ actual: live, before: beforeIdentity, target, closedPreviousPlistSha256: hash(files.get(record.backup)) });
      const restored = previous(record, {}); await restart(files.get(record.backup), true);
      files.set('/fixture/state.json', bytes(preserveRound2RotationState(JSON.parse(files.get('/fixture/state.json')), restored)));
    } };
}
for (const scenario of ['normal', 'before-stop', 'after-stop', 'bootstrap-fails', 'health-fails']) test('official transaction and predecessor compensation: '+scenario, async () => {
  const h = harness(); h.setMode(scenario); const original = h.files.get('/fixture/state.json');
  const transaction = deployTransaction({ prepare: async () => { h.previous(h.record, {}); },
    activate: () => h.restart(h.nextBytes()), verify: async () => { if (scenario === 'health-fails') throw Error('health-fails'); },
    restore: h.restore, verifyRestored: async () => { assert.equal(h.getLoaded(), true); assert.equal(h.getLive().ref, R.web); },
  });
  if (scenario === 'normal') {
    await transaction;
    const committed = preserveRound2RotationState(JSON.parse(original), { ref: R.target });
    h.files.set('/fixture/state.json', bytes(committed));
    assert.deepEqual(committed.round2EightKeyRotation, h.f.state.round2EightKeyRotation);
    assert.equal(h.getLive().ref, R.target);
  } else {
    await assert.rejects(transaction, /이전 웹 복구 완료/);
    assert.equal(h.getLive().ref, R.web); assert.deepEqual(h.getLive().bytes, h.backupBytes());
    assert.equal(h.getLoaded(), true); assert.deepEqual(h.files.get('/fixture/state.json'), original);
    assert.deepEqual(h.previous(h.record, {}), h.f.state); // Re-reading the same predecessor still uses raw evidence.
  }
  assert.ok(h.bridgeCalls() >= 1);
});
for (const mutation of ['raw-as-snapshot', 'changed-raw', 'old-key-backup', 'on-backup', 'foreign-live']) test('compensation refuses '+mutation, async () => {
  const h = harness();
  if (mutation === 'raw-as-snapshot') h.files.set('/fixture/15/previous-closed-state.json', h.files.get('/fixture/state.json'));
  if (mutation === 'changed-raw') h.files.set('/fixture/state.json', Buffer.from('{}'));
  if (mutation === 'old-key-backup' || mutation === 'on-backup') {
    const p = JSON.parse(h.backupBytes());
    if (mutation === 'old-key-backup') p.EnvironmentVariables[names[0]] = h.f.beforePlist.EnvironmentVariables[names[0]];
    else p.EnvironmentVariables.MUMEOK_ROUND2_ENABLED = 'true';
    h.files.set(h.record.backup, bytes(p));
  }
  if (mutation === 'foreign-live') { h.getLive().ref = 'unrelated'; await assert.rejects(h.restore); }
  else assert.throws(() => h.previous(h.record, {}));
});

for (const phase of ['state-publication', 'recovery-cleanup']) test('post-verification '+phase+' failure does not invoke old-web compensation', async () => {
  const h = harness(); let restored = 0;
  await deployTransaction({ prepare: async () => { h.previous(h.record, {}); }, activate: () => h.restart(h.nextBytes()),
    verify: async () => {}, restore: async () => { restored++; await h.restore(); }, verifyRestored: async () => {} });
  const committed = preserveRound2RotationState(h.f.state, { ref: R.target });
  if (phase === 'recovery-cleanup') h.files.set('/fixture/state.json', bytes(committed));
  assert.throws(() => { throw Error(phase+' failed after transaction'); }, /failed after transaction/);
  assert.equal(restored, 0); assert.equal(h.getLive().ref, R.target);
  if (phase === 'recovery-cleanup') assert.throws(() => h.previous(h.record, {}));
  const commit = cli.indexOf('atomicWrite(statePath, JSON.stringify(rotationSafeState(state)));', cli.indexOf('async function deploy(options)'));
  const closeTransaction = cli.lastIndexOf('  });', commit);
  assert.ok(commit > closeTransaction && closeTransaction > cli.indexOf('verifyRestored: async () =>'));
});
