import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));

const FULL_LOCAL_MANIFEST_PATH = join(
  REPOSITORY_ROOT,
  "docs/security/full-local-auth-db-security-function-authorization-manifest.json",
);
const FULL_LOCAL_MIGRATION_PATH = join(
  REPOSITORY_ROOT,
  "supabase/migrations/20260801120000_full_local_auth_db_foundation.sql",
);
const RECIPE_VISIBILITY_MIGRATION_PATH = join(
  REPOSITORY_ROOT,
  "supabase/migrations/20260723170000_recipe_visibility_read_hardening.sql",
);
const LEFTOVER_MIGRATION_PATH = join(
  REPOSITORY_ROOT,
  "supabase/migrations/20260429080000_15a_cook_planner_complete.sql",
);

const manifest = JSON.parse(readFileSync(FULL_LOCAL_MANIFEST_PATH, "utf8"));
const fullLocalMigration = readFileSync(FULL_LOCAL_MIGRATION_PATH, "utf8");
const recipeVisibilityMigration = readFileSync(
  RECIPE_VISIBILITY_MIGRATION_PATH,
  "utf8",
);
const leftoverMigration = readFileSync(LEFTOVER_MIGRATION_PATH, "utf8");

const CORE_RLS_TABLES = [
  ["private", "full_local_auth_control"],
  ["private", "auth_flow_attempts"],
  ["public", "recipes"],
  ["public", "recipe_sources"],
  ["public", "recipe_ingredients"],
  ["public", "recipe_steps"],
  ["public", "recipe_step_cooking_methods"],
  ["public", "recipe_tags"],
  ["public", "tags"],
];

const SNAPSHOT_RLS_TABLES = [
  ["public", "recipe_nutrition_snapshots"],
  ["public", "recipe_content_snapshots"],
  ["public", "leftover_dishes"],
];

const CORE_POLICY_SOURCES = [
  [recipeVisibilityMigration, "recipes_public_and_owner_read"],
  [recipeVisibilityMigration, "recipe_sources_parent_read"],
  [recipeVisibilityMigration, "recipe_ingredients_parent_read"],
  [recipeVisibilityMigration, "recipe_steps_parent_read"],
  [recipeVisibilityMigration, "recipe_step_cooking_methods_parent_read"],
  [recipeVisibilityMigration, "recipe_tags_parent_read"],
  [recipeVisibilityMigration, "tags_public_read"],
];

const SNAPSHOT_POLICY_SOURCES = [
  [leftoverMigration, "leftover_dishes_select_own"],
  [leftoverMigration, "leftover_dishes_insert_own"],
  [leftoverMigration, "leftover_dishes_update_own"],
];

function sqlLiteral(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}

function normalizeSignature(value) {
  return value.replaceAll(/\s+/gu, "");
}

function normalizePredicate(value) {
  return value
    .toLowerCase()
    .replaceAll("::text", "")
    .replaceAll(/\bpublic\./gu, "")
    .replaceAll(/\bas\b/gu, "")
    .replaceAll(/[\s()]/gu, "");
}

function readBalancedExpression(statement, marker) {
  const markerIndex = statement.toLowerCase().indexOf(marker);
  if (markerIndex < 0) return "";
  const start = statement.indexOf("(", markerIndex + marker.length);
  if (start < 0) throw new Error(`policy ${marker.trim()} expression is missing`);
  let depth = 0;
  let quoted = false;
  for (let index = start; index < statement.length; index += 1) {
    const character = statement[index];
    if (character === "'" && statement[index - 1] !== "\\") quoted = !quoted;
    if (quoted) continue;
    if (character === "(") depth += 1;
    if (character === ")") {
      depth -= 1;
      if (depth === 0) return statement.slice(start + 1, index);
    }
  }
  throw new Error(`policy ${marker.trim()} expression is unterminated`);
}

function parsePolicy(migration, policyName) {
  const startMatch = new RegExp(
    `create\\s+policy\\s+${policyName}\\b`,
    "iu",
  ).exec(migration);
  if (!startMatch) throw new Error(`policy source is missing: ${policyName}`);
  const end = migration.indexOf(";", startMatch.index);
  if (end < 0) throw new Error(`policy source is unterminated: ${policyName}`);
  const statement = migration.slice(startMatch.index, end + 1);
  const table = statement.match(/\bon\s+([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)/iu);
  const command = statement.match(/\bfor\s+(select|insert|update|delete|all)\b/iu);
  const roles = statement.match(/\bto\s+([\s\S]+?)(?=\busing\b|\bwith\s+check\b|;)/iu);
  if (!table || !command || !roles) {
    throw new Error(`policy contract is incomplete: ${policyName}`);
  }
  return {
    schema: table[1].toLowerCase(),
    table: table[2].toLowerCase(),
    name: policyName,
    command: command[1].toUpperCase(),
    roles: roles[1]
      .split(",")
      .map((role) => role.trim().toLowerCase())
      .sort()
      .join(","),
    using: normalizePredicate(readBalancedExpression(statement, "using")),
    check: normalizePredicate(
      readBalancedExpression(statement, "with check"),
    ),
  };
}

function parseFunction(entry) {
  const identity = entry.signature.slice(0, entry.signature.indexOf("("));
  const escapedIdentity = identity.replaceAll(".", "\\.");
  const startMatch = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+${escapedIdentity}\\s*\\(`,
    "iu",
  ).exec(fullLocalMigration);
  if (!startMatch) throw new Error(`function source is missing: ${entry.signature}`);
  const definition = fullLocalMigration.slice(startMatch.index);
  const bodyMarker = definition.match(/\bas\s+(\$[a-z0-9_]*\$)/iu);
  if (!bodyMarker || bodyMarker.index === undefined) {
    throw new Error(`function body marker is missing: ${entry.signature}`);
  }
  const header = definition.slice(0, bodyMarker.index);
  const bodyStart = bodyMarker.index + bodyMarker[0].length;
  const bodyEnd = definition.indexOf(bodyMarker[1], bodyStart);
  if (bodyEnd < 0) throw new Error(`function body is unterminated: ${entry.signature}`);
  const searchPath = header.match(/set\s+search_path\s*=\s*([^\n]+)/iu);
  if (!searchPath) throw new Error(`function search_path is missing: ${entry.signature}`);
  const parsedSearchPath = searchPath[1]
    .split(",")
    .map((part) => part.trim());
  const parsedSecurityMode = /\bsecurity\s+definer\b/iu.test(header)
    ? "definer"
    : "invoker";
  if (
    parsedSecurityMode !== entry.security_mode
    || JSON.stringify(parsedSearchPath) !== JSON.stringify(entry.safe_search_path)
  ) {
    throw new Error(`function manifest source drift: ${entry.signature}`);
  }
  const source = definition
    .slice(bodyStart, bodyEnd)
    .replace(/^\n+|\n+$/gu, "");
  const [schema, name] = identity.split(".");
  return {
    lookupSignature: entry.signature,
    signature: normalizeSignature(entry.signature),
    schema,
    name,
    sourceHash: createHash("md5").update(source).digest("hex"),
    securityDefiner: entry.security_mode === "definer",
    owner: entry.owner ?? "postgres",
    searchPath: entry.safe_search_path.join(","),
    allowedPrincipals: [...entry.allowed_principals].sort().join(","),
  };
}

const FUNCTION_CONTRACT = manifest.functions.map(parseFunction);
const CORE_POLICY_CONTRACT = CORE_POLICY_SOURCES.map(([migration, name]) =>
  parsePolicy(migration, name)
);
const SNAPSHOT_POLICY_CONTRACT = SNAPSHOT_POLICY_SOURCES.map(
  ([migration, name]) => parsePolicy(migration, name),
);

function valuesSql(rows) {
  return rows.map((row) => `(${row.map(sqlLiteral).join(", ")})`).join(",\n      ");
}

function buildSecurityInventoryExpression({ includeSnapshotTables }) {
  const rlsTables = includeSnapshotTables
    ? [...CORE_RLS_TABLES, ...SNAPSHOT_RLS_TABLES]
    : CORE_RLS_TABLES;
  const policies = includeSnapshotTables
    ? [...CORE_POLICY_CONTRACT, ...SNAPSHOT_POLICY_CONTRACT]
    : CORE_POLICY_CONTRACT;
  const functionValues = valuesSql(FUNCTION_CONTRACT.map((entry) => [
    entry.lookupSignature,
    entry.signature,
    entry.schema,
    entry.name,
    entry.sourceHash,
    String(entry.securityDefiner),
    entry.owner,
    entry.searchPath,
    entry.allowedPrincipals,
  ]));
  const tableValues = valuesSql(rlsTables);
  const policyValues = valuesSql(policies.map((policy) => [
    policy.schema,
    policy.table,
    policy.name,
    policy.command,
    policy.roles,
    policy.using,
    policy.check,
  ]));

  return `
    with expected_functions(
      lookup_signature, signature, schema_name, function_name, source_hash, security_definer,
      owner_name, search_path, allowed_principals
    ) as (
      values
      ${functionValues}
    ), function_inventory as (
      select
        expected.*,
        procedure.oid,
        procedure.prosecdef,
        owner.rolname as actual_owner,
        pg_catalog.md5(pg_catalog.btrim(procedure.prosrc, pg_catalog.chr(10)))
          as actual_source_hash,
        pg_catalog.replace(coalesce((
          select config
          from pg_catalog.unnest(procedure.proconfig) as config
          where config like 'search_path=%'
        ), ''), ' ', '') as actual_search_path,
        coalesce((
          select pg_catalog.string_agg(
            case when acl.grantee = 0 then 'public' else role.rolname end,
            ',' order by case when acl.grantee = 0 then 'public' else role.rolname end
          )
          from pg_catalog.aclexplode(coalesce(
            procedure.proacl,
            pg_catalog.acldefault('f', procedure.proowner)
          )) as acl
          left join pg_catalog.pg_roles as role on role.oid = acl.grantee
          where acl.privilege_type = 'EXECUTE'
            and acl.grantee is distinct from procedure.proowner
        ), '') as actual_principals
      from expected_functions as expected
      left join pg_catalog.pg_proc as procedure
        on procedure.oid = pg_catalog.to_regprocedure(expected.lookup_signature)
      left join pg_catalog.pg_roles as owner on owner.oid = procedure.proowner
    ), expected_rls_tables(schema_name, table_name) as (
      values
      ${tableValues}
    ), rls_inventory as (
      select expected.*, relation.oid, relation.relrowsecurity
      from expected_rls_tables as expected
      left join pg_catalog.pg_namespace as namespace
        on namespace.nspname = expected.schema_name
      left join pg_catalog.pg_class as relation
        on relation.relnamespace = namespace.oid
       and relation.relname = expected.table_name
       and relation.relkind in ('r', 'p')
    ), expected_policies(
      schema_name, table_name, policy_name, command_name, role_names,
      using_predicate, check_predicate
    ) as (
      values
      ${policyValues}
    ), policy_inventory as (
      select
        policy.schemaname as schema_name,
        policy.tablename as table_name,
        policy.policyname as policy_name,
        policy.cmd as command_name,
        coalesce((
          select pg_catalog.string_agg(role_name::text, ',' order by role_name::text)
          from pg_catalog.unnest(policy.roles) as role_name
        ), '') as role_names,
        pg_catalog.regexp_replace(
          pg_catalog.replace(pg_catalog.replace(
            pg_catalog.replace(pg_catalog.lower(coalesce(policy.qual, '')), '::text', ''),
            'public.', ''
          ), ' as ', ' '),
          '[[:space:]()]', '', 'g'
        ) as using_predicate,
        pg_catalog.regexp_replace(
          pg_catalog.replace(pg_catalog.replace(
            pg_catalog.replace(pg_catalog.lower(coalesce(policy.with_check, '')), '::text', ''),
            'public.', ''
          ), ' as ', ' '),
          '[[:space:]()]', '', 'g'
        ) as check_predicate
      from pg_catalog.pg_policies as policy
      join expected_rls_tables as expected
        on expected.schema_name = policy.schemaname
       and expected.table_name = policy.tablename
    )
    select pg_catalog.jsonb_build_object(
      'required_function_count', (select count(*) from expected_functions),
      'function_missing_count', (select count(*) from function_inventory where oid is null),
      'function_source_drift_count', (select count(*) from function_inventory where oid is not null and actual_source_hash is distinct from source_hash),
      'function_security_drift_count', (select count(*) from function_inventory where oid is not null and prosecdef is distinct from security_definer::boolean),
      'function_owner_drift_count', (select count(*) from function_inventory where oid is not null and actual_owner is distinct from owner_name),
      'function_search_path_drift_count', (select count(*) from function_inventory where oid is not null and actual_search_path is distinct from 'search_path=' || search_path),
      'function_acl_drift_count', (select count(*) from function_inventory where oid is not null and actual_principals is distinct from allowed_principals),
      'unexpected_function_overload_count', (
        select count(*)
        from pg_catalog.pg_proc as procedure
        join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
        where exists (
          select 1 from expected_functions as expected
          where expected.schema_name = namespace.nspname
            and expected.function_name = procedure.proname
        )
          and not exists (
            select 1 from expected_functions as expected
            where expected.signature = pg_catalog.replace(pg_catalog.format(
              '%I.%I(%s)', namespace.nspname, procedure.proname,
              pg_catalog.oidvectortypes(procedure.proargtypes)
            ), ' ', '')
          )
      ),
      'required_rls_table_count', (select count(*) from expected_rls_tables),
      'rls_table_missing_count', (select count(*) from rls_inventory where oid is null),
      'rls_disabled_count', (select count(*) from rls_inventory where oid is not null and not relrowsecurity),
      'required_policy_count', (select count(*) from expected_policies),
      'policy_missing_count', (
        select count(*) from expected_policies as expected
        left join policy_inventory as actual
          on actual.schema_name = expected.schema_name
         and actual.table_name = expected.table_name
         and actual.policy_name = expected.policy_name
        where actual.policy_name is null
      ),
      'policy_drift_count', (
        select count(*) from expected_policies as expected
        join policy_inventory as actual
          on actual.schema_name = expected.schema_name
         and actual.table_name = expected.table_name
         and actual.policy_name = expected.policy_name
        where actual.command_name is distinct from expected.command_name
           or actual.role_names is distinct from expected.role_names
           or actual.using_predicate is distinct from expected.using_predicate
           or actual.check_predicate is distinct from expected.check_predicate
      ),
      'unexpected_policy_count', (
        select count(*) from policy_inventory as actual
        where not exists (
          select 1 from expected_policies as expected
          where expected.schema_name = actual.schema_name
            and expected.table_name = actual.table_name
            and expected.policy_name = actual.policy_name
        )
      )
    )`;
}

const SECURITY_RESULT_KEYS = [
  "required_function_count",
  "function_missing_count",
  "function_source_drift_count",
  "function_security_drift_count",
  "function_owner_drift_count",
  "function_search_path_drift_count",
  "function_acl_drift_count",
  "unexpected_function_overload_count",
  "required_rls_table_count",
  "rls_table_missing_count",
  "rls_disabled_count",
  "required_policy_count",
  "policy_missing_count",
  "policy_drift_count",
  "unexpected_policy_count",
];

const SECURITY_ZERO_KEYS = SECURITY_RESULT_KEYS.filter((key) =>
  !key.startsWith("required_")
);

export function buildFullLocalSecurityInventoryExpression({
  includeSnapshotTables = false,
} = {}) {
  return buildSecurityInventoryExpression({ includeSnapshotTables });
}

export function buildRecipeSnapshotAuthorityFullLocalSecurityInventorySql(
  options = {},
) {
  return `select (${buildFullLocalSecurityInventoryExpression(options)})::text;`;
}

export function assertRecipeSnapshotAuthorityFullLocalSecurityInventoryResult(
  result,
  { includeSnapshotTables = false } = {},
) {
  const expectedFunctionCount = FUNCTION_CONTRACT.length;
  const expectedTableCount = includeSnapshotTables
    ? CORE_RLS_TABLES.length + SNAPSHOT_RLS_TABLES.length
    : CORE_RLS_TABLES.length;
  const expectedPolicyCount = includeSnapshotTables
    ? CORE_POLICY_CONTRACT.length + SNAPSHOT_POLICY_CONTRACT.length
    : CORE_POLICY_CONTRACT.length;
  const valid = result
    && typeof result === "object"
    && !Array.isArray(result)
    && Object.keys(result).length === SECURITY_RESULT_KEYS.length
    && SECURITY_RESULT_KEYS.every((key) => Object.hasOwn(result, key))
    && result.required_function_count === expectedFunctionCount
    && result.required_rls_table_count === expectedTableCount
    && result.required_policy_count === expectedPolicyCount
    && SECURITY_ZERO_KEYS.every((key) => result[key] === 0);
  if (!valid) {
    throw new Error("full-local security inventory failed closed");
  }
  return result;
}
