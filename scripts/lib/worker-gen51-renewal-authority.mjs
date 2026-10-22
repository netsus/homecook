// A single, sealed 50 -> 51 renewal. Historical authority never becomes current
// authority by changing the clock. No issuance, registration or Keychain writes.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { V85, V85_OPERATION_DIRECTORY, v85Paths, readV85Authority, assertV85Successor, assertV85After } from './youtube-v85-cutover.mjs';

const home = homedir();
export const GEN51 = Object.freeze({
  operation: join(home, '.homecook/operations/youtube-worker-renewal-gen51-20261022-postguard'),
  planSha256: 'a62f91cc080101b52466e1b177093a7bf34b6b8ca489cc44ed1f908ae299cdb7',
  receiptSha256: '11916afa8cdfdb0fd373afd301e177e92d20a867bee8687958d18993c25ea13a',
  sourceRef: '41e0e535d671519d573beb826f55926b384fb23c',
  activationSha256: '3837afcebb57f880c29fe7b937c917fa876a4be317a3dbf1e5702cc35617a14d',
  historicalAt: '2026-10-19T07:45:54.134Z',
  expiresAt: '2026-10-29T14:00:25.000Z',
  maintenanceSha256: '49f19942acd79207765d6b4200f81bfd0f653a14de9783eb7354fe0b7ac5259b',
  databaseCount: 240,
  appRef: '6f3f213a8f039bbfb631eef885333f0c2eea6130',
  buildId: 'prelaunch-6f3f213a8f03-m5z4ei',
});
const hash = value => createHash('sha256').update(value).digest('hex');
const check = (ok, message) => { if (!ok) throw new Error(`gen51 authority: ${message}`); };
const trusted = new WeakSet();
const keys = value => Object.keys(value ?? {}).sort().join();
const credentialKeys = 'allowed_snapshot_digest,credential_name,current_generation,current_jti_hash,expires_at,release_sha,schema_identity,updated_at';
const p = v85Paths();
const credential = join(p.secrets, 'worker-credential-v85-gen51-20261022.json');
const workerJwtFile = join(p.secrets, './worker-v85-gen51-20261022.jwt');
const installedPlist = join(home, 'Library/LaunchAgents/com.homecook.youtube-extraction-worker.plist');
function ownedRead(path) {
  const stat = lstatSync(path);
  check(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.uid === process.getuid() && (stat.mode & 0o022) === 0, 'owned immutable file required');
  return readFileSync(path);
}
function anchor(account) {
  const result = spawnSync('/usr/bin/security', ['find-generic-password', '-s', 'homecook-youtube-worker-renewal-v1', '-a', account, '-w', join(home, 'Library/Keychains/login.keychain-db')], { encoding: 'utf8', timeout: 10000 });
  check(result.status === 0 && /^[a-f0-9]{64}$/u.test(result.stdout.trim()), 'independent renewal anchor unavailable');
  return result.stdout.trim();
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
// Only the closed ASCII credential row is serialized here. PostgreSQL jsonb
// orders keys by UTF8 byte length then bytes; JSON.stringify's insertion order
// and compact separators are NOT its text format. Live plans cross-check SQL.
export function gen51CredentialText(row) {
  check(keys(row) === credentialKeys, 'closed credential columns required');
  for (const [key, value] of Object.entries(row)) check(key === 'current_generation'
    ? Number.isSafeInteger(value) && value > 0
    : typeof value === 'string' && /^[\x20-\x7e]+$/u.test(value), 'closed credential types required');
  const ordered = Object.keys(row).sort((a, b) => Buffer.byteLength(a) - Buffer.byteLength(b) || Buffer.compare(Buffer.from(a), Buffer.from(b)));
  return `{${ordered.map(key => `${JSON.stringify(key)}: ${JSON.stringify(row[key])}`).join(', ')}}`;
}
export const gen51CredentialHash = row => hash(gen51CredentialText(row));
export function assertGen51Transition(plan, receipt, metadata, claims, now = new Date()) {
  check(Number.isFinite(now.getTime()) && now.getTime() >= Date.parse(receipt.at)
    && now.getTime() + 1800000 < Date.parse(GEN51.expiresAt), 'current time / thirty-minute safety margin');
  check(plan.schema === 'homecook.youtube-worker-renewal-plan.v1' && plan.sourceRef === GEN51.sourceRef
    && plan.newGeneration === 51 && plan.automaticRotation === false && plan.workerRelease === V85.releaseSha,
  'exact reviewed renewal plan required');
  check(receipt.schema === 'homecook.youtube-worker-renewal-receipt.v1' && receipt.planHash === GEN51.planSha256
    && receipt.sourceRef === GEN51.sourceRef && receipt.predecessorActivationSha256 === GEN51.activationSha256
    && receipt.maintenance.sha256 === GEN51.maintenanceSha256 && same(receipt.maintenance, plan.maintenance)
    && same(receipt.before, plan.before) && same(receipt.files, plan.files) && receipt.modelCalls === 0,
  'renewal lineage / maintenance differs');
  const before = receipt.before, after = receipt.after;
  check(keys(before) === keys(after), 'state columns differ');
  for (const key of Object.keys(before).filter(key => key !== 'credential')) check(same(before[key], after[key]), `preserved ${key} differs`);
  check(before.ledger.length === GEN51.databaseCount && before.queued === 0 && before.processing === 0 && before.permitHeld === false
    && before.policy.enabled === true && before.policy.policy_version === 3 && before.policy.pipeline_identity === V85.pipelineIdentity,
  'exact DB240 drained policy required');
  gen51CredentialText(before.credential); gen51CredentialText(after.credential);
  const old = before.credential, next = after.credential;
  check(old.current_generation === 50 && Date.parse(old.expires_at) === Date.parse(V85.expiresAt)
    && next.current_generation === 51 && Date.parse(next.expires_at) === Date.parse(GEN51.expiresAt)
    && Date.parse(next.updated_at) >= Date.parse(plan.createdAt) && Date.parse(next.updated_at) <= Date.parse(receipt.at), 'bounded credential transition');
  check(same({ ...old, current_generation: 51, current_jti_hash: next.current_jti_hash, expires_at: next.expires_at, updated_at: next.updated_at }, next)
    && next.credential_name === 'primary' && next.release_sha === V85.releaseSha && next.schema_identity === V85.schemaIdentity
    && next.allowed_snapshot_digest === V85.snapshotDigest && /^[a-f0-9]{64}$/u.test(next.current_jti_hash)
    && next.current_jti_hash !== old.current_jti_hash, 'only generation/JTI/expiry/update may change');
  check(same(receipt.metadata, metadata) && metadata.generation === 51 && metadata.jti_sha256 === next.current_jti_hash
    && metadata.expires_at === GEN51.expiresAt && metadata.release_sha === V85.releaseSha && metadata.schema_identity === V85.schemaIdentity
    && metadata.allowed_snapshot_digest === V85.snapshotDigest && metadata.token_file === workerJwtFile && metadata.token_file_mode === '0600', 'current metadata differs');
  check(keys(claims) === 'allowed_snapshot_digest,aud,exp,generation,iat,iss,jti_hash,release_sha,role,schema_identity,scope'
    && claims.role === 'youtube_extraction_worker' && claims.scope === 'youtube-extraction-worker'
    && claims.iss === 'https://worker.mumeok.kr' && claims.aud === 'youtube-extraction'
    && claims.generation === 51 && claims.jti_hash === metadata.jti_sha256 && claims.release_sha === metadata.release_sha
    && claims.schema_identity === metadata.schema_identity && claims.allowed_snapshot_digest === metadata.allowed_snapshot_digest
    && Number.isSafeInteger(claims.iat) && Number.isSafeInteger(claims.exp) && claims.exp * 1000 === Date.parse(GEN51.expiresAt)
    && claims.exp > claims.iat && claims.exp - claims.iat <= 7 * 86400 && claims.iat * 1000 <= now.getTime()
    && claims.iat * 1000 >= Date.parse(plan.createdAt) - 1000 && claims.iat * 1000 <= Date.parse(receipt.at), 'restricted original token claims / TTL differs');
  check(receipt.readiness === 'ready' && receipt.health.authenticatedStatus === 200 && receipt.health.emptyClaimStatus === 500
    && receipt.health.emptyClaimDenied === true && receipt.health.ready === true && receipt.service.running === true
    && receipt.service.loaded === true && receipt.service.pid > 0, 'completed original renewal required');
  return true;
}
// No fallback to expired50: the fixed51 receipt and BOTH independent anchors
// are mandatory. No environment/CLI/path/hash override is exposed.
export function readGen51Authority(read) {
  const planBytes = read(join(GEN51.operation, 'plan.json')), receiptBytes = read(join(GEN51.operation, 'receipt.json'));
  check(hash(planBytes) === GEN51.planSha256 && hash(receiptBytes) === GEN51.receiptSha256, 'fixed renewal evidence bytes differ');
  check(anchor('generation-51-plan-sha256') === GEN51.planSha256 && anchor('generation-51-receipt-sha256') === GEN51.receiptSha256, 'independent renewal anchors differ');
  const plan = JSON.parse(planBytes), receipt = JSON.parse(receiptBytes);
  const metadataBytes = read(credential), tokenBytes = read(workerJwtFile), metadata = JSON.parse(metadataBytes);
  check(hash(metadataBytes) === receipt.metadataSha256 && hash(tokenBytes) === receipt.tokenSha256
    && hash(tokenBytes) === metadata.token_file_sha256, 'current token / metadata bytes differ');
  const parts = tokenBytes.toString('utf8').trim().split('.');
  check(parts.length === 3 && JSON.parse(Buffer.from(parts[0], 'base64url')).alg === 'ES256', 'sealed ES256 token required');
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
  assertGen51Transition(plan, receipt, metadata, claims);
  const activationBytes = read(join(V85_OPERATION_DIRECTORY, 'activation.json'));
  check(hash(activationBytes) === GEN51.activationSha256 && JSON.parse(activationBytes).at === GEN51.historicalAt, 'fixed historical activation time / seal');
  check(hash(read(receipt.maintenance.path)) === GEN51.maintenanceSha256, 'DB240 receipt bytes differ');
  for (const key of ['config', 'descriptor', 'policy', 'artifact']) check(hash(key === 'artifact' ? ownedRead(p.manifest) : read(p[key])) === plan.files[key], `current ${key} differs`);
  // The private signing key is deliberately never read by this consumer.
  const oldPlist = read(join(GEN51.operation, 'generation50.plist')).toString('utf8');
  check(hash(oldPlist) === plan.files.plist && oldPlist.split(p.credential).length === 2, 'original single metadata path required');
  const newPlist = read(join(GEN51.operation, 'generation51.plist'));
  check(same(Buffer.from(oldPlist.replace(p.credential, credential)), newPlist)
    && hash(newPlist) === receipt.newPlistSha256 && hash(ownedRead(installedPlist)) === receipt.newPlistSha256, 'only metadata path changes in installed launcher');
  const historical = readV85Authority(read, undefined, undefined, new Date(GEN51.historicalAt));
  check(historical?.proof && hash(activationBytes) === GEN51.activationSha256, 'all original approvals / activation required');
  assertV85After(historical.plan, historical.proof.after, historical.proof.metadata, true);
  const authority = freeze({ plan, receipt, metadata, claims, historical, paths: { ...p, credential, token: workerJwtFile } });
  trusted.add(authority);
  return authority;
}
function assertTrusted(authority, now = new Date()) {
  check(trusted.has(authority), 'loaded independently sealed authority required');
  assertGen51Transition(authority.plan, authority.receipt, authority.metadata, authority.claims, now);
}
export function currentGen51Baseline(authority, baseline) {
  assertTrusted(authority);
  check(baseline.credentialGeneration === 50 && baseline.credentialRowSha256 === gen51CredentialHash(authority.receipt.before.credential)
    && baseline.workerReleaseSha === V85.releaseSha && baseline.schemaIdentity === V85.schemaIdentity
    && baseline.snapshotDigest === V85.snapshotDigest && baseline.workerPolicyEnabled === true
    && baseline.catalogFingerprint === V85.catalogSha256
    && baseline.policyRowSha256 === '8f81aafaf3ff2c27b028858af45359ae344d4018df8faedc73490f6752259275'
    && baseline.policyStableSha256 === '5575282a804b1cd05be15f44fe0f9a41a3c190269830d30b9036cb81dfa3daf2', 'exact old baseline required');
  return { ...baseline, credentialGeneration: 51, credentialRowSha256: gen51CredentialHash(authority.receipt.after.credential) };
}
export function assertGen51CurrentDatabase(authority, observed, maintenance) {
  assertTrusted(authority);
  check(same(maintenance, authority.receipt.maintenance) && same(observed.credential, authority.receipt.after.credential)
    && same(observed.policy, authority.receipt.after.policy) && same(observed.ledger, authority.receipt.after.ledger), 'current credential / policy / DB240 lineage differs');
  check(observed.queued === 0 && observed.processing === 0 && observed.permitHeld === false, 'current queue not drained');
  return true;
}
export function readCurrentV85Authority(read) {
  const renewal = readGen51Authority(read);
  return { ...renewal.historical, renewal };
}
export function currentV85Successor(input) {
  const renewal = input.authority.renewal;
  if (!renewal) return assertV85Successor(input); // Legacy callers keep their original current-clock checks.
  assertTrusted(renewal);
  const old = assertV85Successor({ ...input, now: new Date(GEN51.historicalAt) });
  // Original seal has DB232-era policy fingerprints, not DB240's baseline;
  // credential identity itself must still be the exact pre-renewal row.
  check(old.credentialRowSha256 === gen51CredentialHash(renewal.receipt.before.credential), 'original credential preimage differs');
  return { ...old, credentialGeneration: 51, credentialRowSha256: gen51CredentialHash(renewal.receipt.after.credential) };
}
export function gen51ActiveProof(authority) {
  assertTrusted(authority);
  return { ...authority.historical.proof, service: { ...authority.historical.proof.service, plistSha256: authority.receipt.newPlistSha256 } };
}

export const GEN51_CURRENT_DATABASE_SQL = `SELECT jsonb_build_object(
 'credential',(SELECT to_jsonb(t) FROM private.youtube_extraction_worker_credentials t WHERE credential_name='primary'),
 'policy',(SELECT to_jsonb(t) FROM private.youtube_extraction_current_policy t WHERE policy_key='primary'),
 'ledger',(SELECT jsonb_agg(to_jsonb(t) ORDER BY filename) FROM homecook_deploy.migrations t),
 'queued',(SELECT count(*) FROM public.youtube_extraction_jobs WHERE status='queued'),
 'processing',(SELECT count(*) FROM public.youtube_extraction_jobs WHERE status='processing'),
 'permitHeld',EXISTS(SELECT 1 FROM public.youtube_extractor_permits WHERE permit_key='primary' AND owner_id IS NOT NULL AND expires_at>clock_timestamp()));`;
