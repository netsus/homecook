#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { publishArtifactBundle } from "./lib/public-nutrition-artifacts.mjs";
import {
  IngredientNutritionImportError,
  assertPrSafeValue,
  buildRunReport,
  disableModelRun,
  parseModelCliArgs,
  publishRunWithRecovery,
  runModelImport,
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

function runLocalPsqlJson(sql) {
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_homecook",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, encoding: "utf8", timeout: 30_000 },
  );
  if (result.status !== 0 || result.error) {
    throw new IngredientNutritionImportError("LOCAL_DATABASE_UNAVAILABLE");
  }
  const output = result.stdout.trim().split("\n").filter(Boolean).at(-1);
  try {
    return JSON.parse(output);
  } catch {
    throw new IngredientNutritionImportError("LOCAL_DATABASE_RESPONSE_INVALID");
  }
}

function runExplicitDatabaseAdapter(adapterPath, sql) {
  const resolved = path.resolve(adapterPath);
  const relative = path.relative(process.cwd(), resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new IngredientNutritionImportError("DATABASE_ADAPTER_FORBIDDEN");
  }
  const result = spawnSync(process.execPath, [resolved], {
    input: JSON.stringify({
      schema_version: "ingredient-nutrition-database-adapter-v1",
      operation: "query-json",
      sql,
    }),
    encoding: "utf8",
    timeout: 30_000,
    env: {},
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

function runDatabaseJson(environment, adapterPath, sql) {
  if (environment === "production") {
    throw new IngredientNutritionImportError("PRODUCTION_LOAD_APPROVAL_REQUIRED");
  }
  if (adapterPath !== undefined) return runExplicitDatabaseAdapter(adapterPath, sql);
  if (environment !== "local") {
    throw new IngredientNutritionImportError("STAGING_DATABASE_ADAPTER_REQUIRED");
  }
  return runLocalPsqlJson(sql);
}

function resolveFoodsafetyPilotScope(environment, adapterPath) {
  return runDatabaseJson(environment, adapterPath, `
with pilot_recipes as (
  select source.recipe_id
  from public.recipe_sources source
  where source.extraction_meta_json ->> 'reviewed_scope' = 'pilot_30_user_reviewed'
    and source.extraction_meta_json ->> 'source_provider' = 'foodsafety-cookrcp'
), pilot_ingredients as (
  select distinct ingredient.ingredient_id
  from public.recipe_ingredients ingredient
  join pilot_recipes recipe on recipe.recipe_id = ingredient.recipe_id
), canonical_ingredients as (
  select canonical.id,
    jsonb_agg(name order by name) as normalized_names
  from public.ingredients canonical
  join pilot_ingredients pilot on pilot.ingredient_id = canonical.id
  cross join lateral (
    select canonical.standard_name as name
    union
    select synonym.synonym
    from public.ingredient_synonyms synonym
    where synonym.ingredient_id = canonical.id
  ) names
  group by canonical.id
)
select jsonb_build_object(
  'recipe_ids', (select jsonb_agg(recipe_id order by recipe_id) from pilot_recipes),
  'ingredient_ids', (select jsonb_agg(ingredient_id order by ingredient_id) from pilot_ingredients),
  'canonical_ingredients', (
    select jsonb_agg(jsonb_build_object(
      'id', id,
      'normalized_names', normalized_names
    ) order by id)
    from canonical_ingredients
  )
)::text;
`);
}

function readPinnedPilotContract() {
  const seed = readFileSync(PINNED_PILOT_SEED, "utf8");
  const ingredientMarker = seed.indexOf("create temp table tmp_foodsafety_pilot_ingredients");
  const recipeSection = seed.slice(0, ingredientMarker);
  const ingredientSection = seed.slice(ingredientMarker);
  const recipeIds = [...recipeSection.matchAll(/\('([0-9a-f-]{36})'::uuid,/gi)]
    .map((match) => match[1]);
  const ingredientNames = [...ingredientSection.matchAll(
    /\('[0-9a-f-]{36}'::uuid,\s*\d+::integer,\s*'((?:''|[^'])+)'::text/gi,
  )].map((match) => match[1].replaceAll("''", "'"));
  const uniqueRecipeIds = [...new Set(recipeIds)].sort();
  const uniqueIngredientNames = [...new Set(ingredientNames)].sort();
  if (uniqueRecipeIds.length !== 30 || uniqueIngredientNames.length === 0) {
    throw new IngredientNutritionImportError("PINNED_PILOT_CONTRACT_INVALID");
  }
  return { recipe_ids: uniqueRecipeIds, ingredient_names: uniqueIngredientNames };
}

function resolvePinnedPilotScope(environment, adapterPath) {
  const pinned = readPinnedPilotContract();
  const encoded = Buffer.from(JSON.stringify(pinned.ingredient_names), "utf8").toString("base64");
  const ingredientIds = runDatabaseJson(environment, adapterPath, `
with expected_names as (
  select value as standard_name
  from jsonb_array_elements_text(
    convert_from(decode('${encoded}', 'base64'), 'UTF8')::jsonb
  )
)
select coalesce(jsonb_agg(ingredient.id order by ingredient.id), '[]'::jsonb)::text
from public.ingredients ingredient
join expected_names expected on expected.standard_name = ingredient.standard_name;
`);
  return { recipe_ids: pinned.recipe_ids, ingredient_ids: ingredientIds };
}

function createDatabaseStore(environment, adapterPath) {
  const query = (sql) => runDatabaseJson(environment, adapterPath, sql);
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
  };
}

async function publishRun(summary) {
  const report = buildRunReport(summary);
  const outputDir = path.join(REGISTRY_ROOT, summary.run_id);
  await publishArtifactBundle(outputDir, {
    "summary.json": `${JSON.stringify(summary, null, 2)}\n`,
    "report.json": `${JSON.stringify(report, null, 2)}\n`,
  });
  return report;
}

async function loadRegisteredReport(runId, store) {
  if (!SAFE_RUN_ID.test(runId)) {
    throw new IngredientNutritionImportError("INVALID_RUN_REPORT");
  }
  const reportPath = path.join(REGISTRY_ROOT, runId, "report.json");
  if (!existsSync(reportPath)) {
    throw new IngredientNutritionImportError("INVALID_RUN_REPORT");
  }
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const validated = validateRunReport(report);
  if (store !== undefined) {
    const registry = await store.getRunRegistry(validated.idempotency_key);
    return validateRunReportAgainstRegistry(validated, registry);
  }
  return validated;
}

async function importCommand(args) {
  const bundle = await readJsonInput(args.bundle);
  const approval = args.approval_file === undefined
    ? null
    : await readJsonInput(args.approval_file);
  if (args.mode === "apply" && args.environment === "production") {
    throw new IngredientNutritionImportError("PRODUCTION_LOAD_APPROVAL_REQUIRED");
  }
  const actualPilotContext = resolveFoodsafetyPilotScope(
    args.environment,
    args.database_adapter,
  );
  const expectedPilotScope = resolvePinnedPilotScope(
    args.environment,
    args.database_adapter,
  );
  const store = createDatabaseStore(args.environment, args.database_adapter);
  const summary = await runModelImport({
    bundle,
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
  await publishRunWithRecovery(summary, publishRun);
  return summary;
}

async function reportCommand(args) {
  return loadRegisteredReport(
    args.run_id,
    createDatabaseStore(args.environment ?? "local", args.database_adapter),
  );
}

async function disableCommand(args) {
  const store = createDatabaseStore(args.environment, args.database_adapter);
  const report = await loadRegisteredReport(args.run_id, store);
  const decision = await readJsonInput(args.approval_file);
  const summary = await disableModelRun({
    report,
    store,
    environment: args.environment,
    decision,
  });
  summary.run_id = `disable-${summary.idempotency_key.slice(0, 24)}`;
  await publishRunWithRecovery(summary, publishRun);
  return summary;
}

async function main() {
  const command = process.argv[2];
  try {
    const args = parseModelCliArgs(command, process.argv.slice(3));
    const result = command === "import"
      ? await importCommand(args)
      : command === "report"
        ? await reportCommand(args)
        : await disableCommand(args);
    writeMachineJson(process.stdout, result);
  } catch (error) {
    const code = error instanceof IngredientNutritionImportError
      ? error.code
      : "INGREDIENT_NUTRITION_MODEL_FAILED";
    const summary = error instanceof IngredientNutritionImportError && error.summary
      ? { ...error.summary, status: "rejected", error: { code } }
      : zeroWriteError(code);
    writeMachineJson(process.stderr, summary);
    process.exitCode = 1;
  }
}

const invokedUrl = process.argv[1] === undefined
  ? null
  : pathToFileURL(path.resolve(process.argv[1])).href;
if (import.meta.url === invokedUrl) await main();

export { runExplicitDatabaseAdapter };
