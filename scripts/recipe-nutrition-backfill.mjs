#!/usr/bin/env node

import { chmodSync, readFileSync, writeFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import {
  RecipeNutritionBackfillError,
  createSupabaseRecipeNutritionBackfillRepository,
  rollbackFoodSafetyRecipeNutritionBackfill,
  runFoodSafetyRecipeNutritionBackfill,
} from "./lib/recipe-nutrition-backfill.mjs";

const HELP = `Usage:
  node scripts/recipe-nutrition-backfill.mjs recipe-dry-run [--batch-size 30] [--after <recipe-id>]
  node scripts/recipe-nutrition-backfill.mjs recipe-apply --checkpoint <path> --allow-write [--batch-size 30] [--after <recipe-id>]
  node scripts/recipe-nutrition-backfill.mjs recipe-rollback --checkpoint <path> --allow-write
  node scripts/recipe-nutrition-backfill.mjs meal-dry-run [--batch-size 250] [--after <meal-id>]
  node scripts/recipe-nutrition-backfill.mjs meal-apply --allow-write [--batch-size 250] [--after <meal-id>]

Write commands additionally require HOMECOOK_RECIPE_NUTRITION_WRITE_APPROVED=1.
`;

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = {
    command,
    after: null,
    batchSize: command?.startsWith("meal-") ? 250 : 30,
    checkpoint: null,
    allowWrite: false,
  };
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (value === "--allow-write") {
      options.allowWrite = true;
    } else if (value === "--after") {
      options.after = rest[index + 1] ?? null;
      index += 1;
    } else if (value === "--batch-size") {
      options.batchSize = Number(rest[index + 1]);
      index += 1;
    } else if (value === "--checkpoint") {
      options.checkpoint = rest[index + 1] ?? null;
      index += 1;
    } else {
      throw new RecipeNutritionBackfillError("INVALID_BACKFILL_ARGUMENTS");
    }
  }
  return options;
}

function requireWriteApproval(options) {
  if (!options.allowWrite || process.env.HOMECOOK_RECIPE_NUTRITION_WRITE_APPROVED !== "1") {
    throw new RecipeNutritionBackfillError("WRITE_APPROVAL_REQUIRED");
  }
}

function createOperatorClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new RecipeNutritionBackfillError("LOCAL_OPERATOR_ENV_REQUIRED");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function printReport(report) {
  const safeReport = { ...report };
  delete safeReport.checkpoints;
  process.stdout.write(`${JSON.stringify(safeReport)}\n`);
}

function writeCheckpoint(checkpointPath, checkpoints) {
  writeFileSync(checkpointPath, `${JSON.stringify({
    schema_version: "recipe-nutrition-backfill-checkpoint-v1",
    scope: "foodsafety-30",
    checkpoints,
  }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(checkpointPath, 0o600);
}

async function runRecipeCommand(options, client) {
  const repository = createSupabaseRecipeNutritionBackfillRepository(client);
  if (options.command === "recipe-rollback") {
    if (!options.checkpoint) {
      throw new RecipeNutritionBackfillError("BACKFILL_CHECKPOINT_REQUIRED");
    }
    const checkpoint = JSON.parse(readFileSync(options.checkpoint, "utf8"));
    const result = await rollbackFoodSafetyRecipeNutritionBackfill({
      repository,
      checkpoints: checkpoint.checkpoints,
    });
    printReport(result);
    return;
  }

  const mode = options.command === "recipe-apply" ? "apply" : "dry-run";
  const result = await runFoodSafetyRecipeNutritionBackfill({
    repository,
    mode,
    batchSize: options.batchSize,
    afterRecipeId: options.after,
    onCheckpoint: mode === "apply"
      ? async (checkpoints) => writeCheckpoint(options.checkpoint, checkpoints)
      : undefined,
  });
  if (mode === "apply") {
    writeCheckpoint(options.checkpoint, result.checkpoints);
  }
  printReport(result);
}

async function runMealCommand(options, client) {
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 1000) {
    throw new RecipeNutritionBackfillError("INVALID_BACKFILL_BATCH_SIZE");
  }
  const result = await client.rpc("backfill_foodsafety_recipe_nutrition_meal_pins", {
    p_dry_run: options.command === "meal-dry-run",
    p_after_meal_id: options.after,
    p_batch_size: options.batchSize,
  });
  if (result.error || !result.data) {
    throw new RecipeNutritionBackfillError("MEAL_PIN_BACKFILL_FAILED");
  }
  printReport(result.data);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.length <= 2) {
    process.stdout.write(HELP);
    return;
  }
  const options = parseArguments(process.argv.slice(2));
  const commands = new Set([
    "recipe-dry-run",
    "recipe-apply",
    "recipe-rollback",
    "meal-dry-run",
    "meal-apply",
  ]);
  if (!commands.has(options.command)) {
    throw new RecipeNutritionBackfillError("INVALID_BACKFILL_MODE");
  }
  if (options.command.endsWith("-apply") || options.command === "recipe-rollback") {
    requireWriteApproval(options);
  }
  if ((options.command === "recipe-apply" || options.command === "recipe-rollback") &&
    !options.checkpoint) {
    throw new RecipeNutritionBackfillError("BACKFILL_CHECKPOINT_REQUIRED");
  }
  if (options.command === "recipe-apply") {
    writeCheckpoint(options.checkpoint, []);
  }
  const client = createOperatorClient();
  if (options.command.startsWith("recipe-")) {
    await runRecipeCommand(options, client);
  } else {
    await runMealCommand(options, client);
  }
}

main().catch((error) => {
  const code = error instanceof RecipeNutritionBackfillError
    ? error.code
    : "RECIPE_NUTRITION_BACKFILL_FAILED";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});
