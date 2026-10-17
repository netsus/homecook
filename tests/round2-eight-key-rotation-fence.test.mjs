import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ROUND2_ROTATION_NAMES as names } from '../scripts/lib/round2-rotation-fixture-guards.mjs';
import { assertRound2EightKeyFence, createRound2EightKeyRestartFence, guardRound2EightKeyRestart, preserveRound2RotationState } from '../scripts/lib/round2-eight-key-rotation-fence.mjs';
import { restartLaunchAgent } from '../scripts/lib/prelaunch-web-deploy.mjs';

const values = epoch => Object.fromEntries(names.map((name, i) => [name, `fixture-${epoch}-round2-key-${i}-not-a-real-secret`]));
const fingerprints = values => Object.fromEntries(Object.entries(values).map(([name, value]) => [name, createHash('sha256').update(value).digest('hex')]));
const oldKeys = values('old'), nextKeys = values('new');
const fence = { version: 1, purpose: 'round2-eight-key-incident-20261017',
  denied_fingerprints: fingerprints(oldKeys), approved_fingerprints: fingerprints(nextKeys) };
const env = () => ({ ...nextKeys, MUMEOK_ROUND2_ENABLED: 'false', MUMEOK_ROUND2_LEADS_ENABLED: 'false' });

test('web target change and old-state compensation preserve the durable incident marker', () => {
  const marker = { version: 1, fenceSha256: 'a'.repeat(64), candidatePlistSha256: 'b'.repeat(64),
    stageReceiptSha256: 'c'.repeat(64), collectionEnabled: false, leadEnabled: false, reactivationReady: false };
  const previous = { ref: 'fixture-old-web', round2EightKeyRotation: marker };
  for (const target of [{ ref: 'fixture-v85', targetPlistHash: 'd'.repeat(64) }, { ref: 'fixture-old-state-without-marker' }]) {
    const next = preserveRound2RotationState(previous, target);
    assert.deepEqual(next.round2EightKeyRotation, marker);
    assert.notEqual(next.round2EightKeyRotation, marker);
    assert.equal(next.ref, target.ref);
    assert.equal(target.round2EightKeyRotation, undefined);
  }
  for (const change of [{ ...marker, fenceSha256: 'd'.repeat(64) }, { ...marker, leadEnabled: true }]) {
    assert.throws(() => preserveRound2RotationState(previous, { round2EightKeyRotation: change }), /STATE_MARKER_CHANGED/);
  }
  assert.throws(() => preserveRound2RotationState(null, previous), /STATE_MARKER_UNAUTHORIZED/);
  assert.throws(() => preserveRound2RotationState({ round2EightKeyRotation: { ...marker, reactivationReady: true } }, {}), /STATE_MARKER_INVALID/);
  assert.deepEqual(preserveRound2RotationState(null, { ref: 'legacy' }), { ref: 'legacy' });
});

test('every official state publication uses rotation-safe inheritance including byte recovery and durable paths', () => {
  const source = readFileSync(new URL('../scripts/deploy-prelaunch-web.mjs', import.meta.url), 'utf8');
  const writes = source.split('\n').filter(line => /(?:atomicWrite|durableJson)\(statePath,/u.test(line));
  assert.equal(writes.length, 11);
  assert.ok(writes.every(line => /rotationSafeState(?:Bytes)?\(/u.test(line)));
});

test('approved eight load with both flags OFF; no values appear in fence', () => {
  assertRound2EightKeyFence(env(), fence);
  for (const value of [...Object.values(oldKeys), ...Object.values(nextKeys)]) assert.ok(!JSON.stringify(fence).includes(value));
});
test('each old key and cross-purpose old key is rejected before any simulated restart write', () => {
  for (const name of names) {
    let operationalWrites = 0;
    const target = env(); target[name] = oldKeys[name];
    assert.throws(() => { createRound2EightKeyRestartFence(() => fence)(target); operationalWrites++; }, /EXPOSED_KEY_ROLLBACK/);
    assert.equal(operationalWrites, 0);
  }
  const target = env(); target[names[0]] = oldKeys[names[1]];
  assert.throws(() => assertRound2EightKeyFence(target, fence), /EXPOSED_KEY_ROLLBACK/);
});
test('missing/unapproved key and either ON flag are rejected with fixed errors', () => {
  for (const mutate of [e => { delete e[names[0]]; }, e => { e[names[0]] = 'fixture-other-unapproved-value'; },
    e => { e.MUMEOK_ROUND2_ENABLED = 'true'; }, e => { e.MUMEOK_ROUND2_LEADS_ENABLED = 'true'; }]) {
    const target = env(); mutate(target);
    assert.throws(() => assertRound2EightKeyFence(target, fence), error => /^R2_ROTATION_[A-Z_]+$/u.test(error.message));
  }
});
test('malformed/partial/old-reused fence cannot authorize a target', () => {
  const mutations = [f => { f.version = 2; }, f => { f.purpose = 'different'; },
    f => { delete f.denied_fingerprints[names[0]]; }, f => { f.extra = true; },
    f => { f.approved_fingerprints[names[0]] = f.denied_fingerprints[names[0]]; },
    f => { f.approved_fingerprints[names[0]] = 'not-a-hash'; }];
  for (const mutate of mutations) { const f = structuredClone(fence); mutate(f); assert.throws(() => assertRound2EightKeyFence(env(), f)); }
});
test('legacy absent fence does not change behavior; observed fence removal and read errors fail closed', () => {
  let active = null;
  const guard = createRound2EightKeyRestartFence(() => active);
  guard({});
  active = fence; guard(env());
  active = null;
  assert.throws(() => guard(env()), /FENCE_DISAPPEARED/);
  assert.throws(() => createRound2EightKeyRestartFence(() => { throw new Error('fixture-sensitive-error-body'); })(env()), /^Error: R2_ROTATION_FENCE_UNREADABLE$/u);
});
test('first fence content is pinned; swapping approved and denied epochs cannot reauthorize exposed keys', () => {
  const active = structuredClone(fence);
  const guard = createRound2EightKeyRestartFence(() => active);
  guard(env());
  [active.denied_fingerprints, active.approved_fingerprints] = [active.approved_fingerprints, active.denied_fingerprints];
  assert.throws(() => guard({ ...env(), ...oldKeys }), /FENCE_CHANGED/);
});
test('real restart helper rejects old targets before stop and rechecks fence before write/start/retry', async () => {
  for (const failAt of [0, 1, 2, 3, 4, -1]) {
    const target = env(), actions = [];
    let inspections = 0, starts = 0, checks = 0;
    const assertTarget = () => {
      if (checks++ === failAt) target[names[0]] = oldKeys[names[0]];
      assertRound2EightKeyFence(target, fence);
    };
    const adapter = {
      isLoaded: async () => inspections++ === 0,
      bootout: async () => { actions.push('stop'); },
      writePlist: async () => { actions.push('write'); },
      bootstrap: async () => { actions.push('start'); return starts++ === 0 ? 5 : 0; },
      wait: async () => {},
    };
    const run = async () => restartLaunchAgent(guardRound2EightKeyRestart(adapter, assertTarget));
    if (failAt < 0) {
      await run();
      assert.deepEqual(actions, ['stop', 'write', 'start', 'start']);
    } else {
      await assert.rejects(run, /EXPOSED_KEY_ROLLBACK/);
      assert.deepEqual(actions, [[], [], ['stop'], ['stop', 'write'], ['stop', 'write', 'start']][failAt]);
    }
  }
});
