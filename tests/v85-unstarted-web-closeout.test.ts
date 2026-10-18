import { afterEach, describe, expect, it, vi } from 'vitest';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertUnstartedIncident, closeUnstartedWebAttempt, createUnstartedArchive, UNSTARTED } from '../scripts/lib/v85-unstarted-web-closeout.mjs';
import { readClosedR2PrivateBytes } from '../scripts/lib/prelaunch-web-deploy.mjs';
import { preserveRound2RotationState } from '../scripts/lib/round2-eight-key-rotation-fence.mjs';

const pins = JSON.parse(readFileSync(new URL('../scripts/lib/v85-unstarted-web-closeout-pins.json', import.meta.url), 'utf8'));
const home = '/test-home';
function observation() {
  const cwd = join(home, '.homecook/prelaunch-web/releases/06a3369f5c5e-EWuEsS/checkout');
  return { hashes: structuredClone(pins.files), processes: structuredClone(pins.processes), workerPid: pins.workerPid,
    state: { ref: String(UNSTARTED.from), buildId: String(UNSTARTED.fromBuild), checkout: cwd,
      targetPlistHash: pins.files['Library/LaunchAgents/com.homecook.production.plist'] },
    recovery: { ref: String(UNSTARTED.to), buildId: String(UNSTARTED.toBuild), previousCwd: cwd,
      previousBuildId: UNSTARTED.fromBuild, previousPlistHash: pins.files['Library/LaunchAgents/com.homecook.production.plist'],
      targetPlistHash: 'c2258cb1513b1276950212ae73dc70cf9b73d82253e55ef8a10b35f6c97058d4',
      checkout: join(home, '.homecook/prelaunch-web/releases/15b1a36f9b4c-8dYuqq/checkout'),
      backup: join(home, '.homecook/prelaunch-web/releases/15b1a36f9b4c-8dYuqq/previous.plist') },
    live: { ref: String(UNSTARTED.from), buildId: String(UNSTARTED.fromBuild), cwd },
    authorityVerified: true, readinessVerified: true, httpVerified: true };
}
type Observation = ReturnType<typeof observation>;
function operationalObservation() {
  const o = observation();
  for (const v of [o.state, o.recovery, o.live]) for (const key of Object.keys(v)) {
    const x = v as unknown as Record<string, string>;
    x[key] = x[key].replace(home, process.env.HOME!);
  }
  return o;
}
function harness() {
  const o = operationalObservation(), events: string[] = [];
  let phase = 'absent', active = true;
  const a = { executorRef: 'a'.repeat(40),
    observe: vi.fn(async () => { events.push('observe'); return structuredClone(o); }),
    phase: vi.fn(async () => phase), activeExists: vi.fn(async () => active),
    saveIntent: vi.fn(async () => { events.push('intent-durable'); phase = 'pending'; }),
    archiveRecovery: vi.fn(async () => { events.push('archive-durable'); }),
    removeActive: vi.fn(async () => { events.push('remove-active'); active = false; }),
    saveComplete: vi.fn(async () => { events.push('complete-durable'); phase = 'complete'; }),
  };
  return { a, o, events, setPhase: (p: string) => { phase = p; }, setActive: (v: boolean) => { active = v; } };
}

describe('exact unstarted 06a -> 15 incident', () => {
  it('accepts only the pinned healthy predecessor and returns an honest metadata disposition', () => {
    expect(assertUnstartedIncident(observation(), home)).toMatchObject({ generation: 49, dbLedger: 232, jobs: 43,
      webRef: UNSTARTED.from, failedRef: UNSTARTED.to, serviceRestarts: 0, databaseWrites: 0, credentialChanges: 0,
      disposition: 'failed-before-web-transition; healthy previous web retained' });
  });
  const mutations: Record<string, (o: Observation) => void> = {
    'live partially switched to15': o => { o.live.ref = UNSTARTED.to; },
    'different live build': o => { o.live.buildId = 'other'; },
    'restarted launcher': o => { o.processes[0].pid++; },
    'reused PID with different start': o => { o.processes[0].start = 'later'; },
    'different HTTP child': o => { o.processes[1].pid++; },
    'wrong child parent': o => { o.processes[1].ppid++; },
    'restarted worker': o => { o.workerPid++; },
    'different previous plist': o => { o.recovery.previousPlistHash = '0'.repeat(64); },
    'different backup target': o => { o.recovery.backup = '/other/previous.plist'; },
    'different state': o => { o.state.ref = UNSTARTED.to; },
    'different recovery': o => { o.recovery.ref = 'b'.repeat(40); },
    'no full DB or actual three-anchor proof': o => { o.authorityVerified = false; },
    'actual06a readiness failed': o => { o.readinessVerified = false; },
    'wrong HTTP manifest or collector': o => { o.httpVerified = false; },
  };
  for (const path of Object.keys(pins.files)) mutations['changed bytes: ' + path] = o => { o.hashes[path] = '0'.repeat(64); };
  mutations['missing guard'] = o => { delete o.hashes['.homecook/prelaunch-web/protected-database-guard.json']; };
  mutations['additional guard'] = o => { o.hashes['foreign-guard.json'] = '0'.repeat(64); };
  for (const [label, mutate] of Object.entries(mutations)) it('rejects ' + label, () => {
    const o = observation(); mutate(o); expect(() => assertUnstartedIncident(o, home)).toThrow('V85_UNSTARTED_');
  });
  it('plans without archive or active-state changes', async () => {
    const h = harness(); expect(await closeUnstartedWebAttempt(h.a, true)).toMatchObject({ ready: true, recoveryPending: true });
    expect(h.a.saveIntent).not.toHaveBeenCalled(); expect(h.a.removeActive).not.toHaveBeenCalled();
  });
  it('preserves durable intent and exact archive before removing active recovery; rechecks after', async () => {
    const h = harness(); expect(await closeUnstartedWebAttempt(h.a)).toMatchObject({ closed: true, recoveryPending: false });
    expect(h.events).toEqual(['observe', 'intent-durable', 'archive-durable', 'observe', 'remove-active', 'observe', 'complete-durable']);
  });
  it('retains active recovery when full proof drifts before removal', async () => {
    const h = harness(); h.a.observe.mockImplementationOnce(async () => structuredClone(h.o))
      .mockImplementationOnce(async () => { throw Error('full auth/jobs/DB drift'); });
    await expect(closeUnstartedWebAttempt(h.a)).rejects.toThrow('drift');
    expect(h.a.removeActive).not.toHaveBeenCalled(); expect(h.a.saveComplete).not.toHaveBeenCalled();
  });
  for (const step of ['saveIntent', 'archiveRecovery', 'removeActive', 'saveComplete'] as const) it('never reports success after interruption at ' + step, async () => {
    const h = harness(); h.a[step].mockRejectedValueOnce(Error('crash'));
    await expect(closeUnstartedWebAttempt(h.a)).rejects.toThrow('crash');
    if (step !== 'saveComplete') expect(h.a.saveComplete).not.toHaveBeenCalled();
  });
  it('leaves incomplete receipt if post-removal DB proof fails', async () => {
    const h = harness(); h.a.observe.mockResolvedValueOnce(structuredClone(h.o)).mockResolvedValueOnce(structuredClone(h.o)).mockRejectedValueOnce(Error('after-drift'));
    await expect(closeUnstartedWebAttempt(h.a)).rejects.toThrow('after-drift'); expect(h.a.saveComplete).not.toHaveBeenCalled();
  });
  for (const active of [true, false]) it('resumes the same durable pending incident with active recovery=' + active, async () => {
    const h = harness(); h.setPhase('pending'); h.setActive(active);
    expect(await closeUnstartedWebAttempt(h.a)).toMatchObject({ closed: true }); expect(h.a.saveIntent).not.toHaveBeenCalled();
  });
  it('revalidates a duplicate completed invocation without removing anything again', async () => {
    const h = harness(); h.setPhase('complete'); h.setActive(false);
    expect(await closeUnstartedWebAttempt(h.a)).toMatchObject({ alreadyClosed: true }); expect(h.a.removeActive).not.toHaveBeenCalled();
  });
});

describe('bounded private state read', () => {
  const directories: string[] = [];
  afterEach(() => { for (const d of directories.splice(0)) rmSync(d, { recursive: true, force: true }); });
  function file(bytes: string | Buffer) {
    const directory = mkdtempSync(join(realpathSync(tmpdir()), 'v85-bounded-')); directories.push(directory); chmodSync(directory, 0o700);
    const p = join(directory, 'state.json'); writeFileSync(p, bytes, { mode: 0o600 }); return p;
  }
  it('reads the observed75021 size only with an explicit512KiB bound, retaining JSON/protected marker checks', () => {
    const marker = { version: 1, fenceSha256: 'a'.repeat(64), candidatePlistSha256: 'b'.repeat(64), stageReceiptSha256: 'c'.repeat(64), collectionEnabled: false, leadEnabled: false, reactivationReady: false };
    const head = JSON.stringify({ round2EightKeyRotation: marker, padding: '' });
    const bytes = JSON.stringify({ round2EightKeyRotation: marker, padding: 'x'.repeat(75021 - head.length) });
    const p = file(bytes); expect(Buffer.byteLength(bytes)).toBe(75021);
    expect(() => readClosedR2PrivateBytes(p, process.cwd())).toThrow();
    const state = JSON.parse(readClosedR2PrivateBytes(p, process.cwd(), UNSTARTED.maximum).toString());
    expect(preserveRound2RotationState(state, {}).round2EightKeyRotation).toEqual(marker);
    state.round2EightKeyRotation.collectionEnabled = true;
    expect(() => preserveRound2RotationState(state, {})).toThrow('STATE_MARKER_INVALID');
  });
  it('rejects over512KiB, unsafe permissions, symlinks and malformed JSON', () => {
    expect(() => readClosedR2PrivateBytes(file(Buffer.alloc(524289)), process.cwd(), UNSTARTED.maximum)).toThrow();
    const p = file('{}'); chmodSync(p, 0o644); expect(() => readClosedR2PrivateBytes(p, process.cwd(), UNSTARTED.maximum)).toThrow();
    const target = file('{}'), link = join(dirnameForTest(target), 'link.json'); symlinkSync(target, link);
    expect(() => readClosedR2PrivateBytes(link, process.cwd(), UNSTARTED.maximum)).toThrow();
    expect(() => JSON.parse(readClosedR2PrivateBytes(file('{invalid'), process.cwd(), UNSTARTED.maximum).toString())).toThrow();
  });
  it('wires the fixed bounded reader and dedicated no-argument commands without deleting existing rollback guards', () => {
    const source = readFileSync(new URL('../scripts/deploy-prelaunch-web.mjs', import.meta.url), 'utf8');
    expect(source).toContain('JSON.parse(readClosedR2PrivateBytes(statePath, repository, 524288)).round2EightKeyRotation');
    expect(source).toContain("if (action !== 'status') assertNoUnstartedCloseoutPending(repository)");
    expect(source).toContain("runUnstartedWebCloseout(repository, action === 'plan-v85-unstarted-closeout')");
  });
});
function dirnameForTest(path: string) { return path.slice(0, path.lastIndexOf('/')); }

describe('actual create-only private archive I/O', () => {
  const directories: string[] = [];
  afterEach(() => { for (const d of directories.splice(0)) rmSync(d, { recursive: true, force: true }); });
  function fixture(verifyLease = vi.fn()) {
    const root = mkdtempSync(join(realpathSync(tmpdir()), 'v85-archive-')); directories.push(root); chmodSync(root, 0o700);
    const bytes = Buffer.from('{"fixed":"failed-before-transition"}\n'), active = join(root, 'recovery.json'), directory = join(root, 'closeout');
    writeFileSync(active, bytes, { mode: 0o600 });
    const options = { directory, active, expectedSha256: createHash('sha256').update(bytes).digest('hex'), verifyLease,
      read: (p: string) => readClosedR2PrivateBytes(p, process.cwd(), UNSTARTED.maximum) };
    return { root, bytes, active, directory, options, archive: createUnstartedArchive(options), intent: { exact: 'incident' } };
  }
  it('preserves the original bytes in a separate600 file and700 directory before unlinking', async () => {
    const f = fixture(); await f.archive.saveIntent(f.intent); await f.archive.archiveRecovery();
    expect(readFileSync(join(f.directory, 'recovery.json'))).toEqual(f.bytes); expect(readFileSync(f.active)).toEqual(f.bytes);
    expect(lstatSync(f.directory).mode & 0o777).toBe(0o700);
    expect(lstatSync(join(f.directory, 'recovery.json')).mode & 0o777).toBe(0o600);
    expect(lstatSync(join(f.directory, 'recovery.json')).nlink).toBe(1);
    await f.archive.removeActive(); expect(existsSync(f.active)).toBe(false);
    expect(f.archive.recoveryBytes()).toEqual(f.bytes);
    await f.archive.saveComplete({ phase: 'complete', intent: f.intent });
    expect(await f.archive.phase(f.intent)).toBe('complete');
  });
  for (const afterRemoval of [false, true]) it('resumes exact files after crash, removed=' + afterRemoval, async () => {
    const f = fixture(); await f.archive.saveIntent(f.intent); await f.archive.archiveRecovery();
    if (afterRemoval) await f.archive.removeActive();
    const resumed = createUnstartedArchive(f.options);
    expect(await resumed.phase(f.intent)).toBe('pending'); await resumed.archiveRecovery(); await resumed.removeActive();
    await resumed.saveComplete({ phase: 'complete', intent: f.intent }); expect(await resumed.phase(f.intent)).toBe('complete');
  });
  it('refuses a foreign pending intent and never overwrites it', async () => {
    const f = fixture(); await f.archive.saveIntent(f.intent);
    await expect(f.archive.phase({ exact: 'other' })).rejects.toThrow('FOREIGN_CLOSEOUT_INTENT');
    await expect(f.archive.saveIntent({ exact: 'other' })).rejects.toThrow();
    expect(JSON.parse(readFileSync(join(f.directory, 'intent.json'), 'utf8'))).toEqual(f.intent);
    expect(existsSync(f.active)).toBe(true);
  });
  it('refuses changed archived bytes and preserves active recovery', async () => {
    const f = fixture(); await f.archive.saveIntent(f.intent); await f.archive.archiveRecovery();
    writeFileSync(join(f.directory, 'recovery.json'), 'foreign');
    await expect(f.archive.archiveRecovery()).rejects.toThrow('ARCHIVE_OR_ACTIVE_CHANGED');
    await expect(f.archive.removeActive()).rejects.toThrow('ARCHIVE_OR_ACTIVE_CHANGED'); expect(existsSync(f.active)).toBe(true);
  });
  it('refuses active bytes changed after archiving', async () => {
    const f = fixture(); await f.archive.saveIntent(f.intent); await f.archive.archiveRecovery(); writeFileSync(f.active, 'other');
    await expect(f.archive.removeActive()).rejects.toThrow('ARCHIVE_OR_ACTIVE_CHANGED'); expect(readFileSync(f.active, 'utf8')).toBe('other');
  });
  it('refuses a swapped active inode even if its bytes match', async () => {
    const f = fixture(); f.options.verifyLease.mockImplementation(() => {
      const other = join(f.root, 'other'); writeFileSync(other, f.bytes, { mode: 0o600 }); renameSync(other, f.active);
    });
    await f.archive.saveIntent(f.intent); await f.archive.archiveRecovery();
    await expect(f.archive.removeActive()).rejects.toThrow('ACTIVE_IDENTITY_CHANGED'); expect(existsSync(f.active)).toBe(true);
  });
  it('refuses a failed lease check without removing active recovery', async () => {
    const f = fixture(vi.fn(() => { throw Error('lease changed'); })); await f.archive.saveIntent(f.intent); await f.archive.archiveRecovery();
    await expect(f.archive.removeActive()).rejects.toThrow('lease changed'); expect(existsSync(f.active)).toBe(true);
  });
  it('refuses missing archive, foreign files and malformed completion', async () => {
    const f = fixture(); await f.archive.saveIntent(f.intent); await expect(f.archive.removeActive()).rejects.toThrow();
    writeFileSync(join(f.directory, 'foreign.json'), '{}', { mode: 0o600 }); await expect(f.archive.phase(f.intent)).rejects.toThrow('FOREIGN_ARCHIVE_FILE');
    rmSync(join(f.directory, 'foreign.json')); await f.archive.archiveRecovery();
    writeFileSync(join(f.directory, 'complete.json'), '{}', { mode: 0o600 }); await expect(f.archive.phase(f.intent)).rejects.toThrow('FOREIGN_OR_PARTIAL_COMPLETION');
    expect(existsSync(f.active)).toBe(true);
  });
  it('refuses changed archive directory ownership boundary and permissions', async () => {
    const f = fixture(); await f.archive.saveIntent(f.intent); chmodSync(f.directory, 0o755);
    await expect(f.archive.archiveRecovery()).rejects.toThrow('PRIVATE_DIRECTORY'); expect(existsSync(f.active)).toBe(true);
  });
  it('recovers a crash immediately after creating the private incident directory', async () => {
    const f = fixture(); mkdirSync(f.directory, { mode: 0o700 });
    const resumed = createUnstartedArchive(f.options); expect(await resumed.phase(f.intent)).toBe('preparing');
    await resumed.saveIntent(f.intent); expect(await resumed.phase(f.intent)).toBe('pending'); expect(existsSync(f.active)).toBe(true);
  });
  for (const name of ['intent.json', 'recovery.json', 'complete.json']) for (const full of [false, true])
    it('resumes a crash before atomic publication: ' + name + ', full=' + full, async () => {
      const f = fixture(), complete = { phase: 'complete', intent: f.intent };
      let bytes: Buffer;
      if (name === 'intent.json') { mkdirSync(f.directory, { mode: 0o700 }); bytes = Buffer.from(JSON.stringify(f.intent) + '\n'); }
      else {
        await f.archive.saveIntent(f.intent);
        if (name === 'recovery.json') bytes = f.bytes;
        else { await f.archive.archiveRecovery(); await f.archive.removeActive(); bytes = Buffer.from(JSON.stringify(complete) + '\n'); }
      }
      writeFileSync(join(f.directory, `.${name}.pending`), full ? bytes : bytes.subarray(0, 7), { mode: 0o600 });
      const resumed = createUnstartedArchive(f.options);
      expect(await resumed.phase(f.intent)).toBe(name === 'intent.json' ? 'preparing' : 'pending');
      if (name === 'intent.json') await resumed.saveIntent(f.intent);
      await resumed.archiveRecovery(); await resumed.removeActive(); await resumed.saveComplete(complete);
      expect(await resumed.phase(f.intent)).toBe('complete'); expect(existsSync(join(f.directory, `.${name}.pending`))).toBe(false);
      expect(readFileSync(join(f.directory, 'recovery.json'))).toEqual(f.bytes);
    });
  it('does not adopt a foreign pending publication', async () => {
    const f = fixture(); mkdirSync(f.directory, { mode: 0o700 });
    writeFileSync(join(f.directory, '.intent.json.pending'), 'foreign', { mode: 0o600 });
    const resumed = createUnstartedArchive(f.options);
    await expect(resumed.phase(f.intent)).rejects.toThrow('FOREIGN_PUBLICATION_PREFIX');
    await expect(resumed.saveIntent(f.intent)).rejects.toThrow('FOREIGN_PUBLICATION_PREFIX'); expect(existsSync(f.active)).toBe(true);
  });
  it('keeps an existing final receipt instead of overwriting it', async () => {
    const f = fixture(); await f.archive.saveIntent(f.intent); await f.archive.archiveRecovery(); await f.archive.removeActive();
    const complete = { phase: 'complete', intent: f.intent }; await f.archive.saveComplete(complete);
    await expect(f.archive.saveComplete({ phase: 'other' })).rejects.toThrow('PUBLICATION_EXISTS');
    expect(JSON.parse(readFileSync(join(f.directory, 'complete.json'), 'utf8'))).toEqual(complete);
  });
});
