#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { publishArtifactBundle } from "./lib/public-nutrition-artifacts.mjs";
import {
  IngredientNutritionImportError,
  assertPrSafeValue,
  buildRunReport,
  disableModelRun,
  parseModelCliArgs,
  runModelImport,
  validateRunReport,
} from "./lib/ingredient-nutrition-import.mjs";

const REGISTRY_ROOT = path.resolve(
  ".artifacts/ops/ingredient-nutrition-conversion-model",
);
const SAFE_RUN_ID = /^[a-z0-9][a-z0-9-]{7,79}$/;
const SAFE_INPUT_BASENAME = /^(?!\.env(?:\.|$))(?!.*(?:secret|servicekey|api[_-]?key)).+$/i;

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

function resolveFoodsafetyPilotScope(environment) {
  if (environment !== "local") {
    throw new IngredientNutritionImportError("STAGING_DATABASE_ADAPTER_REQUIRED");
  }
  return runLocalPsqlJson(`
with pilot_recipes as (
  select source.recipe_id
  from public.recipe_sources source
  where source.extraction_meta_json ->> 'reviewed_scope' = 'pilot_30_user_reviewed'
    and source.extraction_meta_json ->> 'source_provider' = 'foodsafety-cookrcp'
), pilot_ingredients as (
  select distinct ingredient.ingredient_id
  from public.recipe_ingredients ingredient
  join pilot_recipes recipe on recipe.recipe_id = ingredient.recipe_id
)
select jsonb_build_object(
  'recipe_ids', (select jsonb_agg(recipe_id order by recipe_id) from pilot_recipes),
  'ingredient_ids', (select jsonb_agg(ingredient_id order by ingredient_id) from pilot_ingredients)
)::text;
`);
}

function registrySummaryByIdempotency(idempotencyKey) {
  if (!existsSync(REGISTRY_ROOT)) return null;
  for (const entry of readdirSync(REGISTRY_ROOT)) {
    const summaryPath = path.join(REGISTRY_ROOT, entry, "summary.json");
    if (!existsSync(summaryPath)) continue;
    try {
      const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
      if (summary.idempotency_key === idempotencyKey) return summary;
    } catch {
      continue;
    }
  }
  return null;
}

function createLocalDatabaseStore(environment) {
  return {
    findRun: registrySummaryByIdempotency,
    async applyModelBundle(model) {
      if (environment !== "local") {
        throw new IngredientNutritionImportError("STAGING_DATABASE_ADAPTER_REQUIRED");
      }
      const encoded = Buffer.from(JSON.stringify(model), "utf8").toString("base64");
      return runLocalPsqlJson(
        `select public.apply_ingredient_nutrition_model(convert_from(decode('${encoded}', 'base64'), 'UTF8')::jsonb)::text;`,
      );
    },
    async disableAppliedModel({ report, decision }) {
      if (environment !== "local") {
        throw new IngredientNutritionImportError("STAGING_DATABASE_ADAPTER_REQUIRED");
      }
      const encoded = Buffer.from(JSON.stringify({ report, decision }), "utf8").toString("base64");
      return runLocalPsqlJson(`
with input as (
  select convert_from(decode('${encoded}', 'base64'), 'UTF8')::jsonb as value
)
select public.disable_ingredient_nutrition_model(
  (value -> 'report' ->> 'affected_source_id')::uuid,
  (value -> 'decision' ->> 'reviewed_by')::uuid,
  value -> 'decision' ->> 'reason',
  (value -> 'decision' ->> 'reviewed_at')::timestamptz,
  value -> 'report' -> 'affected_row_ids'
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

function loadRegisteredReport(runId) {
  if (!SAFE_RUN_ID.test(runId)) {
    throw new IngredientNutritionImportError("INVALID_RUN_REPORT");
  }
  const reportPath = path.join(REGISTRY_ROOT, runId, "report.json");
  if (!existsSync(reportPath)) {
    throw new IngredientNutritionImportError("INVALID_RUN_REPORT");
  }
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  return validateRunReport(report);
}

async function importCommand(args) {
  const bundle = await readJsonInput(args.bundle);
  const approval = args.approval_file === undefined
    ? null
    : await readJsonInput(args.approval_file);
  if (args.mode === "apply" && args.environment === "production") {
    throw new IngredientNutritionImportError("PRODUCTION_LOAD_APPROVAL_REQUIRED");
  }
  const expectedPilotScope = resolveFoodsafetyPilotScope(args.environment);
  const store = createLocalDatabaseStore(args.environment);
  const summary = await runModelImport({
    bundle,
    mode: args.mode,
    environment: args.environment,
    pilot_scope: args.pilot_scope,
    expected_pilot_scope: expectedPilotScope,
    approval,
    store,
  });
  await publishRun(summary);
  return summary;
}

async function reportCommand(args) {
  return loadRegisteredReport(args.run_id);
}

async function disableCommand(args) {
  const report = loadRegisteredReport(args.run_id);
  const decision = await readJsonInput(args.approval_file);
  const store = createLocalDatabaseStore(args.environment);
  const summary = await disableModelRun({
    report,
    store,
    environment: args.environment,
    decision,
  });
  summary.run_id = `disable-${summary.idempotency_key.slice(0, 24)}`;
  await publishRun(summary);
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

await main();
