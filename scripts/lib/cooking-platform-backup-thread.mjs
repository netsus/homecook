// Runs the existing synchronous backup off the coordinator event loop so its
// live admission fence monitor can close the gateway throughout postprocessing.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { spawnSync } from 'node:child_process';
import { backupProductionPlatform } from '../full-local-platform-backup.mjs';
import { createRecordingDockerAdapter } from './marketing-round2-controlled-deploy.mjs';
import { readPinnedLocalDockerTarget } from './local-supabase-isolated-runtime.mjs';

export function cookingFenceHeldSql({ pid, started, application }) {
  if (!Number.isSafeInteger(pid) || pid <= 0 || !/^youtube-resolution-cooking-[a-f0-9]{16}$/u.test(application)
    || typeof started !== 'string' || !Number.isFinite(Date.parse(started)) || /[';\r\n]/u.test(started)) throw new Error('Invalid cooking fence identity');
  return `SELECT EXISTS(SELECT 1 FROM pg_locks l JOIN pg_stat_activity a USING(pid)
    WHERE locktype='advisory' AND classid=0 AND objid=86120317 AND objsubid=1
    AND database=(SELECT oid FROM pg_database WHERE datname=current_database())
    AND mode='ExclusiveLock' AND granted AND pid=${pid}
    AND application_name='${application}' AND backend_start='${started}'::timestamptz);`;
}

export function cookingEnqueueStateSql(owner) {
  if (owner) cookingFenceHeldSql(owner);
  const locks = "locktype='advisory' AND classid=0 AND objid=86120317 AND objsubid=1 AND database=(SELECT oid FROM pg_database WHERE datname=current_database())";
  const blockedByOwner = owner ? `${owner.pid}=ANY(pg_blocking_pids(pid))` : 'false';
  return `SELECT jsonb_build_object(
    'sharedHolders',(SELECT count(*) FROM pg_locks WHERE ${locks} AND mode='ShareLock' AND granted),
    'blockedEnqueues',(SELECT count(*) FROM pg_locks WHERE ${locks} AND mode='ShareLock' AND NOT granted AND ${blockedByOwner}),
    'unclassifiedEnqueues',(SELECT count(*) FROM pg_stat_activity a WHERE pid<>pg_backend_pid() AND state<>'idle' AND query ~ 'enqueue_youtube_extraction_job'
      AND NOT EXISTS(SELECT 1 FROM pg_locks l WHERE l.pid=a.pid AND ${locks} AND mode='ShareLock' AND NOT granted AND ${owner ? `${owner.pid}=ANY(pg_blocking_pids(a.pid))` : 'false'})));`;
}

export function runCookingPlatformBackup(context) {
  return new Promise((resolve, reject) => {
    const thread = new Worker(new URL(import.meta.url), { workerData: context, stdout: true, stderr: true });
    // Never forward child command output or private backup metadata to logs.
    thread.stdout.resume(); thread.stderr.resume();
    let outcome;
    thread.once('message', message => { outcome = message; });
    thread.once('error', () => reject(new Error('Backup thread failed; recovery required')));
    thread.once('exit', code => {
      if (code !== 0 || !outcome?.ok) reject(new Error(outcome?.error ?? 'Backup thread outcome uncertain'));
      else resolve(outcome.result);
    });
  });
}

if (!isMainThread) {
  try {
    const { configPath, configHash, backupDirectory, target, owner } = workerData;
    if (createHash('sha256').update(readFileSync(configPath)).digest('hex') !== configHash) throw new Error('Backup config changed');
    const base = await createRecordingDockerAdapter({ configPath, backupDirectory });
    if (!isDeepStrictEqual(await base.inspect(), target)) throw new Error('Backup target changed');
    const sql = cookingFenceHeldSql(owner);
    const env = { ...process.env, DOCKER_HOST: readPinnedLocalDockerTarget().docker_host };
    for (const key of ['DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) delete env[key];
    const assertAdmissionFence = () => {
      const check = spawnSync('docker', ['exec', '-i', target.postgresContainerId, 'psql', '-h', '/var/run/postgresql', '-p', '5432', '-U', 'postgres', '-d', 'postgres', '-XAtq', '-v', 'ON_ERROR_STOP=1'],
        { env, encoding: 'utf8', timeout: 7000, input: `BEGIN READ ONLY; SET LOCAL statement_timeout='5s'; ${sql}\nCOMMIT;`, maxBuffer: 65536 });
      if (check.status !== 0 || check.stdout.trim() !== 't') throw new Error('Enqueue fence lost; API restart blocked');
    };
    assertAdmissionFence();
    const result = backupProductionPlatform({ configPath, output: workerData.output, assertAdmissionFence });
    parentPort.postMessage({ ok: true, result });
  } catch (error) {
    parentPort.postMessage({ ok: false, error: error instanceof Error ? error.message : 'Backup failed' });
  }
}
