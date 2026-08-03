const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const LOCAL_REHEARSAL_ENVIRONMENT_KEYS = [
  "current_head_sha",
  "immediate_previous_sha",
  "local_database_url",
  "local_rehearsal_opt_in",
  "local_supabase_api_url",
  "resolved_current_head_sha",
  "resolved_immediate_previous_sha",
];

const TWO_OWNER_RESULT_KEYS = [
  "authenticated_owner_caller_present",
  "owner_a_user_id",
  "owner_b_user_id",
  "patch_missing_recipe",
  "patch_other_owner_recipe",
  "preview_missing_recipe",
  "preview_other_owner_recipe",
  "production_writes",
  "remote_writes",
  "service_role_operations",
  "staging_writes",
  "unchanged_digest_scope_count",
  "unchanged_digest_scopes",
];

const DIGEST_SCOPE_KEYS = [
  "claim",
  "content",
  "meal",
  "recipe",
  "session",
  "shopping",
];

const RELEASE_ENTRY_KEYS = [
  "claim_delta",
  "legacy_v1_shape_preserved",
  "personal_caller_count",
  "personal_entry_count",
  "personal_recipe_v2_enabled",
  "personal_v2_idempotency_delta",
  "recipe_change_previews_delta",
  "release_sha",
  "session_delta",
  "snapshot_v2_creation_enabled",
];

const RELEASE_MATRIX_KEYS = [
  "current_head_sha",
  "current_release",
  "external_writes",
  "immediate_previous_release",
  "immediate_previous_sha",
  "local_fixture_mutation",
];

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  return actualKeys.length === sortedExpectedKeys.length
    && actualKeys.every((key, index) => key === sortedExpectedKeys[index]);
}

function isLoopbackHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:"
      && LOOPBACK_HOSTS.has(parsed.hostname)
      && !parsed.username
      && !parsed.password
      && !parsed.search
      && !parsed.hash;
  } catch {
    return false;
  }
}

function isLoopbackPostgresUrl(value) {
  try {
    const parsed = new URL(value);
    return ["postgres:", "postgresql:"].includes(parsed.protocol)
      && LOOPBACK_HOSTS.has(parsed.hostname)
      && parsed.username !== ""
      && parsed.password !== ""
      && parsed.pathname.length > 1
      && !parsed.search
      && !parsed.hash;
  } catch {
    return false;
  }
}

function assertExactShaPair(currentHeadSha, immediatePreviousSha) {
  if (
    !SHA_PATTERN.test(currentHeadSha ?? "")
    || !SHA_PATTERN.test(immediatePreviousSha ?? "")
  ) {
    throw new Error(
      "local rehearsal requires exact 40-character current/immediate-previous SHAs",
    );
  }
  if (currentHeadSha === immediatePreviousSha) {
    throw new Error(
      "current and immediate-previous SHAs must differ for local rehearsal",
    );
  }
}

function assertResourceNotFound404(value, fieldName) {
  if (!hasExactKeys(value, ["error_code", "status"])) {
    throw new Error(`${fieldName} must expose exact status and error_code`);
  }
  if (value.status !== 404 || value.error_code !== "RESOURCE_NOT_FOUND") {
    throw new Error(`${fieldName} must stay exact 404 RESOURCE_NOT_FOUND`);
  }
}

function assertReleaseEntry(value, expectedSha, fieldName) {
  if (!hasExactKeys(value, RELEASE_ENTRY_KEYS)) {
    throw new Error(`${fieldName} must expose the exact release matrix fields`);
  }
  if (
    value.release_sha !== expectedSha
    || value.personal_recipe_v2_enabled !== false
    || value.snapshot_v2_creation_enabled !== false
    || value.personal_entry_count !== 0
    || value.personal_caller_count !== 0
    || value.recipe_change_previews_delta !== 0
    || value.session_delta !== 0
    || value.claim_delta !== 0
    || value.personal_v2_idempotency_delta !== 0
    || value.legacy_v1_shape_preserved !== true
  ) {
    throw new Error(`${fieldName} must keep the exact flag-off release matrix`);
  }
}

export function assertRecipeContentSnapshotFuturePropagationLocalRehearsalEnvironment(
  input,
) {
  if (!hasExactKeys(input, LOCAL_REHEARSAL_ENVIRONMENT_KEYS)) {
    throw new Error(
      "local rehearsal requires exact loopback-only opt-in environment fields",
    );
  }
  if (input.local_rehearsal_opt_in !== true) {
    throw new Error("local rehearsal requires local-only opt-in");
  }
  if (!isLoopbackHttpUrl(input.local_supabase_api_url)) {
    throw new Error("local rehearsal requires a loopback-only Supabase API URL");
  }
  if (!isLoopbackPostgresUrl(input.local_database_url)) {
    throw new Error("local rehearsal requires a loopback-only database URL");
  }
  assertExactShaPair(input.current_head_sha, input.immediate_previous_sha);
  if (input.resolved_current_head_sha !== input.current_head_sha) {
    throw new Error("local rehearsal requires the resolved current HEAD SHA to match exactly");
  }
  if (input.resolved_immediate_previous_sha !== input.immediate_previous_sha) {
    throw new Error("local rehearsal requires an explicit resolvable immediate-previous SHA");
  }
  return input;
}

export function assertRecipeContentSnapshotFuturePropagationTwoOwnerResult(input) {
  if (!hasExactKeys(input, TWO_OWNER_RESULT_KEYS)) {
    throw new Error("two-owner local rehearsal result must expose the exact fields");
  }
  if (
    !UUID_PATTERN.test(input.owner_a_user_id ?? "")
    || !UUID_PATTERN.test(input.owner_b_user_id ?? "")
    || input.owner_a_user_id === input.owner_b_user_id
  ) {
    throw new Error("two-owner local rehearsal requires distinct owner UUIDs");
  }
  if (input.authenticated_owner_caller_present !== true) {
    throw new Error("two-owner local rehearsal requires an authenticated owner caller marker");
  }
  assertResourceNotFound404(input.preview_missing_recipe, "preview_missing_recipe");
  assertResourceNotFound404(input.preview_other_owner_recipe, "preview_other_owner_recipe");
  assertResourceNotFound404(input.patch_missing_recipe, "patch_missing_recipe");
  assertResourceNotFound404(input.patch_other_owner_recipe, "patch_other_owner_recipe");
  if (
    !Array.isArray(input.service_role_operations)
    || JSON.stringify(input.service_role_operations) !== JSON.stringify([
      "seed",
      "digest",
      "cleanup",
    ])
  ) {
    throw new Error("service role use must stay seed/digest/cleanup only");
  }
  if (
    input.unchanged_digest_scope_count !== DIGEST_SCOPE_KEYS.length
    || !Array.isArray(input.unchanged_digest_scopes)
    || JSON.stringify([...input.unchanged_digest_scopes].sort())
      !== JSON.stringify([...DIGEST_SCOPE_KEYS].sort())
  ) {
    throw new Error(
      "two-owner local rehearsal must report exact unchanged digest scopes without raw digest output",
    );
  }
  if (
    input.production_writes !== 0
    || input.staging_writes !== 0
    || input.remote_writes !== 0
  ) {
    throw new Error("two-owner local rehearsal must keep production/staging/remote writes at 0");
  }
  return input;
}

export function assertRecipeContentSnapshotFuturePropagationReleaseMatrix(input) {
  if (!hasExactKeys(input, RELEASE_MATRIX_KEYS)) {
    throw new Error("release matrix must expose the exact current/immediate-previous fields");
  }
  assertExactShaPair(input.current_head_sha, input.immediate_previous_sha);
  assertReleaseEntry(
    input.current_release,
    input.current_head_sha,
    "current_release",
  );
  assertReleaseEntry(
    input.immediate_previous_release,
    input.immediate_previous_sha,
    "immediate_previous_release",
  );
  if (input.external_writes !== 0) {
    throw new Error("release matrix must keep external writes at 0");
  }
  if (input.local_fixture_mutation !== "isolated-and-cleaned") {
    throw new Error("release matrix must declare isolated-and-cleaned local fixture mutation");
  }
  return input;
}

export function buildRecipeContentSnapshotFuturePropagationLocalRehearsalPlan(
  input,
) {
  assertExactShaPair(input.current_head_sha, input.immediate_previous_sha);
  return {
    mode: "exact-current-head-local-rehearsal",
    current_head_sha: input.current_head_sha,
    immediate_previous_sha: input.immediate_previous_sha,
    external_writes: 0,
    local_fixture_mutation: "isolated-and-cleaned",
    collection_steps: [
      "assert local-only loopback opt-in environment",
      "verify exact current HEAD and explicit immediate-previous SHA resolution",
      "read structured two-owner denial result JSON from the collector report path",
      "read structured current/immediate-previous flag-off release matrix JSON from the collector report path",
    ],
    result_schema: {
      environment_assertion:
        "loopback-only local Supabase API/DB URLs plus exact current/immediate-previous SHA resolution",
      two_owner_result:
        "exact 404 RESOURCE_NOT_FOUND denial matrix with sanitized unchanged recipe/content/meal/shopping/claim/session scope evidence",
      release_matrix:
        "current/immediate-previous flag-off matrix with zero personal-v2/session/claim/idempotency deltas and legacy v1 shape preserved",
    },
  };
}
