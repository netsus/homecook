import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const REQUIRED_DATABASE_VARIABLES = [
  "PGDATABASE",
  "PGHOST",
  "PGPASSWORD",
  "PGPORT",
  "PGUSER",
];

const SAFE_ENVIRONMENT_KEYS = ["PATH", "LANG", "LC_ALL", "HOME"];

const ALLOWED_RESULT_KEYS = [
  "verification_scope_status",
  "schema_inventory_status",
  "acl_inventory_status",
  "function_inventory_status",
  "legacy_session_report_status",
  "content_authority_status",
  "compatibility_telemetry_status",
  "remote_write_status",
  "required_table_count",
  "missing_table_count",
  "required_column_count",
  "column_missing_count",
  "column_drift_count",
  "required_fk_count",
  "fk_missing_count",
  "fk_drift_count",
  "required_unique_count",
  "unique_missing_count",
  "unique_drift_count",
  "required_check_count",
  "check_missing_count",
  "check_drift_count",
  "required_trigger_count",
  "trigger_missing_count",
  "trigger_drift_count",
  "required_acl_count",
  "acl_missing_count",
  "acl_drift_count",
  "required_function_count",
  "function_missing_count",
  "function_source_drift_count",
  "function_security_drift_count",
  "function_search_path_drift_count",
  "function_acl_drift_count",
  "unexpected_function_count",
  "function_drift_count",
  "orphan_legacy_session_count",
  "mixed_legacy_session_count",
  "content_direct_mismatch_count",
  "backfill_gap_count",
  "compatibility_direct_only_write_count",
  "compatibility_pair_mismatch_count",
  "remote_writes",
];

const STATUS_FIELDS = {
  verification_scope_status: "post-merge-read-only",
  schema_inventory_status: "ready",
  acl_inventory_status: "ready",
  function_inventory_status: "ready",
  legacy_session_report_status: "report-only",
  content_authority_status: "report-only",
  compatibility_telemetry_status: "report-only",
  remote_write_status: "zero",
};

const COUNT_FIELDS = [
  "required_table_count",
  "missing_table_count",
  "required_column_count",
  "column_missing_count",
  "column_drift_count",
  "required_fk_count",
  "fk_missing_count",
  "fk_drift_count",
  "required_unique_count",
  "unique_missing_count",
  "unique_drift_count",
  "required_check_count",
  "check_missing_count",
  "check_drift_count",
  "required_trigger_count",
  "trigger_missing_count",
  "trigger_drift_count",
  "required_acl_count",
  "acl_missing_count",
  "acl_drift_count",
  "required_function_count",
  "function_missing_count",
  "function_source_drift_count",
  "function_security_drift_count",
  "function_search_path_drift_count",
  "function_acl_drift_count",
  "unexpected_function_count",
  "function_drift_count",
  "orphan_legacy_session_count",
  "mixed_legacy_session_count",
  "content_direct_mismatch_count",
  "backfill_gap_count",
  "compatibility_direct_only_write_count",
  "compatibility_pair_mismatch_count",
  "remote_writes",
];

const MUTATING_SQL_KEYWORD_PATTERN =
  /\b(?:insert|update|delete|truncate|alter|create|drop|grant|revoke|call|do|merge|copy|vacuum|reindex|refresh|execute|perform)\b/iu;
const PSQL_META_COMMAND_PATTERN = /(^|[\r\n])\s*\\[^\s]/u;

function hasOnlyAllowedKeys(result) {
  const actualKeys = Object.keys(result).sort();
  const expectedKeys = [...ALLOWED_RESULT_KEYS].sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index]);
}

export function assertRecipeSnapshotAuthorityReadOnlyVerificationSql({
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
const SECURITY_MANIFEST = JSON.parse(
  readFileSync(
    path.join(
      REPOSITORY_ROOT,
      "docs/security/recipe-snapshot-authority-security-function-authorization-manifest.json",
    ),
    "utf8",
  ),
);
const TARGET_MIGRATION = readFileSync(
  path.join(
    REPOSITORY_ROOT,
    "supabase/migrations/20260729170500_recipe_snapshot_authority_foundation.sql",
  ),
  "utf8",
);

function readMigrationFunctionSource(signature) {
  const qualifiedName = signature.slice(0, signature.indexOf("("));
  const functionStart = TARGET_MIGRATION.indexOf(
    `create or replace function ${qualifiedName}`,
  );
  if (functionStart < 0) {
    throw new Error(`recipe snapshot migration function is missing: ${signature}`);
  }
  const bodyStartMarker = "as $$";
  const bodyStart = TARGET_MIGRATION.indexOf(bodyStartMarker, functionStart);
  const bodyEnd = TARGET_MIGRATION.indexOf("\n$$;", bodyStart);
  if (bodyStart < 0 || bodyEnd < 0) {
    throw new Error(`recipe snapshot migration function body is missing: ${signature}`);
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
      entry.signature.slice(
        "public.".length,
        entry.signature.indexOf("("),
      )),
  ),
].map((functionName) => [functionName]);

const EXPECTED_COLUMN_ROWS = [
  ["public.recipe_nutrition_snapshots", "owner_user_id", "uuid", "false"],
  ["public.recipe_content_snapshots", "id", "uuid", "true"],
  ["public.recipe_content_snapshots", "owner_user_id", "uuid", "false"],
  ["public.recipe_content_snapshots", "recipe_id", "uuid", "true"],
  ["public.recipe_content_snapshots", "recipe_nutrition_snapshot_id", "uuid", "false"],
  ["public.recipe_content_snapshots", "title", "character varying(200)", "true"],
  ["public.recipe_content_snapshots", "base_servings", "numeric(8,2)", "true"],
  ["public.recipe_content_snapshots", "ingredients_json", "jsonb", "true"],
  ["public.recipe_content_snapshots", "steps_json", "jsonb", "true"],
  ["public.recipe_content_snapshots", "content_hash", "text", "true"],
  ["public.recipe_content_snapshots", "schema_version", "integer", "true"],
  ["public.recipe_content_snapshots", "created_at", "timestamp with time zone", "true"],
  ["public.meals", "recipe_content_snapshot_id", "uuid", "false"],
  ["public.meals", "recipe_content_snapshot_origin", "character varying(20)", "false"],
  ["public.meals", "revision", "bigint", "true"],
  ["public.leftover_dishes", "recipe_content_snapshot_id", "uuid", "false"],
  ["public.cooking_sessions", "contract_version", "character varying(20)", "true"],
  ["public.cooking_sessions", "session_kind", "character varying(20)", "false"],
  ["public.cooking_sessions", "recipe_id", "uuid", "false"],
  ["public.cooking_sessions", "recipe_content_snapshot_id", "uuid", "false"],
  ["public.cooking_sessions", "cooking_servings", "integer", "false"],
  ["public.cooking_sessions", "base_recipe_revision", "bigint", "false"],
  ["public.cooking_session_meals", "meal_revision_snapshot", "bigint", "false"],
  ["public.cooking_session_meal_claims", "meal_id", "uuid", "true"],
  ["public.cooking_session_meal_claims", "session_id", "uuid", "true"],
  ["public.cooking_session_meal_claims", "owner_user_id", "uuid", "true"],
  ["public.cooking_session_meal_claims", "claimed_at", "timestamp with time zone", "true"],
];

const EXPECTED_FK_ROWS = [
  ["public.recipe_content_snapshots", "recipe_content_snapshots_recipe_id_fkey", "recipe_id", "public.recipes", "r"],
  ["public.recipe_content_snapshots", "recipe_content_snapshots_recipe_nutrition_snapshot_id_fkey", "recipe_nutrition_snapshot_id", "public.recipe_nutrition_snapshots", "r"],
  ["public.meals", "meals_recipe_content_snapshot_id_fkey", "recipe_content_snapshot_id", "public.recipe_content_snapshots", "r"],
  ["public.leftover_dishes", "leftover_dishes_recipe_content_snapshot_id_fkey", "recipe_content_snapshot_id", "public.recipe_content_snapshots", "r"],
  ["public.cooking_sessions", "cooking_sessions_recipe_id_fkey", "recipe_id", "public.recipes", "r"],
  ["public.cooking_sessions", "cooking_sessions_recipe_content_snapshot_id_fkey", "recipe_content_snapshot_id", "public.recipe_content_snapshots", "r"],
  ["public.cooking_session_meal_claims", "cooking_session_meal_claims_meal_id_fkey", "meal_id", "public.meals", "c"],
  ["public.cooking_session_meal_claims", "cooking_session_meal_claims_session_id_fkey", "session_id", "public.cooking_sessions", "c"],
  ["public.cooking_session_meal_claims", "cooking_session_meal_claims_owner_user_id_fkey", "owner_user_id", "public.users", "c"],
];

const EXPECTED_CHECK_ROWS = [
  ["public.recipe_content_snapshots", "recipe_content_snapshots_base_servings_check", "base_servings|> 0"],
  ["public.recipe_content_snapshots", "recipe_content_snapshots_ingredients_json_check", "jsonb_typeof(ingredients_json)|array"],
  ["public.recipe_content_snapshots", "recipe_content_snapshots_steps_json_check", "jsonb_typeof(steps_json)|array"],
  ["public.recipe_content_snapshots", "recipe_content_snapshots_schema_version_check", "schema_version|> 0"],
  ["public.meals", "meals_recipe_content_snapshot_origin_check", "recipe_content_snapshot_id|recipe_content_snapshot_origin|created|legacy_backfill"],
  ["public.cooking_sessions", "cooking_sessions_contract_version_check", "contract_version|legacy_v1|snapshot_v2"],
  ["public.cooking_sessions", "cooking_sessions_snapshot_v2_shape_check", "session_kind|recipe_id|recipe_content_snapshot_id|cooking_servings|base_recipe_revision|planner|standalone"],
];

const EXPECTED_TRIGGER_ROWS = [
  ["public.recipe_nutrition_snapshots", "recipe_nutrition_snapshot_validate_ownership", "public.validate_recipe_nutrition_snapshot_ownership()", "false", "false"],
  ["public.recipe_content_snapshots", "recipe_content_snapshot_validate_ownership", "public.validate_recipe_content_snapshot_ownership()", "false", "false"],
  ["public.recipe_content_snapshots", "recipe_content_snapshot_immutable_guard", "public.prevent_recipe_content_snapshot_mutation()", "false", "false"],
  ["public.meals", "meals_revision_server_guard", "public.bump_meal_revision()", "false", "false"],
  ["public.meals", "recipe_content_snapshot_mirror", "public.recipe_content_snapshot_mirror()", "false", "false"],
  ["public.meals", "protect_meal_recipe_content_pin", "public.protect_meal_recipe_content_pin()", "false", "false"],
  ["public.cooking_sessions", "cooking_session_snapshot_v2_immutable_mutation_guard", "public.protect_cooking_session_snapshot_v2_mutation()", "false", "false"],
  ["public.cooking_sessions", "validate_cooking_session_snapshot_v2_on_session", "public.validate_cooking_session_snapshot_v2_association()", "true", "true"],
  ["public.cooking_session_meals", "validate_cooking_session_snapshot_v2_on_session_meal", "public.validate_cooking_session_snapshot_v2_association()", "true", "true"],
  ["public.cooking_session_meal_claims", "cooking_session_meal_claim_validate", "public.validate_cooking_session_meal_claim()", "false", "false"],
];

const EXACT_OWNED_COLUMN_TABLE_ROWS = [
  ["public.recipe_content_snapshots"],
  ["public.cooking_session_meal_claims"],
];

const EXACT_OWNED_FK_TABLE_ROWS = [
  ["public.recipe_content_snapshots"],
  ["public.cooking_session_meal_claims"],
];

const EXACT_OWNED_UNIQUE_TABLE_ROWS = [
  ["public.recipe_content_snapshots"],
  ["public.cooking_session_meal_claims"],
];

const EXACT_OWNED_CHECK_TABLE_ROWS = [
  ["public.recipe_content_snapshots"],
];

const EXACT_OWNED_TRIGGER_TABLE_ROWS = [
  ["public.recipe_content_snapshots"],
  ["public.cooking_session_meal_claims"],
];

const POST_MERGE_READ_ONLY_SQL = String.raw`
with required_tables(relation_name) as (
  values
    ('public.recipe_nutrition_snapshots'),
    ('public.recipe_content_snapshots'),
    ('public.meals'),
    ('public.cooking_sessions'),
    ('public.cooking_session_meals'),
    ('public.cooking_session_meal_claims'),
    ('public.leftover_dishes'),
    ('public.mutation_idempotency_keys')
), expected_columns(relation_name, column_name, type_name, not_null) as (
  values
${renderSqlRows(EXPECTED_COLUMN_ROWS)}
), expected_foreign_keys(
  relation_name,
  constraint_name,
  column_name,
  referenced_relation,
  delete_action
) as (
  values
${renderSqlRows(EXPECTED_FK_ROWS)}
), expected_unique_indexes(relation_name, inventory_key) as (
  values
    ('public.recipe_content_snapshots', 'content_primary_key'),
    ('public.recipe_content_snapshots', 'content_dedupe_key'),
    ('public.cooking_session_meal_claims', 'claim_primary_key')
), expected_checks(relation_name, constraint_name, required_fragments) as (
  values
${renderSqlRows(EXPECTED_CHECK_ROWS)}
), expected_triggers(
  relation_name,
  trigger_name,
  function_signature,
  expected_deferrable,
  expected_initially_deferred
) as (
  values
${renderSqlRows(EXPECTED_TRIGGER_ROWS)}
), expected_functions(signature, source_hash, security_definer, service_role_execute) as (
  values
${renderSqlRows(EXPECTED_FUNCTION_ROWS)}
), exact_owned_function_names(function_name) as (
  values
${renderSqlRows(EXACT_OWNED_FUNCTION_NAME_ROWS)}
), exact_owned_column_tables(relation_name) as (
  values
${renderSqlRows(EXACT_OWNED_COLUMN_TABLE_ROWS)}
), exact_owned_fk_tables(relation_name) as (
  values
${renderSqlRows(EXACT_OWNED_FK_TABLE_ROWS)}
), exact_owned_unique_tables(relation_name) as (
  values
${renderSqlRows(EXACT_OWNED_UNIQUE_TABLE_ROWS)}
), exact_owned_check_tables(relation_name) as (
  values
${renderSqlRows(EXACT_OWNED_CHECK_TABLE_ROWS)}
), exact_owned_trigger_tables(relation_name) as (
  values
${renderSqlRows(EXACT_OWNED_TRIGGER_TABLE_ROWS)}
), table_inventory as (
  select
    required.relation_name,
    pg_catalog.to_regclass(required.relation_name) as relation_oid
  from required_tables as required
), column_inventory as (
  select
    namespace.nspname || '.' || relation.relname as relation_name,
    attribute.attname as column_name,
    pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) as type_name,
    attribute.attnotnull as not_null
  from table_inventory
  join pg_catalog.pg_class as relation
    on relation.oid = table_inventory.relation_oid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  join pg_catalog.pg_attribute as attribute
    on attribute.attrelid = relation.oid
  where attribute.attnum > 0
    and not attribute.attisdropped
), unexpected_owned_columns as (
  select
    actual.relation_name,
    actual.column_name
  from column_inventory as actual
  join exact_owned_column_tables as exact_owned
    on exact_owned.relation_name = actual.relation_name
  left join expected_columns as expected_column
    on expected_column.relation_name = actual.relation_name
   and expected_column.column_name = actual.column_name
  where expected_column.relation_name is null
), unexpected_owned_column_count as (
  select count(*)::integer as value
  from unexpected_owned_columns
), column_comparison as (
  select
    count(*) filter (where actual.column_name is null)::integer as column_missing_count,
    (
      count(*) filter (
        where actual.column_name is not null
          and (
            actual.type_name is distinct from expected.type_name
            or actual.not_null is distinct from expected.not_null::boolean
          )
      ) + (select value from unexpected_owned_column_count)
    )::integer as column_drift_count
  from expected_columns as expected
  left join column_inventory as actual
    on actual.relation_name = expected.relation_name
   and actual.column_name = expected.column_name
), fk_inventory as (
  select
    namespace.nspname || '.' || relation.relname as relation_name,
    constraint_row.conname as constraint_name,
    pg_catalog.pg_get_constraintdef(constraint_row.oid, true) as definition
  from pg_catalog.pg_constraint as constraint_row
  join pg_catalog.pg_class as relation
    on relation.oid = constraint_row.conrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  join table_inventory
    on table_inventory.relation_oid = relation.oid
  where constraint_row.contype = 'f'
), unexpected_owned_foreign_keys as (
  select
    actual_fk.relation_name,
    actual_fk.constraint_name
  from (
    select
      namespace.nspname || '.' || relation.relname as relation_name,
      constraint_row.conname as constraint_name
    from pg_catalog.pg_constraint as constraint_row
    join pg_catalog.pg_class as relation
      on relation.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where constraint_row.contype = 'f'
  ) as actual_fk
  join exact_owned_fk_tables as exact_owned
    on exact_owned.relation_name = actual_fk.relation_name
  left join expected_foreign_keys as expected_fk
    on expected_fk.relation_name = actual_fk.relation_name
   and expected_fk.constraint_name = actual_fk.constraint_name
  where expected_fk.relation_name is null
), unexpected_owned_fk_count as (
  select count(*)::integer as value
  from unexpected_owned_foreign_keys
), fk_comparison as (
  select
    count(*) filter (where actual.constraint_name is null)::integer as fk_missing_count,
    (
      count(*) filter (
        where actual.constraint_name is not null
          and (
            actual.column_name is distinct from expected.column_name
            or actual.referenced_relation is distinct from expected.referenced_relation
            or actual.delete_action is distinct from expected.delete_action::"char"
          )
      ) + (select value from unexpected_owned_fk_count)
    )::integer as fk_drift_count
  from expected_foreign_keys as expected
  left join (
    select
      namespace.nspname || '.' || relation.relname as relation_name,
      constraint_row.conname as constraint_name,
      attribute.attname as column_name,
      referenced_namespace.nspname || '.' || referenced_relation.relname
        as referenced_relation,
      constraint_row.confdeltype as delete_action
    from pg_catalog.pg_constraint as constraint_row
    join pg_catalog.pg_class as relation
      on relation.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    join pg_catalog.pg_attribute as attribute
      on attribute.attrelid = relation.oid
     and attribute.attnum = constraint_row.conkey[1]
    join pg_catalog.pg_class as referenced_relation
      on referenced_relation.oid = constraint_row.confrelid
    join pg_catalog.pg_namespace as referenced_namespace
      on referenced_namespace.oid = referenced_relation.relnamespace
    where constraint_row.contype = 'f'
  ) as actual
    on actual.relation_name = expected.relation_name
   and actual.constraint_name = expected.constraint_name
), unique_inventory as (
  select
    namespace.nspname || '.' || relation.relname as relation_name,
    index_class.relname as index_name,
    pg_catalog.pg_get_indexdef(index_row.indexrelid) as definition,
    index_row.indnkeyatts as key_count,
    index_row.indnullsnotdistinct as nulls_not_distinct,
    array(
      select pg_catalog.pg_get_indexdef(
        index_row.indexrelid,
        key_position,
        true
      )
      from generate_series(1, index_row.indnkeyatts) as key_position
      order by key_position
    ) as key_columns
  from pg_catalog.pg_index as index_row
  join pg_catalog.pg_class as relation
    on relation.oid = index_row.indrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  join pg_catalog.pg_class as index_class
    on index_class.oid = index_row.indexrelid
  join table_inventory
    on table_inventory.relation_oid = relation.oid
  where index_row.indisunique
), unique_inventory_tagged as (
  select
    relation_name,
    index_name,
    definition,
    case
      when relation_name = 'public.recipe_content_snapshots'
        and key_count = 1
        and key_columns = array['id']
        and nulls_not_distinct is false
        then 'content_primary_key'
      when relation_name = 'public.recipe_content_snapshots'
        and key_count = 4
        and key_columns = array[
          'recipe_id',
          'content_hash',
          'recipe_nutrition_snapshot_id',
          'schema_version'
        ]
        and nulls_not_distinct is true
        then 'content_dedupe_key'
      when relation_name = 'public.cooking_session_meal_claims'
        and key_count = 1
        and key_columns = array['meal_id']
        and nulls_not_distinct is false
        then 'claim_primary_key'
      else null
    end as inventory_key
  from unique_inventory
), unexpected_owned_unique_indexes as (
  select
    actual_unique.relation_name,
    actual_unique.index_name
  from unique_inventory_tagged as actual_unique
  join exact_owned_unique_tables as exact_owned
    on exact_owned.relation_name = actual_unique.relation_name
  left join expected_unique_indexes as expected_unique
    on expected_unique.relation_name = actual_unique.relation_name
   and expected_unique.inventory_key = actual_unique.inventory_key
  where expected_unique.relation_name is null
), unexpected_owned_unique_count as (
  select count(*)::integer as value
  from unexpected_owned_unique_indexes
), unique_comparison as (
  select
    count(*) filter (where actual.inventory_key is null)::integer as unique_missing_count,
    (
      count(*) filter (
        where actual.inventory_key is not null
          and actual.relation_name is distinct from expected.relation_name
      ) + (select value from unexpected_owned_unique_count)
    )::integer as unique_drift_count
  from expected_unique_indexes as expected
  left join unique_inventory_tagged as actual
    on actual.relation_name = expected.relation_name
   and actual.inventory_key = expected.inventory_key
), check_inventory as (
  select
    namespace.nspname || '.' || relation.relname as relation_name,
    constraint_row.conname as constraint_name,
    pg_catalog.pg_get_constraintdef(constraint_row.oid, true) as definition
  from pg_catalog.pg_constraint as constraint_row
  join pg_catalog.pg_class as relation
    on relation.oid = constraint_row.conrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  join table_inventory
    on table_inventory.relation_oid = relation.oid
  where constraint_row.contype = 'c'
), unexpected_owned_checks as (
  select
    actual_check.relation_name,
    actual_check.constraint_name
  from check_inventory as actual_check
  join exact_owned_check_tables as exact_owned
    on exact_owned.relation_name = actual_check.relation_name
  left join expected_checks as expected_check
    on expected_check.relation_name = actual_check.relation_name
   and expected_check.constraint_name = actual_check.constraint_name
  where expected_check.relation_name is null
), unexpected_owned_check_count as (
  select count(*)::integer as value
  from unexpected_owned_checks
), check_comparison as (
  select
    count(*) filter (where actual.constraint_name is null)::integer as check_missing_count,
    (
      count(*) filter (
        where actual.constraint_name is not null
          and exists (
            select 1
            from unnest(
              string_to_array(expected.required_fragments, '|')
            ) as required_fragment
            where position(
              lower(required_fragment)
              in lower(actual.definition)
            ) = 0
          )
      ) + (select value from unexpected_owned_check_count)
    )::integer as check_drift_count
  from expected_checks as expected
  left join check_inventory as actual
    on actual.relation_name = expected.relation_name
   and actual.constraint_name = expected.constraint_name
), trigger_inventory as (
  select
    namespace.nspname || '.' || relation.relname as relation_name,
    trigger_row.tgname as trigger_name,
    pg_catalog.pg_get_triggerdef(trigger_row.oid, true) as definition,
    trigger_row.tgfoid as function_oid,
    trigger_row.tgdeferrable as is_deferrable,
    trigger_row.tginitdeferred as is_initially_deferred
  from pg_catalog.pg_trigger as trigger_row
  join pg_catalog.pg_class as relation
    on relation.oid = trigger_row.tgrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  join table_inventory
    on table_inventory.relation_oid = relation.oid
  where not trigger_row.tgisinternal
), unexpected_owned_triggers as (
  select
    actual_trigger.relation_name,
    actual_trigger.trigger_name
  from trigger_inventory as actual_trigger
  join exact_owned_trigger_tables as exact_owned
    on exact_owned.relation_name = actual_trigger.relation_name
  left join expected_triggers as expected_trigger
    on expected_trigger.relation_name = actual_trigger.relation_name
   and expected_trigger.trigger_name = actual_trigger.trigger_name
  where expected_trigger.relation_name is null
), unexpected_owned_trigger_count as (
  select count(*)::integer as value
  from unexpected_owned_triggers
), trigger_comparison as (
  select
    count(*) filter (where actual.trigger_name is null)::integer as trigger_missing_count,
    (
      count(*) filter (
        where actual.trigger_name is not null
          and (
            actual.function_oid is distinct from
              pg_catalog.to_regprocedure(expected.function_signature)
            or actual.is_deferrable is distinct from
              expected.expected_deferrable::boolean
            or actual.is_initially_deferred is distinct from
              expected.expected_initially_deferred::boolean
          )
      ) + (select value from unexpected_owned_trigger_count)
    )::integer as trigger_drift_count
  from expected_triggers as expected
  left join trigger_inventory as actual
    on actual.relation_name = expected.relation_name
   and actual.trigger_name = expected.trigger_name
), acl_matrix as (
  select
    acl.role_name,
    acl.relation_name,
    acl.privilege_name,
    pg_catalog.has_table_privilege(
      acl.role_name,
      acl.relation_name,
      acl.privilege_name
    ) as granted
  from (
    values
      ('anon', 'public.recipe_nutrition_snapshots', 'IN' || 'SERT'),
      ('anon', 'public.recipe_nutrition_snapshots', 'UP' || 'DATE'),
      ('anon', 'public.recipe_nutrition_snapshots', 'DE' || 'LETE'),
      ('authenticated', 'public.recipe_nutrition_snapshots', 'IN' || 'SERT'),
      ('authenticated', 'public.recipe_nutrition_snapshots', 'UP' || 'DATE'),
      ('authenticated', 'public.recipe_nutrition_snapshots', 'DE' || 'LETE'),
      ('service_role', 'public.recipe_nutrition_snapshots', 'IN' || 'SERT'),
      ('service_role', 'public.recipe_nutrition_snapshots', 'UP' || 'DATE'),
      ('service_role', 'public.recipe_nutrition_snapshots', 'DE' || 'LETE'),
      ('anon', 'public.recipe_content_snapshots', 'IN' || 'SERT'),
      ('anon', 'public.recipe_content_snapshots', 'UP' || 'DATE'),
      ('anon', 'public.recipe_content_snapshots', 'DE' || 'LETE'),
      ('authenticated', 'public.recipe_content_snapshots', 'IN' || 'SERT'),
      ('authenticated', 'public.recipe_content_snapshots', 'UP' || 'DATE'),
      ('authenticated', 'public.recipe_content_snapshots', 'DE' || 'LETE'),
      ('service_role', 'public.recipe_content_snapshots', 'IN' || 'SERT'),
      ('service_role', 'public.recipe_content_snapshots', 'UP' || 'DATE'),
      ('service_role', 'public.recipe_content_snapshots', 'DE' || 'LETE'),
      ('anon', 'public.cooking_session_meal_claims', 'IN' || 'SERT'),
      ('anon', 'public.cooking_session_meal_claims', 'UP' || 'DATE'),
      ('anon', 'public.cooking_session_meal_claims', 'DE' || 'LETE'),
      ('authenticated', 'public.cooking_session_meal_claims', 'IN' || 'SERT'),
      ('authenticated', 'public.cooking_session_meal_claims', 'UP' || 'DATE'),
      ('authenticated', 'public.cooking_session_meal_claims', 'DE' || 'LETE'),
      ('service_role', 'public.cooking_session_meal_claims', 'IN' || 'SERT'),
      ('service_role', 'public.cooking_session_meal_claims', 'UP' || 'DATE'),
      ('service_role', 'public.cooking_session_meal_claims', 'DE' || 'LETE')
  ) as acl(role_name, relation_name, privilege_name)
), acl_violation_counts as (
  select
    count(*) filter (
      where relation_name in (
        'public.recipe_nutrition_snapshots',
        'public.recipe_content_snapshots'
      )
      and granted
    )::integer as snapshot_mutation_grant_count,
    count(*) filter (
      where relation_name = 'public.cooking_session_meal_claims'
        and granted
    )::integer as claim_mutation_grant_count
  from acl_matrix
), actual_owned_functions as (
  select
    namespace.nspname || '.' || procedure_row.proname || '('
      || pg_catalog.oidvectortypes(procedure_row.proargtypes) || ')'
      as signature
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
      ) + (select value from unexpected_owned_function_count)
    )::integer as function_drift_count
  from function_inventory
), legacy_session_summary as (
  select
    count(*) filter (
      where session_row.contract_version = 'legacy_v1'
        and meal_summary.meal_count = 0
    )::integer as orphan_legacy_session_count,
    count(*) filter (
      where session_row.contract_version = 'legacy_v1'
        and (
          meal_summary.recipe_count > 1
          or meal_summary.servings_count > 1
        )
    )::integer as mixed_legacy_session_count
  from public.cooking_sessions as session_row
  left join (
    select
      session_meal.session_id,
      count(*)::integer as meal_count,
      count(distinct session_meal.recipe_id)::integer as recipe_count,
      count(distinct session_meal.cooking_servings)::integer as servings_count
    from public.cooking_session_meals as session_meal
    group by session_meal.session_id
  ) as meal_summary
    on meal_summary.session_id = session_row.id
), content_authority_summary as (
  select
    count(*) filter (
      where meal.recipe_content_snapshot_id is not null
        and meal.recipe_nutrition_snapshot_id is not null
        and meal.recipe_nutrition_snapshot_id
          is distinct from content_snapshot.recipe_nutrition_snapshot_id
    )::integer as content_direct_mismatch_count,
    count(*) filter (
      where meal.status in ('registered', 'shopping_done')
        and meal.recipe_content_snapshot_id is null
    )::integer as backfill_gap_count
  from public.meals as meal
  left join public.recipe_content_snapshots as content_snapshot
    on content_snapshot.id = meal.recipe_content_snapshot_id
), compatibility_telemetry_summary as (
  select
    count(*) filter (
      where meal.recipe_content_snapshot_id is null
        and meal.recipe_nutrition_snapshot_id is not null
        and meal.nutrition_snapshot_origin = 'created'
    )::integer as compatibility_direct_only_write_count,
    count(*) filter (
      where meal.recipe_content_snapshot_id is not null
        and meal.recipe_nutrition_snapshot_id is not null
        and meal.recipe_nutrition_snapshot_id is distinct from content_snapshot.recipe_nutrition_snapshot_id
    )::integer as compatibility_pair_mismatch_count
  from public.meals as meal
  left join public.recipe_content_snapshots as content_snapshot
    on content_snapshot.id = meal.recipe_content_snapshot_id
)
select jsonb_build_object(
  'verification_scope_status', 'post-' || 'mer' || 'ge-read-only',
  'schema_inventory_status', case
    when (select count(*) from table_inventory where relation_oid is null) = 0
      and (select column_missing_count + column_drift_count from column_comparison) = 0
      and (select fk_missing_count + fk_drift_count from fk_comparison) = 0
      and (select unique_missing_count + unique_drift_count from unique_comparison) = 0
      and (select check_missing_count + check_drift_count from check_comparison) = 0
      and (select trigger_missing_count + trigger_drift_count from trigger_comparison) = 0
      then 'ready'
    else 'drift'
  end,
  'acl_inventory_status', case
    when (select snapshot_mutation_grant_count from acl_violation_counts) = 0
      and (select claim_mutation_grant_count from acl_violation_counts) = 0 then 'ready'
    else 'drift'
  end,
  'function_inventory_status', case
    when (select function_missing_count + function_drift_count from function_comparison) = 0
      then 'ready'
    else 'drift'
  end,
  'legacy_session_report_status', 'report-only',
  'content_authority_status', 'report-only',
  'compatibility_telemetry_status', 'report-only',
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
  'required_check_count', (select count(*)::integer from expected_checks),
  'check_missing_count', (select check_missing_count from check_comparison),
  'check_drift_count', (select check_drift_count from check_comparison),
  'required_trigger_count', (select count(*)::integer from expected_triggers),
  'trigger_missing_count', (select trigger_missing_count from trigger_comparison),
  'trigger_drift_count', (select trigger_drift_count from trigger_comparison),
  'required_acl_count', (select count(*)::integer from acl_matrix),
  'acl_missing_count', 0,
  'acl_drift_count', (
    select snapshot_mutation_grant_count + claim_mutation_grant_count
    from acl_violation_counts
  ),
  'required_function_count', (select count(*)::integer from expected_functions),
  'function_missing_count', (select function_missing_count from function_comparison),
  'function_source_drift_count', (select function_source_drift_count from function_comparison),
  'function_security_drift_count', (select function_security_drift_count from function_comparison),
  'function_search_path_drift_count', (select function_search_path_drift_count from function_comparison),
  'function_acl_drift_count', (select function_acl_drift_count from function_comparison),
  'unexpected_function_count', (select value from unexpected_owned_function_count),
  'function_drift_count', (select function_drift_count from function_comparison),
  'orphan_legacy_session_count', (select orphan_legacy_session_count from legacy_session_summary),
  'mixed_legacy_session_count', (select mixed_legacy_session_count from legacy_session_summary),
  'content_direct_mismatch_count', (select content_direct_mismatch_count from content_authority_summary),
  'backfill_gap_count', (select backfill_gap_count from content_authority_summary),
  'compatibility_direct_only_write_count', (select compatibility_direct_only_write_count from compatibility_telemetry_summary),
  'compatibility_pair_mismatch_count', (select compatibility_pair_mismatch_count from compatibility_telemetry_summary),
  'remote_writes', 0
)
`;

assertRecipeSnapshotAuthorityReadOnlyVerificationSql({
  sql: POST_MERGE_READ_ONLY_SQL,
  fieldName: "recipe snapshot authority remote verification SQL",
});

export function buildRecipeSnapshotAuthorityRemoteVerificationPlan({ mode }) {
  if (mode !== "post-merge-read-only") {
    throw new Error(
      `unsupported recipe snapshot authority remote verification mode: ${mode ?? "missing"}`,
    );
  }

  return {
    mode,
    readOnly: true,
    requiresMergedOriginMaster: true,
    requiresCleanTrackedTree: true,
    sql: POST_MERGE_READ_ONLY_SQL,
  };
}

export function assertRecipeSnapshotAuthorityMergedExactSource({
  head,
  originMaster,
  isAncestorOfOriginMaster,
  legacyGrafts,
  trackedStatus,
}) {
  if (
    !/^[0-9a-f]{40}$/u.test(head)
    || !/^[0-9a-f]{40}$/u.test(originMaster)
  ) {
    throw new Error(
      "post-merge read-only verification requires exact 40-character commit SHAs",
    );
  }
  if (
    isAncestorOfOriginMaster !== true
  ) {
    throw new Error(
      "post-merge read-only verification requires HEAD to be merged into origin/master",
    );
  }
  if (legacyGrafts !== "") {
    throw new Error(
      "post-merge read-only verification rejects legacy Git grafts",
    );
  }
  if (trackedStatus !== "") {
    throw new Error(
      "post-merge read-only verification requires a clean tracked tree",
    );
  }
  return head;
}

const RECIPE_SNAPSHOT_AUTHORITY_UNSAFE_GIT_ENVIRONMENT_KEYS = new Set([
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_CEILING_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_CONFIG_COUNT",
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_PARAMETERS",
  "GIT_CONFIG_SYSTEM",
  "GIT_DIR",
  "GIT_EXEC_PATH",
  "GIT_INDEX_FILE",
  "GIT_NAMESPACE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_REPLACE_REF_BASE",
  "GIT_SHALLOW_FILE",
  "GIT_WORK_TREE",
]);

export function buildRecipeSnapshotAuthorityGitEnvironment({
  baseEnvironment,
}) {
  return Object.fromEntries(
    Object.entries(baseEnvironment).filter(([key]) =>
      !RECIPE_SNAPSHOT_AUTHORITY_UNSAFE_GIT_ENVIRONMENT_KEYS.has(key)
      && !/^GIT_CONFIG_(?:KEY|VALUE)_\d+$/u.test(key)
    ),
  );
}

export function parseRecipeSnapshotAuthorityLinkedDatabaseEnvironment({
  output,
}) {
  const parsed = new Map();
  for (const line of output.split(/\r?\n/u)) {
    const match = line.match(
      /^export ([A-Z_]+)=(?:"([^"]*)"|'([^']*)'|(\S+))$/u,
    );
    if (!match || !REQUIRED_DATABASE_VARIABLES.includes(match[1])) continue;
    parsed.set(match[1], match[2] ?? match[3] ?? match[4]);
  }

  if (
    REQUIRED_DATABASE_VARIABLES.some(
      (name) => !parsed.has(name) || parsed.get(name) === "",
    )
  ) {
    throw new Error("linked Supabase database environment is incomplete");
  }

  const environment = {};
  for (const name of REQUIRED_DATABASE_VARIABLES) {
    environment[name] = parsed.get(name);
  }
  return environment;
}

export function buildRecipeSnapshotAuthorityRemotePsqlRequest({
  baseEnvironment,
  databaseEnvironment,
  planSql,
}) {
  const environment = {};
  for (const name of SAFE_ENVIRONMENT_KEYS) {
    if (baseEnvironment?.[name]) {
      environment[name] = baseEnvironment[name];
    }
  }
  Object.assign(environment, databaseEnvironment, {
    PGSSLMODE: "require",
  });
  delete environment.PGOPTIONS;

  return {
    args: ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
    input: [
      "begin transaction isolation level read committed read only;",
      planSql,
      "commit;",
    ].join("\n"),
    environment,
  };
}

export function assertRecipeSnapshotAuthorityRemoteVerificationResult(result) {
  const validShape =
    result
    && typeof result === "object"
    && !Array.isArray(result)
    && hasOnlyAllowedKeys(result);

  const validStatuses = validShape
    && Object.entries(STATUS_FIELDS).every(
      ([fieldName, value]) => result[fieldName] === value,
    );
  const validCounts = validShape
    && COUNT_FIELDS.every(
      (fieldName) =>
        Number.isInteger(result[fieldName]) && result[fieldName] >= 0,
    );
  const validReadiness = validShape
    && result.missing_table_count === 0
    && result.column_missing_count === 0
    && result.column_drift_count === 0
    && result.fk_missing_count === 0
    && result.fk_drift_count === 0
    && result.unique_missing_count === 0
    && result.unique_drift_count === 0
    && result.check_missing_count === 0
    && result.check_drift_count === 0
    && result.trigger_missing_count === 0
    && result.trigger_drift_count === 0
    && result.acl_missing_count === 0
    && result.acl_drift_count === 0
    && result.function_missing_count === 0
    && result.unexpected_function_count === 0
    && result.function_drift_count === 0
    && result.content_direct_mismatch_count === 0
    && result.backfill_gap_count === 0
    && result.compatibility_pair_mismatch_count === 0
    && result.remote_writes === 0;

  if (!(validShape && validStatuses && validCounts && validReadiness)) {
    throw new Error("remote recipe snapshot authority verification failed");
  }
}
