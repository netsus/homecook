// One directly authorized, noncredential web-tool repair. d397 remains bound to d69.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, fstatSync, lstatSync, readFileSync, readSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual as same } from 'node:util';
import { DeploymentError, readClosedR2PrivateBytes, loadProtectedRolloutReview, protectedRolloutPins, assertProtectedClosedR2Marker, loadClosedR2Review } from './prelaunch-web-deploy.mjs';
import { readV85Authority } from './youtube-v85-cutover.mjs';

export const READER_REPAIR = Object.freeze({
  base: 'd69fb50afe5d61530c3a3e0427ca4b477582792e',
  from: '06a3369f5c5e1c3ca49045f370f0ce12f049c805',
  target: '15b1a36f9b4c4c293cd8f92c6f2824b13ba7eaf9',
  capsule: 'd3979df6deca56efa906655fef86d29b1ec96e9e473f69625486e6a40594212e',
  cliBefore: '8d6fa4d85ceb11fbfa47867d79766602d613ba1b6b9ce288b8cfb0821ab8b569',
  cliAfter: 'e7e11ece2acd1e74316955c2cde346810a32eb0ce61972c21c95e50a6eb2ac5b',
  frozen: '/private/tmp/homecook-v85-auth-successor-20261018',
  executor: '/private/tmp/homecook-v85-web-reader-repair-20261018',
  launcher: '/private/tmp/homecook-v85-web-reader-launcher-20261018',
  manifest: 'scripts/manifests/v85-web-reader-repair-source-20261018.json',
  launcherFile: 'scripts/youtube-v85-web-reader-repair.mjs',
});
const R = READER_REPAIR, ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), HOME = homedir();
export const readerRepairHash = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (ok, code) => { if (!ok) throw new DeploymentError(`V85_WEB_READER_REPAIR_${code}`); };
export const readerRepairFiles = Object.freeze(['scripts/deploy-prelaunch-web.mjs',
  'scripts/lib/round2-closed-marker-rotation-bridge.mjs', 'scripts/youtube-v85-controlled-cutover.mjs',
  'scripts/lib/v85-web-reader-repair.mjs', R.launcherFile, 'tests/v85-web-reader-repair.test.ts',
  'tests/youtube-v85-auth-successor.test.ts', 'tests/v85-web-reader-compensation.test.mjs', 'tests/fixtures/v85-reader-state-shape-20261018.json', 'docs/engineering/v85-web-reader-repair-20261018.md', 'docs/sync/CURRENT_SOURCE_OF_TRUTH.md'].sort());
export const readerRepairEnvironment = () => ({ HOME, USER: process.env.USER ?? 'cwj', LOGNAME: process.env.LOGNAME ?? 'cwj',
  PATH: `${HOME}/.nvm/versions/node/v22.19.0/bin:${HOME}/.nvm/versions/node/v22.19.0/lib/node_modules/corepack/shims:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin`, LANG: 'C', LC_ALL: 'C', TZ: 'UTC' });
const run = (bin, args, options = {}) => {
  const r = spawnSync(bin, args, { env: readerRepairEnvironment(), encoding: 'utf8', timeout: 180000, maxBuffer: 1024 * 1024, ...options });
  check(r.status === 0, 'READ_ONLY_PROOF_FAILED'); return r.stdout.trim();
};
export const readerRepairGit = (root, args) => run('/usr/bin/git', ['-C', root, ...args]);
const gitBytes = (root, ref, file) => {
  const r = spawnSync('/usr/bin/git', ['-C', root, 'show', `${ref}:${file}`], { env: readerRepairEnvironment(), timeout: 15000, maxBuffer: 1024 * 1024 });
  check(r.status === 0, 'SOURCE_BLOB'); return r.stdout;
};
const privateRead = path => readClosedR2PrivateBytes(path, ROOT, 524288);
const exactKeys = (value, names) => value && typeof value === 'object' && !Array.isArray(value) && same(Object.keys(value).sort(), [...names].sort());

export function readerRepairArguments(action, toolRef) {
  check(['plan', 'deploy'].includes(action) && /^[a-f0-9]{40}$/u.test(toolRef), 'FIXED_ACTION');
  return [action, '--reviewed-ref', R.target, '--rotation-bridge-tool-ref', toolRef,
    '--env-file', join(HOME, '.homecook/operations/youtube-v85-gen50-20261017/web-metadata.env'),
    '--db-config', join(HOME, '.homecook/config/full-local-production.env'), '--already-applied-db', '--test-script', 'test:feedback-batch:web'];
}

export function assertReaderRepairPin(pin, observed) {
  check(exactKeys(pin, ['schema', 'baseToolRef', 'executorRef', 'executorTree', 'files'])
    && pin.schema === 'homecook.v85-web-reader-repair-source.v1' && pin.baseToolRef === R.base
    && /^[a-f0-9]{40}$/u.test(pin.executorRef) && pin.executorRef !== R.base && /^[a-f0-9]{40}$/u.test(pin.executorTree), 'SOURCE_PIN');
  check(exactKeys(pin.files, readerRepairFiles) && same(pin.files, observed.files)
    && observed.toolRef === pin.executorRef && observed.tree === pin.executorTree && observed.parent === R.base
    && observed.clean === true && observed.ownRepository === true, 'EXACT_SOURCE_BUNDLE');
  for (const pair of Object.values(pin.files)) check(Array.isArray(pair) && pair.length === 2
    && pair[0] !== pair[1] && pair[1] !== null && pair.every(h => h === null || /^[a-f0-9]{64}$/u.test(h)), 'SOURCE_DIGEST');
  check(same(pin.files['scripts/deploy-prelaunch-web.mjs'], [R.cliBefore, R.cliAfter]), 'EXACT_READER_AND_PREDECESSOR_BRIDGE');
  return pin;
}

export function reviewedReaderRepairCli(base) {
  const oldReader = 'JSON.parse(readClosedR2PrivateBytes(statePath, repository)).round2EightKeyRotation';
  const oldPredecessor = '    assertProtectedClosedR2Marker({ state: previous, marker, markerSha256: hash(markerBytes), live: { ref: previous.ref, cwd: previous.checkout, buildId: previous.buildId,\n      plistHash: hash(plistBytes), plist: parsePlist(plistBytes) }, closedReview: review, rollout, reviewSha256: protectedRolloutPins(rollout).rollout.sha256, ...protectedMarkerAuthority(marker, rollout) });';
  const newPredecessor = '    const previousLive = { ref: previous.ref, cwd: previous.checkout, buildId: previous.buildId, plistHash: hash(plistBytes), plist: parsePlist(plistBytes) };\n    assertProtectedClosedR2Marker({ state: previous, marker, markerSha256: hash(markerBytes), live: previousLive,\n      closedReview: review, rollout, reviewSha256: protectedRolloutPins(rollout).rollout.sha256, ...protectedMarkerAuthority(marker, rollout),\n      rotationBridge: closedMarkerRotationBridge(previous, marker, previousLive) });';
  check(base.split(oldReader).length === 2 && base.split(oldPredecessor).length === 2, 'EXACT_CLI_BASE');
  return base.replace(oldReader, 'JSON.parse(readClosedR2PrivateBytes(statePath, repository, 524288)).round2EightKeyRotation')
    .replace(oldPredecessor, newPredecessor);
}

export function assertReaderRepairPlumbing(base, current) {
  const bridgeImport = "import { readerRepairInvocation, bindReaderRepairWebTool, consumeReaderRepairReview } from './v85-web-reader-repair.mjs';\n";
  const bridgeBind = '  if (readerRepairInvocation()) return bindReaderRepairWebTool({toolRef,requestedToolRef,targetRef,capsuleSha256,clean,ownRepository,digests,untrackedPaths,authority});\n';
  const bridgeConfirm = '  if (consumeReaderRepairReview(review, display)) return;\n';
  const runnerImport = "import { readerRepairInvocation, verifyReaderRepairWebBoundary } from './lib/v85-web-reader-repair.mjs';\n";
  const runnerBoundary = '  if (readerRepairInvocation()) return verifyReaderRepairWebBoundary(authority);\n';
  const strip = (text, parts) => {
    for (const part of parts) { check(text.split(part).length === 2, 'EXACT_BINDING_INSERTION'); text = text.replace(part, ''); }
    return text;
  };
  check(strip(current.bridge, [bridgeImport, bridgeBind, bridgeConfirm]) === base.bridge
    && strip(current.runner, [runnerImport, runnerBoundary]) === base.runner, 'ONLY_WEB_BINDING_PLUMBING');
}

export function observeReaderRepairSource(root) {
  const g = args => readerRepairGit(root, args), paths = g(['diff', '--name-only', R.base, 'HEAD']).split('\n').filter(Boolean).sort();
  const files = Object.fromEntries(paths.map(file => [file, [R.base, 'HEAD'].map(ref => g(['ls-tree', ref, '--', file]) ? readerRepairHash(gitBytes(root, ref, file)) : null)]));
  return { toolRef: g(['rev-parse', 'HEAD']), tree: g(['rev-parse', 'HEAD^{tree}']), parent: g(['rev-parse', 'HEAD^']), files,
    clean: g(['status', '--porcelain']) === '', ownRepository: realpathSync(g(['rev-parse', '--show-toplevel'])) === root };
}

export function verifyReaderRepairLauncher(pin, parentRoot = R.launcher) {
  check(realpathSync(parentRoot) === R.launcher && readerRepairGit(parentRoot, ['status', '--porcelain']) === ''
    && readerRepairGit(parentRoot, ['rev-parse', 'HEAD^']) === pin.executorRef
    && readerRepairGit(parentRoot, ['diff', '--name-only', pin.executorRef, 'HEAD']) === R.manifest, 'EXACT_LAUNCHER_CHILD');
  check(same(JSON.parse(readFileSync(join(parentRoot, R.manifest), 'utf8')), pin)
    && readerRepairHash(readFileSync(join(parentRoot, R.launcherFile))) === pin.files[R.launcherFile][1], 'LAUNCHER_PIN');
  assertReaderRepairPin(pin, observeReaderRepairSource(R.executor));
  check(readFileSync(join(R.executor, 'scripts/deploy-prelaunch-web.mjs'), 'utf8') === reviewedReaderRepairCli(gitBytes(R.executor, R.base, 'scripts/deploy-prelaunch-web.mjs').toString()), 'ONLY_READER_AND_PREDECESSOR_BRIDGE');
  const base = { bridge: gitBytes(R.executor, R.base, 'scripts/lib/round2-closed-marker-rotation-bridge.mjs').toString(), runner: gitBytes(R.executor, R.base, 'scripts/youtube-v85-controlled-cutover.mjs').toString() };
  assertReaderRepairPlumbing(base, { bridge: readFileSync(join(R.executor, 'scripts/lib/round2-closed-marker-rotation-bridge.mjs'), 'utf8'), runner: readFileSync(join(R.executor, 'scripts/youtube-v85-controlled-cutover.mjs'), 'utf8') });
  check(readerRepairGit(R.frozen, ['rev-parse', 'HEAD']) === R.base && readerRepairGit(R.frozen, ['status', '--porcelain']) === '', 'ORIGINAL_TOOL_CHANGED');
  return readerRepairGit(parentRoot, ['rev-parse', 'HEAD']);
}

export function readReaderRepairAuthority() {
  const a = readV85Authority(privateRead);
  check(a?.planSha256 === R.capsule && !a.proof && a.plan.webRef === R.target && a.plan.authSuccessor?.toolRef === R.base, 'ORIGINAL_THREE_AUTHORITIES');
  return a;
}

let invocation;
let originalNoRecovery = false, ownedAttempt;
const reviews = new WeakSet();
export function readerRepairInvocation() {
  return Boolean(process.argv[1] && resolve(process.argv[1]) === join(ROOT, 'scripts/deploy-prelaunch-web.mjs')
    && ['plan', 'deploy'].includes(process.argv[2]) && ROOT === R.executor);
}
export function assertReaderRepairInvocation(proof, boundary) {
  check(exactKeys(proof, ['schema', 'pin', 'parentRoot', 'parentRef', 'parentPid', 'parentStart', 'nonce', 'issuedAt', 'action'])
    && proof.schema === 'homecook.v85-web-reader-repair-invocation.v1' && proof.parentRoot === R.launcher
    && proof.parentPid === boundary.parentPid && proof.parentStart === boundary.parentStart && proof.parentRef === boundary.parentRef
    && /^[a-f0-9-]{36}$/u.test(proof.nonce) && boundary.now - Date.parse(proof.issuedAt) >= 0
    && boundary.now - Date.parse(proof.issuedAt) <= 60000 && boundary.pipe === true
    && same(boundary.args, readerRepairArguments(proof.action, proof.pin.executorRef)), 'ONE_INVOCATION_PIPE_REQUIRED');
}
function sourceInvocation() {
  check(readerRepairInvocation() && process.platform === 'darwin', 'OFFICIAL_WEB_ONLY');
  if (!invocation) {
    const fd = 3, stat = fstatSync(fd); check(stat.isFIFO() || stat.isSocket(), 'PIPE_REQUIRED');
    const buffer = Buffer.alloc(65537); let offset = 0;
    try { while (offset < buffer.length) { const n = readSync(fd, buffer, offset, buffer.length - offset, null); if (!n) break; offset += n; } } finally { closeSync(fd); }
    check(offset <= 65536, 'PIPE_LIMIT'); const proof = JSON.parse(buffer.subarray(0, offset));
    const parentRef = verifyReaderRepairLauncher(proof.pin);
    const parentStart = run('/bin/ps', ['-p', String(process.ppid), '-o', 'lstart=']);
    check(Number(run('/bin/ps', ['-p', String(process.ppid), '-o', 'uid='])) === process.getuid(), 'PARENT_OWNER');
    const cwd = run('/usr/sbin/lsof', ['-a', '-p', String(process.ppid), '-d', 'cwd', '-Fn']).split('\n').filter(v => v.startsWith('n'));
    check(same(cwd, ['n' + R.launcher]), 'PARENT_CWD');
    const command = run('/bin/ps', ['-p', String(process.ppid), '-o', 'command=']);
    check(command === `${join(HOME, '.nvm/versions/node/v22.19.0/bin/node')} ${join(R.launcher, R.launcherFile)} ${proof.action}`, 'PARENT_LAUNCHER');
    assertReaderRepairInvocation(proof, { parentPid: process.ppid, parentStart, parentRef, now: Date.now(), pipe: true, args: process.argv.slice(2) });
    invocation = proof;
  }
  check(invocation.parentPid === process.ppid && invocation.parentRef === verifyReaderRepairLauncher(invocation.pin)
    && same(process.argv.slice(2), readerRepairArguments(invocation.action, invocation.pin.executorRef)), 'INVOCATION_CHANGED');
  return invocation;
}

export function assertOwnedReaderRepairRecovery(record, home = HOME) {
  const root = join(home, '.homecook/prelaunch-web/releases'), before = join(root, '06a3369f5c5e-EWuEsS/checkout');
  const match = /^prelaunch-15b1a36f9b4c-([A-Za-z0-9_-]{6})$/u.exec(record.buildId ?? '');
  const checkout = match ? join(root, '15b1a36f9b4c-' + match[1], 'checkout') : null;
  check(match && record.ref === R.target && record.checkout === checkout && record.previousCwd === before
    && record.previousBuildId === 'prelaunch-06a3369f5c5e-EWuEsS'
    && record.backup === join(dirname(checkout), 'previous.plist')
    && record.previousPlistHash === '7cc55b987327bd7eab11d44225e86af122481c701ce5dc153dc8284a00ce40d4'
    && /^[a-f0-9]{64}$/u.test(record.targetPlistHash) && record.targetPlistHash !== record.previousPlistHash
    && record.closedR2?.schema === 'homecook.prelaunch-closed-r2-state.v1' && record.closedR2.kind === 'continuation'
    && record.closedR2.from === R.from && record.closedR2.to === R.target && record.closedR2.activationAuthorized === false
    && record.closedR2.previousStateSha256 === '192df7b3c45244c45b03e5af57e0020e8d03124bbf065576e38a9df05c601098'
    && record.closedR2.targetPlistSha256 === record.targetPlistHash && record.closedR2.rollbackPlistSha256 === record.previousPlistHash,
    'FOREIGN_PREPARED_RECOVERY');
}
export function assertReaderRepairPredecessor(stateBytes, predecessorBytes, record) {
  // The official durableJson persists JSON.stringify(value) plus exactly one LF.
  // Keep the raw incident fingerprint and this independently pinned serialization.
  check(Buffer.from(predecessorBytes).equals(Buffer.from(JSON.stringify(JSON.parse(stateBytes)) + '\n'))
    && readerRepairHash(predecessorBytes) === record.closedR2.previousStateSha256, 'PREDECESSOR_SERIALIZATION_CHANGED');
}
function assertUntransitionedIncident() {
  const root = join(HOME, '.homecook/prelaunch-web'), directory = join(root, 'v85-unstarted-web-closeout-20261018');
  for (const [name, hash] of [['state.json', '2703ca7a444bae6015c80664ef859b35858cf039e22a3c7f4668d30ad7437b6f'],
    ['v85-unstarted-web-closeout-20261018/complete.json', '07eba6c533b813e0a63311fbc9c6c7d03e0e8e3979b3749616567fb5488ac7c6'],
    ['v85-unstarted-web-closeout-20261018/intent.json', '389efc11162efb6c5503d30f2add4d847a6bbf609fabf6248cb3aaf19f08eab3'],
    ['v85-unstarted-web-closeout-20261018/recovery.json', 'bddb7e174b80ecc4512dcc845933e75d81222e475eb450bfe600ba38cb7fb44e'],
    ['v85-reader-attempt-closeout-20261018/intent.json', '9f218d01276fed875d2958e6f4c3a3fb41e93850e2dd8f8af96f4136e24826f0'],
    ['v85-reader-attempt-closeout-20261018/recovery.json', '1631d134cdfe455540605836d21435010b72d44480b1386d44f07c0f91c0d627'],
    ['v85-reader-attempt-closeout-20261018/complete.json', '61505f3177d3cbdd29e38d30d1488d2e7cf866e4d97a10892ee736cd0e62ccb7']])
    check(readerRepairHash(privateRead(join(root, name))) === hash, 'INCIDENT_CHANGED');
  check(JSON.parse(privateRead(join(directory, 'complete.json'))).phase === 'complete', 'CLOSEOUT_REQUIRED');
  const recovery = join(root, 'recovery.json');
  if (!existsSync(recovery)) {
    check(!ownedAttempt, 'OWNED_RECOVERY_DISAPPEARED'); originalNoRecovery = true;
  } else {
    // The exact official CLI creates its own recovery after preparation and before
    // its final source check. A pre-existing or foreign recovery is never admitted.
    check(originalNoRecovery && invocation.action === 'deploy', 'PREEXISTING_RECOVERY');
    const lock = lstatSync(join(root, 'deploy.lock'));
    check(lock.isDirectory() && !lock.isSymbolicLink() && lock.uid === process.getuid() && (lock.mode & 0o777) === 0o700, 'DEPLOY_LOCK_REQUIRED');
    const bytes = privateRead(recovery), record = JSON.parse(bytes); assertOwnedReaderRepairRecovery(record);
    assertReaderRepairPredecessor(privateRead(join(root, 'state.json')), privateRead(join(dirname(record.checkout), 'previous-closed-state.json')), record);
    check(readerRepairHash(privateRead(record.backup)) === record.previousPlistHash
      && readerRepairHash(privateRead(join(dirname(record.backup), 'closed-rollback.plist'))) === record.previousPlistHash
      && readerRepairGit(record.checkout, ['rev-parse', 'HEAD']) === R.target
      && readerRepairGit(record.checkout, ['status', '--porcelain', '--untracked-files=no']) === ''
      && readFileSync(join(record.checkout, '.next/BUILD_ID'), 'utf8').trim() === record.buildId, 'OWNED_PREPARATION');
    const identity = { sha256: readerRepairHash(bytes), ino: lock.ino, dev: lock.dev };
    check(!ownedAttempt || same(ownedAttempt, identity), 'OWNED_ATTEMPT_CHANGED'); ownedAttempt = identity;
  }
  const script = `import importlib.util,json,sys\nfrom pathlib import Path\ns=importlib.util.spec_from_file_location('r2apply',sys.argv[1]);a=importlib.util.module_from_spec(s);s.loader.exec_module(a)\ncwd=Path.home()/'.homecook/prelaunch-web/releases/06a3369f5c5e-EWuEsS/checkout';rows=a.census(cwd);a.web_smoke(cwd)\nprint(json.dumps(rows))`;
  check(same(JSON.parse(run('/usr/bin/python3', ['-B', '-c', script, join(R.frozen, 'scripts/round2-eight-key-user-apply.py')])),
    [{ pid: 68884, ppid: 1, start: 'Sat Oct 17 02:01:05 2026' }, { pid: 68891, ppid: 68884, start: 'Sat Oct 17 02:01:05 2026' }]), 'ORIGINAL_06A_PROCESS');
}

export function bindReaderRepairWebTool(input) {
  const proof = sourceInvocation(), a = readReaderRepairAuthority();
  check(input.toolRef === proof.pin.executorRef && input.requestedToolRef === input.toolRef && input.targetRef === R.target
    && input.capsuleSha256 === R.capsule && same(input.authority, a) && input.clean === true && input.ownRepository === true
    && same(input.untrackedPaths, []), 'WEB_BINDING');
  // The CLI's cumulative target15 -> tool digest must also be computed from the actual checkout.
  const files = readerRepairGit(ROOT, ['diff', '--name-only', R.target, 'HEAD']).split('\n').filter(Boolean).sort();
  const actual = Object.fromEntries(files.map(p => [p, [R.target, 'HEAD'].map(ref => readerRepairGit(ROOT, ['ls-tree', ref, '--', p]) ? readerRepairHash(gitBytes(ROOT, ref, p)) : null)]));
  check(same(input.digests, actual), 'CUMULATIVE_SOURCE_CHANGED'); assertUntransitionedIncident();
  const review = { toolRef: input.toolRef, originalToolRef: R.base, targetRef: R.target, capsuleSha256: R.capsule,
    historicalCapsuleSha256: 'cf5a80513d4e532c2319344af8d72c23375d2fc24fdabc2864dee318dfe11ad5', operatingChanged: false,
    sourceDeltaSha256: readerRepairHash(JSON.stringify(proof.pin.files)), webOnlyReaderRepair: true,
    executionAuthorization: 'direct-user-v85-web-reader-repair-20261018', capsuleApprovalUnchanged: true, credentialIssued: false };
  reviews.add(review); return review;
}
export function consumeReaderRepairReview(review, display) {
  if (!reviews.has(review)) return false;
  sourceInvocation(); readReaderRepairAuthority(); assertUntransitionedIncident(); reviews.delete(review);
  display({ ...review, userExecutionRequired: false, invocationBound: true, keysRemainNew: true, collectionAndLeadRemainOff: true }); return true;
}
export async function verifyReaderRepairWebBoundary(authority) {
  sourceInvocation(); check(same(authority, readReaderRepairAuthority()), 'FRESH_AUTHORITY'); assertUntransitionedIncident();
  const url = p => JSON.stringify(pathToFileURL(join(R.frozen, p)).href);
  const script = `import{readV85Authority}from ${url('scripts/lib/youtube-v85-cutover.mjs')};import{readClosedR2PrivateBytes}from ${url('scripts/lib/prelaunch-web-deploy.mjs')};import{verifyV85AuthSuccessorWebBoundary}from ${url('scripts/youtube-v85-controlled-cutover.mjs')};
const a=readV85Authority(p=>readClosedR2PrivateBytes(p,${JSON.stringify(R.frozen)},524288));if(a?.planSha256!==${JSON.stringify(R.capsule)}||a.proof)throw Error('authority');await verifyV85AuthSuccessorWebBoundary(a);process.stdout.write('V85_READER_REPAIR_FULL_PREIMAGE_OK');`;
  check(run(join(HOME, '.nvm/versions/node/v22.19.0/bin/node'), ['--input-type=module', '-e', script]) === 'V85_READER_REPAIR_FULL_PREIMAGE_OK', 'FULL_PREIMAGE');
  sourceInvocation(); assertUntransitionedIncident(); check(same(authority, readReaderRepairAuthority()), 'POST_PROOF_AUTHORITY');
}

export function assertReaderRepairPostUnchanged(before, after) {
  check(before.ref === R.target && before.recoveryPending === false && before.sourceClean === true && before.startupEightMatch === true
    && same(before, after), 'POST_STATE_PROCESS_OR_RECOVERY_DRIFT');
}
export async function verifyReaderRepairWebAfter(pin) {
  verifyReaderRepairLauncher(pin); readReaderRepairAuthority();
  const root = join(HOME, '.homecook/prelaunch-web'), stateBytes = privateRead(join(root, 'state.json')), state = JSON.parse(stateBytes);
  const path = join(HOME, 'Library/LaunchAgents/com.homecook.production.plist'), info = lstatSync(path);
  check(info.isFile() && !info.isSymbolicLink() && info.uid === process.getuid() && info.nlink === 1
    && (info.mode & 0o777) === 0o600 && info.size < 65536, 'POST_PLIST');
  const bytes = readFileSync(path), plist = JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', '-'], { input: bytes }));
  check(state.ref === R.target && readerRepairGit(plist.WorkingDirectory, ['rev-parse', 'HEAD']) === R.target
    && state.checkout === plist.WorkingDirectory && state.buildId === readFileSync(join(state.checkout, '.next/BUILD_ID'), 'utf8').trim()
    && state.targetPlistHash === readerRepairHash(bytes) && !existsSync(join(root, 'recovery.json')), 'POST_EXACT15_RECEIPT');
  check(readerRepairHash(privateRead(state.backup)) === '7cc55b987327bd7eab11d44225e86af122481c701ce5dc153dc8284a00ce40d4'
    && readerRepairHash(privateRead(join(dirname(state.backup), 'closed-rollback.plist'))) === '7cc55b987327bd7eab11d44225e86af122481c701ce5dc153dc8284a00ce40d4', 'POST_NEW_KEY06A_BACKUP');
  for (const p of ['/', '/login', '/privacy']) check((await fetch('http://127.0.0.1:3100' + p, { signal: AbortSignal.timeout(5000) })).ok, 'POST_HTTP');
  const manifest = `/_next/static/${state.buildId}/_buildManifest.js`, response = await fetch('http://127.0.0.1:3100' + manifest, { signal: AbortSignal.timeout(5000) });
  check(response.ok && readerRepairHash(Buffer.from(await response.arrayBuffer())) === readerRepairHash(readFileSync(join(state.checkout, '.next/static', state.buildId, '_buildManifest.js'))), 'POST_MANIFEST');
  const closed = await fetch('http://127.0.0.1:3100/api/v1/marketing/round2', { method: 'POST', body: '{}', signal: AbortSignal.timeout(5000),
    headers: { Host: 'app.mumeok.kr', Origin: 'https://app.mumeok.kr', 'Content-Type': 'application/json' } });
  check(closed.status === 503 && (await closed.json()).error?.code === 'ROUND2_DISABLED', 'POST_R2_OFF');
  const script = `import importlib.util,json,sys\nfrom pathlib import Path\ns=importlib.util.spec_from_file_location('r2apply',sys.argv[1]);a=importlib.util.module_from_spec(s);s.loader.exec_module(a)\ncwd=Path(sys.argv[2]);rows=a.census(cwd);f=json.loads(a.stage.private_file(Path.home()/'.homecook/prelaunch-web/round2-eight-key-rotation-fence.json'))\nfor row in rows: a.require(a.process_fingerprints(row,cwd)==f['approved_fingerprints'],'PROCESS_KEYS_NOT_LOADED')\na.require(a.census(cwd)==rows,'POST_PROCESS_CHANGED');print(json.dumps(rows))`;
  const processes = JSON.parse(run('/usr/bin/python3', ['-B', '-c', script, join(R.frozen, 'scripts/round2-eight-key-user-apply.py'), state.checkout]));
  const before = { stateSha256: readerRepairHash(stateBytes), plistSha256: readerRepairHash(bytes), ref: R.target,
    buildId: state.buildId, processes, recoveryPending: false, startupEightMatch: true,
    sourceClean: readerRepairGit(state.checkout, ['status', '--porcelain', '--untracked-files=no']) === '' };
  // The original helper still validates all three immutable authorities, the whole
  // protected projection, original42/43, unchanged active49 and the new-key/OFF binding.
  const url = p => JSON.stringify(pathToFileURL(join(R.frozen, p)).href);
  const proofScript = `import{readV85Authority}from ${url('scripts/lib/youtube-v85-cutover.mjs')};import{readClosedR2PrivateBytes}from ${url('scripts/lib/prelaunch-web-deploy.mjs')};import{verifyV85AuthSuccessorWebBoundary}from ${url('scripts/youtube-v85-controlled-cutover.mjs')};const a=readV85Authority(p=>readClosedR2PrivateBytes(p,${JSON.stringify(R.frozen)},524288));if(a?.planSha256!==${JSON.stringify(R.capsule)}||a.proof)throw Error('authority');await verifyV85AuthSuccessorWebBoundary(a);process.stdout.write('UNCHANGED_DB232_49_43_UNISSUED');`;
  check(run(join(HOME, '.nvm/versions/node/v22.19.0/bin/node'), ['--input-type=module', '-e', proofScript]) === 'UNCHANGED_DB232_49_43_UNISSUED', 'POST_FULL_DATABASE');
  verifyReaderRepairLauncher(pin);
  const after = { stateSha256: readerRepairHash(privateRead(join(root, 'state.json'))), plistSha256: readerRepairHash(readFileSync(path)),
    ref: readerRepairGit(state.checkout, ['rev-parse', 'HEAD']), buildId: readFileSync(join(state.checkout, '.next/BUILD_ID'), 'utf8').trim(),
    processes: JSON.parse(run('/usr/bin/python3', ['-B', '-c', script, join(R.frozen, 'scripts/round2-eight-key-user-apply.py'), state.checkout])),
    recoveryPending: existsSync(join(root, 'recovery.json')), startupEightMatch: true,
    sourceClean: readerRepairGit(state.checkout, ['status', '--porcelain', '--untracked-files=no']) === '' };
  assertReaderRepairPostUnchanged(before, after);
  return { webTransitioned: true, webRef: R.target, buildId: state.buildId, processes, dbLedger: 232, jobs: 43,
    workerGeneration: 49, workerPid: 49750, credentialIssued: false, originalAuthoritiesPreserved: true,
    actualStartupEightMatch: true, round2Off: true, recoveryPending: false, waitingForOriginalCredentialBoundary: true };
}

// Read-only rehearsal against the exact preserved incident and actual pinned bridge.
// This does not call switchWeb or write any service/DB/credential state.
export function verifyReaderRepairCompensationPreflight() {
  const root = join(HOME, '.homecook/prelaunch-web'), statePath = join(root, 'state.json');
  const raw = privateRead(statePath), state = JSON.parse(raw);
  check(readerRepairHash(raw) === '2703ca7a444bae6015c80664ef859b35858cf039e22a3c7f4668d30ad7437b6f', 'COMPENSATION_RAW_STATE');
  const record = JSON.parse(privateRead(join(root, 'v85-reader-attempt-closeout-20261018/recovery.json')));
  assertOwnedReaderRepairRecovery(record);
  const previous = privateRead(join(dirname(record.checkout), 'previous-closed-state.json'));
  assertReaderRepairPredecessor(raw, previous, record);
  const markerBytes = privateRead(join(dirname(state.checkout), 'round2-closed-maintenance.json')), marker = JSON.parse(markerBytes);
  check(readerRepairHash(markerBytes) === state.closedR2.artifactSha256
    && readerRepairHash(markerBytes) === record.closedR2.previousArtifactSha256, 'COMPENSATION_MARKER');
  const plistBytes = privateRead(record.backup);
  check(readerRepairHash(plistBytes) === '7cc55b987327bd7eab11d44225e86af122481c701ce5dc153dc8284a00ce40d4'
    && privateRead(join(dirname(record.backup), 'closed-rollback.plist')).equals(plistBytes), 'COMPENSATION_NEW_EIGHT_ONLY');
  const parse = bytes => JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', '-'], { input: bytes }));
  const plist = parse(plistBytes), env = plist.EnvironmentVariables;
  const rollout = loadProtectedRolloutReview(ROOT, { reviewSha256: marker.protectedRollout.reviewSha256 });
  const pointer = marker.protectedRollout;
  const db = privateRead(pointer.databaseReceipt.path), reader = privateRead(pointer.readerReceipt.path);
  check(readerRepairHash(db) === pointer.databaseReceipt.sha256 && readerRepairHash(db) === pointer.databaseReceiptSha256
    && readerRepairHash(reader) === pointer.readerReceipt.sha256 && readerRepairHash(reader) === pointer.readerReceiptSha256, 'COMPENSATION_RECEIPTS');
  const beforePlistBytes = privateRead(join(root, 'releases/7b4b74d12eb1-f1VAGt/previous.plist'));
  const stage = join(root, 'round2-eight-key-rotation-stage-20261017'), op = join(root, 'round2-eight-key-rotation-apply-20261017');
  const bridge = { authority: readReaderRepairAuthority(), stateBytes: raw,
    beforeBytes: privateRead(join(op, 'state-before.json')), afterBytes: privateRead(join(op, 'state-after.json')),
    receiptBytes: privateRead(join(stage, 'receipt.json')), journalBytes: privateRead(join(op, 'journal.json')),
    fenceBytes: privateRead(join(root, 'round2-eight-key-rotation-fence.json')), controlBytes: privateRead(env.MUMEOK_ROUND2_CONTROL_PATH),
    armExists: Boolean(env.MUMEOK_ROUND2_PREFLIGHT_ARM_PATH && existsSync(env.MUMEOK_ROUND2_PREFLIGHT_ARM_PATH)),
    beforePlistBytes, beforePlist: parse(beforePlistBytes) };
  // Use the same protected marker validator as previousClosedR2State, including its
  // independent event hashes. The canonical predecessor is never used as raw bytes.
  const closedReview = loadClosedR2Review(ROOT);
  assertProtectedClosedR2Marker({ state, marker, markerSha256: readerRepairHash(markerBytes),
    live: { ref: state.ref, cwd: state.checkout, buildId: state.buildId, plistHash: readerRepairHash(plistBytes), plist },
    closedReview, rollout, reviewSha256: protectedRolloutPins(rollout).rollout.sha256,
    databaseReceipt: JSON.parse(db), databaseReceiptSha256: readerRepairHash(db), readerReceipt: JSON.parse(reader), readerReceiptSha256: readerRepairHash(reader), rotationBridge: bridge });
  check(privateRead(statePath).equals(raw), 'COMPENSATION_STATE_CHANGED');
  return { compensationPreflightVerified: true, startupOrDatabaseChanged: false, newEightOnly: true, collectionAndLeadOff: true };
}
