#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { publishArtifactBundle } from "./lib/public-nutrition-artifacts.mjs";
import { buildInventoryArtifact } from "./lib/ingredient-nutrition-coverage.mjs";
import { runLocalPsqlJson } from "./lib/ingredient-nutrition-local-db.mjs";
import {
  buildFoodsafetyScopeSql,
  parseFoodsafetyPinnedSeed,
} from "./lib/foodsafety-pilot-contract.mjs";
import {
  IngredientNutritionImportError,
  assertPrSafeValue,
  buildRunReport,
  disableModelRun,
  parseModelCliArgs,
  publishRunWithRecovery,
  runModelImport,
  validateAllActiveInventorySnapshot,
  validateRunReport,
  validateRunReportAgainstRegistry,
} from "./lib/ingredient-nutrition-import.mjs";

const REGISTRY_ROOT = path.resolve(
  ".artifacts/ops/ingredient-nutrition-conversion-model",
);
const SAFE_RUN_ID = /^[a-z0-9][a-z0-9-]{7,79}$/;
const SAFE_INPUT_BASENAME = /^(?!\.env(?:\.|$))(?!.*(?:secret|servicekey|api[_-]?key)).+$/i;
const PINNED_PILOT_SEED = path.resolve(
  "supabase/migrations/20260626104000_seed_foodsafety_pilot_recipes.sql",
);
const STAGING_DATABASE_ADAPTER = path.resolve(
  "scripts/lib/ingredient-nutrition-staging-database-adapter.mjs",
);
const STAGING_DATABASE_ADAPTER_SHA256 =
  "a05cf6052fbef987ec31ef81751b06f58182d672a58fdf80672aca0d874efbfd";
const TEST_DATABASE_ADAPTER = path.resolve(
  "tests/fixtures/ingredient-nutrition-database-adapter.mjs",
);

function zeroWriteError(code) {
  return {
    schema_version: "ingredient-nutrition-model-run-v1",
    status: "rejected",
    error: { code },
    writes_attempted: 0,
    writes_committed: 0,
    production_db_writes: 0,
    provider_requests: 0,
    secret_leak_count: 0,
  };
}

function writeMachineJson(stream, value) {
  assertPrSafeValue(value);
  stream.write(`${JSON.stringify(value)}\n`);
}

async function readJsonInput(filePath) {
  if (
    typeof filePath !== "string" ||
    !SAFE_INPUT_BASENAME.test(path.basename(filePath))
  ) {
    throw new IngredientNutritionImportError("INPUT_FILE_FORBIDDEN");
  }
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    assertPrSafeValue(parsed);
    return parsed;
  } catch (error) {
    if (error instanceof IngredientNutritionImportError) throw error;
    throw new IngredientNutritionImportError("INPUT_FILE_INVALID");
  }
}

function assertOwnedRegularFile(candidatePath, expectedPath, expectedSha256) {
  const resolved = path.resolve(candidatePath);
  let stat;
  let realPath;
  try {
    stat = lstatSync(resolved);
    realPath = realpathSync(resolved);
  } catch {
    throw new IngredientNutritionImportError("DATABASE_ADAPTER_FORBIDDEN");
  }
  const ownerMismatch = typeof process.getuid === "function" && stat.uid !== process.getuid();
  if (
    resolved !== expectedPath ||
    realPath !== expectedPath ||
    stat.isSymbolicLink() ||
    !stat.isFile() ||
    ownerMismatch ||
    (stat.mode & 0o022) !== 0
  ) {
    throw new IngredientNutritionImportError("DATABASE_ADAPTER_FORBIDDEN");
  }
  try {
    if (
      expectedSha256 !== undefined &&
      createHash("sha256").update(readFileSync(resolved)).digest("hex") !== expectedSha256
    ) {
      throw new IngredientNutritionImportError("DATABASE_ADAPTER_FORBIDDEN");
    }
  } catch (error) {
    if (error instanceof IngredientNutritionImportError) throw error;
    throw new IngredientNutritionImportError("DATABASE_ADAPTER_FORBIDDEN");
  }
  return resolved;
}

function runOwnedDatabaseAdapter(
  adapterPath,
  expectedPath,
  sql,
  environment,
  expectedSha256,
) {
  const resolved = assertOwnedRegularFile(adapterPath, expectedPath, expectedSha256);
  const adapterEnvironment = environment === "staging"
    ? Object.fromEntries(
      ["PATH", "PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSFILE", "PGSSLMODE"]
        .filter((key) => typeof process.env[key] === "string")
        .map((key) => [key, process.env[key]]),
    )
    : {};
  const result = spawnSync(process.execPath, [resolved], {
    input: JSON.stringify({
      schema_version: "ingredient-nutrition-database-adapter-v1",
      operation: "query-json",
      sql,
    }),
    encoding: "utf8",
    timeout: 30_000,
    env: adapterEnvironment,
  });
  if (result.status !== 0 || result.error) {
    throw new IngredientNutritionImportError("STAGING_DATABASE_ADAPTER_FAILED");
  }
  try {
    const response = JSON.parse(result.stdout.trim());
    if (
      response?.schema_version !== "ingredient-nutrition-database-adapter-result-v1" ||
      response?.status !== "ok"
    ) {
      throw new Error("invalid adapter result");
    }
    assertPrSafeValue(response.result);
    return response.result;
  } catch (error) {
    if (error instanceof IngredientNutritionImportError) throw error;
    throw new IngredientNutritionImportError("STAGING_DATABASE_ADAPTER_RESPONSE_INVALID");
  }
}

function runTestDatabaseAdapter(adapterPath, sql) {
  if (process.env.VITEST !== "true" && process.env.NODE_ENV !== "test") {
    throw new IngredientNutritionImportError("DATABASE_ADAPTER_FORBIDDEN");
  }
  return runOwnedDatabaseAdapter(
    adapterPath,
    TEST_DATABASE_ADAPTER,
    sql,
    "test",
  );
}

function runDatabaseJson(environment, sql) {
  if (environment === "production") {
    throw new IngredientNutritionImportError("PRODUCTION_LOAD_APPROVAL_REQUIRED");
  }
  if (environment === "staging") {
    return runOwnedDatabaseAdapter(
      STAGING_DATABASE_ADAPTER,
      STAGING_DATABASE_ADAPTER,
      sql,
      "staging",
      STAGING_DATABASE_ADAPTER_SHA256,
    );
  }
  return runLocalPsqlJson(sql);
}

function resolveAllActiveScope(environment) {
  return runDatabaseJson(environment, `
select json_build_object(
  'ingredients',
  coalesce(
    json_agg(
      json_build_object(
        'ingredient_id', ingredient.id::text,
        'canonical_name', ingredient.standard_name,
        'category_code', ingredient.category,
        'category_name', ingredient.category,
        'default_unit', ingredient.default_unit,
        'synonyms', ingredient.synonyms
      )
      order by ingredient.id
    ),
    '[]'::json
  ),
  'canonical_ingredients',
  coalesce(
    json_agg(
      json_build_object(
        'id', ingredient.id::text,
        'normalized_names',
        array_remove(array_prepend(ingredient.standard_name, ingredient.synonyms), null),
        'preparation_state', null,
        'edible_portion', null,
        'basis_dimension', null
      )
      order by ingredient.id
    ),
    '[]'::json
  )
)::text
from (
  select
    ingredient.id,
    ingredient.standard_name,
    ingredient.category,
    ingredient.default_unit,
    coalesce(
      array_agg(distinct synonym.synonym order by synonym.synonym)
      filter (where synonym.synonym is not null),
      '{}'::text[]
    ) as synonyms
  from public.ingredients ingredient
  left join public.ingredient_synonyms synonym on synonym.ingredient_id = ingredient.id
  group by ingredient.id, ingredient.standard_name, ingredient.category, ingredient.default_unit
) ingredient;
`);
}

function resolveFoodsafetyPilotScope(environment) {
  const contract = readPinnedPilotContract();
  return runDatabaseJson(environment, buildFoodsafetyScopeSql(contract).actual);
}

function readPinnedPilotContract() {
  return parseFoodsafetyPinnedSeed(readFileSync(PINNED_PILOT_SEED, "utf8"));
}

function resolvePinnedPilotScope(environment) {
  const contract = readPinnedPilotContract();
  return runDatabaseJson(environment, buildFoodsafetyScopeSql(contract).expected);
}

function createDatabaseStore(environment) {
  const query = (sql) => runDatabaseJson(environment, sql);
  return {
    findRun(idempotencyKey) {
      const encoded = Buffer.from(idempotencyKey, "utf8").toString("base64");
      const registry = query(`select coalesce(public.get_ingredient_nutrition_model_run(convert_from(decode('${encoded}', 'base64'), 'UTF8')), 'null'::jsonb)::text;`);
      return registry === null ? null : registry.summary;
    },
    getRunRegistry(idempotencyKey) {
      const encoded = Buffer.from(idempotencyKey, "utf8").toString("base64");
      return query(`select coalesce(public.get_ingredient_nutrition_model_run(convert_from(decode('${encoded}', 'base64'), 'UTF8')), 'null'::jsonb)::text;`);
    },
    async applyModelBundle(model) {
      const encoded = Buffer.from(JSON.stringify(model), "utf8").toString("base64");
      return query(
        `select public.apply_ingredient_nutrition_model(convert_from(decode('${encoded}', 'base64'), 'UTF8')::jsonb)::text;`,
      );
    },
    async disableAppliedModel({ report, decision, disable_key: disableKey }) {
      const encoded = Buffer.from(
        JSON.stringify({ report, decision, disable_key: disableKey }),
        "utf8",
      ).toString("base64");
      return query(`
with input as (
  select convert_from(decode('${encoded}', 'base64'), 'UTF8')::jsonb as value
)
select public.disable_ingredient_nutrition_model(
  value -> 'report' ->> 'idempotency_key',
  value ->> 'disable_key',
  (value -> 'decision' ->> 'reviewed_by')::uuid,
  value -> 'decision' ->> 'reason',
  (value -> 'decision' ->> 'reviewed_at')::timestamptz
)::text from input;
`);
    },
    async getCoverageStats({ inventory_ids: inventoryIds, excluded_ingredient_ids: excludedIngredientIds }) {
      const encoded = Buffer.from(
        JSON.stringify({
          inventory_ids: inventoryIds,
          excluded_ingredient_ids: excludedIngredientIds,
        }),
        "utf8",
      ).toString("base64");
      return query(`
with input as (
  select convert_from(decode('${encoded}', 'base64'), 'UTF8')::jsonb as value
),
inventory as (
  select jsonb_array_elements_text(value -> 'inventory_ids') as ingredient_id
  from input
),
excluded as (
  select jsonb_array_elements_text(value -> 'excluded_ingredient_ids') as ingredient_id
  from input
),
qualified_primary_counts as (
  select
    inventory.ingredient_id,
    count(*) filter (
      where link.review_status = 'approved'
        and link.is_active
        and link.is_primary
        and profile.review_status = 'approved'
        and profile.is_active
        and item.review_status = 'approved'
        and source.freshness_status = 'current'
        and source.review_status = 'approved'
        and source.is_active
    ) as active_primary_count
  from inventory
  left join public.ingredient_nutrition_profiles link
    on link.ingredient_id::text = inventory.ingredient_id
  left join public.nutrition_profiles profile
    on profile.id = link.nutrition_profile_id
  left join public.nutrition_source_items item
    on item.id = profile.source_item_id
  left join public.nutrition_sources source
    on source.id = item.source_id
  group by inventory.ingredient_id
)
select json_build_object(
  'denominator_count',
  (select count(*) from inventory),
  'approved_exactly_one_count',
  (
    select count(*)
    from qualified_primary_counts
    where ingredient_id not in (select ingredient_id from excluded)
      and active_primary_count = 1
  ),
  'excluded_count',
  (select count(*) from excluded),
  'eligible_without_profile',
  (
    select count(*)
    from qualified_primary_counts
    where ingredient_id not in (select ingredient_id from excluded)
      and active_primary_count = 0
  ),
  'unclassified',
  (
    select count(*)
    from qualified_primary_counts
    where ingredient_id not in (select ingredient_id from excluded)
      and active_primary_count <> 1
  ),
  'classification_conflict',
  (
    select count(*)
    from qualified_primary_counts
    where ingredient_id in (select ingredient_id from excluded)
      and active_primary_count > 0
  ),
  'multiple_qualified_primary',
  (
    select count(*)
    from qualified_primary_counts
    where ingredient_id not in (select ingredient_id from excluded)
      and active_primary_count > 1
  )
)::text;
`);
    },
  };
}

async function publishRun(summary, registryRoot = REGISTRY_ROOT) {
  const report = buildRunReport(summary);
  const outputDir = path.join(registryRoot, summary.run_id);
  await publishArtifactBundle(outputDir, {
    "summary.json": `${JSON.stringify(summary, null, 2)}\n`,
    "report.json": `${JSON.stringify(report, null, 2)}\n`,
  });
  return report;
}

async function loadRegisteredReport(runId, store, options = {}) {
  if (!SAFE_RUN_ID.test(runId)) {
    throw new IngredientNutritionImportError("INVALID_RUN_REPORT");
  }
  const registryRoot = options.registryRoot ?? REGISTRY_ROOT;
  const reportPath = path.join(registryRoot, runId, "report.json");
  const hasStore = store !== undefined;
  const registry = !hasStore
    ? null
    : await store.getRunRegistry(runId);
  if (existsSync(reportPath)) {
    try {
      const report = JSON.parse(readFileSync(reportPath, "utf8"));
      const validated = validateRunReport(report);
      return !hasStore
        ? validated
        : validateRunReportAgainstRegistry(validated, registry);
    } catch (error) {
      if (error instanceof IngredientNutritionImportError) throw error;
      throw new IngredientNutritionImportError("INVALID_RUN_REPORT");
    }
  }
  if (registry === null || typeof registry?.summary !== "object") {
    throw new IngredientNutritionImportError("INVALID_RUN_REPORT");
  }
  const recoveredSummary = {
    ...registry.summary,
    report_publication_status: "recovered",
  };
  const recoveredReport = validateRunReportAgainstRegistry(
    buildRunReport(recoveredSummary),
    registry,
  );
  const publisher = options.publisher ?? ((summary) => publishRun(summary, registryRoot));
  await publishRunWithRecovery(recoveredSummary, publisher);
  return recoveredReport;
}

async function publishCommandRun(summary, store, options = {}) {
  const publisher = options.publisher ?? publishRun;
  const reportLoader = options.reportLoader ?? loadRegisteredReport;
  if (summary.replayed === true) {
    await reportLoader(summary.run_id, store);
    return summary;
  }
  await publishRunWithRecovery(summary, publisher);
  return summary;
}

function formatCliFailure(error) {
  const code = error instanceof IngredientNutritionImportError
    ? error.code
    : "INGREDIENT_NUTRITION_MODEL_FAILED";
  return error instanceof IngredientNutritionImportError && error.summary
    ? {
        ...error.summary,
        status: code === "REPORT_PUBLICATION_PENDING"
          ? error.summary.status
          : "rejected",
        error: { code },
      }
    : zeroWriteError(code);
}

async function importCommand(args) {
  const bundleFiles = Array.isArray(args.bundles)
    ? args.bundles
    : args.bundle === undefined
      ? []
      : [args.bundle];
  const bundles = await Promise.all(bundleFiles.map((file) => readJsonInput(file)));
  const approval = args.approval_file === undefined
    ? null
    : await readJsonInput(args.approval_file);
  if (args.mode === "apply" && args.environment === "production") {
    throw new IngredientNutritionImportError("PRODUCTION_LOAD_APPROVAL_REQUIRED");
  }
  if (args.pilot_scope === "all-active") {
    const inventory = await readJsonInput(args.inventory_file);
    const decision = await readJsonInput(args.decision_file);
    const allActiveContext = resolveAllActiveScope(args.environment);
    const liveInventory = buildInventoryArtifact({
      ingredients: allActiveContext.ingredients,
      query_version: "all-active-inventory-sql-v1",
    });
    validateAllActiveInventorySnapshot({
      inventory,
      decision,
      live_inventory_checksum: liveInventory.checksum,
    });
    const store = createDatabaseStore(args.environment);
    const summary = await runModelImport({
      ...(bundles.length === 1 ? { bundle: bundles[0] } : { bundles }),
      mode: args.mode,
      environment: args.environment,
      pilot_scope: args.pilot_scope,
      inventory,
      decision,
      canonical_ingredients: allActiveContext.canonical_ingredients,
      approval,
      store,
    });
    await publishCommandRun(summary, store);
    return summary;
  }
  const actualPilotContext = resolveFoodsafetyPilotScope(
    args.environment,
  );
  const expectedPilotScope = resolvePinnedPilotScope(
    args.environment,
  );
  const store = createDatabaseStore(args.environment);
  const summary = await runModelImport({
    bundle: bundles[0],
    mode: args.mode,
    environment: args.environment,
    pilot_scope: args.pilot_scope,
    actual_pilot_scope: {
      recipe_ids: actualPilotContext.recipe_ids,
      ingredient_ids: actualPilotContext.ingredient_ids,
    },
    expected_pilot_scope: expectedPilotScope,
    canonical_ingredients: actualPilotContext.canonical_ingredients,
    approval,
    store,
  });
  await publishCommandRun(summary, store);
  return summary;
}

async function inventoryCommand(args) {
  const allActiveContext = resolveAllActiveScope(args.environment ?? "local");
  return buildInventoryArtifact({
    ingredients: allActiveContext.ingredients,
    query_version: "all-active-inventory-sql-v1",
  });
}

async function reportCommand(args) {
  return loadRegisteredReport(
    args.run_id,
    createDatabaseStore(args.environment ?? "local"),
  );
}

async function disableCommand(args) {
  const store = createDatabaseStore(args.environment);
  const report = await loadRegisteredReport(args.run_id, store);
  const decision = await readJsonInput(args.approval_file);
  const summary = await disableModelRun({
    report,
    store,
    environment: args.environment,
    decision,
  });
  summary.run_id = `disable-${summary.idempotency_key.slice(0, 24)}`;
  await publishCommandRun(summary, store);
  return summary;
}

async function main() {
  const command = process.argv[2];
  try {
    const args = parseModelCliArgs(command, process.argv.slice(3));
    const result = command === "inventory"
      ? await inventoryCommand(args)
      : command === "import"
        ? await importCommand(args)
        : command === "report"
          ? await reportCommand(args)
          : await disableCommand(args);
    writeMachineJson(process.stdout, result);
  } catch (error) {
    writeMachineJson(process.stderr, formatCliFailure(error));
    process.exitCode = 1;
  }
}

const invokedUrl = process.argv[1] === undefined
  ? null
  : pathToFileURL(path.resolve(process.argv[1])).href;
if (import.meta.url === invokedUrl) await main();

export {
  assertOwnedRegularFile,
  formatCliFailure,
  loadRegisteredReport,
  publishCommandRun,
  runTestDatabaseAdapter,
};
