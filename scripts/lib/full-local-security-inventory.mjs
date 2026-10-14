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
const PERSONAL_RECIPE_MANIFEST_PATH = join(
  REPOSITORY_ROOT,
  "docs/security/personal-recipe-customization-write-core-security-function-authorization-manifest.json",
);
const RECIPE_FUTURE_PROPAGATION_MANIFEST_PATH = join(
  REPOSITORY_ROOT,
  "docs/security/recipe-content-snapshot-future-propagation-security-function-authorization-manifest.json",
);
const RECIPE_PRODUCT_POSTIMAGES_PATH = join(
  REPOSITORY_ROOT,
  "docs/security/recipe-product-source-function-postimages.json",
);
const COOKED_WEIGHT_POSTIMAGES_PATH = join(
  REPOSITORY_ROOT,
  "docs/security/cooked-weight-evidence-source-function-postimages.json",
);
const WEIGHT_ATTESTATION_POSTIMAGES_PATH = join(REPOSITORY_ROOT,
  "docs/security/cooked-weight-user-attestation-source-function-postimages.json");
const WEIGHT_ATTESTATION_TABLES = ["cooked_weight_user_attestations", "cooked_weight_user_attestation_control"];
const QUANTITY_V4_POSTIMAGES_PATH = join(
  REPOSITORY_ROOT,
  "docs/security/quantity-input-v4-source-function-postimages.json",
);
const FULL_LOCAL_MIGRATION_PATH = join(
  REPOSITORY_ROOT,
  "supabase/migrations/20260801120000_full_local_auth_db_foundation.sql",
);
const FULL_LOCAL_SESSION_ISSUE_TIME_PRECISION_MIGRATION_PATH = join(
  REPOSITORY_ROOT,
  "supabase/migrations/20260803090000_full_local_session_issue_time_precision.sql",
);
const FULL_LOCAL_SESSION_REFRESH_AUTHORITY_MIGRATION_PATH = join(
  REPOSITORY_ROOT,
  "supabase/migrations/20260809100000_full_local_session_refresh_authority.sql",
);
const FULL_LOCAL_SESSION_OBSERVABILITY_MIGRATION_PATH = join(
  REPOSITORY_ROOT,
  "supabase/migrations/20260811120000_full_local_session_observability.sql",
);
const FULL_LOCAL_SESSION_BOUNDED_OVERLAP_MIGRATION_PATH = join(
  REPOSITORY_ROOT,
  "supabase/migrations/20260820120000_full_local_session_bounded_token_overlap.sql",
);
const SNAPSHOT_MIGRATION_PATH = join(
  REPOSITORY_ROOT,
  "supabase/migrations/20260729170500_recipe_snapshot_authority_foundation.sql",
);
const PERSONAL_RECIPE_MIGRATION_PATH = join(
  REPOSITORY_ROOT,
  "supabase/migrations/20260822170000_personal_recipe_customization_write_core_derived_create.sql",
);
const RECIPE_FUTURE_PROPAGATION_BASE_MIGRATION_PATH = join(
  REPOSITORY_ROOT,
  "supabase/migrations/20260802210000_recipe_content_snapshot_future_propagation.sql",
);
const RECIPE_SNAPSHOT_ENTRYPOINT_BASE_MIGRATION_PATH = join(
  REPOSITORY_ROOT,
  "supabase/migrations/20260804100000_recipe_snapshot_entrypoint_projection.sql",
);
const RECIPE_SNAPSHOT_ENTRYPOINT_MIGRATION_PATH = join(
  REPOSITORY_ROOT,
  "supabase/migrations/20260822173000_recipe_snapshot_public_fork_context.sql",
);
let RECIPE_FUTURE_PROPAGATION_MIGRATION_PATH;
const SNAPSHOT_CONSUMER_READ_MIGRATION_PATH = join(
  REPOSITORY_ROOT,
  "supabase/migrations/20260802120000_recipe_snapshot_consumer_read_authority.sql",
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
const personalRecipeManifest = JSON.parse(
  readFileSync(PERSONAL_RECIPE_MANIFEST_PATH, "utf8"),
);
const recipeFuturePropagationManifest = JSON.parse(
  readFileSync(RECIPE_FUTURE_PROPAGATION_MANIFEST_PATH, "utf8"),
);
RECIPE_FUTURE_PROPAGATION_MIGRATION_PATH = join(
  REPOSITORY_ROOT,
  recipeFuturePropagationManifest.migration,
);
const fullLocalMigration = readFileSync(FULL_LOCAL_MIGRATION_PATH, "utf8");
const fullLocalSessionIssueTimePrecisionMigration = readFileSync(
  FULL_LOCAL_SESSION_ISSUE_TIME_PRECISION_MIGRATION_PATH,
  "utf8",
);
const fullLocalSessionRefreshAuthorityMigration = readFileSync(
  FULL_LOCAL_SESSION_REFRESH_AUTHORITY_MIGRATION_PATH,
  "utf8",
);
const fullLocalSessionObservabilityMigration = readFileSync(
  FULL_LOCAL_SESSION_OBSERVABILITY_MIGRATION_PATH,
  "utf8",
);
const fullLocalSessionBoundedOverlapMigration = readFileSync(
  FULL_LOCAL_SESSION_BOUNDED_OVERLAP_MIGRATION_PATH,
  "utf8",
);
const snapshotMigration = readFileSync(SNAPSHOT_MIGRATION_PATH, "utf8");
const personalRecipeMigration = readFileSync(
  PERSONAL_RECIPE_MIGRATION_PATH,
  "utf8",
);
const recipeFuturePropagationMigration = [
  readFileSync(RECIPE_FUTURE_PROPAGATION_BASE_MIGRATION_PATH, "utf8"),
  RECIPE_FUTURE_PROPAGATION_MIGRATION_PATH
  === RECIPE_FUTURE_PROPAGATION_BASE_MIGRATION_PATH
    ? null
    : readFileSync(RECIPE_FUTURE_PROPAGATION_MIGRATION_PATH, "utf8"),
  readFileSync(RECIPE_SNAPSHOT_ENTRYPOINT_BASE_MIGRATION_PATH, "utf8"),
  readFileSync(RECIPE_SNAPSHOT_ENTRYPOINT_MIGRATION_PATH, "utf8"),
].filter(Boolean).join("\n\n");
const snapshotConsumerReadMigration = readFileSync(
  SNAPSHOT_CONSUMER_READ_MIGRATION_PATH,
  "utf8",
);
const currentAccountCleanupMigration = readFileSync(
  CURRENT_ACCOUNT_CLEANUP_MIGRATION_PATH,
  "utf8",
);
const recipeVisibilityMigration = readFileSync(
  RECIPE_VISIBILITY_MIGRATION_PATH,
  "utf8",
);
const leftoverMigration = readFileSync(LEFTOVER_MIGRATION_PATH, "utf8");

// Platform schema restore preserves the canonical migration owner. These
// protected relations are repo-migration objects; Storage service-owned
// relations are intentionally outside this locked 12-table inventory.
const CORE_RLS_TABLES = [
  ["private", "full_local_auth_control", "postgres", "false"],
  ["private", "auth_flow_attempts", "postgres", "false"],
  ["public", "recipes", "postgres", "false"],
  ["public", "recipe_sources", "postgres", "false"],
  ["public", "recipe_ingredients", "postgres", "false"],
  ["public", "recipe_steps", "postgres", "false"],
  ["public", "recipe_step_cooking_methods", "postgres", "false"],
  ["public", "recipe_tags", "postgres", "false"],
  ["public", "tags", "postgres", "false"],
];

const SNAPSHOT_READ_TABLES = snapshotManifest.tables ?? [];

const SNAPSHOT_RLS_TABLES = [
  ...SNAPSHOT_READ_TABLES.map((table) => [
    table.schema,
    table.name,
    table.owner,
    String(table.force_rls),
  ]),
  ["public", "leftover_dishes", "postgres", "false"],
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
  ...SNAPSHOT_READ_TABLES.flatMap((table) =>
    table.policies.map((policy) => [snapshotConsumerReadMigration, policy.name])
  ),
];

const SNAPSHOT_TABLE_ACL_CONTRACT = SNAPSHOT_READ_TABLES.map((table) => [
  table.schema,
  table.name,
  [...table.allowed_acl]
    .sort((left, right) =>
      `${left.principal}:${left.privilege}:${left.grantable}`.localeCompare(
        `${right.principal}:${right.privilege}:${right.grantable}`,
      )
    )
    .map((entry) =>
      `${entry.principal}:${entry.privilege}:${entry.grantable}`
    )
    .join(","),
]);

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

export function canonicalizePredicate(value) {
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

export function parsePolicy(migration, policyName) {
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
  if (!table || !command) {
    throw new Error(`policy contract is incomplete: ${policyName}`);
  }
  return {
    schema: table[1].toLowerCase(),
    table: table[2].toLowerCase(),
    name: policyName,
    command: command[1].toUpperCase(),
    roles: (roles?.[1] ?? "public")
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
  const startMatches = [...migration.matchAll(new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+${escapedIdentity}\\s*\\(`,
    "giu",
  ))];
  const startMatch = startMatches.at(-1);
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

const FULL_LOCAL_SESSION_PRECISION_FUNCTIONS = new Set([
  "public.record_full_local_session_authority(text, uuid, timestamp with time zone, text, integer, bigint, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone)",
]);
const FULL_LOCAL_SESSION_REFRESH_FUNCTIONS = new Set([
  "private.protect_full_local_session_binding_identity()",
  "private.hydrate_full_local_session_token_evidence()",
  "public.assert_full_local_session_authority(text, uuid, timestamp with time zone, text, integer, bigint, timestamp with time zone)",
  "public.record_full_local_session_authority_v2(text, uuid, timestamp with time zone, uuid, text, integer, bigint, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone)",
]);
const FULL_LOCAL_SESSION_OBSERVABILITY_FUNCTIONS = new Set([
  "private.assert_full_local_session_observability_scope()",
  "public.record_full_local_session_stale_observation(text)",
  "public.read_full_local_session_observation()",
]);
const FULL_LOCAL_SESSION_BOUNDED_OVERLAP_FUNCTIONS = new Set([
  "public.assert_and_renew_full_local_session_authority_v2(text, uuid, timestamp with time zone, uuid, text, integer, bigint, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone)",
]);
const FUNCTION_CONTRACT = manifest.functions.map((entry) => parseFunction(
  entry,
  FULL_LOCAL_SESSION_BOUNDED_OVERLAP_FUNCTIONS.has(entry.signature)
    ? fullLocalSessionBoundedOverlapMigration
    : FULL_LOCAL_SESSION_OBSERVABILITY_FUNCTIONS.has(entry.signature)
    ? fullLocalSessionObservabilityMigration
    : FULL_LOCAL_SESSION_REFRESH_FUNCTIONS.has(entry.signature)
    ? fullLocalSessionRefreshAuthorityMigration
    : FULL_LOCAL_SESSION_PRECISION_FUNCTIONS.has(entry.signature)
    ? fullLocalSessionIssueTimePrecisionMigration
    : fullLocalMigration,
));
const SNAPSHOT_FUNCTION_CONTRACT = snapshotManifest.functions.map((entry) =>
  parseFunction(
    entry,
    entry.signature === "public.delete_user_private_data(uuid)"
      ? currentAccountCleanupMigration
      : snapshotMigration,
  )
);
const PERSONAL_RECIPE_FUNCTION_CONTRACT = personalRecipeManifest.functions.map(
  (entry) => parseFunction(entry, personalRecipeMigration),
);
const RECIPE_FUTURE_PROPAGATION_FUNCTION_CONTRACT =
  recipeFuturePropagationManifest.functions.map(
    (entry) => parseFunction(entry, recipeFuturePropagationMigration),
  );

// Explicitly reviewed schema-only 219 -> C03 postimages. The old source and
// metadata contracts remain checked; unrelated baseline drift is not adopted.
function recipeProductPostimages() {
  const postimages = JSON.parse(readFileSync(RECIPE_PRODUCT_POSTIMAGES_PATH, "utf8"));
  const migration = readFileSync(join(REPOSITORY_ROOT, postimages.migration));
  if (postimages.schema_version !== 1
    || postimages.migration !== "supabase/migrations/20261013190000_recipe_product_only_identity.sql"
    || createHash("sha256").update(migration).digest("hex") !== postimages.migration_sha256
    || postimages.schema_archive_sha256 !== "15c29821618e9cb7c70bbbe0df2cb2f0bd3246924352667bf8ce047400f48097"
    || postimages.predecessor_219_sha256 !== "e51b6a0559940204716859b5b0be1a746705c1ca464b3c343558fcd64e0d4993"
    || postimages.application_rows_restored !== 0 || postimages.functions.length !== 24) {
    throw new Error("recipe product postimage provenance drift");
  }
  const publicReaders = new Set(["read_public_recipe_product_sources", "find_public_recipe_ids_by_product_name", "read_recipe_product_ingredient_classification"]);
  for (const { postimage, preimage } of postimages.functions) {
    if (!preimage && (postimage.owner !== "postgres" || postimage.allowedAcl !==
      (publicReaders.has(postimage.name) ? "anon:EXECUTE:false,authenticated:EXECUTE:false" : ""))) {
      throw new Error("recipe product new function privilege drift");
    }
    if (preimage) for (const field of ["securityDefiner", "owner", "searchPath", "allowedAcl", "volatility"]) {
      if (preimage[field] !== postimage[field]) throw new Error(`recipe product metadata changed: ${field}`);
    }
  }
  return postimages;
}

function withRecipeProductContracts(contracts) {
  const postimages = recipeProductPostimages();
  const result = [...contracts];
  for (const { postimage, preimage, checkedInInventoryPreimageMd5 } of postimages.functions) {
    if (!/^[a-f0-9]{32}$/u.test(postimage.sourceHash)
      || postimage.signature !== normalizeSignature(postimage.lookupSignature)
      || !["public", "private"].includes(postimage.schema)
      || !postimage.searchPath.startsWith("pg_catalog,")
      || !postimage.searchPath.endsWith("pg_temp")) throw new Error("invalid recipe product postimage");
    if (preimage) {
      for (const field of ["securityDefiner", "owner", "searchPath", "allowedAcl", "volatility"]) {
        if (preimage[field] !== postimage[field]) throw new Error(`recipe product metadata changed: ${field}`);
      }
    }
    const index = result.findIndex((entry) => entry.signature === postimage.signature);
    if (index >= 0) {
      if (checkedInInventoryPreimageMd5 !== result[index].sourceHash) {
        throw new Error("recipe product checked-in preimage drift");
      }
      // Replace only the body expectation. Do not silently replace owner,
      // privileges or search_path when the existing 219 baseline is stale.
      result[index] = { ...result[index], sourceHash: postimage.sourceHash };
    } else result.push(postimage);
  }
  return result;
}

function cookedWeightPostimages() {
  const manifest = JSON.parse(readFileSync(COOKED_WEIGHT_POSTIMAGES_PATH, "utf8"));
  const migration = readFileSync(join(REPOSITORY_ROOT, manifest.migration));
  if (manifest.schema_version !== 1 || manifest.status !== "local-review-draft"
    || manifest.migration !== "supabase/migrations/20261013233000_cooked_batch_weight_evidence.sql"
    || createHash("sha256").update(migration).digest("hex") !== manifest.migration_sha256
    || manifest.schema_archive_sha256 !== "15c29821618e9cb7c70bbbe0df2cb2f0bd3246924352667bf8ce047400f48097"
    || manifest.predecessor_219_sha256 !== "e51b6a0559940204716859b5b0be1a746705c1ca464b3c343558fcd64e0d4993"
    || manifest.predecessor_C03_sha256 !== recipeProductPostimages().migration_sha256
    || manifest.application_rows_restored !== 0 || manifest.C03_integration_pending !== false
    || manifest.functions.length !== 15) throw new Error("cooked weight postimage provenance drift");
  const publicWriters = new Set(["complete_snapshot_v2_cooking_session_with_weight_evidence", "mutate_cooked_batch_weight_with_evidence"]);
  for (const { postimage, preimage } of manifest.functions) {
    if (!/^[a-f0-9]{32}$/u.test(postimage.sourceHash)
      || postimage.signature !== normalizeSignature(postimage.lookupSignature)
      || !["public", "private"].includes(postimage.schema)
      || !postimage.searchPath.startsWith("pg_catalog,")
      || !postimage.searchPath.endsWith("pg_temp")) throw new Error("invalid cooked weight postimage");
    if (preimage) {
      for (const field of ["securityDefiner", "owner", "searchPath", "allowedAcl", "volatility"]) {
        if (preimage[field] !== postimage[field]) throw new Error(`cooked weight metadata changed: ${field}`);
      }
    } else if (postimage.owner !== "postgres"
      || postimage.allowedAcl !== (publicWriters.has(postimage.name) ? "service_role:EXECUTE:false" : "")) {
      throw new Error("cooked weight new function privilege drift");
    }
  }
  const predecessor = manifest.preserved_scope_predecessor;
  const before = manifest.functions.find((entry) => entry.postimage.name === "verify_full_local_internal_scope")?.preimage;
  const alias = manifest.functions.find((entry) => entry.postimage.name === "verify_scope_pre_cooked_weight_evidence_20261013")?.postimage;
  if (!before || !alias || !predecessor.body_and_attributes_unchanged
    || JSON.stringify(before) !== JSON.stringify(predecessor.before)
    || JSON.stringify(alias) !== JSON.stringify(predecessor.renamed)
    || ["sourceHash", "securityDefiner", "owner", "searchPath", "allowedAcl", "volatility"]
      .some((field) => before[field] !== alias[field])) throw new Error("cooked weight scope predecessor drift");
  return manifest;
}

function withCookedWeightContracts(contracts) {
  const result = [...contracts];
  for (const { postimage, checkedInInventoryPreimageMd5 } of cookedWeightPostimages().functions) {
    const index = result.findIndex((entry) => entry.signature === postimage.signature);
    if (index >= 0) {
      if (checkedInInventoryPreimageMd5 !== result[index].sourceHash) throw new Error("cooked weight checked-in preimage drift");
      result[index] = { ...result[index], sourceHash: postimage.sourceHash };
    } else result.push(postimage);
  }
  return result;
}

function quantityV4Postimages() {
  const manifest = JSON.parse(readFileSync(QUANTITY_V4_POSTIMAGES_PATH, "utf8"));
  const paths = ["20261014010000_ingredient_quantity_policy_v4.sql", "20261014200000_quantity_input_v4_consumers.sql",
    "20261014210000_product_quantity_input_v4.sql", "20261014213000_product_quantity_edit_capability.sql",
    "20261014220000_recipe_quantity_input_v4.sql", "20261014223000_youtube_quantity_input_bridge.sql"];
  if (manifest.schema_version !== 1 || manifest.status !== "local-review-draft"
    || manifest.schema_archive_sha256 !== recipeProductPostimages().schema_archive_sha256
    || manifest.predecessor_219_sha256 !== recipeProductPostimages().predecessor_219_sha256
    || manifest.predecessor_C03_sha256 !== recipeProductPostimages().migration_sha256
    || manifest.predecessor_C01_sha256 !== cookedWeightPostimages().migration_sha256
    || manifest.application_rows_restored !== 0 || manifest.whole_inventory_drift_not_waived !== true
    || manifest.functions.length !== 60 || manifest.preserved_overloads.length !== 3 || manifest.migrations.length !== paths.length
    || manifest.catalog_before !== "81362d758b5138a95b6cbe1d8d7c1f064653b467907a42a7335c00d97dc59ba9"
    || manifest.catalog_after !== "de001df9981d361130136e2dff184665ec5280e82a857aa4e0e6cd593848af05") {
    throw new Error("quantity v4 postimage provenance drift");
  }
  for (const [index, migration] of manifest.migrations.entries()) {
    if (migration.path !== `supabase/migrations/${paths[index]}`
      || migration.actor !== (index === 5 ? "supabase_admin" : "postgres")
      || createHash("sha256").update(readFileSync(join(REPOSITORY_ROOT, migration.path))).digest("hex") !== migration.sha256) {
      throw new Error("quantity v4 migration source drift");
    }
  }
  const privileges = new Map([
    ["create_product_planner_entry", "authenticated:EXECUTE:false,service_role:EXECUTE:false"],
    ["update_product_planner_entry_quantity", "authenticated:EXECUTE:false,service_role:EXECUTE:false"],
    ["preview_meal_log_nutrition", "service_role:EXECUTE:false"],
    ["youtube_worker_quantity_input_v4", "youtube_extraction_worker_rpc_owner:EXECUTE:false"],
    ["youtube_worker_quantity_write_admission_v4", "youtube_extraction_worker_rpc_owner:EXECUTE:false"],
  ]);
  const signatures = new Set();
  let existing = 0;
  for (const { preimage, postimage } of manifest.functions) {
    if (!/^[a-f0-9]{32}$/u.test(postimage.sourceHash) || !/^[a-f0-9]{64}$/u.test(postimage.definitionSha256)
      || postimage.signature !== normalizeSignature(postimage.lookupSignature)
      || !["public", "private"].includes(postimage.schema) || signatures.has(postimage.signature)
      || !/^[a-z_][a-z0-9_]*$/u.test(postimage.name)
      || !postimage.lookupSignature.startsWith(`${postimage.schema}.${postimage.name}(`)
      || typeof postimage.securityDefiner !== "boolean" || !["i", "s", "v"].includes(postimage.volatility)
      || !Array.isArray(postimage.configuration)
      || !postimage.configuration.includes(`search_path=${postimage.searchPath === '""' ? '""' : postimage.searchPath.split(",").join(", ")}`)) {
      throw new Error("invalid quantity v4 postimage");
    }
    signatures.add(postimage.signature);
    if (preimage) {
      existing += 1;
      for (const key of ["signature", "owner", "allowedAcl", "searchPath", "configuration", "securityDefiner", "volatility"]) {
        if (JSON.stringify(preimage[key]) !== JSON.stringify(postimage[key])) throw new Error(`quantity v4 metadata changed: ${key}`);
      }
    } else if (postimage.owner !== "postgres" || postimage.allowedAcl !== (privileges.get(postimage.name) ?? "")) {
      throw new Error("quantity v4 new function privilege drift");
    }
  }
  if (existing !== 33) throw new Error("quantity v4 preimage identity drift");
  const preserved = new Set(["public.create_product_planner_entry(uuid,uuid,date,uuid,numeric,text,uuid)",
    "public.update_product_planner_entry_quantity(uuid,uuid,numeric,text)",
    "public.list_food_products(uuid,text,timestampwithtimezone,uuid,integer)"]);
  for (const { preimage, postimage } of manifest.preserved_overloads) {
    if (!preserved.delete(postimage.signature) || JSON.stringify(preimage) !== JSON.stringify(postimage)) {
      throw new Error("quantity v4 preserved overload drift");
    }
  }
  const worker = JSON.parse(readFileSync(join(REPOSITORY_ROOT, "docs/security/youtube-worker-quantity-function-postimages.json"), "utf8"));
  if (worker.migration_sha256 !== manifest.migrations[5].sha256 || worker.functions.length !== 13
    || worker.catalog_before !== manifest.catalog_before || worker.catalog_after !== manifest.catalog_after) {
    throw new Error("quantity v4 worker provenance drift");
  }
  for (const { postimage } of worker.functions) {
    const registered = manifest.functions.find((entry) => entry.postimage.signature === normalizeSignature(postimage.signature))?.postimage;
    if (!registered || registered.sourceHash !== postimage.source_md5 || registered.definitionSha256 !== postimage.definition_sha256
      || registered.owner !== postimage.owner || registered.securityDefiner !== postimage.security_definer
      || registered.volatility !== postimage.volatility || JSON.stringify(registered.configuration) !== JSON.stringify(postimage.config)) {
      throw new Error("quantity v4 worker execution contract drift");
    }
  }
  return manifest;
}

function withQuantityV4Contracts(contracts) {
  const result = [...contracts];
  const manifest = quantityV4Postimages();
  for (const { postimage, checkedInInventoryPreimageMd5 } of [...manifest.functions, ...manifest.preserved_overloads]) {
    const index = result.findIndex((entry) => entry.signature === postimage.signature);
    if (index >= 0) {
      if (result[index].sourceHash !== checkedInInventoryPreimageMd5) throw new Error("quantity v4 checked-in preimage drift");
      result[index] = { ...result[index], sourceHash: postimage.sourceHash,
        configuration: postimage.configuration, quantityVolatility: postimage.volatility };
    } else result.push(postimage);
  }
  return result;
}

function weightAttestationPostimages() {
  const manifest = JSON.parse(readFileSync(WEIGHT_ATTESTATION_POSTIMAGES_PATH, "utf8"));
  const quantity = quantityV4Postimages();
  if (manifest.schema_version !== 1 || manifest.status !== "local-review-draft"
    || manifest.migration !== "supabase/migrations/20261014224500_cooked_weight_user_attestation.sql"
    || createHash("sha256").update(readFileSync(join(REPOSITORY_ROOT, manifest.migration))).digest("hex") !== manifest.migration_sha256
    || manifest.predecessor_C01_sha256 !== cookedWeightPostimages().migration_sha256
    || JSON.stringify(manifest.predecessor_C04_migrations) !== JSON.stringify(quantity.migrations)
    || manifest.schema_archive_sha256 !== "5447e5ae08359feb9750676820968daf2edcf0ed57b64997e718ccc8d8dae790"
    || manifest.roles_sha256 !== "a37b43865c14194ab8aae8758c7f596679cc50e93f425d0af52767f54b9145d3"
    || manifest.application_rows_restored !== 0 || manifest.whole_inventory_drift_not_waived !== true
    || manifest.worker_catalog_unchanged !== quantity.catalog_after || manifest.functions.length !== 10) throw new Error("weight attestation provenance drift");
  const publicRpcs = new Set(["read_cooked_weight_attestation", "complete_snapshot_v2_cooking_session_with_attestation",
    "mutate_cooked_batch_weight_with_attestation", "retract_cooked_weight_attestation"]);
  for (const { postimage, preimage } of manifest.functions) {
    if (postimage.signature !== normalizeSignature(postimage.lookupSignature) || !/^[a-f0-9]{32}$/u.test(postimage.sourceHash)
      || !/^[a-f0-9]{64}$/u.test(postimage.definitionSha256) || postimage.owner !== "postgres"
      || postimage.allowedAcl !== (publicRpcs.has(postimage.name) ? "service_role:EXECUTE:false" : "")
      || postimage.searchPath !== "pg_catalog,public,private,pg_temp"
      || JSON.stringify(postimage.configuration) !== JSON.stringify(["search_path=pg_catalog, public, private, pg_temp"])) {
      throw new Error("weight attestation execution contract drift");
    }
    if (preimage) for (const key of ["owner", "allowedAcl", "configuration", "securityDefiner", "volatility"]) {
      if (JSON.stringify(preimage[key]) !== JSON.stringify(postimage[key])) throw new Error(`weight attestation prior metadata drift: ${key}`);
    }
  }
  const predecessor = manifest.preserved_scope_predecessor;
  const before = manifest.functions.find(entry => entry.postimage.name === "verify_full_local_internal_scope")?.preimage;
  const alias = manifest.functions.find(entry => entry.postimage.name === "verify_scope_pre_weight_attestation_20261014")?.postimage;
  if (!before || !alias || predecessor.body_and_attributes_unchanged !== true
    || JSON.stringify(predecessor.before) !== JSON.stringify(before) || JSON.stringify(predecessor.renamed) !== JSON.stringify(alias)
    || ["sourceHash", "owner", "allowedAcl", "configuration", "securityDefiner", "volatility"].some(key => JSON.stringify(before[key]) !== JSON.stringify(alias[key]))) {
    throw new Error("weight attestation prior scope drift");
  }
  return manifest;
}
function withWeightAttestationContracts(contracts) {
  const result = [...contracts];
  for (const { postimage, checkedInInventoryPreimageMd5 } of weightAttestationPostimages().functions) {
    const index = result.findIndex(entry => entry.signature === postimage.signature);
    if (index < 0) result.push(postimage);
    else {
      if (result[index].sourceHash !== checkedInInventoryPreimageMd5) throw new Error("weight attestation registered preimage drift");
      result[index] = postimage;
    }
  }
  return result;
}
export function buildCookedWeightAttestationSourceFunctionInventorySql() {
  return buildSourceFunctionInventorySql(weightAttestationPostimages().functions.map(entry => entry.postimage), true);
}
export function assertCookedWeightAttestationSourceFunctionInventoryResult(result) {
  return assertSourceFunctionInventoryResult(result, 10);
}

export function buildQuantityInputV4SourceFunctionInventorySql() {
  const manifest = quantityV4Postimages();
  return buildSourceFunctionInventorySql([...manifest.functions, ...manifest.preserved_overloads].map((entry) => entry.postimage));
}

export function assertQuantityInputV4SourceFunctionInventoryResult(result) {
  return assertSourceFunctionInventoryResult(result, 63);
}

export function buildRecipeProductSourceFunctionInventorySql({ includeCookedWeightEvidenceFunctions = false, includeQuantityInputV4Functions = false, includeCookedWeightAttestationFunctions = false } = {}) {
  const contracts = recipeProductPostimages().functions.map((entry) => entry.postimage);
  const weight = includeCookedWeightEvidenceFunctions ? withCookedWeightContracts(contracts) : contracts;
  if (includeQuantityInputV4Functions && !includeCookedWeightEvidenceFunctions) {
    throw new Error("quantity v4 inventory requires the C03 and C01 predecessor contracts");
  }
  const quantity = includeQuantityInputV4Functions ? withQuantityV4Contracts(weight) : weight;
  if (includeCookedWeightAttestationFunctions && !includeQuantityInputV4Functions) throw new Error("weight attestation requires quantity v4 predecessor contracts");
  return buildSourceFunctionInventorySql(includeCookedWeightAttestationFunctions ? withWeightAttestationContracts(quantity) : quantity);
}

export function buildCookedWeightEvidenceSourceFunctionInventorySql() {
  return buildSourceFunctionInventorySql(cookedWeightPostimages().functions.map((entry) => entry.postimage));
}

function buildSourceFunctionInventorySql(functions, includeDefinitions = false) {
  const rows = functions.map((entry) => [entry.lookupSignature, entry.sourceHash,
    entry.owner, String(entry.securityDefiner), `search_path=${entry.searchPath}`, entry.allowedAcl, entry.volatility,
    entry.configuration ? JSON.stringify(entry.configuration) : "", includeDefinitions ? entry.definitionSha256 : ""]);
  return `with expected(signature, body_md5, owner_name, security_definer, search_path, allowed_acl, volatility, configuration, definition_sha256) as (
    values ${valuesSql(rows)}
  ), actual as (
    select expected.*, p.oid, md5(btrim(p.prosrc,chr(10))) as actual_body,
      pg_get_userbyid(p.proowner) as actual_owner, p.prosecdef as actual_security, p.provolatile::text as actual_volatility,
      encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') as actual_definition,
      replace(coalesce((select c from unnest(p.proconfig) c where c like 'search_path=%'),''),' ','') as actual_path,
      to_jsonb(p.proconfig) as actual_configuration,
      coalesce((select string_agg((case when a.grantee=0 then 'public' else r.rolname end)||':'||a.privilege_type||':'||a.is_grantable::text,','
        order by (case when a.grantee=0 then 'public' else r.rolname end),a.privilege_type,a.is_grantable)
        from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a left join pg_roles r on r.oid=a.grantee
        where a.grantee is distinct from p.proowner),'') as actual_acl
    from expected left join pg_proc p on p.oid=to_regprocedure(expected.signature)
  ) select jsonb_build_object('required_functions',count(*),
    'missing',count(*) filter(where oid is null),
    'body',count(*) filter(where actual_body is distinct from body_md5
      or (nullif(definition_sha256,'') is not null and actual_definition is distinct from definition_sha256)),
    'owner',count(*) filter(where actual_owner is distinct from owner_name),
    'security',count(*) filter(where actual_security is distinct from security_definer::boolean),
    'search_path',count(*) filter(where actual_path is distinct from search_path
      or (nullif(configuration,'') is not null and actual_configuration is distinct from configuration::jsonb)),
    'acl',count(*) filter(where actual_acl is distinct from allowed_acl),
    'volatility',count(*) filter(where actual_volatility is distinct from volatility)) from actual;`;
}

export function assertRecipeProductSourceFunctionInventoryResult(result, { includeCookedWeightEvidenceFunctions = false, includeQuantityInputV4Functions = false, includeCookedWeightAttestationFunctions = false } = {}) {
  if (includeQuantityInputV4Functions && !includeCookedWeightEvidenceFunctions) {
    throw new Error("quantity v4 inventory requires the C03 and C01 predecessor contracts");
  }
  const count = includeQuantityInputV4Functions
    ? withQuantityV4Contracts(withCookedWeightContracts(recipeProductPostimages().functions.map((entry) => entry.postimage))).length
    : includeCookedWeightEvidenceFunctions ? 38 : 24;
  if (includeCookedWeightAttestationFunctions && !includeQuantityInputV4Functions) throw new Error("weight attestation requires quantity v4 predecessor contracts");
  return assertSourceFunctionInventoryResult(result, count + (includeCookedWeightAttestationFunctions ? 9 : 0));
}

export function assertCookedWeightEvidenceSourceFunctionInventoryResult(result) {
  return assertSourceFunctionInventoryResult(result, 15);
}

function assertSourceFunctionInventoryResult(result, count) {
  const keys = ["required_functions", "missing", "body", "owner", "security", "search_path", "acl", "volatility"];
  if (!result || Object.keys(result).length !== keys.length
    || result.required_functions !== count || keys.slice(1).some((key) => result[key] !== 0)) {
    throw new Error("recipe product source inventory failed closed");
  }
  return result;
}
const CORE_POLICY_CONTRACT = CORE_POLICY_SOURCES.map(([migration, name]) =>
  parsePolicy(migration, name)
);
const SNAPSHOT_POLICY_CONTRACT = SNAPSHOT_POLICY_SOURCES.map(
  ([migration, name]) => parsePolicy(migration, name),
);

for (const table of SNAPSHOT_READ_TABLES) {
  if (table.rls_enabled !== true) {
    throw new Error(`snapshot read table must keep RLS enabled: ${table.name}`);
  }
  for (const policy of table.policies) {
    const parsed = SNAPSHOT_POLICY_CONTRACT.find((entry) =>
      entry.schema === table.schema
      && entry.table === table.name
      && entry.name === policy.name
    );
    if (
      !parsed
      || parsed.command !== policy.command
      || parsed.roles !== [...policy.roles].sort().join(",")
      || parsed.permissive !== policy.permissive
      || parsed.using !== canonicalizePredicate(policy.using)
      || parsed.check !== canonicalizePredicate(policy.check)
    ) {
      throw new Error(`snapshot read policy manifest drift: ${policy.name}`);
    }
  }
}

function valuesSql(rows) {
  return rows.map((row) => `(${row.map(sqlLiteral).join(", ")})`).join(",\n      ");
}

function buildSecurityInventoryExpression({
  includeCookedBatchPolicyCutover,
  includeSnapshotTables,
  includePersonalRecipeFunctions,
  includeRecipeFuturePropagationFunctions,
  includeRecipeProductFunctions,
  includeCookedWeightEvidenceFunctions,
  includeQuantityInputV4Functions,
  includeCookedWeightAttestationFunctions,
}) {
  const baseFunctions = includeSnapshotTables
    ? [...FUNCTION_CONTRACT, ...SNAPSHOT_FUNCTION_CONTRACT]
    : FUNCTION_CONTRACT;
  const functionsWithPersonalRecipe = includePersonalRecipeFunctions
    ? [...baseFunctions, ...PERSONAL_RECIPE_FUNCTION_CONTRACT]
    : baseFunctions;
  const legacyFunctions = includeRecipeFuturePropagationFunctions
    ? [
        ...functionsWithPersonalRecipe,
        ...RECIPE_FUTURE_PROPAGATION_FUNCTION_CONTRACT,
      ]
    : functionsWithPersonalRecipe;
  if (includeRecipeProductFunctions && !(includeSnapshotTables
    && includePersonalRecipeFunctions && includeRecipeFuturePropagationFunctions)) {
    throw new Error("recipe product inventory requires all predecessor contracts");
  }
  if (includeCookedWeightEvidenceFunctions && !includeRecipeProductFunctions) {
    throw new Error("cooked weight inventory requires the recipe product predecessor contracts");
  }
  const productFunctions = includeRecipeProductFunctions
    ? withRecipeProductContracts(legacyFunctions) : legacyFunctions;
  const weightFunctions = includeCookedWeightEvidenceFunctions
    ? withCookedWeightContracts(productFunctions) : productFunctions;
  if (includeQuantityInputV4Functions && !includeCookedWeightEvidenceFunctions) {
    throw new Error("quantity v4 inventory requires the C03 and C01 predecessor contracts");
  }
  const quantityFunctions = includeQuantityInputV4Functions ? withQuantityV4Contracts(weightFunctions) : weightFunctions;
  if (includeCookedWeightAttestationFunctions && !includeQuantityInputV4Functions) throw new Error("weight attestation requires quantity v4 predecessor contracts");
  const functions = includeCookedWeightAttestationFunctions ? withWeightAttestationContracts(quantityFunctions) : quantityFunctions;
  const legacyRlsTables = includeSnapshotTables
    ? [...CORE_RLS_TABLES, ...SNAPSHOT_RLS_TABLES]
    : CORE_RLS_TABLES;
  const rlsTables = includeCookedWeightAttestationFunctions
    ? [...legacyRlsTables, ...WEIGHT_ATTESTATION_TABLES.map(table => ["private", table, "postgres", "false"])] : legacyRlsTables;
  const snapshotPolicies = includeCookedBatchPolicyCutover
    ? SNAPSHOT_POLICY_CONTRACT.filter(
        (policy) => policy.name !== "leftover_dishes_insert_own",
      )
    : SNAPSHOT_POLICY_CONTRACT;
  const policies = includeSnapshotTables
    ? [...CORE_POLICY_CONTRACT, ...snapshotPolicies]
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
    entry.configuration ? JSON.stringify(entry.configuration) : "",
    entry.configuration ? (entry.quantityVolatility ?? entry.volatility) : "",
  ]));
  const tableValues = valuesSql(rlsTables);
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
  const snapshotTableAclSource = includeSnapshotTables
    ? `values\n      ${valuesSql(includeCookedWeightAttestationFunctions ? [...SNAPSHOT_TABLE_ACL_CONTRACT, ...WEIGHT_ATTESTATION_TABLES.map(table => ["private", table, ""])] : SNAPSHOT_TABLE_ACL_CONTRACT)}`
    : `select null::text, null::text, null::text where false`;

  return `
    with expected_functions(
      lookup_signature, signature, schema_name, function_name, source_hash, security_definer,
      owner_name, search_path, allowed_acl, configuration, quantity_volatility
    ) as (
      values
      ${functionValues}
    ), function_inventory as (
      select
        expected.*,
        procedure.oid,
        procedure.prosecdef,
        procedure.proconfig,
        procedure.provolatile::text as actual_volatility,
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
    ), membership_catalog_support as (
      select
        exists (
          select 1
          from pg_catalog.pg_attribute
          where attrelid = 'pg_catalog.pg_auth_members'::regclass
            and attname = 'inherit_option'
            and not attisdropped
        ) as has_inherit_option,
        exists (
          select 1
          from pg_catalog.pg_attribute
          where attrelid = 'pg_catalog.pg_auth_members'::regclass
            and attname = 'set_option'
            and not attisdropped
        ) as has_set_option
    ), role_membership_inventory as (
      select
        granted_role.rolname as granted_role_name,
        member_role.rolname as member_name,
        membership.admin_option,
        -- PostgreSQL 15 stores inheritance on the member role and always
        -- permits SET ROLE for memberships. PostgreSQL 16+ stores both as
        -- per-membership options in pg_auth_members.
        case
          when membership_catalog_support.has_inherit_option
            then (pg_catalog.to_jsonb(membership) ->> 'inherit_option')::boolean
          else member_role.rolinherit
        end as inherit_option,
        case
          when membership_catalog_support.has_set_option
            then (pg_catalog.to_jsonb(membership) ->> 'set_option')::boolean
          else true
        end as set_option
      from pg_catalog.pg_auth_members as membership
      cross join membership_catalog_support
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
    ), expected_rls_tables(schema_name, table_name, owner_name, force_rls) as (
      values
      ${tableValues}
    ), rls_inventory as (
      select
        expected.*,
        relation.oid,
        owner.rolname as actual_owner,
        relation.relrowsecurity,
        relation.relforcerowsecurity
      from expected_rls_tables as expected
      left join pg_catalog.pg_namespace as namespace
        on namespace.nspname = expected.schema_name
      left join pg_catalog.pg_class as relation
        on relation.relnamespace = namespace.oid
       and relation.relname = expected.table_name
       and relation.relkind in ('r', 'p')
      left join pg_catalog.pg_roles as owner on owner.oid = relation.relowner
    ), expected_snapshot_table_acls(schema_name, table_name, allowed_acl) as (
      ${snapshotTableAclSource}
    ), snapshot_table_acl_inventory as (
      select
        expected.*,
        relation.oid,
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
            relation.relacl,
            pg_catalog.acldefault('r', relation.relowner)
          )) as acl
          left join pg_catalog.pg_roles as role on role.oid = acl.grantee
          where acl.grantee is distinct from relation.relowner
        ), '') as actual_acl
      from expected_snapshot_table_acls as expected
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
      'function_security_drift_count', (select count(*) from function_inventory where oid is not null and (
        prosecdef is distinct from security_definer::boolean
        or (nullif(quantity_volatility,'') is not null and actual_volatility is distinct from quantity_volatility))),
      'function_owner_drift_count', (select count(*) from function_inventory where oid is not null and actual_owner is distinct from owner_name),
      'function_search_path_drift_count', (select count(*) from function_inventory where oid is not null and (
        actual_search_path is distinct from 'search_path=' || search_path
        or (nullif(configuration,'') is not null and to_jsonb(proconfig) is distinct from configuration::jsonb))),
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
            where procedure.oid = pg_catalog.to_regprocedure(expected.lookup_signature)
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
      'rls_owner_drift_count', (select count(*) from rls_inventory where oid is not null and actual_owner is distinct from owner_name),
      'rls_force_drift_count', (select count(*) from rls_inventory where oid is not null and relforcerowsecurity is distinct from force_rls::boolean),
      'required_snapshot_table_acl_count', (select count(*) from expected_snapshot_table_acls),
      'snapshot_table_acl_missing_count', (select count(*) from snapshot_table_acl_inventory where oid is null),
      'snapshot_table_acl_drift_count', (
        select count(*)
        from snapshot_table_acl_inventory
        where oid is not null and actual_acl is distinct from allowed_acl
      ),
      '_snapshot_table_acl_inventory', (
        select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'schema', actual.schema_name,
          'table', actual.table_name,
          'acl', actual.actual_acl
        ) order by actual.schema_name, actual.table_name), '[]'::jsonb)
        from snapshot_table_acl_inventory as actual
      ),
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
  "rls_owner_drift_count",
  "rls_force_drift_count",
  "required_snapshot_table_acl_count",
  "snapshot_table_acl_missing_count",
  "snapshot_table_acl_drift_count",
  "_snapshot_table_acl_inventory",
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
  includeCookedBatchPolicyCutover = false,
  includeSnapshotTables = false,
  includePersonalRecipeFunctions = false,
  includeRecipeFuturePropagationFunctions = false,
  includeRecipeProductFunctions = false,
  includeCookedWeightEvidenceFunctions = false,
  includeQuantityInputV4Functions = false,
  includeCookedWeightAttestationFunctions = false,
} = {}) {
  return buildSecurityInventoryExpression({
    includeCookedBatchPolicyCutover,
    includeSnapshotTables,
    includePersonalRecipeFunctions,
    includeRecipeFuturePropagationFunctions,
    includeRecipeProductFunctions,
    includeCookedWeightEvidenceFunctions,
    includeQuantityInputV4Functions,
  includeCookedWeightAttestationFunctions,
  });
}

export function buildRecipeSnapshotAuthorityFullLocalSecurityInventorySql(
  options = {},
) {
  return `select (${buildFullLocalSecurityInventoryExpression(options)})::text;`;
}

export function assertRecipeSnapshotAuthorityFullLocalSecurityInventoryResult(
  result,
  {
    includeCookedBatchPolicyCutover = false,
    includeSnapshotTables = false,
    includePersonalRecipeFunctions = false,
    includeRecipeFuturePropagationFunctions = false,
    includeRecipeProductFunctions = false,
    includeCookedWeightEvidenceFunctions = false,
    includeQuantityInputV4Functions = false,
  includeCookedWeightAttestationFunctions = false,
  } = {},
) {
  const baseFunctionCount = includeSnapshotTables
    ? FUNCTION_CONTRACT.length + SNAPSHOT_FUNCTION_CONTRACT.length
    : FUNCTION_CONTRACT.length;
  if (includeQuantityInputV4Functions && !includeCookedWeightEvidenceFunctions) {
    throw new Error("quantity v4 inventory requires the C03 and C01 predecessor contracts");
  }
  const expectedFunctionCount = baseFunctionCount
    + (includePersonalRecipeFunctions ? PERSONAL_RECIPE_FUNCTION_CONTRACT.length : 0)
    + (includeRecipeFuturePropagationFunctions
      ? RECIPE_FUTURE_PROPAGATION_FUNCTION_CONTRACT.length
      : 0)
    + (includeRecipeProductFunctions ? 19 : 0)
    + (includeCookedWeightEvidenceFunctions ? 14 : 0)
    + (includeQuantityInputV4Functions ? quantityV4Postimages().functions.filter((entry) => !entry.checkedInInventoryPreimageMd5).length + 3 : 0)
    + (includeCookedWeightAttestationFunctions ? 9 : 0);
  if (includeCookedWeightAttestationFunctions && !includeQuantityInputV4Functions) throw new Error("weight attestation requires quantity v4 predecessor contracts");
  const expectedTableCount = (includeSnapshotTables
    ? CORE_RLS_TABLES.length + SNAPSHOT_RLS_TABLES.length : CORE_RLS_TABLES.length) + (includeCookedWeightAttestationFunctions ? 2 : 0);
  const snapshotPolicies = includeCookedBatchPolicyCutover
    ? SNAPSHOT_POLICY_CONTRACT.filter(
        (policy) => policy.name !== "leftover_dishes_insert_own",
      )
    : SNAPSHOT_POLICY_CONTRACT;
  const expectedPolicyCount = includeSnapshotTables
    ? CORE_POLICY_CONTRACT.length + snapshotPolicies.length
    : CORE_POLICY_CONTRACT.length;
  const tableAcls = includeCookedWeightAttestationFunctions ? [...SNAPSHOT_TABLE_ACL_CONTRACT, ...WEIGHT_ATTESTATION_TABLES.map(table => ["private", table, ""])] : SNAPSHOT_TABLE_ACL_CONTRACT;
  const expectedSnapshotTableAclCount = includeSnapshotTables ? tableAcls.length : 0;
  const expectedPolicies = includeSnapshotTables
    ? [...CORE_POLICY_CONTRACT, ...snapshotPolicies]
    : CORE_POLICY_CONTRACT;
  const policyInventory = result?._policy_expression_inventory;
  const snapshotTableAclInventory = result?._snapshot_table_acl_inventory;
  const exactSnapshotTableAcls = Array.isArray(snapshotTableAclInventory)
    && snapshotTableAclInventory.length === expectedSnapshotTableAclCount
    && tableAcls.slice(0, expectedSnapshotTableAclCount)
      .every(([schema, table, acl]) => snapshotTableAclInventory.some((entry) =>
        entry?.schema === schema
        && entry?.table === table
        && entry?.acl === acl
      ));
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
    && result.required_snapshot_table_acl_count === expectedSnapshotTableAclCount
    && result.required_policy_count === expectedPolicyCount
    && exactSnapshotTableAcls
    && exactPolicyExpressions
    && SECURITY_ZERO_KEYS.every((key) => result[key] === 0);
  if (!valid) {
    throw new Error("full-local security inventory failed closed");
  }
  return result;
}
