const REQUIRED_RELATIONS = Object.freeze([
  "public.recipe_content_snapshots",
  "public.cooking_session_meal_claims",
  "public.food_product_ingredient_links",
  "public.shopping_meal_snapshot_clone_tokens",
  "public.recipe_change_previews",
]);

const REQUIRED_COLUMNS = Object.freeze([
  "public.meals.recipe_content_snapshot_id",
]);

const REQUIRED_FUNCTIONS = Object.freeze([
  "public.list_product_planner_entries(uuid,date,date,uuid)",
  "public.read_recipe_snapshot_entrypoint_context(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid)",
  "public.select_pantry_effective_ingredients(uuid)",
  "public.write_personal_recipe_core(uuid,timestamp with time zone,text,integer,timestamp with time zone,text,uuid,uuid,bigint,jsonb,jsonb,jsonb,uuid,bigint,uuid,timestamp with time zone)",
]);

const STATUS_VALUES = new Set(["PASS", "BLOCKED"]);
const RELATION_SET = new Set(REQUIRED_RELATIONS);
const COLUMN_SET = new Set(REQUIRED_COLUMNS);
const FUNCTION_SET = new Set(REQUIRED_FUNCTIONS);

function formatSqlText(value) {
  return value.replaceAll("'", "''");
}

function requiredRelationValuesSql() {
  return REQUIRED_RELATIONS
    .map((identifier) => {
      const [schemaName, relationName] = identifier.split(".");
      return `('${formatSqlText(identifier)}', '${formatSqlText(schemaName)}', '${formatSqlText(relationName)}')`;
    })
    .join(",\n    ");
}

function requiredColumnValuesSql() {
  return REQUIRED_COLUMNS
    .map((identifier) => {
      const [schemaName, relationName, columnName] = identifier.split(".");
      return `('${formatSqlText(identifier)}', '${formatSqlText(schemaName)}', '${formatSqlText(relationName)}', '${formatSqlText(columnName)}')`;
    })
    .join(",\n    ");
}

function requiredFunctionValuesSql() {
  return REQUIRED_FUNCTIONS
    .map((signature) => `('${formatSqlText(signature)}')`)
    .join(",\n    ");
}

function exactObjectKeys(value, expectedKeys) {
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).length === expectedKeys.length
    && expectedKeys.every((key) => Object.hasOwn(value, key));
}

function sanitizeIdentifierList(value, allowed) {
  if (!Array.isArray(value)) {
    throw new Error("Product catalog gate must return a single safe product catalog gate result.");
  }
  const seen = new Set();
  return value.map((entry) => {
    if (typeof entry !== "string" || !allowed.has(entry) || seen.has(entry)) {
      throw new Error("Product catalog gate must return a single safe product catalog gate result.");
    }
    seen.add(entry);
    return entry;
  });
}

export function buildFullLocalProductCatalogCtesSql() {
  return [
    "required_relations(identifier, schema_name, relation_name) as (",
    "  values",
    `    ${requiredRelationValuesSql()}`,
    ")",
    ", required_columns(identifier, schema_name, relation_name, column_name) as (",
    "  values",
    `    ${requiredColumnValuesSql()}`,
    ")",
    ", required_functions(signature) as (",
    "  values",
    `    ${requiredFunctionValuesSql()}`,
    ")",
    ", relation_checks as (",
    "  select",
    "    relation_requirement.identifier,",
    "    to_regclass(relation_requirement.schema_name || '.' || relation_requirement.relation_name) is not null as present",
    "  from required_relations as relation_requirement",
    ")",
    ", column_checks as (",
    "  select",
    "    column_requirement.identifier,",
    "    exists (",
    "      select 1",
    "      from pg_catalog.pg_attribute as attribute",
    "      join pg_catalog.pg_class as relation",
    "        on relation.oid = attribute.attrelid",
    "      join pg_catalog.pg_namespace as namespace",
    "        on namespace.oid = relation.relnamespace",
    "      where namespace.nspname = column_requirement.schema_name",
    "        and relation.relname = column_requirement.relation_name",
    "        and attribute.attname = column_requirement.column_name",
    "        and attribute.attnum > 0",
    "        and not attribute.attisdropped",
    "    ) as present",
    "  from required_columns as column_requirement",
    ")",
    ", function_checks as (",
    "  select",
    "    function_requirement.signature,",
    "    to_regprocedure(function_requirement.signature) is not null as present",
    "  from required_functions as function_requirement",
    ")",
  ].join("\n");
}

export function buildFullLocalProductCatalogStatusSelectSql() {
  return [
    "select json_build_object(",
    "  'status', case",
    "    when bool_and(relation_checks.present)",
    "      and bool_and(column_checks.present)",
    "      and bool_and(function_checks.present)",
    "      then 'PASS'",
    "    else 'BLOCKED'",
    "  end,",
    "  'missing_relations', coalesce(",
    "    (select json_agg(identifier order by identifier) from relation_checks where not present),",
    "    '[]'::json",
    "  ),",
    "  'missing_columns', coalesce(",
    "    (select json_agg(identifier order by identifier) from column_checks where not present),",
    "    '[]'::json",
    "  ),",
    "  'missing_functions', coalesce(",
    "    (select json_agg(signature order by signature) from function_checks where not present),",
    "    '[]'::json",
    "  )",
    ")::text",
    "from relation_checks, column_checks, function_checks",
    "limit 1;",
  ].join("\n");
}

export function buildFullLocalProductCatalogSql() {
  return [
    "begin transaction read only;",
    "set local statement_timeout = '5s';",
    "with",
    buildFullLocalProductCatalogCtesSql(),
    buildFullLocalProductCatalogStatusSelectSql(),
    "rollback;",
    "",
  ].join("\n");
}

export function parseFullLocalProductCatalogSqlOutput(stdout) {
  const lines = String(stdout)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== 1) {
    throw new Error("Product catalog gate must return a single safe product catalog gate result.");
  }

  let parsed;
  try {
    parsed = JSON.parse(lines[0]);
  } catch {
    throw new Error("Product catalog gate must return a single safe product catalog gate result.");
  }

  if (!exactObjectKeys(parsed, [
    "status",
    "missing_relations",
    "missing_columns",
    "missing_functions",
  ])) {
    throw new Error("Product catalog gate must return a single safe product catalog gate result.");
  }

  if (typeof parsed.status !== "string" || !STATUS_VALUES.has(parsed.status)) {
    throw new Error("Product catalog gate must return a single safe product catalog gate result.");
  }

  const missingRelations = sanitizeIdentifierList(
    parsed.missing_relations,
    RELATION_SET,
  );
  const missingColumns = sanitizeIdentifierList(
    parsed.missing_columns,
    COLUMN_SET,
  );
  const missingFunctions = sanitizeIdentifierList(
    parsed.missing_functions,
    FUNCTION_SET,
  );

  const expectedStatus = (
    missingRelations.length === 0
    && missingColumns.length === 0
    && missingFunctions.length === 0
  ) ? "PASS" : "BLOCKED";

  if (parsed.status !== expectedStatus) {
    throw new Error("Product catalog gate must return a single safe product catalog gate result.");
  }

  return Object.freeze({
    status: parsed.status,
    missingRelations,
    missingColumns,
    missingFunctions,
  });
}

export const FULL_LOCAL_REQUIRED_PRODUCT_RELATIONS = REQUIRED_RELATIONS;
export const FULL_LOCAL_REQUIRED_PRODUCT_COLUMNS = REQUIRED_COLUMNS;
export const FULL_LOCAL_REQUIRED_PRODUCT_FUNCTIONS = REQUIRED_FUNCTIONS;
