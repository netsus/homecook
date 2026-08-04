import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalizePredicate,
  parsePolicy,
} from "./full-local-security-inventory.mjs";
import { inventoryHybridAuthorityPaths } from "./hybrid-authority-inventory.mjs";
import {
  assertRecipeSnapshotAuthorityFullLocalEnvironment,
  assertRecipeSnapshotAuthorityFullLocalResult,
  buildRecipeSnapshotAuthorityFullLocalPsqlRequest,
  buildRecipeSnapshotAuthorityFullLocalVerificationPlan,
} from "./recipe-snapshot-authority-full-local-verifier.mjs";
import {
  assertRecipeSnapshotAuthorityMergedExactSource,
} from "./recipe-snapshot-authority-remote-verifier.mjs";

const MODE = "post-merge-full-local-read-only";
const TARGET = "self-hosted-local-auth-db-storage-single-authority";
const SOURCE_OF_RECORD = "live-remote-read-only-pre-floor";
const RESTORE_MANIFEST_STATUS = "pending-manual-evidence";
const STABLE_UUID_RESTORE_STATUS = "pending-manual-restore-manifest";
const TRANSIENT_AUTH_STATE_STATUS = "local-zero-manifest-pending";
const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const LEGACY_RECIPE_IMAGE_POLICY_MIGRATION = readFileSync(join(
  REPOSITORY_ROOT,
  "supabase/migrations/20260530103000_31_recipe_media_tags.sql",
), "utf8");
const CURRENT_RECIPE_IMAGE_POLICY_MIGRATION = readFileSync(join(
  REPOSITORY_ROOT,
  "supabase/migrations/20260723140000_account_session_generation_foundation.sql",
), "utf8");
const STORAGE_POLICY_CONTRACT = [
  parsePolicy(
    LEGACY_RECIPE_IMAGE_POLICY_MIGRATION,
    "recipe_images_public_read",
  ),
  ...[
    "recipe_images_insert_own",
    "recipe_images_update_own",
    "recipe_images_delete_own",
  ].map((name) => parsePolicy(CURRENT_RECIPE_IMAGE_POLICY_MIGRATION, name)),
];
const APPROVED_VERIFIED_SESSION_SERVICE_ROLE_ROUTE_COUNTS = new Map([
  ["app/api/v1/cooking/session-attempts/[id]/cancel/route.ts", 1],
  ["app/api/v1/cooking/session-attempts/[id]/cook-mode/route.ts", 1],
  ["app/api/v1/cooking/session-attempts/route.ts", 1],
  ["app/api/v1/meals/[meal_id]/route.ts", 2],
  ["app/api/v1/meals/route.ts", 1],
  ["app/api/v1/shopping/lists/route.ts", 1],
]);
const APPROVED_PUBLIC_SERVICE_ROLE_ROUTE_COUNTS = new Map();
const APPROVED_VERIFIED_SESSION_SERVICE_ROLE_ENTRY_COUNT =
  [...APPROVED_VERIFIED_SESSION_SERVICE_ROLE_ROUTE_COUNTS.values()]
    .reduce((sum, count) => sum + count, 0);
const APPROVED_PUBLIC_SERVICE_ROLE_ENTRY_COUNT =
  [...APPROVED_PUBLIC_SERVICE_ROLE_ROUTE_COUNTS.values()]
    .reduce((sum, count) => sum + count, 0);
const SAFE_CHECK_ENVIRONMENT_KEYS = [
  "PATH",
  "LANG",
  "LC_ALL",
  "HOME",
  "TMPDIR",
  "CI",
  "NO_COLOR",
  "FORCE_COLOR",
  "TZ",
];

const PERSONAL_EDITOR_CHECKS = [
  {
    id: "personal-editor-permissions-contract",
    command: "pnpm",
    args: [
      "exec",
      "vitest",
      "run",
      "tests/personal-recipe-editor-permissions.test.ts",
      "tests/personal-recipe-editor-contract.test.ts",
    ],
  },
  {
    id: "personal-editor-full-local-source-boundary",
    command: "pnpm",
    args: [
      "exec",
      "vitest",
      "run",
      "tests/personal-recipe-editor-full-local-verifier.test.ts",
    ],
  },
];

const MANUAL_ONLY_PENDING = [
  "provider-live-callback-link",
  "cloudflare-public-edge",
  "final-backup-restore",
  "off-mac-restore",
  "first-local-mutation-cutover",
  "post-floor-recovery",
];

const SOURCE_EVIDENCE_KEYS = [
  "app_surface_personal_editor_marker_count",
  "browser_direct_data_mutation_count",
  "browser_direct_storage_path_count",
  "browser_raw_rest_mutation_count",
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
  "public_service_role_entry_count",
  "user_direct_service_role_count",
  "user_service_role_violation_count",
].sort();

const BOUNDARY_CHECK_KEYS = [
  "owner_access",
  "other_owner_nondisclosure",
  "deleted_nondisclosure",
  "quarantined_nondisclosure",
  "public_surface_boundary",
  "browser_direct_data_storage_mutation",
  "service_role_user_fallback",
  "remote_application_writes",
];

const EXECUTION_OBSERVATION_SCALARS = {
  git_fetch_transport: "https-read-only",
  database_target: "loopback",
  database_transaction: "read-only",
  required_checks_target: "local-sanitized",
  remote_application_write_target: "absent",
};

const EXECUTION_OBSERVATION_KEYS = [
  ...Object.keys(EXECUTION_OBSERVATION_SCALARS),
  "required_check_command_ledger",
  "required_check_environment_keys",
  "remote_application_target_environment_keys",
  "remote_application_credential_environment_keys",
];

const LOCAL_AUTHORITY_OBSERVATION_FIELDS = [
  "public_user_count",
  "auth_user_count",
  "auth_identity_count",
  "auth_identity_mapping_mismatch_count",
  "auth_session_row_count",
  "auth_refresh_token_row_count",
  "auth_flow_state_row_count",
  "storage_bucket_count",
  "storage_object_count",
  "private_storage_bucket_count",
  "private_storage_bucket_drift_count",
  "storage_objects_rls_disabled_count",
  "storage_policy_count",
  "storage_policy_drift_count",
  "unexpected_storage_policy_count",
  "unexpected_storage_mutation_grant_count",
  "_storage_policy_expression_inventory",
  "image_registry_acl_drift_count",
  "private_storage_object_count",
  "private_storage_object_registry_mismatch_count",
  "private_image_registry_shape_drift_count",
  "private_image_registry_active_object_mismatch_count",
];

const ZERO_LOCAL_AUTHORITY_OBSERVATION_FIELDS = [
  "auth_identity_mapping_mismatch_count",
  "auth_session_row_count",
  "auth_refresh_token_row_count",
  "auth_flow_state_row_count",
  "private_storage_bucket_drift_count",
  "storage_objects_rls_disabled_count",
  "storage_policy_drift_count",
  "unexpected_storage_policy_count",
  "unexpected_storage_mutation_grant_count",
  "image_registry_acl_drift_count",
  "private_storage_object_registry_mismatch_count",
  "private_image_registry_shape_drift_count",
  "private_image_registry_active_object_mismatch_count",
];

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  return actualKeys.length === sortedExpectedKeys.length
    && actualKeys.every((key, index) => key === sortedExpectedKeys[index]);
}

function countAllowlistedServiceRoleEntries(entries, expectedByFile) {
  const remainingByFile = new Map(expectedByFile);
  let approvedCount = 0;
  let violationCount = 0;

  for (const entry of entries) {
    const remaining = remainingByFile.get(entry.file) ?? 0;
    if (remaining > 0 && entry.kind === "service-role-call") {
      approvedCount += 1;
      remainingByFile.set(entry.file, remaining - 1);
      continue;
    }
    violationCount += 1;
  }

  for (const remaining of remainingByFile.values()) {
    violationCount += remaining;
  }

  return { approvedCount, violationCount };
}

function hasExactExecutionObservation(
  observation,
  { requireAbsentRemoteTarget = true } = {},
) {
  const plan = buildPersonalRecipeEditorFullLocalVerificationPlan({
    mode: MODE,
  });
  const expectedLedger = plan.requiredChecks.map(({ id, command, args }) => ({
    id,
    command,
    args,
  }));
  const environmentKeys = observation?.required_check_environment_keys;
  const commandLedger = observation?.required_check_command_ledger;
  return hasExactKeys(observation, EXECUTION_OBSERVATION_KEYS)
    && Object.entries(EXECUTION_OBSERVATION_SCALARS).every(
      ([key, value]) => key === "remote_application_write_target"
        ? !requireAbsentRemoteTarget || observation[key] === value
        : observation[key] === value,
    )
    && Array.isArray(commandLedger)
    && JSON.stringify(commandLedger) === JSON.stringify(expectedLedger)
    && Array.isArray(environmentKeys)
    && environmentKeys.length > 0
    && environmentKeys.every((key) =>
      typeof key === "string" && SAFE_CHECK_ENVIRONMENT_KEYS.includes(key)
    )
    && new Set(environmentKeys).size === environmentKeys.length
    && environmentKeys.every(
      (key, index) => index === 0 || environmentKeys[index - 1] < key,
    )
    && Array.isArray(
      observation.remote_application_target_environment_keys,
    )
    && observation.remote_application_target_environment_keys.length === 0
    && Array.isArray(
      observation.remote_application_credential_environment_keys,
    )
    && observation.remote_application_credential_environment_keys.length === 0;
}

function listSourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, {
    encoding: "utf8",
    withFileTypes: true,
  })) {
    if (entry.name.startsWith(".")) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(path));
    } else if (entry.isFile() && /\.(?:ts|tsx)$/u.test(entry.name)) {
      files.push(path);
    }
  }
  return files.sort();
}

function countPatternMatchesInFiles(files, pattern) {
  return files.reduce((total, file) => {
    const source = readFileSync(file, "utf8");
    return total + (source.match(pattern)?.length ?? 0);
  }, 0);
}

function buildPersonalEditorAuthoritySql(fullLocalSql) {
  const replacement = [
    "'remote_application_writes', 0",
    ") || jsonb_build_object(",
    "  'public_user_count', (select count(*)::integer from public.users),",
    "  'auth_user_count', (select count(*)::integer from auth.users),",
    "  'auth_identity_count', (select count(*)::integer from auth.identities),",
    "  'auth_identity_mapping_mismatch_count', (",
    "    select count(*)::integer",
    "    from (",
    "      select app_user.id::text as identity_key",
    "      from public.users as app_user",
    "      left join auth.users as auth_user on auth_user.id = app_user.id",
    "      where auth_user.id is null",
    "      union all",
    "      select auth_user.id::text",
    "      from auth.users as auth_user",
    "      left join public.users as app_user on app_user.id = auth_user.id",
    "      where app_user.id is null",
    "      union all",
    "      select identity.user_id::text",
    "      from auth.identities as identity",
    "      left join auth.users as auth_user on auth_user.id = identity.user_id",
    "      where auth_user.id is null",
    "      union all",
    "      select auth_user.id::text",
    "      from auth.users as auth_user",
    "      left join auth.identities as identity on identity.user_id = auth_user.id",
    "      where identity.user_id is null",
    "    ) as mismatch",
    "  ),",
    "  'auth_session_row_count', (select count(*)::integer from auth.sessions),",
    "  'auth_refresh_token_row_count', (select count(*)::integer from auth.refresh_tokens),",
    "  'auth_flow_state_row_count', (select count(*)::integer from auth.flow_state),",
    "  'storage_bucket_count', (select count(*)::integer from storage.buckets),",
    "  'storage_object_count', (select count(*)::integer from storage.objects),",
    "  'private_storage_bucket_count', (",
    "    select count(*)::integer from storage.buckets",
    "    where id = 'recipe-images-private' and name = 'recipe-images-private'",
    "  ),",
    "  'private_storage_bucket_drift_count', (",
    "    select count(*)::integer from storage.buckets",
    "    where id = 'recipe-images-private'",
    "      and (public",
    "        or file_size_limit is distinct from 5242880",
    "        or allowed_mime_types is distinct from array['image/jpeg','image/png','image/webp']::text[])",
    "  ),",
    "  'storage_objects_rls_disabled_count', (",
    "    select count(*)::integer",
    "    from pg_catalog.pg_class as relation",
    "    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace",
    "    where namespace.nspname = 'storage' and relation.relname = 'objects'",
    "      and not relation.relrowsecurity",
    "  ),",
    "  'storage_policy_count', (",
    "    select count(*)::integer from pg_catalog.pg_policy as policy",
    "    where policy.polrelid = 'storage.objects'::pg_catalog.regclass",
    "  ),",
    "  'storage_policy_drift_count', (",
    "    select count(*)::integer",
    "    from (values",
    "      ('recipe_images_public_read', 'r', 'public'),",
    "      ('recipe_images_insert_own', 'a', 'authenticated'),",
    "      ('recipe_images_update_own', 'w', 'authenticated'),",
    "      ('recipe_images_delete_own', 'd', 'authenticated')",
    "    ) as expected(name, command, role_name)",
    "    left join pg_catalog.pg_policy as policy",
    "      on policy.polrelid = 'storage.objects'::pg_catalog.regclass",
    "     and policy.polname = expected.name",
    "    where policy.oid is null",
    "       or policy.polcmd is distinct from expected.command::\"char\"",
    "       or case when expected.role_name = 'public'",
    "         then policy.polroles is distinct from array[0::oid]",
    "         else policy.polroles is distinct from array[(select oid from pg_catalog.pg_roles where rolname = expected.role_name)]",
    "       end",
    "       or (coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')",
    "         || ' ' || coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), ''))",
    "         not like '%bucket_id%recipe-images%'",
    "       or (coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')",
    "         || ' ' || coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), '')) ~* '\\mor\\M'",
    "       or (expected.role_name = 'authenticated' and (",
    "         (coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')",
    "           || ' ' || coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), '')) not like '%storage.foldername(name)%'",
    "         or (coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')",
    "           || ' ' || coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), '')) not like '%account_generation_storage_guard.allows_legacy_recipe_image_write()%'))",
    "  ),",
    "  '_storage_policy_expression_inventory', (",
    "    select coalesce(jsonb_agg(jsonb_build_object(",
    "      'schema', namespace.nspname,",
    "      'table', relation.relname,",
    "      'name', policy.polname,",
    "      'command', case policy.polcmd",
    "        when 'r' then 'SELECT' when 'a' then 'INSERT'",
    "        when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL' end,",
    "      'roles', (select string_agg(case when role_oid = 0 then 'public' else role.rolname end, ',' order by case when role_oid = 0 then 'public' else role.rolname end)",
    "        from unnest(policy.polroles) as role_oid",
    "        left join pg_catalog.pg_roles as role on role.oid = role_oid),",
    "      'permissive', case when policy.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end,",
    "      'using', coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), ''),",
    "      'check', coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), '')",
    "    ) order by policy.polname), '[]'::jsonb)",
    "    from pg_catalog.pg_policy as policy",
    "    join pg_catalog.pg_class as relation on relation.oid = policy.polrelid",
    "    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace",
    "    where policy.polrelid = 'storage.objects'::pg_catalog.regclass",
    "  ),",
    "  'unexpected_storage_policy_count', (",
    "    select count(*)::integer from pg_catalog.pg_policy as policy",
    "    where policy.polrelid = 'storage.objects'::pg_catalog.regclass",
    "      and policy.polname not in (",
    "        'recipe_images_public_read', 'recipe_images_insert_own',",
    "        'recipe_images_update_own', 'recipe_images_delete_own'",
    "      )",
    "  ),",
    "  'unexpected_storage_mutation_grant_count', (",
    "    select count(*)::integer",
    "    from (",
    "      with relation as (",
    "        select object.oid, object.relowner, object.relacl",
    "        from pg_catalog.pg_class as object",
    "        where object.oid = 'storage.objects'::pg_catalog.regclass",
    "      ), actual as (",
    "        select case when acl.grantee = 0 then 'PUBLIC' else role.rolname end as principal,",
    "          'table'::text as scope, upper(acl.privilege_type) as privilege, acl.is_grantable as grantable",
    "        from relation",
    "        cross join lateral pg_catalog.aclexplode(coalesce(relation.relacl, pg_catalog.acldefault('r', relation.relowner))) as acl",
    "        left join pg_catalog.pg_roles as role on role.oid = acl.grantee",
    "        where acl.grantee <> relation.relowner",
    "          and upper(acl.privilege_type) in ('INSERT', 'UPDATE', 'DELETE')",
    "        union all",
    "        select case when acl.grantee = 0 then 'PUBLIC' else role.rolname end,",
    "          'column:' || attribute.attname, upper(acl.privilege_type), acl.is_grantable",
    "        from relation",
    "        join pg_catalog.pg_attribute as attribute on attribute.attrelid = relation.oid",
    "        cross join lateral pg_catalog.aclexplode(attribute.attacl) as acl",
    "        left join pg_catalog.pg_roles as role on role.oid = acl.grantee",
    "        where attribute.attnum > 0 and not attribute.attisdropped",
    "          and attribute.attacl is not null",
    "          and acl.grantee <> relation.relowner",
    "          and upper(acl.privilege_type) in ('INSERT', 'UPDATE')",
    "      ), expected(principal, scope, privilege, grantable) as (",
    "        values ('authenticated', 'table', 'INSERT', false),",
    "          ('authenticated', 'table', 'UPDATE', false),",
    "          ('authenticated', 'table', 'DELETE', false)",
    "      )",
    "      (select * from actual except select * from expected)",
    "      union all",
    "      (select * from expected except select * from actual)",
    "    ) as acl_drift",
    "  ),",
    "  'image_registry_acl_drift_count', (",
    "    select count(*)::integer",
    "    from (values ('public'), ('anon'), ('authenticated'), ('service_role')) as role(grantee)",
    "    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as privilege(name)",
    "    where pg_catalog.has_table_privilege(role.grantee, 'public.recipe_image_objects', privilege.name)",
    "       or case when privilege.name = 'DELETE' then false",
    "         else pg_catalog.has_any_column_privilege(role.grantee, 'public.recipe_image_objects', privilege.name)",
    "       end",
    "  ),",
    "  'private_storage_object_count', (",
    "    select count(*)::integer from storage.objects",
    "    where bucket_id = 'recipe-images-private'",
    "  ),",
    "  'private_storage_object_registry_mismatch_count', (",
    "    select count(*)::integer",
    "    from storage.objects as object",
    "    left join public.recipe_image_objects as registry",
    "      on registry.bucket_id = object.bucket_id and registry.object_path = object.name",
    "    where object.bucket_id = 'recipe-images-private'",
    "      and (registry.id is null or registry.visibility is distinct from 'private')",
    "  ),",
    "  'private_image_registry_shape_drift_count', (",
    "    select count(*)::integer",
    "    from public.recipe_image_objects as registry",
    "    where registry.bucket_id = 'recipe-images-private'",
    "      and (registry.visibility is distinct from 'private'",
    "        or registry.owner_uuid is null",
    "        or registry.account_generation is null",
    "        or registry.account_generation <= 0",
    "        or registry.object_path not like (registry.owner_uuid::text || '/' || registry.account_generation::text || '/' || registry.id::text || '.%'))",
    "  ),",
    "  'private_image_registry_active_object_mismatch_count', (",
    "    select count(*)::integer",
    "    from public.recipe_image_objects as registry",
    "    left join storage.objects as object",
    "      on object.bucket_id = registry.bucket_id and object.name = registry.object_path",
    "    where registry.bucket_id = 'recipe-images-private'",
    "      and registry.state in ('uploaded_unlinked', 'attached_private')",
    "      and object.id is null",
    "  )",
    ")",
  ].join("\n");
  const sql = fullLocalSql.replace(
    /'remote_application_writes', 0\s*\)\s*$/u,
    replacement,
  );
  if (sql === fullLocalSql) {
    throw new Error("personal editor authority SQL could not be extended safely");
  }
  return sql;
}

export function assertPersonalRecipeEditorFullLocalEnvironment(environment) {
  try {
    assertRecipeSnapshotAuthorityFullLocalEnvironment(environment);
  } catch {
    throw new Error(
      "personal recipe editor verifier requires local Auth and Data authority",
    );
  }
}

export function assertPersonalRecipeEditorMergedExactSource(source) {
  try {
    return assertRecipeSnapshotAuthorityMergedExactSource(source);
  } catch {
    throw new Error(
      "personal recipe editor verifier requires a clean merged exact origin/master source",
    );
  }
}

export function buildPersonalRecipeEditorCheckEnvironment(
  baseEnvironment = {},
) {
  return Object.fromEntries(
    SAFE_CHECK_ENVIRONMENT_KEYS
      .filter((key) => baseEnvironment[key] !== undefined)
      .map((key) => [key, baseEnvironment[key]]),
  );
}

export function buildPersonalRecipeEditorFullLocalVerificationPlan({ mode }) {
  if (mode !== MODE) {
    throw new Error(
      "unsupported personal recipe editor full-local verification mode: "
        + (mode ?? "missing"),
    );
  }
  const fullLocalPlan = buildRecipeSnapshotAuthorityFullLocalVerificationPlan({
    mode,
  });
  return {
    ...fullLocalPlan,
    mode,
    target: TARGET,
    sourceOfRecord: SOURCE_OF_RECORD,
    stableRemoteUuidRestore: STABLE_UUID_RESTORE_STATUS,
    remoteTransientAuthState: TRANSIENT_AUTH_STATE_STATUS,
    restoreManifest: RESTORE_MANIFEST_STATUS,
    externalPersonalWrite: "dark",
    requiredChecks: [
      ...PERSONAL_EDITOR_CHECKS.map((check) => ({
        ...check,
        args: [...check.args],
      })),
      ...fullLocalPlan.requiredChecks,
    ],
    manualOnlyPending: [...MANUAL_ONLY_PENDING],
    sql: buildPersonalEditorAuthoritySql(fullLocalPlan.sql),
  };
}

export function buildPersonalRecipeEditorFullLocalPsqlRequest(options) {
  try {
    return buildRecipeSnapshotAuthorityFullLocalPsqlRequest(options);
  } catch {
    throw new Error(
      "personal recipe editor full-local verifier requires a credentialed loopback database and read-only SQL",
    );
  }
}

export function collectPersonalRecipeEditorSourceEvidence(repositoryRoot) {
  const inventory = inventoryHybridAuthorityPaths(repositoryRoot);
  const appSourceFiles = listSourceFiles(join(repositoryRoot, "app"));
  const mypageSourceFiles = listSourceFiles(
    join(repositoryRoot, "components/mypage"),
  );
  const recipebookSourceFiles = listSourceFiles(
    join(repositoryRoot, "components/recipebook"),
  );
  const detailSource = readFileSync(
    join(repositoryRoot, "components/recipe/recipe-detail-screen.tsx"),
    "utf8",
  );
  const policySource = readFileSync(
    join(repositoryRoot, "lib/personal-recipe-editor.ts"),
    "utf8",
  );
  const recipeRouteSource = readFileSync(
    join(repositoryRoot, "app/api/v1/recipes/[id]/route.ts"),
    "utf8",
  );
  const recipeCollectionRouteSource = readFileSync(
    join(repositoryRoot, "app/api/v1/recipes/route.ts"),
    "utf8",
  );
  const capabilityOccurrenceCount =
    detailSource.match(/\bcapabilityEnabled\b/gu)?.length ?? 0;
  const literalCapabilityOffOccurrenceCount =
    detailSource.match(/capabilityEnabled=\{false\}/gu)?.length ?? 0;
  const hasServerProjectedOwnerEditBoundary =
    /const\s+activePersonalEditContext\s*=\s*recipeSnapshotUiMode\s*===\s*"snapshot_v2"\s*&&\s*recipe\.edit_context/gu.test(
      detailSource,
    )
    && /const\s+canEditPersonalRecipe\s*=\s*isAuthenticated\s*&&\s*Boolean\(activePersonalEditContext\);/gu.test(
      detailSource,
    );
  const projectedCapabilityOffOccurrenceCount =
    hasServerProjectedOwnerEditBoundary
      ? detailSource.match(
        /capabilityEnabled=\{canEditPersonalRecipe\}/gu,
      )?.length ?? 0
      : 0;
  const capabilityOffOccurrenceCount =
    literalCapabilityOffOccurrenceCount
    + projectedCapabilityOffOccurrenceCount;
  const verifiedSessionServiceRoleEntries =
    countAllowlistedServiceRoleEntries(
      inventory.userDirectServiceRoleEntries,
      APPROVED_VERIFIED_SESSION_SERVICE_ROLE_ROUTE_COUNTS,
    );
  const approvedPublicServiceRoleEntries =
    countAllowlistedServiceRoleEntries(
      inventory.publicServiceRoleEntries,
      APPROVED_PUBLIC_SERVICE_ROLE_ROUTE_COUNTS,
    );
  const personalCreateCase =
    policySource.match(
      /case\s+"personal-create"(?<body>[\s\S]*?)(?=\n\s*case\s+|\n\s*\}\n)/u,
    )?.groups?.body ?? "";

  return {
    app_surface_personal_editor_marker_count:
      countPatternMatchesInFiles(
        appSourceFiles,
        /\b(?:personal-create|personal-edit|public-fork|personal_recipe_v2)\b|내 레시피로 수정/gu,
      ),
    browser_direct_data_mutation_count:
      inventory.browserDirectDataMutationPaths.length,
    browser_direct_storage_path_count:
      inventory.browserDirectStoragePaths.length,
    browser_raw_rest_mutation_count:
      inventory.browserRawRestMutationPaths.length,
    capability_on_occurrence_count:
      capabilityOccurrenceCount - capabilityOffOccurrenceCount,
    capability_off_occurrence_count: capabilityOffOccurrenceCount,
    internal_operation_violation_count:
      inventory.internalOperationViolations.length,
    legacy_recipe_post_handler_count:
      recipeCollectionRouteSource.match(
        /export\s+async\s+function\s+POST\b/gu,
      )?.length ?? 0,
    mypage_surface_personal_editor_marker_count:
      countPatternMatchesInFiles(
        mypageSourceFiles,
        /\b(?:personal-create|personal-edit|public-fork|personal_recipe_v2)\b|내 레시피로 수정/gu,
      ),
    personal_create_active_entry:
      !/activeEntry:\s*false/u.test(personalCreateCase),
    recipe_collection_personal_editor_marker_count:
      recipeCollectionRouteSource.match(
        /\b(?:personal-create|personal-edit|public-fork|personal_recipe_v2)\b/gu,
      )?.length ?? 0,
    recipe_collection_personal_origin_field_count:
      recipeCollectionRouteSource.match(/\borigin_recipe_id\b/gu)?.length ?? 0,
    recipe_delete_handler_count:
      recipeRouteSource.match(/export\s+async\s+function\s+DELETE\b/gu)
        ?.length ?? 0,
    recipe_patch_handler_count:
      recipeRouteSource.match(/export\s+async\s+function\s+PATCH\b/gu)
        ?.length ?? 0,
    recipebook_surface_personal_editor_marker_count:
      countPatternMatchesInFiles(
        recipebookSourceFiles,
        /\b(?:personal-create|personal-edit|public-fork|personal_recipe_v2)\b|내 레시피로 수정/gu,
      ),
    public_service_role_entry_count:
      approvedPublicServiceRoleEntries.approvedCount,
    user_direct_service_role_count:
      verifiedSessionServiceRoleEntries.approvedCount,
    user_service_role_violation_count:
      inventory.userServiceRoleViolations.length
      + verifiedSessionServiceRoleEntries.violationCount
      + approvedPublicServiceRoleEntries.violationCount,
  };
}

export function assertPersonalRecipeEditorSourceEvidence(evidence) {
  const countKeys = SOURCE_EVIDENCE_KEYS.filter(
    (key) => key !== "personal_create_active_entry",
  );
  const valid =
    hasExactKeys(evidence, SOURCE_EVIDENCE_KEYS)
    && countKeys.every(
      (key) => Number.isInteger(evidence[key]) && evidence[key] >= 0,
    )
    && evidence.app_surface_personal_editor_marker_count === 0
    && evidence.browser_direct_data_mutation_count === 0
    && evidence.browser_direct_storage_path_count === 0
    && evidence.browser_raw_rest_mutation_count === 0
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
    && evidence.public_service_role_entry_count
      === APPROVED_PUBLIC_SERVICE_ROLE_ENTRY_COUNT
    && evidence.user_direct_service_role_count
      === APPROVED_VERIFIED_SESSION_SERVICE_ROLE_ENTRY_COUNT
    && evidence.user_service_role_violation_count === 0;
  if (!valid) {
    throw new Error("personal recipe editor source evidence failed closed");
  }
  return evidence;
}

function hasExactStoragePolicyInventory(inventory) {
  return Array.isArray(inventory)
    && inventory.length === STORAGE_POLICY_CONTRACT.length
    && STORAGE_POLICY_CONTRACT.every((expected) => {
      const actual = inventory.find((entry) =>
        entry?.schema === expected.schema
        && entry?.table === expected.table
        && entry?.name === expected.name
      );
      return actual
        && hasExactKeys(actual, [
          "schema",
          "table",
          "name",
          "command",
          "roles",
          "permissive",
          "using",
          "check",
        ])
        && actual.command === expected.command
        && actual.roles === expected.roles
        && actual.permissive === expected.permissive
        && canonicalizePredicate(actual.using) === expected.using
        && canonicalizePredicate(actual.check) === expected.check;
    });
}

export function assertPersonalRecipeEditorFullLocalResult(result) {
  if (!hasExactKeys(result, [
    "full_local_authority",
    "personal_editor_source",
  ])) {
    throw new Error("personal recipe editor full-local result failed closed");
  }
  try {
    const snapshotAuthority = { ...result.full_local_authority };
    for (const field of LOCAL_AUTHORITY_OBSERVATION_FIELDS) {
      delete snapshotAuthority[field];
    }
    assertRecipeSnapshotAuthorityFullLocalResult(snapshotAuthority);
    assertPersonalRecipeEditorSourceEvidence(result.personal_editor_source);
    const authority = result.full_local_authority;
    if (
      Object.keys(authority).length
        !== Object.keys(snapshotAuthority).length
          + LOCAL_AUTHORITY_OBSERVATION_FIELDS.length
      || LOCAL_AUTHORITY_OBSERVATION_FIELDS.some(
        (field) => !Object.hasOwn(authority, field),
      )
      || ZERO_LOCAL_AUTHORITY_OBSERVATION_FIELDS.some(
        (field) => authority[field] !== 0,
      )
      || authority.public_user_count <= 0
      || authority.auth_user_count !== authority.public_user_count
      || authority.auth_identity_count <= 0
      || authority.private_storage_bucket_count !== 1
      || authority.storage_policy_count !== 4
      || !hasExactStoragePolicyInventory(
        authority._storage_policy_expression_inventory,
      )
      || !["public_user_count", "auth_user_count", "auth_identity_count", "storage_bucket_count", "storage_object_count", "private_storage_object_count"]
        .every((field) => Number.isInteger(authority[field]) && authority[field] >= 0)
    ) {
      throw new Error("local authority observation drifted");
    }
  } catch {
    throw new Error("personal recipe editor full-local result failed closed");
  }
  return result;
}

export function assertPersonalRecipeEditorFullLocalExecutionEvidence(
  evidence,
  { localResult } = {},
) {
  const plan = buildPersonalRecipeEditorFullLocalVerificationPlan({
    mode: MODE,
  });
  const valid =
    hasExactKeys(evidence, [
      "source_merge_sha",
      "checks",
      "manual_only",
      "boundary_checks",
      "execution_observation",
      "production_writes",
      "staging_writes",
    ])
    && /^[0-9a-f]{40}$/u.test(evidence.source_merge_sha)
    && hasExactKeys(
      evidence.checks,
      plan.requiredChecks.map((check) => check.id),
    )
    && Object.values(evidence.checks).every((status) => status === "passed")
    && hasExactKeys(evidence.manual_only, MANUAL_ONLY_PENDING)
    && Object.values(evidence.manual_only).every(
      (status) => status === "pending",
    )
    && hasExactKeys(evidence.boundary_checks, BOUNDARY_CHECK_KEYS)
    && (() => {
      const expected = buildPersonalRecipeEditorBoundaryChecks({
        checks: evidence.checks,
        localResult,
        executionObservation: evidence.execution_observation,
      });
      return BOUNDARY_CHECK_KEYS.every(
        (key) => evidence.boundary_checks[key] === expected[key],
      )
        && Object.values(expected).every(
          (status) => status === "passed" || status === "zero",
        );
    })()
    && hasExactExecutionObservation(evidence.execution_observation)
    && evidence.production_writes === 0
    && evidence.staging_writes === 0;
  if (!valid) {
    throw new Error(
      "personal recipe editor full-local execution evidence failed closed",
    );
  }
  return evidence;
}

export function buildPersonalRecipeEditorFullLocalSummary({
  mergeSha,
  localResult,
  executionEvidence,
}) {
  if (!/^[0-9a-f]{40}$/u.test(mergeSha ?? "")) {
    throw new Error(
      "personal recipe editor full-local verification requires an exact merge SHA",
    );
  }
  assertPersonalRecipeEditorFullLocalResult(localResult);
  assertPersonalRecipeEditorFullLocalExecutionEvidence(
    executionEvidence,
    { localResult },
  );
  if (executionEvidence.source_merge_sha !== mergeSha) {
    throw new Error(
      "personal recipe editor full-local execution evidence must match the exact merge SHA",
    );
  }

  const boundary = buildPersonalRecipeEditorBoundaryChecks({
    checks: executionEvidence.checks,
    localResult,
    executionObservation: executionEvidence.execution_observation,
  });
  const authority = localResult.full_local_authority;
  const source = localResult.personal_editor_source;
  const localAuthStorageReady =
    authority.public_user_count > 0
    && authority.auth_user_count === authority.public_user_count
    && authority.auth_identity_count > 0
    && authority.auth_identity_mapping_mismatch_count === 0
    && authority.auth_session_row_count === 0
    && authority.auth_refresh_token_row_count === 0
    && authority.auth_flow_state_row_count === 0
    && authority.private_storage_bucket_count === 1
    && authority.private_storage_bucket_drift_count === 0
    && authority.storage_objects_rls_disabled_count === 0
    && authority.storage_policy_count === 4
    && authority.storage_policy_drift_count === 0
    && authority.unexpected_storage_policy_count === 0
    && authority.unexpected_storage_mutation_grant_count === 0
    && authority.image_registry_acl_drift_count === 0
    && authority.private_storage_object_registry_mismatch_count === 0
    && authority.private_image_registry_shape_drift_count === 0
    && authority.private_image_registry_active_object_mismatch_count === 0;
  const permissionReady = [
    boundary.owner_access,
    boundary.other_owner_nondisclosure,
    boundary.deleted_nondisclosure,
    boundary.quarantined_nondisclosure,
  ].every((status) => status === "passed");
  const privateStorageReady =
    localAuthStorageReady
    && boundary.browser_direct_data_storage_mutation === "zero";

  return {
    ok: true,
    mode: MODE,
    target: TARGET,
    merge_sha: mergeSha,
    source_of_record_status: SOURCE_OF_RECORD,
    full_local_auth_db_storage_status: localAuthStorageReady ? "ready" : "drifted",
    stable_remote_uuid_restore_status: STABLE_UUID_RESTORE_STATUS,
    remote_transient_auth_state_status: TRANSIENT_AUTH_STATE_STATUS,
    local_session_rls_owner_boundary_status: permissionReady ? "ready" : "drifted",
    personal_editor_permission_boundary_status: permissionReady ? "ready" : "drifted",
    public_surface_status: boundary.public_surface_boundary === "passed"
      ? "app-and-official-auth-v1-only"
      : "drifted",
    private_storage_image_authority_status: privateStorageReady ? "ready" : "drifted",
    restore_manifest_status: RESTORE_MANIFEST_STATUS,
    external_personal_write_status:
      source.personal_create_active_entry === false
        && source.capability_on_occurrence_count === 0
        ? "dark"
        : "active",
    automated_check_count:
      Object.keys(executionEvidence.checks).length,
    manual_only_status: "pending",
    manual_only_pending: [...MANUAL_ONLY_PENDING],
    production_writes: 0,
    staging_writes: 0,
    remote_application_writes:
      boundary.remote_application_writes === "zero" ? 0 : "not-observed",
  };
}

export function buildPersonalRecipeEditorBoundaryChecks({
  checks = {},
  localResult = {},
  executionObservation = {},
} = {}) {
  const authority = localResult.full_local_authority ?? {};
  const source = localResult.personal_editor_source ?? {};
  const permissionsPassed =
    checks["personal-editor-permissions-contract"] === "passed";
  const fullLocalSourcePassed =
    checks["personal-editor-full-local-source-boundary"] === "passed";
  const securityInventory = authority.full_local_security_inventory ?? {};
  const policyBoundaryPassed =
    securityInventory.policy_missing_count === 0
    && securityInventory.policy_drift_count === 0
    && securityInventory.unexpected_policy_count === 0;
  const browserMutationCount =
    (source.browser_direct_data_mutation_count ?? 0)
    + (source.browser_direct_storage_path_count ?? 0)
    + (source.browser_raw_rest_mutation_count ?? 0);
  const serviceRoleViolationCount =
    source.user_service_role_violation_count ?? 0;

  return {
    owner_access: permissionsPassed && policyBoundaryPassed ? "passed" : "failed",
    other_owner_nondisclosure:
      permissionsPassed && policyBoundaryPassed ? "passed" : "failed",
    deleted_nondisclosure:
      permissionsPassed && fullLocalSourcePassed ? "passed" : "failed",
    quarantined_nondisclosure:
      permissionsPassed && fullLocalSourcePassed ? "passed" : "failed",
    public_surface_boundary:
      fullLocalSourcePassed
        && (source.internal_operation_violation_count ?? 1) === 0
        ? "passed"
        : "failed",
    browser_direct_data_storage_mutation:
      browserMutationCount === 0 ? "zero" : "detected",
    service_role_user_fallback:
      serviceRoleViolationCount === 0 ? "zero" : "detected",
    remote_application_writes:
      !hasExactExecutionObservation(executionObservation, {
        requireAbsentRemoteTarget: false,
      })
        ? "not-observed"
        : executionObservation.remote_application_write_target === "absent"
          ? "zero"
          : "detected",
  };
}
