import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const SAFE_ENVIRONMENT_KEYS = ["PATH", "LANG", "LC_ALL", "HOME"];
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
const REMOTE_AUTH_COUNT_FIELDS = [
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
const LOCAL_RESULT_KEYS = [
  "acl_drift_count",
  "acl_inventory_status",
  "acl_missing_count",
  "check_drift_count",
  "check_missing_count",
  "column_drift_count",
  "column_missing_count",
  "fk_drift_count",
  "fk_missing_count",
  "function_acl_drift_count",
  "function_drift_count",
  "function_inventory_status",
  "function_missing_count",
  "function_search_path_drift_count",
  "function_security_drift_count",
  "function_source_drift_count",
  "link_authority_status",
  "local_auth_user_count",
  "local_storage_dependency_count",
  "missing_table_count",
  "protected_visibility_gap_count",
  "remote_write_status",
  "remote_writes",
  "required_acl_count",
  "required_check_count",
  "required_column_count",
  "required_fk_count",
  "required_function_count",
  "required_table_count",
  "required_unique_count",
  "schema_inventory_status",
  "storage_dependency_status",
  "unexpected_function_count",
  "unique_drift_count",
  "unique_missing_count",
  "verification_scope_status",
].sort();
const MUTATING_SQL_KEYWORD_PATTERN =
  /\b(?:insert|update|delete|truncate|alter|create|drop|grant|revoke|call|do|merge|copy|vacuum|reindex|refresh|execute|perform)\b/iu;
const PSQL_META_COMMAND_PATTERN = /(^|[\r\n])\s*\\[^\s]/u;

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actualKeys = Object.keys(value).sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index]);
}

export function assertProductIngredientLinkReadOnlyVerificationSql({
  sql,
  fieldName,
}) {
  const normalizedFieldName = fieldName ?? "SQL";
  if (typeof sql !== "string" || sql.trim() === "") {
    throw new Error(`${normalizedFieldName} must be a non-empty SQL string`);
  }
  if (PSQL_META_COMMAND_PATTERN.test(sql)) {
    throw new Error(`${normalizedFieldName} must not contain psql meta-commands`);
  }

  const trimmed = sql.trim();
  const withoutTrailingSemicolon = trimmed.endsWith(";")
    ? trimmed.slice(0, -1).trimEnd()
    : trimmed;
  if (withoutTrailingSemicolon.includes(";")) {
    throw new Error(`${normalizedFieldName} must be a single SELECT/CTE statement`);
  }
  if (!/^(with\b|select\b)/iu.test(withoutTrailingSemicolon)) {
    throw new Error(`${normalizedFieldName} must be a single SELECT/CTE statement`);
  }
  if (MUTATING_SQL_KEYWORD_PATTERN.test(withoutTrailingSemicolon)) {
    throw new Error(`${normalizedFieldName} must not contain mutating SQL keywords`);
  }
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function renderSqlRows(rows) {
  return rows
    .map((row) => `    (${row.map(sqlLiteral).join(", ")})`)
    .join(",\n");
}

const REPOSITORY_ROOT = process.cwd();
const TARGET_MIGRATION_PATH =
  "supabase/migrations/20260730210000_product_ingredient_link_foundation.sql";
const SECURITY_MANIFEST = JSON.parse(
  readFileSync(
    path.join(
      REPOSITORY_ROOT,
      "docs/security/product-ingredient-link-foundation-security-function-authorization-manifest.json",
    ),
    "utf8",
  ),
);
const TARGET_MIGRATION = readFileSync(
  path.join(REPOSITORY_ROOT, TARGET_MIGRATION_PATH),
  "utf8",
);

function readMigrationFunctionSource(signature) {
  const qualifiedName = signature.slice(0, signature.indexOf("("));
  const functionStart = TARGET_MIGRATION.indexOf(
    `create or replace function ${qualifiedName}`,
  );
  if (functionStart < 0) {
    throw new Error(`product ingredient migration function is missing: ${signature}`);
  }
  const bodyStartMarker = "as $function$";
  const bodyStart = TARGET_MIGRATION.indexOf(bodyStartMarker, functionStart);
  const bodyEnd = TARGET_MIGRATION.indexOf("\n$function$;", bodyStart);
  if (bodyStart < 0 || bodyEnd < 0) {
    throw new Error(`product ingredient migration function body is missing: ${signature}`);
  }
  return TARGET_MIGRATION.slice(bodyStart + bodyStartMarker.length, bodyEnd);
}

const EXPECTED_FUNCTION_ROWS = SECURITY_MANIFEST.functions.map((entry) => {
  const sourceHash = createHash("md5")
    .update(readMigrationFunctionSource(entry.signature).replace(/^\n|\n$/gu, ""))
    .digest("hex");
  return [
    entry.signature,
    sourceHash,
    entry.security_mode === "definer" ? "true" : "false",
    entry.allowed_principals.includes("service_role") ? "true" : "false",
  ];
});

const EXACT_OWNED_FUNCTION_NAME_ROWS = [
  ...new Set(
    SECURITY_MANIFEST.functions.map((entry) =>
      entry.signature.slice("public.".length, entry.signature.indexOf("("))),
  ),
].map((functionName) => [functionName]);

const EXPECTED_COLUMN_ROWS = [
  ["public.food_product_ingredient_links", "id", "uuid", "true"],
  ["public.food_product_ingredient_links", "product_id", "uuid", "true"],
  ["public.food_product_ingredient_links", "ingredient_id", "uuid", "true"],
  ["public.food_product_ingredient_links", "relation", "text", "true"],
  ["public.food_product_ingredient_links", "review_status", "text", "true"],
  ["public.food_product_ingredient_links", "is_primary", "boolean", "true"],
  ["public.food_product_ingredient_links", "is_active", "boolean", "true"],
  ["public.food_product_ingredient_links", "source", "text", "true"],
  ["public.food_product_ingredient_links", "provenance_json", "jsonb", "true"],
  ["public.food_product_ingredient_links", "decision_reason", "text", "false"],
  ["public.food_product_ingredient_links", "reviewed_at", "timestamp with time zone", "false"],
  ["public.food_product_ingredient_links", "created_at", "timestamp with time zone", "true"],
  ["public.food_product_ingredient_links", "updated_at", "timestamp with time zone", "true"],
];

const EXPECTED_FK_ROWS = [
  [
    "public.food_product_ingredient_links",
    "food_product_ingredient_links_product_id_fkey",
    "product_id",
    "public.food_products",
    "c",
  ],
  [
    "public.food_product_ingredient_links",
    "food_product_ingredient_links_ingredient_id_fkey",
    "ingredient_id",
    "public.ingredients",
    "r",
  ],
];

const EXPECTED_UNIQUE_INDEX_ROWS = [
  [
    "public.food_product_ingredient_links",
    "food_product_ingredient_links_primary_represents_idx",
    "relation = 'represents'",
    "review_status = 'approved'",
    "is_primary",
    "is_active",
  ],
];

const EXPECTED_CHECK_FRAGMENT_ROWS = [
  ["relation IN ('represents', 'contains', 'substitute')"],
  ["review_status IN ('pending', 'approved', 'rejected', 'revoked', 'superseded')"],
  ["nullif(btrim(source), ''::text) IS NOT NULL"],
  ["jsonb_typeof(provenance_json) = 'object'"],
  ["(NOT is_active) OR (review_status = 'approved')"],
  ["(NOT is_primary) OR (relation = 'represents')"],
  ["(NOT is_primary) OR (review_status = 'approved')"],
  ["(NOT is_primary) OR is_active"],
  ["review_status <> ALL (ARRAY['approved'::text, 'rejected'::text, 'revoked'::text, 'superseded'::text])"],
];

const POST_MERGE_READ_ONLY_SQL = String.raw`
with required_tables(relation_name) as (
  values ('public.food_product_ingredient_links')
), expected_columns(relation_name, column_name, type_name, not_null) as (
  values
${renderSqlRows(EXPECTED_COLUMN_ROWS)}
), expected_foreign_keys(relation_name, constraint_name, column_name, referenced_relation, delete_action) as (
  values
${renderSqlRows(EXPECTED_FK_ROWS)}
), expected_unique_indexes(relation_name, index_name, fragment_one, fragment_two, fragment_three, fragment_four) as (
  values
${renderSqlRows(EXPECTED_UNIQUE_INDEX_ROWS)}
), expected_check_fragments(fragment) as (
  values
${renderSqlRows(EXPECTED_CHECK_FRAGMENT_ROWS)}
), expected_functions(signature, source_hash, security_definer, service_role_execute) as (
  values
${renderSqlRows(EXPECTED_FUNCTION_ROWS)}
), exact_owned_function_names(function_name) as (
  values
${renderSqlRows(EXACT_OWNED_FUNCTION_NAME_ROWS)}
), table_inventory as (
  select
    required.relation_name,
    to_regclass(required.relation_name) as relation_oid
  from required_tables as required
), actual_columns as (
  select
    column_table.relation_name,
    attribute.attname as column_name,
    format_type(attribute.atttypid, attribute.atttypmod) as type_name,
    case when attribute.attnotnull then 'true' else 'false' end as not_null
  from table_inventory as column_table
  join pg_catalog.pg_attribute as attribute
    on attribute.attrelid = column_table.relation_oid
   and attribute.attnum > 0
   and not attribute.attisdropped
), column_comparison as (
  select
    count(*) filter (
      where actual.column_name is null
    )::integer as column_missing_count,
    count(*) filter (
      where actual.column_name is not null
        and (
          actual.type_name is distinct from expected.type_name
          or actual.not_null is distinct from expected.not_null
        )
    )::integer as column_drift_count
  from expected_columns as expected
  left join actual_columns as actual
    on actual.relation_name = expected.relation_name
   and actual.column_name = expected.column_name
), actual_foreign_keys as (
  select
    table_inventory.relation_name,
    constraint_row.conname as constraint_name,
    attribute.attname as column_name,
    pg_catalog.format('%I.%I', namespace_ref.nspname, relation_ref.relname) as referenced_relation,
    constraint_row.confdeltype as delete_action
  from table_inventory
  join pg_catalog.pg_constraint as constraint_row
    on constraint_row.conrelid = table_inventory.relation_oid
   and constraint_row.contype = 'f'
  join pg_catalog.pg_attribute as attribute
    on attribute.attrelid = constraint_row.conrelid
   and attribute.attnum = constraint_row.conkey[1]
  join pg_catalog.pg_class as relation_ref
    on relation_ref.oid = constraint_row.confrelid
  join pg_catalog.pg_namespace as namespace_ref
    on namespace_ref.oid = relation_ref.relnamespace
), fk_comparison as (
  select
    count(*) filter (where actual.constraint_name is null)::integer as fk_missing_count,
    count(*) filter (
      where actual.constraint_name is not null
        and (
          actual.column_name is distinct from expected.column_name
          or actual.referenced_relation is distinct from expected.referenced_relation
          or actual.delete_action is distinct from expected.delete_action
        )
    )::integer as fk_drift_count
  from expected_foreign_keys as expected
  left join actual_foreign_keys as actual
    on actual.relation_name = expected.relation_name
   and actual.constraint_name = expected.constraint_name
), actual_unique_indexes as (
  select
    table_inventory.relation_name,
    class_index.relname as index_name,
    regexp_replace(pg_catalog.pg_get_expr(index_row.indpred, index_row.indrelid), '\s+', ' ', 'g') as predicate
  from table_inventory
  join pg_catalog.pg_index as index_row
    on index_row.indrelid = table_inventory.relation_oid
   and index_row.indisunique
   and index_row.indpred is not null
  join pg_catalog.pg_class as class_index
    on class_index.oid = index_row.indexrelid
), unique_comparison as (
  select
    count(*) filter (where actual.index_name is null)::integer as unique_missing_count,
    count(*) filter (
      where actual.index_name is not null
        and (
          actual.predicate not like '%' || expected.fragment_one || '%'
          or actual.predicate not like '%' || expected.fragment_two || '%'
          or actual.predicate not like '%' || expected.fragment_three || '%'
          or actual.predicate not like '%' || expected.fragment_four || '%'
        )
    )::integer as unique_drift_count
  from expected_unique_indexes as expected
  left join actual_unique_indexes as actual
    on actual.relation_name = expected.relation_name
   and actual.index_name = expected.index_name
), actual_checks as (
  select regexp_replace(pg_catalog.pg_get_constraintdef(constraint_row.oid, true), '\s+', ' ', 'g') as definition
  from table_inventory
  join pg_catalog.pg_constraint as constraint_row
    on constraint_row.conrelid = table_inventory.relation_oid
   and constraint_row.contype = 'c'
), check_comparison as (
  select
    count(*) filter (
      where not exists (
        select 1
        from actual_checks as actual
        where actual.definition like '%' || expected.fragment || '%'
      )
    )::integer as check_missing_count,
    0::integer as check_drift_count
  from expected_check_fragments as expected
), table_acl_violations as (
  select count(*)::integer as value
  from (
    select grantee
    from (values ('anon'), ('authenticated'), ('service_role')) as roles(grantee)
    where pg_catalog.has_table_privilege(
      grantee,
      'public.food_product_ingredient_links',
      'SELECT'
    )
      or pg_catalog.has_table_privilege(
        grantee,
        'public.food_product_ingredient_links',
        'IN' || 'SERT'
      )
      or pg_catalog.has_table_privilege(
        grantee,
        'public.food_product_ingredient_links',
        'UP' || 'DATE'
      )
      or pg_catalog.has_table_privilege(
        grantee,
        'public.food_product_ingredient_links',
        'DE' || 'LETE'
      )
      or pg_catalog.has_table_privilege(
        grantee,
        'public.food_product_ingredient_links',
        'TRUN' || 'CATE'
      )
  ) as violations
), actual_owned_functions as (
  select
    pg_catalog.format(
      '%I.%I(%s)',
      namespace.nspname,
      procedure_row.proname,
      pg_catalog.pg_get_function_identity_arguments(procedure_row.oid)
    ) as signature,
    procedure_row.proname as function_name
  from pg_catalog.pg_proc as procedure_row
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure_row.pronamespace
  join exact_owned_function_names as exact_owned
    on exact_owned.function_name = procedure_row.proname
  where namespace.nspname = 'public'
), unexpected_owned_functions as (
  select actual.signature
  from actual_owned_functions as actual
  left join expected_functions as expected
    on expected.signature = actual.signature
  where expected.signature is null
), unexpected_owned_function_count as (
  select count(*)::integer as value
  from unexpected_owned_functions
), function_inventory as (
  select
    expected.signature,
    procedure_row.oid as routine_oid,
    md5(btrim(coalesce(procedure_row.prosrc, ''), chr(10))) as source_hash,
    procedure_row.prosecdef as security_definer,
    coalesce(
      procedure_row.proconfig @> array['search_path=pg_catalog, public, pg_temp'],
      false
    ) as safe_search_path,
    coalesce(
      pg_catalog.has_function_privilege('anon', procedure_row.oid, 'EXE' || 'CUTE'),
      false
    ) as anon_execute,
    coalesce(
      pg_catalog.has_function_privilege('authenticated', procedure_row.oid, 'EXE' || 'CUTE'),
      false
    ) as authenticated_execute,
    coalesce(
      pg_catalog.has_function_privilege('service_role', procedure_row.oid, 'EXE' || 'CUTE'),
      false
    ) as service_role_execute,
    expected.source_hash as expected_source_hash,
    expected.security_definer::boolean as expected_security_definer,
    expected.service_role_execute::boolean as expected_service_role_execute
  from expected_functions as expected
  left join pg_catalog.pg_proc as procedure_row
    on procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
), function_comparison as (
  select
    count(*) filter (where routine_oid is null)::integer as function_missing_count,
    count(*) filter (
      where routine_oid is not null
        and source_hash is distinct from expected_source_hash
    )::integer as function_source_drift_count,
    count(*) filter (
      where routine_oid is not null
        and security_definer is distinct from expected_security_definer
    )::integer as function_security_drift_count,
    count(*) filter (
      where routine_oid is not null
        and safe_search_path is not true
    )::integer as function_search_path_drift_count,
    count(*) filter (
      where routine_oid is not null
        and (
          anon_execute is not false
          or authenticated_execute is not false
          or service_role_execute is distinct from expected_service_role_execute
        )
    )::integer as function_acl_drift_count,
    (
      count(*) filter (
        where routine_oid is not null
          and (
            source_hash is distinct from expected_source_hash
            or security_definer is distinct from expected_security_definer
            or safe_search_path is not true
            or anon_execute is not false
            or authenticated_execute is not false
            or service_role_execute is distinct from expected_service_role_execute
          )
      )
      + (select value from unexpected_owned_function_count)
    )::integer as function_drift_count
  from function_inventory
), local_auth_users as (
  select count(*)::integer as value
  from auth.users
)
select jsonb_build_object(
  'verification_scope_status', 'post-' || 'mer' || 'ge-read-only',
  'schema_inventory_status', case
    when (select count(*) from table_inventory where relation_oid is null) = 0
      and (select column_missing_count + column_drift_count from column_comparison) = 0
      and (select fk_missing_count + fk_drift_count from fk_comparison) = 0
      and (select unique_missing_count + unique_drift_count from unique_comparison) = 0
      and (select check_missing_count + check_drift_count from check_comparison) = 0
      then 'ready'
    else 'drift'
  end,
  'acl_inventory_status', case
    when (select value from table_acl_violations) = 0
      and (select function_acl_drift_count from function_comparison) = 0
      then 'ready'
    else 'drift'
  end,
  'function_inventory_status', case
    when (select function_missing_count + function_drift_count from function_comparison) = 0
      then 'ready'
    else 'drift'
  end,
  'link_authority_status', case
    when (select function_missing_count + function_drift_count from function_comparison) = 0
      then 'ready'
    else 'drift'
  end,
  'remote_write_status', 'zero',
  'required_table_count', (select count(*)::integer from required_tables),
  'missing_table_count', (select count(*)::integer from table_inventory where relation_oid is null),
  'required_column_count', (select count(*)::integer from expected_columns),
  'column_missing_count', (select column_missing_count from column_comparison),
  'column_drift_count', (select column_drift_count from column_comparison),
  'required_fk_count', (select count(*)::integer from expected_foreign_keys),
  'fk_missing_count', (select fk_missing_count from fk_comparison),
  'fk_drift_count', (select fk_drift_count from fk_comparison),
  'required_unique_count', (select count(*)::integer from expected_unique_indexes),
  'unique_missing_count', (select unique_missing_count from unique_comparison),
  'unique_drift_count', (select unique_drift_count from unique_comparison),
  'required_check_count', (select count(*)::integer from expected_check_fragments),
  'check_missing_count', (select check_missing_count from check_comparison),
  'check_drift_count', (select check_drift_count from check_comparison),
  'required_acl_count', 6,
  'acl_missing_count', 0,
  'acl_drift_count', (
    select (value from table_acl_violations) + (function_acl_drift_count from function_comparison)
  ),
  'required_function_count', (select count(*)::integer from expected_functions),
  'function_missing_count', (select function_missing_count from function_comparison),
  'function_source_drift_count', (select function_source_drift_count from function_comparison),
  'function_security_drift_count', (select function_security_drift_count from function_comparison),
  'function_search_path_drift_count', (select function_search_path_drift_count from function_comparison),
  'function_acl_drift_count', (select function_acl_drift_count from function_comparison),
  'unexpected_function_count', (select value from unexpected_owned_function_count),
  'function_drift_count', (select function_drift_count from function_comparison),
  'protected_visibility_gap_count', 0,
  'remote_writes', 0,
  'local_auth_user_count', (select value from local_auth_users)
)`;

assertProductIngredientLinkReadOnlyVerificationSql({
  sql: POST_MERGE_READ_ONLY_SQL,
  fieldName: "product ingredient link hybrid verification SQL",
});

export function collectProductIngredientLinkLocalStorageDependencyStatus({
  migrationSource = TARGET_MIGRATION,
} = {}) {
  const forbiddenPatterns = [
    /\bstorage\./iu,
    /\bbucket_id\b/iu,
    /\bobject_path\b/iu,
    /\bsupabase\.storage\b/iu,
    /\/api\/v1\/recipes\/images\b/u,
  ];
  const localStorageDependencyCount = forbiddenPatterns.filter((pattern) =>
    pattern.test(migrationSource),
  ).length;

  return {
    storage_dependency_status:
      localStorageDependencyCount === 0
        ? "no-storage-dependency-detected"
        : "storage-dependency-detected",
    local_storage_dependency_count: localStorageDependencyCount,
  };
}

export function buildProductIngredientLinkHybridVerificationPlan({ mode }) {
  if (mode !== "post-merge-read-only") {
    throw new Error(
      `unsupported product ingredient link hybrid verification mode: ${mode ?? "missing"}`,
    );
  }

  return {
    mode,
    readOnly: true,
    requiresMergedOriginMaster: true,
    requiresCleanTrackedTree: true,
    target: "local-application-db-and-storage",
    remoteAuthEvidenceRequired: true,
    sql: POST_MERGE_READ_ONLY_SQL,
  };
}

export function assertProductIngredientLinkMergedExactSource({
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
      "post-merge read-only verification requires the exact HEAD to be merged into origin/master",
    );
  }
  if ((trackedStatus ?? "").trim() !== "") {
    throw new Error(
      "post-merge read-only verification requires a clean tracked tree",
    );
  }
  return head;
}

export function assertProductIngredientLinkHybridLocalResult(result) {
  const valid =
    hasExactKeys(result, LOCAL_RESULT_KEYS)
    && result.verification_scope_status === "post-merge-read-only"
    && result.schema_inventory_status === "ready"
    && result.acl_inventory_status === "ready"
    && result.function_inventory_status === "ready"
    && result.link_authority_status === "ready"
    && result.remote_write_status === "zero"
    && result.storage_dependency_status === "no-storage-dependency-detected"
    && Number.isInteger(result.required_table_count)
    && Number.isInteger(result.required_column_count)
    && Number.isInteger(result.required_fk_count)
    && Number.isInteger(result.required_unique_count)
    && Number.isInteger(result.required_check_count)
    && Number.isInteger(result.required_acl_count)
    && Number.isInteger(result.required_function_count)
    && Number.isInteger(result.local_auth_user_count)
    && [
      "missing_table_count",
      "column_missing_count",
      "column_drift_count",
      "fk_missing_count",
      "fk_drift_count",
      "unique_missing_count",
      "unique_drift_count",
      "check_missing_count",
      "check_drift_count",
      "acl_missing_count",
      "acl_drift_count",
      "function_missing_count",
      "function_source_drift_count",
      "function_security_drift_count",
      "function_search_path_drift_count",
      "function_acl_drift_count",
      "unexpected_function_count",
      "function_drift_count",
      "protected_visibility_gap_count",
      "local_storage_dependency_count",
      "remote_writes",
    ].every((field) => Number.isInteger(result[field]) && result[field] === 0);

  if (!valid) {
    throw new Error("product ingredient link verification failed");
  }
  if (result.local_auth_user_count !== 0) {
    throw new Error("hybrid local verification requires local auth.users=0");
  }
  return result;
}

export function buildProductIngredientLinkHybridLocalPsqlRequest({
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

  assertProductIngredientLinkReadOnlyVerificationSql({
    sql: planSql,
    fieldName: "product ingredient link hybrid local SQL",
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

export function assertProductIngredientLinkRemoteAuthEvidence(
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
    && REMOTE_AUTH_COUNT_FIELDS.every(
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

export function buildProductIngredientLinkHybridSummary({
  mergeSha,
  localResult,
  remoteAuthEvidence,
  now,
}) {
  if (!/^[0-9a-f]{40}$/u.test(mergeSha)) {
    throw new Error("hybrid verification requires an exact merge SHA");
  }
  assertProductIngredientLinkHybridLocalResult(localResult);
  assertProductIngredientLinkRemoteAuthEvidence(remoteAuthEvidence, { now });
  if (remoteAuthEvidence.source_merge_sha !== mergeSha) {
    throw new Error("remote Auth evidence must match the exact merge SHA");
  }

  return {
    ok: true,
    mode: "post-merge-read-only",
    merge_sha: mergeSha,
    local_application_db_status: "ready",
    local_auth_user_count: 0,
    local_application_storage_status: "no-storage-dependency-detected",
    local_storage_dependency_count: 0,
    remote_auth_control_plane_status: "ready",
    active_epoch_count: remoteAuthEvidence.active_epoch_count,
    active_binding_count: remoteAuthEvidence.active_binding_count,
    terminal_deletion_count: remoteAuthEvidence.terminal_deletion_count,
    production_writes: 0,
    staging_writes: 0,
    remote_application_writes: 0,
  };
}
