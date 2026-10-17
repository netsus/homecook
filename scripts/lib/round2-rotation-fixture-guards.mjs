import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { ROUND2_ROTATION_NAMES } from './round2-eight-key-rotation-fence.mjs';

// Deliberately no I/O, environment access, key generation, or production adapter.
// Only labelled fixtures are accepted. These guards are not installed in deploy/rollback.
export { ROUND2_ROTATION_NAMES };
const FLAGS = ['MUMEOK_ROUND2_ENABLED', 'MUMEOK_ROUND2_LEADS_ENABLED'];
const check = (condition, code) => { if (!condition) throw new Error(`R2_FIXTURE_${code}`); };
const fingerprint = value => createHash('sha256').update(value).digest('hex');
const same = isDeepStrictEqual;

function fixtureSecrets(values) {
  check(values && same(Object.keys(values).sort(), [...ROUND2_ROTATION_NAMES].sort()), 'EXACT_EIGHT');
  for (const name of ROUND2_ROTATION_NAMES) {
    check(typeof values[name] === 'string' && /^fixture-(old|new|other)-[a-z0-9-]{8,}$/u.test(values[name]), 'FIXTURE_ONLY');
  }
  check(new Set(Object.values(values)).size === ROUND2_ROTATION_NAMES.length, 'DISTINCT_KEYS');
  return Object.freeze(Object.fromEntries(ROUND2_ROTATION_NAMES.map(name => [name, fingerprint(values[name])])));
}
function secretsFrom(env) {
  return Object.fromEntries(ROUND2_ROTATION_NAMES.map(name => [name, env?.[name]]));
}
function unrelatedEnv(env) {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !ROUND2_ROTATION_NAMES.includes(name)));
}
function closed(snapshot) {
  check(snapshot?.fixture === true, 'FIXTURE_ONLY');
  const env = snapshot.env;
  check(env && (Object.getPrototypeOf(env) === Object.prototype || Object.getPrototypeOf(env) === null)
    && Reflect.ownKeys(env).every(name => typeof name === 'string'
      && typeof Object.getOwnPropertyDescriptor(env, name)?.value === 'string'), 'ENV_STRING_RECORD');
  check(FLAGS.every(name => snapshot.env?.[name] === 'false'), 'ENV_MUST_STAY_OFF');
  check(same(Object.keys(snapshot.control ?? {}).sort(), ['version', 'collection_enabled', 'lead_enabled', 'consent_generation'].sort())
    && snapshot.control.version === 1 && snapshot.control.collection_enabled === false
    && snapshot.control.lead_enabled === false && Number.isSafeInteger(snapshot.control.consent_generation)
    && snapshot.control.consent_generation >= 1, 'CONTROL_MUST_STAY_OFF');
  check(snapshot.preflightArmPresent === false, 'PREFLIGHT_MUST_STAY_CLOSED');
}
function fixtureBaseline(snapshot) {
  closed(snapshot);
  check(snapshot.protectedState && Object.keys(snapshot.protectedState).length > 0
    && Object.values(snapshot.protectedState).every(value => typeof value === 'string' && /^fixture-[a-z0-9-]+$/u.test(value)), 'FIXTURE_PROTECTED_STATE');
  check(Array.isArray(snapshot.consumerIds) && snapshot.consumerIds.length > 0
    && snapshot.consumerIds.every(id => /^fixture-[a-z0-9-]+$/u.test(id))
    && new Set(snapshot.consumerIds).size === snapshot.consumerIds.length, 'CONSUMER_INVENTORY');
}

export function prepareRound2FixtureRotation(before, nextSecrets) {
  fixtureBaseline(before);
  const oldFingerprints = fixtureSecrets(secretsFrom(before.env));
  const nextFingerprints = fixtureSecrets(nextSecrets);
  const denied = Object.freeze(Object.values(oldFingerprints));
  check(Object.values(nextFingerprints).every(value => !denied.includes(value)), 'EXPOSED_KEY_REUSE');
  return Object.freeze({
    fixture: true,
    nextFingerprints,
    denied,
    unrelatedEnv: Object.freeze(unrelatedEnv(before.env)),
    control: Object.freeze({ ...before.control }),
    protectedState: Object.freeze({ ...before.protectedState }),
    consumerIds: Object.freeze([...before.consumerIds].sort()),
  });
}

// Use the same check for a staged candidate AND any attempted code rollback target.
export function assertRound2FixtureTarget(plan, target) {
  check(plan?.fixture === true, 'FIXTURE_ONLY');
  closed(target);
  const actual = fixtureSecrets(secretsFrom(target.env));
  check(Object.values(actual).every(value => !plan.denied.includes(value)), 'EXPOSED_KEY_ROLLBACK');
  check(same(actual, plan.nextFingerprints), 'NEW_KEYS_REQUIRED');
  check(same(unrelatedEnv(target.env), plan.unrelatedEnv), 'UNRELATED_ENV_CHANGED');
  check(same(target.control, plan.control), 'CONTROL_CHANGED');
  check(same(target.protectedState, plan.protectedState), 'PROTECTED_STATE_CHANGED');
  check(Array.isArray(target.consumerIds) && same([...target.consumerIds].sort(), plan.consumerIds), 'CONSUMER_INVENTORY');
}

function consumers(plan, observation, expectedFingerprints) {
  check(observation?.fixture === true && Array.isArray(observation.processes), 'FIXTURE_OBSERVATION');
  check(same(observation.processes.map(process => process.id).sort(), plan.consumerIds), 'CONSUMERS_MISSING_OR_EXTRA');
  const identities = new Set();
  for (const process of observation.processes) {
    check(Number.isSafeInteger(process.pid) && process.pid > 0 && Number.isSafeInteger(process.startedAt)
      && process.startedAt >= 0 && !identities.has(process.pid), 'PROCESS_IDENTITY');
    identities.add(process.pid);
    check(process.collectionEnabled === false && process.leadEnabled === false, 'PROCESS_MUST_STAY_OFF');
    check(same(process.loadedFingerprints, expectedFingerprints), 'PROCESS_NOT_LOADED');
  }
  check(observation.inFlight === 0 && observation.preflightArmPresent === false, 'NOT_DRAINED');
  check(same(observation.protectedState, plan.protectedState), 'PROTECTED_STATE_CHANGED');
}

export function verifyRound2FixtureRotation(plan, target, drained, loaded, observedAt) {
  assertRound2FixtureTarget(plan, target);
  // Drain is an explicit pre-apply fence, not simply the time an env flag changed.
  check(drained?.fixture === true && drained.allConsumersStopped === true && drained.inFlight === 0
    && same([...(drained.consumerIds ?? [])].sort(), plan.consumerIds)
    && Number.isSafeInteger(drained.lastPossibleCounterWriteAt) && drained.lastPossibleCounterWriteAt >= 0
    && Number.isSafeInteger(drained.drainedAt) && drained.lastPossibleCounterWriteAt <= drained.drainedAt,
  'DRAIN_FENCE_REQUIRED');
  consumers(plan, loaded, plan.nextFingerprints);
  check(Number.isSafeInteger(observedAt) && observedAt >= drained.drainedAt
    && loaded.processes.every(process => process.startedAt >= drained.drainedAt && process.startedAt <= observedAt), 'OBSERVATION_TIME');
  return Object.freeze({ fixture: true, status: 'closed_rotation_verified', consumerCount: plan.consumerIds.length,
    keyCount: ROUND2_ROTATION_NAMES.length, collectionEnabled: false, leadEnabled: false,
    rateResumeNotBefore: drained.lastPossibleCounterWriteAt + 3600,
    readiness: 'not_verified_for_activation', operationalWrites: 0 });
}

export function round2FixtureFailureDirective() {
  return Object.freeze({ fixture: true, collectionEnabled: false, leadEnabled: false, preflightArmPresent: false,
    preserveNewKeys: true, restoreExposedKeys: false, automaticRetry: false, databaseRestore: false,
    action: 'remain_closed_reconcile_then_forward_repair', operationalWrites: 0 });
}
