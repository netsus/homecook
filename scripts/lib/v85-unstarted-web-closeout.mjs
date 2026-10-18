// Only the 2026-10-18 failed 06a -> 15 web attempt. No rollback, restart or issuance.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { pathToFileURL } from 'node:url';
import { acquirePrelaunchDeployLock, acquireClosedR2ControlLease, loadClosedR2Review, readClosedR2PrivateBytes } from './prelaunch-web-deploy.mjs';
import { preserveRound2RotationState, assertRound2EightKeyFence } from './round2-eight-key-rotation-fence.mjs';
import { createRecordingDockerAdapter } from './marketing-round2-controlled-deploy.mjs';
import { openDedicatedAdminSession } from '../youtube-resolution-controlled-db.mjs';
import { loadRecoveredReadiness } from './prelaunch-v85-recovered-readiness.mjs';
import { verifyOperatingYoutubeEnqueueRuntime } from './youtube-enqueue-runtime-preflight-ops.mjs';

export const UNSTARTED = Object.freeze({
  from: '06a3369f5c5e1c3ca49045f370f0ce12f049c805', fromBuild: 'prelaunch-06a3369f5c5e-EWuEsS',
  to: '15b1a36f9b4c4c293cd8f92c6f2824b13ba7eaf9', toBuild: 'prelaunch-15b1a36f9b4c-8dYuqq',
  tool: 'd69fb50afe5d61530c3a3e0427ca4b477582792e', frozen: '/tmp/homecook-v85-auth-successor-20261018',
  directory: 'v85-unstarted-web-closeout-20261018', maximum: 524288,
});
const sha = value => createHash('sha256').update(value).digest('hex');
const check = (value, code) => { if (!value) throw new Error(`V85_UNSTARTED_${code}`); };
const pins = JSON.parse(readFileSync(new URL('./v85-unstarted-web-closeout-pins.json', import.meta.url)));
const recoveryName = '.homecook/prelaunch-web/recovery.json';
const liveName = 'Library/LaunchAgents/com.homecook.production.plist';
const stateName = '.homecook/prelaunch-web/state.json';
const finalArchiveFiles = ['intent.json', 'recovery.json', 'complete.json'];
const archiveFiles = [...finalArchiveFiles, ...finalArchiveFiles.map(n => `.${n}.pending`)];
const sourceFiles = ['scripts/deploy-prelaunch-web.mjs', 'scripts/lib/v85-unstarted-web-closeout.mjs',
  'scripts/lib/v85-unstarted-web-closeout-pins.json', 'tests/v85-unstarted-web-closeout.test.ts',
  'tests/prelaunch-v85-web-recovery.test.ts',
  'docs/engineering/v85-unstarted-web-closeout-20261018.md', 'docs/sync/CURRENT_SOURCE_OF_TRUTH.md'];

export function assertUnstartedIncident(o, home = homedir()) {
  check(same(o.hashes, pins.files), 'FILE_OR_GUARD_DRIFT');
  check(same(o.processes, pins.processes) && o.workerPid === pins.workerPid, 'PROCESS_DRIFT');
  const { state: s, recovery: r, live } = o;
  const cwd = join(home, '.homecook/prelaunch-web/releases/06a3369f5c5e-EWuEsS/checkout');
  check(s.ref === UNSTARTED.from && s.buildId === UNSTARTED.fromBuild && s.checkout === cwd
    && live.ref === s.ref && live.buildId === s.buildId && live.cwd === cwd, 'LIVE_OR_STATE_DRIFT');
  check(r.ref === UNSTARTED.to && r.buildId === UNSTARTED.toBuild && r.previousCwd === cwd
    && r.previousBuildId === s.buildId && r.previousPlistHash === pins.files[liveName]
    && s.targetPlistHash === pins.files[liveName] && r.targetPlistHash !== r.previousPlistHash
    && r.checkout === join(home, '.homecook/prelaunch-web/releases/15b1a36f9b4c-8dYuqq/checkout')
    && r.backup === join(dirname(r.checkout), 'previous.plist'), 'FOREIGN_OR_PARTIAL_RECOVERY');
  check(o.authorityVerified === true && o.readinessVerified === true && o.httpVerified === true, 'LIVE_EVIDENCE_REQUIRED');
  return { schema: 'homecook.v85-unstarted-web-closeout.v1', incident: UNSTARTED.directory,
    stateSha256: pins.files[stateName], recoverySha256: pins.files[recoveryName], plistSha256: pins.files[liveName],
    authoritySha256: pins.files['.homecook/operations/youtube-v85-gen50-20261017/auth-successor-plan-20261018.json'],
    webRef: UNSTARTED.from, failedRef: UNSTARTED.to, generation: 49, dbLedger: 232, jobs: 43,
    processes: pins.processes, workerPid: pins.workerPid,
    disposition: 'failed-before-web-transition; healthy previous web retained',
    databaseWrites: 0, serviceRestarts: 0, credentialChanges: 0 };
}

// An interrupted closeout blocks unrelated operations in this official tool.
export function assertNoUnstartedCloseoutPending(repository) {
  const directory = join(homedir(), '.homecook/prelaunch-web', UNSTARTED.directory);
  if (!existsSync(directory)) return;
  const read = name => readClosedR2PrivateBytes(join(directory, name), repository, UNSTARTED.maximum);
  check(existsSync(join(directory, 'complete.json')), 'CLOSEOUT_PENDING');
  const intent = JSON.parse(read('intent.json')), complete = JSON.parse(read('complete.json'));
  check(complete.phase === 'complete' && same(complete.intent, intent)
    && intent.schema === 'homecook.v85-unstarted-web-closeout.v1' && intent.incident === UNSTARTED.directory
    && intent.recoverySha256 === pins.files[recoveryName] && intent.stateSha256 === pins.files[stateName]
    && intent.plistSha256 === pins.files[liveName] && intent.webRef === UNSTARTED.from && intent.failedRef === UNSTARTED.to
    && sha(read('recovery.json')) === pins.files[recoveryName], 'CLOSEOUT_PENDING');
}

// Dependency seam tests every crash/drift boundary without operating access.
export async function closeUnstartedWebAttempt(a, planOnly = false) {
  const before = assertUnstartedIncident(await a.observe());
  const intent = { ...before, executorRef: a.executorRef };
  const phase = await a.phase(intent);
  if (planOnly) return { ready: true, phase, ...before, recoveryPending: await a.activeExists() };
  if (phase === 'complete') return { alreadyClosed: true, ...before };
  if (phase === 'absent' || phase === 'preparing') await a.saveIntent(intent);
  await a.archiveRecovery(); // create-only, byte-identical, durable; source retained.
  check(same(before, assertUnstartedIncident(await a.observe())), 'PRE_CLOSE_DRIFT');
  await a.removeActive(); // fresh owner/inode/hash verification immediately before unlink.
  check(same(before, assertUnstartedIncident(await a.observe())), 'POST_CLOSE_DRIFT');
  await a.saveComplete({ phase: 'complete', intent });
  check(await a.phase(intent) === 'complete' && !await a.activeExists(), 'COMPLETION_UNCONFIRMED');
  return { closed: true, recoveryPending: false, ...before };
}

function durableCreate(path, bytes, read) {
  // macOS sys/stdio.h: RENAME_EXCL=0x4. Publish a complete fsynced file atomically,
  // refusing an existing destination. A crash can leave only a private scratch prefix.
  check(process.platform === 'darwin' && !existsSync(path), 'PUBLICATION_EXISTS_OR_PLATFORM');
  bytes = Buffer.from(bytes);
  const pending = join(dirname(path), `.${basename(path)}.pending`);
  let fd;
  if (existsSync(pending)) {
    const before = lstatSync(pending), prefix = read(pending);
    check(prefix.length <= bytes.length && prefix.equals(bytes.subarray(0, prefix.length)), 'FOREIGN_PUBLICATION_PREFIX');
    fd = openSync(pending, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW);
    try {
      check(sameIdentity(before, fstatSync(fd)), 'PUBLICATION_IDENTITY_CHANGED');
      writeFileSync(fd, bytes.subarray(prefix.length)); fsyncSync(fd);
    } finally { closeSync(fd); }
  } else {
    fd = openSync(pending, 'wx', 0o600);
    try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
  }
  check(read(pending).equals(bytes), 'PUBLICATION_BYTES_CHANGED');
  const script = `import ctypes,os,sys\nf=ctypes.CDLL(None,use_errno=True).renamex_np\nf.argtypes=[ctypes.c_char_p,ctypes.c_char_p,ctypes.c_uint];f.restype=ctypes.c_int\nif f(os.fsencode(sys.argv[1]),os.fsencode(sys.argv[2]),4)!=0: raise OSError(ctypes.get_errno(),'exclusive publication failed')`;
  const result = spawnSync('/usr/bin/python3', ['-B', '-c', script, pending, path], {
    env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' }, timeout: 5000, encoding: 'utf8', maxBuffer: 8192,
  });
  check(result.status === 0, 'ATOMIC_PUBLICATION_FAILED');
  syncDirectory(dirname(path));
  check(read(path).equals(bytes), 'PUBLISHED_BYTES_CHANGED');
}
function syncDirectory(path) {
  const fd = openSync(path, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); }
}
function sameIdentity(a, b) { return a.dev === b.dev && a.ino === b.ino && a.uid === b.uid; }
function privateDirectory(path) {
  const s = lstatSync(path);
  check(s.isDirectory() && !s.isSymbolicLink() && s.uid === process.getuid()
    && (s.mode & 0o777) === 0o700 && realpathSync(path) === path, 'PRIVATE_DIRECTORY');
  return s;
}

// LaunchAgents is normally0755, unlike private operation directories. Permit only
// these two existing0600 files, retaining ownership/no-symlink/inode/bounded I/O.
export function readUnstartedLaunchAgent(path, home = homedir()) {
  check(['com.homecook.production.plist', 'com.homecook.youtube-extraction-worker.plist']
    .some(name => path === join(home, 'Library/LaunchAgents', name)), 'LAUNCH_AGENT_PATH');
  const parent = dirname(path), directory = lstatSync(parent);
  check(realpathSync(parent) === parent && directory.isDirectory() && !directory.isSymbolicLink()
    && directory.uid === process.getuid() && (directory.mode & 0o022) === 0, 'LAUNCH_AGENT_DIRECTORY');
  const valid = s => s.isFile() && !s.isSymbolicLink() && s.uid === process.getuid()
    && (s.mode & 0o777) === 0o600 && s.nlink === 1 && s.size <= UNSTARTED.maximum;
  const before = lstatSync(path); check(valid(before), 'LAUNCH_AGENT_FILE');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(fd); check(valid(opened) && sameIdentity(before, opened), 'LAUNCH_AGENT_IDENTITY');
    const buffer = Buffer.alloc(UNSTARTED.maximum + 1); let offset = 0;
    while (offset < buffer.length) { const length = readSync(fd, buffer, offset, buffer.length - offset, null); if (!length) break; offset += length; }
    check(offset <= UNSTARTED.maximum, 'LAUNCH_AGENT_SIZE'); return buffer.subarray(0, offset);
  } finally { closeSync(fd); }
}

// Small file-I/O seam; the official caller always supplies the fixed incident hash/paths.
export function createUnstartedArchive({ directory, active, read, expectedSha256, verifyLease }) {
  check(/^[a-f0-9]{64}$/u.test(expectedSha256), 'ARCHIVE_HASH');
  const archived = join(directory, 'recovery.json');
  let identity = existsSync(directory) ? privateDirectory(directory) : null;
  const owned = () => {
    check(identity && sameIdentity(privateDirectory(directory), identity), 'ARCHIVE_DIRECTORY_CHANGED');
    check(readdirSync(directory).every(n => archiveFiles.includes(n)), 'FOREIGN_ARCHIVE_FILE');
  };
  const exact = path => check(sha(read(path)) === expectedSha256, 'ARCHIVE_OR_ACTIVE_CHANGED');
  return {
    recoveryBytes() {
      if (existsSync(active)) return read(active);
      owned(); exact(archived); return read(archived);
    },
    activeExists: async () => existsSync(active),
    phase: async intent => {
      if (!existsSync(directory)) return 'absent';
      owned();
      if (!existsSync(join(directory, 'intent.json'))) {
        check(readdirSync(directory).every(n => n === '.intent.json.pending'), 'FOREIGN_CLOSEOUT_INTENT');
        const scratch = join(directory, '.intent.json.pending'), bytes = Buffer.from(JSON.stringify(intent) + '\n');
        if (existsSync(scratch)) { const prefix = read(scratch); check(prefix.length <= bytes.length && prefix.equals(bytes.subarray(0, prefix.length)), 'FOREIGN_PUBLICATION_PREFIX'); }
        return 'preparing';
      }
      check(!existsSync(join(directory, '.intent.json.pending'))
        && same(JSON.parse(read(join(directory, 'intent.json'))), intent), 'FOREIGN_CLOSEOUT_INTENT');
      if (existsSync(archived)) exact(archived);
      for (const name of ['recovery.json', 'complete.json']) {
        const scratch = join(directory, `.${name}.pending`);
        if (!existsSync(scratch)) continue;
        check(!existsSync(join(directory, name)), 'FOREIGN_PUBLICATION_PREFIX');
        const bytes = name === 'complete.json' ? Buffer.from(JSON.stringify({ phase: 'complete', intent }) + '\n') : read(active);
        if (name === 'recovery.json') exact(active);
        const prefix = read(scratch);
        check(prefix.length <= bytes.length && prefix.equals(bytes.subarray(0, prefix.length)), 'FOREIGN_PUBLICATION_PREFIX');
      }
      if (!existsSync(join(directory, 'complete.json'))) return 'pending';
      check(same(JSON.parse(read(join(directory, 'complete.json'))), { phase: 'complete', intent })
        && existsSync(archived) && !existsSync(active)
        && readdirSync(directory).every(n => finalArchiveFiles.includes(n)), 'FOREIGN_OR_PARTIAL_COMPLETION');
      return 'complete';
    },
    saveIntent: async intent => {
      if (!existsSync(directory)) { mkdirSync(directory, { mode: 0o700 }); identity = privateDirectory(directory); syncDirectory(dirname(directory)); }
      owned(); check(readdirSync(directory).every(n => n === '.intent.json.pending'), 'FOREIGN_CLOSEOUT_INTENT');
      durableCreate(join(directory, 'intent.json'), JSON.stringify(intent) + '\n', read); owned();
    },
    archiveRecovery: async () => {
      owned();
      if (existsSync(archived)) { exact(archived); return; }
      exact(active); durableCreate(archived, read(active), read); exact(archived);
    },
    removeActive: async () => {
      owned(); exact(archived);
      if (!existsSync(active)) return;
      const before = lstatSync(active); exact(active); verifyLease();
      check(sameIdentity(before, lstatSync(active)), 'ACTIVE_IDENTITY_CHANGED');
      unlinkSync(active); syncDirectory(dirname(active));
    },
    saveComplete: async value => { owned(); durableCreate(join(directory, 'complete.json'), JSON.stringify(value) + '\n', read); },
  };
}

export async function runUnstartedWebCloseout(repository, planOnly) {
  const home = homedir(), root = join(home, '.homecook/prelaunch-web'), directory = join(root, UNSTARTED.directory);
  const active = join(root, 'recovery.json');
  const read = p => readClosedR2PrivateBytes(p, repository, UNSTARTED.maximum);
  const evidence = p => [liveName, 'Library/LaunchAgents/com.homecook.youtube-extraction-worker.plist']
    .some(name => p === join(home, name)) ? readUnstartedLaunchAgent(p, home) : read(p);
  // Do not inherit preload options, cookies, provider credentials or caller-controlled search paths.
  const env = { HOME: home, USER: process.env.USER ?? basename(home), LOGNAME: process.env.LOGNAME ?? basename(home),
    PATH: `${home}/.nvm/versions/node/v22.19.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
    LANG: 'C', LC_ALL: 'C', TZ: 'UTC' };
  const run = (bin, args, options = {}) => {
    const r = spawnSync(bin, args, { env, encoding: 'utf8', timeout: 180000, maxBuffer: 1024 * 1024, ...options });
    check(r.status === 0, options.failure ?? 'READ_ONLY_PROOF_FAILED'); return r.stdout.trim();
  };
  const git = (args, cwd = repository) => run('/usr/bin/git', ['-C', cwd, ...args]);
  check(process.platform === 'darwin' && realpathSync(repository) === repository, 'MAC_REPOSITORY');
  check(git(['status', '--porcelain']) === '', 'EXECUTOR_NOT_CLEAN');
  git(['merge-base', '--is-ancestor', UNSTARTED.tool, 'HEAD']);
  check(git(['diff', '--name-only', UNSTARTED.tool, 'HEAD']).split('\n').filter(Boolean).every(p => sourceFiles.includes(p)), 'EXECUTOR_SCOPE');
  const executorRef = git(['rev-parse', 'HEAD']);
  check(git(['rev-parse', 'HEAD'], UNSTARTED.frozen) === UNSTARTED.tool
    && git(['status', '--porcelain'], UNSTARTED.frozen) === '', 'FROZEN_TOOL_CHANGED');
  privateDirectory(root);
  const lock = await acquirePrelaunchDeployLock(); let lease;
  try {
    lease = await acquireClosedR2ControlLease(loadClosedR2Review(repository), repository);
    const archive = createUnstartedArchive({ directory, active, read, expectedSha256: pins.files[recoveryName], verifyLease: () => lease.verify() });
    const { recoveryBytes } = archive;
    const literalUrl = p => JSON.stringify(pathToFileURL(join(UNSTARTED.frozen, p)).href);
    const authorityScript = `import {readV85Authority} from ${literalUrl('scripts/lib/youtube-v85-cutover.mjs')};
import {readClosedR2PrivateBytes} from ${literalUrl('scripts/lib/prelaunch-web-deploy.mjs')};
import {verifyV85AuthSuccessorWebBoundary} from ${literalUrl('scripts/youtube-v85-controlled-cutover.mjs')};
const a=readV85Authority(p=>readClosedR2PrivateBytes(p,${JSON.stringify(UNSTARTED.frozen)},524288));
if(a?.planSha256!==${JSON.stringify(pins.files['.homecook/operations/youtube-v85-gen50-20261017/auth-successor-plan-20261018.json'])}||a.proof||a.plan.authSuccessor?.toolRef!==${JSON.stringify(UNSTARTED.tool)})throw Error('authority');
await verifyV85AuthSuccessorWebBoundary(a);process.stdout.write('V85_UNSTARTED_AUTHORITY_DB232_49_43_OK');`;
    const runtimeScript = `import importlib.util,json,sys\nfrom pathlib import Path\nspec=importlib.util.spec_from_file_location('r2apply',sys.argv[1]);a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)\ncwd=Path(sys.argv[2]);rows=a.census(cwd);a.web_smoke(cwd)\nprint(json.dumps({'processes':rows,'workerPid':a.WORKER_PID,'httpVerified':True}))`;
    const readiness = async live => {
      const base = await createRecordingDockerAdapter({ configPath: join(home, '.homecook/config/full-local-production.env'), backupDirectory: root });
      const target = await base.inspect();
      check(target.database.systemIdentifier === '7669475895419854882' && target.database.major === 17, 'DATABASE_TARGET');
      const session = openDedicatedAdminSession(target.postgresContainerId, 'youtube-resolution-v85-closeout-readonly');
      let row;
      try {
        await session.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL ROLE postgres; SET LOCAL search_path=public,extensions; SET LOCAL statement_timeout='45s';");
        row = JSON.parse((await session.query(`SELECT set_config('request.jwt.claims','{"role":"youtube_extraction_worker"}',true); SELECT public.read_youtube_extraction_enqueue_readiness();`)).trim().split('\n').at(-1));
        await session.query('COMMIT;'); check(await session.close() === 0, 'READINESS_SESSION');
      } finally { session.stop(); }
      const ready = await loadRecoveredReadiness(live.cwd, live.plist.EnvironmentVariables, row);
      check(ready && !('code' in ready) && ready.currentFingerprintKeyVersion === '2' && ready.previousFingerprintKeyVersion === null
        && verifyOperatingYoutubeEnqueueRuntime({ codeRoot: live.cwd, plist: live.plist, readiness: ready }).status === 'ready', 'ACTUAL_06A_READINESS');
      return true;
    };
    const observe = async () => {
      lease.verify();
      const hashes = Object.fromEntries(Object.entries(pins.files).map(([name]) => [name, sha(name === recoveryName ? recoveryBytes() : evidence(join(home, name)))]));
      const expectedGuards = Object.keys(pins.files).filter(p => p.endsWith('-guard.json')).map(p => basename(p)).sort();
      check(same(readdirSync(root).filter(p => p.endsWith('-guard.json')).sort(), expectedGuards), 'GUARD_SET_CHANGED');
      const state = JSON.parse(read(join(home, stateName))), recovery = JSON.parse(recoveryBytes());
      const plist = JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', '-'], { input: evidence(join(home, liveName)) }));
      preserveRound2RotationState(state, {});
      assertRound2EightKeyFence(plist.EnvironmentVariables, JSON.parse(read(join(root, 'round2-eight-key-rotation-fence.json'))));
      const live = { cwd: plist.WorkingDirectory, ref: git(['rev-parse', 'HEAD'], plist.WorkingDirectory),
        buildId: readFileSync(join(plist.WorkingDirectory, '.next/BUILD_ID'), 'utf8').trim(), plist };
      check(git(['status', '--porcelain', '--untracked-files=no'], live.cwd) === '', 'LIVE_SOURCE_DIRTY');
      const runtime = JSON.parse(run('/usr/bin/python3', ['-B', '-c', runtimeScript, join(UNSTARTED.frozen, 'scripts/round2-eight-key-user-apply.py'), live.cwd]));
      // Fail before DB access if any known file or process is already different.
      assertUnstartedIncident({ hashes, state, recovery, live, ...runtime, authorityVerified: true, readinessVerified: true }, home);
      check(run(join(home, '.nvm/versions/node/v22.19.0/bin/node'), ['--input-type=module', '-e', authorityScript], { failure: 'AUTHORITY_OR_DATABASE_DRIFT' })
        === 'V85_UNSTARTED_AUTHORITY_DB232_49_43_OK', 'AUTHORITY_OUTPUT');
      const readinessVerified = await readiness(live);
      lease.verify();
      // Full DB proof can take seconds; re-read files and live process at its end.
      for (const [name, digest] of Object.entries(hashes)) check(sha(name === recoveryName ? recoveryBytes() : evidence(join(home, name))) === digest, 'POST_PROOF_FILE_DRIFT');
      check(same(JSON.parse(run('/usr/bin/python3', ['-B', '-c', runtimeScript, join(UNSTARTED.frozen, 'scripts/round2-eight-key-user-apply.py'), live.cwd])), runtime), 'POST_PROOF_PROCESS_DRIFT');
      return { hashes, state, recovery, live, ...runtime, readinessVerified, authorityVerified: true };
    };
    return await closeUnstartedWebAttempt({ executorRef, observe, ...archive }, planOnly);
  } finally { try { if (lease) await lease.release(); } finally { await lock.release(); } }
}
