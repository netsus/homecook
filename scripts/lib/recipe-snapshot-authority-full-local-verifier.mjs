import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  assertRecipeSnapshotAuthorityReadOnlyVerificationSql,
  assertRecipeSnapshotAuthorityRemoteVerificationResult,
  buildRecipeSnapshotAuthorityRemoteVerificationPlan,
} from "./recipe-snapshot-authority-remote-verifier.mjs";
import {
  assertRecipeSnapshotAuthorityFullLocalSecurityInventoryResult,
  buildFullLocalSecurityInventoryExpression,
  buildRecipeSnapshotAuthorityFullLocalSecurityInventorySql,
} from "./full-local-security-inventory.mjs";

export {
  assertRecipeSnapshotAuthorityFullLocalSecurityInventoryResult,
  buildRecipeSnapshotAuthorityFullLocalSecurityInventorySql,
};

const MODE = "post-merge-full-local-read-only";
const TARGET = "self-hosted-local-auth-db-storage-single-authority";
const SAFE_ENVIRONMENT_KEYS = ["PATH", "LANG", "LC_ALL", "HOME"];

const REQUIRED_CHECKS = [
  {
    id: "snapshot-unit-security-readers-account-delete",
    command: "pnpm",
    args: [
      "exec",
      "vitest",
      "run",
      "tests/recipe-snapshot-authority.test.ts",
      "tests/recipe-snapshot-readers.test.ts",
      "tests/recipe-snapshot-security.test.ts",
      "tests/recipe-snapshot-account-delete.test.ts",
    ],
  },
  {
    id: "snapshot-postgres-existing-fresh-replay",
    command: "pnpm",
    args: ["test:recipe-snapshot-authority:postgres"],
  },
  {
    id: "full-local-auth-session-runtime-request-authority",
    command: "pnpm",
    args: [
      "exec",
      "vitest",
      "run",
      "tests/auth-callback-flow-authority.test.ts",
      "tests/full-local-session-authority.test.ts",
      "tests/full-local-production-runtime.test.ts",
      "tests/full-local-request-authority-migration.test.ts",
    ],
  },
  {
    id: "full-local-storage-public-boundary-plan",
    command: "pnpm",
    args: [
      "exec",
      "vitest",
      "run",
      "tests/recipe-snapshot-authority-full-local-verifier.test.ts",
    ],
  },
  {
    id: "full-local-postgres-authority",
    command: "pnpm",
    args: ["test:full-local-auth-db-foundation:postgres"],
  },
  {
    id: "train-b-storage-outbox",
    command: "pnpm",
    args: [
      "exec",
      "vitest",
      "run",
      "tests/recipe-image-auth-deletion-readiness.test.ts",
      "tests/recipe-image-auth-deletion-finalize-authority.test.ts",
      "tests/recipe-image-lifecycle-completion-authority.test.ts",
      "tests/recipe-image-normal-drain-storage.test.ts",
    ],
  },
  {
    id: "train-b-effective-ingredient",
    command: "pnpm",
    args: [
      "exec",
      "vitest",
      "run",
      "tests/product-ingredient-link-foundation.test.ts",
      "tests/product-ingredient-link-readers.test.ts",
      "tests/product-ingredient-link-security.test.ts",
    ],
  },
];

const MANUAL_ONLY_PENDING = [
  "provider-live-callback-link",
  "cloudflare-public-edge",
  "remote-final-backup",
  "off-mac-restore-twice",
  "first-local-mutation-cutover",
  "compatibility-release-observation",
  "full-actual-db-cleanup-rehearsal",
];

const FULL_LOCAL_RESULT_FIELDS = [
  "authority_target_status",
  "local_control_row_count",
  "local_control_shape_drift_count",
  "stable_auth_uuid_drift_count",
  "local_session_binding_shape_drift_count",
  "full_local_security_inventory",
  "account_cleanup_function_missing_count",
  "owner_null_shared_snapshot_count",
  "remote_application_writes",
];

const ZERO_RESULT_FIELDS = [
  "local_control_shape_drift_count",
  "stable_auth_uuid_drift_count",
  "local_session_binding_shape_drift_count",
  "account_cleanup_function_missing_count",
  "remote_application_writes",
];

const CURRENT_ACCOUNT_CLEANUP_MIGRATION = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260731111000_product_ingredient_link_account_cleanup.sql",
  ),
  "utf8",
);

function readCurrentAccountCleanupSource() {
  const functionStart = CURRENT_ACCOUNT_CLEANUP_MIGRATION.indexOf(
    "create or replace function public.delete_user_private_data",
  );
  const bodyStartMarker = "as $$";
  const bodyStart = CURRENT_ACCOUNT_CLEANUP_MIGRATION.indexOf(
    bodyStartMarker,
    functionStart,
  );
  const bodyEnd = CURRENT_ACCOUNT_CLEANUP_MIGRATION.indexOf("\n$$;", bodyStart);
  if (functionStart < 0 || bodyStart < 0 || bodyEnd < 0) {
    throw new Error("current account cleanup function source is missing");
  }
  const source = CURRENT_ACCOUNT_CLEANUP_MIGRATION
    .slice(bodyStart + bodyStartMarker.length, bodyEnd)
    .replace(/^\n|\n$/gu, "");
  const orderedFragments = [
    "recipe_snapshot_account_cleanup_guard",
    "delete from public.cooking_session_meal_claims",
    "delete from public.cooking_session_meals",
    "delete from public.cooking_sessions",
    "delete from public.meals",
    "delete from public.leftover_dishes",
    "delete from public.recipe_content_snapshots",
    "delete from public.recipe_nutrition_snapshots",
    "delete from public.recipes",
    "delete from public.pantry_items",
    "delete from public.shopping_list_items",
    "delete from public.product_planner_entries",
    "private product references remain",
    "delete from public.food_products",
    "delete from public.nutrition_profiles",
    "delete from public.users",
  ];
  let cursor = -1;
  for (const fragment of orderedFragments) {
    const next = source.indexOf(fragment, cursor + 1);
    if (next <= cursor) {
      throw new Error("current account cleanup dependency order drifted");
    }
    cursor = next;
  }
  if (!source.includes("owner_user_id is null public/shared")) {
    throw new Error("current account cleanup shared-owner preservation drifted");
  }
  return source;
}

const CURRENT_ACCOUNT_CLEANUP_HASH = createHash("md5")
  .update(readCurrentAccountCleanupSource())
  .digest("hex");

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  return actualKeys.length === sortedExpectedKeys.length
    && actualKeys.every((key, index) => key === sortedExpectedKeys[index]);
}

export function assertRecipeSnapshotAuthorityFullLocalEnvironment(
  environment = {},
) {
  if (
    environment.HOMECOOK_AUTH_AUTHORITY !== "local"
    || environment.HOMECOOK_DATA_AUTHORITY !== "local"
  ) {
    throw new Error(
      "full-local application authority environment is not active",
    );
  }
}

function buildFullLocalSql(snapshotSql) {
  const replacement = [
    "'remote_writes', 0,",
    "  'authority_target_status', '" + TARGET + "',",
    "  'local_control_row_count', (",
    "    select count(*)::integer from private.full_local_auth_control",
    "  ),",
    "  'local_control_shape_drift_count', (",
    "    select count(*)::integer",
    "    from private.full_local_auth_control as control",
    "    where not control.singleton",
    "       or control.cutover_epoch <= 0",
    "       or control.hmac_key_version <= 0",
    "       or control.authority is distinct from 'local'",
    "       or control.local_issuer is null",
    "       or control.local_issuer !~ '^https://[^/?#]+/auth/v1$'",
    "       or control.local_activated_at is null",
    "  ),",
    "  'stable_auth_uuid_drift_count', (",
    "    select count(*)::integer",
    "    from public.users as app_user",
    "    left join auth.users as auth_user on auth_user.id = app_user.id",
    "    where auth_user.id is null",
    "  ),",
    "  'local_session_binding_shape_drift_count', (",
    "    select count(*)::integer",
    "    from public.user_session_generation_bindings as binding",
    "    left join auth.users as auth_user on auth_user.id = binding.owner_uuid",
    "    left join private.full_local_auth_control as control on control.singleton",
    "    where binding.auth_authority = 'local'",
    "      and (auth_user.id is null",
    "        or binding.local_issuer is null",
    "        or binding.local_verified_at is null",
    "        or binding.auth_cutover_epoch is distinct from control.cutover_epoch",
    "        or binding.auth_identity_created_at_snapshot is distinct from auth_user.created_at",
    "        or (binding.binding_state = 'active' and (binding.revoked_at is not null or binding.binding_expires_at <= binding.local_verified_at)))",
    "  ),",
    "  'full_local_security_inventory', (" +
      buildFullLocalSecurityInventoryExpression({ includeSnapshotTables: true }) +
      "\n  ),",
    "  'account_cleanup_function_missing_count', (",
    "    select count(*)::integer",
    "    from (values",
    "      ('public.recipe_snapshot_account_cleanup_guard(uuid)'),",
    "      ('public.delete_user_private_data(uuid)')",
    "    ) as required(signature)",
    "    where pg_catalog.to_regprocedure(required.signature) is null",
    "  ),",
    "  'owner_null_shared_snapshot_count', (",
    "    select (",
    "      (select count(*) from public.recipe_content_snapshots where owner_user_id is null)",
    "      + (select count(*) from public.recipe_nutrition_snapshots where owner_user_id is null)",
    "    )::integer",
    "  ),",
    "  'remote_application_writes', 0",
    ")",
  ].join("\n");

  const currentCleanupSql = snapshotSql.replace(
    /(\('public\.delete_user_private_data\(uuid\)',\s*')[0-9a-f]{32}(',\s*'true',\s*'true'\))/u,
    "$1" + CURRENT_ACCOUNT_CLEANUP_HASH + "$2",
  );
  if (currentCleanupSql === snapshotSql) {
    throw new Error("snapshot cleanup function hash could not be advanced safely");
  }
  const sql = currentCleanupSql.replace(
    /'remote_writes', 0\s*\)\s*$/u,
    () => replacement,
  );
  if (sql === currentCleanupSql) {
    throw new Error("snapshot verification SQL could not be extended safely");
  }
  assertRecipeSnapshotAuthorityReadOnlyVerificationSql({
    sql,
    fieldName: "recipe snapshot authority full-local verification SQL",
  });
  return sql;
}

export function buildRecipeSnapshotAuthorityFullLocalVerificationPlan({ mode }) {
  if (mode !== MODE) {
    throw new Error(
      "unsupported recipe snapshot authority full-local verification mode: "
        + (mode ?? "missing"),
    );
  }
  const snapshotPlan = buildRecipeSnapshotAuthorityRemoteVerificationPlan({
    mode: "post-merge-read-only",
  });
  return {
    mode,
    target: TARGET,
    readOnly: true,
    requiresMergedOriginMaster: true,
    requiresCleanTrackedTree: true,
    productionWrites: 0,
    stagingWrites: 0,
    remoteApplicationWrites: 0,
    requiredChecks: REQUIRED_CHECKS.map((check) => ({
      ...check,
      args: [...check.args],
    })),
    manualOnlyPending: [...MANUAL_ONLY_PENDING],
    sql: buildFullLocalSql(snapshotPlan.sql),
  };
}

export function buildRecipeSnapshotAuthorityFullLocalPsqlRequest({
  baseEnvironment = {},
  databaseUrl,
  planSql,
}) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("full-local verifier requires a loopback local full-local database");
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
    throw new Error("full-local verifier requires a loopback local full-local database");
  }
  assertRecipeSnapshotAuthorityReadOnlyVerificationSql({
    sql: planSql,
    fieldName: "recipe snapshot authority full-local SQL",
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

export function assertRecipeSnapshotAuthorityFullLocalResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("recipe snapshot authority full-local verification failed closed");
  }
  const snapshotResult = { ...result };
  for (const field of FULL_LOCAL_RESULT_FIELDS) delete snapshotResult[field];
  try {
    assertRecipeSnapshotAuthorityRemoteVerificationResult(snapshotResult);
  } catch {
    throw new Error("recipe snapshot authority full-local verification failed closed");
  }

  const valid =
    Object.keys(result).length
      === Object.keys(snapshotResult).length + FULL_LOCAL_RESULT_FIELDS.length
    && FULL_LOCAL_RESULT_FIELDS.every((field) => Object.hasOwn(result, field))
    && result.authority_target_status === TARGET
    && result.local_control_row_count === 1
    && (() => {
      try {
        assertRecipeSnapshotAuthorityFullLocalSecurityInventoryResult(
          result.full_local_security_inventory,
          { includeSnapshotTables: true },
        );
        return true;
      } catch {
        return false;
      }
    })()
    && ZERO_RESULT_FIELDS.every((field) => result[field] === 0)
    && Number.isInteger(result.owner_null_shared_snapshot_count)
    && result.owner_null_shared_snapshot_count >= 0;
  if (!valid) {
    throw new Error("recipe snapshot authority full-local verification failed closed");
  }
  return result;
}

export function assertRecipeSnapshotAuthorityFullLocalExecutionEvidence(evidence) {
  const valid =
    hasExactKeys(evidence, [
      "source_merge_sha",
      "checks",
      "manual_only",
      "production_writes",
      "staging_writes",
      "remote_application_writes",
    ])
    && /^[0-9a-f]{40}$/u.test(evidence.source_merge_sha)
    && hasExactKeys(evidence.checks, REQUIRED_CHECKS.map((check) => check.id))
    && Object.values(evidence.checks).every((status) => status === "passed")
    && hasExactKeys(evidence.manual_only, MANUAL_ONLY_PENDING)
    && Object.values(evidence.manual_only).every((status) => status === "pending")
    && evidence.production_writes === 0
    && evidence.staging_writes === 0
    && evidence.remote_application_writes === 0;
  if (!valid) {
    throw new Error(
      "recipe snapshot authority full-local execution evidence failed closed",
    );
  }
  return evidence;
}

export function buildRecipeSnapshotAuthorityFullLocalSummary({
  mergeSha,
  localResult,
  executionEvidence,
}) {
  if (!/^[0-9a-f]{40}$/u.test(mergeSha)) {
    throw new Error("full-local verification requires an exact merge SHA");
  }
  assertRecipeSnapshotAuthorityFullLocalResult(localResult);
  assertRecipeSnapshotAuthorityFullLocalExecutionEvidence(executionEvidence);
  if (executionEvidence.source_merge_sha !== mergeSha) {
    throw new Error("full-local execution evidence must match the exact merge SHA");
  }
  return {
    ok: true,
    mode: MODE,
    target: TARGET,
    merge_sha: mergeSha,
    snapshot_authority_status: "ready",
    full_local_db_authority_status: "ready",
    automated_check_count: REQUIRED_CHECKS.length,
    manual_only_status: "pending",
    manual_only_pending: [...MANUAL_ONLY_PENDING],
    production_writes: 0,
    staging_writes: 0,
    remote_application_writes: 0,
  };
}
