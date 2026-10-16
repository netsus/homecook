import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { assertFingerprintReceipt, fingerprintRecoveryHash, FINGERPRINT_RECOVERY_FROM } from './youtube-fingerprint-recovery.mjs';
import { readFingerprintPlanApproval } from './youtube-fingerprint-approval.mjs';

export const FINGERPRINT_RECOVERY_DIRECTORY = join(homedir(), '.homecook/operations/youtube-fingerprint-v2-20261017');
const SHA = /^[a-f0-9]{64}$/u, REF = /^[a-f0-9]{40}$/u;
const check = (ok, why) => { if (!ok) throw new Error(`fingerprint authority: ${why}`); };
const support = new Set([
  'scripts/youtube-fingerprint-recovery.mjs', 'scripts/lib/youtube-fingerprint-recovery.mjs',
  'scripts/lib/youtube-fingerprint-recovery-authority.mjs', 'scripts/lib/youtube-fingerprint-recovery-ops.mjs',
  'scripts/lib/youtube-enqueue-runtime-preflight.mjs', 'scripts/lib/youtube-enqueue-runtime-preflight-ops.mjs',
  'scripts/lib/youtube-fingerprint-startup-preflight.mjs',
  'scripts/lib/youtube-fingerprint-approval.mjs',
  'scripts/lib/start-production-runtime.mjs', 'scripts/start-production.mjs',
  'scripts/deploy-prelaunch-web.mjs', 'scripts/lib/prelaunch-web-deploy.mjs', 'scripts/lib/prelaunch-database.mjs',
  'scripts/run-youtube-fingerprint-recovery-postgres.mjs',
]);
// Already-merged PR1734–1737: preserve only these reviewed exact before/after bytes.
const integratedMasterSources = {
  "app/api/v1/leftovers/[leftover_id]/eat/route.ts": [
    "c77d023b381f9f850efb46148bad7a8d4b968e885e6fa03f2e7558ab088ded9b",
    "4f8df5bfa65317c2b4da3b51a6658683c3f15bec5068a6b58623347fd2211a4d"
  ],
  "app/api/v1/leftovers/[leftover_id]/keep/route.ts": [
    "07bcdcfc7028e82683149d9bf48308ce471b2d7f44a15ca706d5441c0fc0603a",
    "1f974ea02f7b262f8c3c70ed6f584c112d7a0115ea352333f22542a239f067bc"
  ],
  "app/api/v1/leftovers/[leftover_id]/uneat/route.ts": [
    "74019c7ee867301acb10c02f213185680c0f3b6487aebd809b078f2563097143",
    "aa0c7affc50f6ae160ec46308e5c95ac82765dee2056b19681a4e355560b0a08"
  ],
  "lib/server/leftovers.ts": [
    "de95800f41158dafe9d908d122b5613183be82cdf113713ffc0f2decb8fd4a34",
    "569f75eb5ce9250c0321f81d5f3dac5f9254f643912062d49c41498676d1ac01"
  ],
  "lib/server/user-progress.ts": [
    "7380875b918a783e809febe06b397dc17007cbb73dc0343fe0a5cf9ba3b9a9fc",
    "bec65c06c6387961372a507647918f7e401a4cf87957cf4ccb913beb1f39d751"
  ],
  "tests/leftover-mutation-parser.test.ts": [
    null,
    "b2153a33656a3d0ff31c0b8c988eacd86ea466f7d1ba028428a3081d9a80169f"
  ],
  "tests/leftovers.backend.test.ts": [
    "a5375cefdc921516040dd8fd1ecde4419ed1339be48df7e672bbe7b06f8f32a0",
    "879f106f1f5d659a2b1443f268d93b5b541dea3ab966be1af8f9b135ee0af3f5"
  ],
  "tests/user-progress-events.test.ts": [
    "f2ca48473d3f97473850013e8d1d75b816e2f2a46b938c85b79b5b020c879c8b",
    "858eb565e3c9532e593a6486dc9418f466e384d198d763fb7a84cf5dbea1473a"
  ],
  "tests/user-progress-repeat-caps.test.ts": [
    null,
    "7954610b1bd8fc9cc3c338bf0990fde4bcecda79677754c68667905c2005a9f4"
  ]
};
export function assertFingerprintSource({ plan, from, to, digests }) {
  check(plan?.schema === 'homecook.youtube-fingerprint-recovery-plan.v1' && plan.from === FINGERPRINT_RECOVERY_FROM
    && from === plan.from && to === plan.candidate && REF.test(to), 'exact-source');
  check(isDeepStrictEqual(digests, plan.sources) && Object.keys(digests).length > 0, 'complete-source-bytes');
  for (const [file, pair] of Object.entries(digests)) {
    check((Object.hasOwn(integratedMasterSources,file) && isDeepStrictEqual(pair,integratedMasterSources[file])) || support.has(file) || /^tests\/(?:fixtures\/)?youtube-fingerprint-recovery[-./a-z0-9]*\.(?:mjs|ts|sql|json)$/u.test(file)
      || file === 'tests/youtube-enqueue-runtime-preflight.test.ts'
      || file === 'tests/prelaunch-closed-r2-maintenance.test.ts'
      || ['tests/prelaunch-cooked-weight-attestation-successor.test.ts','tests/prelaunch-recipe-request-role-maintenance.test.ts','tests/prelaunch-recipe-save-maintenance.test.ts'].includes(file)
      || ['docs/engineering/beta-audit-four-ui-fixes-20261017.md','docs/engineering/mumeok-beta-v9-progress-20261013.md','docs/sync/CURRENT_SOURCE_OF_TRUTH.md'].includes(file)
      || /^docs\/engineering\/youtube-fingerprint-v2[-a-z0-9]*\.md$/u.test(file), 'unrelated-source');
    check(Array.isArray(pair) && pair.length === 2 && pair.every(value => value === null || SHA.test(value)), 'source-pair');
  }
  return new Set(Object.keys(digests).filter(file => file.startsWith('scripts/')));
}

export function fingerprintRecoveryAttemptDirectory(directory=FINGERPRINT_RECOVERY_DIRECTORY) {
  if (!existsSync(directory)) return null;
  const names=readdirSync(directory).filter(name=>/^attempt-[1-9][0-9]*$/u.test(name)).sort((a,b)=>Number(a.slice(8))-Number(b.slice(8)));
  return names.length?join(directory,names.at(-1)):null;
}
export function readFingerprintRecoveryAuthority(read, directory = FINGERPRINT_RECOVERY_DIRECTORY, readApproval = readFingerprintPlanApproval, allowPendingCompensation=false) {
  const authorityPath = join(directory, 'authority.json');
  const attempt=fingerprintRecoveryAttemptDirectory(directory);
  if (!existsSync(authorityPath)) {
    check(!attempt || existsSync(join(attempt,'not-applied.json')), 'pending-transition-reconcile-first');
    return null;
  }
  check(allowPendingCompensation || !existsSync(join(directory,'compensate-intent.json'))
    || existsSync(join(directory,'compensate-receipt.json')) || existsSync(join(directory,'compensate-not-applied.json')), 'pending-compensation-reconcile-first');
  const authority = JSON.parse(read(authorityPath));
  check(readApproval() === authority.planSha256, 'independent-approval-anchor');
  check(authority.schema === 'homecook.youtube-fingerprint-recovery-authority.v1'
    && SHA.test(authority.planSha256) && SHA.test(authority.receiptSha256)
    && authority.receiptName === 'apply-receipt.json', 'authority-shape');
  const planBytes = read(join(directory, 'plan.json')), receiptBytes = read(join(directory, authority.receiptName));
  check(fingerprintRecoveryHash(planBytes) === authority.planSha256 && fingerprintRecoveryHash(receiptBytes) === authority.receiptSha256, 'authority-bytes');
  const plan = JSON.parse(planBytes), receipt = JSON.parse(receiptBytes);
  check(receipt.planSha256 === authority.planSha256 && isDeepStrictEqual(receipt.origin, plan.origin), 'receipt-plan');
  const result = { authority, plan, receipt, pointer: { path: authorityPath, sha256: fingerprintRecoveryHash(read(authorityPath)) } };
  const compensationPath = join(directory, 'compensate-receipt.json');
  if (existsSync(compensationPath)) result.compensation = JSON.parse(read(compensationPath));
  return result;
}
export function fingerprintWorkerSuccessor(worker, recovery, origin, predecessorSha256) {
  if (!recovery) return worker;
  const { receipt, plan, authority } = recovery;
  check(plan.origin.v74ActivationSha256 === predecessorSha256 && isDeepStrictEqual(plan.origin.authority, origin), 'original-authority');
  check(isDeepStrictEqual(receipt.before,plan.before) && isDeepStrictEqual(receipt.beforePreserved,plan.beforePreserved), 'approved-preimage');
  check(receipt.before.policyRowSha256 === worker.policyRowSha256 && receipt.before.policyStableSha256 === worker.policyStableSha256, 'original-policy');
  let result = assertFingerprintReceipt(receipt, { predecessorSha256, origin: plan.origin, worker });
  if (recovery.compensation) {
    check(recovery.compensation.planSha256 === authority.planSha256
      && isDeepStrictEqual(recovery.compensation.before,receipt.after)
      && isDeepStrictEqual(recovery.compensation.beforePreserved,receipt.afterPreserved)
      && recovery.compensation.before.policyRowSha256 === result.policyRowSha256
      && recovery.compensation.before.policyStableSha256 === result.policyStableSha256, 'compensation-chain');
    result = assertFingerprintReceipt(recovery.compensation, { predecessorSha256: authority.receiptSha256, origin: plan.origin, worker: result });
  }
  return result;
}
export function assertFingerprintCurrentPolicy(recovery,policy,worker) {
  if (!recovery) return;
  const after=(recovery.compensation??recovery.receipt).after;
  check(isDeepStrictEqual(policy,after.policy) && worker.policyRowSha256===after.policyRowSha256
    && worker.policyStableSha256===after.policyStableSha256, 'live-full-policy-postimage');
}
