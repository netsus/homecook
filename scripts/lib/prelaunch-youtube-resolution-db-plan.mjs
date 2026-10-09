/** Exact DB transaction plan for the c51d53871 Stage 1 rollout. */
import { isDeepStrictEqual } from "node:util";

import {
  assertEnqueueClosureEvidence,
  assertResolutionReview,
  LIVE_CATALOG_FINGERPRINT,
  MIGRATIONS,
  TARGET_CATALOG_FINGERPRINT,
  YOUTUBE_RESOLUTION_BASELINE_ABSENT_FUNCTIONS,
  YOUTUBE_RESOLUTION_FUNCTION_SIGNATURES,
} from "./prelaunch-youtube-resolution-contract.mjs";

export const YOUTUBE_RESOLUTION_DB_ADVISORY_LOCK = "homecook:youtube-resolution-stage1:20261010";
export const YOUTUBE_RESOLUTION_DB_CONFIRMATION = "APPLY_YOUTUBE_RESOLUTION_STAGE1_C51D53871";
export const YOUTUBE_RESOLUTION_TARGET_SYSTEM_ID = "7669475895419854882";
export const YOUTUBE_RESOLUTION_POSTGRES_MAJOR = 17;
export const YOUTUBE_RESOLUTION_BASELINE_FUNCTION_SQL = `WITH expected(signature) AS (VALUES
  ${YOUTUBE_RESOLUTION_FUNCTION_SIGNATURES.map((signature) => `('${signature}')`).join(",\n  ")}
), resolved AS (
  SELECT signature, to_regprocedure(signature) AS oid FROM expected
)
SELECT jsonb_agg(CASE WHEN resolved.oid IS NULL THEN jsonb_build_object(
  'signature',resolved.signature,'exists',false
) ELSE jsonb_build_object(
  'signature',resolved.signature,'exists',true,
  'definitionSha256',encode(extensions.digest(convert_to(pg_get_functiondef(resolved.oid),'UTF8'),'sha256'),'hex'),
  'owner',pg_get_userbyid(proowner),'acl',coalesce(to_jsonb(proacl),'null'::jsonb),
  'securityDefiner',prosecdef,'config',coalesce(to_jsonb(proconfig),'null'::jsonb)
) END ORDER BY resolved.signature)
FROM resolved LEFT JOIN pg_proc ON pg_proc.oid=resolved.oid;`;
export const YOUTUBE_RESOLUTION_DB_LOCK_SQL = Object.freeze([
  "BEGIN ISOLATION LEVEL READ COMMITTED",
  "SET LOCAL transaction_timeout='180s'",
  "SET LOCAL lock_timeout='5s'",
  "SET LOCAL statement_timeout='180s'",
  "SET LOCAL idle_in_transaction_session_timeout='180s'",
  `SELECT pg_advisory_xact_lock(hashtextextended('${YOUTUBE_RESOLUTION_DB_ADVISORY_LOCK}',0))`,
  "LOCK TABLE homecook_deploy.migrations IN SHARE ROW EXCLUSIVE MODE",
  "LOCK TABLE public.youtube_extraction_jobs IN SHARE ROW EXCLUSIVE MODE",
  "LOCK TABLE public.youtube_extractor_permits IN SHARE ROW EXCLUSIVE MODE",
]);

const SHA = /^[a-f0-9]{64}$/u;
const PROTECTED_RELATIONS = [
  "public.ingredients", "public.nutrition_sources", "public.nutrition_source_items",
  "public.nutrition_profiles", "public.nutrition_values", "public.ingredient_nutrition_profiles",
  "public.youtube_saved_recipe_results",
].sort();
const requireValue = (value, message) => { if (!value) throw new Error(`YouTube resolution DB plan: ${message}`); };

export function preserveReviewedBaselineFunctionAcl(reviewed, baseline) {
  const preserved = new Set([
    "public.read_youtube_extraction_enqueue_readiness()",
    "public.resolve_youtube_extraction_job_draft(uuid,text,bigint,bigint,text,jsonb)",
  ]);
  return reviewed.map((row) => {
    if (!preserved.has(row.signature)) return row;
    const previous = baseline.find((candidate) => candidate.signature === row.signature);
    requireValue(previous?.exists === true && previous.owner === row.owner
      && previous.securityDefiner === row.securityDefiner
      && isDeepStrictEqual(previous.config, row.config)
      && Array.isArray(previous.acl) && Array.isArray(row.acl),
    "existing RPC authority differs from reviewed source");
    const extra = previous.acl.filter((grant) => !row.acl.includes(grant));
    requireValue(row.acl.every((grant) => previous.acl.includes(grant))
      && extra.length <= 1 && extra.every((grant) => grant === `postgres=X/${row.owner}`),
    "unreviewed baseline RPC permission difference");
    // CREATE OR REPLACE preserves these existing ACLs. Definition hashes remain
    // the independently reviewed postimage; never learn them from live output.
    return { ...row, acl: [...previous.acl] };
  });
}

function assertCloneEvidence(evidence, review) {
  requireValue(evidence?.status === "PASS" && evidence.source?.ledger_count === 213
    && evidence.source.catalog_fingerprint === LIVE_CATALOG_FINGERPRINT
    && evidence.target?.ledger_count === 215 && evidence.target.catalog_fingerprint === TARGET_CATALOG_FINGERPRINT
    && evidence.rerun?.ledger_count === 215 && evidence.rerun.catalog_fingerprint === TARGET_CATALOG_FINGERPRINT
    && evidence.synonym_insert_delta === 1 && evidence.cleanup_verified === true,
  "backup clone transition mismatch");
  for (const state of [evidence.source, evidence.target, evidence.rerun]) {
    requireValue(isDeepStrictEqual(Object.keys(state.protected_relation_sha256 ?? {}).sort(), PROTECTED_RELATIONS)
      && Object.values(state.protected_relation_sha256).every((value) => SHA.test(value)),
    "backup clone protected relation digest set incomplete");
  }
  requireValue(isDeepStrictEqual(evidence.target.protected_relation_sha256, evidence.source.protected_relation_sha256)
    && isDeepStrictEqual(evidence.rerun.protected_relation_sha256, evidence.source.protected_relation_sha256),
  "backup clone preservation mismatch");
  requireValue(isDeepStrictEqual(evidence.migrations.map((row) => ({
    filename: row.path.replace("supabase/migrations/", ""), sha256: row.sha256,
  })), review.migrations), "backup clone migration bytes mismatch");
}

export function buildYoutubeResolutionDbPlan({
  review,
  prestate,
  closureEvidence,
  backupCloneEvidence,
  sourceLedger,
  backupArchiveSha256,
  expectedFunctionEvidence,
}) {
  assertResolutionReview(review, { phase: "precutover" });
  assertEnqueueClosureEvidence(review, closureEvidence);
  assertCloneEvidence(backupCloneEvidence, review);
  requireValue(SHA.test(backupArchiveSha256 ?? "")
    && backupArchiveSha256 === backupCloneEvidence.source_archive_sha256,
  "fresh backup archive differs from authenticated clone source");
  requireValue(Array.isArray(sourceLedger) && sourceLedger.length === 215
    && Array.isArray(prestate?.ledger) && prestate.ledger.length === 213
    && isDeepStrictEqual(sourceLedger.slice(0, 213), prestate.ledger)
    && isDeepStrictEqual(sourceLedger.slice(213), review.migrations),
  "213 predecessor or 215 source closure mismatch");
  requireValue(prestate.catalogFingerprint === review.catalog.before
    && prestate.synonymCount === 4146
    && prestate.aiAutomaticEnabled === false
    && prestate.policyVersion === review.policy.version
    && prestate.pipelineIdentity === review.policy.pipelineIdentity
    && prestate.snapshotDigest === review.policy.snapshotDigest,
  "live DB policy/catalog predecessor mismatch");
  requireValue(prestate.queue?.queued === 0 && prestate.queue?.processing === 0
    && prestate.permitHeld === false && prestate.activeEnqueueSessions === 0
    && prestate.workerStopped === true, "live DB is not quiescent after closure");
  requireValue(prestate.target?.systemId === YOUTUBE_RESOLUTION_TARGET_SYSTEM_ID
    && prestate.target?.postgresMajor === YOUTUBE_RESOLUTION_POSTGRES_MAJOR,
  "exact local target system/PG17 mismatch");
  requireValue(Array.isArray(prestate.functionEvidence) && prestate.functionEvidence.length === 8
    && isDeepStrictEqual(prestate.functionEvidence.map((row) => row.signature).sort(), [...YOUTUBE_RESOLUTION_FUNCTION_SIGNATURES].sort())
    && prestate.functionEvidence.every((row) => row.exists === false
      ? YOUTUBE_RESOLUTION_BASELINE_ABSENT_FUNCTIONS.includes(row.signature)
      : row.exists === true && !YOUTUBE_RESOLUTION_BASELINE_ABSENT_FUNCTIONS.includes(row.signature)
        && SHA.test(row.definitionSha256 ?? "") && typeof row.owner === "string"
        && typeof row.securityDefiner === "boolean"),
  "baseline explicit existing-five/absent-three function evidence incomplete");
  requireValue(isDeepStrictEqual(Object.keys(prestate.preservation ?? {}).sort(), PROTECTED_RELATIONS)
    && Object.values(prestate.preservation).every((value) => SHA.test(value)),
  "baseline seven-relation preservation evidence incomplete");
  requireValue(Array.isArray(expectedFunctionEvidence) && expectedFunctionEvidence.length === 8
    && isDeepStrictEqual(expectedFunctionEvidence.map((row) => row.signature).sort(), [...YOUTUBE_RESOLUTION_FUNCTION_SIGNATURES].sort())
    && expectedFunctionEvidence.every((row) => typeof row.signature === "string" && SHA.test(row.definitionSha256 ?? "")
      && typeof row.owner === "string" && typeof row.securityDefiner === "boolean"),
  "reviewed 215 eight-function authority evidence incomplete");

  return Object.freeze({
    schema: "homecook.youtube-resolution-db-plan.v1",
    status: "PREPARED_NOT_AUTHORIZED",
    releaseSha: review.to,
    executionRole: "supabase_admin",
    target: prestate.target,
    sourceLedger,
    before: {
      ledgerCount: 213,
      catalogFingerprint: review.catalog.before,
      synonymCount: 4146,
      policyVersion: review.policy.version,
      pipelineIdentity: review.policy.pipelineIdentity,
      snapshotDigest: review.policy.snapshotDigest,
      functionEvidence: prestate.functionEvidence,
      preservation: prestate.preservation,
    },
    expectedAfter: {
      ledgerCount: 215,
      catalogFingerprint: review.catalog.after,
      migrations: review.migrations,
      functionEvidence: preserveReviewedBaselineFunctionAcl(expectedFunctionEvidence, prestate.functionEvidence),
      preservation: prestate.preservation,
    },
    enqueueClosure: closureEvidence,
    backup: { archiveSha256: backupArchiveSha256, cloneStatus: backupCloneEvidence.status },
    lockSql: [...YOUTUBE_RESOLUTION_DB_LOCK_SQL],
    mutationSequence: [
      "re-read exact target/ledger/catalog/policy/AI/queue/permit/active-enqueue sessions under lock",
      "assert current_user is supabase_admin; do not SET ROLE or relax permissions",
      "export snapshot and create verified logical DB backup",
      ...MIGRATIONS.map((filename) => `execute reviewed body: ${filename}`),
      "insert the two reviewed homecook_deploy.migrations rows",
      "verify 215 ledger, catalog, function authority, AI false, and preservation digests before COMMIT",
      "COMMIT, reload PostgREST schema, read back exact poststate, write create-only receipt",
    ],
    confirmation: YOUTUBE_RESOLUTION_DB_CONFIRMATION,
    // DB deployment is already user-authorized. Start the short fail-closed
    // cutover only after credential approval is available so DB215 is not left
    // waiting indefinitely for generation46/worker installation.
    credentialApprovalRequiredBeforeCutover: true,
    executeAuthorized: false,
  });
}

export function assertYoutubeResolutionLockedPrestate(plan, locked) {
  requireValue(plan?.schema === "homecook.youtube-resolution-db-plan.v1"
    && plan.status === "PREPARED_NOT_AUTHORIZED" && plan.executeAuthorized === false,
  "prepared plan identity mismatch");
  requireValue(isDeepStrictEqual(locked.target, plan.target)
    && isDeepStrictEqual(locked.ledger, plan.sourceLedger.slice(0, 213))
    && locked.catalogFingerprint === plan.before.catalogFingerprint
    && locked.synonymCount === plan.before.synonymCount
    && locked.aiAutomaticEnabled === false && locked.queue.queued === 0
    && locked.queue.processing === 0 && locked.permitHeld === false
    && locked.activeEnqueueSessions === 0 && locked.workerStopped === true
    && locked.policyVersion === plan.before.policyVersion
    && locked.pipelineIdentity === plan.before.pipelineIdentity
    && locked.snapshotDigest === plan.before.snapshotDigest
    && isDeepStrictEqual(locked.functionEvidence, plan.before.functionEvidence)
    && isDeepStrictEqual(locked.preservation, plan.before.preservation),
  "locked prestate changed or is not quiescent");
  return true;
}

export function assertYoutubeResolutionDbPoststate(review, plan, observed) {
  assertResolutionReview(review, { phase: "precutover" });
  requireValue(plan.before.ledgerCount === 213 && plan.before.catalogFingerprint === review.catalog.before
    && observed.ledger.length === 215 && observed.catalogFingerprint === review.catalog.after
    && observed.aiAutomaticEnabled === false,
  "DB poststate ledger/catalog/AI mismatch");
  requireValue(isDeepStrictEqual(observed.ledger, plan.sourceLedger)
    && isDeepStrictEqual(observed.preservation, plan.expectedAfter.preservation)
    && isDeepStrictEqual(observed.functionEvidence, plan.expectedAfter.functionEvidence)
    && observed.policyVersion === review.policy.version
    && observed.pipelineIdentity === review.policy.pipelineIdentity
    && observed.snapshotDigest === review.policy.snapshotDigest
    && observed.queue?.queued === 0 && observed.queue?.processing === 0
    && observed.permitHeld === false && observed.activeEnqueueSessions === 0
    && observed.synonymCount === 4147 && observed.synonymInsertDelta === 1,
  "DB poststate authority/policy/quiescence/preservation mismatch");
  return true;
}
