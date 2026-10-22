import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createRecordingDockerAdapter, durableJson, privatePath } from './marketing-round2-controlled-deploy.mjs';
import { readPinnedLocalDockerTarget } from './local-supabase-isolated-runtime.mjs';
import { openDedicatedAdminSession } from '../youtube-resolution-controlled-db.mjs';
import { assertV74LoadedService } from './prelaunch-youtube-v74-cutover.mjs';
import { parseLaunchctlPrintStatus } from './youtube-extraction-worker-ops.mjs';
import { V85 } from './youtube-v85-cutover.mjs';
import { readClosedR2PrivateBytes, loadCurrentDatabaseMaintenance } from './prelaunch-web-deploy.mjs';
import { readGen51Authority, gen51ActiveProof, assertGen51CurrentDatabase, GEN51_CURRENT_DATABASE_SQL, GEN51 } from './worker-gen51-renewal-authority.mjs';
import { fileURLToPath } from 'node:url';
import { withCookingWorkerPaused, startCookingFenceMonitor, waitForCookingWorkerUnloaded } from './cooking-maintenance-cut.mjs';
import { cookingFenceHeldSql, cookingEnqueueStateSql, runCookingPlatformBackup } from './cooking-platform-backup-thread.mjs';
import { readWorkerEnvironment } from './youtube-extraction-worker-runtime.mjs';
import { verifyYoutubeResolutionWorkerCaller } from './prelaunch-youtube-resolution-worker-install.mjs';

const check = (ok, message) => { if (!ok) throw new Error(message); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const HOME_DIRECTORY = homedir();
const plistPath = join(HOME_DIRECTORY, 'Library/LaunchAgents/com.homecook.youtube-extraction-worker.plist');
const service = `gui/${process.getuid()}/com.homecook.youtube-extraction-worker`;
const activationPath = join(HOME_DIRECTORY, '.homecook/operations/youtube-v85-gen50-20261017/activation.json');
const activationHash = '3837afcebb57f880c29fe7b937c917fa876a4be317a3dbf1e5702cc35617a14d';

// No credentials or complete command output leave this module. Existing sealed
// worker health reads its own credential files through its supported validator.
export async function createCookingMaintenanceLocal({ configPath, backupDirectory }) {
  await privatePath(backupDirectory, true);
  const base = await createRecordingDockerAdapter({ configPath, backupDirectory });
  const target = await base.inspect();
  check(target.database.systemIdentifier === '7669475895419854882' && target.database.major === 17,
    'Cooking maintenance target differs');
  const dockerEnvironment = { ...process.env, DOCKER_HOST: readPinnedLocalDockerTarget().docker_host };
  for (const key of ['DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) delete dockerEnvironment[key];
  function command(binary, args, options = {}) {
    const result = spawnSync(binary, args, { encoding: 'utf8', timeout: 15000, maxBuffer: 8 * 1024 * 1024, ...options });
    check(result.status === 0, 'Maintenance command failed; output withheld');
    return result.stdout.trim();
  }
  const docker = args => command('docker', args, { env: dockerEnvironment });
  const read = sql => command('docker', ['exec', '-i', target.postgresContainerId, 'psql', '-h', '/var/run/postgresql', '-p', '5432', '-U', 'postgres', '-d', 'postgres', '-XAtq', '-v', 'ON_ERROR_STOP=1'],
    { env: dockerEnvironment, input: `BEGIN READ ONLY; SET LOCAL statement_timeout='5s'; ${sql}\nCOMMIT;` });
  const parsePlist = path => JSON.parse(command('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', path]));
  const configHash = hash(readFileSync(configPath));
  const originalPlistHash = hash(readFileSync(plistPath));
  const originalPlist = parsePlist(plistPath);
  check(originalPlist.RunAtLoad === true, 'Existing worker must RunAtLoad');
  const repository = fileURLToPath(new URL('../../', import.meta.url));
  const renewal = readGen51Authority(file => readClosedR2PrivateBytes(file, repository, 524288));
  const maintenance = loadCurrentDatabaseMaintenance(repository);
  check(maintenance?.review.feature === 'saved-frozen-quantity', 'Exact DB240 maintenance required');
  const proof = gen51ActiveProof(renewal);
  check(hash(readFileSync(activationPath)) === activationHash && proof.service.plistSha256 === originalPlistHash,
    'Activated worker seal or existing launcher differs');
  const webPlist = join(HOME_DIRECTORY, 'Library/LaunchAgents/com.homecook.production.plist');
  const originalWebHash = hash(readFileSync(webPlist));
  const round2Path = parsePlist(webPlist).EnvironmentVariables.MUMEOK_ROUND2_CONTROL_PATH;
  check(typeof round2Path === 'string' && round2Path.startsWith('/'), 'Round2 control missing');
  const originalRound2Hash = hash(readFileSync(round2Path));
  const ids = docker(['ps', '--all', '--quiet', '--filter', `label=com.docker.compose.project=${target.composeProject}`])
    .split(/\s+/u).filter(Boolean);
  check(ids.length > 0, 'Production service set missing');
  const writerIds = docker(['inspect', '--format', '{{json .Id}}|{{json (index .Config.Labels "com.docker.compose.service")}}|{{json .State.Running}}', ...ids])
    .split('\n').map(line => line.split('|').map(value => JSON.parse(value)));
  const writers = ['api-gateway', 'auth', 'postgrest', 'storage', 'realtime'].flatMap(name => {
    const matches = writerIds.filter(row => row[1] === name);
    check(matches.length === (name === 'realtime' ? Math.min(matches.length, 1) : 1), 'Writer target absent or ambiguous');
    check(matches.every(row => row[2] === true), 'Writer was not running before maintenance');
    return matches;
  });
  const gateway = writers.find(row => row[1] === 'api-gateway')[0];
  function workerStatus({ allowTransition = false } = {}) {
    check(hash(readFileSync(plistPath)) === originalPlistHash, 'Worker launcher changed');
    const result = spawnSync('/bin/launchctl', ['print', service], { encoding: 'utf8', timeout: 5000, maxBuffer: 4 * 1024 * 1024 });
    if (result.status !== 0) {
      const parsed = parseLaunchctlPrintStatus({ serviceTarget: service, ...result });
      check(parsed.state === 'unloaded' && result.status === 113, 'Worker status uncertain');
      return { stopped: true, running: false, pid: null };
    }
    const state = assertV74LoadedService({ stdout: result.stdout, plist: originalPlist, plistPath, serviceTarget: service, requireRunning: false });
    if (allowTransition && state.loaded && state.state !== 'running') return { stopped: false, running: false, pid: state.pid ?? null };
    check(state.loaded && state.state === 'running' && state.pid > 0, 'Worker loaded but not running');
    const identity = command('/bin/ps', ['-p', String(state.pid), '-o', 'uid=', '-o', 'lstart=']).split(/\s+/u);
    check(Number(identity.shift()) === process.getuid(), 'Actual worker owner differs');
    const cwd = command('/usr/sbin/lsof', ['-a', '-p', String(state.pid), '-d', 'cwd', '-Fn']).split('\n').find(line => line.startsWith('n'))?.slice(1);
    check(cwd === renewal.paths.artifact, 'Actual worker cwd differs');
    return { stopped: false, running: true, pid: state.pid, started: identity.join(' ') };
  }
  const p = renewal.paths;
  async function health() {
    const args = ['--config', p.config, '--manifest', p.manifest, '--credential', p.credential, '--secret-root', p.secrets,
      '--app-descriptor', p.descriptor, '--policy', p.policy, '--expected-schema', p.schema];
    const result = JSON.parse(command(process.execPath, [join(p.artifact, 'scripts/youtube-extraction-worker-runner.mjs'), 'health', ...args]));
    if (result.ok !== true || result.ready !== true) return false;
    const environment = await readWorkerEnvironment(p.config);
    const caller = await verifyYoutubeResolutionWorkerCaller({ environment,
      token: readFileSync(p.token, 'utf8').trim(), secretRoot: p.secrets,
      fetchImpl: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(5000) }),
    });
    const readiness = JSON.parse(read(`SET LOCAL request.jwt.claims='{"role":"youtube_extraction_worker"}'; SELECT public.read_youtube_extraction_enqueue_readiness();`));
    return caller.authenticatedStatus === 200 && caller.emptyClaimDenied === true && readiness.ready === true
      && readiness.catalog_fingerprint === V85.catalogSha256 && readiness.release_sha === V85.releaseSha;

  }
  let session;
  let owner;
  const application = `youtube-resolution-cooking-${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  let monitor;
  let gatewayClosed = false;
  const closeIngress = async () => {
    docker(['stop', gateway]);
    check(docker(['inspect', '--format', '{{.State.Running}}', gateway]) === 'false', 'Gateway closure uncertain');
    gatewayClosed = true;
  };
  function fenceHeld() {
    if (!owner) return false;
    return read(cookingFenceHeldSql({ ...owner, application })) === 't';
  }
  const fence = {
    async acquire() {
      check(!session, 'Fence already attempted; reconcile first');
      session = openDedicatedAdminSession(target.postgresContainerId, application);
      try {
        owner = JSON.parse((await session.query("SET statement_timeout='5s'; SELECT pg_advisory_lock(86120317); SELECT jsonb_build_object('pid',pid,'started',backend_start) FROM pg_stat_activity WHERE pid=pg_backend_pid();")).trim());
        check(Number.isInteger(owner.pid) && typeof owner.started === 'string', 'Fence owner unavailable');
        this.assertHeldSync();
      } catch (error) { session.stop(); throw error; }
    },
    assertHeldSync() { check(!monitor?.error && fenceHeld(), 'Enqueue fence lost; recovery UNKNOWN'); },
    async release() {
      this.assertHeldSync();
      check((await session.query('SELECT pg_advisory_unlock(86120317);')).trim() === 't', 'Fence release uncertain');
      check(await session.close() === 0, 'Fence session close uncertain');
    },
  };
  async function observe({ includeHealth = true } = {}) {
    const status = workerStatus();
    const round2 = JSON.parse(readFileSync(round2Path));
    check(round2.collection_enabled === false && round2.lead_enabled === false && hash(readFileSync(round2Path)) === originalRound2Hash,
      'Round2 control changed');
    check(hash(readFileSync(webPlist)) === originalWebHash && hash(readFileSync(activationPath)) === activationHash,
      'Web or sealed activation changed');
    const enqueue = JSON.parse(read(cookingEnqueueStateSql(owner ? { ...owner, application } : null)));
    const state = JSON.parse(read(`SELECT jsonb_build_object(
      'queued',(SELECT count(*) FROM public.youtube_extraction_jobs WHERE status='queued'),
      'processing',(SELECT count(*) FROM public.youtube_extraction_jobs WHERE status='processing'),
      'permitHeld',EXISTS(SELECT 1 FROM public.youtube_extractor_permits WHERE permit_key='primary' AND owner_id IS NOT NULL AND expires_at>clock_timestamp()),
      'generation',(SELECT current_generation FROM private.youtube_extraction_worker_credentials WHERE credential_name='primary'),
      'release',(SELECT release_sha FROM private.youtube_extraction_worker_credentials WHERE credential_name='primary'),
      'expiry',(SELECT expires_at FROM private.youtube_extraction_worker_credentials WHERE credential_name='primary'),
      'enabled',(SELECT enabled FROM private.youtube_extraction_current_policy WHERE policy_key='primary'),
      'policyHash',(SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') FROM private.youtube_extraction_current_policy t WHERE policy_key='primary'),
      'credentialHash',(SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') FROM private.youtube_extraction_worker_credentials t WHERE credential_name='primary'),
      'jobsHash',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb)::text,'UTF8')),'hex') FROM public.youtube_extraction_jobs t));`));
    assertGen51CurrentDatabase(renewal, JSON.parse(read(GEN51_CURRENT_DATABASE_SQL)), maintenance.pointer);
    check(state.generation === 51 && state.release === V85.releaseSha && Date.parse(state.expiry) === Date.parse(GEN51.expiresAt)
      && Date.parse(state.expiry) > Date.now() + 1800000 && state.enabled === true, 'gen51/policy/expiry differs');
    return { ...status, healthy: status.running && includeHealth ? await health() : false, fenceHeld: fenceHeld(),
      queued: state.queued, processing: state.processing, permitHeld: state.permitHeld,
      sharedHolders: enqueue.sharedHolders, blockedEnqueues: enqueue.blockedEnqueues, unclassifiedEnqueues: enqueue.unclassifiedEnqueues,
      protected: { policyHash: state.policyHash, credentialHash: state.credentialHash, jobsHash: state.jobsHash,
        plistHash: originalPlistHash, activationHash, webPlistHash: originalWebHash, round2Hash: originalRound2Hash } };
  }
  const worker = {
    observe: async () => observe(),
    observeStopped: async () => workerStatus(),
    stop: async () => {
      check(workerStatus().running, 'Worker not running before bootout');
      command('/bin/launchctl', ['bootout', service]);
      await waitForCookingWorkerUnloaded(() => workerStatus({ allowTransition: true }));
    },
    startSamePlist: async () => { check(workerStatus().stopped, 'Worker is not unloaded'); command('/bin/launchctl', ['bootstrap', `gui/${process.getuid()}`, plistPath]); },
    async restoreApi() {
      for (const [id] of [...writers].reverse()) {
        fence.assertHeldSync();
        if (docker(['inspect', '--format', '{{.State.Running}}', id]) !== 'true') docker(['start', id]);
      }
      for (let attempt = 0; attempt < 60; attempt++) {
        fence.assertHeldSync();
        const states = writers.map(([id]) => docker(['inspect', '--format', '{{.State.Running}} {{if .State.Health}}{{.State.Health.Status}}{{else}}healthy{{end}}', id]));
        if (states.every(state => state === 'true healthy')) return;
        await delay(500);
      }
      throw new Error('Original API set not healthy');
    },
    async waitHealthy() {
      for (let attempt = 0; attempt < 40; attempt++) {
        fence.assertHeldSync();
        try { const state = await observe(); await delay(500); if (state.running && state.healthy && workerStatus().pid === state.pid) return state; } catch { /* bounded startup wait */ }
        await delay(500);
      }
      throw new Error('Same worker failed health verification');
    },
  };
  let sequence = 0;
  return { target, observe: () => observe(), fence,
    async plan() {
      const before = await observe();
      check(before.running && before.healthy && before.queued === 0 && before.processing === 0 && before.permitHeld === false
        && before.sharedHolders === 0 && before.blockedEnqueues === 0 && before.unclassifiedEnqueues === 0,
      'Backup readiness requires healthy drained worker and enqueue boundary');
      const after = await observe();
      check(JSON.stringify(before) === JSON.stringify(after), 'Read-only backup plan observed a changing baseline');
      return { purpose: 'backup', readOnly: true, generation: 51, expiresAt: GEN51.expiresAt,
        ready: true, pid: after.pid, queued: after.queued, processing: after.processing,
        mutations: false, fenceAcquired: false, workerStopped: false, backupExecuted: false };
    },
    async backup(output) {
      fence.assertHeldSync();
      return runCookingPlatformBackup({ configPath, configHash, backupDirectory, target,
        owner: { ...owner, application }, output });
    },
    async run(operation) {
      // The coordinator remains responsive while the backup thread performs its
      // synchronous encryption/archive work. A lost lock permanently closes this
      // attempt; a later successful probe cannot reopen it silently.
      const monitoredFence = { ...fence, async acquire() {
        await fence.acquire();
        monitor = startCookingFenceMonitor({ assertHeld: () => fence.assertHeldSync(), closeIngress });
      }, async release() { monitor?.stop(); await fence.release(); } };
      try {
        return await withCookingWorkerPaused({ fence: monitoredFence, worker, operation, closeIngress,
          record: async (phase, observation) => durableJson(join(backupDirectory, `maintenance-${++sequence}-${phase}.json`), { phase, at: new Date().toISOString(), target, observation }, true),
        });
      } catch (error) {
        if (gatewayClosed) session?.stop(); // gateway already confirmed closed; never leave an orphan lock.
        throw error;
      } finally { monitor?.stop(); }
    },
  };
}
