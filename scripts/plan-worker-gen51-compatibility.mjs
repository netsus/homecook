#!/usr/bin/env node
// Official read-only deployment / platform-backup preflight for this one renewal.
// This command exposes no mutation action and does not acquire an admission fence.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';
import { homedir } from 'node:os';
import { isDeepStrictEqual as same } from 'node:util';
import { assertV74LoadedService } from './lib/prelaunch-youtube-v74-cutover.mjs';
import { readClosedR2PrivateBytes, loadProtectedRolloutReview, loadCurrentDatabaseMaintenance, verifyClosedR2Collector } from './lib/prelaunch-web-deploy.mjs';
import { createRecordingDockerAdapter } from './lib/marketing-round2-controlled-deploy.mjs';
import { createProtectedPrelaunchAdapter } from './lib/prelaunch-database.mjs';
import { FROZEN_QUANTITY_FEATURE, assertFrozenQuantityObservation } from './lib/saved-frozen-quantity-maintenance.mjs';
import { readGen51Authority, GEN51, GEN51_CURRENT_DATABASE_SQL, assertGen51CurrentDatabase, gen51CredentialHash } from './lib/worker-gen51-renewal-authority.mjs';
import { createCookingMaintenanceLocal } from './lib/cooking-maintenance-local.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = (ok, message) => { if (!ok) throw Error(`gen51 read-only plan: ${message}`); };
const hash = value => createHash('sha256').update(value).digest('hex');
const literal = value => `'${value.replaceAll("'", "''")}'`;
export function assertGen51AppSelection({ cwd, ref, buildId, dirty, plistSha256 }, expectedPlistSha256) {
  check(cwd === join(homedir(), '.homecook/prelaunch-web/releases/6f3f213a8f03-m5z4ei/checkout')
    && ref === GEN51.appRef && buildId === GEN51.buildId && dirty === '' && plistSha256 === expectedPlistSha256,
  'exact current app/build/launcher required');
}
function command(binary, args) {
  const result = spawnSync(binary, args, { encoding: 'utf8', timeout: 5000, maxBuffer: 4 * 1024 * 1024 });
  check(result.status === 0, 'read-only process evidence unavailable; output withheld');
  return result.stdout.trim();
}
export function assertGen51LoadedEnvironment(lines, declared) {
  const actual = Object.create(null);
  for (const line of lines) {
    const match = /^\t\t([A-Za-z_][A-Za-z0-9_]*) => (.*)$/u.exec(line);
    check(match && !Object.hasOwn(actual, match[1]), 'malformed / duplicate loaded environment key');
    actual[match[1]] = match[2];
  }
  const platform = { OSLogRateLimit: '64', XPC_SERVICE_NAME: 'com.homecook.production' };
  check(!Object.keys(platform).some(key => Object.hasOwn(declared, key)), 'explicit environment overlaps platform keys');
  const expected = { ...declared, ...platform };
  check(same(Object.keys(actual).sort(), Object.keys(expected).sort())
    && Object.entries(expected).every(([key, value]) => actual[key] === value), 'actual web environment differs');
  return true;
}
function currentWeb(expectedPlistSha256) {
  const webPath = join(homedir(), 'Library/LaunchAgents/com.homecook.production.plist');
  const stat = lstatSync(webPath);
  check(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.uid === process.getuid() && (stat.mode & 0o022) === 0, 'owned web launcher required');
  const bytes = readFileSync(webPath);
  const web = JSON.parse(command('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', webPath]));
  const cwd = web.WorkingDirectory;
  const selection = { cwd, ref: command('git', ['-C', cwd, 'rev-parse', 'HEAD']), buildId: readFileSync(join(cwd, '.next/BUILD_ID'), 'utf8').trim(),
    dirty: command('git', ['-C', cwd, 'status', '--porcelain', '--untracked-files=no']), plistSha256: hash(bytes) };
  assertGen51AppSelection(selection, expectedPlistSha256);
  const serviceTarget = `gui/${process.getuid()}/com.homecook.production`;
  const stdout = command('/bin/launchctl', ['print', serviceTarget]);
  const state = assertV74LoadedService({ stdout, plist: web, plistPath: webPath, serviceTarget });
  const identity = command('/bin/ps', ['-p', String(state.pid), '-o', 'uid=', '-o', 'lstart=']).split(/\s+/u);
  check(Number(identity.shift()) === process.getuid(), 'actual web owner differs');
  const actualCwd = command('/usr/sbin/lsof', ['-a', '-p', String(state.pid), '-d', 'cwd', '-Fn']).split('\n').find(line => line.startsWith('n'))?.slice(1);
  check(actualCwd === cwd, 'actual web cwd differs');
  // Exact explicit environment values, confined to the root environment block.
  const lines = stdout.split('\n'); let depth = 0; let environmentDepth = null; const environment = [];
  for (const line of lines) {
    if (depth === 1 && line === '\tenvironment = {') environmentDepth = 2;
    else if (environmentDepth !== null && depth === environmentDepth && line !== '\t}') environment.push(line);
    if (/ = \{$/u.test(line)) depth++;
    if (/^\t*\}$/u.test(line)) { depth--; if (environmentDepth !== null && depth < environmentDepth) environmentDepth = null; }
  }
  assertGen51LoadedEnvironment(environment, web.EnvironmentVariables ?? {});
  return { ...selection, pid: state.pid, started: identity.join(' ') };
}
export async function planGen51Compatibility(purpose) {
  check(['deployment', 'backup'].includes(purpose), 'choose deployment or backup');
  const at = new Date().toISOString();
  const authority = readGen51Authority(path => readClosedR2PrivateBytes(path, root, 524288));
  const webBefore = currentWeb(authority.plan.files.web);
  const review = loadProtectedRolloutReview(root, { feature: FROZEN_QUANTITY_FEATURE, ref: GEN51.appRef });
  const maintenance = loadCurrentDatabaseMaintenance(root);
  check(maintenance?.review.feature === FROZEN_QUANTITY_FEATURE, 'committed DB240 required');
  const base = await createRecordingDockerAdapter({ configPath: review.database.configPath, backupDirectory: GEN51.operation, responsiveReads: true });
  await base.inspect();
  const rawBefore = JSON.parse(await base.query(GEN51_CURRENT_DATABASE_SQL));
  assertGen51CurrentDatabase(authority, rawBefore, maintenance.pointer);
  // Independent database implementation of the exact old/new jsonb row digest.
  for (const row of [authority.receipt.before.credential, authority.receipt.after.credential]) {
    const sqlHash = (await base.query(`SELECT encode(sha256(convert_to(${literal(JSON.stringify(row))}::jsonb::text,'UTF8')),'hex');`)).trim();
    check(sqlHash === gen51CredentialHash(row), 'PostgreSQL canonical row hash mismatch');
  }
  const observed = await createProtectedPrelaunchAdapter(base, review.feature, review, maintenance).observe(undefined, 'gen51-readonly-compatibility');
  assertFrozenQuantityObservation(review, observed, 'after', authority);
  const controller = await createCookingMaintenanceLocal({ configPath: review.database.configPath, backupDirectory: GEN51.operation });
  const readiness = await controller.plan();
  await verifyClosedR2Collector(3100);
  let deploymentSelectionChecked = false;
  if (purpose === 'deployment') {
    const plan = spawnSync(process.execPath, [join(root, 'scripts/deploy-prelaunch-web.mjs'), 'plan', '--reviewed-ref', GEN51.appRef, '--already-applied-db', '--db-config', review.database.configPath], { encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
    check(plan.status === 0, 'official web selection plan blocked; output withheld');
    const selection = JSON.parse(plan.stdout);
    check(selection.target === GEN51.appRef, 'official candidate differs');
    deploymentSelectionChecked = true;
  }
  const rawAfter = JSON.parse(await base.query(GEN51_CURRENT_DATABASE_SQL));
  assertGen51CurrentDatabase(authority, rawAfter, maintenance.pointer);
  const after = await controller.plan();
  check(hash(JSON.stringify(rawBefore)) === hash(JSON.stringify(rawAfter)) && after.pid === readiness.pid
    && hash(JSON.stringify(currentWeb(authority.plan.files.web))) === hash(JSON.stringify(webBefore)), 'service / database changed during read-only plan');
  return { purpose, readOnly: true, at, completedAt: new Date().toISOString(), ready: true, generation: 51,
    expiresAt: GEN51.expiresAt, guardStartsAt: new Date(Date.parse(GEN51.expiresAt) - 1800000).toISOString(),
    historicalGen50ValidatedAt: GEN51.historicalAt, currentClockChecks: true, postgresCanonicalHashesMatched: true,
    databaseLedgerCount: 240, appRef: GEN51.appRef, buildId: GEN51.buildId, pid: after.pid,
    authenticated: true, emptyClaimDenied: true, workerHealth: true, enqueueReadiness: true, closedR2: true,
    queued: rawAfter.queued, processing: rawAfter.processing, deploymentSelectionChecked,
    baselinePreserved: true, originalSealsPreserved: true, mutationPerformed: false, deployPerformed: false,
    backupPerformed: false, workerRestarted: false, credentialIssued: false, admissionFenceAcquired: false };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) { console.error('Usage: node scripts/plan-worker-gen51-compatibility.mjs deployment|backup'); process.exitCode = 1; }
  else planGen51Compatibility(process.argv[2]).then(result => process.stdout.write(JSON.stringify(result) + '\n')).catch(error => { console.error(error.message); process.exitCode = 1; });
}
