import { createHash, createHmac } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export const FINGERPRINT_RECOVERY_SCHEMA = 'homecook.youtube-fingerprint-recovery.v1';
export const FINGERPRINT_RECOVERY_FROM = '53da069a4b27672bb5eb9d0a617783c1b9c33d5f';
export const FINGERPRINT_RECOVERY_CONFIRMATION = 'preserve-v1-eight-and-enable-future-v2';
const SHA = /^[a-f0-9]{64}$/u;
const check = (ok, code) => { if (!ok) throw new Error(`fingerprint recovery: ${code}`); };
export const fingerprintRecoveryHash = bytes => createHash('sha256').update(bytes).digest('hex');
const literal = value => `'${String(value).replaceAll("'", "''")}'`;

// A separate statement after the advisory lock gets a fresh READ COMMITTED snapshot.
// SHARE ROW EXCLUSIVE blocks job/notification/reaper DML but permits empty worker reads.
export const FINGERPRINT_RECOVERY_BEGIN_SQL = `BEGIN ISOLATION LEVEL READ COMMITTED;
 SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'; SET LOCAL idle_in_transaction_session_timeout='45s';
 SELECT pg_catalog.pg_advisory_xact_lock(86120317);`;
export const FINGERPRINT_RECOVERY_TABLE_LOCK_SQL = `LOCK TABLE private.youtube_extraction_current_policy,
 private.youtube_extraction_worker_credentials,public.youtube_extraction_jobs,public.youtube_extractor_permits IN SHARE ROW EXCLUSIVE MODE;`;
export const FINGERPRINT_RECOVERY_STATE_SQL = `SELECT jsonb_build_object(
 'policy',(SELECT to_jsonb(p) FROM private.youtube_extraction_current_policy p WHERE policy_key='primary'),
 'policyRowSha256',(SELECT encode(sha256(convert_to(to_jsonb(p)::text,'UTF8')),'hex') FROM private.youtube_extraction_current_policy p WHERE policy_key='primary'),
 'policyStableSha256',(SELECT encode(sha256(convert_to((to_jsonb(p)-'enabled'-'updated_at')::text,'UTF8')),'hex') FROM private.youtube_extraction_current_policy p WHERE policy_key='primary'),
 'jobsSha256',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(j) ORDER BY id),'[]'::jsonb)::text,'UTF8')),'hex') FROM public.youtube_extraction_jobs j),
 'originalJobs',(SELECT coalesce(jsonb_object_agg(encode(sha256(convert_to(id::text,'UTF8')),'hex'),encode(sha256(convert_to(to_jsonb(j)::text,'UTF8')),'hex')),'{}'::jsonb) FROM public.youtube_extraction_jobs j),
 'v1Count',(SELECT count(*) FROM public.youtube_extraction_jobs WHERE request_fingerprint_key_version='1'),
 'v1TerminalCount',(SELECT count(*) FROM public.youtube_extraction_jobs WHERE request_fingerprint_key_version='1' AND status IN ('succeeded','failed')),
 'v2Count',(SELECT count(*) FROM public.youtube_extraction_jobs WHERE request_fingerprint_key_version='2'),
 'activeCount',(SELECT count(*) FROM public.youtube_extraction_jobs WHERE status IN ('queued','processing')),
 'permitHeld',EXISTS(SELECT 1 FROM public.youtube_extractor_permits WHERE owner_id IS NOT NULL AND expires_at>clock_timestamp()));`;

export function assertFingerprintPolicyChange(before, after, direction = 'apply') {
  const [from, to] = direction === 'compensate' ? ['2', '1'] : ['1', '2'];
  check(['apply', 'compensate'].includes(direction), 'direction');
  check(before?.policy_key === 'primary' && before.enabled === true && before.fingerprint_key_version === from
    && before.previous_fingerprint_key_version === null && before.previous_fingerprint_valid_until === null, 'policy-preimage');
  check(after?.fingerprint_key_version === to && typeof after.updated_at === 'string'
    && Number.isFinite(Date.parse(after.updated_at)) && Date.parse(after.updated_at) >= Date.parse(before.updated_at)
    && isDeepStrictEqual({ ...before, fingerprint_key_version: to, updated_at: after.updated_at }, after), 'policy-only-two-fields');
  return after;
}
export function assertFingerprintRecoveryState(state, { version, requireOriginalV2 = false } = {}) {
  check(state?.policy?.fingerprint_key_version === version && state.policy.enabled === true
    && state.policy.previous_fingerprint_key_version === null && state.policy.previous_fingerprint_valid_until === null,
  'policy-state');
  check(state.activeCount === 0 && state.permitHeld === false, 'active-work');
  check(state.v1Count === 8 && state.v1TerminalCount === 8 && SHA.test(state.jobsSha256)
    && SHA.test(state.policyRowSha256) && SHA.test(state.policyStableSha256), 'retained-eight');
  check(state.originalJobs && Object.keys(state.originalJobs).length===41
    && Object.entries(state.originalJobs).every(([id,row])=>SHA.test(id)&&SHA.test(row)), 'original-forty-one');
  if (requireOriginalV2) check(state.v2Count === 33, 'new-v2-history-forbids-compensation');
  return state;
}
export function fingerprintPolicyUpdateSql(before, direction = 'apply') {
  check(['apply', 'compensate'].includes(direction), 'direction');
  const version = direction === 'apply' ? '2' : '1';
  return `WITH changed AS (UPDATE private.youtube_extraction_current_policy p
 SET fingerprint_key_version=${literal(version)},updated_at=clock_timestamp()
 WHERE p.policy_key='primary' AND to_jsonb(p)=${literal(JSON.stringify(before))}::jsonb RETURNING 1)
 SELECT count(*) FROM changed;`;
}

// No source, permission, worker, schema, catalog or ordinary row hashes may move.
export function assertFingerprintPreservation(before, after) {
  check(isDeepStrictEqual(before, after), 'protected-observation-drift');
}
export function assertFingerprintReceipt(receipt, { predecessorSha256, origin, worker } = {}) {
  check(receipt?.schema === FINGERPRINT_RECOVERY_SCHEMA && receipt.status === 'committed'
    && ['apply', 'compensate'].includes(receipt.direction) && receipt.predecessorSha256 === predecessorSha256
    && SHA.test(predecessorSha256) && isDeepStrictEqual(receipt.origin, origin), 'receipt-authority');
  assertFingerprintPolicyChange(receipt.before.policy, receipt.after.policy, receipt.direction);
  assertFingerprintRecoveryState(receipt.before, { version: receipt.direction === 'apply' ? '1' : '2', requireOriginalV2: true });
  assertFingerprintRecoveryState(receipt.after, { version: receipt.direction === 'apply' ? '2' : '1', requireOriginalV2: true });
  check(receipt.before.jobsSha256 === receipt.after.jobsSha256, 'receipt-jobs');
  check(isDeepStrictEqual(receipt.before.originalJobs,receipt.after.originalJobs),'receipt-original-jobs');
  assertFingerprintPreservation(receipt.beforePreserved, receipt.afterPreserved);
  check(receipt.beforePreserved.worker.credentialGeneration === 49
    && receipt.beforePreserved.worker.workerReleaseSha === '3e58467499c63ba20c3b3191d9dd7dec77a7aa44'
    && isDeepStrictEqual(receipt.beforePreserved.worker, Object.fromEntries(Object.entries(worker)
      .filter(([key]) => !['policyRowSha256','policyStableSha256','queued','processing','permitHeld','activeEnqueueSessions'].includes(key)))), 'receipt-worker');
  return { ...worker, policyRowSha256: receipt.after.policyRowSha256, policyStableSha256: receipt.after.policyStableSha256 };
}

/** Hooks use the actual protected observer and durable private journal, never user-provided SQL. */
export async function transitionFingerprintPolicy({ session, expected, observePreserved, publish, direction = 'apply' }) {
  const version = direction === 'apply' ? '1' : '2';
  let dispatched = false;
  await publish('intent', { direction, expected });
  try {
    await session.query(FINGERPRINT_RECOVERY_BEGIN_SQL);
    await session.query(FINGERPRINT_RECOVERY_TABLE_LOCK_SQL);
    const before = JSON.parse((await session.query(FINGERPRINT_RECOVERY_STATE_SQL)).trim());
    assertFingerprintRecoveryState(before, { version, requireOriginalV2: true });
    check(isDeepStrictEqual(before, expected), 'preimage-CAS');
    const beforePreserved = await observePreserved(session.query);
    check((await session.query(fingerprintPolicyUpdateSql(before.policy, direction))).trim() === '1', 'one-policy-row');
    const after = JSON.parse((await session.query(FINGERPRINT_RECOVERY_STATE_SQL)).trim());
    assertFingerprintPolicyChange(before.policy, after.policy, direction);
    assertFingerprintRecoveryState(after, { version: direction === 'apply' ? '2' : '1', requireOriginalV2: true });
    check(before.jobsSha256 === after.jobsSha256, 'jobs-changed');
    const afterPreserved = await observePreserved(session.query);
    assertFingerprintPreservation(beforePreserved, afterPreserved);
    const record = { direction, before, after, beforePreserved, afterPreserved };
    await publish('commit-dispatch', record);
    dispatched = true;
    await session.query('COMMIT;');
    // If this durable write fails, commit has still happened. Never blindly retry.
    await publish('committed', record);
    return record;
  } catch (error) {
    if (!dispatched) {
      try { await session.query('ROLLBACK;'); } catch { /* Reconcile the durable intent before another attempt. */ }
    }
    // Do not serialize database/transport errors: they can contain SQL or private values.
    throw new Error(dispatched ? 'fingerprint recovery: outcome-uncertain-reconcile-required' : 'fingerprint recovery: rejected-before-commit', { cause: error });
  }
}

export function classifyFingerprintReconciliation({ expected, dispatch, observed }) {
  if (isDeepStrictEqual(observed, expected)) return 'not-applied';
  if (dispatch && !isDeepStrictEqual(expected.originalJobs,dispatch.after.originalJobs)) return 'uncertain-forward-fix-only';
  if (dispatch && isDeepStrictEqual(observed.policy, dispatch.after.policy)
    && observed.policyRowSha256 === dispatch.after.policyRowSha256 && observed.policyStableSha256 === dispatch.after.policyStableSha256) {
    // Any V2 history prevents compensation, even if the job has become terminal.
    if (observed.jobsSha256 === dispatch.after.jobsSha256) return 'committed';
    if (preservesOriginalFingerprintJobs(dispatch.after,observed) && observed.v2Count>33) return 'committed-with-new-work';
  }
  return 'uncertain-forward-fix-only';
}

export function preservesOriginalFingerprintJobs(before,after) {
  return before.originalJobs && after.originalJobs && Object.entries(before.originalJobs).every(([id,row])=>after.originalJobs[id]===row);
}
function canonicalFingerprintJson(value) {
  if(value===null||typeof value!=="object")return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonicalFingerprintJson).join(',')+']';
  return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalFingerprintJson(value[key])).join(',')+'}';
}
export function verifyExistingV2Fingerprints(env,rows) {
  const secret=env.HOMECOOK_YOUTUBE_EXTRACTION_FINGERPRINT_HMAC_KEY_V2?.trim();
  check(typeof secret==='string'&&Buffer.byteLength(secret,'utf8')>=32,'existing-v2-key-unavailable');
  check(rows.length===33,'existing-v2-history-count');
  let matched=0;
  for(const row of rows){
    const preimage=canonicalFingerprintJson({extractor_mode:row.extractor_mode,pipeline_identity:row.pipeline_identity,
      policy_version:row.policy_version,result_affecting_options:row.result_affecting_options,
      schema_identity:'youtube-extraction-fingerprint-v1',user_id:row.user_id,youtube_video_id:row.youtube_video_id});
    if(createHmac('sha256',secret).update(preimage,'utf8').digest('hex')===row.fingerprint)matched++;
  }
  check(matched===33,'existing-v2-key-mismatch');
  return {existingV2Configured:true,compared:33,matched:33,secretDisclosed:false};
}
