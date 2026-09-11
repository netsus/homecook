#!/usr/bin/env node
// Opt-in actual Next UI/API + fresh PostgreSQL fixture; never loads repository .env files.
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, writeFile, unlink, rm, symlink, realpath, readdir } from 'node:fs/promises';
import { createServer as httpServer } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createIsolatedSupabaseProject, readPinnedLocalDockerTarget, assertNoIsolatedDockerResources,
  assertOwnedDockerResources, assertPinnedSupabaseCliVersion, buildSupabaseCliArgs,
  buildIsolatedSupabaseStartArgs, removeIsolatedDockerResources, buildIsolatedDataApiContainerArgs,
  readIsolatedDockerResourceInventory, waitForIsolatedDataApi,
} from './lib/local-supabase-isolated-runtime.mjs';

export function assertUiIsolatedTarget(identity) {
  let url;
  try { url = new URL(identity.dataApiUrl); } catch { throw new Error('Unsafe R2 UI isolated identity'); }
  if (!/^hcg_[0-9]+_[a-z0-9]+$/.test(identity.projectId) || identity.cliVersion !== '2.110.0'
    || !/^[a-f0-9]{64}$/.test(identity.migrationSha256) || url.protocol !== 'http:' || url.hostname !== '127.0.0.1'
    || !url.port || Number(url.port) < 1 || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw new Error('Unsafe R2 UI isolated identity');
}

async function serveNext() {
  const owned = process.env.R2_UI_OWNED_ROOT;
  const identity = JSON.parse(process.env.R2_UI_IDENTITY);
  assertUiIsolatedTarget(identity);
  if (process.env.NODE_ENV !== 'test' || !owned?.includes('r2-ui-next-')) throw new Error('Unsafe UI fixture process');
  const originalFetch = globalThis.fetch;
  let providerMockCalls = 0;
  // Production verifier stays intact; only the external provider transport is a fixture.
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.href === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
      const body = init?.body;
      if (!(body instanceof URLSearchParams) || body.has('remoteip') || !/^mumeok_r2_(recording|homeflow)$/.test(body.get('response') ?? '')) throw new Error('Invalid fixture provider request');
      providerMockCalls++;
      return Response.json({ success: true, hostname: 'localhost', action: body.get('response'), challenge_ts: new Date(Date.now() - 1000).toISOString() });
    }
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Fixture refuses external server request');
    return originalFetch(input, init);
  };
  const dataProxy = httpServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/rest/v1/rpc/marketing_round2_apply') { response.writeHead(403); response.end(); return; }
    try {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const result = await originalFetch(`${identity.dataApiUrl}/rpc/marketing_round2_apply`, { method: 'POST', headers: { authorization: request.headers.authorization, 'content-type': 'application/json', 'x-homecook-internal-scope': request.headers['x-homecook-internal-scope'] ?? '' }, body: Buffer.concat(chunks) });
      response.writeHead(result.status, { 'content-type': 'application/json' }); response.end(Buffer.from(await result.arrayBuffer()));
    } catch { response.writeHead(503); response.end(); }
  });
  await new Promise((accept, reject) => { dataProxy.once('error', reject); dataProxy.listen(0, '127.0.0.1', accept); });
  const dataOrigin = `http://127.0.0.1:${dataProxy.address().port}`;
  const namespace = `r2-${identity.projectId.replaceAll('_', '-')}`;
  const fixture = join(owned, namespace); const rate = join(fixture, 'rate'); const control = join(fixture, 'control.json');
  await mkdir(rate, { recursive: true, mode: 0o700 });
  await writeFile(join(rate, 'state.json'), JSON.stringify({ version: 1, counters: {} }), { mode: 0o600 });
  await writeFile(control, JSON.stringify({ version: 1, collection_enabled: true, lead_enabled: true, consent_generation: 1 }), { mode: 0o600 });
  const names = ['page', 'cookie', 'bootstrap', 'event', 'email', 'receipt', 'rate'];
  const secrets = Object.fromEntries(names.map(name => [name, randomBytes(32).toString('base64url')]));
  for (const name of names) process.env[`MUMEOK_ROUND2_${name.toUpperCase()}_SECRET`] = secrets[name];
  Object.assign(process.env, {
    MUMEOK_ROUND2_PROFILE: 'isolated', MUMEOK_ROUND2_ENABLED: 'true', MUMEOK_ROUND2_LEADS_ENABLED: 'true',
    MUMEOK_ROUND2_RATE_STATE_DIR: rate, MUMEOK_ROUND2_CONTROL_PATH: control,
    MUMEOK_ROUND2_ISOLATED_IDENTITY_PATH: join(fixture, 'identity.json'), MUMEOK_ROUND2_TURNSTILE_SECRET_KEY: randomBytes(32).toString('base64url'),
    MUMEOK_ROUND2_TURNSTILE_SITE_KEY: 'isolated-fixture-site-key', DATA_SUPABASE_URL: dataOrigin,
    DATA_SUPABASE_PUBLISHABLE_KEY: 'isolated-fixture-anon', DATA_SUPABASE_SECRET_KEY: process.env.R2_UI_SERVICE_KEY,
    HOMECOOK_DATA_AUTHORITY: 'local', NEXT_TELEMETRY_DISABLED: '1',
  });
  await writeFile(process.env.MUMEOK_ROUND2_ISOLATED_IDENTITY_PATH, JSON.stringify({ version: 1, profile: 'isolated', namespace, origin: 'https://localhost:3443', hostname: 'localhost', db_origin: dataOrigin, rate_state_dir: rate, control_path: control, secret_fingerprints: Object.fromEntries(names.map(name => [name, createHash('sha256').update(secrets[name]).digest('hex')])) }), { mode: 0o600 });
  const next = (await import('next')).default;
  const app = next({ dev: true, dir: join(owned, 'source'), hostname: 'localhost', port: 3443 });
  await app.prepare();
  const handler = app.getRequestHandler();
  const server = httpsServer({ key: await readFile(join(owned, 'key.pem')), cert: await readFile(join(owned, 'cert.pem')) }, handler);
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(3443, '127.0.0.1', accept); });
  process.send?.({ ready: true, fixture, providerMockCalls });
  process.on('message', async message => {
    if (message === 'stats') process.send?.({ providerMockCalls });
  });
  process.on('SIGTERM', async () => { server.close(); dataProxy.close(); await app.close(); process.exit(0); });
}

async function main() {
  const root = process.cwd(); const recoveryZoom = process.argv.includes('--recovery-zoom-only');
  const recoveryOnly = recoveryZoom || process.argv.includes('--recovery-only');
  const artifacts = join(root, '.omx/artifacts/r2-stage4', recoveryZoom ? 'real-ui-recovery-zoom' : recoveryOnly ? 'real-ui-recovery' : 'real-ui');
  await mkdir(artifacts, { recursive: true });
  const target = readPinnedLocalDockerTarget(); const isolated = await createIsolatedSupabaseProject(root);
  const env = await isolated.buildCommandEnv(process.env, { dockerHost: target.docker_host });
  const owned = await realpath(await mkdtemp(join(tmpdir(), 'r2-ui-next-')));
  let started = false; let child; let browser;
  function run(command, args, input) {
    const result = spawnSync(command, args, { cwd: isolated.rootDir, env, input, encoding: 'utf8', timeout: 300000, maxBuffer: 32 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`Isolated UI subprocess failed: ${command}: ${String(result.stderr).match(/ERROR[^\n]*/)?.[0] ?? String(result.stderr).slice(-700)}`);
    return result.stdout;
  }
  const sql = input => run('docker', ['exec', '-i', `supabase_db_${isolated.projectId}`, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-At'], input).trim();
  try {
    const version = assertPinnedSupabaseCliVersion(run('corepack', ['pnpm', ...buildSupabaseCliArgs(['--version'], { workdir: isolated.rootDir })]));
    assertNoIsolatedDockerResources(isolated.projectId, { env });
    const identity = { projectId: isolated.projectId, dataApiUrl: isolated.dataApiUrl, cliVersion: version, migrationSha256: isolated.migrationSha256 };
    assertUiIsolatedTarget(identity);
    console.warn(JSON.stringify({ phase: 'starting-fresh-isolated', ...identity }));
    const migration = join(isolated.rootDir, 'supabase/migrations/20260911100000_marketing_round2.sql');
    const source = await readFile(migration, 'utf8'); await unlink(migration);
    started = true; run('corepack', ['pnpm', ...buildIsolatedSupabaseStartArgs(isolated.rootDir)]);
    assertOwnedDockerResources(isolated.projectId, { env }); sql(source);
    console.warn(JSON.stringify({ phase: 'isolated-migration-replayed', projectId: identity.projectId }));
    sql(`insert into public.marketing_validation_sessions(id,campaign_key,creative_key,audience_key,attribution_status,viewed_at,quiz_started_at,quiz_completed_at,quiz_result,quiz_answers,target_qualified,solution_viewed_at,intent_choice,intent_clicked_at,email,consent_version,consented_at,turnstile_verified_at,lead_submitted_at,lead_submission_status,retention_until)
      select gen_random_uuid(),'isolated_legacy_fixture','legacy_fixture','fixture','organic',t,t,t,'ingredient_reentry','{}'::jsonb,true,t,'needed',t,'legacy@example.com','fixture',t,t,t,'accepted',clock_timestamp()+interval '1 day' from (select clock_timestamp()-interval '1 hour' as t) at;`);
    const beforeLegacy = sql("select md5(coalesce(string_agg(row_to_json(v)::text,',' order by id),'')) from public.marketing_validation_sessions v");
    const restEnv = (await readFile(isolated.dataApiEnvironmentFilePath, 'utf8')).replace('/homecook_gate_api', '/postgres') + '\nPGRST_DB_PRE_REQUEST=public.verify_hybrid_request_authority_pre_request\nPGRST_DB_TX_END=commit\nPGRST_DB_HOISTED_TX_SETTINGS=statement_timeout,lock_timeout\nPGRST_LOG_LEVEL=crit\n';
    await writeFile(isolated.dataApiEnvironmentFilePath, restEnv, { mode: 0o600 });
    const inventory = readIsolatedDockerResourceInventory(isolated.projectId, { env });
    run('docker', buildIsolatedDataApiContainerArgs({ containerName: `homecook_gate_rest_${isolated.projectId}`, environmentFilePath: isolated.dataApiEnvironmentFilePath, networkId: inventory.networks[0].id, port: isolated.basePort + 7, projectId: isolated.projectId }));
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ role: 'service_role', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
    const token = `${header}.${payload}.${createHmac('sha256', isolated.dataApiJwtSecret).update(`${header}.${payload}`).digest('base64url')}`;
    await waitForIsolatedDataApi({ url: isolated.dataApiUrl, fetchImpl: async () => {
      const now = Date.now();
      const command = { op: 'inspect', action: 'bootstrap', event_id: '00000000-0000-4000-8000-000000000001', topic: 'recording', round_version: 'r2.1', participation_id: null, bootstrap_intent: 'create_or_resume', bootstrap_digest: 'a'.repeat(64), activity: 'menu', payload: { first_channel: 'direct', utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null }, payload_digest: 'b'.repeat(64), lead: null, control: { collection_enabled: true, lead_enabled: true, consent_generation: 1, checked_at: new Date(now).toISOString(), valid_until: new Date(now + 10000).toISOString() } };
      const response = await fetch(`${isolated.dataApiUrl}/rpc/marketing_round2_apply`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-homecook-internal-scope': 'marketing-round2' }, body: JSON.stringify({ p_command: command }) });
      const body = await response.json(); return { ok: response.ok && body.kind === 'inspected', status: response.status };
    } });
    const copied = join(owned, 'source'); await mkdir(copied);
    for (const name of ['app', 'components', 'lib', 'types', 'hooks', 'stores', 'public', 'next.config.ts', 'next-env.d.ts', 'tsconfig.json', 'postcss.config.mjs', 'package.json', 'middleware.ts']) {
      try { await cp(join(root, name), join(copied, name), { recursive: true }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    await symlink(join(root, 'node_modules'), join(copied, 'node_modules'));
    const snapshotFiles = {};
    async function fingerprint(directory, prefix = '') {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.name === 'node_modules') continue;
        const relative = prefix + entry.name;
        if (entry.isDirectory()) await fingerprint(join(directory, entry.name), relative + '/');
        else if (entry.isFile()) snapshotFiles[relative] = createHash('sha256').update(await readFile(join(directory, entry.name))).digest('hex');
      }
    }
    await fingerprint(copied);
    const baselineHead = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, env, encoding: 'utf8' }).stdout.trim();
    const harnessFiles = {};
    for (const name of ['scripts/verify-marketing-round2-ui-isolated.mjs', 'tests/marketing-round2-ui-isolated.scenarios.mjs', 'tests/helpers/marketing-round2-recovery-evidence.mjs']) harnessFiles[name] = createHash('sha256').update(await readFile(join(root, name))).digest('hex');
    await writeFile(join(artifacts, 'source-manifest.json'), JSON.stringify({ baselineHead, capturedAt: new Date().toISOString(), snapshotFiles, harnessFiles }, null, 2));
    await writeFile(join(owned, 'openssl.cnf'), '[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=localhost\n[ext]\nsubjectAltName=DNS:localhost\n', { mode: 0o600 });
    run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(owned, 'key.pem'), '-out', join(owned, 'cert.pem'), '-days', '1', '-config', join(owned, 'openssl.cnf')]);
    child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--serve-next'], { cwd: copied, env: { ...env, NODE_ENV: 'test', NEXT_TELEMETRY_DISABLED: '1', R2_UI_OWNED_ROOT: owned, R2_UI_IDENTITY: JSON.stringify(identity), R2_UI_SERVICE_KEY: token }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    let logs = ''; child.stdout.on('data', data => { logs += data; }); child.stderr.on('data', data => { logs += data; });
    const ready = await new Promise((accept, reject) => { const timer = setTimeout(() => reject(new Error('Next fixture readiness timeout')), 120000); child.once('exit', () => { clearTimeout(timer); reject(new Error('Next fixture exited before ready')); }); child.once('message', message => { clearTimeout(timer); accept(message); }); }).catch(async error => { await writeFile(join(artifacts, 'next-runtime.log'), logs.replaceAll(token, '[REDACTED]')); throw error; });
    console.warn(JSON.stringify({ phase: 'next-ready', projectId: identity.projectId }));
    const { chromium } = await import('@playwright/test'); browser = await chromium.launch({ headless: true });
    const { runRealUiScenarios } = await import('../tests/marketing-round2-ui-isolated.scenarios.mjs');
    let result;
    try { result = await runRealUiScenarios({ browser, origin: 'https://localhost:3443', sql, fixture: ready.fixture, artifacts, recoveryOnly, recoveryZoom }); }
    finally { await writeFile(join(artifacts, 'next-runtime.log'), logs.replaceAll(token, '[REDACTED]')); }
    const stats = await new Promise(accept => { child.once('message', accept); child.send('stats'); });
    const afterLegacy = sql("select md5(coalesce(string_agg(row_to_json(v)::text,',' order by id),'')) from public.marketing_validation_sessions v");
    if (beforeLegacy !== afterLegacy) throw new Error('Legacy table changed');
    await writeFile(join(artifacts, 'result.json'), JSON.stringify({ result: 'PASS', identity, ...result, providerMockCalls: stats.providerMockCalls, actualNextPages: true, actualNextApi: true, actualDatabase: true, externalProviderRequests: 0, productionWrites: 0, legacyChecksumUnchanged: true, legacyFixtureRows: 1, manualOnly: ['real provider', 'real device', 'production activation'] }, null, 2));
    console.warn(JSON.stringify({ result: 'PASS', checks: result.checks.length, path: join(artifacts, 'result.json') }));
  } finally {
    await browser?.close();
    if (child && child.exitCode === null) { child.kill('SIGTERM'); await new Promise(accept => { child.once('exit', accept); setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); accept(); }, 10000).unref(); }); }
    if (started) removeIsolatedDockerResources(isolated.projectId, { env });
    assertNoIsolatedDockerResources(isolated.projectId, { env }); await isolated.removeFiles(); await rm(owned, { recursive: true, force: true });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { if (process.argv.includes('--serve-next')) await serveNext(); else await main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
