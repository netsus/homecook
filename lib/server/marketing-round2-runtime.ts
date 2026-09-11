import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import { isIP } from 'node:net';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { Round2Error } from '@/lib/marketing-round2';
const SECRET_NAMES = ['page', 'cookie', 'bootstrap', 'event', 'email', 'receipt', 'rate'] as const;
const PROOFS = ['turnstile_live', 'db_migration', 'db_authority', 'privacy_consent', 'retention_runbook', 'operator_approval'] as const;
const PROXY_PROOFS = ['direct_access_denial', 'header_overwrite', 'launch_binding'] as const;
const START = Date.parse('2026-09-10T15:00:00Z');
const END = Date.parse('2026-10-31T15:00:00Z');
const execute = promisify(execFile);
type Control = {
  version: 1;
  collection_enabled: boolean;
  lead_enabled: boolean;
  consent_generation: number;
};
type Environment = Record<string, string | undefined>;
export type Round2RuntimeConfig = {
  enabled: boolean;
  leadsEnabled: boolean;
  localPreview: boolean;
  profile: 'production' | 'isolated' | 'invalid';
  origin: string;
  hostname: 'app.mumeok.kr' | 'localhost';
  secrets: Record<typeof SECRET_NAMES[number], string>;
  turnstileSecret: string;
  rateStateDir: string;
  controlPath: string;
  repositoryRoot: string;
  releaseSha: string;
  readinessPath: string;
  isolatedIdentityPath: string;
  dataOrigin: string;
  nodeEnv: string;
  otherSecrets: string[];
};
function unavailable(): never { throw new Round2Error('ROUND2_UNAVAILABLE'); }
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
/** Reading flags never requires live secrets; the handler checks HTTP shape before enabled/config. */
export function readRound2RuntimeConfig(env: Environment = process.env): Round2RuntimeConfig {
  const profile = !env.MUMEOK_ROUND2_PROFILE || env.MUMEOK_ROUND2_PROFILE === 'production' ? 'production' : env.MUMEOK_ROUND2_PROFILE === 'isolated' ? 'isolated' : 'invalid';
  return {
    enabled: env.MUMEOK_ROUND2_ENABLED === 'true', leadsEnabled: env.MUMEOK_ROUND2_LEADS_ENABLED === 'true',
    localPreview: env.MUMEOK_ROUND2_LOCAL_PREVIEW === 'true', profile,
    origin: profile === 'isolated' ? 'https://localhost:3443' : 'https://app.mumeok.kr',
    hostname: profile === 'isolated' ? 'localhost' : 'app.mumeok.kr',
    secrets: Object.fromEntries(SECRET_NAMES.map(name => [name, env[`MUMEOK_ROUND2_${name.toUpperCase()}_SECRET`] ?? ''])) as Round2RuntimeConfig['secrets'],
    turnstileSecret: env.MUMEOK_ROUND2_TURNSTILE_SECRET_KEY ?? '',
    rateStateDir: env.MUMEOK_ROUND2_RATE_STATE_DIR ?? '', controlPath: env.MUMEOK_ROUND2_CONTROL_PATH ?? '',
    repositoryRoot: env.MUMEOK_ROUND2_REPOSITORY_ROOT ?? process.cwd(), releaseSha: env.MUMEOK_ROUND2_RELEASE_SHA ?? '',
    readinessPath: env.MUMEOK_ROUND2_READINESS_PATH ?? '', isolatedIdentityPath: env.MUMEOK_ROUND2_ISOLATED_IDENTITY_PATH ?? '',
    dataOrigin: env.DATA_SUPABASE_URL ?? '', nodeEnv: env.NODE_ENV ?? '',
    otherSecrets: Object.entries(env).filter(([key, value]) => value && /(?:MARKETING|TURNSTILE|MUMEOK)/.test(key) && /(?:SECRET|KEY)/.test(key) && !key.startsWith('MUMEOK_ROUND2_')).map(([, value]) => value!),
  };
}
function secretBytes(value: string): Buffer | null {
  const bytes = /^[a-fA-F0-9]{64,}$/.test(value) && value.length % 2 === 0 ? Buffer.from(value, 'hex') :
    /^[A-Za-z0-9_-]+$/.test(value) && Buffer.from(value, 'base64url').toString('base64url') === value ? Buffer.from(value, 'base64url') : null;
  // CSPRNG provenance is an activation requirement; these checks reject obvious weak placeholders.
  if (!bytes || bytes.length < 32 || new Set(bytes).size < 16 || /placeholder|replace|example|your.secret/i.test(value))
    return null;
  return bytes;
}
export function assertRound2Secrets(config: Round2RuntimeConfig): void {
  const seen = new Set<string>();
  for (const key of SECRET_NAMES) {
    const value = config.secrets[key];
    const bytes = secretBytes(value);
    if (!bytes || config.otherSecrets.some(other => other === value || secretBytes(other)?.equals(bytes)))
      unavailable();
    const fingerprint = bytes.toString('hex');
    if (seen.has(fingerprint))
      unavailable();
    seen.add(fingerprint);
  }
}
export function assertRound2Collection(config: Round2RuntimeConfig, control: Control, now = Date.now()): void {
  if (!config.enabled || config.localPreview || !control.collection_enabled)
    throw new Round2Error('ROUND2_DISABLED');
  if (config.profile === 'invalid' || !Number.isFinite(now))
    unavailable();
  if (now < START || now >= END)
    throw new Round2Error('CAMPAIGN_ENDED');
  assertRound2Secrets(config);
}
export function assertRound2Origin(request: Request, config: Pick<Round2RuntimeConfig, 'origin'>): void {
  if (request.headers.get('origin') !== config.origin || request.headers.get('host') !== new URL(config.origin).host ||
    (request.headers.has('sec-fetch-site') && request.headers.get('sec-fetch-site') !== 'same-origin'))
    throw new Round2Error('ORIGIN_NOT_ALLOWED');
}
export function isRound2LocalPreview(host: string, config: Pick<Round2RuntimeConfig, 'localPreview'>): boolean {
  return config.localPreview && /^(?:localhost|127\.0\.0\.1|\[::1\])(?::(?:[1-9]\d{0,4}))?$/.test(host) && (!host.includes(':') || Number(host.split(':').at(-1)) <= 65535 || host === '[::1]');
}
/** Private evidence is re-read, never imported into browser bundles or echoed in errors. */
async function privateBytes(path: string, root: string): Promise<Buffer> {
  try {
    if (!isAbsolute(path) || resolve(path) !== path || !relative(resolve(root), path).startsWith(`..${sep}`))
      unavailable();
    let current = parse(path).root;
    for (const part of path.slice(current.length).split(sep).filter(Boolean)) {
      current = join(current, part);
      if ((await fs.lstat(current)).isSymbolicLink())
        unavailable();
    }
    const directory = await fs.lstat(dirname(path));
    const localTypes = process.platform === 'darwin' ? [17, 26] : process.platform === 'linux' ? [0xef53, 0x01021994, 0x58465342, 0x9123683e, 0x794c7630, 0x2fc12fc1] : [];
    if (!directory.isDirectory() || directory.uid !== process.getuid?.() || (directory.mode & 0o777) !== 0o700 || !localTypes.includes((await fs.statfs(dirname(path))).type >>> 0))
      unavailable();
    const before = await fs.lstat(path);
    if (!before.isFile() || before.nlink !== 1 || before.uid !== process.getuid?.() || (before.mode & 0o777) !== 0o600 || before.size > 65536)
      unavailable();
    const handle = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const opened = await handle.stat();
      if (opened.ino !== before.ino || opened.dev !== before.dev)
        unavailable();
      const bytes = Buffer.alloc(65537);
      let offset = 0;
      while (offset < bytes.length) {
        const read = await handle.read(bytes, offset, bytes.length - offset, null);
        if (!read.bytesRead)
          break;
        offset += read.bytesRead;
      }
      if (offset > 65536)
        unavailable();
      return bytes.subarray(0, offset);
    }
    finally {
      await handle.close();
    }
  }
  catch {
    return unavailable();
  }
}
async function privateJson(path: string, config: Round2RuntimeConfig): Promise<unknown> {
  try {
    return JSON.parse((await privateBytes(path, config.repositoryRoot)).toString('utf8'));
  }
  catch {
    return unavailable();
  }
}
async function verifyProof(value: unknown, config: Round2RuntimeConfig): Promise<void> {
  if (!exact(value, ['path', 'sha256']) || typeof value.path !== 'string' || typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256))
    unavailable();
  if (createHash('sha256').update(await privateBytes(value.path, config.repositoryRoot)).digest('hex') !== value.sha256)
    unavailable();
}
async function productionEvidence(config: Round2RuntimeConfig, lead = false): Promise<Record<string, unknown>> {
  if (config.profile !== 'production' || !/^[a-f0-9]{40}$/.test(config.releaseSha))
    unavailable();
  const evidence = await privateJson(config.readinessPath, config);
  if (!exact(evidence, ['version', 'profile', 'release_sha', 'origin', 'hostname', 'verified_at', 'consent_generation', 'secret_fingerprints', 'proofs', 'proxy']) || evidence.version !== 1 || evidence.profile !== 'production' || evidence.release_sha !== config.releaseSha || evidence.origin !== 'https://app.mumeok.kr' || evidence.hostname !== 'app.mumeok.kr' || typeof evidence.verified_at !== 'string' || !Number.isFinite(Date.parse(evidence.verified_at)))
    unavailable();
  try {
    const head = await execute('git', ['rev-parse', '--verify', 'HEAD'], { cwd: config.repositoryRoot, timeout: 2000, maxBuffer: 1024 });
    if (head.stdout.trim() !== config.releaseSha)
      unavailable();
  }
  catch {
    unavailable();
  }
  if (!Number.isInteger(evidence.consent_generation) || Number(evidence.consent_generation) < 1 || Number(evidence.consent_generation) > 2147483647) unavailable();
  if (!exact(evidence.secret_fingerprints, [...SECRET_NAMES, 'turnstile']))
    unavailable();
  for (const key of [...SECRET_NAMES, 'turnstile'] as const)
    if (evidence.secret_fingerprints[key] !== createHash('sha256').update(key === 'turnstile' ? config.turnstileSecret : config.secrets[key]).digest('hex'))
      unavailable();
  if (!object(evidence.proofs) || Object.keys(evidence.proofs).some(key => !(PROOFS as readonly string[]).includes(key)) || (lead && !exact(evidence.proofs, PROOFS)) || !exact(evidence.proxy, ['header', 'binding', 'ingress', ...PROXY_PROOFS]))
    unavailable();
  if (evidence.proxy.header !== 'cf-connecting-ip' || evidence.proxy.binding !== 'loopback-only' || evidence.proxy.ingress !== 'cloudflare-tunnel')
    unavailable();
  if (lead)
    for (const key of PROOFS)
      await verifyProof(evidence.proofs[key], config);
  for (const key of PROXY_PROOFS)
    await verifyProof(evidence.proxy[key], config);
  return evidence;
}
async function isolatedIdentity(config: Round2RuntimeConfig): Promise<void> {
  if (config.profile !== 'isolated' || config.nodeEnv !== 'test' || config.readinessPath || config.localPreview)
    unavailable();
  assertRound2Secrets(config);
  const value = await privateJson(config.isolatedIdentityPath, config);
  if (!exact(value, ['version', 'profile', 'namespace', 'origin', 'hostname', 'db_origin', 'rate_state_dir', 'control_path', 'secret_fingerprints']) || value.version !== 1 || value.profile !== 'isolated' || typeof value.namespace !== 'string' || !/^r2-[a-z0-9-]+$/.test(value.namespace) || value.origin !== 'https://localhost:3443' || value.hostname !== 'localhost' || value.db_origin !== config.dataOrigin || value.rate_state_dir !== config.rateStateDir || value.control_path !== config.controlPath || !exact(value.secret_fingerprints, SECRET_NAMES))
    unavailable();
  try {
    const database = new URL(config.dataOrigin);
    if (!['http:', 'https:'].includes(database.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname) || !database.port || database.username || database.password || database.pathname !== '/' || database.search || database.hash)
      unavailable();
  }
  catch {
    unavailable();
  }
  for (const path of [config.rateStateDir, config.controlPath])
    if (!isAbsolute(path) || !path.split(sep).includes(value.namespace) || /homecook-full-local/.test(path))
      unavailable();
  for (const key of SECRET_NAMES)
    if (value.secret_fingerprints[key] !== createHash('sha256').update(config.secrets[key]).digest('hex'))
      unavailable();
}
export async function checkRound2LeadReadiness(config: Round2RuntimeConfig, control?: Control, now = Date.now()): Promise<void> {
  try {
    if (!control)
      unavailable();
    assertRound2Collection(config, control, now);
    if (!config.leadsEnabled || !control.lead_enabled || !config.turnstileSecret || config.otherSecrets.includes(config.turnstileSecret))
      unavailable();
    if (config.profile === 'isolated')
      await isolatedIdentity(config);
    else
      if ((await productionEvidence(config, true)).consent_generation !== control.consent_generation) unavailable();
  }
  catch {
    throw new Round2Error('LEAD_CAPTURE_NOT_READY');
  }
}
export async function resolveRound2TrustedIp(request: Request, config: Round2RuntimeConfig): Promise<string> {
  assertRound2Origin(request, config);
  assertRound2Secrets(config);
  if (config.profile === 'isolated') {
    await isolatedIdentity(config);
    if (new URL(request.url).origin !== config.origin)
      unavailable();
    return '127.0.0.1';
  }
  // This trusts the audited ingress boundary, not a browser-provided forwarding chain.
  await productionEvidence(config);
  const ip = request.headers.get('cf-connecting-ip');
  if (!ip || !isIP(ip) || ip.trim() !== ip)
    unavailable();
  return ip;
}
