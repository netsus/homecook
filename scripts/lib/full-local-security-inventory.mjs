import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));

const FULL_LOCAL_MANIFEST_PATH = join(
  REPOSITORY_ROOT,
  "docs/security/full-local-auth-db-security-function-authorization-manifest.json",
);
const SNAPSHOT_MANIFEST_PATH = join(
  REPOSITORY_ROOT,
  "docs/security/recipe-snapshot-authority-security-function-authorization-manifest.json",
);
const FULL_LOCAL_MIGRATION_PATH = join(
  REPOSITORY_ROOT,
  "supabase/migrations/20260801120000_full_local_auth_db_foundation.sql",
);
const SNAPSHOT_MIGRATION_PATH = join(
  REPOSITORY_ROOT,
  "supabase/migrations/20260729170500_recipe_snapshot_authority_foundation.sql",
);
const CURRENT_ACCOUNT_CLEANUP_MIGRATION_PATH = join(
  REPOSITORY_ROOT,
  "supabase/migrations/20260731111000_product_ingredient_link_account_cleanup.sql",
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
const snapshotManifest = JSON.parse(
  readFileSync(SNAPSHOT_MANIFEST_PATH, "utf8"),
);
const fullLocalMigration = readFileSync(FULL_LOCAL_MIGRATION_PATH, "utf8");
const snapshotMigration = readFileSync(SNAPSHOT_MIGRATION_PATH, "utf8");
const currentAccountCleanupMigration = readFileSync(
  CURRENT_ACCOUNT_CLEANUP_MIGRATION_PATH,
  "utf8",
);
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

const ROLE_ATTRIBUTE_CONTRACT = [
  ["anon", "false", "false"],
  ["authenticated", "false", "false"],
  ["service_role", "false", "true"],
  ["authenticator", "false", "false"],
];

const ROLE_MEMBERSHIP_CONTRACT = [
  ["anon", "authenticator", "false", "false", "true"],
  ["authenticated", "authenticator", "false", "false", "true"],
];

function sqlLiteral(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}

function normalizeSignature(value) {
  return value.replaceAll(/\s+/gu, "");
}

function isIdentifierCharacter(value) {
  return /[a-z0-9_$]/iu.test(value ?? "");
}

function escapedByBackslash(value, index) {
  let backslashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    backslashCount += 1;
  }
  return backslashCount % 2 === 1;
}

function quotedTokenAt(value, index) {
  const quote = value[index];
  if (quote === "'") {
    const escapeString = /[eE]/u.test(value[index - 1] ?? "")
      && !isIdentifierCharacter(value[index - 2]);
    for (let cursor = index + 1; cursor < value.length; cursor += 1) {
      if (value[cursor] !== "'") continue;
      if (value[cursor + 1] === "'") {
        cursor += 1;
        continue;
      }
      if (escapeString && escapedByBackslash(value, cursor)) continue;
      return { end: cursor + 1, kind: "string" };
    }
    throw new Error("policy string literal is unterminated");
  }
  if (quote === '"') {
    for (let cursor = index + 1; cursor < value.length; cursor += 1) {
      if (value[cursor] !== '"') continue;
      if (value[cursor + 1] === '"') {
        cursor += 1;
        continue;
      }
      return { end: cursor + 1, kind: "identifier" };
    }
    throw new Error("policy quoted identifier is unterminated");
  }
  if (quote !== "$") return null;
  if (isIdentifierCharacter(value[index - 1])) return null;
  const delimiter = /^\$(?:[a-z_][a-z0-9_]*)?\$/iu.exec(
    value.slice(index),
  )?.[0];
  if (!delimiter) return null;
  const closingIndex = value.indexOf(delimiter, index + delimiter.length);
  if (closingIndex < 0) throw new Error("policy dollar literal is unterminated");
  return {
    end: closingIndex + delimiter.length,
    kind: "dollar",
  };
}

function encodedQuotedToken(kind, token) {
  return `\uE000${kind}:${Buffer.from(token, "utf8").toString("hex")}\uE001`;
}

function normalizeUnquotedSql(value) {
  return value
    .toLowerCase()
    .replaceAll("::text", "")
    .replaceAll(/(?<![a-z0-9_$])public\./gu, "")
    .replaceAll(/(?<![a-z0-9_$])as(?![a-z0-9_$])/gu, "")
    .replaceAll(/\s+/gu, "");
}

function normalizeSqlSegments(value) {
  let result = "";
  let unquotedStart = 0;
  for (let index = 0; index < value.length; index += 1) {
    const quoted = quotedTokenAt(value, index);
    if (!quoted) continue;
    result += normalizeUnquotedSql(value.slice(unquotedStart, index));
    result += encodedQuotedToken(
      quoted.kind,
      value.slice(index, quoted.end),
    );
    index = quoted.end - 1;
    unquotedStart = quoted.end;
  }
  return result + normalizeUnquotedSql(value.slice(unquotedStart));
}

function isWrappedExpression(value) {
  if (!value.startsWith("(") || !value.endsWith(")")) return false;
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const quoted = quotedTokenAt(value, index);
    if (quoted) {
      index = quoted.end - 1;
      continue;
    }
    const character = value[index];
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (depth === 0 && index < value.length - 1) return false;
  }
  return depth === 0;
}

function splitTopLevelBoolean(value, operator) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const quoted = quotedTokenAt(value, index);
    if (quoted) {
      index = quoted.end - 1;
      continue;
    }
    const character = value[index];
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (
      depth === 0
      && value.slice(index, index + operator.length).toLowerCase() === operator
      && !isIdentifierCharacter(value[index - 1])
      && !isIdentifierCharacter(value[index + operator.length])
    ) {
      parts.push(value.slice(start, index));
      start = index + operator.length;
      index += operator.length - 1;
    }
  }
  if (parts.length === 0) return [value];
  parts.push(value.slice(start));
  return parts;
}

function findTopLevelKeyword(value, keyword) {
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const quoted = quotedTokenAt(value, index);
    if (quoted) {
      index = quoted.end - 1;
      continue;
    }
    const character = value[index];
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (
      depth === 0
      && value.slice(index, index + keyword.length).toLowerCase() === keyword
      && !isIdentifierCharacter(value[index - 1])
      && !isIdentifierCharacter(value[index + keyword.length])
    ) return index;
  }
  return -1;
}

function canonicalizePredicateAtom(value) {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    const quoted = quotedTokenAt(value, index);
    if (quoted) {
      result += value.slice(index, quoted.end);
      index = quoted.end - 1;
      continue;
    }
    if (value[index] !== "(") {
      result += value[index];
      continue;
    }
    let depth = 1;
    let end = index + 1;
    for (; end < value.length && depth > 0; end += 1) {
      const quoted = quotedTokenAt(value, end);
      if (quoted) {
        end = quoted.end - 1;
        continue;
      }
      const character = value[end];
      if (character === "(") depth += 1;
      if (character === ")") depth -= 1;
    }
    if (depth !== 0) throw new Error("policy expression is unbalanced");
    const prefix = result.match(/([a-z_][a-z0-9_.$]*)\s*$/iu)?.[1] ?? "";
    const inner = canonicalizePredicate(value.slice(index + 1, end - 1));
    const structural = (
      prefix !== ""
      && !["from", "join", "on", "select", "where"].includes(prefix.toLowerCase())
    ) || /\b(not|in)\s*$/iu.test(result);
    result += structural ? `(${inner})` : inner;
    index = end - 1;
  }
  return normalizeSqlSegments(result);
}

function canonicalizePredicate(value) {
  let expression = value.trim();
  while (isWrappedExpression(expression)) {
    expression = expression.slice(1, -1).trim();
  }
  if (/^select\b/iu.test(expression)) {
    const whereIndex = findTopLevelKeyword(expression, "where");
    if (whereIndex >= 0) {
      return canonicalizePredicateAtom(expression.slice(0, whereIndex + 5))
        + canonicalizePredicate(expression.slice(whereIndex + 5));
    }
    return canonicalizePredicateAtom(expression);
  }
  const orParts = splitTopLevelBoolean(expression, "or");
  if (orParts.length > 1) {
    return `or(${orParts.map(canonicalizePredicate).join(",")})`;
  }
  const andParts = splitTopLevelBoolean(expression, "and");
  if (andParts.length > 1) {
    return `and(${andParts.map(canonicalizePredicate).join(",")})`;
  }
  return canonicalizePredicateAtom(expression);
}

function readBalancedExpression(statement, marker) {
  const markerIndex = statement.toLowerCase().indexOf(marker);
  if (markerIndex < 0) return "";
  const start = statement.indexOf("(", markerIndex + marker.length);
  if (start < 0) throw new Error(`policy ${marker.trim()} expression is missing`);
  let depth = 0;
  for (let index = start; index < statement.length; index += 1) {
    const quoted = quotedTokenAt(statement, index);
    if (quoted) {
      index = quoted.end - 1;
      continue;
    }
    const character = statement[index];
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
    permissive: "PERMISSIVE",
    using: canonicalizePredicate(readBalancedExpression(statement, "using")),
    check: canonicalizePredicate(
      readBalancedExpression(statement, "with check"),
    ),
  };
}

function parseFunction(entry, migration) {
  const identity = entry.signature.slice(0, entry.signature.indexOf("("));
  const escapedIdentity = identity.replaceAll(".", "\\.");
  const startMatch = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+${escapedIdentity}\\s*\\(`,
    "iu",
  ).exec(migration);
  if (!startMatch) throw new Error(`function source is missing: ${entry.signature}`);
  const definition = migration.slice(startMatch.index);
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
    allowedAcl: [...entry.allowed_principals]
      .sort()
      .map((principal) => `${principal}:EXECUTE:false`)
      .join(","),
  };
}

const FUNCTION_CONTRACT = manifest.functions.map((entry) =>
  parseFunction(entry, fullLocalMigration)
);
const SNAPSHOT_FUNCTION_CONTRACT = snapshotManifest.functions.map((entry) =>
  parseFunction(
    entry,
    entry.signature === "public.delete_user_private_data(uuid)"
      ? currentAccountCleanupMigration
      : snapshotMigration,
  )
);
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
  const functions = includeSnapshotTables
    ? [...FUNCTION_CONTRACT, ...SNAPSHOT_FUNCTION_CONTRACT]
    : FUNCTION_CONTRACT;
  const rlsTables = includeSnapshotTables
    ? [...CORE_RLS_TABLES, ...SNAPSHOT_RLS_TABLES]
    : CORE_RLS_TABLES;
  const policies = includeSnapshotTables
    ? [...CORE_POLICY_CONTRACT, ...SNAPSHOT_POLICY_CONTRACT]
    : CORE_POLICY_CONTRACT;
  const functionValues = valuesSql(functions.map((entry) => [
    entry.lookupSignature,
    entry.signature,
    entry.schema,
    entry.name,
    entry.sourceHash,
    String(entry.securityDefiner),
    entry.owner,
    entry.searchPath,
    entry.allowedAcl,
  ]));
  const tableValues = valuesSql(rlsTables.map(([schema, table]) => [
    schema,
    table,
    "false",
  ]));
  const policyValues = valuesSql(policies.map((policy) => [
    policy.schema,
    policy.table,
    policy.name,
    policy.command,
    policy.roles,
    policy.permissive,
    policy.using,
    policy.check,
  ]));
  const roleValues = valuesSql(ROLE_ATTRIBUTE_CONTRACT);
  const membershipValues = valuesSql(ROLE_MEMBERSHIP_CONTRACT);

  return `
    with expected_functions(
      lookup_signature, signature, schema_name, function_name, source_hash, security_definer,
      owner_name, search_path, allowed_acl
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
            (case when acl.grantee = 0 then 'public' else role.rolname end)
              || ':' || acl.privilege_type || ':' || acl.is_grantable::text,
            ',' order by
              case when acl.grantee = 0 then 'public' else role.rolname end,
              acl.privilege_type,
              acl.is_grantable
          )
          from pg_catalog.aclexplode(coalesce(
            procedure.proacl,
            pg_catalog.acldefault('f', procedure.proowner)
          )) as acl
          left join pg_catalog.pg_roles as role on role.oid = acl.grantee
          where acl.grantee is distinct from procedure.proowner
        ), '') as actual_acl
      from expected_functions as expected
      left join pg_catalog.pg_proc as procedure
        on procedure.oid = pg_catalog.to_regprocedure(expected.lookup_signature)
      left join pg_catalog.pg_roles as owner on owner.oid = procedure.proowner
    ), expected_roles(role_name, superuser, bypass_rls) as (
      values
      ${roleValues}
    ), role_inventory as (
      select
        expected.*,
        role.oid,
        role.rolsuper,
        role.rolbypassrls
      from expected_roles as expected
      left join pg_catalog.pg_roles as role on role.rolname = expected.role_name
    ), expected_role_memberships(
      granted_role_name, member_name, admin_option, inherit_option, set_option
    ) as (
      values
      ${membershipValues}
    ), role_membership_inventory as (
      select
        granted_role.rolname as granted_role_name,
        member_role.rolname as member_name,
        membership.admin_option,
        membership.inherit_option,
        membership.set_option
      from pg_catalog.pg_auth_members as membership
      join pg_catalog.pg_roles as granted_role
        on granted_role.oid = membership.roleid
      join pg_catalog.pg_roles as member_role
        on member_role.oid = membership.member
      where exists (
        select 1
        from expected_roles as protected_role
        where protected_role.role_name = granted_role.rolname
           or protected_role.role_name = member_role.rolname
      )
    ), expected_rls_tables(schema_name, table_name, force_rls) as (
      values
      ${tableValues}
    ), rls_inventory as (
      select expected.*, relation.oid, relation.relrowsecurity, relation.relforcerowsecurity
      from expected_rls_tables as expected
      left join pg_catalog.pg_namespace as namespace
        on namespace.nspname = expected.schema_name
      left join pg_catalog.pg_class as relation
        on relation.relnamespace = namespace.oid
       and relation.relname = expected.table_name
       and relation.relkind in ('r', 'p')
    ), expected_policies(
      schema_name, table_name, policy_name, command_name, role_names,
      permissive_mode, using_predicate, check_predicate
    ) as (
      values
      ${policyValues}
    ), policy_inventory as (
      select
        policy.schemaname as schema_name,
        policy.tablename as table_name,
        policy.policyname as policy_name,
        policy.cmd as command_name,
        policy.permissive as permissive_mode,
        coalesce((
          select pg_catalog.string_agg(role_name::text, ',' order by role_name::text)
          from pg_catalog.unnest(policy.roles) as role_name
        ), '') as role_names,
        coalesce(policy.qual, '') as using_predicate,
        coalesce(policy.with_check, '') as check_predicate
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
      'function_acl_drift_count', (select count(*) from function_inventory where oid is not null and actual_acl is distinct from allowed_acl),
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
      'required_role_count', (select count(*) from expected_roles),
      'role_missing_count', (select count(*) from role_inventory where oid is null),
      'role_attribute_drift_count', (
        select count(*) from role_inventory
        where oid is not null
          and (rolsuper is distinct from superuser::boolean
            or rolbypassrls is distinct from bypass_rls::boolean)
      ),
      'required_role_membership_count', (select count(*) from expected_role_memberships),
      'role_membership_missing_count', (
        select count(*)
        from expected_role_memberships as expected
        left join role_membership_inventory as actual
          on actual.granted_role_name = expected.granted_role_name
         and actual.member_name = expected.member_name
        where actual.granted_role_name is null
      ),
      'role_membership_drift_count', (
        select count(*)
        from expected_role_memberships as expected
        join role_membership_inventory as actual
          on actual.granted_role_name = expected.granted_role_name
         and actual.member_name = expected.member_name
        where actual.admin_option is distinct from expected.admin_option::boolean
           or actual.inherit_option is distinct from expected.inherit_option::boolean
           or actual.set_option is distinct from expected.set_option::boolean
      ),
      'unexpected_role_membership_count', (
        select count(*)
        from role_membership_inventory as actual
        where not exists (
          select 1 from expected_role_memberships as expected
          where expected.granted_role_name = actual.granted_role_name
            and expected.member_name = actual.member_name
        )
      ),
      'required_rls_table_count', (select count(*) from expected_rls_tables),
      'rls_table_missing_count', (select count(*) from rls_inventory where oid is null),
      'rls_disabled_count', (select count(*) from rls_inventory where oid is not null and not relrowsecurity),
      'rls_force_drift_count', (select count(*) from rls_inventory where oid is not null and relforcerowsecurity is distinct from force_rls::boolean),
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
           or actual.permissive_mode is distinct from expected.permissive_mode
      ),
      'unexpected_policy_count', (
        select count(*) from policy_inventory as actual
        where not exists (
          select 1 from expected_policies as expected
          where expected.schema_name = actual.schema_name
            and expected.table_name = actual.table_name
            and expected.policy_name = actual.policy_name
        )
      ),
      '_policy_expression_inventory', (
        select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'schema', actual.schema_name,
          'table', actual.table_name,
          'name', actual.policy_name,
          'using', actual.using_predicate,
          'check', actual.check_predicate
        ) order by actual.schema_name, actual.table_name, actual.policy_name), '[]'::jsonb)
        from policy_inventory as actual
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
  "required_role_count",
  "role_missing_count",
  "role_attribute_drift_count",
  "required_role_membership_count",
  "role_membership_missing_count",
  "role_membership_drift_count",
  "unexpected_role_membership_count",
  "required_rls_table_count",
  "rls_table_missing_count",
  "rls_disabled_count",
  "rls_force_drift_count",
  "required_policy_count",
  "policy_missing_count",
  "policy_drift_count",
  "unexpected_policy_count",
  "_policy_expression_inventory",
];

const SECURITY_ZERO_KEYS = SECURITY_RESULT_KEYS.filter((key) =>
  !key.startsWith("required_") && !key.startsWith("_")
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
  const expectedFunctionCount = includeSnapshotTables
    ? FUNCTION_CONTRACT.length + SNAPSHOT_FUNCTION_CONTRACT.length
    : FUNCTION_CONTRACT.length;
  const expectedTableCount = includeSnapshotTables
    ? CORE_RLS_TABLES.length + SNAPSHOT_RLS_TABLES.length
    : CORE_RLS_TABLES.length;
  const expectedPolicyCount = includeSnapshotTables
    ? CORE_POLICY_CONTRACT.length + SNAPSHOT_POLICY_CONTRACT.length
    : CORE_POLICY_CONTRACT.length;
  const expectedPolicies = includeSnapshotTables
    ? [...CORE_POLICY_CONTRACT, ...SNAPSHOT_POLICY_CONTRACT]
    : CORE_POLICY_CONTRACT;
  const policyInventory = result?._policy_expression_inventory;
  const exactPolicyExpressions = Array.isArray(policyInventory)
    && policyInventory.length === expectedPolicies.length
    && expectedPolicies.every((expected) => {
      const actual = policyInventory.find((entry) =>
        entry?.schema === expected.schema
        && entry?.table === expected.table
        && entry?.name === expected.name
      );
      return actual
        && canonicalizePredicate(actual.using) === expected.using
        && canonicalizePredicate(actual.check) === expected.check;
    });
  const valid = result
    && typeof result === "object"
    && !Array.isArray(result)
    && Object.keys(result).length === SECURITY_RESULT_KEYS.length
    && SECURITY_RESULT_KEYS.every((key) => Object.hasOwn(result, key))
    && result.required_function_count === expectedFunctionCount
    && result.required_role_count === ROLE_ATTRIBUTE_CONTRACT.length
    && result.required_role_membership_count === ROLE_MEMBERSHIP_CONTRACT.length
    && result.required_rls_table_count === expectedTableCount
    && result.required_policy_count === expectedPolicyCount
    && exactPolicyExpressions
    && SECURITY_ZERO_KEYS.every((key) => result[key] === 0);
  if (!valid) {
    throw new Error("full-local security inventory failed closed");
  }
  return result;
}
