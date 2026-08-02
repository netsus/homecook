import {
  collectPersonalRecipeEditorSourceEvidence,
} from "./personal-recipe-editor-full-local-verifier.mjs";
import {
  assertRecipeSnapshotAuthorityReadOnlyVerificationSql,
} from "./recipe-snapshot-authority-remote-verifier.mjs";
import {
  assertRecipeSnapshotAuthorityRemoteAuthEvidence,
} from "./recipe-snapshot-authority-hybrid-verifier.mjs";
import {
  assertRecipeVisibilityLocalVerificationResult,
  buildRecipeVisibilityLocalVerificationPlan,
} from "./recipe-visibility-read-hardening-local-verifier.mjs";

const SOURCE_EVIDENCE_KEYS = [
  "app_surface_personal_editor_marker_count",
  "browser_direct_storage_path_count",
  "capability_on_occurrence_count",
  "capability_off_occurrence_count",
  "internal_operation_violation_count",
  "legacy_recipe_post_handler_count",
  "mypage_surface_personal_editor_marker_count",
  "personal_create_active_entry",
  "recipe_collection_personal_editor_marker_count",
  "recipe_collection_personal_origin_field_count",
  "recipe_delete_handler_count",
  "recipe_patch_handler_count",
  "recipebook_surface_personal_editor_marker_count",
  "user_direct_service_role_count",
  "user_service_role_violation_count",
].sort();
const SAFE_ENVIRONMENT_KEYS = ["PATH", "LANG", "LC_ALL", "HOME"];

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actualKeys = Object.keys(value).sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index]);
}

function stripSqlStringLiterals(value) {
  return value.replace(/'(?:''|[^'])*'/gu, "''");
}

export function assertPersonalRecipeEditorMergedSource({
  head,
  isAncestorOfOriginMaster,
  originMaster,
  trackedStatus,
}) {
  if (
    !/^[0-9a-f]{40}$/u.test(head ?? "")
    || !/^[0-9a-f]{40}$/u.test(originMaster ?? "")
    || isAncestorOfOriginMaster !== true
  ) {
    throw new Error(
      "personal editor verification requires the exact HEAD to be merged into origin/master",
    );
  }
  if ((trackedStatus ?? "").trim() !== "") {
    throw new Error(
      "personal editor verification requires a clean tracked tree",
    );
  }
  return head;
}

export function buildPersonalRecipeEditorHybridVerificationPlan({ mode }) {
  if (mode !== "post-merge-read-only") {
    throw new Error(
      `unsupported personal recipe editor hybrid verification mode: ${mode ?? "missing"}`,
    );
  }

  const localPlan = buildRecipeVisibilityLocalVerificationPlan({
    mode: "local-read-only",
  });
  const sql = localPlan.sql.replace(
    /'local_writes', 0\s*\)\s*;\s*$/u,
    [
      "'local_writes', 0,",
      "  'local_auth_user_count', (select count(*)::integer from auth.users),",
      "  'local_active_epoch_count', (",
      "    select count(*)::integer",
      "    from private.remote_auth_identity_epochs as epoch",
      "    where epoch.active_epoch",
      "      and epoch.deleted_terminal_at is null",
      "  ),",
      "  'local_active_binding_count', (",
      "    select count(*)::integer",
      "    from public.user_session_generation_bindings as binding",
      "    where binding.binding_state = 'active'",
      "      and binding.revoked_at is null",
      "      and binding.binding_expires_at >= statement_timestamp()",
      "  ),",
      "  'local_active_epoch_without_binding_count', (",
      "    select count(*)::integer",
      "    from private.remote_auth_identity_epochs as epoch",
      "    where epoch.active_epoch",
      "      and epoch.deleted_terminal_at is null",
      "      and not exists (",
      "        select 1",
      "        from public.user_session_generation_bindings as binding",
      "        where binding.issuer = epoch.issuer",
      "          and binding.owner_uuid = epoch.owner_uuid",
      "          and binding.auth_identity_created_at_snapshot",
      "            = epoch.identity_created_at",
      "          and binding.binding_state = 'active'",
      "          and binding.revoked_at is null",
      "          and binding.binding_expires_at >= statement_timestamp()",
      "      )",
      "  ),",
      "  'local_epoch_binding_mismatch_count', (",
      "    select count(*)::integer",
      "    from public.user_session_generation_bindings as binding",
      "    where binding.binding_state = 'active'",
      "      and binding.revoked_at is null",
      "      and binding.binding_expires_at >= statement_timestamp()",
      "      and not exists (",
      "        select 1",
      "        from private.remote_auth_identity_epochs as epoch",
      "        where epoch.issuer = binding.issuer",
      "          and epoch.owner_uuid = binding.owner_uuid",
      "          and epoch.identity_created_at",
      "            = binding.auth_identity_created_at_snapshot",
      "          and epoch.active_epoch",
      "          and epoch.deleted_terminal_at is null",
      "      )",
      "  ),",
      "  'local_expired_binding_count', (",
      "    select count(*)::integer",
      "    from public.user_session_generation_bindings as binding",
      "    where binding.binding_state = 'active'",
      "      and binding.revoked_at is null",
      "      and binding.binding_expires_at < statement_timestamp()",
      "  )",
      ");",
    ].join("\n"),
  );
  if (sql === localPlan.sql) {
    throw new Error("personal editor local SQL could not be extended safely");
  }
  assertRecipeSnapshotAuthorityReadOnlyVerificationSql({
    sql: stripSqlStringLiterals(sql),
    fieldName: "personal recipe editor hybrid verification SQL",
  });

  return {
    ...localPlan,
    mode,
    requiresMergedOriginMaster: true,
    requiresCleanTrackedTree: true,
    remoteAuthEvidenceRequired: true,
    target: "local-application-data-storage",
    sql,
  };
}

export function assertPersonalRecipeEditorHybridLocalResult(result) {
  if (
    !result
    || typeof result !== "object"
    || Array.isArray(result)
    || !Object.hasOwn(result, "local_auth_user_count")
  ) {
    throw new Error(
      "personal recipe editor local result must prove local auth.users=0",
    );
  }

  const {
    local_active_binding_count: localActiveBindingCount,
    local_active_epoch_count: localActiveEpochCount,
    local_active_epoch_without_binding_count:
      localActiveEpochWithoutBindingCount,
    local_auth_user_count: localAuthUserCount,
    local_epoch_binding_mismatch_count: localEpochBindingMismatchCount,
    local_expired_binding_count: localExpiredBindingCount,
    ...visibilityResult
  } = result;
  if (localAuthUserCount !== 0) {
    throw new Error(
      "personal recipe editor hybrid verification requires local auth.users=0",
    );
  }
  const localSessionAuthorityValid =
    Number.isInteger(localActiveEpochCount)
    && localActiveEpochCount >= 0
    && Number.isInteger(localActiveBindingCount)
    && localActiveBindingCount >= localActiveEpochCount
    && localActiveEpochWithoutBindingCount === 0
    && localEpochBindingMismatchCount === 0
    && localExpiredBindingCount === 0;
  if (!localSessionAuthorityValid) {
    throw new Error(
      "personal recipe editor local session authority verification failed",
    );
  }
  try {
    assertRecipeVisibilityLocalVerificationResult(visibilityResult);
  } catch {
    throw new Error("personal recipe editor local verification failed");
  }
  return result;
}

export function buildPersonalRecipeEditorHybridLocalPsqlRequest(options) {
  const { baseEnvironment = {}, databaseUrl, planSql } = options ?? {};
  assertRecipeSnapshotAuthorityReadOnlyVerificationSql({
    sql: stripSqlStringLiterals(planSql ?? ""),
    fieldName: "personal recipe editor hybrid local SQL",
  });

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(
      "personal editor verifier requires a loopback Postgres URL",
    );
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
    throw new Error(
      "personal editor verifier requires a loopback Postgres URL",
    );
  }

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

export function collectPersonalRecipeEditorHybridSourceEvidence(
  repositoryRoot,
) {
  const successorEvidence =
    collectPersonalRecipeEditorSourceEvidence(repositoryRoot);
  return Object.fromEntries(
    SOURCE_EVIDENCE_KEYS.map((key) => [key, successorEvidence[key]]),
  );
}

export function assertPersonalRecipeEditorHybridSourceEvidence(evidence) {
  const countKeys = SOURCE_EVIDENCE_KEYS.filter(
    (key) => key !== "personal_create_active_entry",
  );
  const valid =
    hasExactKeys(evidence, SOURCE_EVIDENCE_KEYS)
    && countKeys.every(
      (key) => Number.isInteger(evidence[key]) && evidence[key] >= 0,
    )
    && evidence.app_surface_personal_editor_marker_count === 0
    && evidence.browser_direct_storage_path_count === 0
    && evidence.capability_on_occurrence_count === 0
    && evidence.capability_off_occurrence_count > 0
    && evidence.internal_operation_violation_count === 0
    && evidence.legacy_recipe_post_handler_count === 1
    && evidence.mypage_surface_personal_editor_marker_count === 0
    && evidence.personal_create_active_entry === false
    && evidence.recipe_collection_personal_editor_marker_count === 0
    && evidence.recipe_collection_personal_origin_field_count === 0
    && evidence.recipe_delete_handler_count === 1
    && evidence.recipe_patch_handler_count === 1
    && evidence.recipebook_surface_personal_editor_marker_count === 0
    && evidence.user_direct_service_role_count === 8
    && evidence.user_service_role_violation_count === 0;

  if (!valid) {
    throw new Error(
      "personal recipe editor source evidence failed closed",
    );
  }
  return evidence;
}

export function buildPersonalRecipeEditorHybridSummary({
  localResult,
  mergeSha,
  now,
  remoteAuthEvidence,
  sourceEvidence,
}) {
  if (!/^[0-9a-f]{40}$/u.test(mergeSha)) {
    throw new Error(
      "personal recipe editor hybrid verification requires an exact merge SHA",
    );
  }
  assertPersonalRecipeEditorHybridLocalResult(localResult);
  assertPersonalRecipeEditorHybridSourceEvidence(sourceEvidence);
  assertRecipeSnapshotAuthorityRemoteAuthEvidence(remoteAuthEvidence, { now });
  if (remoteAuthEvidence.source_merge_sha !== mergeSha) {
    throw new Error("remote Auth evidence must match the exact merge SHA");
  }

  return {
    ok: true,
    mode: "post-merge-read-only",
    merge_sha: mergeSha,
    local_application_data_storage_status: "ready",
    local_auth_user_count: 0,
    local_active_epoch_count: localResult.local_active_epoch_count,
    local_active_binding_count: localResult.local_active_binding_count,
    service_role_user_path_count:
      sourceEvidence.user_direct_service_role_count,
    browser_direct_storage_path_count: 0,
    remote_auth_control_plane_status: "ready",
    active_epoch_count: remoteAuthEvidence.active_epoch_count,
    active_binding_count: remoteAuthEvidence.active_binding_count,
    external_personal_write_status: "dark",
    production_writes: 0,
    staging_writes: 0,
    remote_application_writes: 0,
  };
}
