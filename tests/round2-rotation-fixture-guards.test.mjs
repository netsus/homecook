import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ROUND2_ROTATION_NAMES as names, prepareRound2FixtureRotation, assertRound2FixtureTarget,
  verifyRound2FixtureRotation, round2FixtureFailureDirective } from '../scripts/lib/round2-rotation-fixture-guards.mjs';

const keys = epoch => Object.fromEntries(names.map((name, index) => [name, `fixture-${epoch}-round2-key-${index}-not-a-real-secret`]));
const oldKeys = keys('old'), newKeys = keys('new');
const protectedState = { database: 'fixture-db232-unchanged', worker: 'fixture-v74-gen49', consent: 'fixture-generation1', v2: 'fixture-v2-unchanged' };
function scenario() {
  const before = { fixture: true, env: { ...oldKeys, MUMEOK_ROUND2_ENABLED: 'false', MUMEOK_ROUND2_LEADS_ENABLED: 'false',
    AUTH_KEY: 'fixture-unrelated-auth-unchanged', C05_ENABLED: 'false' },
  control: { version: 1, collection_enabled: false, lead_enabled: false, consent_generation: 1 },
  preflightArmPresent: false, consumerIds: ['fixture-web-a', 'fixture-web-b'], protectedState: { ...protectedState } };
  const target = structuredClone(before);
  Object.assign(target.env, newKeys);
  const plan = prepareRound2FixtureRotation(before, newKeys);
  const drained = { fixture: true, allConsumersStopped: true, inFlight: 0, consumerIds: [...before.consumerIds],
    drainedAt: 1000, lastPossibleCounterWriteAt: 990 };
  const loaded = { fixture: true, processes: before.consumerIds.map((id, index) => ({ id, pid: index + 100,
    startedAt: 1001, collectionEnabled: false, leadEnabled: false, loadedFingerprints: { ...plan.nextFingerprints } })),
  inFlight: 0, preflightArmPresent: false, protectedState: { ...protectedState } };
  return { before, target, plan, drained, loaded };
}
const verify = s => verifyRound2FixtureRotation(s.plan, s.target, s.drained, s.loaded, 1010);

test('environment baseline rejects mutable nested values instead of sharing them with the plan', () => {
  const s = scenario();
  s.before.env.AUTH_CONFIG = { enabled: false };
  assert.throws(() => prepareRound2FixtureRotation(s.before, newKeys), /ENV_STRING_RECORD/);
  const accessor = scenario();
  Object.defineProperty(accessor.before.env, 'AUTH_CONFIG', { get() { throw new Error('fixture-getter-must-not-run'); } });
  assert.throws(() => prepareRound2FixtureRotation(accessor.before, newKeys), /ENV_STRING_RECORD/);
});

test('closed fixture rotation requires both consumers and produces a secret-free, non-activation receipt', () => {
  const result = verify(scenario());
  assert.deepEqual(result, { fixture: true, status: 'closed_rotation_verified', consumerCount: 2, keyCount: 8,
    collectionEnabled: false, leadEnabled: false, rateResumeNotBefore: 4590,
    readiness: 'not_verified_for_activation', operationalWrites: 0 });
  for (const value of [...Object.values(oldKeys), ...Object.values(newKeys)]) assert.ok(!JSON.stringify(result).includes(value));
});

test('all eight exposed keys are denied in rollback targets, including cross-purpose reuse', () => {
  for (const name of names) {
    const s = scenario();
    s.target.env[name] = oldKeys[name];
    assert.throws(() => assertRound2FixtureTarget(s.plan, s.target), /EXPOSED_KEY_ROLLBACK/);
  }
  const s = scenario();
  assert.throws(() => assertRound2FixtureTarget(s.plan, s.before), /EXPOSED_KEY_ROLLBACK/);
  s.target.env[names[0]] = oldKeys[names[1]];
  assert.throws(() => assertRound2FixtureTarget(s.plan, s.target), /EXPOSED_KEY_ROLLBACK/);
});

test('preparation rejects partial, duplicate, old, and unlabelled key inputs without echoing their values', () => {
  for (const mode of ['missing', 'extra', 'duplicate', 'reused', 'unlabelled']) {
    const s = scenario(), next = { ...newKeys };
    if (mode === 'missing') delete next[names[0]];
    if (mode === 'extra') next.OTHER_SECRET = 'fixture-new-extra-not-real';
    if (mode === 'duplicate') next[names[0]] = next[names[1]];
    if (mode === 'reused') next[names[0]] = oldKeys[names[0]];
    if (mode === 'unlabelled') next[names[0]] = 'not-an-accepted-input';
    assert.throws(() => prepareRound2FixtureRotation(s.before, next), error => {
      assert.match(error.message, /^R2_FIXTURE_[A-Z_]+$/u);
      assert.ok(!Object.values(next).some(value => error.message.includes(value)));
      return true;
    });
  }
});

test('new keys do not permit opening flags, arming preflight, changing consent, protected state, or unrelated credentials', () => {
  const mutations = [s => { s.target.env.MUMEOK_ROUND2_ENABLED = 'true'; },
    s => { s.target.env.MUMEOK_ROUND2_LEADS_ENABLED = 'true'; },
    s => { s.target.control.collection_enabled = true; }, s => { s.target.control.lead_enabled = true; },
    s => { s.target.control.consent_generation++; }, s => { s.target.preflightArmPresent = true; },
    s => { s.target.protectedState.database = 'fixture-db-changed'; }, s => { s.target.protectedState.worker = 'fixture-gen50'; },
    s => { s.target.env.AUTH_KEY = 'fixture-changed'; }, s => { s.target.env.C05_ENABLED = 'true'; },
    s => { delete s.target.env.AUTH_KEY; }, s => { s.target.consumerIds = ['fixture-web-a']; }];
  for (const mutate of mutations) { const s = scenario(); mutate(s); assert.throws(() => verify(s), /^Error: R2_FIXTURE_/u); }
});

test('a staged new config is insufficient: missing, extra, stale, enabled, and reused-PID consumers fail', () => {
  const mutations = [s => { s.loaded.processes.pop(); },
    s => { s.loaded.processes.push({ ...s.loaded.processes[0], id: 'fixture-unexpected', pid: 999 }); },
    s => { s.loaded.processes[0].loadedFingerprints[names[0]] = createHash('sha256').update(oldKeys[names[0]]).digest('hex'); },
    s => { s.loaded.processes[0].collectionEnabled = true; }, s => { s.loaded.processes[0].leadEnabled = true; },
    s => { s.loaded.processes[0].startedAt = 999; }, s => { s.loaded.processes[0].startedAt = 1011; },
    s => { s.loaded.processes[1].pid = s.loaded.processes[0].pid; },
    s => { s.loaded.inFlight = 1; }, s => { s.loaded.preflightArmPresent = true; },
    s => { s.loaded.protectedState.database = 'fixture-db-changed'; }];
  for (const mutate of mutations) { const s = scenario(); mutate(s); assert.throws(() => verify(s), /^Error: R2_FIXTURE_/u); }
});

test('drain fence and last possible counter write determine the full rate window', () => {
  const mutations = [s => { s.drained.allConsumersStopped = false; }, s => { s.drained.inFlight = 1; },
    s => { s.drained.consumerIds.pop(); }, s => { s.drained.lastPossibleCounterWriteAt = 1001; },
    s => { s.drained.drainedAt = 1011; }];
  for (const mutate of mutations) { const s = scenario(); mutate(s); assert.throws(() => verify(s), /^Error: R2_FIXTURE_/u); }
  const s = scenario();
  s.drained.lastPossibleCounterWriteAt = 1000;
  assert.equal(verify(s).rateResumeNotBefore, 4600);
});

test('a different unapproved new key is rejected; failure directs closed forward repair without mutation', () => {
  const s = scenario(), original = structuredClone(s);
  s.target.env[names[0]] = keys('other')[names[0]];
  assert.throws(() => verify(s), /NEW_KEYS_REQUIRED/);
  const directive = round2FixtureFailureDirective();
  assert.deepEqual(directive, { fixture: true, collectionEnabled: false, leadEnabled: false, preflightArmPresent: false,
    preserveNewKeys: true, restoreExposedKeys: false, automaticRetry: false, databaseRestore: false,
    action: 'remain_closed_reconcile_then_forward_repair', operationalWrites: 0 });
  assert.deepEqual(s.before, original.before);
  assert.deepEqual(s.loaded, original.loaded);
});
