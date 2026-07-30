import {
  assertRecipeSnapshotAuthorityReadOnlyVerificationSql,
  assertRecipeSnapshotAuthorityRemoteVerificationResult,
  buildRecipeSnapshotAuthorityRemoteVerificationPlan,
} from "./recipe-snapshot-authority-remote-verifier.mjs";

const REMOTE_AUTH_EVIDENCE_KEYS = [
  "active_binding_count",
  "active_epoch_count",
  "active_epoch_without_binding_count",
  "epoch_binding_mismatch_count",
  "evidence_digest",
  "evidence_scope_status",
  "expired_binding_count",
  "mirror_terminal_mismatch_count",
  "observed_at",
  "remote_application_writes",
  "source_merge_sha",
  "terminal_deletion_count",
  "terminal_readback_mismatch_count",
].sort();

const COUNT_FIELDS = [
  "active_binding_count",
  "active_epoch_count",
  "active_epoch_without_binding_count",
  "epoch_binding_mismatch_count",
  "expired_binding_count",
  "mirror_terminal_mismatch_count",
  "remote_application_writes",
  "terminal_deletion_count",
  "terminal_readback_mismatch_count",
];
const SAFE_ENVIRONMENT_KEYS = ["PATH", "LANG", "LC_ALL", "HOME"];

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actualKeys = Object.keys(value).sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index]);
}

export function buildRecipeSnapshotAuthorityHybridVerificationPlan({ mode }) {
  if (mode !== "post-merge-read-only") {
    throw new Error(
      `unsupported recipe snapshot authority hybrid verification mode: ${mode ?? "missing"}`,
    );
  }

  const snapshotPlan = buildRecipeSnapshotAuthorityRemoteVerificationPlan({
    mode,
  });
  const sql = snapshotPlan.sql.replace(
    /'remote_writes', 0\s*\)\s*$/u,
    [
      "'remote_writes', 0,",
      "  'local_auth_user_count', (select count(*)::integer from auth.users)",
      ")",
    ].join("\n"),
  );
  if (sql === snapshotPlan.sql) {
    throw new Error("snapshot verification SQL could not be extended safely");
  }
  assertRecipeSnapshotAuthorityReadOnlyVerificationSql({
    sql,
    fieldName: "recipe snapshot authority hybrid verification SQL",
  });

  return {
    ...snapshotPlan,
    target: "local-application-db",
    remoteAuthEvidenceRequired: true,
    sql,
  };
}

export function assertRecipeSnapshotAuthorityHybridLocalResult(result) {
  if (
    !result
    || typeof result !== "object"
    || Array.isArray(result)
    || !Object.hasOwn(result, "local_auth_user_count")
  ) {
    throw new Error("hybrid local result must prove local auth.users=0");
  }

  const { local_auth_user_count: localAuthUserCount, ...snapshotResult } = result;
  if (localAuthUserCount !== 0) {
    throw new Error("hybrid local verification requires local auth.users=0");
  }
  assertRecipeSnapshotAuthorityRemoteVerificationResult(snapshotResult);
  return result;
}

export function buildRecipeSnapshotAuthorityHybridLocalPsqlRequest({
  baseEnvironment = {},
  databaseUrl,
  planSql,
}) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("hybrid verifier requires a loopback local application database");
  }
  const loopbackHosts = new Set(["127.0.0.1", "[::1]", "localhost"]);
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol)
    || !loopbackHosts.has(parsed.hostname)
    || !parsed.username
    || !parsed.password
    || !parsed.pathname.slice(1)
    || parsed.search
    || parsed.hash
  ) {
    throw new Error("hybrid verifier requires a loopback local application database");
  }
  assertRecipeSnapshotAuthorityReadOnlyVerificationSql({
    sql: planSql,
    fieldName: "recipe snapshot authority hybrid local SQL",
  });

  const environment = {};
  for (const key of SAFE_ENVIRONMENT_KEYS) {
    if (baseEnvironment[key]) environment[key] = baseEnvironment[key];
  }
  Object.assign(environment, {
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: decodeURIComponent(parsed.pathname.slice(1)),
    PGSSLMODE: "disable",
  });

  return {
    args: ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
    environment,
    input: [
      "begin transaction isolation level read committed read only;",
      planSql,
      "commit;",
    ].join("\n"),
  };
}

export function assertRecipeSnapshotAuthorityRemoteAuthEvidence(
  evidence,
  { now = new Date(), maxAgeSeconds = 900 } = {},
) {
  const observedAt = new Date(evidence?.observed_at ?? "");
  const ageMilliseconds = now.getTime() - observedAt.getTime();
  const valid =
    hasExactKeys(evidence, REMOTE_AUTH_EVIDENCE_KEYS)
    && evidence.evidence_scope_status === "remote-auth-control-plane-read-only"
    && /^[0-9a-f]{40}$/u.test(evidence.source_merge_sha)
    && /^[0-9a-f]{64}$/u.test(evidence.evidence_digest)
    && COUNT_FIELDS.every(
      (field) => Number.isInteger(evidence[field]) && evidence[field] >= 0,
    )
    && evidence.active_binding_count >= evidence.active_epoch_count
    && evidence.active_epoch_without_binding_count === 0
    && evidence.epoch_binding_mismatch_count === 0
    && evidence.expired_binding_count === 0
    && evidence.terminal_readback_mismatch_count === 0
    && evidence.mirror_terminal_mismatch_count === 0
    && evidence.remote_application_writes === 0
    && Number.isFinite(ageMilliseconds)
    && ageMilliseconds >= 0
    && ageMilliseconds <= maxAgeSeconds * 1000;

  if (!valid) {
    throw new Error("remote Auth control-plane evidence failed closed");
  }
  return evidence;
}

export function buildRecipeSnapshotAuthorityHybridSummary({
  mergeSha,
  localResult,
  remoteAuthEvidence,
  now,
}) {
  if (!/^[0-9a-f]{40}$/u.test(mergeSha)) {
    throw new Error("hybrid verification requires an exact merge SHA");
  }
  assertRecipeSnapshotAuthorityHybridLocalResult(localResult);
  assertRecipeSnapshotAuthorityRemoteAuthEvidence(remoteAuthEvidence, { now });
  if (remoteAuthEvidence.source_merge_sha !== mergeSha) {
    throw new Error("remote Auth evidence must match the exact merge SHA");
  }

  return {
    ok: true,
    mode: "post-merge-read-only",
    merge_sha: mergeSha,
    local_application_db_status: "ready",
    local_auth_user_count: 0,
    remote_auth_control_plane_status: "ready",
    active_epoch_count: remoteAuthEvidence.active_epoch_count,
    active_binding_count: remoteAuthEvidence.active_binding_count,
    terminal_deletion_count: remoteAuthEvidence.terminal_deletion_count,
    production_writes: 0,
    staging_writes: 0,
    remote_application_writes: 0,
  };
}
