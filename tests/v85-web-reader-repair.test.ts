import { afterEach, describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { READER_REPAIR as R, readerRepairFiles, readerRepairArguments, assertReaderRepairPin,
  assertReaderRepairPlumbing, assertReaderRepairInvocation, consumeReaderRepairReview, readerRepairEnvironment,
  readerRepairInvocation, readerRepairHash, bindReaderRepairWebTool, assertOwnedReaderRepairRecovery, assertReaderRepairPostUnchanged, assertReaderRepairPredecessor, reviewedReaderRepairCli } from '../scripts/lib/v85-web-reader-repair.mjs';
import { confirmRotationBridgeTool } from '../scripts/lib/round2-closed-marker-rotation-bridge.mjs';
import { assertV85AuthSuccessorTool } from '../scripts/lib/youtube-v85-cutover.mjs';
import { durableJson } from '../scripts/lib/marketing-round2-controlled-deploy.mjs';
import { readClosedR2PrivateBytes, deployTransaction } from '../scripts/lib/prelaunch-web-deploy.mjs';
const stateShape = JSON.parse(readFileSync('tests/fixtures/v85-reader-state-shape-20261018.json', 'utf8'));
const fixtureState = JSON.stringify(stateShape.state);
const h = 'a'.repeat(64), other = 'b'.repeat(64), tool = 'c'.repeat(40), tree = 'd'.repeat(40);
function fixture() {
  const files: Record<string, (string | null)[]> = Object.fromEntries(readerRepairFiles.map(p => [p, p.startsWith('docs/') ? [h, other] : [null, h]]));
  files['scripts/deploy-prelaunch-web.mjs'] = [R.cliBefore, R.cliAfter];
  const pin = { schema: 'homecook.v85-web-reader-repair-source.v1', baseToolRef: R.base, executorRef: tool, executorTree: tree, files };
  const observed = { toolRef: tool, tree, parent: String(R.base), files: structuredClone(files), clean: true, ownRepository: true };
  return { pin, observed };
}
describe('a separately reviewed noncredential web source bundle', () => {
  it('keeps the original credential capsule/tool binding and accepts the exact reader repair bundle', () => {
    const { pin, observed } = fixture(); expect(assertReaderRepairPin(pin, observed)).toBe(pin);
    expect(R.base).toBe('d69fb50afe5d61530c3a3e0427ca4b477582792e'); expect(R.capsule).toBe('d3979df6deca56efa906655fef86d29b1ec96e9e473f69625486e6a40594212e');
    expect(readerRepairArguments('deploy', tool)).toContain(R.target);
    expect(readerRepairArguments('deploy', tool)[1]).toBe('--reviewed-ref');
  });
  for (const mutation of ['tool', 'tree', 'parent', 'dirty', 'untracked', 'other-repository', 'extra-file', 'missing-file', 'one-more-reader-edit', 'new-capsule-field'])
    it('rejects ' + mutation, () => {
      const { pin, observed } = fixture();
      if (mutation === 'tool') observed.toolRef = 'f'.repeat(40);
      if (mutation === 'tree') observed.tree = 'f'.repeat(40);
      if (mutation === 'parent') observed.parent = 'f'.repeat(40);
      if (mutation === 'dirty' || mutation === 'untracked') observed.clean = false;
      if (mutation === 'other-repository') observed.ownRepository = false;
      if (mutation === 'extra-file') { pin.files['app/unrelated.tsx'] = [h, other]; observed.files['app/unrelated.tsx'] = [h, other]; }
      if (mutation === 'missing-file') { delete pin.files['scripts/lib/v85-web-reader-repair.mjs']; delete observed.files['scripts/lib/v85-web-reader-repair.mjs']; }
      if (mutation === 'one-more-reader-edit') { pin.files['scripts/deploy-prelaunch-web.mjs'][1] = other; observed.files['scripts/deploy-prelaunch-web.mjs'][1] = other; }
      if (mutation === 'new-capsule-field') Object.assign(pin, { reapprovedCredential: true });
      expect(() => assertReaderRepairPin(pin, observed)).toThrow('V85_WEB_READER_REPAIR_');
    });
  for (const file of readerRepairFiles) it('rejects changed bytes in the reviewed complete source pin: ' + file, () => {
    const { pin, observed } = fixture(); observed.files[file][1] = 'f'.repeat(64);
    expect(() => assertReaderRepairPin(pin, observed)).toThrow('EXACT_SOURCE_BUNDLE');
  });
  it('changes the official web CLI only by the reviewed private reader and predecessor bridge', () => {
    const path = 'scripts/deploy-prelaunch-web.mjs', before = execFileSync('git', ['show', `${R.base}:${path}`]);
    const actual = readFileSync(path), old = 'JSON.parse(readClosedR2PrivateBytes(statePath, repository)).round2EightKeyRotation';
    expect(before.toString().split(old)).toHaveLength(2);
    expect(actual.toString()).toBe(reviewedReaderRepairCli(before.toString()));
    expect(actual.toString()).toContain('rotationBridge: closedMarkerRotationBridge(previous, marker, previousLive)');
    expect(readerRepairHash(before)).toBe(R.cliBefore); expect(readerRepairHash(actual)).toBe(R.cliAfter);
  });
  it('allows only explicit bridge and exported web-boundary plumbing, leaving actual issuer main/functions untouched', () => {
    const names = { bridge: 'scripts/lib/round2-closed-marker-rotation-bridge.mjs', runner: 'scripts/youtube-v85-controlled-cutover.mjs' };
    const base = Object.fromEntries(Object.entries(names).map(([k, p]) => [k, execFileSync('git', ['show', `${R.base}:${p}`]).toString()]));
    const current = Object.fromEntries(Object.entries(names).map(([k, p]) => [k, readFileSync(p, 'utf8')]));
    expect(() => assertReaderRepairPlumbing(base, current)).not.toThrow();
    for (const patch of ["'apply'", 'issueWorker:async()=>', 'assertAuthTool(authority.plan)', 'verifyV85AuthSuccessorWebBoundary(authority)']) {
      const changed = { ...current, runner: current.runner.replace(patch, patch + ' /* unwanted change */') };
      expect(() => assertReaderRepairPlumbing(base, changed)).toThrow();
    }
    expect(() => assertReaderRepairPlumbing(base, { ...current, bridge: current.bridge + '\n// extra change' })).toThrow();
  });
  it('does not add this repair path to approve/apply/resume or relax the original reviewed-tool check', () => {
    expect(readerRepairInvocation()).toBe(false);
    for (const action of ['approve-plan', 'apply', 'resume', 'rollback']) expect(() => readerRepairArguments(action, tool)).toThrow('FIXED_ACTION');
    const source = readFileSync('scripts/youtube-v85-controlled-cutover.mjs', 'utf8');
    const start = source.indexOf('async function main()'), original = execFileSync('git', ['show', `${R.base}:scripts/youtube-v85-controlled-cutover.mjs`]).toString();
    expect(source.slice(start)).toBe(original.slice(original.indexOf('async function main()')));
    expect(() => assertV85AuthSuccessorTool({ plan: {}, toolRef: tool, digests: {}, clean: true, untrackedPaths: [], ownRepository: true })).toThrow();
  });
});

describe('one invocation proof; no general TTY-off flag', () => {
  function fixtureProof() {
    const { pin } = fixture();
    const proof = { schema: 'homecook.v85-web-reader-repair-invocation.v1', pin, parentRoot: R.launcher, parentRef: 'e'.repeat(40),
      parentPid: 1234, parentStart: 'fixed start', nonce: 'a'.repeat(8) + '-aaaa-aaaa-aaaa-' + 'a'.repeat(12), issuedAt: '2026-10-18T10:00:00Z', action: 'deploy' };
    const boundary = { parentPid: 1234, parentStart: 'fixed start', parentRef: 'e'.repeat(40), now: Date.parse('2026-10-18T10:00:10Z'), pipe: true,
      args: readerRepairArguments('deploy', tool) };
    return { proof, boundary };
  }
  it('accepts only the exact parent identity, fresh pipe and fixed official command', () => {
    const { proof, boundary } = fixtureProof(); expect(() => assertReaderRepairInvocation(proof, boundary)).not.toThrow();
  });
  for (const mutation of ['regular-file', 'stale', 'future', 'other-parent', 'new-parent-start', 'new-parent-source', 'other-target', 'skip-tests', 'other-config', 'other-action', 'unknown-proof-field'])
    it('rejects ' + mutation, () => {
      const { proof, boundary } = fixtureProof();
      if (mutation === 'regular-file') boundary.pipe = false;
      if (mutation === 'stale') boundary.now += 61000;
      if (mutation === 'future') boundary.now -= 11000;
      if (mutation === 'other-parent') boundary.parentPid++;
      if (mutation === 'new-parent-start') boundary.parentStart = 'later';
      if (mutation === 'new-parent-source') boundary.parentRef = 'f'.repeat(40);
      if (mutation === 'other-target') boundary.args[2] = R.from;
      if (mutation === 'skip-tests') boundary.args.push('--skip-automated-tests');
      if (mutation === 'other-config') boundary.args[8] = '/other/config';
      if (mutation === 'other-action') boundary.args[0] = 'apply';
      if (mutation === 'unknown-proof-field') Object.assign(proof, { skipConfirmation: true });
      expect(() => assertReaderRepairInvocation(proof, boundary)).toThrow('ONE_INVOCATION_PIPE_REQUIRED');
    });
  it('cannot replace a fresh in-process review with an arbitrary or serialized object', async () => {
    const forged = { webOnlyReaderRepair: true, invocationBound: true, capsuleSha256: R.capsule, toolRef: tool };
    expect(consumeReaderRepairReview(forged, () => { throw Error('must not display'); })).toBe(false);
    await expect(confirmRotationBridgeTool(forged, { platform: 'darwin', stdinTTY: false, stdoutTTY: false, stderrTTY: false }, () => {}, () => 'V85-BRIDGE')).rejects.toThrow();
    expect(() => bindReaderRepairWebTool(forged)).toThrow('OFFICIAL_WEB_ONLY');
  });
  it('does not inherit NODE_OPTIONS or secret-bearing caller environment', () => {
    const saved = process.env.NODE_OPTIONS; process.env.NODE_OPTIONS = '--require /untrusted.js';
    try { expect(readerRepairEnvironment()).not.toHaveProperty('NODE_OPTIONS'); expect(readerRepairEnvironment()).not.toHaveProperty('OPENAI_API_KEY');
      expect(readerRepairEnvironment()).not.toHaveProperty('PYTHONPATH');
      expect(readerRepairEnvironment().PATH.indexOf('/usr/bin')).toBeLessThan(readerRepairEnvironment().PATH.indexOf('/opt/homebrew/bin')); }
    finally { if (saved === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = saved; }
  });
  it('uses the official deploy command, pipe-only proof and original noncredential preflight before launch', () => {
    const source = readFileSync(join('scripts', 'youtube-v85-web-reader-repair.mjs'), 'utf8');
    expect(source).toContain("'scripts/youtube-v85-controlled-cutover.mjs'), 'preflight'");
    expect(source).toContain("stdio: ['ignore', 'inherit', 'inherit', 'pipe']");
    expect(source).toContain("join(R.executor, 'scripts/deploy-prelaunch-web.mjs')");
    expect(source).not.toContain("'apply'"); expect(source).not.toContain("'resume'"); expect(source).not.toContain('registerV85Approval');
  });
});

describe('all post checks must finish before success is reported', () => {
  const before = { stateSha256: h, plistSha256: other, ref: R.target, buildId: 'build15',
    processes: [{ pid: 100, ppid: 1, start: 'fixed-start' }, { pid: 101, ppid: 100, start: 'fixed-start' }],
    recoveryPending: false, startupEightMatch: true, sourceClean: true };
  it('accepts the same exact source/state/build/PIDs/startup epoch after the full DB proof', () => {
    expect(() => assertReaderRepairPostUnchanged(before, structuredClone(before))).not.toThrow();
  });
  for (const key of ['stateSha256', 'plistSha256', 'ref', 'buildId', 'processes', 'recoveryPending', 'startupEightMatch', 'sourceClean'])
    it('refuses drift of ' + key, () => {
      const after = structuredClone(before) as Record<string, unknown>;
      after[key] = key === 'processes' ? [{ pid: 100, ppid: 1, start: 'reused-pid-new-start' }] : 'changed';
      expect(() => assertReaderRepairPostUnchanged(before, after)).toThrow('POST_STATE_PROCESS_OR_RECOVERY_DRIFT');
    });
  it('does not print a success object before the final unchanged assertion', () => {
    const source = readFileSync('scripts/lib/v85-web-reader-repair.mjs', 'utf8').split('export async function verifyReaderRepairWebAfter(pin) {')[1];
    expect(source).not.toContain('process.stdout.write(JSON.stringify({ webTransitioned');
    expect(source.indexOf('assertReaderRepairPostUnchanged(before, after)')).toBeLessThan(source.indexOf('return { webTransitioned: true'));
  });
});

describe('only this invocation may admit its newly prepared fixed15 recovery', () => {
  function prepared() {
    const home = '/fixture', checkout = '/fixture/.homecook/prelaunch-web/releases/15b1a36f9b4c-ABC123/checkout';
    const record = { ref: String(R.target), buildId: 'prelaunch-15b1a36f9b4c-ABC123', checkout,
      previousCwd: '/fixture/.homecook/prelaunch-web/releases/06a3369f5c5e-EWuEsS/checkout', previousBuildId: 'prelaunch-06a3369f5c5e-EWuEsS',
      backup: '/fixture/.homecook/prelaunch-web/releases/15b1a36f9b4c-ABC123/previous.plist',
      previousPlistHash: '7cc55b987327bd7eab11d44225e86af122481c701ce5dc153dc8284a00ce40d4', targetPlistHash: h,
      closedR2: { schema: 'homecook.prelaunch-closed-r2-state.v1', kind: 'continuation', from: String(R.from), to: String(R.target), activationAuthorized: false,
        previousStateSha256: '192df7b3c45244c45b03e5af57e0020e8d03124bbf065576e38a9df05c601098', targetPlistSha256: h,
        rollbackPlistSha256: '7cc55b987327bd7eab11d44225e86af122481c701ce5dc153dc8284a00ce40d4' } };
    return { home, record };
  }
  it('admits only the exact fixed target with this fresh build and new-key06a backup', () => {
    const { home, record } = prepared(); expect(() => assertOwnedReaderRepairRecovery(record, home)).not.toThrow();
  });
  for (const mutation of ['old-backup', 'other-target', 'old-current', 'other-build', 'other-state', 'other-rollback', 'activation-on'])
    it('rejects ' + mutation, () => {
      const { home, record } = prepared();
      if (mutation === 'old-backup') record.backup = '/fixture/.homecook/prelaunch-web/releases/06a3369f5c5e-EWuEsS/previous.plist';
      if (mutation === 'other-target') record.ref = 'f'.repeat(40);
      if (mutation === 'old-current') record.previousCwd = '/other/checkout';
      if (mutation === 'other-build') record.buildId += '-extra';
      if (mutation === 'other-state') record.closedR2.previousStateSha256 = h;
      if (mutation === 'other-rollback') record.closedR2.rollbackPlistSha256 = h;
      if (mutation === 'activation-on') record.closedR2.activationAuthorized = true;
      expect(() => assertOwnedReaderRepairRecovery(record, home)).toThrow('FOREIGN_PREPARED_RECOVERY');
    });
});

describe('actual recovery filesystem transition in the exact pre-switch guard', () => {
  const directories: string[] = [];
  afterEach(() => { for (const d of directories.splice(0)) rmSync(d, { recursive: true, force: true }); });
  function fixtureGuard(action = 'deploy') {
    const home = mkdtempSync(join(realpathSync(tmpdir()), 'v85-attempt-')); directories.push(home); chmodSync(home, 0o700);
    const root = join(home, '.homecook/prelaunch-web'), closed = join(root, 'v85-unstarted-web-closeout-20261018');
    mkdirSync(closed, { recursive: true, mode: 0o700 });
    mkdirSync(join(root, 'v85-reader-attempt-closeout-20261018'), { mode: 0o700 });
    const overrides = new Map<string, string>();
    for (const [name, bytes, hash] of [
      ['state.json', fixtureState, '2703ca7a444bae6015c80664ef859b35858cf039e22a3c7f4668d30ad7437b6f'],
      ['v85-unstarted-web-closeout-20261018/complete.json', '{"phase":"complete"}', '07eba6c533b813e0a63311fbc9c6c7d03e0e8e3979b3749616567fb5488ac7c6'],
      ['v85-unstarted-web-closeout-20261018/intent.json', 'fixture old intent', '389efc11162efb6c5503d30f2add4d847a6bbf609fabf6248cb3aaf19f08eab3'],
      ['v85-unstarted-web-closeout-20261018/recovery.json', 'fixture archived recovery', 'bddb7e174b80ecc4512dcc845933e75d81222e475eb450bfe600ba38cb7fb44e'],
      ['v85-reader-attempt-closeout-20261018/intent.json', 'fixture second intent', '9f218d01276fed875d2958e6f4c3a3fb41e93850e2dd8f8af96f4136e24826f0'],
      ['v85-reader-attempt-closeout-20261018/recovery.json', 'fixture second archived recovery', '1631d134cdfe455540605836d21435010b72d44480b1386d44f07c0f91c0d627'],
      ['v85-reader-attempt-closeout-20261018/complete.json', 'fixture second completion', '61505f3177d3cbdd29e38d30d1488d2e7cf866e4d97a10892ee736cd0e62ccb7'],
    ]) { writeFileSync(join(root, name), bytes, { mode: 0o600 }); overrides.set(bytes, hash); }
    overrides.set('fixture same-new-eight-previous-plist', '7cc55b987327bd7eab11d44225e86af122481c701ce5dc153dc8284a00ce40d4');
    const checkout = join(root, 'releases/15b1a36f9b4c-ABC123/checkout'), buildId = 'prelaunch-15b1a36f9b4c-ABC123';
    const record = { ref: R.target, buildId, checkout, previousCwd: join(root, 'releases/06a3369f5c5e-EWuEsS/checkout'),
      previousBuildId: 'prelaunch-06a3369f5c5e-EWuEsS', backup: join(dirname(checkout), 'previous.plist'),
      previousPlistHash: '7cc55b987327bd7eab11d44225e86af122481c701ce5dc153dc8284a00ce40d4', targetPlistHash: h,
      closedR2: { schema: 'homecook.prelaunch-closed-r2-state.v1', kind: 'continuation', from: R.from, to: R.target, activationAuthorized: false,
        previousStateSha256: '192df7b3c45244c45b03e5af57e0020e8d03124bbf065576e38a9df05c601098', targetPlistSha256: h,
        rollbackPlistSha256: '7cc55b987327bd7eab11d44225e86af122481c701ce5dc153dc8284a00ce40d4' } };
    const prepare = () => {
      mkdirSync(join(root, 'deploy.lock'), { mode: 0o700 }); mkdirSync(join(checkout, '.next'), { recursive: true, mode: 0o700 });
      writeFileSync(join(checkout, '.next/BUILD_ID'), buildId, { mode: 0o600 });
      for (const file of [record.backup, join(dirname(record.backup), 'closed-rollback.plist')]) writeFileSync(file, 'fixture same-new-eight-previous-plist', { mode: 0o600 });
      writeFileSync(join(root, 'recovery.json'), JSON.stringify(record), { mode: 0o600 });
      const predecessor = fixtureState + '\n';
      writeFileSync(join(dirname(checkout), 'previous-closed-state.json'), predecessor, { mode: 0o600 });
      overrides.set(predecessor, record.closedR2.previousStateSha256);
    };
    const source = readFileSync('scripts/lib/v85-web-reader-repair.mjs', 'utf8'), start = source.indexOf('function assertUntransitionedIncident() {');
    const closure = source.slice(start, source.indexOf('\nexport function bindReaderRepairWebTool', start));
    const runtime = [{ pid: 68884, ppid: 1, start: 'Sat Oct 17 02:01:05 2026' }, { pid: 68891, ppid: 68884, start: 'Sat Oct 17 02:01:05 2026' }];
    const deps = { HOME: home, join, dirname, R, privateRead: (p: string) => readClosedR2PrivateBytes(p, process.cwd(), 524288),
      readerRepairHash: (bytes: Buffer) => overrides.get(bytes.toString()) ?? readerRepairHash(bytes),
      check: (ok: boolean, code: string) => { if (!ok) throw Error(code); }, existsSync, lstatSync, readFileSync,
      assertReaderRepairPredecessor: (state: Buffer, previous: Buffer, r: {closedR2: {previousStateSha256: string}}) => assertReaderRepairPredecessor(state, previous, {closedR2:{previousStateSha256:r.closedR2.previousStateSha256 === stateShape.productionPredecessorSha256 ? readerRepairHash(Buffer.from(fixtureState+'\n')) : r.closedR2.previousStateSha256}}),
      process, invocation: { action }, assertOwnedReaderRepairRecovery: (r: unknown) => assertOwnedReaderRepairRecovery(r, home),
      readerRepairGit: (_root: string, args: string[]) => args[0] === 'status' ? '' : R.target,
      run: () => JSON.stringify(runtime), same: (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b) };
    const guard = new Function(...Object.keys(deps), 'let originalNoRecovery=false,ownedAttempt;\n' + closure + ';return assertUntransitionedIncident;')(...Object.values(deps));
    return { home, root, record, guard, prepare, runtime };
  }
  it('runs no-pending -> own prepare -> final check twice without changing state or deleting recovery', () => {
    const f = fixtureGuard(); f.guard(); f.prepare(); f.guard(); f.guard();
    expect(readFileSync(join(f.root, 'state.json'), 'utf8')).toBe(fixtureState); expect(existsSync(join(f.root, 'recovery.json'))).toBe(true);
  });
  it('rejects an existing pending record on the first check', () => {
    const f = fixtureGuard(); f.prepare(); expect(() => f.guard()).toThrow('PREEXISTING_RECOVERY');
  });
  it('rejects preparation during a readonly plan', () => {
    const f = fixtureGuard('plan'); f.guard(); f.prepare(); expect(() => f.guard()).toThrow('PREEXISTING_RECOVERY');
  });
  for (const mutation of ['backup-old', 'changed-record', 'changed-lock', 'removed-recovery', 'changed-predecessor', 'raw-predecessor', 'compensation-restarted-pid', 'published-state']) it('rejects ' + mutation + ' at the next check', () => {
    const f = fixtureGuard(); f.guard(); f.prepare(); f.guard();
    if (mutation === 'backup-old') writeFileSync(f.record.backup, 'old exposed-key plist');
    if (mutation === 'changed-record') { const r = { ...f.record, extra: 'foreign attempt' }; writeFileSync(join(f.root, 'recovery.json'), JSON.stringify(r)); }
    if (mutation === 'changed-lock') { renameSync(join(f.root, 'deploy.lock'), join(f.root, 'old.lock')); mkdirSync(join(f.root, 'deploy.lock'), { mode: 0o700 }); }
    if (mutation === 'removed-recovery') rmSync(join(f.root, 'recovery.json'));
    if (mutation === 'changed-predecessor') writeFileSync(join(dirname(f.record.checkout), 'previous-closed-state.json'), '{}\n');
    if (mutation === 'raw-predecessor') writeFileSync(join(dirname(f.record.checkout), 'previous-closed-state.json'), fixtureState);
    if (mutation === 'compensation-restarted-pid') f.runtime[0].pid++;
    if (mutation === 'published-state') writeFileSync(join(f.root, 'state.json'), JSON.stringify({ ...stateShape.state, ref: R.target }));
    expect(() => f.guard()).toThrow();
  });
});

describe('official predecessor serialization is distinct from raw state', () => {
  const state = Buffer.from('{"ref":"old","rotation":{"preserved":true}}');
  const bytes = Buffer.concat([state, Buffer.from('\n')]);
  const record = { closedR2: { previousStateSha256: readerRepairHash(bytes) } };
  it('accepts exactly the official LF-terminated snapshot of unchanged full state', () => {
    expect(readerRepairHash(state)).not.toBe(readerRepairHash(bytes));
    expect(() => assertReaderRepairPredecessor(state, bytes, record)).not.toThrow();
  });
  for (const [name, changed] of Object.entries({ 'raw state without LF': state,
    'additional LF': Buffer.concat([bytes, Buffer.from('\n')]),
    'same object pretty printed': Buffer.from(JSON.stringify(JSON.parse(state.toString()), null, 2) + '\n'),
    'changed full state': Buffer.from('{"ref":"old","rotation":{"preserved":false}}\n') }))
    it('rejects ' + name + ' even if its record hash is updated', () => {
      expect(() => assertReaderRepairPredecessor(state, changed,
        { closedR2: { previousStateSha256: readerRepairHash(changed) } })).toThrow('PREDECESSOR_SERIALIZATION_CHANGED');
    });
  it('rejects a record hash pointing at the raw bytes', () => {
    expect(() => assertReaderRepairPredecessor(state, bytes,
      { closedR2: { previousStateSha256: readerRepairHash(state) } })).toThrow('PREDECESSOR_SERIALIZATION_CHANGED');
  });
});

describe('real state shape through official deployment stages', () => {
  const directories: string[] = [];
  afterEach(() => { for (const d of directories.splice(0)) rmSync(d, { recursive: true, force: true }); });
  it('uses actual durableJson bytes and preserves the whole predecessor until successful verification', async () => {
    const root = mkdtempSync(join(realpathSync(tmpdir()), 'v85-state-stages-')); directories.push(root); chmodSync(root, 0o700);
    const stateFile = join(root, 'state.json'), predecessorFile = join(root, 'previous-closed-state.json');
    const raw = Buffer.from(fixtureState), before = readerRepairHash(raw), events: string[] = [];
    writeFileSync(stateFile, raw, { mode: 0o600 });
    let live = 'old';
    const record = { closedR2: { previousStateSha256: '' } };
    await deployTransaction({
      prepare: async () => {
        await durableJson(predecessorFile, JSON.parse(readFileSync(stateFile, 'utf8')), true);
        record.closedR2.previousStateSha256 = readerRepairHash(readFileSync(predecessorFile));
        expect(record.closedR2.previousStateSha256).not.toBe(before);
        expect(readFileSync(predecessorFile)).toEqual(Buffer.concat([raw, Buffer.from('\n')]));
        events.push('prepared');
      },
      activate: async () => {
        assertReaderRepairPredecessor(readFileSync(stateFile), readFileSync(predecessorFile), record);
        expect(readerRepairHash(readFileSync(stateFile))).toBe(before); expect(live).toBe('old');
        live = 'fixed15'; events.push('activated');
      },
      verify: async () => {
        expect(live).toBe('fixed15'); expect(readerRepairHash(readFileSync(stateFile))).toBe(before);
        assertReaderRepairPredecessor(readFileSync(stateFile), readFileSync(predecessorFile), record); events.push('verified');
      },
      restore: async () => { throw Error('unexpected restore'); }, verifyRestored: async () => { throw Error('unexpected restore'); },
    });
    // Official deploy commits state only after activate and verify both finish.
    await durableJson(stateFile, { ...stateShape.state, fixtureNewWeb: 'fixed15' });
    expect(events).toEqual(['prepared', 'activated', 'verified']);
    expect(JSON.parse(readFileSync(predecessorFile, 'utf8'))).toEqual(stateShape.state);
    expect(JSON.parse(readFileSync(stateFile, 'utf8')).fixtureNewWeb).toBe('fixed15');
  });
  it('records the production raw and internal snapshot as distinct byte meanings', () => {
    expect(stateShape.productionScalarValuesIncluded).toBe(false);
    expect(stateShape.productionRawBytes + 1).toBe(stateShape.productionPredecessorBytes);
    expect(stateShape.productionRawSha256).not.toBe(stateShape.productionPredecessorSha256);
    expect(stateShape.productionRawSha256).toBe('2703ca7a444bae6015c80664ef859b35858cf039e22a3c7f4668d30ad7437b6f');
    expect(stateShape.productionPredecessorSha256).toBe('192df7b3c45244c45b03e5af57e0020e8d03124bbf065576e38a9df05c601098');
  });
});
