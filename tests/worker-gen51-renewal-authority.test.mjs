import test from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { GEN51, assertGen51Transition, gen51CredentialText, gen51CredentialHash, readGen51Authority, currentGen51Baseline, assertGen51CurrentDatabase } from '../scripts/lib/worker-gen51-renewal-authority.mjs';
import { V85 } from '../scripts/lib/youtube-v85-cutover.mjs';
const NOW = new Date('2026-10-22T15:00:00.000Z'); // Old50 really is expired.
function fixture() {
  const old = { expires_at: V85.expiresAt, updated_at: '2026-10-19T06:57:03.630501+00:00', release_sha: V85.releaseSha,
    credential_name: 'primary', schema_identity: V85.schemaIdentity, current_jti_hash: 'a'.repeat(64), current_generation: 50,
    allowed_snapshot_digest: V85.snapshotDigest };
  const before = { credential: old, policy: { enabled: true, policy_version: 3, pipeline_identity: V85.pipelineIdentity, updated_at: 'unchanged' },
    ledger: Array.from({ length: 240 }, (_, i) => ({ filename: String(i), sha256: 'a'.repeat(64), applied_at: 'unchanged' })),
    queued: 0, processing: 0, permitHeld: false, jobs: 'unchanged', protected: { normal: 'unchanged', catalog: 'unchanged', controls: 'unchanged' } };
  const metadata = { generation: 51, jti_sha256: 'b'.repeat(64), expires_at: GEN51.expiresAt, release_sha: V85.releaseSha,
    schema_identity: V85.schemaIdentity, allowed_snapshot_digest: V85.snapshotDigest,
    token_file: join(homedir(), '.homecook/youtube-extraction/worker-v85-gen51-20261022.jwt'), token_file_mode: '0600' };
  const plan = { schema: 'homecook.youtube-worker-renewal-plan.v1', sourceRef: GEN51.sourceRef, before: structuredClone(before), files: { oldSeal: GEN51.activationSha256 },
    newGeneration: 51, automaticRotation: false, workerRelease: V85.releaseSha, createdAt: '2026-10-22T14:00:26.000Z', maintenance: { path: '/private/receipt', sha256: GEN51.maintenanceSha256 } };
  const after = structuredClone(before);
  Object.assign(after.credential, { current_generation: 51, current_jti_hash: metadata.jti_sha256, expires_at: GEN51.expiresAt, updated_at: '2026-10-22T14:01:34.404763+00:00' });
  const receipt = { schema: 'homecook.youtube-worker-renewal-receipt.v1', planHash: GEN51.planSha256, sourceRef: GEN51.sourceRef,
    predecessorActivationSha256: GEN51.activationSha256, maintenance: plan.maintenance, before, after, files: plan.files, metadata: structuredClone(metadata), modelCalls: 0,
    at: '2026-10-22T14:02:12.500Z', readiness: 'ready', health: { authenticatedStatus: 200, emptyClaimStatus: 500, emptyClaimDenied: true, ready: true }, service: { loaded: true, running: true, pid: 123 } };
  const claims = { role: 'youtube_extraction_worker', scope: 'youtube-extraction-worker', iss: 'https://worker.mumeok.kr', aud: 'youtube-extraction', generation: 51,
    jti_hash: metadata.jti_sha256, release_sha: V85.releaseSha, schema_identity: V85.schemaIdentity, allowed_snapshot_digest: V85.snapshotDigest,
    iat: Date.parse('2026-10-22T14:01:16Z') / 1000, exp: Date.parse(GEN51.expiresAt) / 1000 };
  return { plan, receipt, metadata, claims };
}
const validate = (f, now = NOW) => assertGen51Transition(f.plan, f.receipt, f.metadata, f.claims, now);
test('expired predecessor history can coexist with currently valid exact51 evidence', () => {
  assert.ok(NOW.getTime() > Date.parse(V85.expiresAt));
  assert.equal(validate(fixture()), true);
});
test('current expiry safety boundary is strict, including expired51 and replaying historic clock', () => {
  for (const at of ['2026-10-19T07:45:54.134Z', '2026-10-29T13:30:25.000Z', '2026-10-29T14:00:25.000Z', '2027-01-01'])
    assert.throws(() => validate(fixture(), new Date(at)), /current time/u);
  assert.equal(validate(fixture(), new Date('2026-10-29T13:30:24.999Z')), true);
});
const failures = {
  generation52: f => { f.receipt.after.credential.current_generation = 52; },
  release: f => { f.receipt.after.credential.release_sha = 'f'.repeat(40); },
  snapshot: f => { f.receipt.after.credential.allowed_snapshot_digest = 'f'.repeat(64); },
  rowExtra: f => { f.receipt.after.credential.permissions = 'admin'; },
  policyTimestamp: f => { f.receipt.after.policy.updated_at = 'different'; },
  policyOff: f => { f.receipt.after.policy.enabled = false; },
  ledger: f => { f.receipt.after.ledger.pop(); },
  catalog: f => { f.receipt.after.protected.catalog = 'different'; },
  jobs: f => { f.receipt.after.jobs = 'different'; },
  queued: f => { f.receipt.after.queued = 1; },
  permit: f => { f.receipt.after.permitHeld = true; },
  wrongMaintenance: f => { f.receipt.maintenance = { path: '/other', sha256: 'f'.repeat(64) }; },
  wrongSource: f => { f.receipt.sourceRef = 'f'.repeat(40); },
  wrongSeal: f => { f.receipt.predecessorActivationSha256 = 'f'.repeat(64); },
  metadata: f => { f.metadata.jti_sha256 = 'f'.repeat(64); },
  tokenRole: f => { f.claims.role = 'service_role'; },
  tokenAudience: f => { f.claims.aud = 'other'; },
  tokenScope: f => { f.claims.scope = 'admin'; },
  tokenExtraClaim: f => { f.claims.permissions = '*'; },
  tokenTtl: f => { f.claims.iat -= 8 * 86400; },
  tokenExpiry: f => { f.claims.exp += 1; },
  noHealth: f => { f.receipt.health.ready = false; },
  noEmptyDenial: f => { f.receipt.health.emptyClaimDenied = false; },
  automaticRotation: f => { f.plan.automaticRotation = true; },
};
for (const [name, mutate] of Object.entries(failures)) test(`rejects ${name}`, () => { const f = fixture(); mutate(f); assert.throws(() => validate(f)); });
test('cannot mint a trusted current baseline from plain caller evidence', () => {
  const f = fixture();
  assert.throws(() => currentGen51Baseline(f, {}), /independently sealed/u);
  assert.throws(() => assertGen51CurrentDatabase(f, f.receipt.after, f.receipt.maintenance), /independently sealed/u);
});
test('missing / truncated / substituted fixed receipt stops before any fallback', () => {
  for (const read of [() => { throw Error('missing'); }, () => Buffer.from('{}'), () => Buffer.from('forged')])
    assert.throws(() => readGen51Authority(read));
});
test('closed PostgreSQL credential canonicalization rejects unsupported shapes and types', () => {
  const row = fixture().receipt.before.credential;
  const reversed = Object.fromEntries(Object.entries(row).reverse());
  assert.equal(gen51CredentialHash(row), gen51CredentialHash(reversed));
  assert.ok(gen51CredentialText(row).startsWith('{"expires_at": '));
  for (const invalid of [{ ...row, extra: true }, { ...row, current_generation: 50.1 }, { ...row, credential_name: null }, { ...row, credential_name: '한글' }])
    assert.throws(() => gen51CredentialText(invalid));
});
test('canonical digest matches independently calculated synthetic PostgreSQL row hash', () => {
  const row = fixture().receipt.before.credential;
  row.expires_at = '2026-10-22T14:27:30+00:00';
  // All fields are synthetic; no operating credential/JTI evidence is published.
  row.current_jti_hash = 'a'.repeat(64);
  assert.equal(gen51CredentialHash(row), 'e34c2455ea727c72f5cc33e09a4cf95dc36081b78c3dbce4789221d0103b37e5');
});

test('app evidence rejects a matching directory with wrong ref/build/launcher', async () => {
  const { assertGen51AppSelection } = await import('../scripts/plan-worker-gen51-compatibility.mjs');
  const input = { cwd: join(homedir(), '.homecook/prelaunch-web/releases/6f3f213a8f03-m5z4ei/checkout'), ref: GEN51.appRef,
    buildId: GEN51.buildId, dirty: '', plistSha256: 'a'.repeat(64) };
  assert.doesNotThrow(() => assertGen51AppSelection(input, 'a'.repeat(64)));
  for (const patch of [{ ref: 'f'.repeat(40) }, { buildId: 'other' }, { dirty: ' M helper.mjs' }, { plistSha256: 'b'.repeat(64) }])
    assert.throws(() => assertGen51AppSelection({ ...input, ...patch }, 'a'.repeat(64)));
});
test('operator pin canonicalization accepts only a single static JSON declaration', async () => {
  const { canonicalGen51OperatorText } = await import('../scripts/lib/worker-gen51-compat-source.mjs');
  const declaration = 'export const COMPAT_SOURCE_PIN = Object.freeze({"ref":null,"files":null});';
  assert.equal(canonicalGen51OperatorText(declaration), declaration);
  for (const invalid of ['', declaration + '\n' + declaration, 'export const COMPAT_SOURCE_PIN = Object.freeze({ref:process.env.REF,files:null});',
    'export const COMPAT_SOURCE_PIN = Object.freeze({"ref":"arbitrary","files":{}});']) assert.throws(() => canonicalGen51OperatorText(invalid));
});
test('operator rejects unpinned imported helper edits, dirty/untracked checkout and non-binding commits', async () => {
  const { assertGen51CheckoutEvidence, COMPAT_SOURCE_PIN } = await import('../scripts/lib/worker-gen51-compat-source.mjs');
  const input = { parent: COMPAT_SOURCE_PIN.ref, bindingChangedFiles: 'scripts/lib/worker-gen51-compat-source.mjs', dirty: '', implementationChangedFiles: ['scripts/lib/worker-gen51-renewal-authority.mjs'] };
  assert.equal(assertGen51CheckoutEvidence(input), true);
  for (const patch of [{ parent: 'f'.repeat(40) }, { bindingChangedFiles: input.bindingChangedFiles + '\nscripts/lib/helper.mjs' },
    { dirty: ' M scripts/lib/helper.mjs' }, { dirty: '?? scripts/lib/helper.mjs' }, { implementationChangedFiles: ['scripts/lib/youtube-extraction-worker-runtime.mjs'] }])
    assert.throws(() => assertGen51CheckoutEvidence({ ...input, ...patch }));
});
test('loaded environment requires exact keys/values plus two fixed platform entries', async () => {
  const { assertGen51LoadedEnvironment } = await import('../scripts/plan-worker-gen51-compatibility.mjs');
  const declared = { NODE_ENV: 'production', PATH: '/fixed/bin' };
  const lines = ['\t\tNODE_ENV => production', '\t\tPATH => /fixed/bin', '\t\tOSLogRateLimit => 64', '\t\tXPC_SERVICE_NAME => com.homecook.production'];
  assert.equal(assertGen51LoadedEnvironment(lines, declared), true);
  for (const invalid of [[...lines, '\t\tNODE_OPTIONS => --require /tmp/foreign.mjs'], [...lines, lines[0]], lines.slice(1),
    lines.map(line => line.replace('=> 64', '=> 100')), lines.map(line => line.replace('=> production', '=> development')), [...lines, '\t\tmalformed']])
    assert.throws(() => assertGen51LoadedEnvironment(invalid, declared));
});
test('default execution permits only original-base merge of the identical complete binding tree', async () => {
  const { assertGen51ExecutionCommit, GEN51_PUBLIC_BASE, COMPAT_SOURCE_PIN } = await import('../scripts/lib/worker-gen51-compat-source.mjs');
  const evidence = { parents: [GEN51_PUBLIC_BASE, 'b'.repeat(40)], headTree: 'c'.repeat(40), bindingTree: 'c'.repeat(40) };
  assert.equal(assertGen51ExecutionCommit(evidence), true);
  assert.equal(assertGen51ExecutionCommit({ ...evidence, parents: [COMPAT_SOURCE_PIN.ref] }), true);
  for (const patch of [{ parents: ['f'.repeat(40), evidence.parents[1]] }, { parents: [GEN51_PUBLIC_BASE, COMPAT_SOURCE_PIN.ref] },
    { headTree: 'f'.repeat(40) }, { parents: [GEN51_PUBLIC_BASE] }, { parents: [...evidence.parents, 'f'.repeat(40)] }])
    assert.throws(() => assertGen51ExecutionCommit({ ...evidence, ...patch }));
});
