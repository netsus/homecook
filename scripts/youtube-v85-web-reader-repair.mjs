#!/usr/bin/env node
// This launcher is executable only from its single source-pin child commit.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { READER_REPAIR as R, readerRepairEnvironment, readerRepairArguments, readerRepairGit, verifyReaderRepairLauncher, readReaderRepairAuthority, verifyReaderRepairWebAfter, verifyReaderRepairCompensationPreflight } from './lib/v85-web-reader-repair.mjs';
import { spawnSync } from 'node:child_process';
const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
async function main() {
  const [action] = process.argv.slice(2);
  if (process.argv.length !== 3 || !['plan', 'deploy'].includes(action) || root !== R.launcher || process.platform !== 'darwin') throw Error('exact web-only launcher action required');
  const pin = JSON.parse(readFileSync(join(root, R.manifest), 'utf8')), parentRef = verifyReaderRepairLauncher(pin);
  readReaderRepairAuthority();
  const node = join(homedir(), '.nvm/versions/node/v22.19.0/bin/node');
  // Credential artifacts/provider readiness and the complete approved DB preimage are
  // prepared before the web can enter its brief incompatible-worker interval.
  const preflight = spawnSync(node, [join(R.frozen, 'scripts/youtube-v85-controlled-cutover.mjs'), 'preflight'], {
    cwd: R.frozen, env: readerRepairEnvironment(), encoding: 'utf8', timeout: 180000, maxBuffer: 1024 * 1024,
  });
  if (preflight.status !== 0 || JSON.parse(preflight.stdout).ready !== true) throw Error('original d69 noncredential preflight failed; no web change');
  verifyReaderRepairLauncher(pin); readReaderRepairAuthority();
  verifyReaderRepairCompensationPreflight();
  const start = spawnSync('/bin/ps', ['-p', String(process.pid), '-o', 'lstart='], { env: readerRepairEnvironment(), encoding: 'utf8', timeout: 5000 });
  if (start.status !== 0) throw Error('launcher identity');
  const proof = { schema: 'homecook.v85-web-reader-repair-invocation.v1', pin, parentRoot: root, parentRef,
    parentPid: process.pid, parentStart: start.stdout.trim(), nonce: randomUUID(), issuedAt: new Date().toISOString(), action };
  process.stdout.write(JSON.stringify({ action, exactWebTarget: R.target, actualWebToolRef: pin.executorRef, originalCredentialTool: R.base,
    capsuleSha256: R.capsule, authorityUnchanged: true, credentialIssued: false, originalPreflightReady: true }) + '\n');
  const child = spawn(node, [join(R.executor, 'scripts/deploy-prelaunch-web.mjs'), ...readerRepairArguments(action, pin.executorRef)], {
    cwd: R.executor, env: readerRepairEnvironment(), stdio: ['ignore', 'inherit', 'inherit', 'pipe'],
  });
  child.stdio[3].end(JSON.stringify(proof));
  const code = await new Promise((resolveExit, reject) => { child.on('error', reject); child.on('close', resolveExit); });
  if (code !== 0) throw Error('official fixed15 web operation stopped; inspect existing recovery; never issue a credential here');
  if (readerRepairGit(root, ['rev-parse', 'HEAD']) !== parentRef) throw Error('launcher changed during operation');
  if (action === 'deploy') process.stdout.write(JSON.stringify(await verifyReaderRepairWebAfter(pin)) + '\n');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  process.stderr.write((error.message?.startsWith('V85_WEB_READER_REPAIR_') ? error.message : 'V85_WEB_READER_REPAIR_LAUNCHER_STOPPED: no automatic retry or credential issuance') + '\n'); process.exitCode = 1;
});
