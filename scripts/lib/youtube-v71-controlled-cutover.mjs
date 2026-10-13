import { isDeepStrictEqual } from "node:util";

import {
  DEFAULT_YOUTUBE_EXTRACTION_WORKER_EXTRACTOR_MODE,
  DEFAULT_YOUTUBE_EXTRACTION_WORKER_FINGERPRINT_KEY_VERSION,
  DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS,
  buildYoutubeExtractionWorkerPolicySnapshotDigest,
} from "./youtube-extraction-worker-artifact.mjs";
import {
  YOUTUBE_V71_CREDENTIAL_GENERATION_AFTER,
  YOUTUBE_V71_CREDENTIAL_GENERATION_BEFORE,
  YOUTUBE_V71_CREDENTIAL_TTL_SECONDS,
  YOUTUBE_V71_MANAGER_MAX_TTL_SECONDS,
  YOUTUBE_V71_PIPELINE_IDENTITY,
  YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST,
  YOUTUBE_V71_POLICY_VERSION,
  YOUTUBE_V71_RELEASE_SHA,
  YOUTUBE_V71_SCHEMA_IDENTITY,
} from "./youtube-v71-worker-preparation.mjs";

export const YOUTUBE_V71_CUTOVER_CONFIRMATION =
  "LOCAL_FULL_PRODUCTION_YOUTUBE_V71_GEN47_CUTOVER";
export const YOUTUBE_V71_PREDECESSOR_RELEASE_SHA =
  "c51d53871f31c7840fe24792b46b191ca963b11b";
export const YOUTUBE_V71_PREDECESSOR_PIPELINE_IDENTITY =
  "1c9c47074da3bf1c55ed83f1ba5131d9d48ad486503919c554a5530d7972d935";
export const YOUTUBE_V71_PREDECESSOR_POLICY_SNAPSHOT_DIGEST =
  "e40c9f4ef0d8a9241e49635f0fc906fe92a20f57a46e005fa4dd308805a191c0";

function check(condition, message) {
  if (!condition) throw new Error(`v71 controlled cutover rejected: ${message}`);
}

function integer(value, label) {
  check(Number.isSafeInteger(value), label);
  return value;
}

function digest(value, label) {
  check(/^[a-f0-9]{64}$/u.test(value ?? ""), label);
  return value;
}

export function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function decodeJwtClaims(token) {
  const parts = String(token ?? "").trim().split(".");
  check(parts.length === 3 && parts.every(Boolean), "JWT shape");
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new Error("v71 controlled cutover rejected: JWT claims");
  }
}

export function assertV71ManagerClaims(claims, now = new Date()) {
  check(claims?.role === "youtube_extraction_credential_manager", "manager role");
  check(claims?.scope === "youtube-extraction-credential-manager", "manager scope");
  check(claims?.iss === "https://worker.mumeok.kr", "manager issuer");
  check(claims?.aud === "youtube-extraction", "manager audience");
  digest(claims?.jti_hash, "manager JTI hash");
  integer(claims?.iat, "manager iat");
  integer(claims?.exp, "manager exp");
  check(claims.exp - claims.iat > 0, "manager positive lifetime");
  check(
    claims.exp - claims.iat <= YOUTUBE_V71_MANAGER_MAX_TTL_SECONDS,
    "manager lifetime exceeds five minutes",
  );
  check(claims.exp * 1_000 > now.getTime(), "manager expired");
  return true;
}

export function assertV71WorkerCredential({ claims, metadata }, now = new Date()) {
  const expected = {
    role: "youtube_extraction_worker",
    scope: "youtube-extraction-worker",
    iss: "https://worker.mumeok.kr",
    aud: "youtube-extraction",
    generation: YOUTUBE_V71_CREDENTIAL_GENERATION_AFTER,
    release_sha: YOUTUBE_V71_RELEASE_SHA,
    schema_identity: YOUTUBE_V71_SCHEMA_IDENTITY,
    allowed_snapshot_digest: YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST,
  };
  for (const [key, value] of Object.entries(expected)) {
    check(claims?.[key] === value, `worker claim ${key}`);
  }
  digest(claims?.jti_hash, "worker JTI hash");
  integer(claims?.iat, "worker iat");
  integer(claims?.exp, "worker exp");
  check(
    claims.exp - claims.iat === YOUTUBE_V71_CREDENTIAL_TTL_SECONDS,
    "worker lifetime is not exactly six days",
  );
  check(claims.exp * 1_000 > now.getTime(), "worker expired");
  check(metadata?.generation === claims.generation, "worker metadata generation");
  check(metadata?.jti_sha256 === claims.jti_hash, "worker metadata JTI hash");
  check(metadata?.release_sha === claims.release_sha, "worker metadata release");
  check(metadata?.schema_identity === claims.schema_identity, "worker metadata schema");
  check(
    metadata?.allowed_snapshot_digest === claims.allowed_snapshot_digest,
    "worker metadata policy digest",
  );
  check(Date.parse(metadata?.expires_at) === claims.exp * 1_000, "worker metadata expiry");
  return true;
}

export function assertV71PolicyConstants() {
  const digestValue = buildYoutubeExtractionWorkerPolicySnapshotDigest({
    extractorMode: DEFAULT_YOUTUBE_EXTRACTION_WORKER_EXTRACTOR_MODE,
    pipelineIdentity: YOUTUBE_V71_PIPELINE_IDENTITY,
    policyVersion: YOUTUBE_V71_POLICY_VERSION,
    resultAffectingOptions: DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS,
  });
  check(digestValue === YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST, "policy digest drift");
  return true;
}

export function assertV71CutoverPrestate(observation) {
  check(observation?.ledgerCount === 219, "migration ledger is not 219");
  check(observation?.queued === 0, "queued jobs are not drained");
  check(observation?.processing === 0, "processing jobs are not drained");
  check(observation?.permitHeld === false, "extractor permit is held");
  check(observation?.activeEnqueueSessions === 0, "enqueue session is active");
  check(
    observation?.credential?.generation === YOUTUBE_V71_CREDENTIAL_GENERATION_BEFORE,
    "predecessor generation",
  );
  check(
    observation?.credential?.releaseSha === YOUTUBE_V71_PREDECESSOR_RELEASE_SHA,
    "predecessor release",
  );
  check(
    observation?.credential?.snapshotDigest
      === YOUTUBE_V71_PREDECESSOR_POLICY_SNAPSHOT_DIGEST,
    "predecessor credential policy digest",
  );
  check(
    observation?.policy?.pipelineIdentity === YOUTUBE_V71_PREDECESSOR_PIPELINE_IDENTITY,
    "predecessor pipeline",
  );
  check(
    observation?.policy?.snapshotDigest === YOUTUBE_V71_PREDECESSOR_POLICY_SNAPSHOT_DIGEST,
    "predecessor policy digest",
  );
  check(observation?.policy?.enabled === true, "predecessor policy is disabled");
  return true;
}

export function assertV71CutoverPoststate(observation, { enabled }) {
  check(observation?.ledgerCount === 219, "migration ledger changed");
  check(observation?.queued === 0, "queued jobs appeared during zero-budget cutover");
  check(observation?.processing === 0, "processing jobs appeared during zero-budget cutover");
  check(observation?.permitHeld === false, "extractor permit was acquired during cutover");
  check(
    observation?.credential?.generation === YOUTUBE_V71_CREDENTIAL_GENERATION_AFTER,
    "generation 47 is not current",
  );
  check(observation?.credential?.releaseSha === YOUTUBE_V71_RELEASE_SHA, "release binding");
  check(
    observation?.credential?.schemaIdentity === YOUTUBE_V71_SCHEMA_IDENTITY,
    "schema binding",
  );
  check(
    observation?.credential?.snapshotDigest === YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST,
    "credential policy binding",
  );
  check(observation?.policy?.version === YOUTUBE_V71_POLICY_VERSION, "policy version");
  check(
    observation?.policy?.extractorMode === DEFAULT_YOUTUBE_EXTRACTION_WORKER_EXTRACTOR_MODE,
    "extractor mode",
  );
  check(
    observation?.policy?.pipelineIdentity === YOUTUBE_V71_PIPELINE_IDENTITY,
    "pipeline identity",
  );
  check(
    observation?.policy?.snapshotDigest === YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST,
    "policy digest",
  );
  check(observation?.policy?.enabled === enabled, "policy enabled state");
  check(
    isDeepStrictEqual(
      observation?.policy?.resultAffectingOptions,
      DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS,
    ),
    "result-affecting options",
  );
  return true;
}

export function assertV71OperationalPoststate(observation) {
  const normalized = {
    ...observation,
    queued: 0,
    processing: 0,
    permitHeld: false,
  };
  return assertV71CutoverPoststate(normalized, { enabled: true });
}

export function buildV71DatabaseTransitionSql({ managerClaims, credentialMetadata }) {
  assertV71ManagerClaims(managerClaims);
  assertV71PolicyConstants();
  const metadata = credentialMetadata;
  check(metadata?.generation === YOUTUBE_V71_CREDENTIAL_GENERATION_AFTER, "metadata generation");
  digest(metadata?.jti_sha256, "metadata JTI hash");
  check(metadata?.release_sha === YOUTUBE_V71_RELEASE_SHA, "metadata release");
  check(metadata?.schema_identity === YOUTUBE_V71_SCHEMA_IDENTITY, "metadata schema");
  check(
    metadata?.allowed_snapshot_digest === YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST,
    "metadata policy digest",
  );
  check(Number.isFinite(Date.parse(metadata?.expires_at)), "metadata expiry");
  const options = JSON.stringify(DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS);
  const claims = JSON.stringify(managerClaims);
  return `
UPDATE private.youtube_extraction_current_policy
SET policy_version = ${YOUTUBE_V71_POLICY_VERSION},
    extractor_mode = ${sqlLiteral(DEFAULT_YOUTUBE_EXTRACTION_WORKER_EXTRACTOR_MODE)},
    pipeline_identity = ${sqlLiteral(YOUTUBE_V71_PIPELINE_IDENTITY)},
    result_affecting_options = ${sqlLiteral(options)}::jsonb,
    fingerprint_key_version = ${sqlLiteral(DEFAULT_YOUTUBE_EXTRACTION_WORKER_FINGERPRINT_KEY_VERSION)},
    previous_fingerprint_key_version = NULL,
    previous_fingerprint_valid_until = NULL,
    enabled = false,
    updated_at = clock_timestamp()
WHERE policy_key = 'primary';
SET LOCAL request.jwt.claims = ${sqlLiteral(claims)};
SET LOCAL ROLE youtube_extraction_credential_manager;
SELECT public.rotate_youtube_extraction_worker_credential(
  ${YOUTUBE_V71_CREDENTIAL_GENERATION_BEFORE},
  ${YOUTUBE_V71_CREDENTIAL_GENERATION_AFTER},
  ${sqlLiteral(metadata.jti_sha256)},
  ${sqlLiteral(metadata.expires_at)}::timestamptz,
  ${sqlLiteral(YOUTUBE_V71_RELEASE_SHA)},
  ${sqlLiteral(YOUTUBE_V71_SCHEMA_IDENTITY)},
  ${sqlLiteral(YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST)}
)::text;
RESET ROLE;
`;
}
