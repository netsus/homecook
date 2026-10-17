import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
export const ROUND2_ROTATION_NAMES = Object.freeze([
  ...['PAGE', 'COOKIE', 'BOOTSTRAP', 'EVENT', 'EMAIL', 'RECEIPT', 'RATE']
    .map(name => `MUMEOK_ROUND2_${name}_SECRET`),
  'MUMEOK_ROUND2_TURNSTILE_SECRET_KEY',
]);

const check = (ok, code) => { if (!ok) throw new Error(`R2_ROTATION_${code}`); };
const sha256 = value => createHash('sha256').update(value).digest('hex');
const sameKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());

// This is a closed-only fence for the incident's exact eight names, not a keyring.
export function assertRound2EightKeyFence(env, fence) {
  check(sameKeys(fence, ['version', 'purpose', 'denied_fingerprints', 'approved_fingerprints'])
    && fence.version === 1 && fence.purpose === 'round2-eight-key-incident-20261017', 'FENCE_INVALID');
  check(sameKeys(fence.denied_fingerprints, ROUND2_ROTATION_NAMES)
    && sameKeys(fence.approved_fingerprints, ROUND2_ROTATION_NAMES), 'EXACT_EIGHT');
  const denied = Object.values(fence.denied_fingerprints);
  const approved = Object.values(fence.approved_fingerprints);
  check([...denied, ...approved].every(value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value))
    && new Set(denied).size === 8 && new Set(approved).size === 8
    && approved.every(value => !denied.includes(value)), 'FINGERPRINTS_INVALID');
  check(env?.MUMEOK_ROUND2_ENABLED === 'false' && env?.MUMEOK_ROUND2_LEADS_ENABLED === 'false', 'MUST_STAY_OFF');
  for (const name of ROUND2_ROTATION_NAMES) {
    check(typeof env[name] === 'string' && env[name].length > 0, 'KEY_MISSING');
    const actual = sha256(env[name]);
    check(!denied.includes(actual), 'EXPOSED_KEY_ROLLBACK');
    check(actual === fence.approved_fingerprints[name], 'APPROVED_KEYS_REQUIRED');
  }
}

// Deployment may change the web target hash; the incident fence identity stays immutable.
export function preserveRound2RotationState(previous, next) {
  const marker = previous?.round2EightKeyRotation;
  if (marker === undefined) {
    check(next?.round2EightKeyRotation === undefined, 'STATE_MARKER_UNAUTHORIZED');
    return next;
  }
  check(sameKeys(marker, ['version', 'fenceSha256', 'candidatePlistSha256', 'stageReceiptSha256',
    'collectionEnabled', 'leadEnabled', 'reactivationReady']) && marker.version === 1
    && [marker.fenceSha256, marker.candidatePlistSha256, marker.stageReceiptSha256]
      .every(value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value))
    && marker.collectionEnabled === false && marker.leadEnabled === false
    && marker.reactivationReady === false, 'STATE_MARKER_INVALID');
  check(next && typeof next === 'object' && !Array.isArray(next)
    && (next.round2EightKeyRotation === undefined || isDeepStrictEqual(next.round2EightKeyRotation, marker)), 'STATE_MARKER_CHANGED');
  return { ...next, round2EightKeyRotation: structuredClone(marker) };
}

// The reader is private-file I/O supplied by the official deployment command.
// Once observed, a removed/malformed fence must not downgrade this invocation.
export function createRound2EightKeyRestartFence(readFence) {
  let required = false;
  let firstFence;
  return env => {
    let fence;
    try { fence = readFence(); } catch { throw new Error('R2_ROTATION_FENCE_UNREADABLE'); }
    if (fence === null) {
      check(!required, 'FENCE_DISAPPEARED');
      return;
    }
    required = true;
    if (!firstFence) firstFence = structuredClone(fence);
    check(isDeepStrictEqual(fence, firstFence), 'FENCE_CHANGED');
    assertRound2EightKeyFence(env, fence);
  };
}

export function guardRound2EightKeyRestart(adapter, assertTarget) {
  assertTarget(); // Reject before the restart helper inspects/stops the service.
  return {
    ...adapter,
    bootout: async () => { assertTarget(); return adapter.bootout(); },
    writePlist: async () => { assertTarget(); return adapter.writePlist(); },
    bootstrap: async () => { assertTarget(); return adapter.bootstrap(); },
  };
}
