#!/usr/bin/env node
// Public, unauthenticated GETs only. Never read cookies, credentials or app data.
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--runs' || !/^[1-5]$/.test(args[1]))) {
  throw new Error('Usage: node scripts/diagnose-prelaunch-response-time.mjs [--runs 1..5]');
}
const runs = Number(args[1] ?? 3);
const targets = [
  { name: 'public_home', path: '/', layer: 'public' },
  { name: 'origin_home', path: '/', layer: 'origin' },
  { name: 'app_home', path: '/', layer: 'app' },
  { name: 'public_recipes', path: '/api/v1/recipes?limit=1', layer: 'public' },
  { name: 'app_recipes', path: '/api/v1/recipes?limit=1', layer: 'app' },
];

function measure(target) {
  const localApp = target.layer === 'app';
  const url = `${localApp ? 'http://127.0.0.1:3100' : 'https://app.mumeok.kr'}${target.path}`;
  const options = ['-q', '--silent', '--show-error', '--connect-timeout', '5', '--max-time', '15', '--output', '/dev/null', '--write-out', '%{json}'];
  if (localApp) options.push('--header', 'Host: app.mumeok.kr', '--header', 'X-Forwarded-Proto: https');
  if (target.layer === 'origin') options.push('--connect-to', 'app.mumeok.kr:443:127.0.0.1:8443');
  // Origin HTTPS still verifies the real hostname/certificate; no --insecure.
  const result = spawnSync('curl', [...options, url], { encoding: 'utf8', timeout: 17_000, maxBuffer: 64 * 1024 });
  let data;
  try { data = JSON.parse(result.stdout); } catch { data = {}; }
  return {
    target: target.name,
    status: data.http_code ?? 0,
    exit: result.status,
    ttfb_ms: Number.isFinite(data.time_starttransfer) ? Math.round(data.time_starttransfer * 1000) : null,
    total_ms: Number.isFinite(data.time_total) ? Math.round(data.time_total * 1000) : null,
    tls_ms: Number.isFinite(data.time_appconnect) ? Math.round(data.time_appconnect * 1000) : null,
    certificate_verification: data.ssl_verify_result ?? null,
  };
}

function edgeLocation(host) {
  const result = spawnSync('curl', ['-q', '--silent', '--connect-timeout', '5', '--max-time', '10', `https://${host}/cdn-cgi/trace`], { encoding: 'utf8', timeout: 12_000, maxBuffer: 8192 });
  // Trace also contains the visitor IP. Keep only the public edge location code.
  const match = result.status === 0 ? /^colo=([A-Z0-9]{3,8})$/mu.exec(result.stdout) : null;
  return { host, colo: match?.[1] ?? null };
}

const samples = [];
const startedAt = new Date().toISOString();
for (let round = 1; round <= runs; round += 1) {
  for (const target of targets) {
    const sample = { round, ...measure(target) };
    samples.push(sample);
    process.stdout.write(`${JSON.stringify({ type: 'sample', ...sample })}\n`);
  }
}

const summaries = targets.map(({ name }) => {
  const rows = samples.filter(row => row.target === name);
  const successful = rows.filter(row => row.exit === 0 && row.status === 200).map(row => row.total_ms).sort((a, b) => a - b);
  const middle = Math.floor(successful.length / 2);
  return {
    target: name,
    successes: successful.length,
    attempts: rows.length,
    median_ms: successful.length ? (successful.length % 2 ? successful[middle] : (successful[middle - 1] + successful[middle]) / 2) : null,
    worst_ms: successful.at(-1) ?? null,
  };
});
process.stdout.write(`${JSON.stringify({ type: 'summary', started_at: startedAt, finished_at: new Date().toISOString(), summaries, edges: [edgeLocation('app.mumeok.kr'), edgeLocation('www.cloudflare.com')], scope: 'Anonymous public GETs; current prelaunch app port 3100 and verified HTTPS origin port 8443; no runtime changes' })}\n`);
if (samples.some(row => row.exit !== 0 || row.status !== 200)) process.exitCode = 1;
